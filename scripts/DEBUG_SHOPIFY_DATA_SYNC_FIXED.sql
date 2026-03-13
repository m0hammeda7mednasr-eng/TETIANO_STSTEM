-- ====================================
-- تشخيص مشكلة عدم ظهور بيانات Shopify - نسخة محدثة
-- Debug Shopify Data Sync Issues - Fixed Version
-- ====================================

-- 1. فحص اتصالات Shopify
SELECT 'Shopify Connections Check' as section;

SELECT 
    'Shopify Tokens:' as info,
    COUNT(*) as total_tokens,
    COUNT(CASE WHEN access_token IS NOT NULL THEN 1 END) as tokens_with_access,
    COUNT(CASE WHEN store_id IS NOT NULL THEN 1 END) as tokens_with_store_id
FROM shopify_tokens;

-- عرض تفاصيل الاتصالات
SELECT 
    id,
    user_id,
    shop,
    store_id,
    created_at,
    updated_at,
    CASE WHEN access_token IS NOT NULL THEN 'Yes' ELSE 'No' END as has_access_token
FROM shopify_tokens
ORDER BY created_at DESC;

-- 2. فحص المتاجر
SELECT 'Stores Check' as section;

SELECT 
    'Stores:' as info,
    COUNT(*) as total_stores
FROM stores;

-- عرض تفاصيل المتاجر
SELECT 
    id,
    name,
    shopify_domain,
    created_by,
    created_at,
    updated_at
FROM stores
ORDER BY created_at DESC;

-- 3. فحص ربط المستخدمين بالمتاجر
SELECT 'User-Store Connections Check' as section;

SELECT 
    'User-Store Links:' as info,
    COUNT(*) as total_connections,
    COUNT(DISTINCT user_id) as users_with_store_access,
    COUNT(DISTINCT store_id) as stores_with_users
FROM user_stores;

-- عرض تفاصيل الربط
SELECT 
    us.user_id,
    u.email as user_email,
    us.store_id,
    s.name as store_name
FROM user_stores us
JOIN users u ON us.user_id = u.id
LEFT JOIN stores s ON us.store_id = s.id
ORDER BY u.email;

-- 4. فحص البيانات المستوردة من Shopify
SELECT 'Imported Data Check' as section;

-- فحص المنتجات
SELECT 
    'Products:' as info,
    COUNT(*) as total_products,
    COUNT(CASE WHEN shopify_id IS NOT NULL THEN 1 END) as products_from_shopify,
    COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as products_with_user,
    COUNT(CASE WHEN store_id IS NOT NULL THEN 1 END) as products_with_store,
    COUNT(CASE WHEN price IS NOT NULL AND price != '0' THEN 1 END) as products_with_price
FROM products;

-- فحص الطلبات
SELECT 
    'Orders:' as info,
    COUNT(*) as total_orders,
    COUNT(CASE WHEN shopify_id IS NOT NULL THEN 1 END) as orders_from_shopify,
    COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as orders_with_user,
    COUNT(CASE WHEN store_id IS NOT NULL THEN 1 END) as orders_with_store,
    COUNT(CASE WHEN financial_status IS NOT NULL THEN 1 END) as orders_with_financial_status,
    COUNT(CASE WHEN status IS NOT NULL THEN 1 END) as orders_with_status
FROM orders;

-- فحص العملاء
SELECT 
    'Customers:' as info,
    COUNT(*) as total_customers,
    COUNT(CASE WHEN shopify_id IS NOT NULL THEN 1 END) as customers_from_shopify,
    COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as customers_with_user,
    COUNT(CASE WHEN store_id IS NOT NULL THEN 1 END) as customers_with_store,
    COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END) as customers_with_email
FROM customers;

-- 5. عرض عينة من البيانات المستوردة
SELECT 'Sample Data' as section;

-- عينة من المنتجات
SELECT 'Sample Products:' as info;
SELECT 
    id,
    shopify_id,
    title,
    price,
    user_id,
    store_id,
    created_at
FROM products 
WHERE shopify_id IS NOT NULL
ORDER BY created_at DESC 
LIMIT 5;

-- عينة من الطلبات
SELECT 'Sample Orders:' as info;
SELECT 
    id,
    shopify_id,
    order_number,
    total_price,
    financial_status,
    status,
    user_id,
    store_id,
    created_at
FROM orders 
WHERE shopify_id IS NOT NULL
ORDER BY created_at DESC 
LIMIT 5;

-- عينة من العملاء
SELECT 'Sample Customers:' as info;
SELECT 
    id,
    shopify_id,
    name,
    email,
    user_id,
    store_id,
    created_at
FROM customers 
WHERE shopify_id IS NOT NULL
ORDER BY created_at DESC 
LIMIT 5;

-- 6. فحص مشاكل محتملة
SELECT 'Potential Issues Check' as section;

-- البحث عن بيانات بدون user_id
SELECT 
    'Data without user_id:' as issue,
    (SELECT COUNT(*) FROM products WHERE user_id IS NULL) as products_no_user,
    (SELECT COUNT(*) FROM orders WHERE user_id IS NULL) as orders_no_user,
    (SELECT COUNT(*) FROM customers WHERE user_id IS NULL) as customers_no_user;

-- البحث عن بيانات بدون store_id
SELECT 
    'Data without store_id:' as issue,
    (SELECT COUNT(*) FROM products WHERE store_id IS NULL) as products_no_store,
    (SELECT COUNT(*) FROM orders WHERE store_id IS NULL) as orders_no_store,
    (SELECT COUNT(*) FROM customers WHERE store_id IS NULL) as customers_no_store;

-- البحث عن مستخدمين بدون اتصال متجر
SELECT 
    'Users without store access:' as issue,
    COUNT(*) as users_count
FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM user_stores us WHERE us.user_id = u.id
);

-- 7. فحص RLS والصلاحيات
SELECT 'RLS and Permissions Check' as section;

-- فحص جدول الصلاحيات
SELECT 
    'Permissions:' as info,
    COUNT(*) as total_permission_records,
    COUNT(CASE WHEN can_view_products = true THEN 1 END) as can_view_products,
    COUNT(CASE WHEN can_view_orders = true THEN 1 END) as can_view_orders,
    COUNT(CASE WHEN can_view_customers = true THEN 1 END) as can_view_customers
FROM permissions;

-- فحص حالة RLS
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('products', 'orders', 'customers', 'stores', 'user_stores')
ORDER BY tablename;

-- 8. فحص أعمدة الجداول الموجودة
SELECT 'Table Columns Check' as section;

-- فحص أعمدة جدول products
SELECT 
    'Products table columns:' as info,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'products' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- فحص أعمدة جدول orders
SELECT 
    'Orders table columns:' as info,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- فحص أعمدة جدول stores
SELECT 
    'Stores table columns:' as info,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'stores' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- 9. إصلاح المشاكل الأساسية
SELECT 'Basic Fixes' as section;

-- إنشاء متجر افتراضي إذا لم يكن موجوداً
DO $$
DECLARE
    store_count INTEGER;
    default_store_id UUID;
    first_user_id UUID;
BEGIN
    SELECT COUNT(*) INTO store_count FROM stores;
    
    IF store_count = 0 THEN
        -- الحصول على أول مستخدم
        SELECT id INTO first_user_id FROM users ORDER BY created_at LIMIT 1;
        
        -- إنشاء متجر افتراضي
        INSERT INTO stores (name, shopify_domain, created_by, created_at, updated_at)
        VALUES ('المتجر الرئيسي', 'main-store.myshopify.com', first_user_id, NOW(), NOW())
        RETURNING id INTO default_store_id;
        
        -- ربط المستخدم بالمتجر
        IF first_user_id IS NOT NULL THEN
            INSERT INTO user_stores (user_id, store_id)
            VALUES (first_user_id, default_store_id);
        END IF;
        
        RAISE NOTICE 'Created default store with ID: %', default_store_id;
    END IF;
END $$;

-- ربط shopify_tokens بالمتاجر
UPDATE shopify_tokens 
SET store_id = (SELECT id FROM stores ORDER BY created_at LIMIT 1)
WHERE store_id IS NULL;

-- ربط البيانات بالمستخدمين والمتاجر
DO $$
DECLARE
    first_user_id UUID;
    default_store_id UUID;
BEGIN
    SELECT id INTO first_user_id FROM users ORDER BY created_at LIMIT 1;
    SELECT id INTO default_store_id FROM stores ORDER BY created_at LIMIT 1;
    
    IF first_user_id IS NOT NULL AND default_store_id IS NOT NULL THEN
        -- ربط المنتجات
        UPDATE products 
        SET 
            user_id = COALESCE(user_id, first_user_id),
            store_id = COALESCE(store_id, default_store_id)
        WHERE shopify_id IS NOT NULL;
        
        -- ربط الطلبات
        UPDATE orders 
        SET 
            user_id = COALESCE(user_id, first_user_id),
            store_id = COALESCE(store_id, default_store_id)
        WHERE shopify_id IS NOT NULL;
        
        -- ربط العملاء
        UPDATE customers 
        SET 
            user_id = COALESCE(user_id, first_user_id),
            store_id = COALESCE(store_id, default_store_id)
        WHERE shopify_id IS NOT NULL;
        
        -- التأكد من وجود user_stores
        INSERT INTO user_stores (user_id, store_id)
        VALUES (first_user_id, default_store_id)
        ON CONFLICT (user_id, store_id) DO NOTHING;
    END IF;
END $$;

-- 10. التحقق النهائي من البيانات
SELECT 'Final Data Verification' as section;

SELECT 
    'Final Count Summary:' as summary,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as complete_products,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as complete_orders,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND user_id IS NOT NULL AND store_id IS NOT NULL) as complete_customers,
    (SELECT COUNT(*) FROM user_stores) as user_store_connections,
    (SELECT COUNT(*) FROM permissions WHERE can_view_products = true) as users_can_view_products;

-- عرض آخر البيانات المحدثة
SELECT 'Latest Updated Data:' as info;
SELECT 
    'products' as table_name,
    COUNT(*) as count,
    MAX(updated_at) as last_updated
FROM products WHERE shopify_id IS NOT NULL
UNION ALL
SELECT 
    'orders' as table_name,
    COUNT(*) as count,
    MAX(updated_at) as last_updated
FROM orders WHERE shopify_id IS NOT NULL
UNION ALL
SELECT 
    'customers' as table_name,
    COUNT(*) as count,
    MAX(updated_at) as last_updated
FROM customers WHERE shopify_id IS NOT NULL;

SELECT 'تم تشخيص وإصلاح مشاكل بيانات Shopify - Shopify data sync issues diagnosed and fixed' as final_status;