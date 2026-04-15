-- Fix linked permissions for warehouse/scanner, barcode labels, and orders.
-- This keeps existing users aligned with the permission dependencies used by the app:
-- 1. Editing warehouse/scanner implies viewing warehouse.
-- 2. Editing warehouse/scanner implies barcode label printing.
-- 3. Editing orders implies viewing orders.

-- Scanner users must be able to open warehouse screens and print barcode labels.
UPDATE permissions
SET can_view_warehouse = true,
    can_print_barcode_labels = true,
    updated_at = NOW()
WHERE can_edit_warehouse = true
  AND (
    can_view_warehouse = false
    OR can_print_barcode_labels = false
  );

-- Product editors should still receive warehouse access on legacy rows.
UPDATE permissions
SET can_edit_warehouse = true,
    can_view_warehouse = true,
    can_print_barcode_labels = true,
    updated_at = NOW()
WHERE can_edit_products = true
  AND (
    can_edit_warehouse = false
    OR can_view_warehouse = false
    OR can_print_barcode_labels = false
  );

-- Product viewers should still receive warehouse view access on legacy rows.
UPDATE permissions
SET can_view_warehouse = true,
    updated_at = NOW()
WHERE can_view_products = true
  AND can_view_warehouse = false;

-- Order editors must also be able to open orders, details, and shipping issue screens.
UPDATE permissions
SET can_view_orders = true,
    updated_at = NOW()
WHERE can_edit_orders = true
  AND can_view_orders = false;

-- Show the results.
SELECT
    u.name,
    u.email,
    p.can_view_products,
    p.can_edit_products,
    p.can_view_warehouse,
    p.can_edit_warehouse,
    p.can_print_barcode_labels,
    p.can_view_orders,
    p.can_edit_orders
FROM permissions p
JOIN users u ON u.id = p.user_id
ORDER BY u.name;
