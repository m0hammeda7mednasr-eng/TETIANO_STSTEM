-- ====================================
-- إعادة تعيين Shopify آمنة
-- Safe Shopify Reset
-- ====================================

-- هذا الملف هيمسح بيانات Shopify بس ويحافظ على المستخدمين

-- 1. فحص المستخدمين الموجودين
SELECT 'المستخدمين الموجودين' as section;
SELECT id, email, role, created_at FROM users ORDER BY created_at;

-- 2. مسح جميع بيانات Shopify القديمة فقط
DELETE FROM products WHERE shopify_id IS NOT NULL;
DELETE FROM orders WHERE shopify_id IS NOT NULL;
DELETE FROM customers WHERE shopify_id IS NOT NULL;
DELETE FROM shopify_tokens;

-- 3. إنشاء المتجر الأساسي
INSERT INTO stores (id, name, created_at, updated_at)
VALUES (
    '59b47070-f018-4919-b628-1009af216fd7'::uuid,
    'Main Store',
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    updated_at = NOW();

-- 4. البحث عن المستخدم الأساسي أو إنشاؤه
DO $$
DECLARE
    user_exists boolean;
    main_user_id uuid := 'ee5f8fd9-dfcc-452d-9f84-022c308a2fdf'::uuid;
BEGIN
    -- فحص وجود المستخدم
    SELECT EXISTS(SELECT 1 FROM users WHERE email = 'midoooahmed28@gmail.com') INTO user_exists;
    
    IF user_exists THEN
        -- تحديث المستخدم الموجود
        UPDATE users 
        SET role = 'admin', updated_at = NOW()
        WHERE email = 'midoooahmed28@gmail.com';
        
        -- الحصول على ID المستخدم الفعلي
        SELECT id INTO main_user_id FROM users WHERE email = 'midoooahmed28@gmail.com';
        
        RAISE NOTICE 'تم تحديث المستخدم الموجود: %', main_user_id;
    ELSE
        -- إنشاء مستخدم جديد
        INSERT INTO users (id, email, password, role, created_at, updated_at)
        VALUES (
            main_user_id,
            'midoooahmed28@gmail.com',
            '$2a$10$dummy.hash.for.admin.user.placeholder.only',
            'admin',
            NOW(),
            NOW()
        );
        
        RAISE NOTICE 'تم إنشاء مستخدم جديد: %', main_user_id;
    END IF;
    
    -- ربط المستخدم بالمتجر
    INSERT INTO user_stores (user_id, store_id)
    VALUES (
        main_user_id,
        '59b47070-f018-4919-b628-1009af216fd7'::uuid
    ) ON CONFLICT (user_id, store_id) DO NOTHING;
    
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
        
    RAISE NOTICE 'تم إعداد الصلاحيات للمستخدم: %', main_user_id;
END $$;

-- 5. تعطيل RLS مؤقتاً
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_tokens DISABLE ROW LEVEL SECURITY;

-- 6. إضافة cost_price column
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2) DEFAULT 0;

-- 7. فحص النتائج
SELECT 'فحص النتائج بعد الإعادة تعيين الآمنة' as status;

SELECT 
    'إحصائيات البيانات' as check_type,
    (SELECT COUNT(*) FROM products) as total_products,
    (SELECT COUNT(*) FROM orders) as total_orders,
    (SELECT COUNT(*) FROM customers) as total_customers,
    (SELECT COUNT(*) FROM shopify_tokens) as shopify_connections,
    (SELECT COUNT(*) FROM users WHERE email = 'midoooahmed28@gmail.com') as main_user_exists,
    (SELECT COUNT(*) FROM user_stores) as user_store_links;

-- 8. عرض المستخدم الأساسي
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

SELECT 'تم إعادة تعيين Shopify بأمان! ✅' as final_message;
SELECT 'الآن اذهب إلى Settings وأعد ربط Shopify من جديد' as next_step;