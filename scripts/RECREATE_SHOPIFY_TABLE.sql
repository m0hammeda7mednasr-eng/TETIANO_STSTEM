-- ====================================
-- إعادة إنشاء جدول shopify_tokens من الصفر
-- ====================================

-- 1. حذف الجدول القديم (احتياط)
DROP TABLE IF EXISTS shopify_tokens CASCADE;

-- 2. إنشاء الجدول الجديد مع جميع الأعمدة والـ constraints
CREATE TABLE shopify_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  shop VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL,
  scope TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Unique constraints
  CONSTRAINT shopify_tokens_user_shop_unique UNIQUE (user_id, shop)
);

-- 3. إضافة indexes للأداء
CREATE INDEX idx_shopify_tokens_user_id ON shopify_tokens(user_id);
CREATE INDEX idx_shopify_tokens_store_id ON shopify_tokens(store_id);
CREATE INDEX idx_shopify_tokens_shop ON shopify_tokens(shop);

-- 4. التحقق من النتيجة
SELECT 'Table created successfully' as status;

SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'shopify_tokens'
ORDER BY ordinal_position;