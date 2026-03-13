-- Fix Duplication Issue - Add Unique Constraints
-- Run this in Supabase SQL Editor

-- 1. Remove any existing duplicates first
-- For products
DELETE FROM products a USING products b
WHERE a.id > b.id 
  AND a.shopify_id = b.shopify_id 
  AND a.user_id = b.user_id;

-- For orders
DELETE FROM orders a USING orders b
WHERE a.id > b.id 
  AND a.shopify_id = b.shopify_id 
  AND a.user_id = b.user_id;

-- For customers
DELETE FROM customers a USING customers b
WHERE a.id > b.id 
  AND a.shopify_id = b.shopify_id 
  AND a.user_id = b.user_id;

-- 2. Add unique constraints to prevent future duplicates
-- For products
ALTER TABLE products 
ADD CONSTRAINT products_shopify_id_user_id_unique 
UNIQUE (shopify_id, user_id);

-- For orders
ALTER TABLE orders 
ADD CONSTRAINT orders_shopify_id_user_id_unique 
UNIQUE (shopify_id, user_id);

-- For customers
ALTER TABLE customers 
ADD CONSTRAINT customers_shopify_id_user_id_unique 
UNIQUE (shopify_id, user_id);

-- 3. Verify the constraints
SELECT
  conname AS constraint_name,
  conrelid::regclass AS table_name
FROM pg_constraint
WHERE conname LIKE '%shopify_id_user_id_unique%';
