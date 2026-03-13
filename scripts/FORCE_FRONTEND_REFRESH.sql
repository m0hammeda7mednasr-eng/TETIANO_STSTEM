-- ====================================
-- إجبار تحديث البيانات في الواجهة الأمامية
-- Force Frontend Data Refresh
-- ====================================

-- 1. تحديث timestamps لإجبار إعادة التحميل
UPDATE products SET updated_at = NOW() WHERE shopify_id IS NOT NULL;
UPDATE orders SET updated_at = NOW() WHERE shopify_id IS NOT NULL;
UPDATE customers SET updated_at = NOW() WHERE shopify_id IS NOT NULL;

-- 2. التأكد من ربط البيانات بالمستخدم الحالي
DO $$
DECLARE
    current_user_id UUID;
    current_store_id UUID;
BEGIN
    -- الحصول على أول مستخدم
    SELECT id INTO current_user_id FROM users ORDER BY created_at LIMIT 1;
    
    -- الحصول على أول متجر
    SELECT id INTO current_store_id FROM stores ORDER BY created_at LIMIT 1;
    
    -- ربط جميع البيانات
    UPDATE products 
    SET 
        user_id = current_user_id,
        store_id = current_store_id,
        updated_at = NOW()
    WHERE shopify_id IS NOT NULL;
    
    UPDATE orders 
    SET 
        user_id = current_user_id,
        store_id = current_store_id,
        updated_at = NOW()
    WHERE shopify_id IS NOT NULL;
    
    UPDATE customers 
    SET 
        user_id = current_user_id,
        store_id = current_store_id,
        updated_at = NOW()
    WHERE shopify_id IS NOT NULL;
    
    -- التأكد من وجود user_stores
    INSERT INTO user_stores (user_id, store_id)
    VALUES (current_user_id, current_store_id)
    ON CONFLICT (user_id, store_id) DO NOTHING;
    
    RAISE NOTICE 'تم ربط البيانات بالمستخدم: %', current_user_id;
END $$;

-- 3. إنشاء صلاحيات كاملة لجميع المستخدمين
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN SELECT id FROM users
    LOOP
        INSERT INTO permissions (
            user_id,
            can_view_products,
            can_edit_products,
            can_view_orders,
            can_edit_orders,
            can_view_customers,
            can_edit_customers
        )
        VALUES (
            user_record.id,
            true, true, true, true, true, true
        )
        ON CONFLICT (user_id) DO UPDATE SET
            can_view_products = true,
            can_edit_products = true,
            can_view_orders = true,
            can_edit_orders = true,
            can_view_customers = true,
            can_edit_customers = true;
    END LOOP;
END $$;

-- 4. إنشاء view بسيط للبيانات الجاهزة
CREATE OR REPLACE VIEW ready_data_summary AS
SELECT 
    'products' as table_name,
    COUNT(*) as total_count,
    MAX(updated_at) as last_updated
FROM products WHERE shopify_id IS NOT NULL
UNION ALL
SELECT 
    'orders' as table_name,
    COUNT(*) as total_count,
    MAX(updated_at) as last_updated
FROM orders WHERE shopify_id IS NOT NULL
UNION ALL
SELECT 
    'customers' as table_name,
    COUNT(*) as total_count,
    MAX(updated_at) as last_updated
FROM customers WHERE shopify_id IS NOT NULL;

-- 5. عرض البيانات الجاهزة
SELECT 'البيانات الجاهزة للعرض:' as info;
SELECT * FROM ready_data_summary;

-- 6. عرض تفاصيل المستخدمين والصلاحيات
SELECT 'المستخدمين والصلاحيات:' as info;
SELECT 
    u.id,
    u.email,
    u.role,
    p.can_view_products,
    p.can_view_orders,
    p.can_view_customers
FROM users u
LEFT JOIN permissions p ON u.id = p.user_id;

-- 7. عرض ربط المستخدمين بالمتاجر
SELECT 'ربط المستخدمين بالمتاجر:' as info;
SELECT 
    u.email,
    s.name as store_name,
    us.user_id,
    us.store_id
FROM user_stores us
JOIN users u ON us.user_id = u.id
JOIN stores s ON us.store_id = s.id;

SELECT 'تم إجبار تحديث البيانات للواجهة الأمامية بنجاح!' as result;