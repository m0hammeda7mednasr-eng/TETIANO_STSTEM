-- ====================================
-- إصلاح مشكلة عدم ظهور الصفحات حسب الرولز
-- المشكلة: جميع المستخدمين ليس لديهم permissions
-- ====================================

-- 1. حذف جميع الـ permissions الموجودة (للبداية من جديد)
DELETE FROM permissions;

-- 2. إضافة permissions كاملة لجميع المستخدمين Admin
INSERT INTO permissions (
    user_id,
    can_view_dashboard,
    can_view_products,
    can_edit_products,
    can_view_orders,
    can_edit_orders,
    can_view_customers,
    can_edit_customers,
    can_manage_users,
    can_manage_settings,
    can_view_profits,
    can_manage_tasks,
    can_view_all_reports,
    can_view_activity_log
)
SELECT 
    id,
    true,  -- can_view_dashboard
    true,  -- can_view_products
    true,  -- can_edit_products
    true,  -- can_view_orders
    true,  -- can_edit_orders
    true,  -- can_view_customers
    true,  -- can_edit_customers
    true,  -- can_manage_users
    true,  -- can_manage_settings
    true,  -- can_view_profits
    true,  -- can_manage_tasks
    true,  -- can_view_all_reports
    true   -- can_view_activity_log
FROM users 
WHERE role = 'admin';

-- 3. إضافة permissions محدودة للمستخدمين العاديين (employees)
INSERT INTO permissions (
    user_id,
    can_view_dashboard,
    can_view_products,
    can_edit_products,
    can_view_orders,
    can_edit_orders,
    can_view_customers,
    can_edit_customers,
    can_manage_users,
    can_manage_settings,
    can_view_profits,
    can_manage_tasks,
    can_view_all_reports,
    can_view_activity_log
)
SELECT 
    id,
    true,  -- can_view_dashboard
    true,  -- can_view_products
    false, -- can_edit_products (محدود)
    true,  -- can_view_orders
    false, -- can_edit_orders (محدود)
    true,  -- can_view_customers
    false, -- can_edit_customers (محدود)
    false, -- can_manage_users (محدود)
    false, -- can_manage_settings (محدود)
    false, -- can_view_profits (محدود)
    false, -- can_manage_tasks (محدود)
    false, -- can_view_all_reports (محدود)
    false  -- can_view_activity_log (محدود)
FROM users 
WHERE role != 'admin' OR role IS NULL;

-- 4. التأكد من وجود جميع الأعمدة المطلوبة في جدول permissions
ALTER TABLE permissions 
ADD COLUMN IF NOT EXISTS can_manage_tasks BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_view_all_reports BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_view_activity_log BOOLEAN DEFAULT false;

-- 5. تحديث permissions للـ admin users لتشمل الأعمدة الجديدة
UPDATE permissions 
SET 
    can_manage_tasks = true,
    can_view_all_reports = true,
    can_view_activity_log = true
WHERE user_id IN (
    SELECT id FROM users WHERE role = 'admin'
);

-- 6. عرض النتائج
SELECT 
    '✅ تم إصلاح permissions للمستخدمين:' as status,
    COUNT(*) as total_permissions
FROM permissions;

-- 7. عرض تفاصيل المستخدمين مع permissions
SELECT 
    u.email,
    u.name,
    u.role,
    p.can_view_dashboard,
    p.can_manage_users,
    p.can_view_profits,
    p.can_manage_tasks,
    p.can_view_all_reports,
    p.can_view_activity_log
FROM users u
LEFT JOIN permissions p ON u.id = p.user_id
ORDER BY u.role DESC, u.created_at ASC;

-- 8. إحصائيات سريعة
SELECT 
    'Admin Users' as user_type,
    COUNT(*) as count
FROM users 
WHERE role = 'admin'
UNION ALL
SELECT 
    'Employee Users' as user_type,
    COUNT(*) as count
FROM users 
WHERE role != 'admin' OR role IS NULL
UNION ALL
SELECT 
    'Users with Permissions' as user_type,
    COUNT(*) as count
FROM permissions;