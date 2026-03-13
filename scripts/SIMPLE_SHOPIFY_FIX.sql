-- ====================================
-- إصلاح بسيط لجدول shopify_tokens
-- ====================================

-- 1. تأكد من وجود العمود shop (بدلاً من shop_domain)
ALTER TABLE shopify_tokens ADD COLUMN IF NOT EXISTS shop VARCHAR(255);

-- 2. إضافة unique constraint بسيط
ALTER TABLE shopify_tokens 
ADD CONSTRAINT IF NOT EXISTS shopify_tokens_user_shop_unique 
UNIQUE (user_id, shop);

-- 3. إضافة constraint للـ store_id إذا كان موجود
ALTER TABLE shopify_tokens 
ADD CONSTRAINT IF NOT EXISTS shopify_tokens_user_shop_store_unique 
UNIQUE (user_id, shop, store_id);

-- 4. التحقق من النتيجة
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'shopify_tokens'
ORDER BY ordinal_position;