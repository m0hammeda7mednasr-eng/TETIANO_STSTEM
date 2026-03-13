-- ====================================
-- فحص مشكلة Backend API
-- Debug Backend API Issue
-- ====================================

-- 1. فحص البيانات الفعلية في قاعدة البيانات
SELECT 'فحص البيانات الفعلية' as القسم;

-- فحص المنتجات
SELECT 
    'المنتجات - التفاصيل الكاملة' as النوع,
    id,
    shopify_id,
    title,
    price,
    user_id,
    store_id,
    created_at,
    updated_at
FROM products 
WHERE shopify_id IS NOT NULL
ORDER BY created_at DESC;

-- فحص الطلبات
SELECT 
    'الطلبات - التفاصيل الكاملة' as النوع,
    id,
    shopify_id,
    order_number,
    total_price,
    status,
    user_id,
    store_id,
    created_at,
    updated_at
FROM orders 
WHERE shopify_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;

-- فحص العملاء
SELECT 
    'العملاء - التفاصيل الكاملة' as النوع,
    id,
    shopify_id,
    name,
    email,
    user_id,
    store_id,
    created_at,
    updated_at
FROM customers 
WHERE shopify_id IS NOT NULL
ORDER BY created_at DESC;

-- 2. فحص المستخدمين والصلاحيات
SELECT 'فحص المستخدمين والصلاحيات' as القسم;

SELECT 
    'المستخدمين' as النوع,
    u.id,
    u.email,
    u.role,
    u.created_at
FROM users u
ORDER BY u.created_at;

SELECT 
    'الصلاحيات' as النوع,
    p.user_id,
    p.can_view_products,
    p.can_view_orders,
    p.can_view_customers,
    u.email
FROM permissions p
JOIN users u ON p.user_id = u.id;

-- 3. فحص ربط المستخدمين بالمتاجر
SELECT 
    'ربط المستخدمين بالمتاجر' as النوع,
    us.user_id,
    us.store_id,
    u.email,
    s.name as store_name
FROM user_stores us
JOIN users u ON us.user_id = u.id
LEFT JOIN stores s ON us.store_id = s.id;

-- 4. فحص اتصالات Shopify
SELECT 
    'اتصالات Shopify' as النوع,
    st.id,
    st.user_id,
    st.shop,
    st.store_id,
    u.email,
    st.created_at
FROM shopify_tokens st
JOIN users u ON st.user_id = u.id;

-- 5. محاكاة استعلام Dashboard API
SELECT 'محاكاة Dashboard Stats API' as القسم;

-- محاكاة /api/dashboard/stats
WITH stats_calculation AS (
    SELECT 
        COUNT(DISTINCT p.id) as total_products,
        COUNT(DISTINCT o.id) as total_orders,
        COUNT(DISTINCT c.id) as total_customers,
        COALESCE(SUM(CASE WHEN o.status IN ('paid', 'completed') THEN o.total_price ELSE 0 END), 0) as total_sales,
        CASE 
            WHEN COUNT(DISTINCT o.id) > 0 THEN 
                COALESCE(SUM(CASE WHEN o.status IN ('paid', 'completed') THEN o.total_price ELSE 0 END), 0) / COUNT(DISTINCT o.id)
            ELSE 0 
        END as avg_order_value
    FROM products p
    FULL OUTER JOIN orders o ON true
    FULL OUTER JOIN customers c ON true
    WHERE p.shopify_id IS NOT NULL 
       OR o.shopify_id IS NOT NULL 
       OR c.shopify_id IS NOT NULL
)
SELECT 
    'Dashboard Stats' as api_endpoint,
    total_products,
    total_orders,
    total_customers,
    total_sales,
    avg_order_value
FROM stats_calculation;

-- 6. محاكاة استعلام Products API
SELECT 'محاكاة Products API' as القسم;

SELECT 
    'Products API Response' as api_endpoint,
    COUNT(*) as total_count,
    json_agg(
        json_build_object(
            'id', id,
            'title', title,
            'price', price,
            'shopify_id', shopify_id,
            'user_id', user_id,
            'store_id', store_id
        )
    ) as sample_data
FROM (
    SELECT * FROM products 
    WHERE shopify_id IS NOT NULL 
    ORDER BY created_at DESC 
    LIMIT 3
) sample_products;

-- 7. محاكاة استعلام Orders API
SELECT 'محاكاة Orders API' as القسم;

SELECT 
    'Orders API Response' as api_endpoint,
    COUNT(*) as total_count,
    json_agg(
        json_build_object(
            'id', id,
            'order_number', order_number,
            'total_price', total_price,
            'status', status,
            'shopify_id', shopify_id,
            'user_id', user_id,
            'store_id', store_id
        )
    ) as sample_data
FROM (
    SELECT * FROM orders 
    WHERE shopify_id IS NOT NULL 
    ORDER BY created_at DESC 
    LIMIT 3
) sample_orders;

-- 8. فحص مشاكل محتملة في البيانات
SELECT 'فحص مشاكل محتملة' as القسم;

-- البحث عن بيانات بدون user_id
SELECT 
    'بيانات بدون user_id' as المشكلة,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND user_id IS NULL) as منتجات,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND user_id IS NULL) as طلبات,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND user_id IS NULL) as عملاء;

-- البحث عن بيانات بدون store_id
SELECT 
    'بيانات بدون store_id' as المشكلة,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND store_id IS NULL) as منتجات,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND store_id IS NULL) as طلبات,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND store_id IS NULL) as عملاء;

-- فحص المستخدمين بدون صلاحيات
SELECT 
    'مستخدمين بدون صلاحيات' as المشكلة,
    COUNT(*) as العدد
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.user_id = u.id);

-- فحص المستخدمين بدون متاجر
SELECT 
    'مستخدمين بدون متاجر' as المشكلة,
    COUNT(*) as العدد
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM user_stores us WHERE us.user_id = u.id);

-- 9. التشخيص النهائي
SELECT 'التشخيص النهائي' as القسم;

SELECT 
    'تقرير شامل' as النوع,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) as منتجات_شوبيفاي,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL) as طلبات_شوبيفاي,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL) as عملاء_شوبيفاي,
    (SELECT COUNT(*) FROM users) as إجمالي_المستخدمين,
    (SELECT COUNT(*) FROM stores) as إجمالي_المتاجر,
    (SELECT COUNT(*) FROM user_stores) as اتصالات_المتاجر,
    (SELECT COUNT(*) FROM permissions) as سجلات_الصلاحيات,
    (SELECT COUNT(*) FROM shopify_tokens) as اتصالات_شوبيفاي;