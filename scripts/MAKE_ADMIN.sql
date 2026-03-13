-- Make admin@test.com an admin with full permissions

-- Update user role to admin
UPDATE users 
SET role = 'admin' 
WHERE email = 'admin@test.com';

-- Insert or update permissions for admin
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
WHERE email = 'admin@test.com'
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

-- Verify the changes
SELECT 
  u.email, 
  u.name, 
  u.role,
  p.*
FROM users u
LEFT JOIN permissions p ON u.id = p.user_id
WHERE u.email = 'admin@test.com';
