-- ====================================
-- إصلاح اتصال Shopify
-- Fix Shopify Connection
-- ====================================

-- 1. فحص اتصالات Shopify الحالية
SELECT 'اتصالات Shopify الحالية:' as info;
SELECT id, user_id, shop, store_id, access_token IS NOT NULL as has_token, LENGTH(access_token) as token_length, created_at, updated_at
FROM shopify_tokens
ORDER BY updated_at DESC;

-- 2. الحصول على المستخدم الأساسي
DO $$
DECLARE
    main_user_id uuid;
    main_store_id uuid := '59b47070-f018-4919-b628-1009af216fd7'::uuid;
BEGIN
    -- الحصول على المستخدم الأساسي
    SELECT id INTO main_user_id FROM users WHERE email = 'midoooahmed28@gmail.com';
    
    IF main_user_id IS NULL THEN
        -- استخدام أول مستخدم متاح
        SELECT id INTO main_user_id FROM users LIMIT 1;
    END IF;
    
    IF main_user_id IS NULL THEN
        RAISE EXCEPTION 'لا يوجد مستخدمين في قاعدة البيانات';
    END IF;
    
    RAISE NOTICE 'المستخدم الأساسي: %', main_user_id;
    
    -- مسح اتصالات Shopify القديمة
    DELETE FROM shopify_tokens;
    
    -- إضافة اتصال Shopify تجريبي (يحتاج تحديث بالبيانات الحقيقية)
    INSERT INTO shopify_tokens (
        user_id,
        shop,
        access_token,
        store_id,
        created_at,
        updated_at
    ) VALUES (
        main_user_id,
        'your-store.myshopify.com', -- يحتاج تحديث بالـ shop domain الحقيقي
        'shpat_dummy_token_replace_with_real_token', -- يحتاج تحديث بالـ access token الحقيقي
        main_store_id,
        NOW(),
        NOW()
    );
    
    RAISE NOTICE 'تم إضافة اتصال Shopify تجريبي';
    
END $$;

-- 3. فحص النتائج
SELECT 'اتصالات Shopify بعد الإصلاح:' as info;
SELECT id, user_id, shop, store_id, access_token IS NOT NULL as has_token, LENGTH(access_token) as token_length, created_at, updated_at
FROM shopify_tokens
ORDER BY updated_at DESC;

SELECT 'تم إعداد اتصال Shopify تجريبي ✅' as status;
SELECT 'الآن اذهب إلى Settings وحدث بيانات Shopify الحقيقية:' as next_step_1;
SELECT '1. Shop Domain (مثل: your-store.myshopify.com)' as next_step_2;
SELECT '2. Access Token من Shopify Admin' as next_step_3;