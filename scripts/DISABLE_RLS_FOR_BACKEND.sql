-- Disable RLS temporarily to allow backend JWT authentication to work
-- This is needed because the backend uses custom JWT tokens, not Supabase Auth

-- Disable RLS on products table
ALTER TABLE products DISABLE ROW LEVEL SECURITY;

-- Disable RLS on orders table
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;

-- Disable RLS on customers table
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;

-- Disable RLS on shopify_tokens table
ALTER TABLE shopify_tokens DISABLE ROW LEVEL SECURITY;

-- Disable RLS on shopify_credentials table (if exists)
ALTER TABLE shopify_credentials DISABLE ROW LEVEL SECURITY;

-- Note: After running this, the backend will be able to access data using user_id from JWT tokens
-- The security is still maintained through the verifyToken middleware in the backend routes
