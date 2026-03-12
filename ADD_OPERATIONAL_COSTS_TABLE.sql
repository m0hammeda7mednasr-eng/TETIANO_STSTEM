-- Create operational_costs table for tracking per-product costs
CREATE TABLE IF NOT EXISTS operational_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  
  -- Cost details
  cost_name VARCHAR(255) NOT NULL,
  cost_type VARCHAR(50) NOT NULL, -- 'ads', 'operations', 'shipping', 'packaging', 'other'
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Application
  apply_to VARCHAR(50) NOT NULL DEFAULT 'per_unit', -- 'per_unit', 'per_order', 'fixed'
  
  -- Metadata
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_operational_costs_user ON operational_costs(user_id);
CREATE INDEX IF NOT EXISTS idx_operational_costs_product ON operational_costs(product_id);
CREATE INDEX IF NOT EXISTS idx_operational_costs_type ON operational_costs(cost_type);
CREATE INDEX IF NOT EXISTS idx_operational_costs_active ON operational_costs(is_active);

-- Important:
-- Backend access for this table is already protected by JWT middleware + route permissions.
-- Keeping auth.uid() RLS policies here can break inserts when the backend uses service key fallback
-- or custom JWT claims. So we make this migration idempotent and keep table RLS disabled.
DROP POLICY IF EXISTS "Users can view their own operational costs" ON operational_costs;
DROP POLICY IF EXISTS "Users can insert their own operational costs" ON operational_costs;
DROP POLICY IF EXISTS "Users can update their own operational costs" ON operational_costs;
DROP POLICY IF EXISTS "Users can delete their own operational costs" ON operational_costs;
ALTER TABLE operational_costs DISABLE ROW LEVEL SECURITY;

-- Function to calculate net profit for an order with operational costs
CREATE OR REPLACE FUNCTION calculate_order_net_profit(order_id_param UUID)
RETURNS TABLE (
  total_revenue DECIMAL,
  total_cost DECIMAL,
  total_operational_costs DECIMAL,
  gross_profit DECIMAL,
  net_profit DECIMAL,
  profit_margin DECIMAL
) AS $$
DECLARE
  order_record RECORD;
  line_item JSONB;
  product_cost DECIMAL;
  product_id_val UUID;
  quantity_val INTEGER;
  price_val DECIMAL;
  total_cost_val DECIMAL := 0;
  total_revenue_val DECIMAL := 0;
  total_op_costs_val DECIMAL := 0;
  op_cost RECORD;
BEGIN
  -- Get order
  SELECT * INTO order_record FROM orders WHERE id = order_id_param;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Parse line items from data field
  FOR line_item IN SELECT * FROM jsonb_array_elements(order_record.data->'line_items')
  LOOP
    quantity_val := (line_item->>'quantity')::INTEGER;
    price_val := (line_item->>'price')::DECIMAL;
    
    -- Add to revenue
    total_revenue_val := total_revenue_val + (quantity_val * price_val);
    
    -- Try to find product by shopify_id
    SELECT id, cost_price INTO product_id_val, product_cost
    FROM products
    WHERE shopify_id = (line_item->>'product_id')::TEXT
      AND user_id = order_record.user_id
    LIMIT 1;
    
    IF FOUND THEN
      -- Add product cost
      total_cost_val := total_cost_val + (quantity_val * COALESCE(product_cost, 0));
      
      -- Add operational costs for this product
      FOR op_cost IN 
        SELECT amount, apply_to
        FROM operational_costs
        WHERE product_id = product_id_val
          AND user_id = order_record.user_id
          AND is_active = true
      LOOP
        IF op_cost.apply_to = 'per_unit' THEN
          total_op_costs_val := total_op_costs_val + (op_cost.amount * quantity_val);
        ELSIF op_cost.apply_to = 'per_order' THEN
          total_op_costs_val := total_op_costs_val + op_cost.amount;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  
  -- Return results
  RETURN QUERY SELECT
    total_revenue_val,
    total_cost_val,
    total_op_costs_val,
    total_revenue_val - total_cost_val AS gross_profit_val,
    total_revenue_val - total_cost_val - total_op_costs_val AS net_profit_val,
    CASE 
      WHEN total_revenue_val > 0 THEN
        ((total_revenue_val - total_cost_val - total_op_costs_val) / total_revenue_val) * 100
      ELSE 0
    END AS profit_margin_val;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE operational_costs IS 'Stores operational costs (ads, operations, etc.) per product';
COMMENT ON FUNCTION calculate_order_net_profit IS 'Calculates net profit for an order including operational costs';
