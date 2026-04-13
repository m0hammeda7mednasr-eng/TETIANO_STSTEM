-- فهارس أساسية بس للجداول المؤكد موجودة
-- Basic indexes for confirmed existing tables

-- فهرس على user_id في جدول orders
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- فهرس على shopify_id في جدول orders  
CREATE INDEX IF NOT EXISTS idx_orders_shopify_id ON orders(shopify_id);