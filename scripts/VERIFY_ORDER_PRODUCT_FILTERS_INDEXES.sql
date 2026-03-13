-- =========================================================
-- Verification script for filter indexes migration
-- =========================================================

-- 1) Verify required columns
SELECT
  table_name,
  column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'orders' AND column_name IN (
      'store_id', 'created_at', 'status', 'fulfillment_status',
      'order_number', 'total_price', 'customer_name', 'customer_email', 'data', 'shopify_id'
    ))
    OR
    (table_name = 'products' AND column_name IN (
      'store_id', 'updated_at', 'inventory_quantity', 'price',
      'vendor', 'product_type', 'title'
    ))
  )
ORDER BY table_name, column_name;

-- 2) Verify indexes existence
SELECT
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_orders_created_at_desc',
    'idx_orders_status',
    'idx_orders_fulfillment_status',
    'idx_orders_order_number',
    'idx_orders_total_price',
    'idx_orders_user_created',
    'idx_orders_store_created',
    'idx_orders_store_status_created',
    'idx_orders_store_fulfillment_created',
    'idx_orders_customer_name_lower',
    'idx_orders_customer_email_lower',
    'idx_orders_shopify_id',
    'idx_orders_data_gin',
    'idx_products_updated_at_desc',
    'idx_products_inventory_quantity',
    'idx_products_price',
    'idx_products_vendor_lower',
    'idx_products_type_lower',
    'idx_products_title_lower',
    'idx_products_user_updated',
    'idx_products_store_updated',
    'idx_products_store_inventory',
    'idx_products_store_price'
  )
ORDER BY tablename, indexname;

-- 3) Quick counts for sanity
SELECT
  (SELECT COUNT(*) FROM orders) AS total_orders,
  (SELECT COUNT(*) FROM products) AS total_products,
  (SELECT COUNT(*) FROM customers) AS total_customers;
