-- ====================================
-- اختبار الإعداد المحلي
-- Test Local Setup
-- ====================================

-- 1. فحص البيانات الموجودة
SELECT 'فحص البيانات الموجودة' as section;

SELECT 
    'إحصائيات البيانات' as data_type,
    (SELECT COUNT(*) FROM products) as total_products,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) as shopify_products,
    (SELECT COUNT(*) FROM orders) as total_orders,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL) as shopify_orders,
    (SELECT COUNT(*) FROM customers) as total_customers,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL) as shopify_customers;

-- 2. فحص المستخدمين
SELECT 'فحص المستخدمين' as section;

SELECT 
    id,
    email,
    role,
    created_at
FROM users
ORDER BY created_at DESC
LIMIT 5;

-- 3. فحص اتصالات Shopify
SELECT 'فحص اتصالات Shopify' as section;

SELECT 
    id,
    user_id,
    shop,
    store_id,
    access_token IS NOT NULL as has_token,
    LENGTH(access_token) as token_length,
    created_at,
    updated_at
FROM shopify_tokens
ORDER BY updated_at DESC;

-- 4. فحص الصلاحيات
SELECT 'فحص الصلاحيات' as section;

SELECT 
    p.user_id,
    u.email,
    p.can_view_products,
    p.can_edit_products,
    p.can_view_orders,
    p.can_edit_orders,
    p.can_view_customers,
    p.can_edit_customers,
    p.can_manage_settings
FROM permissions p
JOIN users u ON u.id = p.user_id;

-- 5. فحص user_stores
SELECT 'فحص user_stores' as section;

SELECT 
    us.user_id,
    u.email,
    us.store_id,
    s.name as store_name
FROM user_stores us
JOIN users u ON u.id = us.user_id
JOIN stores s ON s.id = us.store_id;

-- 6. عينة من البيانات المربوطة
SELECT 'عينة من المنتجات:' as sample_data;
SELECT id, title, price, shopify_id, user_id, store_id, created_at
FROM products 
WHERE shopify_id IS NOT NULL
ORDER BY created_at DESC 
LIMIT 3;

SELECT 'عينة من الطلبات:' as sample_data;
SELECT id, order_number, total_price, status, shopify_id, user_id, store_id, created_at
FROM orders 
WHERE shopify_id IS NOT NULL
ORDER BY created_at DESC 
LIMIT 3;

-- 7. محاكاة Dashboard Stats (بدون user filter)
SELECT 'محاكاة Dashboard Stats (بدون user filter)' as simulation;

WITH stats AS (
    SELECT 
        (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) as total_products,
        (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL) as total_orders,
        (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL) as total_customers,
        (SELECT COALESCE(SUM(CAST(total_price AS DECIMAL)), 0) FROM orders WHERE shopify_id IS NOT NULL) as total_sales
)
SELECT 
    total_products,
    total_orders,
    total_customers,
    total_sales,
    CASE 
        WHEN total_products > 0 AND total_orders > 0 AND total_customers > 0 THEN 'البيانات موجودة ✅'
        ELSE 'مفيش بيانات ❌'
    END as data_status
FROM stats;

SELECT 'اختبار الإعداد المحلي مكتمل! 🔍' as final_message;