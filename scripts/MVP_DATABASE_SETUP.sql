-- MVP Database Setup for Shopify Bidirectional Sync
-- Run this in Supabase SQL Editor

-- 1. Add sync columns to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS pending_sync BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS sync_error TEXT,
ADD COLUMN IF NOT EXISTS local_updated_at TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS shopify_updated_at TIMESTAMP;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_products_pending_sync ON products(pending_sync) WHERE pending_sync = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_last_synced ON products(last_synced_at);

-- 2. Add sync columns to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS notes JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS pending_sync BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS sync_error TEXT,
ADD COLUMN IF NOT EXISTS local_updated_at TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS shopify_updated_at TIMESTAMP;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_orders_pending_sync ON orders(pending_sync) WHERE pending_sync = TRUE;
CREATE INDEX IF NOT EXISTS idx_orders_notes ON orders USING GIN(notes);

-- 3. Create sync_operations table for audit log
CREATE TABLE IF NOT EXISTS sync_operations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(20) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('to_shopify', 'from_shopify')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  request_data JSONB,
  response_data JSONB,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Indexes for sync_operations
CREATE INDEX IF NOT EXISTS idx_sync_ops_user_id ON sync_operations(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_ops_status ON sync_operations(status);
CREATE INDEX IF NOT EXISTS idx_sync_ops_entity ON sync_operations(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_ops_created_at ON sync_operations(created_at DESC);

-- Verify the changes
SELECT 
  'products' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'products' 
  AND column_name IN ('pending_sync', 'last_synced_at', 'sync_error', 'local_updated_at', 'shopify_updated_at')
UNION ALL
SELECT 
  'orders' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'orders' 
  AND column_name IN ('notes', 'pending_sync', 'last_synced_at', 'sync_error', 'local_updated_at', 'shopify_updated_at')
ORDER BY table_name, column_name;
