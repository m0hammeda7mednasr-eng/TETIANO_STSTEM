-- ====================================
-- إصلاح Unique Constraint لجدول shopify_tokens
-- ====================================

-- 1. حذف أي duplicate records أولاً (إذا وجدت)
DELETE FROM shopify_tokens a USING (
  SELECT MIN(ctid) as ctid, user_id, shop_domain
  FROM shopify_tokens 
  GROUP BY user_id, shop_domain 
  HAVING COUNT(*) > 1
) b
WHERE a.user_id = b.user_id 
  AND a.shop_domain = b.shop_domain 
  AND a.ctid <> b.ctid;

-- 2. إضافة unique constraints للـ combinations المختلفة
DO $
BEGIN
  -- Constraint 1: user_id + shop + store_id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'shopify_tokens_user_shop_store_unique'
  ) THEN
    ALTER TABLE shopify_tokens 
    ADD CONSTRAINT shopify_tokens_user_shop_store_unique 
    UNIQUE (user_id, shop_domain, store_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $;

DO $
BEGIN
  -- Constraint 2: user_id + shop (fallback)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'shopify_tokens_user_shop_unique'
  ) THEN
    ALTER TABLE shopify_tokens 
    ADD CONSTRAINT shopify_tokens_user_shop_unique 
    UNIQUE (user_id, shop_domain);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $;

DO $
BEGIN
  -- Constraint 3: shop only (fallback)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'shopify_tokens_shop_unique'
  ) THEN
    ALTER TABLE shopify_tokens 
    ADD CONSTRAINT shopify_tokens_shop_unique 
    UNIQUE (shop_domain);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $;

-- 3. تأكد من أن العمود shop_domain موجود (قد يكون اسمه shop)
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shopify_tokens' AND column_name = 'shop_domain'
  ) THEN
    -- إذا كان العمود اسمه shop، غير الاسم
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'shopify_tokens' AND column_name = 'shop'
    ) THEN
      ALTER TABLE shopify_tokens RENAME COLUMN shop TO shop_domain;
    ELSE
      -- إضافة العمود إذا لم يكن موجوداً
      ALTER TABLE shopify_tokens ADD COLUMN shop_domain VARCHAR(255);
    END IF;
  END IF;
END $;

-- 4. التحقق من النتيجة
SELECT 
  conname as constraint_name,
  contype as constraint_type
FROM pg_constraint 
WHERE conrelid = 'shopify_tokens'::regclass
  AND contype = 'u';

-- 5. عرض هيكل الجدول للتأكد
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'shopify_tokens'
ORDER BY ordinal_position;