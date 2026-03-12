-- Check if orders exist in database
SELECT 
  id,
  user_id,
  shopify_id,
  order_number,
  customer_name,
  customer_email,
  total_price,
  currency,
  status,
  fulfillment_status,
  items_count,
  created_at
FROM orders
ORDER BY created_at DESC
LIMIT 10;

-- Count total orders
SELECT COUNT(*) as total_orders FROM orders;

-- Check orders by user
SELECT 
  user_id,
  COUNT(*) as order_count
FROM orders
GROUP BY user_id;
