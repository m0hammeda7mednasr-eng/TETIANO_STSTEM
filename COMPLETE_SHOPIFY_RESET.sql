-- ====================================
-- إعادة تعيين Shopify كاملة
-- Complete Shopify Reset
-- ====================================

-- هذا الملف هيمسح كل حاجة ويبدأ من جديد

-- 1. مسح جميع بيانات Shopify القديمة
DELETE FROM products WHERE shopify_id IS NOT NULL;
DELETE FROM orders WHERE shopify_id IS NOT NULL;
DELETE FROM customers WHERE shopify_id IS NOT NULL;
DELETE FROM shopify_tokens;

-- 2. إنشاء المستخدم الأساسي
INSERT INTO users (id, email, password, role, created_at, updated_at)
VALUES (
    'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid,
    'midoooahmed28@gmail.com',
    '$2a$10$dummy.hash.for.admin.user.placeholder.only',
    'admin',
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    role = 'admin',
    updated_at = NOW();

-- 3. إنشاء المتجر الأساسي
INSERT INTO stores (id, name, created_at, updated_at)
VALUES (
    '59b47070-f018-4919-b628-1009af216fd7'::uuid,
    'Main Store',
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    updated_at = NOW();

-- 4. ربط المستخدم بالمتجر
INSERT INTO user_stores (user_id, store_id)
VALUES (
    'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid,
    '59b47070-f018-4919-b628-1009af216fd7'::uuid
) ON CONFLICT (user_id, store_id) DO NOTHING;

-- 5. إضافة الصلاحيات الكاملة
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

-- 6. تعطيل RLS نهائياً
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_tokens DISABLE ROW LEVEL SECURITY;

-- 7. إضافة cost_price column
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2) DEFAULT 0;

-- 8. فحص النتائج
SELECT 'فحص النتائج بعد الإعادة تعيين' as status;

SELECT 
    'إحصائيات البيانات' as check_type,
    (SELECT COUNT(*) FROM products) as total_products,
    (SELECT COUNT(*) FROM orders) as total_orders,
    (SELECT COUNT(*) FROM customers) as total_customers,
    (SELECT COUNT(*) FROM shopify_tokens) as shopify_connections,
    (SELECT COUNT(*) FROM users WHERE email = 'midoooahmed28@gmail.com') as main_user_exists,
    (SELECT COUNT(*) FROM user_stores) as user_store_links;

SELECT 'تم إعادة تعيين Shopify بنجاح! ✅' as final_message;
SELECT 'الآن اذهب إلى Settings وأعد ربط Shopify من جديد' as next_step;