-- ====================================
-- إعداد قاعدة البيانات الكاملة للنظام
-- Complete Database Setup for Full Data Display
-- ====================================

-- 1. إضافة الأعمدة المفقودة للمنتجات
-- Add missing columns to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

-- 2. إضافة الأعمدة المفقودة للطلبات
-- Add missing columns to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS total_refunded DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS current_total_price DECIMAL(10, 2) DEFAULT 0;

-- 3. إضافة الأعمدة المفقودة للعملاء
-- Add missing columns to customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

-- 4. إضافة أعمدة إضافية لجدول المتاجر
-- Add additional columns to stores table
ALTER TABLE stores 
ADD COLUMN IF NOT EXISTS shopify_domain VARCHAR(255),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

-- 5. تحديث جدول shopify_tokens لربطه بالمتاجر
-- Update shopify_tokens table to link with stores
ALTER TABLE shopify_tokens 
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

-- 6. إنشاء فهارس للأداء
-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_cost_price ON products(cost_price);
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_financial_status ON orders(financial_status);
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON customers(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_tokens_store_id ON shopify_tokens(store_id);

-- 7. إنشاء دالة لحساب الأرباح
-- Create function to calculate profits
CREATE OR REPLACE FUNCTION calculate_product_metrics()
RETURNS TABLE (
  product_id UUID,
  total_sold INTEGER,
  total_revenue DECIMAL(10, 2),
  total_cost DECIMAL(10, 2),
  gross_profit DECIMAL(10, 2),
  profit_margin DECIMAL(5, 2)
) AS $$
BEGIN
  RETURN QUERY
  WITH order_items AS (
    SELECT 
      p.id as product_id,
      COALESCE(SUM(
        CASE 
          WHEN jsonb_typeof(o.data->'line_items') = 'array' THEN
            (SELECT SUM((item->>'quantity')::INTEGER) 
             FROM jsonb_array_elements(o.data->'line_items') AS item
             WHERE item->>'product_id' = p.shopify_id::TEXT)
          ELSE 0
        END
      ), 0)::INTEGER as sold_quantity,
      COALESCE(SUM(
        CASE 
          WHEN jsonb_typeof(o.data->'line_items') = 'array' THEN
            (SELECT SUM((item->>'quantity')::INTEGER * (item->>'price')::DECIMAL) 
             FROM jsonb_array_elements(o.data->'line_items') AS item
             WHERE item->>'product_id' = p.shopify_id::TEXT)
          ELSE 0
        END
      ), 0) as revenue
    FROM products p
    LEFT JOIN orders o ON o.financial_status IN ('paid', 'partially_paid')
    WHERE p.shopify_id IS NOT NULL
    GROUP BY p.id
  )
  SELECT 
    oi.product_id,
    oi.sold_quantity,
    oi.revenue,
    (oi.sold_quantity * COALESCE(p.cost_price, 0)) as cost,
    (oi.revenue - (oi.sold_quantity * COALESCE(p.cost_price, 0))) as profit,
    CASE 
      WHEN oi.revenue > 0 THEN
        ((oi.revenue - (oi.sold_quantity * COALESCE(p.cost_price, 0))) / oi.revenue * 100)
      ELSE 0
    END as margin
  FROM order_items oi
  JOIN products p ON p.id = oi.product_id;
END;
$$ LANGUAGE plpgsql;

-- 8. إنشاء view للتحليلات السريعة
-- Create view for quick analytics
CREATE OR REPLACE VIEW analytics_summary AS
SELECT 
  COUNT(DISTINCT o.id) as total_orders,
  COUNT(DISTINCT CASE WHEN o.financial_status = 'paid' THEN o.id END) as paid_orders,
  COUNT(DISTINCT CASE WHEN o.financial_status = 'cancelled' THEN o.id END) as cancelled_orders,
  COUNT(DISTINCT CASE WHEN o.financial_status = 'refunded' THEN o.id END) as refunded_orders,
  COUNT(DISTINCT p.id) as total_products,
  COUNT(DISTINCT c.id) as total_customers,
  COALESCE(SUM(CASE WHEN o.financial_status = 'paid' THEN o.total_price::DECIMAL ELSE 0 END), 0) as total_revenue,
  COALESCE(SUM(CASE WHEN o.financial_status = 'refunded' THEN o.total_price::DECIMAL ELSE 0 END), 0) as total_refunded,
  COALESCE(AVG(CASE WHEN o.financial_status = 'paid' THEN o.total_price::DECIMAL END), 0) as avg_order_value
FROM orders o
FULL OUTER JOIN products p ON true
FULL OUTER JOIN customers c ON true;

-- 9. تحديث البيانات الموجودة لربطها بالمتاجر
-- Update existing data to link with stores
DO $$
DECLARE
  default_store_id UUID;
  token_record RECORD;
BEGIN
  -- إنشاء متجر افتراضي إذا لم يكن موجوداً
  -- Create default store if it doesn't exist
  SELECT id INTO default_store_id FROM stores LIMIT 1;
  
  IF default_store_id IS NULL THEN
    INSERT INTO stores (name, shopify_domain, is_active)
    VALUES ('المتجر الرئيسي', 'main-store', true)
    RETURNING id INTO default_store_id;
  END IF;
  
  -- ربط shopify_tokens بالمتجر الافتراضي
  -- Link shopify_tokens to default store
  UPDATE shopify_tokens 
  SET store_id = default_store_id 
  WHERE store_id IS NULL;
  
  -- ربط المنتجات والطلبات والعملاء بالمتجر الافتراضي
  -- Link products, orders, customers to default store
  UPDATE products SET store_id = default_store_id WHERE store_id IS NULL;
  UPDATE orders SET store_id = default_store_id WHERE store_id IS NULL;
  UPDATE customers SET store_id = default_store_id WHERE store_id IS NULL;
  
  -- إنشاء user_stores للمستخدمين الموجودين
  -- Create user_stores for existing users
  INSERT INTO user_stores (user_id, store_id)
  SELECT DISTINCT u.id, default_store_id
  FROM users u
  WHERE NOT EXISTS (
    SELECT 1 FROM user_stores us 
    WHERE us.user_id = u.id AND us.store_id = default_store_id
  );
  
END $$;

-- 10. تحديث أسعار التكلفة للمنتجات (قيم تجريبية)
-- Update cost prices for products (sample values)
UPDATE products 
SET cost_price = CASE 
  WHEN price::DECIMAL > 0 THEN (price::DECIMAL * 0.6) -- 60% of selling price as cost
  ELSE 0
END
WHERE cost_price = 0 AND price IS NOT NULL;

-- 11. تحديث البيانات المالية للطلبات
-- Update financial data for orders
UPDATE orders 
SET 
  current_total_price = COALESCE(current_total_price, total_price::DECIMAL),
  total_refunded = CASE 
    WHEN financial_status = 'refunded' THEN total_price::DECIMAL
    WHEN financial_status = 'partially_refunded' THEN (total_price::DECIMAL * 0.3)
    ELSE 0
  END
WHERE current_total_price IS NULL OR total_refunded = 0;

-- 12. إنشاء بيانات تجريبية للتكاليف التشغيلية
-- Create sample operational costs data
INSERT INTO operational_costs (user_id, product_id, cost_name, cost_type, amount, apply_to, description, is_active)
SELECT 
  p.user_id,
  p.id,
  'تكلفة الإعلانات',
  'ads',
  (p.price::DECIMAL * 0.1), -- 10% of price for ads
  'per_unit',
  'تكلفة الإعلانات لكل وحدة مباعة',
  true
FROM products p
WHERE p.user_id IS NOT NULL 
  AND NOT EXISTS (
    SELECT 1 FROM operational_costs oc 
    WHERE oc.product_id = p.id AND oc.cost_type = 'ads'
  )
LIMIT 50; -- Limit to avoid too many records

-- 13. التحقق من اكتمال البيانات
-- Verify data completeness
SELECT 
  'Data Verification Results' as info,
  (SELECT COUNT(*) FROM products WHERE cost_price > 0) as products_with_cost_price,
  (SELECT COUNT(*) FROM products WHERE store_id IS NOT NULL) as products_with_store,
  (SELECT COUNT(*) FROM orders WHERE store_id IS NOT NULL) as orders_with_store,
  (SELECT COUNT(*) FROM customers WHERE store_id IS NOT NULL) as customers_with_store,
  (SELECT COUNT(*) FROM operational_costs WHERE is_active = true) as active_operational_costs,
  (SELECT COUNT(*) FROM user_stores) as user_store_connections;

-- 14. إنشاء دالة للحصول على إحصائيات شاملة
-- Create function for comprehensive statistics
CREATE OR REPLACE FUNCTION get_complete_analytics(store_id_param UUID DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  WITH analytics_data AS (
    SELECT 
      COUNT(DISTINCT o.id) as total_orders,
      COUNT(DISTINCT CASE WHEN o.financial_status IN ('paid', 'partially_paid') THEN o.id END) as paid_orders,
      COUNT(DISTINCT CASE WHEN o.financial_status = 'cancelled' THEN o.id END) as cancelled_orders,
      COUNT(DISTINCT CASE WHEN o.financial_status IN ('refunded', 'partially_refunded') THEN o.id END) as refunded_orders,
      COUNT(DISTINCT CASE WHEN o.fulfillment_status = 'fulfilled' THEN o.id END) as fulfilled_orders,
      COUNT(DISTINCT p.id) as total_products,
      COUNT(DISTINCT c.id) as total_customers,
      COALESCE(SUM(CASE WHEN o.financial_status IN ('paid', 'partially_paid') THEN o.total_price::DECIMAL ELSE 0 END), 0) as total_revenue,
      COALESCE(SUM(o.total_refunded), 0) as total_refunded,
      COALESCE(SUM(CASE WHEN o.financial_status = 'pending' THEN o.total_price::DECIMAL ELSE 0 END), 0) as pending_amount,
      COALESCE(AVG(CASE WHEN o.financial_status IN ('paid', 'partially_paid') THEN o.total_price::DECIMAL END), 0) as avg_order_value
    FROM orders o
    FULL OUTER JOIN products p ON (store_id_param IS NULL OR p.store_id = store_id_param)
    FULL OUTER JOIN customers c ON (store_id_param IS NULL OR c.store_id = store_id_param)
    WHERE (store_id_param IS NULL OR o.store_id = store_id_param)
  )
  SELECT json_build_object(
    'summary', json_build_object(
      'totalOrders', total_orders,
      'paidOrders', paid_orders,
      'cancelledOrders', cancelled_orders,
      'refundedOrders', refunded_orders,
      'fulfilledOrders', fulfilled_orders,
      'totalProducts', total_products,
      'totalCustomers', total_customers,
      'successRate', CASE WHEN total_orders > 0 THEN (paid_orders::DECIMAL / total_orders * 100) ELSE 0 END,
      'cancellationRate', CASE WHEN total_orders > 0 THEN (cancelled_orders::DECIMAL / total_orders * 100) ELSE 0 END,
      'refundRate', CASE WHEN total_orders > 0 THEN (refunded_orders::DECIMAL / total_orders * 100) ELSE 0 END
    ),
    'financial', json_build_object(
      'totalRevenue', total_revenue,
      'totalRefunded', total_refunded,
      'pendingAmount', pending_amount,
      'netRevenue', (total_revenue - total_refunded),
      'avgOrderValue', avg_order_value
    )
  ) INTO result
  FROM analytics_data;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 15. رسالة النجاح
-- Success message
SELECT 'تم إعداد قاعدة البيانات بنجاح - Database setup completed successfully' as status;