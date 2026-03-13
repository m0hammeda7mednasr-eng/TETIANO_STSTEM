-- Add cost_price column to products table if it doesn't exist
-- This column stores the purchase/manufacturing cost of each product

ALTER TABLE products
ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2) DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN products.cost_price IS 'Purchase or manufacturing cost of the product (used for profit calculations)';

-- Update existing products to have 0 as default if NULL
UPDATE products
SET cost_price = 0
WHERE cost_price IS NULL;

-- Verify the column was added
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'products'
AND column_name = 'cost_price';
