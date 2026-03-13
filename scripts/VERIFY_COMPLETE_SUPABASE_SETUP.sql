-- =========================================================
-- Full verification for core app schema in Supabase
-- Run this after applying all setup/migration SQL files
-- =========================================================

-- 1) Required tables
WITH required_tables(table_name) AS (
  VALUES
    ('users'),
    ('permissions'),
    ('products'),
    ('orders'),
    ('customers'),
    ('shopify_tokens'),
    ('stores'),
    ('user_stores'),
    ('operational_costs'),
    ('daily_reports'),
    ('tasks'),
    ('task_comments'),
    ('task_attachments'),
    ('notifications'),
    ('access_requests'),
    ('activity_log'),
    ('order_comments')
)
SELECT
  rt.table_name,
  CASE WHEN t.table_name IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
FROM required_tables rt
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public'
 AND t.table_name = rt.table_name
ORDER BY rt.table_name;

-- 2) Required columns
WITH required_columns(table_name, column_name) AS (
  VALUES
    ('users', 'role'),
    ('permissions', 'can_manage_tasks'),
    ('permissions', 'can_view_all_reports'),
    ('permissions', 'can_view_activity_log'),
    ('products', 'cost_price'),
    ('products', 'store_id'),
    ('orders', 'store_id'),
    ('orders', 'status'),
    ('orders', 'fulfillment_status'),
    ('orders', 'data'),
    ('customers', 'store_id'),
    ('shopify_tokens', 'store_id'),
    ('operational_costs', 'apply_to'),
    ('daily_reports', 'attachments'),
    ('tasks', 'assigned_to'),
    ('task_attachments', 'task_id'),
    ('notifications', 'is_read'),
    ('order_comments', 'order_id')
)
SELECT
  rc.table_name,
  rc.column_name,
  CASE WHEN c.column_name IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
FROM required_columns rc
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = rc.table_name
 AND c.column_name = rc.column_name
ORDER BY rc.table_name, rc.column_name;

-- 3) Critical indexes (including filter indexes)
WITH required_indexes(index_name) AS (
  VALUES
    ('idx_permissions_user_id'),
    ('idx_orders_created_at_desc'),
    ('idx_orders_status'),
    ('idx_orders_fulfillment_status'),
    ('idx_orders_order_number'),
    ('idx_orders_total_price'),
    ('idx_orders_customer_name_lower'),
    ('idx_orders_customer_email_lower'),
    ('idx_products_updated_at_desc'),
    ('idx_products_inventory_quantity'),
    ('idx_products_price'),
    ('idx_products_vendor_lower'),
    ('idx_products_type_lower'),
    ('idx_task_attachments_task_id'),
    ('idx_notifications_user_is_read_created')
)
SELECT
  ri.index_name,
  CASE WHEN pi.indexname IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
FROM required_indexes ri
LEFT JOIN pg_indexes pi
  ON pi.schemaname = 'public'
 AND pi.indexname = ri.index_name
ORDER BY ri.index_name;

-- 4) Quick data sanity
SELECT
  (SELECT COUNT(*) FROM users) AS users_count,
  (SELECT COUNT(*) FROM permissions) AS permissions_count,
  (SELECT COUNT(*) FROM stores) AS stores_count,
  (SELECT COUNT(*) FROM user_stores) AS user_stores_count,
  (SELECT COUNT(*) FROM products) AS products_count,
  (SELECT COUNT(*) FROM orders) AS orders_count,
  (SELECT COUNT(*) FROM customers) AS customers_count,
  (SELECT COUNT(*) FROM tasks) AS tasks_count,
  (SELECT COUNT(*) FROM notifications) AS notifications_count,
  (SELECT COUNT(*) FROM order_comments) AS order_comments_count;
