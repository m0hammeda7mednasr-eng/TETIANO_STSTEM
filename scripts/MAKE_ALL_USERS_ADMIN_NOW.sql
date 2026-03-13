-- ====================================
-- خلي جميع المستخدمين admin
-- ====================================

-- 1. تحويل جميع المستخدمين الموجودين إلى admin
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

-- 3. تغيير الـ default role للمستخدمين الجدد إلى admin
ALTER TABLE users 
ALTER COLUMN role SET DEFAULT 'admin';

-- 4. عرض النتائج
SELECT 
    '✅ جميع المستخدمين أصبحوا admin:' as status,
    COUNT(*) as total_admins
FROM users 
WHERE role = 'admin';

-- 5. عرض تفاصيل المستخدمين
SELECT 
    email,
    name,
    role,
    is_active,
    created_at
FROM users
ORDER BY created_at ASC;

-- 6. عرض الصلاحيات
SELECT 
    u.email,
    u.name,
    p.can_view_profits,
    p.can_manage_users,
    p.can_manage_settings
FROM users u
LEFT JOIN permissions p ON u.id = p.user_id
ORDER BY u.created_at ASC;