-- ====================================
-- فحص حالة اتصال Shopify
-- Check Shopify Connection Status
-- ====================================

-- 1. فحص اتصالات Shopify
SELECT 'فحص اتصالات Shopify الموجودة' as section;

SELECT 
    id,
    user_id,
    shop,
    store_id,
    access_token IS NOT NULL as has_token,
    LENGTH(access_token) as token_length,
    created_at,
    updated_at,
    CASE 
        WHEN access_token IS NULL THEN 'مفيش Access Token ❌'
        WHEN LENGTH(access_token) < 10 THEN 'Token قصير جداً ❌'
        WHEN shop IS NULL OR shop = '' THEN 'مفيش Shop Domain ❌'
        WHEN shop NOT LIKE '%.myshopify.com' THEN 'Shop Domain مش صحيح ❌'
        ELSE 'الاتصال يبدو صحيح ✅'
    END as connection_status
FROM shopify_tokens
ORDER BY updated_at DESC;

-- 2. فحص البيانات الموجودة
SELECT 'فحص البيانات في قاعدة البيانات' as section;

SELECT 
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) as shopify_products,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL) as shopify_orders,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL) as shopify_customers,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND user_id = 'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid) as linked_products,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND user_id = 'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid) as linked_orders,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND user_id = 'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid) as linked_customers;

-- 3. فحص المستخدم والصلاحيات
SELECT 'فحص المستخدم والصلاحيات' as section;

SELECT 
    u.id,
    u.email,
    u.role,
    p.can_manage_settings,
    (SELECT COUNT(*) FROM shopify_tokens st WHERE st.user_id = u.id) as shopify_connections
FROM users u
LEFT JOIN permissions p ON p.user_id = u.id
WHERE u.id = 'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid;

-- 4. عرض تفاصيل الاتصال (مخفي جزئياً للأمان)
SELECT 'تفاصيل الاتصال' as section;

SELECT 
    shop as shopify_domain,
    CASE 
        WHEN access_token IS NOT NULL THEN CONCAT(LEFT(access_token, 8), '...', RIGHT(access_token, 4))
        ELSE 'NULL'
    END as token_preview,
    user_id,
    store_id,
    updated_at as last_updated
FROM shopify_tokens
WHERE access_token IS NOT NULL
ORDER BY updated_at DESC
LIMIT 1;

-- 5. التشخيص والتوصيات
SELECT 'التشخيص والتوصيات' as section;

WITH diagnosis AS (
    SELECT 
        (SELECT COUNT(*) FROM shopify_tokens WHERE access_token IS NOT NULL AND shop LIKE '%.myshopify.com') as valid_connections,
        (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) as has_products,
        (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL) as has_orders,
        (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL) as has_customers
)
SELECT 
    valid_connections,
    has_products,
    has_orders,
    has_customers,
    CASE 
        WHEN valid_connections = 0 THEN 'يحتاج إعادة ربط Shopify ❌'
        WHEN has_products = 0 AND has_orders = 0 AND has_customers = 0 THEN 'يحتاج تشغيل Sync أول مرة 🔄'
        WHEN has_products > 0 AND has_orders > 0 AND has_customers > 0 THEN 'البيانات موجودة - مشكلة في العرض 🔍'
        ELSE 'يحتاج فحص إضافي ⚠️'
    END as diagnosis,
    CASE 
        WHEN valid_connections = 0 THEN 'اذهب إلى Settings وأعد ربط Shopify'
        WHEN has_products = 0 THEN 'اضغط على Sync Shopify Data'
        ELSE 'فحص Console في المتصفح للأخطاء'
    END as recommendation
FROM diagnosis;

SELECT 'فحص حالة Shopify مكتمل! 🔍' as final_message;