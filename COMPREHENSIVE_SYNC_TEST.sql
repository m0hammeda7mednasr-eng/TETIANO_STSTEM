-- ====================================
-- اختبار شامل لمشكلة الـ Sync وعرض البيانات
-- Comprehensive Sync and Data Display Test
-- ====================================

-- 1. فحص حالة قاعدة البيانات قبل الاختبار
SELECT '=== فحص حالة قاعدة البيانات ===' as test_section;

-- فحص إجمالي البيانات
SELECT 
    'إجمالي البيانات في قاعدة البيانات' as test_name,
    (SELECT COUNT(*) FROM products) as total_products,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) as shopify_products,
    (SELECT COUNT(*) FROM orders) as total_orders,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL) as shopify_orders,
    (SELECT COUNT(*) FROM customers) as total_customers,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL) as shopify_customers;

-- فحص ربط البيانات بالمستخدمين والمتاجر
SELECT 
    'ربط البيانات بالمستخدمين والمتاجر' as test_name,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as products_linked,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as orders_linked,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as customers_linked;

-- 2. فحص المستخدمين والمتاجر
SELECT '=== فحص المستخدمين والمتاجر ===' as test_section;

SELECT 
    'تفاصيل المستخدمين' as test_name,
    u.id,
    u.email,
    u.role,
    u.created_at,
    (SELECT COUNT(*) FROM user_stores us WHERE us.user_id = u.id) as connected_stores,
    (SELECT COUNT(*) FROM shopify_tokens st WHERE st.user_id = u.id) as shopify_connections
FROM users u
ORDER BY u.created_at;

SELECT 
    'تفاصيل المتاجر' as test_name,
    s.id,
    s.name,
    s.created_at,
    (SELECT COUNT(*) FROM user_stores us WHERE us.store_id = s.id) as connected_users,
    (SELECT COUNT(*) FROM products p WHERE p.store_id = s.id AND p.shopify_id IS NOT NULL) as store_products,
    (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id AND o.shopify_id IS NOT NULL) as store_orders
FROM stores s
ORDER BY s.created_at;

-- فحص اتصالات Shopify
SELECT 
    'اتصالات Shopify' as test_name,
    st.id,
    st.user_id,
    st.shop,
    st.store_id,
    st.access_token IS NOT NULL as has_access_token,
    st.created_at,
    st.updated_at
FROM shopify_tokens st
ORDER BY st.updated_at DESC;

-- 3. فحص البيانات المفصل
SELECT '=== فحص البيانات المفصل ===' as test_section;

-- فحص المنتجات
SELECT 'تفاصيل المنتجات' as test_name;
SELECT 
    id,
    title,
    price,
    cost_price,
    shopify_id,
    user_id,
    store_id,
    created_at,
    updated_at,
    CASE 
        WHEN user_id IS NULL THEN 'مفيش user_id ❌'
        WHEN store_id IS NULL THEN 'مفيش store_id ❌'
        ELSE 'مربوط صح ✅'
    END as link_status
FROM products 
WHERE shopify_id IS NOT NULL
ORDER BY updated_at DESC
LIMIT 5;

-- فحص الطلبات
SELECT 'تفاصيل الطلبات' as test_name;
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
    updated_at,
    CASE 
        WHEN user_id IS NULL THEN 'مفيش user_id ❌'
        WHEN store_id IS NULL THEN 'مفيش store_id ❌'
        ELSE 'مربوط صح ✅'
    END as link_status
FROM orders 
WHERE shopify_id IS NOT NULL
ORDER BY updated_at DESC
LIMIT 5;

-- فحص العملاء
SELECT 'تفاصيل العملاء' as test_name;
SELECT 
    id,
    name,
    email,
    total_spent,
    shopify_id,
    user_id,
    store_id,
    created_at,
    updated_at,
    CASE 
        WHEN user_id IS NULL THEN 'مفيش user_id ❌'
        WHEN store_id IS NULL THEN 'مفيش store_id ❌'
        ELSE 'مربوط صح ✅'
    END as link_status
FROM customers 
WHERE shopify_id IS NOT NULL
ORDER BY updated_at DESC
LIMIT 5;

-- 4. محاكاة API calls
SELECT '=== محاكاة API Calls ===' as test_section;

-- محاكاة getAccessibleStoreIds للمستخدم الأول
WITH first_user AS (
    SELECT id FROM users ORDER BY created_at LIMIT 1
)
SELECT 
    'getAccessibleStoreIds للمستخدم الأول' as test_name,
    u.id as user_id,
    array_agg(us.store_id) as accessible_store_ids,
    COUNT(us.store_id) as store_count
FROM first_user u
LEFT JOIN user_stores us ON us.user_id = u.id
GROUP BY u.id;

-- محاكاة findRowsByUserWithFallback للمنتجات
WITH first_user AS (
    SELECT id FROM users ORDER BY created_at LIMIT 1
),
accessible_stores AS (
    SELECT us.store_id 
    FROM user_stores us, first_user u 
    WHERE us.user_id = u.id
),
user_products_by_store AS (
    SELECT p.*
    FROM products p
    WHERE p.shopify_id IS NOT NULL 
      AND p.store_id IN (SELECT store_id FROM accessible_stores)
),
user_products_by_user AS (
    SELECT p.*
    FROM products p, first_user u
    WHERE p.shopify_id IS NOT NULL 
      AND p.user_id = u.id
),
all_shopify_products AS (
    SELECT p.*
    FROM products p
    WHERE p.shopify_id IS NOT NULL
)
SELECT 
    'محاكاة findRowsByUserWithFallback للمنتجات' as test_name,
    (SELECT COUNT(*) FROM user_products_by_store) as products_by_store,
    (SELECT COUNT(*) FROM user_products_by_user) as products_by_user,
    (SELECT COUNT(*) FROM all_shopify_products) as all_shopify_products,
    CASE 
        WHEN (SELECT COUNT(*) FROM user_products_by_store) > 0 THEN 'سيرجع البيانات من المتجر ✅'
        WHEN (SELECT COUNT(*) FROM user_products_by_user) > 0 THEN 'سيرجع البيانات من المستخدم ✅'
        WHEN (SELECT COUNT(*) FROM all_shopify_products) > 0 THEN 'سيرجع جميع بيانات Shopify ✅'
        ELSE 'لن يرجع أي بيانات ❌'
    END as expected_result;

-- محاكاة Dashboard Stats API
WITH first_user AS (
    SELECT id FROM users ORDER BY created_at LIMIT 1
),
accessible_stores AS (
    SELECT us.store_id 
    FROM user_stores us, first_user u 
    WHERE us.user_id = u.id
),
dashboard_products AS (
    SELECT p.*
    FROM products p, first_user u
    WHERE p.shopify_id IS NOT NULL 
      AND (p.user_id = u.id OR p.store_id IN (SELECT store_id FROM accessible_stores))
),
dashboard_orders AS (
    SELECT o.*
    FROM orders o, first_user u
    WHERE o.shopify_id IS NOT NULL 
      AND (o.user_id = u.id OR o.store_id IN (SELECT store_id FROM accessible_stores))
),
dashboard_customers AS (
    SELECT c.*
    FROM customers c, first_user u
    WHERE c.shopify_id IS NOT NULL 
      AND (c.user_id = u.id OR c.store_id IN (SELECT store_id FROM accessible_stores))
)
SELECT 
    'محاكاة Dashboard Stats API' as test_name,
    (SELECT COUNT(*) FROM dashboard_products) as total_products,
    (SELECT COUNT(*) FROM dashboard_orders) as total_orders,
    (SELECT COUNT(*) FROM dashboard_customers) as total_customers,
    (SELECT COALESCE(SUM(CAST(total_price AS DECIMAL)), 0) FROM dashboard_orders WHERE status IN ('paid', 'completed', 'partially_paid')) as total_sales;

-- 5. فحص مشاكل محتملة
SELECT '=== فحص المشاكل المحتملة ===' as test_section;

-- البحث عن بيانات غير مربوطة
SELECT 
    'بيانات غير مربوطة' as problem_type,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND user_id IS NULL) as products_no_user,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND store_id IS NULL) as products_no_store,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND user_id IS NULL) as orders_no_user,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND store_id IS NULL) as orders_no_store,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND user_id IS NULL) as customers_no_user,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND store_id IS NULL) as customers_no_store;

-- البحث عن بيانات مكررة
SELECT 
    'بيانات مكررة' as problem_type,
    (SELECT COUNT(*) FROM (SELECT shopify_id FROM products WHERE shopify_id IS NOT NULL GROUP BY shopify_id HAVING COUNT(*) > 1) dups) as duplicate_products,
    (SELECT COUNT(*) FROM (SELECT shopify_id FROM orders WHERE shopify_id IS NOT NULL GROUP BY shopify_id HAVING COUNT(*) > 1) dups) as duplicate_orders,
    (SELECT COUNT(*) FROM (SELECT shopify_id FROM customers WHERE shopify_id IS NOT NULL GROUP BY shopify_id HAVING COUNT(*) > 1) dups) as duplicate_customers;

-- فحص البيانات القديمة
SELECT 
    'البيانات القديمة (أكثر من يوم)' as problem_type,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND updated_at < NOW() - INTERVAL '1 day') as old_products,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND updated_at < NOW() - INTERVAL '1 day') as old_orders,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND updated_at < NOW() - INTERVAL '1 day') as old_customers;

-- فحص المستخدمين بدون صلاحيات
SELECT 
    'مستخدمين بدون صلاحيات' as problem_type,
    COUNT(*) as users_without_permissions
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.user_id = u.id);

-- فحص المستخدمين بدون متاجر
SELECT 
    'مستخدمين بدون متاجر' as problem_type,
    COUNT(*) as users_without_stores
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM user_stores us WHERE us.user_id = u.id);

-- 6. اختبار الـ Unique Constraints
SELECT '=== اختبار Unique Constraints ===' as test_section;

-- فحص وجود الـ indexes
SELECT 
    'فحص Unique Indexes' as test_name,
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE indexname LIKE '%shopify_id%' 
   OR indexname LIKE '%unique%'
ORDER BY tablename, indexname;

-- 7. التقرير النهائي والتوصيات
SELECT '=== التقرير النهائي والتوصيات ===' as test_section;

WITH diagnosis AS (
    SELECT 
        (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as products_ok,
        (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as orders_ok,
        (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as customers_ok,
        (SELECT COUNT(*) FROM user_stores) as user_store_links,
        (SELECT COUNT(*) FROM permissions WHERE can_view_products = true) as users_with_permissions,
        (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND user_id IS NULL) as products_unlinked,
        (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND user_id IS NULL) as orders_unlinked,
        (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND user_id IS NULL) as customers_unlinked
)
SELECT 
    'تشخيص شامل للنظام' as diagnosis_type,
    products_ok,
    orders_ok,
    customers_ok,
    user_store_links,
    users_with_permissions,
    products_unlinked,
    orders_unlinked,
    customers_unlinked,
    CASE 
        WHEN products_unlinked > 0 OR orders_unlinked > 0 OR customers_unlinked > 0 THEN 'يحتاج إصلاح ربط البيانات ❌'
        WHEN user_store_links = 0 THEN 'يحتاج إصلاح ربط المستخدمين بالمتاجر ❌'
        WHEN users_with_permissions = 0 THEN 'يحتاج إصلاح الصلاحيات ❌'
        WHEN products_ok > 0 AND orders_ok > 0 AND customers_ok > 0 THEN 'النظام يعمل بشكل صحيح ✅'
        ELSE 'يحتاج فحص إضافي ⚠️'
    END as system_status,
    CASE 
        WHEN products_unlinked > 0 OR orders_unlinked > 0 OR customers_unlinked > 0 THEN 'شغل SIMPLE_BACKEND_DATA_FIX.sql'
        WHEN user_store_links = 0 THEN 'أضف المستخدمين للمتاجر'
        WHEN users_with_permissions = 0 THEN 'أضف الصلاحيات للمستخدمين'
        ELSE 'اعمل Sync جديد من Settings'
    END as recommended_action
FROM diagnosis;