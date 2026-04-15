-- Fix warehouse permissions for existing users
-- This script ensures users who can edit products also get warehouse permissions

-- Update users who can edit products to also edit warehouse
UPDATE permissions 
SET can_edit_warehouse = true, 
    can_view_warehouse = true,
    updated_at = NOW()
WHERE can_edit_products = true 
AND can_edit_warehouse = false;

-- Ensure all users have warehouse view permissions if they have product view permissions  
UPDATE permissions 
SET can_view_warehouse = true,
    updated_at = NOW()
WHERE can_view_products = true 
AND can_view_warehouse = false;

-- Show the results
SELECT 
    u.name,
    u.email,
    p.can_view_products,
    p.can_edit_products,
    p.can_view_warehouse,
    p.can_edit_warehouse
FROM permissions p
JOIN users u ON u.id = p.user_id
ORDER BY u.name;