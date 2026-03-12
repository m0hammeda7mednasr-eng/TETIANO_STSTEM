-- Add Cost Price and Profit Calculation
-- Run this in Supabase SQL Editor

-- 1. Add cost_price column to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2) DEFAULT 0;

-- 2. Add profit calculation columns
ALTER TABLE products
ADD COLUMN IF NOT EXISTS profit_per_unit DECIMAL(10, 2) GENERATED ALWAYS AS (price - cost_price) STORED,
ADD COLUMN IF NOT EXISTS profit_margin_percent DECIMAL(5, 2) GENERATED ALWAYS AS (
  CASE 
    WHEN price > 0 THEN ((price - cost_price) / price * 100)
    ELSE 0
  END
) STORED;

-- 3. Create index for cost_price
CREATE INDEX IF NOT EXISTS idx_products_cost_price ON products(cost_price);

-- 4. Add profit columns to orders table (for reporting)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS total_cost DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_profit DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS profit_margin_percent DECIMAL(5, 2) DEFAULT 0;

-- 5. Create function to calculate order profit
CREATE OR REPLACE FUNCTION calculate_order_profit(order_id_param UUID)
RETURNS TABLE (
  total_cost DECIMAL(10, 2),
  total_profit DECIMAL(10, 2),
  profit_margin DECIMAL(5, 2)
) AS $$
DECLARE
  order_data RECORD;
  line_items JSONB;
  item JSONB;
  product_cost DECIMAL(10, 2);
  item_quantity INTEGER;
  calculated_cost DECIMAL(10, 2) := 0;
  calculated_profit DECIMAL(10, 2);
  calculated_margin DECIMAL(5, 2);
BEGIN
  -- Get order data
  SELECT data, total_price INTO order_data
  FROM orders
  WHERE id = order_id_param;

  -- Get line items from order data
  line_items := order_data.data->'line_items';

  -- Calculate total cost
  FOR item IN SELECT * FROM jsonb_array_elements(line_items)
  LOOP
    -- Get product cost price
    SELECT cost_price INTO product_cost
    FROM products
    WHERE shopify_id = (item->>'product_id')::TEXT
    LIMIT 1;

    -- Get item quantity
    item_quantity := (item->>'quantity')::INTEGER;

    -- Add to total cost
    IF product_cost IS NOT NULL THEN
      calculated_cost := calculated_cost + (product_cost * item_quantity);
    END IF;
  END LOOP;

  -- Calculate profit
  calculated_profit := order_data.total_price::DECIMAL - calculated_cost;

  -- Calculate profit margin
  IF order_data.total_price::DECIMAL > 0 THEN
    calculated_margin := (calculated_profit / order_data.total_price::DECIMAL) * 100;
  ELSE
    calculated_margin := 0;
  END IF;

  RETURN QUERY SELECT calculated_cost, calculated_profit, calculated_margin;
END;
$$ LANGUAGE plpgsql;

-- 6. Create view for product profitability
CREATE OR REPLACE VIEW product_profitability AS
SELECT
  p.id,
  p.shopify_id,
  p.title,
  p.price,
  p.cost_price,
  p.profit_per_unit,
  p.profit_margin_percent,
  p.inventory_quantity,
  p.profit_per_unit * p.inventory_quantity AS total_potential_profit,
  p.user_id
FROM products p
WHERE p.price > 0;

-- 7. Create view for order profitability
CREATE OR REPLACE VIEW order_profitability AS
SELECT
  o.id,
  o.shopify_id,
  o.order_number,
  o.customer_name,
  o.total_price,
  o.total_cost,
  o.total_profit,
  o.profit_margin_percent,
  o.status,
  o.created_at,
  o.user_id
FROM orders o
WHERE o.total_price > 0;

-- 8. Verify the changes
SELECT 
  'products' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'products' 
  AND column_name IN ('cost_price', 'profit_per_unit', 'profit_margin_percent')
UNION ALL
SELECT 
  'orders' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'orders' 
  AND column_name IN ('total_cost', 'total_profit', 'profit_margin_percent')
ORDER BY table_name, column_name;
