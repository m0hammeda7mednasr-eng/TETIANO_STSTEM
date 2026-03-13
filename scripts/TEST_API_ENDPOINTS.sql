-- ====================================
-- اختبار API Endpoints بعد الإصلاح
-- Test API Endpoints After Fix
-- ====================================

-- هذا الملف لاختبار أن البيانات ستظهر صحيحاً في API endpoints

-- 1. اختبار Dashboard Stats API
SELECT 'اختبار Dashboard Stats API' as test_name;

WITH first_user AS (
    SELECT id FROM users ORDER BY created_at LIMIT 1
),
user_data AS (
    SELECT 
        u.id as user_id,
        (SELECT COUNT(*) FROM products p WHERE p.shopify_id IS NOT NULL AND (p.user_id = u.id OR p.store_id IN (SELECT store_id FROM user_stores WHERE user_id = u.id))) as products_count,
        (SELECT COUNT(*) FROM orders o WHERE o.shopify_id IS NOT NULL AND (o.user_id = u.id OR o.store_id IN (SELECT store_id FROM user_stores WHERE user_id = u.id))) as orders_count,
        (SELECT COUNT(*) FROM customers c WHERE c.shopify_id IS NOT NULL AND (c.user_id = u.id OR c.store_id IN (SELECT store_id FROM user_stores WHERE user_id = u.id))) as customers_count,
        (SELECT COALESCE(SUM(CAST(total_price AS DECIMAL)), 0) FROM orders o WHERE o.shopify_id IS NOT NULL AND o.status IN ('paid', 'completed', 'partially_paid') AND (o.user_id = u.id OR o.store_id IN (SELECT store_id FROM user_stores WHERE user_id = u.id))) as total_sales
    FROM first_user u
)
SELECT 
    '/api/dashboard/stats' as endpoint,
    user_id,
    products_count as total_products,
    orders_count as total_orders,
    customers_count as total_customers,
    total_sales,
    CASE 
        WHEN orders_count > 0 THEN total_sales / orders_count 
        ELSE 0 
    END as avg_order_value,
    CASE 
        WHEN products_count > 0 AND orders_count > 0 AND customers_count > 0 THEN 'SUCCESS ✅'
        ELSE 'FAILED ❌'
    END as test_result
FROM user_data;

-- 2. اختبار getAccessibleStoreIds function
SELECT 'اختبار getAccessibleStoreIds Function' as test_name;

WITH first_user AS (
    SELECT id FROM users ORDER BY created_at LIMIT 1
)
SELECT 
    'getAccessibleStoreIds()' as function_name,
    u.id as user_id,
    array_agg(us.store_id) as accessible_store_ids,
    COUNT(us.store_id) as store_count,
    CASE 
        WHEN COUNT(us.store_id) > 0 THEN 'SUCCESS ✅'
        ELSE 'FAILED ❌'
    END as test_result
FROM first_user u
LEFT JOIN user_stores us ON us.user_id = u.id
GROUP BY u.id;

-- 3. اختبار Products API
SELECT 'اختبار Products API' as test_name;

WITH first_user AS (
    SELECT id FROM users ORDER BY created_at LIMIT 1
),
accessible_stores AS (
    SELECT us.store_id 
    FROM user_stores us, first_user u 
    WHERE us.user_id = u.id
),
products_data AS (
    SELECT p.*
    FROM products p, first_user u
    WHERE p.shopify_id IS NOT NULL 
      AND (p.user_id = u.id OR p.store_id IN (SELECT store_id FROM accessible_stores))
)
SELECT 
    '/api/dashboard/products' as endpoint,
    COUNT(*) as products_found,
    json_agg(
        json_build_object(
            'id', id,
            'title', title,
            'price', price,
            'cost_price', cost_price,
            'shopify_id', shopify_id
        )
    ) as sample_products,
    CASE 
        WHEN COUNT(*) > 0 THEN 'SUCCESS ✅'
        ELSE 'FAILED ❌'
    END as test_result
FROM products_data;

-- 4. اختبار Orders API
SELECT 'اختبار Orders API' as test_name;

WITH first_user AS (
    SELECT id FROM users ORDER BY created_at LIMIT 1
),
accessible_stores AS (
    SELECT us.store_id 
    FROM user_stores us, first_user u 
    WHERE us.user_id = u.id
),
orders_data AS (
    SELECT o.*
    FROM orders o, first_user u
    WHERE o.shopify_id IS NOT NULL 
      AND (o.user_id = u.id OR o.store_id IN (SELECT store_id FROM accessible_stores))
)
SELECT 
    '/api/dashboard/orders' as endpoint,
    COUNT(*) as orders_found,
    json_agg(
        json_build_object(
            'id', id,
            'order_number', order_number,
            'total_price', total_price,
            'status', status,
            'shopify_id', shopify_id
        )
    ) as sample_orders,
    CASE 
        WHEN COUNT(*) > 0 THEN 'SUCCESS ✅'
        ELSE 'FAILED ❌'
    END as test_result
FROM orders_data
LIMIT 5;

-- 5. اختبار Customers API
SELECT 'اختبار Customers API' as test_name;

WITH first_user AS (
    SELECT id FROM users ORDER BY created_at LIMIT 1
),
accessible_stores AS (
    SELECT us.store_id 
    FROM user_stores us, first_user u 
    WHERE us.user_id = u.id
),
customers_data AS (
    SELECT c.*
    FROM customers c, first_user u
    WHERE c.shopify_id IS NOT NULL 
      AND (c.user_id = u.id OR c.store_id IN (SELECT store_id FROM accessible_stores))
)
SELECT 
    '/api/dashboard/customers' as endpoint,
    COUNT(*) as customers_found,
    json_agg(
        json_build_object(
            'id', id,
            'name', name,
            'email', email,
            'total_spent', total_spent,
            'shopify_id', shopify_id
        )
    ) as sample_customers,
    CASE 
        WHEN COUNT(*) > 0 THEN 'SUCCESS ✅'
        ELSE 'FAILED ❌'
    END as test_result
FROM customers_data;

-- 6. اختبار شامل للنظام
SELECT 'اختبار شامل للنظام' as test_name;

WITH system_check AS (
    SELECT 
        (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as products_ready,
        (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as orders_ready,
        (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as customers_ready,
        (SELECT COUNT(*) FROM user_stores) as user_store_connections,
        (SELECT COUNT(*) FROM permissions WHERE can_view_products = true) as users_with_permissions
)
SELECT 
    'System Health Check' as check_name,
    products_ready,
    orders_ready,
    customers_ready,
    user_store_connections,
    users_with_permissions,
    CASE 
        WHEN products_ready > 0 AND orders_ready > 0 AND customers_ready > 0 AND user_store_connections > 0 AND users_with_permissions > 0 
        THEN 'SYSTEM READY ✅ - البيانات جاهزة للعرض في الفرونت إند'
        ELSE 'SYSTEM NOT READY ❌ - يحتاج إصلاح إضافي'
    END as system_status
FROM system_check;

-- 7. تقرير نهائي مفصل
SELECT 'التقرير النهائي' as section;

SELECT 
    'تفاصيل البيانات الجاهزة للـ API' as report_type,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as "منتجات جاهزة",
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as "طلبات جاهزة", 
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as "عملاء جاهزون",
    (SELECT COUNT(*) FROM users) as "إجمالي المستخدمين",
    (SELECT COUNT(*) FROM stores) as "إجمالي المتاجر",
    (SELECT COUNT(*) FROM user_stores) as "اتصالات المتاجر",
    (SELECT COUNT(*) FROM shopify_tokens) as "اتصالات شوبيفاي";

-- عرض عينة من البيانات الفعلية
SELECT 'عينة من المنتجات الجاهزة:' as sample_type;
SELECT id, title, price, cost_price, user_id, store_id, shopify_id
FROM products 
WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL
ORDER BY created_at DESC 
LIMIT 3;

SELECT 'عينة من الطلبات الجاهزة:' as sample_type;
SELECT id, order_number, total_price, status, customer_name, user_id, store_id, shopify_id
FROM orders 
WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL
ORDER BY created_at DESC 
LIMIT 3;

SELECT 'عينة من العملاء الجاهزين:' as sample_type;
SELECT id, name, email, total_spent, user_id, store_id, shopify_id
FROM customers 
WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL
ORDER BY created_at DESC 
LIMIT 3;