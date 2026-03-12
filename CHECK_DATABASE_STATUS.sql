-- Script to check database status for NetProfit page

-- 1. Check if operational_costs table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'operational_costs'
) AS operational_costs_exists;

-- 2. Check if products.cost_price column exists
SELECT EXISTS (
  SELECT FROM information_schema.columns 
  WHERE table_schema = 'public' 
  AND table_name = 'products' 
  AND column_name = 'cost_price'
) AS cost_price_column_exists;

-- 3. Check if calculate_order_net_profit function exists
SELECT EXISTS (
  SELECT FROM pg_proc 
  WHERE proname = 'calculate_order_net_profit'
) AS function_exists;

-- 4. Check RLS status on operational_costs (if table exists)
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'operational_costs';

-- 5. List all policies on operational_costs (if table exists)
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'operational_costs';

-- 6. Check products table structure
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'products'
ORDER BY ordinal_position;

-- 7. Count existing operational costs (if table exists)
-- Uncomment if table exists:
-- SELECT COUNT(*) as total_operational_costs FROM operational_costs;

-- 8. Sample products with cost_price (if column exists)
-- Uncomment if column exists:
-- SELECT id, title, price, cost_price FROM products LIMIT 5;
