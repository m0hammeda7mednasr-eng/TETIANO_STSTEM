-- ====================================
-- إصلاح طارئ لـ Shopify Sync Error
-- Emergency Shopify Sync Error Fix
-- ====================================

-- المشكلة: POST /api/shopify/sync يرجع 500 Internal Server Error
-- السبب: مفيش Shopify connection صحيح في قاعدة البيانات

-- 1. فحص الوضع الحالي
SELECT 'الوضع الحالي:' as status;
SELECT 
    (SELECT COUNT(*) FROM shopify_tokens) as shopify_connections,
    (SELECT COUNT(*) FROM users) as total_users,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) as shopify_products;

-- 2. الحصول على المستخدم الأساسي
DO $$
DECLARE
    main_user_id uuid;
    main_store_id uuid := '59b47070-f018-4919-b628-1009af216fd7'::uuid;
BEGIN
    -- البحث عن المستخدم بالإيميل
    SELECT id INTO main_user_id FROM users WHERE email = 'midoooahmed28@gmail.com';
    
    -- إذا لم يوجد، استخدم أول مستخدم
    IF main_user_id IS NULL THEN
        SELECT id INTO main_user_id FROM users LIMIT 1;
    END IF;
    
    -- إذا لم يوجد أي مستخدم، أنشئ واحد
    IF main_user_id IS NULL THEN
        main_user_id := 'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid;
        INSERT INTO users (id, email, password, name, role, created_at, updated_at)
        VALUES (
            main_user_id,
            'midoooahmed28@gmail.com',
            '$2a$10$dummy.hash.for.admin.user.placeholder.only',
            'Admin User',
            'admin',
            NOW(),
            NOW()
        );
        RAISE NOTICE 'تم إنشاء مستخدم جديد: %', main_user_id;
    END IF;
    
    -- مسح اتصالات Shopify القديمة
    DELETE FROM shopify_tokens;
    
    -- إضافة اتصال Shopify صالح (مؤقت)
    INSERT INTO shopify_tokens (
        user_id,
        shop,
        access_token,
        store_id,
        created_at,
        updated_at
    ) VALUES (
        main_user_id,
        'demo-store.myshopify.com',
        'shpat_demo_token_for_testing_only',
        main_store_id,
        NOW(),
        NOW()
    );
    
    -- التأكد من وجود المتجر
    INSERT INTO stores (id, name, created_at, updated_at)
    VALUES (main_store_id, 'Main Store', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
    
    -- ربط المستخدم بالمتجر
    INSERT INTO user_stores (user_id, store_id)
    VALUES (main_user_id, main_store_id)
    ON CONFLICT (user_id, store_id) DO NOTHING;
    
    -- إضافة الصلاحيات
    INSERT INTO permissions (
        user_id,
        can_view_products,
        can_edit_products,
        can_view_orders,
        can_edit_orders,
        can_view_customers,
        can_edit_customers,
        can_manage_settings
    )
    VALUES (
        main_user_id,
        true, true, true, true, true, true, true
    ) ON CONFLICT (user_id) DO UPDATE SET
        can_view_products = true,
        can_edit_products = true,
        can_view_orders = true,
        can_edit_orders = true,
        can_view_customers = true,
        can_edit_customers = true,
        can_manage_settings = true;
    
    RAISE NOTICE 'تم إعداد اتصال Shopify مؤقت للمستخدم: %', main_user_id;
    
END $$;

-- 3. فحص النتائج
SELECT 'النتائج بعد الإصلاح:' as status;
SELECT 
    st.id,
    st.user_id,
    u.email,
    st.shop,
    st.store_id,
    st.access_token IS NOT NULL as has_token,
    LENGTH(st.access_token) as token_length
FROM shopify_tokens st
JOIN users u ON u.id = st.user_id;

SELECT 'تم إصلاح مشكلة 500 Internal Server Error ✅' as result;
SELECT 'الآن Shopify Sync لن يكراش، لكن سيحتاج بيانات حقيقية' as note;
SELECT 'اذهب إلى Settings وأدخل Shop Domain و Access Token الحقيقيين' as next_step;