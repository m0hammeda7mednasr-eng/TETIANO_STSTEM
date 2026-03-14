-- ====================================
-- إجبار ربط البيانات الموجودة
-- Force Link Existing Data
-- ====================================

-- هذا الملف لربط البيانات الموجودة بالمستخدمين والمتاجر بالقوة

-- 1. فحص الوضع الحالي
SELECT 'فحص الوضع قبل الربط' as status;

SELECT 
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) as shopify_products,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL) as shopify_orders,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL) as shopify_customers,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL) as linked_products,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL) as linked_orders,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL) as linked_customers;

-- 2. التأكد من وجود متجر
INSERT INTO stores (name, created_at, updated_at)
SELECT 'Main Store', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM stores);

-- 3. التأكد من ربط المستخدمين بالمتاجر
INSERT INTO user_stores (user_id, store_id)
SELECT 
    u.id,
    s.id
FROM users u
CROSS JOIN stores s
WHERE NOT EXISTS (
    SELECT 1 FROM user_stores us 
    WHERE us.user_id = u.id AND us.store_id = s.id
);

-- 4. إجبار ربط جميع بيانات Shopify
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

-- 5. فحص النتائج
SELECT 'فحص النتائج بعد الربط' as status;

SELECT 
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as products_linked,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as orders_linked,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as customers_linked;

-- 6. عرض عينة من البيانات المربوطة
SELECT 'عينة من البيانات المربوطة:' as sample_type;

SELECT 'منتجات:' as data_type;
SELECT id, title, price, shopify_id, user_id, store_id, updated_at
FROM products 
WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL
ORDER BY updated_at DESC 
LIMIT 3;

SELECT 'طلبات:' as data_type;
SELECT id, order_number, total_price, status, shopify_id, user_id, store_id, updated_at
FROM orders 
WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL
ORDER BY updated_at DESC 
LIMIT 3;

SELECT 'عملاء:' as data_type;
SELECT id, name, email, total_spent, shopify_id, user_id, store_id, updated_at
FROM customers 
WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL
ORDER BY updated_at DESC 
LIMIT 3;

SELECT 'تم ربط البيانات بنجاح! ✅' as final_status;