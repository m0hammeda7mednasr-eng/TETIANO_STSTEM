-- تحقق من حالة المستخدمين وصلاحياتهم
-- Check users and their roles

SELECT 
  id,
  email,
  name,
  role,
  is_active,
  created_at
FROM users
ORDER BY created_at DESC;

-- إذا كان المستخدم الأول ليس admin، قم بتحديثه
-- If the first user is not admin, update them

UPDATE users
SET role = 'admin'
WHERE email = 'YOUR_EMAIL_HERE';  -- استبدل YOUR_EMAIL_HERE بالبريد الإلكتروني الخاص بك

-- تحقق من الصلاحيات
-- Check permissions

SELECT 
  u.email,
  u.role,
  p.*
FROM users u
LEFT JOIN permissions p ON u.id = p.user_id
ORDER BY u.created_at DESC;

-- إذا لم يكن لديك صلاحيات، قم بإنشائها
-- If you don't have permissions, create them

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
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true
FROM users
WHERE role = 'admin'
AND id NOT IN (SELECT user_id FROM permissions)
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
  can_view_profits = true;
