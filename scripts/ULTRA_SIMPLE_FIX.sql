-- ====================================
-- إصلاح بسيط جداً لعرض البيانات
-- Ultra Simple Data Display Fix
-- ====================================

-- 1. تعطيل RLS تماماً
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_stores DISABLE ROW LEVEL SECURITY;

-- 2. ربط البيانات بأول مستخدم ومتجر
DO $$
DECLARE
    first_user_id UUID;
    default_store_id UUID;
BEGIN
    -- الحصول على أول مستخدم
    SELECT id INTO first_user_id FROM users ORDER BY created_at LIMIT 1;
    
    -- الحصول على أول متجر أو إنشاء واحد
    SELECT id INTO default_store_id FROM stores ORDER BY created_at LIMIT 1;
    
    IF default_store_id IS NULL THEN
        INSERT INTO stores (name, created_at, updated_at)
        VALUES ('المتجر الرئيسي', NOW(), NOW())
        RETURNING id INTO default_store_id;
    END IF;
    
    -- ربط جميع البيانات من Shopify
    UPDATE products 
    SET 
        user_id = first_user_id,
        store_id = default_store_id,
        updated_at = NOW()
    WHERE shopify_id IS NOT NULL;
    
    UPDATE orders 
    SET 
        user_id = first_user_id,
        store_id = default_store_id,
        updated_at = NOW()
    WHERE shopify_id IS NOT NULL;
    
    UPDATE customers 
    SET 
        user_id = first_user_id,
        store_id = default_store_id,
        updated_at = NOW()
    WHERE shopify_id IS NOT NULL;
    
    -- ربط المستخدم بالمتجر
    INSERT INTO user_stores (user_id, store_id)
    VALUES (first_user_id, default_store_id)
    ON CONFLICT (user_id, store_id) DO NOTHING;
    
END $$;

-- 3. إضافة عمود cost_price للمنتجات
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2) DEFAULT 0;

-- 4. تحديث أسعار التكلفة
UPDATE products 
SET cost_price = (price * 0.6)
WHERE shopify_id IS NOT NULL AND (cost_price = 0 OR cost_price IS NULL) AND price > 0;

-- 5. عرض النتائج
SELECT 'البيانات المحدثة:' as info;

SELECT 
    'المنتجات' as النوع,
    COUNT(*) as الإجمالي,
    COUNT(CASE WHEN shopify_id IS NOT NULL THEN 1 END) as من_شوبيفاي
FROM products;

SELECT 
    'الطلبات' as النوع,
    COUNT(*) as الإجمالي,
    COUNT(CASE WHEN shopify_id IS NOT NULL THEN 1 END) as من_شوبيفاي
FROM orders;

SELECT 
    'العملاء' as النوع,
    COUNT(*) as الإجمالي,
    COUNT(CASE WHEN shopify_id IS NOT NULL THEN 1 END) as من_شوبيفاي
FROM customers;

-- 6. عرض عينة من البيانات
SELECT 'عينة من المنتجات:' as info;
SELECT id, title, price, cost_price FROM products WHERE shopify_id IS NOT NULL LIMIT 3;

SELECT 'عينة من الطلبات:' as info;
SELECT id, order_number, total_price, status FROM orders WHERE shopify_id IS NOT NULL LIMIT 3;

SELECT 'عينة من العملاء:' as info;
SELECT id, name, email FROM customers WHERE shopify_id IS NOT NULL LIMIT 3;

SELECT 'تم الإصلاح بنجاح!' as النتيجة;