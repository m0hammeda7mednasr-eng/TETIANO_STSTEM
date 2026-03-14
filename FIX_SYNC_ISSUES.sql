-- ====================================
-- إصلاح مشاكل الـ Sync وضمان تحديث البيانات الجديدة
-- Fix Sync Issues and Ensure New Data Updates
-- ====================================

-- 1. فحص البيانات المكررة
SELECT 'فحص البيانات المكررة' as القسم;

SELECT 
    'منتجات مكررة' as النوع,
    shopify_id,
    COUNT(*) as عدد_التكرار
FROM products 
WHERE shopify_id IS NOT NULL
GROUP BY shopify_id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

SELECT 
    'طلبات مكررة' as النوع,
    shopify_id,
    COUNT(*) as عدد_التكرار
FROM orders 
WHERE shopify_id IS NOT NULL
GROUP BY shopify_id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

SELECT 
    'عملاء مكررون' as النوع,
    shopify_id,
    COUNT(*) as عدد_التكرار
FROM customers 
WHERE shopify_id IS NOT NULL
GROUP BY shopify_id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- 2. حذف البيانات المكررة (الاحتفاظ بالأحدث)
-- حذف المنتجات المكررة
DELETE FROM products 
WHERE id NOT IN (
    SELECT DISTINCT ON (shopify_id) id
    FROM products 
    WHERE shopify_id IS NOT NULL
    ORDER BY shopify_id, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
);

-- حذف الطلبات المكررة
DELETE FROM orders 
WHERE id NOT IN (
    SELECT DISTINCT ON (shopify_id) id
    FROM orders 
    WHERE shopify_id IS NOT NULL
    ORDER BY shopify_id, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
);

-- حذف العملاء المكررين
DELETE FROM customers 
WHERE id NOT IN (
    SELECT DISTINCT ON (shopify_id) id
    FROM customers 
    WHERE shopify_id IS NOT NULL
    ORDER BY shopify_id, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
);

-- 3. إضافة unique constraints لمنع التكرار في المستقبل
-- للمنتجات
DROP INDEX IF EXISTS products_shopify_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS products_shopify_id_unique 
ON products (shopify_id) 
WHERE shopify_id IS NOT NULL;

-- للطلبات
DROP INDEX IF EXISTS orders_shopify_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS orders_shopify_id_unique 
ON orders (shopify_id) 
WHERE shopify_id IS NOT NULL;

-- للعملاء
DROP INDEX IF EXISTS customers_shopify_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS customers_shopify_id_unique 
ON customers (shopify_id) 
WHERE shopify_id IS NOT NULL;

-- 4. تحديث جميع البيانات لضمان الربط الصحيح
UPDATE products 
SET 
    user_id = COALESCE(user_id, (SELECT id FROM users ORDER BY created_at LIMIT 1)),
    store_id = COALESCE(store_id, (SELECT id FROM stores ORDER BY created_at LIMIT 1)),
    updated_at = NOW()
WHERE shopify_id IS NOT NULL;

UPDATE orders 
SET 
    user_id = COALESCE(user_id, (SELECT id FROM users ORDER BY created_at LIMIT 1)),
    store_id = COALESCE(store_id, (SELECT id FROM stores ORDER BY created_at LIMIT 1)),
    updated_at = NOW()
WHERE shopify_id IS NOT NULL;

UPDATE customers 
SET 
    user_id = COALESCE(user_id, (SELECT id FROM users ORDER BY created_at LIMIT 1)),
    store_id = COALESCE(store_id, (SELECT id FROM stores ORDER BY created_at LIMIT 1)),
    updated_at = NOW()
WHERE shopify_id IS NOT NULL;

-- 5. إضافة indexes لتحسين الأداء
CREATE INDEX IF NOT EXISTS products_user_store_idx ON products (user_id, store_id) WHERE shopify_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_user_store_idx ON orders (user_id, store_id) WHERE shopify_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_user_store_idx ON customers (user_id, store_id) WHERE shopify_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_updated_at_idx ON products (updated_at DESC) WHERE shopify_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_updated_at_idx ON orders (updated_at DESC) WHERE shopify_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_updated_at_idx ON customers (updated_at DESC) WHERE shopify_id IS NOT NULL;

-- 6. فحص النتائج بعد التنظيف
SELECT 'النتائج بعد التنظيف' as القسم;

SELECT 
    'إحصائيات البيانات النظيفة' as النوع,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as منتجات_جاهزة,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as طلبات_جاهزة,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as عملاء_جاهزون;

-- فحص عدم وجود تكرار
SELECT 
    'فحص عدم التكرار' as النوع,
    (SELECT COUNT(*) FROM (SELECT shopify_id FROM products WHERE shopify_id IS NOT NULL GROUP BY shopify_id HAVING COUNT(*) > 1) duplicates) as منتجات_مكررة,
    (SELECT COUNT(*) FROM (SELECT shopify_id FROM orders WHERE shopify_id IS NOT NULL GROUP BY shopify_id HAVING COUNT(*) > 1) duplicates) as طلبات_مكررة,
    (SELECT COUNT(*) FROM (SELECT shopify_id FROM customers WHERE shopify_id IS NOT NULL GROUP BY shopify_id HAVING COUNT(*) > 1) duplicates) as عملاء_مكررون;

-- 7. عرض عينة من البيانات الجاهزة للتحديث
SELECT 'عينة البيانات الجاهزة للتحديث' as القسم;

SELECT 'أحدث المنتجات:' as نوع;
SELECT id, title, price, shopify_id, user_id, store_id, updated_at
FROM products 
WHERE shopify_id IS NOT NULL 
ORDER BY updated_at DESC 
LIMIT 3;

SELECT 'أحدث الطلبات:' as نوع;
SELECT id, order_number, total_price, shopify_id, user_id, store_id, updated_at
FROM orders 
WHERE shopify_id IS NOT NULL 
ORDER BY updated_at DESC 
LIMIT 3;

SELECT 'أحدث العملاء:' as نوع;
SELECT id, name, email, shopify_id, user_id, store_id, updated_at
FROM customers 
WHERE shopify_id IS NOT NULL 
ORDER BY updated_at DESC 
LIMIT 3;

-- 8. التقرير النهائي
SELECT 'التقرير النهائي' as القسم;

SELECT 
    'تم تنظيف البيانات وإصلاح الـ Sync!' as النتيجة,
    'البيانات الآن جاهزة لاستقبال التحديثات الجديدة من Shopify' as الحالة,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) as منتجات_نظيفة,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL) as طلبات_نظيفة,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL) as عملاء_نظيفون,
    'الآن يمكن عمل Sync جديد من Settings وستظهر البيانات الجديدة' as الخطوة_التالية;