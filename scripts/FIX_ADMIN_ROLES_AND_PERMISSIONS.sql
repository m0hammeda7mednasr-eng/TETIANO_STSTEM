-- ====================================
-- إصلاح الأدوار والصلاحيات للمدير
-- ====================================

-- 1. تحويل testadmin إلى مدير
UPDATE users 
SET role = 'admin' 
WHERE email = 'testadmin@example.com';

-- 2. إضافة/تحديث صلاحيات المدير الكاملة
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
WHERE email = 'testadmin@example.com'
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

-- 3. التحقق من النتائج
SELECT 
    '✅ تم تحديث المدير:' as status,
    u.email,
    u.name,
    u.role,
    p.can_view_profits,
    p.can_manage_users,
    p.can_manage_settings
FROM users u
LEFT JOIN permissions p ON u.id = p.user_id
WHERE u.email = 'testadmin@example.com';

-- 4. عرض جميع الصلاحيات
SELECT 
    '📋 جميع صلاحيات المدير:' as info,
    p.*
FROM users u
JOIN permissions p ON u.id = p.user_id
WHERE u.email = 'testadmin@example.com';