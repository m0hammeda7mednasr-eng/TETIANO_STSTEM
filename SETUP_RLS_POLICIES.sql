-- Helper function to set user ID for RLS
CREATE OR REPLACE FUNCTION set_current_user_id(user_id UUID)
RETURNS void AS $$
BEGIN
  -- Set a session-level variable for the current user's ID
  PERFORM set_config('rls.user_id', user_id::TEXT, false);
END;
$$ LANGUAGE plpgsql;

-- Grant usage to authenticated users
GRANT EXECUTE ON FUNCTION set_current_user_id(UUID) TO authenticated;

-- #################################################################
-- RLS Policies for 'products'
-- #################################################################
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own products" ON products;
CREATE POLICY "Users can view their own products"
  ON products FOR SELECT
  USING (user_id = current_setting('rls.user_id', true)::uuid);

DROP POLICY IF EXISTS "Users can insert their own products" ON products;
CREATE POLICY "Users can insert their own products"
  ON products FOR INSERT
  WITH CHECK (user_id = current_setting('rls.user_id', true)::uuid);

-- #################################################################
-- RLS Policies for 'orders'
-- #################################################################
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own orders" ON orders;
CREATE POLICY "Users can view their own orders"
  ON orders FOR SELECT
  USING (user_id = current_setting('rls.user_id', true)::uuid);

DROP POLICY IF EXISTS "Users can insert their own orders" ON orders;
CREATE POLICY "Users can insert their own orders"
  ON orders FOR INSERT
  WITH CHECK (user_id = current_setting('rls.user_id', true)::uuid);
  
-- #################################################################
-- RLS Policies for 'customers'
-- #################################################################
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own customers" ON customers;
CREATE POLICY "Users can view their own customers"
  ON customers FOR SELECT
  USING (user_id = current_setting('rls.user_id', true)::uuid);

DROP POLICY IF EXISTS "Users can insert their own customers" ON customers;
CREATE POLICY "Users can insert their own customers"
  ON customers FOR INSERT
  WITH CHECK (user_id = current_setting('rls.user_id', true)::uuid);

-- #################################################################
-- RLS Policies for 'operational_costs'
-- #################################################################
ALTER TABLE operational_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own operational costs" ON operational_costs;
CREATE POLICY "Users can view their own operational costs"
  ON operational_costs FOR SELECT
  USING (user_id = current_setting('rls.user_id', true)::uuid);

DROP POLICY IF EXISTS "Users can insert their own operational costs" ON operational_costs;
CREATE POLICY "Users can insert their own operational costs"
  ON operational_costs FOR INSERT
  WITH CHECK (user_id = current_setting('rls.user_id', true)::uuid);

DROP POLICY IF EXISTS "Users can update their own operational costs" ON operational_costs;
CREATE POLICY "Users can update their own operational costs"
  ON operational_costs FOR UPDATE
  USING (user_id = current_setting('rls.user_id', true)::uuid);

DROP POLICY IF EXISTS "Users can delete their own operational costs" ON operational_costs;
CREATE POLICY "Users can delete their own operational costs"
  ON operational_costs FOR DELETE
  USING (user_id = current_setting('rls.user_id', true)::uuid);

-- #################################################################
-- RLS Policies for 'shopify_tokens'
-- #################################################################
ALTER TABLE shopify_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own tokens" ON shopify_tokens;
CREATE POLICY "Users can view their own tokens"
  ON shopify_tokens FOR SELECT
  USING (user_id = current_setting('rls.user_id', true)::uuid);

DROP POLICY IF EXISTS "Users can insert their own tokens" ON shopify_tokens;
CREATE POLICY "Users can insert their own tokens"
  ON shopify_tokens FOR INSERT
  WITH CHECK (user_id = current_setting('rls.user_id', true)::uuid);

-- #################################################################
-- RLS Policies for 'shopify_credentials'
-- #################################################################
ALTER TABLE shopify_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own shopify credentials" ON shopify_credentials;
CREATE POLICY "Users can manage their own shopify credentials"
  ON shopify_credentials FOR ALL
  USING (user_id = current_setting('rls.user_id', true)::uuid);
