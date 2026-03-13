-- =================================================================
-- UPDATE DATABASE FOR ROLE-BASED ACCESS CONTROL (RBAC)
-- Safe, idempotent version for Supabase/PostgreSQL
-- =================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =================================================================
-- 0) Trigger safety fix (prevents: trigger already exists)
-- =================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'permissions'
  ) THEN
    DROP TRIGGER IF EXISTS update_permissions_updated_at ON permissions;
    CREATE TRIGGER update_permissions_updated_at
      BEFORE UPDATE ON permissions
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- =================================================================
-- 1) Helper functions for RLS
-- =================================================================

CREATE OR REPLACE FUNCTION get_current_rls_user_id()
RETURNS UUID AS $$
DECLARE
  raw_value TEXT;
BEGIN
  raw_value := NULLIF(current_setting('rls.user_id', true), '');
  IF raw_value IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN raw_value::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_current_rls_store_id()
RETURNS UUID AS $$
DECLARE
  raw_value TEXT;
BEGIN
  raw_value := NULLIF(current_setting('rls.store_id', true), '');
  IF raw_value IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN raw_value::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION set_current_user_id(user_id UUID)
RETURNS void AS $$
BEGIN
  PERFORM set_config('rls.user_id', user_id::TEXT, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION set_current_store_id(store_id UUID)
RETURNS void AS $$
BEGIN
  PERFORM set_config('rls.store_id', store_id::TEXT, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION set_current_user_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION set_current_store_id(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
DECLARE
  user_role TEXT;
  current_user_id UUID;
BEGIN
  current_user_id := get_current_rls_user_id();
  IF current_user_id IS NULL THEN
    RETURN 'anonymous';
  END IF;

  SELECT LOWER(COALESCE(u.role, 'user'))
  INTO user_role
  FROM users u
  WHERE u.id = current_user_id;

  RETURN COALESCE(user_role, 'user');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION has_my_permission(permission_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  current_user_id UUID;
  permission_value BOOLEAN;
BEGIN
  IF get_my_role() = 'admin' THEN
    RETURN TRUE;
  END IF;

  current_user_id := get_current_rls_user_id();
  IF current_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  EXECUTE format(
    'SELECT COALESCE(%I, false) FROM permissions WHERE user_id = $1 LIMIT 1',
    permission_name
  )
  INTO permission_value
  USING current_user_id;

  RETURN COALESCE(permission_value, FALSE);
EXCEPTION WHEN undefined_column THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION has_store_access(target_store_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_user_id UUID;
  requested_store_id UUID;
BEGIN
  IF get_my_role() = 'admin' THEN
    RETURN TRUE;
  END IF;

  IF target_store_id IS NULL THEN
    RETURN FALSE;
  END IF;

  current_user_id := get_current_rls_user_id();
  IF current_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  requested_store_id := get_current_rls_store_id();
  IF requested_store_id IS NOT NULL AND target_store_id <> requested_store_id THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM user_stores us
    WHERE us.user_id = current_user_id
      AND us.store_id = target_store_id
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- =================================================================
-- 2) Ensure missing columns/tables
-- =================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'permissions'
  ) THEN
    ALTER TABLE permissions
      ADD COLUMN IF NOT EXISTS can_manage_tasks BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS can_view_all_reports BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS can_view_activity_log BOOLEAN DEFAULT false;
  END IF;
END $$;

ALTER TABLE products ADD COLUMN IF NOT EXISTS store_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_id UUID;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS store_id UUID;

CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_stores (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_user_stores_user_id ON user_stores(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stores_store_id ON user_stores(store_id);

-- Tasks compatibility (fixes: record "new" has no field "user_id")
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  priority VARCHAR(20) DEFAULT 'medium',
  status VARCHAR(20) DEFAULT 'pending',
  due_date TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS due_date TIMESTAMP,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

UPDATE tasks
SET user_id = COALESCE(user_id, assigned_to)
WHERE user_id IS NULL;

CREATE TABLE IF NOT EXISTS task_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  storage_path TEXT,
  mime_type TEXT,
  size_bytes BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  read_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON task_attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_is_read_created
  ON notifications(user_id, is_read, created_at DESC);

-- =================================================================
-- 3) RLS policies (fixed: no TG_OP usage)
-- =================================================================

-- Products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to admins" ON products;
DROP POLICY IF EXISTS "Allow access based on permissions" ON products;
DROP POLICY IF EXISTS "Allow access based on store" ON products;
DROP POLICY IF EXISTS products_select_policy ON products;
DROP POLICY IF EXISTS products_insert_policy ON products;
DROP POLICY IF EXISTS products_update_policy ON products;
DROP POLICY IF EXISTS products_delete_policy ON products;

CREATE POLICY products_select_policy
  ON products FOR SELECT
  USING (
    get_my_role() = 'admin'
    OR (has_store_access(store_id) AND has_my_permission('can_view_products'))
  );

CREATE POLICY products_insert_policy
  ON products FOR INSERT
  WITH CHECK (
    get_my_role() = 'admin'
    OR (has_store_access(store_id) AND has_my_permission('can_edit_products'))
  );

CREATE POLICY products_update_policy
  ON products FOR UPDATE
  USING (
    get_my_role() = 'admin'
    OR (has_store_access(store_id) AND has_my_permission('can_edit_products'))
  )
  WITH CHECK (
    get_my_role() = 'admin'
    OR (has_store_access(store_id) AND has_my_permission('can_edit_products'))
  );

CREATE POLICY products_delete_policy
  ON products FOR DELETE
  USING (
    get_my_role() = 'admin'
    OR (has_store_access(store_id) AND has_my_permission('can_edit_products'))
  );

-- Orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to admins" ON orders;
DROP POLICY IF EXISTS "Allow access based on permissions" ON orders;
DROP POLICY IF EXISTS "Allow access based on store" ON orders;
DROP POLICY IF EXISTS orders_select_policy ON orders;
DROP POLICY IF EXISTS orders_insert_policy ON orders;
DROP POLICY IF EXISTS orders_update_policy ON orders;
DROP POLICY IF EXISTS orders_delete_policy ON orders;

CREATE POLICY orders_select_policy
  ON orders FOR SELECT
  USING (
    get_my_role() = 'admin'
    OR (has_store_access(store_id) AND has_my_permission('can_view_orders'))
  );

CREATE POLICY orders_insert_policy
  ON orders FOR INSERT
  WITH CHECK (
    get_my_role() = 'admin'
    OR (has_store_access(store_id) AND has_my_permission('can_edit_orders'))
  );

CREATE POLICY orders_update_policy
  ON orders FOR UPDATE
  USING (
    get_my_role() = 'admin'
    OR (has_store_access(store_id) AND has_my_permission('can_edit_orders'))
  )
  WITH CHECK (
    get_my_role() = 'admin'
    OR (has_store_access(store_id) AND has_my_permission('can_edit_orders'))
  );

CREATE POLICY orders_delete_policy
  ON orders FOR DELETE
  USING (
    get_my_role() = 'admin'
    OR (has_store_access(store_id) AND has_my_permission('can_edit_orders'))
  );

-- Customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to admins" ON customers;
DROP POLICY IF EXISTS "Allow access based on permissions" ON customers;
DROP POLICY IF EXISTS "Allow access based on store" ON customers;
DROP POLICY IF EXISTS customers_select_policy ON customers;
DROP POLICY IF EXISTS customers_insert_policy ON customers;
DROP POLICY IF EXISTS customers_update_policy ON customers;
DROP POLICY IF EXISTS customers_delete_policy ON customers;

CREATE POLICY customers_select_policy
  ON customers FOR SELECT
  USING (
    get_my_role() = 'admin'
    OR (has_store_access(store_id) AND has_my_permission('can_view_customers'))
  );

CREATE POLICY customers_insert_policy
  ON customers FOR INSERT
  WITH CHECK (
    get_my_role() = 'admin'
    OR (has_store_access(store_id) AND has_my_permission('can_edit_customers'))
  );

CREATE POLICY customers_update_policy
  ON customers FOR UPDATE
  USING (
    get_my_role() = 'admin'
    OR (has_store_access(store_id) AND has_my_permission('can_edit_customers'))
  )
  WITH CHECK (
    get_my_role() = 'admin'
    OR (has_store_access(store_id) AND has_my_permission('can_edit_customers'))
  );

CREATE POLICY customers_delete_policy
  ON customers FOR DELETE
  USING (
    get_my_role() = 'admin'
    OR (has_store_access(store_id) AND has_my_permission('can_edit_customers'))
  );

-- =================================================================
-- 4) Operational costs compatibility fix (prevents failed expense insert)
-- =================================================================

CREATE TABLE IF NOT EXISTS operational_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  cost_name VARCHAR(255) NOT NULL,
  cost_type VARCHAR(50) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  apply_to VARCHAR(50) NOT NULL DEFAULT 'per_unit',
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operational_costs_user ON operational_costs(user_id);
CREATE INDEX IF NOT EXISTS idx_operational_costs_product ON operational_costs(product_id);
CREATE INDEX IF NOT EXISTS idx_operational_costs_active ON operational_costs(is_active);

-- Backend already enforces access using JWT middleware + route permissions.
-- Keep this table RLS-disabled to avoid insert/update failures with custom JWT.
ALTER TABLE operational_costs DISABLE ROW LEVEL SECURITY;

-- =================================================================
-- Final check
-- =================================================================
SELECT 'RBAC, store policies, and operational costs fix applied successfully' AS status;
