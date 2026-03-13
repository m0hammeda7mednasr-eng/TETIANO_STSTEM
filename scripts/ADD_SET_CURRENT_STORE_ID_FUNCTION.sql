-- Helper function to set store ID for RLS
CREATE OR REPLACE FUNCTION set_current_store_id(store_id UUID)
RETURNS void AS $$
BEGIN
  -- Set a session-level variable for the current store's ID
  PERFORM set_config('rls.store_id', store_id::TEXT, false);
END;
$$ LANGUAGE plpgsql;

-- Grant usage to authenticated users
GRANT EXECUTE ON FUNCTION set_current_store_id(UUID) TO authenticated;
