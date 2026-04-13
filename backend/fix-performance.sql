-- إضافة فهارس لتحسين الأداء
-- Add indexes for better performance

-- فهرس على user_id في جدول orders
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- فهرس على shopify_id في جدول orders  
CREATE INDEX IF NOT EXISTS idx_orders_shopify_id ON orders(shopify_id);

-- فهرس مركب على user_id و created_at
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at);

-- فهرس على user_id في جدول products
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);

-- فهرس على user_id في جدول customers
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);

-- فهرس على user_id في جدول notifications (إذا كان موجود)
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- تحليل الجداول لتحديث الإحصائيات
ANALYZE orders;
ANALYZE products;
ANALYZE customers;