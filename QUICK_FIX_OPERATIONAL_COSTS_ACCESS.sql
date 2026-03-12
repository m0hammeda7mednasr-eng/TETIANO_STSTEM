-- ============================================================
-- QUICK FIX: operational_costs access denied (42501)
-- ============================================================
-- Run this in Supabase SQL Editor for the target project.
--
-- What this fixes:
-- 1) Ensures operational_costs table exists
-- 2) Removes conflicting RLS policies on this table
-- 3) Disables RLS on operational_costs (backend already enforces auth/roles)
-- 4) Grants table privileges to service_role
--
-- NOTE:
-- Recommended backend setup is using SUPABASE_SERVICE_ROLE_KEY.
-- Do not rely on anon key for backend writes.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operational_costs_user ON operational_costs(user_id);
CREATE INDEX IF NOT EXISTS idx_operational_costs_product ON operational_costs(product_id);
CREATE INDEX IF NOT EXISTS idx_operational_costs_type ON operational_costs(cost_type);
CREATE INDEX IF NOT EXISTS idx_operational_costs_active ON operational_costs(is_active);

-- Remove possible old/strict policies that may block backend actions.
DROP POLICY IF EXISTS "Users can view their own operational costs" ON operational_costs;
DROP POLICY IF EXISTS "Users can insert their own operational costs" ON operational_costs;
DROP POLICY IF EXISTS "Users can update their own operational costs" ON operational_costs;
DROP POLICY IF EXISTS "Users can delete their own operational costs" ON operational_costs;

-- Keep this table backend-controlled (middleware + role checks in backend).
ALTER TABLE operational_costs DISABLE ROW LEVEL SECURITY;

-- Ensure service role can read/write this table.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operational_costs TO service_role;

-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
SELECT
  'table_exists' AS check_name,
  EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'operational_costs'
  ) AS ok;

SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'operational_costs';

SELECT
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'operational_costs'
  AND grantee IN ('service_role', 'authenticated', 'anon')
ORDER BY grantee, privilege_type;

