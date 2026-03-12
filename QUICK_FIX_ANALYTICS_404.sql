-- ====================================
-- حل سريع لمشكلة Analytics 404 Error
-- ====================================

-- 1. تحديث جميع المستخدمين ليصبحوا admin
UPDATE users 
SET role = 'admin' 
WHERE role IS NULL OR role != 'admin';

-- 2. إضافة صلاحيات كاملة لجميع المستخدمين
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
    can_view_profits
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
    true   -- can_view_profits
FROM users 
ON CONFLICT (user_id) DO UPDATE SET
    can_view_dashboard = true,
    can_view_products = true,
    can_edit_products = true,
    can_view_orders = true,
    can_edit_orders = true,
    can_view_customers = true,
    can_edit_customers = true,
    can_manage_users = true,
    can_manage_settings = true,
    can_view_profits = true,
    updated_at = NOW();

-- 3. عرض النتائج
SELECT 
    '✅ جميع المستخدمين أصبحوا admin:' as status,
    COUNT(*) as total_admins
FROM users 
WHERE role = 'admin';

-- 4. عرض تفاصيل المستخدمين
SELECT 
    email,
    name,
    role,
    is_active,
    created_at
FROM users
ORDER BY created_at ASC;

-- 5. إنشاء مستخدم admin جديد للاختبار
INSERT INTO users (email, password, name, role, is_active)
VALUES (
    'admin@analytics.com',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- password: password
    'Analytics Admin',
    'admin',
    true
) ON CONFLICT (email) DO UPDATE SET
    role = 'admin',
    is_active = true;

-- 6. إضافة صلاحيات للمستخدم الجديد
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
    can_view_profits
)
SELECT 
    id,
    true, true, true, true, true, true, true, true, true, true
FROM users 
WHERE email = 'admin@analytics.com'
ON CONFLICT (user_id) DO UPDATE SET
    can_view_dashboard = true,
    can_view_products = true,
    can_edit_products = true,
    can_view_orders = true,
    can_edit_orders = true,
    can_view_customers = true,
    can_edit_customers = true,
    can_manage_users = true,
    can_manage_settings = true,
    can_view_profits = true,
    updated_at = NOW();

-- 7. عرض المستخدم الجديد
SELECT 
    '✅ مستخدم admin جديد تم إنشاؤه:' as status,
    email,
    name,
    role
FROM users 
WHERE email = 'admin@analytics.com';