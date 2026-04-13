-- إضافة فهارس لتحسين الأداء
-- Add indexes for better performance

-- فهرس على user_id في جدول orders
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- فهرس على shopify_id في جدول orders  
CREATE INDEX IF NOT EXISTS idx_orders_shopify_id ON orders(shopify_id);

-- فهرس مركب على user_id و created_at
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at);

-- فهرس على order_id في جدول order_comments
CREATE INDEX IF NOT EXISTS idx_order_comments_order_id ON order_comments(order_id);

-- فهرس على user_id في جدول order_comments
CREATE INDEX IF NOT EXISTS idx_order_comments_user_id ON order_comments(user_id);

-- تحليل الجداول لتحديث الإحصائيات
ANALYZE orders;
ANALYZE order_comments;