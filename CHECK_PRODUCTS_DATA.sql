-- Check if products exist in database
SELECT 
  id,
  user_id,
  shopify_id,
  title,
  vendor,
  product_type,
  price,
  currency,
  inventory_quantity,
  sku,
  created_at
FROM products
ORDER BY created_at DESC
LIMIT 10;

-- Count total products
SELECT COUNT(*) as total_products FROM products;

-- Check products by user
SELECT 
  user_id,
  COUNT(*) as product_count
FROM products
GROUP BY user_id;
