-- ====================================
-- إصلاح سريع لمشكلة Shopify Sync
-- Quick Shopify Sync Fix
-- ====================================

-- 1. التأكد من وجود المستخدم والمتجر
INSERT INTO users (id, email, role, created_at, updated_at)
VALUES (
    'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid,
    'midoooahmed28@gmail.com',
    'admin',
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    role = 'admin',
    updated_at = NOW();

INSERT INTO stores (id, name, created_at, updated_at)
VALUES (
    '59b47070-f018-4919-b628-1009af216fd7'::uuid,
    'Main Store',
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    updated_at = NOW();

-- 2. ربط المستخدم بالمتجر
INSERT INTO user_stores (user_id, store_id)
VALUES (
    'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid,
    '59b47070-f018-4919-b628-1009af216fd7'::uuid
) ON CONFLICT (user_id, store_id) DO NOTHING;

-- 3. إضافة الصلاحيات
INSERT INTO permissions (
    user_id,
    can_view_products,
    can_edit_products,
    can_view_orders,
    can_edit_orders,
    can_view_customers,
    can_edit_customers,
    can_manage_settings
)
VALUES (
    'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid,
    true, true, true, true, true, true, true
) ON CONFLICT (user_id) DO UPDATE SET
    can_view_products = true,
    can_edit_products = true,
    can_view_orders = true,
    can_edit_orders = true,
    can_view_customers = true,
    can_edit_customers = true,
    can_manage_settings = true;

-- 4. ربط جميع بيانات Shopify بالمستخدم والمتجر
UPDATE products 
SET 
    user_id = 'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid,
    store_id = '59b47070-f018-4919-b628-1009af216fd7'::uuid,
    updated_at = NOW()
WHERE shopify_id IS NOT NULL;

UPDATE orders 
SET 
    user_id = 'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid,
    store_id = '59b47070-f018-4919-b628-1009af216fd7'::uuid,
    updated_at = NOW()
WHERE shopify_id IS NOT NULL;

UPDATE customers 
SET 
    user_id = 'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid,
    store_id = '59b47070-f018-4919-b628-1009af216fd7'::uuid,
    updated_at = NOW()
WHERE shopify_id IS NOT NULL;

-- 5. تحديث shopify_tokens
UPDATE shopify_tokens 
SET 
    user_id = 'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid,
    store_id = '59b47070-f018-4919-b628-1009af216fd7'::uuid,
    updated_at = NOW();

-- 6. إضافة cost_price للمنتجات
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2) DEFAULT 0;

UPDATE products 
SET cost_price = CASE 
    WHEN price > 0 THEN (price * 0.6)
    ELSE 0 
END
WHERE shopify_id IS NOT NULL AND (cost_price = 0 OR cost_price IS NULL);

-- 7. فحص النتائج
SELECT 'فحص النتائج النهائية' as status;

SELECT 
    'البيانات المربوطة بالمستخدم' as result_type,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND user_id = 'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid) as products_linked,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND user_id = 'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid) as orders_linked,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND user_id = 'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid) as customers_linked;

SELECT 'تم إصلاح ربط البيانات بنجاح! ✅' as final_message;