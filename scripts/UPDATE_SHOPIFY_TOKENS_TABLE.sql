-- Add store_id to shopify_tokens table
ALTER TABLE shopify_tokens ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);
