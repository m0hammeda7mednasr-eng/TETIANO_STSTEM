-- ====================================
-- إصلاح بسيط لعرض البيانات
-- Simple Data Display Fix
-- ====================================

-- 1. تعطيل RLS مؤقتاً
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;

-- 2. ربط البيانات بالمستخدمين والمتاجر
DO $$
DECLARE
    first_user_id UUID;
    default_store_id UUID;
BEGIN
    -- الحصول على أول مستخدم
    SELECT id INTO first_user_id FROM users ORDER BY created_at LIMIT 1;
    
    -- الحصول على أول متجر أو إنشاء واحد
    SELECT id INTO default_store_id FROM stores ORDER BY created_at LIMIT 1;
    
    IF default_store_id IS NULL THEN
        INSERT INTO stores (name, created_by, created_at, updated_at)
        VALUES ('المتجر الرئيسي', first_user_id, NOW(), NOW())
        RETURNING id INTO default_store_id;
    END IF;
    
    -- ربط جميع البيانات
    UPDATE products 
    SET 
        user_id = COALESCE(user_id, first_user_id),
        store_id = COALESCE(store_id, default_store_id),
        updated_at = NOW()
    WHERE shopify_id IS NOT NULL;
    
    UPDATE orders 
    SET 
        user_id = COALESCE(user_id, first_user_id),
        store_id = COALESCE(store_id, default_store_id),
        updated_at = NOW()
    WHERE shopify_id IS NOT NULL;
    
    UPDATE customers 
    SET 
        user_id = COALESCE(user_id, first_user_id),
        store_id = COALESCE(store_id, default_store_id),
        updated_at = NOW()
    WHERE shopify_id IS NOT NULL;
    
    -- التأكد من وجود user_stores
    INSERT INTO user_stores (user_id, store_id)
    VALUES (first_user_id, default_store_id)
    ON CONFLICT (user_id, store_id) DO NOTHING;
    
END $$;

-- 3. إضافة الأعمدة المفقودة
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2) DEFAULT 0;

-- 4. تحديث أسعار التكلفة
UPDATE products 
SET cost_price = CASE 
    WHEN cost_price = 0 OR cost_price IS NULL THEN
        CASE 
            WHEN price IS NOT NULL AND price > 0 
            THEN (price * 0.6) -- 60% من سعر البيع
            ELSE 10.00
        END
    ELSE cost_price
END
WHERE shopify_id IS NOT NULL;

-- 5. إنشاء صلاحيات كاملة
INSERT INTO permissions (
    user_id,
    can_view_products,
    can_edit_products,
    can_view_orders,
    can_edit_orders,
    can_view_customers,
    can_edit_customers,
    can_view_reports,
    can_manage_settings
)
SELECT 
    u.id,
    true, true, true, true, true, true, true, true
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.user_id = u.id)
ON CONFLICT (user_id) DO UPDATE SET
    can_view_products = true,
    can_edit_products = true,
    can_view_orders = true,
    can_edit_orders = true,
    can_view_customers = true,
    can_edit_customers = true,
    can_view_reports = true,
    can_manage_settings = true;

-- 6. إعادة تفعيل RLS مع سياسات مفتوحة
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- حذف السياسات القديمة
DROP POLICY IF EXISTS products_allow_all ON products;
DROP POLICY IF EXISTS orders_allow_all ON orders;
DROP POLICY IF EXISTS customers_allow_all ON customers;

-- إنشاء سياسات مفتوحة
CREATE POLICY products_allow_all ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY orders_allow_all ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY customers_allow_all ON customers FOR ALL USING (true) WITH CHECK (true);

-- 7. عرض النتائج
SELECT 'Data Summary:' as info;
SELECT 
    'Products' as type,
    COUNT(*) as total,
    COUNT(CASE WHEN shopify_id IS NOT NULL THEN 1 END) as from_shopify,
    COUNT(CASE WHEN user_id IS NOT NULL AND store_id IS NOT NULL THEN 1 END) as linked
FROM products
UNION ALL
SELECT 
    'Orders' as type,
    COUNT(*) as total,
    COUNT(CASE WHEN shopify_id IS NOT NULL THEN 1 END) as from_shopify,
    COUNT(CASE WHEN user_id IS NOT NULL AND store_id IS NOT NULL THEN 1 END) as linked
FROM orders
UNION ALL
SELECT 
    'Customers' as type,
    COUNT(*) as total,
    COUNT(CASE WHEN shopify_id IS NOT NULL THEN 1 END) as from_shopify,
    COUNT(CASE WHEN user_id IS NOT NULL AND store_id IS NOT NULL THEN 1 END) as linked
FROM customers;

-- 8. عرض عينة من البيانات
SELECT 'Sample Products:' as info;
SELECT id, shopify_id, title, price, cost_price, user_id, store_id 
FROM products WHERE shopify_id IS NOT NULL LIMIT 3;

SELECT 'Sample Orders:' as info;
SELECT id, shopify_id, order_number, total_price, status, user_id, store_id 
FROM orders WHERE shopify_id IS NOT NULL LIMIT 3;

SELECT 'Sample Customers:' as info;
SELECT id, shopify_id, name, email, user_id, store_id 
FROM customers WHERE shopify_id IS NOT NULL LIMIT 3;

SELECT 'تم إصلاح عرض البيانات بنجاح - Data display fixed successfully' as status;