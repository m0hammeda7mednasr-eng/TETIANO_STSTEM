-- ====================================
-- فحص سريع لقاعدة البيانات
-- Quick Database Check
-- ====================================

-- هذا الملف للتأكد من حالة البيانات في Supabase

-- 1. فحص البيانات الأساسية
SELECT 'البيانات الأساسية' as section;

SELECT 
    (SELECT COUNT(*) FROM products) as total_products,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) as shopify_products,
    (SELECT COUNT(*) FROM orders) as total_orders,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL) as shopify_orders,
    (SELECT COUNT(*) FROM customers) as total_customers,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL) as shopify_customers;

-- 2. فحص اتصال Shopify
SELECT 'اتصال Shopify' as section;

SELECT 
    shop,
    access_token IS NOT NULL as has_token,
    LENGTH(access_token) as token_length,
    user_id,
    store_id,
    updated_at
FROM shopify_tokens
ORDER BY updated_at DESC
LIMIT 1;

-- 3. فحص المستخدم الأساسي
SELECT 'المستخدم الأساسي' as section;

SELECT 
    u.id,
    u.email,
    u.role,
    p.can_manage_settings,
    (SELECT COUNT(*) FROM user_stores us WHERE us.user_id = u.id) as connected_stores
FROM users u
LEFT JOIN permissions p ON p.user_id = u.id
WHERE u.email = 'midoooahmed28@gmail.com';

-- 4. فحص ربط البيانات
SELECT 'ربط البيانات' as section;

SELECT 
    'المنتجات المربوطة' as data_type,
    COUNT(*) as count,
    COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as with_user_id,
    COUNT(CASE WHEN store_id IS NOT NULL THEN 1 END) as with_store_id
FROM products 
WHERE shopify_id IS NOT NULL

UNION ALL

SELECT 
    'الطلبات المربوطة' as data_type,
    COUNT(*) as count,
    COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as with_user_id,
    COUNT(CASE WHEN store_id IS NOT NULL THEN 1 END) as with_store_id
FROM orders 
WHERE shopify_id IS NOT NULL

UNION ALL

SELECT 
    'العملاء المربوطون' as data_type,
    COUNT(*) as count,
    COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as with_user_id,
    COUNT(CASE WHEN store_id IS NOT NULL THEN 1 END) as with_store_id
FROM customers 
WHERE shopify_id IS NOT NULL;

-- 5. محاكاة Dashboard API
SELECT 'محاكاة Dashboard API' as section;

-- محاكاة للمستخدم الأساسي
WITH user_stats AS (
    SELECT 
        (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND user_id = 'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid) as products,
        (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND user_id = 'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid) as orders,
        (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND user_id = 'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid) as customers
)
SELECT 
    'للمستخدم الأساسي' as api_type,
    products,
    orders,
    customers,
    CASE 
        WHEN products > 0 AND orders > 0 AND customers > 0 THEN 'سيعرض البيانات ✅'
        ELSE 'لن يعرض البيانات ❌'
    END as result
FROM user_stats

UNION ALL

-- محاكاة بدون user filter
SELECT 
    'بدون user filter' as api_type,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) as products,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL) as orders,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL) as customers,
    CASE 
        WHEN (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) > 0 THEN 'البيانات موجودة ✅'
        ELSE 'مفيش بيانات ❌'
    END as result;

-- 6. التشخيص النهائي
SELECT 'التشخيص النهائي' as section;

WITH diagnosis AS (
    SELECT 
        (SELECT COUNT(*) FROM shopify_tokens WHERE access_token IS NOT NULL) as has_shopify_connection,
        (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) as has_products,
        (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL) as products_linked,
        (SELECT COUNT(*) FROM users WHERE email = 'midoooahmed28@gmail.com') as has_main_user
)
SELECT 
    has_shopify_connection,
    has_products,
    products_linked,
    has_main_user,
    CASE 
        WHEN has_shopify_connection = 0 THEN 'مفيش اتصال Shopify - يحتاج إعادة ربط'
        WHEN has_products = 0 THEN 'مفيش بيانات Shopify - يحتاج sync'
        WHEN products_linked = 0 THEN 'البيانات مش مربوطة - يحتاج EMERGENCY_DATA_LINK_FIX'
        WHEN has_main_user = 0 THEN 'مفيش مستخدم أساسي - يحتاج إنشاء'
        ELSE 'كل شيء صحيح - المشكلة في مكان تاني'
    END as diagnosis,
    CASE 
        WHEN has_shopify_connection = 0 THEN 'اذهب إلى Settings وأعد ربط Shopify'
        WHEN has_products = 0 THEN 'اضغط على Sync Shopify Data'
        WHEN products_linked = 0 THEN 'شغل EMERGENCY_DATA_LINK_FIX.sql'
        ELSE 'فحص Railway Logs للتفاصيل'
    END as solution
FROM diagnosis;

SELECT 'فحص قاعدة البيانات مكتمل! 🔍' as final_message;