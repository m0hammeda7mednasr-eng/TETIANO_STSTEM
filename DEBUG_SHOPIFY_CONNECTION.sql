-- ====================================
-- فحص اتصال Shopify والمشاكل المحتملة
-- Debug Shopify Connection Issues
-- ====================================

-- 1. فحص اتصالات Shopify الموجودة
SELECT 'فحص اتصالات Shopify' as section;

SELECT 
    'تفاصيل اتصال Shopify' as check_type,
    id,
    user_id,
    shop,
    store_id,
    access_token IS NOT NULL as has_access_token,
    LENGTH(access_token) as token_length,
    created_at,
    updated_at,
    CASE 
        WHEN access_token IS NULL THEN 'مفيش Access Token ❌'
        WHEN LENGTH(access_token) < 10 THEN 'Access Token قصير جداً ❌'
        WHEN shop IS NULL OR shop = '' THEN 'مفيش Shop Domain ❌'
        WHEN updated_at < NOW() - INTERVAL '30 days' THEN 'Token قديم جداً ⚠️'
        ELSE 'Token يبدو صحيح ✅'
    END as token_status
FROM shopify_tokens
ORDER BY updated_at DESC;

-- 2. فحص المستخدمين وصلاحياتهم
SELECT 'فحص المستخدمين وصلاحياتهم' as section;

SELECT 
    'تفاصيل المستخدمين' as check_type,
    u.id,
    u.email,
    u.role,
    (SELECT COUNT(*) FROM shopify_tokens st WHERE st.user_id = u.id) as shopify_connections,
    (SELECT COUNT(*) FROM permissions p WHERE p.user_id = u.id AND p.can_manage_settings = true) as can_sync,
    CASE 
        WHEN (SELECT COUNT(*) FROM shopify_tokens st WHERE st.user_id = u.id) = 0 THEN 'مفيش اتصال Shopify ❌'
        WHEN (SELECT COUNT(*) FROM permissions p WHERE p.user_id = u.id AND p.can_manage_settings = true) = 0 THEN 'مفيش صلاحية Sync ❌'
        ELSE 'جاهز للـ Sync ✅'
    END as sync_readiness
FROM users u
ORDER BY u.created_at;

-- 3. فحص البيانات الموجودة قبل الـ Sync
SELECT 'فحص البيانات الموجودة' as section;

SELECT 
    'البيانات قبل الـ Sync' as check_type,
    (SELECT COUNT(*) FROM products) as total_products,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) as shopify_products,
    (SELECT COUNT(*) FROM orders) as total_orders,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL) as shopify_orders,
    (SELECT COUNT(*) FROM customers) as total_customers,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL) as shopify_customers;

-- 4. فحص آخر محاولة sync
SELECT 'فحص آخر محاولة Sync' as section;

-- فحص آخر البيانات المضافة/المحدثة
SELECT 
    'آخر نشاط في البيانات' as check_type,
    (SELECT MAX(created_at) FROM products WHERE shopify_id IS NOT NULL) as last_product_created,
    (SELECT MAX(updated_at) FROM products WHERE shopify_id IS NOT NULL) as last_product_updated,
    (SELECT MAX(created_at) FROM orders WHERE shopify_id IS NOT NULL) as last_order_created,
    (SELECT MAX(updated_at) FROM orders WHERE shopify_id IS NOT NULL) as last_order_updated,
    (SELECT MAX(created_at) FROM customers WHERE shopify_id IS NOT NULL) as last_customer_created,
    (SELECT MAX(updated_at) FROM customers WHERE shopify_id IS NOT NULL) as last_customer_updated;

-- 5. تشخيص المشاكل المحتملة
SELECT 'تشخيص المشاكل المحتملة' as section;

WITH diagnosis AS (
    SELECT 
        (SELECT COUNT(*) FROM shopify_tokens WHERE access_token IS NOT NULL) as valid_tokens,
        (SELECT COUNT(*) FROM shopify_tokens WHERE shop IS NOT NULL AND shop != '') as valid_shops,
        (SELECT COUNT(*) FROM users WHERE role = 'admin') as admin_users,
        (SELECT COUNT(*) FROM permissions WHERE can_manage_settings = true) as users_can_sync,
        (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) as existing_shopify_data
)
SELECT 
    'تشخيص المشكلة' as diagnosis_type,
    valid_tokens,
    valid_shops,
    admin_users,
    users_can_sync,
    existing_shopify_data,
    CASE 
        WHEN valid_tokens = 0 THEN 'مفيش Access Tokens صحيحة - يحتاج إعادة ربط Shopify ❌'
        WHEN valid_shops = 0 THEN 'مفيش Shop Domains صحيحة - يحتاج إعادة ربط Shopify ❌'
        WHEN admin_users = 0 THEN 'مفيش Admin Users - يحتاج إنشاء Admin ❌'
        WHEN users_can_sync = 0 THEN 'مفيش صلاحيات Sync - يحتاج إضافة صلاحيات ❌'
        WHEN existing_shopify_data > 0 THEN 'في بيانات قديمة - ممكن تكون مشكلة في API ⚠️'
        ELSE 'الإعدادات تبدو صحيحة - مشكلة في Shopify API أو Network 🔍'
    END as problem_diagnosis,
    CASE 
        WHEN valid_tokens = 0 OR valid_shops = 0 THEN 'اذهب إلى Settings وأعد ربط Shopify'
        WHEN admin_users = 0 THEN 'أنشئ مستخدم Admin جديد'
        WHEN users_can_sync = 0 THEN 'أضف صلاحية can_manage_settings'
        ELSE 'فحص Shopify API وحالة الشبكة'
    END as recommended_solution
FROM diagnosis;

-- 6. عرض تفاصيل الاتصال للفحص اليدوي
SELECT 'تفاصيل الاتصال للفحص اليدوي' as section;

SELECT 
    'معلومات الاتصال' as info_type,
    shop as shopify_domain,
    CASE 
        WHEN access_token IS NOT NULL THEN CONCAT(LEFT(access_token, 10), '...', RIGHT(access_token, 5))
        ELSE 'NULL'
    END as token_preview,
    user_id,
    store_id,
    updated_at as last_updated
FROM shopify_tokens
WHERE access_token IS NOT NULL
ORDER BY updated_at DESC
LIMIT 1;

-- 7. اختبار صحة Shop Domain
SELECT 'اختبار صحة Shop Domain' as section;

SELECT 
    'فحص Shop Domain' as test_type,
    shop,
    CASE 
        WHEN shop IS NULL THEN 'Shop Domain فاضي ❌'
        WHEN shop NOT LIKE '%.myshopify.com' THEN 'Shop Domain مش صحيح ❌'
        WHEN LENGTH(shop) < 15 THEN 'Shop Domain قصير جداً ❌'
        ELSE 'Shop Domain يبدو صحيح ✅'
    END as domain_status,
    CASE 
        WHEN shop IS NOT NULL AND shop LIKE '%.myshopify.com' THEN 
            CONCAT('https://', shop, '/admin/api/2024-01/products.json?limit=1')
        ELSE 'Cannot construct API URL'
    END as test_api_url
FROM shopify_tokens
WHERE shop IS NOT NULL
ORDER BY updated_at DESC
LIMIT 1;

-- 8. التوصيات النهائية
SELECT 'التوصيات النهائية' as section;

SELECT 
    'خطة الإصلاح' as plan_type,
    'الخطوة 1: فحص اتصال Shopify في Settings' as step1,
    'الخطوة 2: إعادة ربط Shopify إذا كان الاتصال مقطوع' as step2,
    'الخطوة 3: التأكد من صحة Shop Domain وAccess Token' as step3,
    'الخطوة 4: فحص صلاحيات المستخدم للـ Sync' as step4,
    'الخطوة 5: اختبار API مباشرة إذا كان كل شيء صحيح' as step5;

SELECT 'فحص اتصال Shopify مكتمل! 🔍' as final_message;