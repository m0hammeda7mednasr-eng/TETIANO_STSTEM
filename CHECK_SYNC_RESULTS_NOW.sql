-- ====================================
-- فحص نتائج الـ Sync الحالي
-- Check Current Sync Results
-- ====================================

-- 1. فحص البيانات الموجودة حالياً
SELECT '=== فحص البيانات الحالية ===' as section;

SELECT 
    'إجمالي البيانات في قاعدة البيانات الآن' as check_type,
    (SELECT COUNT(*) FROM products) as total_products,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) as shopify_products,
    (SELECT COUNT(*) FROM orders) as total_orders,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL) as shopify_orders,
    (SELECT COUNT(*) FROM customers) as total_customers,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL) as shopify_customers;

-- 2. فحص آخر البيانات المضافة (في آخر ساعة)
SELECT 'البيانات المضافة في آخر ساعة' as check_type;

SELECT 
    'بيانات حديثة (آخر ساعة)' as time_check,
    (SELECT COUNT(*) FROM products WHERE created_at > NOW() - INTERVAL '1 hour') as new_products,
    (SELECT COUNT(*) FROM orders WHERE created_at > NOW() - INTERVAL '1 hour') as new_orders,
    (SELECT COUNT(*) FROM customers WHERE created_at > NOW() - INTERVAL '1 hour') as new_customers,
    (SELECT COUNT(*) FROM products WHERE updated_at > NOW() - INTERVAL '1 hour') as updated_products,
    (SELECT COUNT(*) FROM orders WHERE updated_at > NOW() - INTERVAL '1 hour') as updated_orders,
    (SELECT COUNT(*) FROM customers WHERE updated_at > NOW() - INTERVAL '1 hour') as updated_customers;

-- 3. عرض آخر البيانات المضافة
SELECT '=== آخر البيانات المضافة ===' as section;

SELECT 'آخر 5 منتجات مضافة:' as data_type;
SELECT 
    id,
    title,
    price,
    shopify_id,
    user_id,
    store_id,
    created_at,
    updated_at
FROM products 
ORDER BY created_at DESC 
LIMIT 5;

SELECT 'آخر 5 طلبات مضافة:' as data_type;
SELECT 
    id,
    order_number,
    total_price,
    status,
    customer_name,
    shopify_id,
    user_id,
    store_id,
    created_at,
    updated_at
FROM orders 
ORDER BY created_at DESC 
LIMIT 5;

SELECT 'آخر 5 عملاء مضافين:' as data_type;
SELECT 
    id,
    name,
    email,
    total_spent,
    shopify_id,
    user_id,
    store_id,
    created_at,
    updated_at
FROM customers 
ORDER BY created_at DESC 
LIMIT 5;

-- 4. فحص ربط البيانات بالمستخدمين والمتاجر
SELECT '=== فحص ربط البيانات ===' as section;

SELECT 
    'حالة ربط البيانات' as link_status,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as products_fully_linked,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND user_id IS NULL) as products_no_user,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND store_id IS NULL) as products_no_store,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as orders_fully_linked,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND user_id IS NULL) as orders_no_user,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND store_id IS NULL) as orders_no_store,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as customers_fully_linked,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND user_id IS NULL) as customers_no_user,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND store_id IS NULL) as customers_no_store;

-- 5. فحص المستخدمين والمتاجر
SELECT '=== فحص المستخدمين والمتاجر ===' as section;

SELECT 'المستخدمين الموجودين:' as info_type;
SELECT 
    id,
    email,
    role,
    created_at
FROM users 
ORDER BY created_at;

SELECT 'المتاجر الموجودة:' as info_type;
SELECT 
    id,
    name,
    created_at
FROM stores 
ORDER BY created_at;

SELECT 'ربط المستخدمين بالمتاجر:' as info_type;
SELECT 
    us.user_id,
    us.store_id,
    u.email,
    s.name as store_name
FROM user_stores us
JOIN users u ON us.user_id = u.id
JOIN stores s ON us.store_id = s.id;

-- 6. فحص اتصالات Shopify
SELECT 'اتصالات Shopify:' as info_type;
SELECT 
    id,
    user_id,
    shop,
    store_id,
    access_token IS NOT NULL as has_token,
    created_at,
    updated_at
FROM shopify_tokens 
ORDER BY updated_at DESC;

-- 7. محاكاة API calls
SELECT '=== محاكاة API Calls ===' as section;

-- محاكاة getAccessibleStoreIds
WITH first_user AS (
    SELECT id FROM users ORDER BY created_at LIMIT 1
)
SELECT 
    'getAccessibleStoreIds للمستخدم الأول' as api_function,
    u.id as user_id,
    COALESCE(array_agg(us.store_id) FILTER (WHERE us.store_id IS NOT NULL), ARRAY[]::UUID[]) as accessible_store_ids,
    COUNT(us.store_id) as store_count
FROM first_user u
LEFT JOIN user_stores us ON us.user_id = u.id
GROUP BY u.id;

-- محاكاة Dashboard Stats API
WITH first_user AS (
    SELECT id FROM users ORDER BY created_at LIMIT 1
),
user_accessible_stores AS (
    SELECT us.store_id 
    FROM user_stores us, first_user u 
    WHERE us.user_id = u.id
),
dashboard_products AS (
    SELECT p.*
    FROM products p, first_user u
    WHERE p.shopify_id IS NOT NULL 
      AND (p.user_id = u.id OR p.store_id IN (SELECT store_id FROM user_accessible_stores))
),
dashboard_orders AS (
    SELECT o.*
    FROM orders o, first_user u
    WHERE o.shopify_id IS NOT NULL 
      AND (o.user_id = u.id OR o.store_id IN (SELECT store_id FROM user_accessible_stores))
),
dashboard_customers AS (
    SELECT c.*
    FROM customers c, first_user u
    WHERE c.shopify_id IS NOT NULL 
      AND (c.user_id = u.id OR c.store_id IN (SELECT store_id FROM user_accessible_stores))
)
SELECT 
    'محاكاة Dashboard Stats API' as api_endpoint,
    (SELECT COUNT(*) FROM dashboard_products) as total_products,
    (SELECT COUNT(*) FROM dashboard_orders) as total_orders,
    (SELECT COUNT(*) FROM dashboard_customers) as total_customers,
    (SELECT COALESCE(SUM(CAST(total_price AS DECIMAL)), 0) FROM dashboard_orders WHERE status IN ('paid', 'completed', 'partially_paid')) as total_sales,
    CASE 
        WHEN (SELECT COUNT(*) FROM dashboard_products) > 0 OR (SELECT COUNT(*) FROM dashboard_orders) > 0 OR (SELECT COUNT(*) FROM dashboard_customers) > 0 
        THEN 'API سيرجع بيانات ✅'
        ELSE 'API لن يرجع بيانات ❌'
    END as api_result;

-- 8. فحص البيانات الخام (fallback)
SELECT 'محاكاة API Fallback (جميع بيانات Shopify):' as api_endpoint;
SELECT 
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) as all_shopify_products,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL) as all_shopify_orders,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL) as all_shopify_customers;

-- 9. التشخيص النهائي
SELECT '=== التشخيص النهائي ===' as section;

WITH diagnosis AS (
    SELECT 
        (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) as total_shopify_products,
        (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL) as total_shopify_orders,
        (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL) as total_shopify_customers,
        (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as linked_products,
        (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as linked_orders,
        (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as linked_customers,
        (SELECT COUNT(*) FROM user_stores) as user_store_connections,
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM stores) as total_stores
)
SELECT 
    'تشخيص المشكلة' as diagnosis_type,
    total_shopify_products,
    total_shopify_orders,
    total_shopify_customers,
    linked_products,
    linked_orders,
    linked_customers,
    user_store_connections,
    total_users,
    total_stores,
    CASE 
        WHEN total_shopify_products = 0 AND total_shopify_orders = 0 AND total_shopify_customers = 0 THEN 
            'مفيش بيانات Shopify خالص - الـ Sync مش شغال ❌'
        WHEN total_shopify_products > 0 AND linked_products = 0 THEN 
            'البيانات موجودة بس مش مربوطة بالمستخدمين ❌'
        WHEN user_store_connections = 0 THEN 
            'المستخدمين مش مربوطين بالمتاجر ❌'
        WHEN linked_products > 0 AND linked_orders > 0 AND linked_customers > 0 THEN 
            'البيانات موجودة ومربوطة صح - المشكلة في الـ API ⚠️'
        ELSE 
            'يحتاج فحص إضافي 🔍'
    END as problem_diagnosis,
    CASE 
        WHEN total_shopify_products = 0 THEN 'فحص اتصال Shopify وإعادة Sync'
        WHEN linked_products = 0 THEN 'تشغيل FORCE_LINK_DATA.sql'
        WHEN user_store_connections = 0 THEN 'إصلاح ربط المستخدمين بالمتاجر'
        ELSE 'فحص Backend API code'
    END as recommended_action
FROM diagnosis;