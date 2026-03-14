-- ====================================
-- إعادة تعيين جميع البيانات من الصفر
-- Reset All Data Clean
-- ====================================

-- هذا الملف هيحذف كل البيانات القديمة ويعيد إنشاءها نظيفة

-- 1. حذف جميع البيانات القديمة
SELECT 'بدء حذف البيانات القديمة...' as status;

-- حذف البيانات من الجداول الفرعية الأول
DELETE FROM user_stores;
DELETE FROM permissions;
DELETE FROM shopify_tokens;

-- حذف البيانات الرئيسية
DELETE FROM products WHERE shopify_id IS NOT NULL;
DELETE FROM orders WHERE shopify_id IS NOT NULL;
DELETE FROM customers WHERE shopify_id IS NOT NULL;

-- حذف المتاجر القديمة
DELETE FROM stores;

SELECT 'تم حذف جميع البيانات القديمة ✅' as status;

-- 2. تعطيل RLS نهائياً
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_tokens DISABLE ROW LEVEL SECURITY;

-- حذف جميع السياسات
DROP POLICY IF EXISTS products_allow_all ON products;
DROP POLICY IF EXISTS orders_allow_all ON orders;
DROP POLICY IF EXISTS customers_allow_all ON customers;
DROP POLICY IF EXISTS stores_allow_all ON stores;
DROP POLICY IF EXISTS user_stores_allow_all ON user_stores;
DROP POLICY IF EXISTS permissions_allow_all ON permissions;
DROP POLICY IF EXISTS shopify_tokens_allow_all ON shopify_tokens;

SELECT 'تم تعطيل RLS وحذف السياسات ✅' as status;

-- 3. إنشاء متجر جديد
INSERT INTO stores (name, created_at, updated_at)
VALUES ('Main Store', NOW(), NOW());

SELECT 'تم إنشاء متجر جديد ✅' as status;

-- 4. ربط جميع المستخدمين بالمتجر الجديد
INSERT INTO user_stores (user_id, store_id)
SELECT 
    u.id,
    s.id
FROM users u, stores s;

SELECT 'تم ربط المستخدمين بالمتجر ✅' as status;

-- 5. إنشاء صلاحيات جديدة للمستخدمين
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
SELECT 
    u.id,
    true,
    true,
    true,
    true,
    true,
    true,
    true
FROM users u;

SELECT 'تم إنشاء صلاحيات جديدة ✅' as status;

-- 6. إضافة cost_price column للمنتجات
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2) DEFAULT 0;

SELECT 'تم إضافة cost_price column ✅' as status;

-- 7. فحص الوضع الجديد
SELECT 'فحص الوضع بعد التنظيف' as status;

SELECT 
    'حالة النظام الجديدة' as check_type,
    (SELECT COUNT(*) FROM users) as total_users,
    (SELECT COUNT(*) FROM stores) as total_stores,
    (SELECT COUNT(*) FROM user_stores) as user_store_connections,
    (SELECT COUNT(*) FROM permissions) as user_permissions,
    (SELECT COUNT(*) FROM products) as remaining_products,
    (SELECT COUNT(*) FROM orders) as remaining_orders,
    (SELECT COUNT(*) FROM customers) as remaining_customers;

-- 8. عرض تفاصيل المستخدمين والمتاجر
SELECT 'تفاصيل المستخدمين' as info_type;
SELECT 
    u.id,
    u.email,
    u.role,
    (SELECT COUNT(*) FROM user_stores us WHERE us.user_id = u.id) as connected_stores,
    (SELECT COUNT(*) FROM permissions p WHERE p.user_id = u.id) as has_permissions
FROM users u
ORDER BY u.created_at;

SELECT 'تفاصيل المتاجر' as info_type;
SELECT 
    s.id,
    s.name,
    (SELECT COUNT(*) FROM user_stores us WHERE us.store_id = s.id) as connected_users
FROM stores s;

-- 9. التقرير النهائي
SELECT 'التقرير النهائي' as status;

SELECT 
    'تم تنظيف النظام بالكامل!' as result,
    'جميع البيانات القديمة تم حذفها' as step1,
    'تم إنشاء متجر جديد وربط المستخدمين به' as step2,
    'تم إنشاء صلاحيات جديدة لجميع المستخدمين' as step3,
    'النظام الآن جاهز لاستقبال بيانات Shopify الجديدة' as step4,
    'الخطوة التالية: اعمل Sync من Settings لسحب البيانات من Shopify' as next_action;

SELECT 'النظام نظيف وجاهز للـ Sync الجديد! 🎉' as final_message;