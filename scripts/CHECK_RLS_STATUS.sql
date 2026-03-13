-- Check if RLS is enabled or disabled on tables
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('products', 'orders', 'customers', 'shopify_tokens', 'shopify_credentials')
ORDER BY tablename;

-- Expected result: rls_enabled should be 'false' for all tables
