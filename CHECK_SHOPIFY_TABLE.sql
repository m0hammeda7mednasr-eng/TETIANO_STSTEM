-- ====================================
-- فحص جدول shopify_tokens
-- ====================================

-- 1. عرض جميع الأعمدة الموجودة
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'shopify_tokens'
ORDER BY ordinal_position;

-- 2. عرض جميع الـ constraints الموجودة
SELECT 
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'shopify_tokens'::regclass;

-- 3. عرض البيانات الموجودة (إذا كان هناك أي بيانات)
SELECT COUNT(*) as total_records FROM shopify_tokens;

-- 4. إنشاء الجدول من جديد إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS shopify_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  shop VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL,
  scope TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. إضافة unique constraint بسيط
ALTER TABLE shopify_tokens 
DROP CONSTRAINT IF EXISTS shopify_tokens_user_shop_unique;

ALTER TABLE shopify_tokens 
ADD CONSTRAINT shopify_tokens_user_shop_unique 
UNIQUE (user_id, shop);