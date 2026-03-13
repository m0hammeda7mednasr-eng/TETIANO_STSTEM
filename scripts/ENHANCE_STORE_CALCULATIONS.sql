-- ====================================
-- تحسين حسابات وتفاصيل المتجر
-- Enhance Store Calculations and Details
-- ====================================

-- 1. إضافة الأعمدة المطلوبة للحسابات الدقيقة
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS profit_margin DECIMAL(5, 2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS inventory_value DECIMAL(10, 2) DEFAULT 0;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS financial_status VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_status VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_refunded DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS net_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS profit_amount DECIMAL(10, 2) DEFAULT 0;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_orders INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS avg_order_value DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_order_date TIMESTAMP;

-- 2. تحديث البيانات المالية للمنتجات
UPDATE products 
SET 
    cost_price = CASE 
        WHEN cost_price = 0 OR cost_price IS NULL THEN
            CASE 
                WHEN price > 0 THEN (price * 0.6) -- 60% من سعر البيع كتكلفة
                ELSE 0
            END
        ELSE cost_price
    END,
    profit_margin = CASE 
        WHEN price > 0 THEN 
            ROUND(((price - COALESCE(cost_price, price * 0.6)) / price * 100), 2)
        ELSE 0
    END,
    inventory_value = CASE 
        WHEN inventory_quantity > 0 AND price > 0 THEN 
            (inventory_quantity * price)
        ELSE 0
    END
WHERE shopify_id IS NOT NULL;

-- 3. تحديث البيانات المالية للطلبات
UPDATE orders 
SET 
    financial_status = COALESCE(financial_status, status, 'pending'),
    fulfillment_status = COALESCE(fulfillment_status, 'unfulfilled'),
    total_refunded = CASE 
        WHEN status = 'refunded' THEN COALESCE(total_refunded, total_price, 0)
        WHEN status = 'partially_refunded' THEN COALESCE(total_refunded, total_price * 0.3, 0)
        ELSE COALESCE(total_refunded, 0)
    END,
    net_amount = CASE 
        WHEN status IN ('paid', 'completed') THEN 
            (total_price - COALESCE(total_refunded, 0))
        ELSE 0
    END
WHERE shopify_id IS NOT NULL;

-- حساب الأرباح للطلبات بناءً على المنتجات
UPDATE orders 
SET profit_amount = (
    SELECT COALESCE(SUM(
        CASE 
            WHEN o.data IS NOT NULL AND jsonb_typeof(o.data->'line_items') = 'array' THEN
                (SELECT SUM(
                    (item->>'quantity')::INTEGER * 
                    COALESCE(p.price - p.cost_price, (item->>'price')::DECIMAL * 0.4)
                ) 
                FROM jsonb_array_elements(o.data->'line_items') AS item
                LEFT JOIN products p ON p.shopify_id = (item->>'product_id')
                )
            ELSE (o.total_price * 0.4) -- هامش ربح افتراضي 40%
        END
    ), 0)
    FROM orders o2 WHERE o2.id = orders.id
)
WHERE shopify_id IS NOT NULL AND financial_status IN ('paid', 'completed');

-- 4. تحديث إحصائيات العملاء
UPDATE customers 
SET 
    total_orders = (
        SELECT COUNT(*) 
        FROM orders o 
        WHERE o.customer_email = customers.email 
           OR o.customer_name = customers.name
    ),
    avg_order_value = (
        SELECT COALESCE(AVG(o.total_price), 0)
        FROM orders o 
        WHERE o.customer_email = customers.email 
           OR o.customer_name = customers.name
    ),
    last_order_date = (
        SELECT MAX(o.created_at)
        FROM orders o 
        WHERE o.customer_email = customers.email 
           OR o.customer_name = customers.name
    )
WHERE shopify_id IS NOT NULL;

-- 5. إنشاء جدول التكاليف التشغيلية إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS operational_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    store_id UUID REFERENCES stores(id),
    product_id UUID REFERENCES products(id),
    cost_name VARCHAR(255) NOT NULL,
    cost_type VARCHAR(50) NOT NULL, -- 'shipping', 'ads', 'packaging', 'other'
    amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    apply_to VARCHAR(50) DEFAULT 'per_unit', -- 'per_unit', 'per_order', 'fixed'
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- إضافة تكاليف تشغيلية نموذجية
INSERT INTO operational_costs (user_id, store_id, cost_name, cost_type, amount, apply_to, description)
SELECT 
    (SELECT id FROM users ORDER BY created_at LIMIT 1),
    (SELECT id FROM stores ORDER BY created_at LIMIT 1),
    'تكلفة الشحن',
    'shipping',
    15.00,
    'per_order',
    'تكلفة الشحن لكل طلب'
WHERE NOT EXISTS (SELECT 1 FROM operational_costs WHERE cost_type = 'shipping');

INSERT INTO operational_costs (user_id, store_id, cost_name, cost_type, amount, apply_to, description)
SELECT 
    (SELECT id FROM users ORDER BY created_at LIMIT 1),
    (SELECT id FROM stores ORDER BY created_at LIMIT 1),
    'تكلفة الإعلانات',
    'ads',
    5.00,
    'per_unit',
    'تكلفة الإعلانات لكل وحدة مباعة'
WHERE NOT EXISTS (SELECT 1 FROM operational_costs WHERE cost_type = 'ads');

-- 6. إنشاء view شامل للتحليلات المالية
CREATE OR REPLACE VIEW store_financial_summary AS
WITH product_metrics AS (
    SELECT 
        COUNT(*) as total_products,
        SUM(inventory_quantity) as total_inventory,
        SUM(inventory_value) as total_inventory_value,
        AVG(price) as avg_product_price,
        AVG(cost_price) as avg_cost_price,
        AVG(profit_margin) as avg_profit_margin
    FROM products WHERE shopify_id IS NOT NULL
),
order_metrics AS (
    SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN financial_status = 'paid' THEN 1 END) as paid_orders,
        COUNT(CASE WHEN financial_status = 'pending' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN financial_status = 'refunded' THEN 1 END) as refunded_orders,
        COUNT(CASE WHEN fulfillment_status = 'fulfilled' THEN 1 END) as fulfilled_orders,
        SUM(total_price) as gross_revenue,
        SUM(net_amount) as net_revenue,
        SUM(total_refunded) as total_refunds,
        SUM(profit_amount) as total_profit,
        AVG(total_price) as avg_order_value
    FROM orders WHERE shopify_id IS NOT NULL
),
customer_metrics AS (
    SELECT 
        COUNT(*) as total_customers,
        AVG(total_orders) as avg_orders_per_customer,
        AVG(avg_order_value) as avg_customer_value
    FROM customers WHERE shopify_id IS NOT NULL
),
cost_metrics AS (
    SELECT 
        COALESCE(SUM(amount), 0) as total_operational_costs
    FROM operational_costs WHERE is_active = true
)
SELECT 
    pm.*,
    om.*,
    cm.*,
    cost_m.total_operational_costs,
    (om.total_profit - cost_m.total_operational_costs) as net_profit_after_costs,
    CASE 
        WHEN om.gross_revenue > 0 THEN 
            ROUND(((om.total_profit - cost_m.total_operational_costs) / om.gross_revenue * 100), 2)
        ELSE 0 
    END as net_profit_margin
FROM product_metrics pm, order_metrics om, customer_metrics cm, cost_metrics cost_m;

-- 7. إنشاء view لأفضل المنتجات
CREATE OR REPLACE VIEW top_products_analysis AS
WITH product_sales AS (
    SELECT 
        p.id,
        p.shopify_id,
        p.title,
        p.price,
        p.cost_price,
        p.profit_margin,
        p.inventory_quantity,
        COUNT(DISTINCT o.id) as orders_count,
        COALESCE(SUM(
            CASE 
                WHEN o.data IS NOT NULL AND jsonb_typeof(o.data->'line_items') = 'array' THEN
                    (SELECT SUM((item->>'quantity')::INTEGER) 
                     FROM jsonb_array_elements(o.data->'line_items') AS item
                     WHERE item->>'product_id' = p.shopify_id)
                ELSE 0
            END
        ), 0) as total_sold,
        COALESCE(SUM(
            CASE 
                WHEN o.financial_status = 'paid' AND o.data IS NOT NULL AND jsonb_typeof(o.data->'line_items') = 'array' THEN
                    (SELECT SUM((item->>'quantity')::INTEGER * (item->>'price')::DECIMAL) 
                     FROM jsonb_array_elements(o.data->'line_items') AS item
                     WHERE item->>'product_id' = p.shopify_id)
                ELSE 0
            END
        ), 0) as total_revenue
    FROM products p
    LEFT JOIN orders o ON o.shopify_id IS NOT NULL AND o.financial_status = 'paid'
    WHERE p.shopify_id IS NOT NULL
    GROUP BY p.id, p.shopify_id, p.title, p.price, p.cost_price, p.profit_margin, p.inventory_quantity
)
SELECT 
    *,
    (total_sold * cost_price) as total_cost,
    (total_revenue - (total_sold * cost_price)) as gross_profit,
    CASE 
        WHEN total_revenue > 0 THEN 
            ROUND(((total_revenue - (total_sold * cost_price)) / total_revenue * 100), 2)
        ELSE 0 
    END as actual_profit_margin
FROM product_sales
ORDER BY total_revenue DESC;

-- 8. إنشاء view لأفضل العملاء
CREATE OR REPLACE VIEW top_customers_analysis AS
SELECT 
    c.*,
    c.total_orders,
    c.avg_order_value,
    (c.total_orders * c.avg_order_value) as estimated_lifetime_value,
    CASE 
        WHEN c.last_order_date IS NOT NULL THEN 
            EXTRACT(DAYS FROM (NOW() - c.last_order_date))
        ELSE NULL 
    END as days_since_last_order,
    CASE 
        WHEN c.total_orders > 5 THEN 'VIP'
        WHEN c.total_orders > 2 THEN 'Regular'
        ELSE 'New'
    END as customer_tier
FROM customers c
WHERE c.shopify_id IS NOT NULL
ORDER BY estimated_lifetime_value DESC;

-- 9. عرض النتائج المحدثة
SELECT 'الملخص المالي الشامل:' as info;
SELECT * FROM store_financial_summary;

SELECT 'أفضل 5 منتجات:' as info;
SELECT title, total_sold, total_revenue, gross_profit, actual_profit_margin 
FROM top_products_analysis 
LIMIT 5;

SELECT 'أفضل 5 عملاء:' as info;
SELECT name, email, total_orders, avg_order_value, estimated_lifetime_value, customer_tier
FROM top_customers_analysis 
LIMIT 5;

-- 10. إحصائيات سريعة
SELECT 'إحصائيات سريعة:' as info;
SELECT 
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) as منتجات_من_شوبيفاي,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL) as طلبات_من_شوبيفاي,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL) as عملاء_من_شوبيفاي,
    (SELECT SUM(total_price) FROM orders WHERE financial_status = 'paid') as إجمالي_المبيعات,
    (SELECT SUM(profit_amount) FROM orders WHERE financial_status = 'paid') as إجمالي_الأرباح;

SELECT 'تم تحسين حسابات وتفاصيل المتجر بنجاح!' as النتيجة;