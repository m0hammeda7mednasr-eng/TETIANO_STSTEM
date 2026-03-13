-- ====================================
-- إصلاح جدول shopify_tokens
-- ====================================

-- 1. إضافة عمود store_id إذا لم يكن موجوداً
ALTER TABLE shopify_tokens 
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;

-- 2. إضافة index للأداء
CREATE INDEX IF NOT EXISTS idx_shopify_tokens_store_id ON shopify_tokens(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_tokens_user_id ON shopify_tokens(user_id);

-- 3. تحديث البيانات الموجودة (إذا كان هناك بيانات بدون store_id)
-- هذا اختياري - يمكن تركه فارغ للآن

-- 4. التحقق من النتيجة
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'shopify_tokens' 
ORDER BY ordinal_position;

-- 5. عرض هيكل الجدول
\d shopify_tokens;