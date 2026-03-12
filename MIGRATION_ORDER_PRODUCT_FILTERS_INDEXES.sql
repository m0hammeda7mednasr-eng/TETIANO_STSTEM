-- =========================================================
-- Migration: Order/Product filtering support + performance indexes
-- Safe, idempotent, and backward-compatible for Supabase/PostgreSQL
-- =========================================================

BEGIN;

-- 1) Ensure store_id columns exist for multi-store filtering compatibility
ALTER TABLE products ADD COLUMN IF NOT EXISTS store_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_id UUID;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS store_id UUID;

-- 2) Orders indexes for heavy filtering (date, status, amount, order range, search)
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status ON orders(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_total_price ON orders(total_price);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_store_created ON orders(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_store_status_created
  ON orders(store_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_store_fulfillment_created
  ON orders(store_id, fulfillment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_name_lower
  ON orders (LOWER(customer_name));
CREATE INDEX IF NOT EXISTS idx_orders_customer_email_lower
  ON orders (LOWER(customer_email));
CREATE INDEX IF NOT EXISTS idx_orders_shopify_id ON orders(shopify_id);

-- 3) Products indexes for filtering (vendor/type/stock/price/update/search)
CREATE INDEX IF NOT EXISTS idx_products_updated_at_desc ON products(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_inventory_quantity ON products(inventory_quantity);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_vendor_lower
  ON products (LOWER(vendor));
CREATE INDEX IF NOT EXISTS idx_products_type_lower
  ON products (LOWER(product_type));
CREATE INDEX IF NOT EXISTS idx_products_title_lower
  ON products (LOWER(title));
CREATE INDEX IF NOT EXISTS idx_products_user_updated ON products(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_store_updated ON products(store_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_store_inventory
  ON products(store_id, inventory_quantity);
CREATE INDEX IF NOT EXISTS idx_products_store_price
  ON products(store_id, price);

-- 4) Optional index for JSONB access in orders data (refund/cancel checks)
CREATE INDEX IF NOT EXISTS idx_orders_data_gin ON orders USING GIN (data);

COMMIT;

-- Done.
