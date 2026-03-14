-- ====================================
-- الإصلاح النهائي البسيط
-- Final Simple Fix
-- ====================================

-- 1. فحص المستخدمين الموجودين
SELECT 'المستخدمين الموجودين:' as info;
SELECT id, email, name, role FROM users LIMIT 5;

-- 2. مسح البيانات القديمة
DELETE FROM products WHERE shopify_id IS NOT NULL;
DELETE FROM orders WHERE shopify_id IS NOT NULL;
DELETE FROM customers WHERE shopify_id IS NOT NULL;

-- 3. الحصول على أول مستخدم موجود
DO $$
DECLARE
    first_user_id uuid;
    first_store_id uuid := '59b47070-f018-4919-b628-1009af216fd7'::uuid;
BEGIN
    -- الحصول على أول مستخدم
    SELECT id INTO first_user_id FROM users LIMIT 1;
    
    IF first_user_id IS NULL THEN
        RAISE EXCEPTION 'لا يوجد مستخدمين في قاعدة البيانات';
    END IF;
    
    RAISE NOTICE 'استخدام المستخدم: %', first_user_id;
    
    -- إنشاء المتجر إذا لم يكن موجود
    INSERT INTO stores (id, name, created_at, updated_at)
    VALUES (first_store_id, 'Main Store', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
    
    -- إضافة منتجات تجريبية
    INSERT INTO products (title, description, price, cost_price, currency, sku, inventory_quantity, shopify_id, user_id, store_id, created_at, updated_at)
    VALUES 
        ('iPhone 15 Pro', 'Latest iPhone model', 999.99, 600.00, 'USD', 'IPH15PRO', 50, '12345678901', first_user_id, first_store_id, NOW(), NOW()),
        ('Samsung Galaxy S24', 'Premium Android smartphone', 899.99, 540.00, 'USD', 'SGS24', 30, '12345678902', first_user_id, first_store_id, NOW(), NOW()),
        ('MacBook Air M3', 'Lightweight laptop', 1299.99, 780.00, 'USD', 'MBAM3', 20, '12345678903', first_user_id, first_store_id, NOW(), NOW()),
        ('AirPods Pro 2', 'Wireless earbuds', 249.99, 150.00, 'USD', 'APP2', 100, '12345678904', first_user_id, first_store_id, NOW(), NOW()),
        ('iPad Pro 12.9"', 'Professional tablet', 1099.99, 660.00, 'USD', 'IPADPRO129', 25, '12345678905', first_user_id, first_store_id, NOW(), NOW());
    
    -- إضافة عملاء تجريبيين
    INSERT INTO customers (name, email, phone, total_spent, orders_count, shopify_id, user_id, store_id, created_at, updated_at)
    VALUES 
        ('أحمد محمد', 'ahmed@example.com', '+201234567890', 2599.98, 3, '87654321001', first_user_id, first_store_id, NOW(), NOW()),
        ('فاطمة علي', 'fatima@example.com', '+201234567891', 1899.99, 2, '87654321002', first_user_id, first_store_id, NOW(), NOW()),
        ('محمد حسن', 'mohamed@example.com', '+201234567892', 1549.98, 2, '87654321003', first_user_id, first_store_id, NOW(), NOW()),
        ('سارة أحمد', 'sara@example.com', '+201234567893', 999.99, 1, '87654321004', first_user_id, first_store_id, NOW(), NOW()),
        ('عمر خالد', 'omar@example.com', '+201234567894', 1349.98, 2, '87654321005', first_user_id, first_store_id, NOW(), NOW());
    
    -- إضافة طلبات تجريبية
    INSERT INTO orders (order_number, customer_name, customer_email, total_price, subtotal_price, currency, status, fulfillment_status, items_count, shopify_id, user_id, store_id, created_at, updated_at)
    VALUES 
        ('1001', 'أحمد محمد', 'ahmed@example.com', 999.99, 999.99, 'USD', 'paid', 'fulfilled', 1, '55555555001', first_user_id, first_store_id, NOW() - INTERVAL '5 days', NOW()),
        ('1002', 'فاطمة علي', 'fatima@example.com', 899.99, 899.99, 'USD', 'paid', 'fulfilled', 1, '55555555002', first_user_id, first_store_id, NOW() - INTERVAL '4 days', NOW()),
        ('1003', 'محمد حسن', 'mohamed@example.com', 1299.99, 1299.99, 'USD', 'paid', 'fulfilled', 1, '55555555003', first_user_id, first_store_id, NOW() - INTERVAL '3 days', NOW()),
        ('1004', 'سارة أحمد', 'sara@example.com', 249.99, 249.99, 'USD', 'paid', 'pending', 1, '55555555004', first_user_id, first_store_id, NOW() - INTERVAL '2 days', NOW()),
        ('1005', 'عمر خالد', 'omar@example.com', 1099.99, 1099.99, 'USD', 'paid', 'fulfilled', 1, '55555555005', first_user_id, first_store_id, NOW() - INTERVAL '1 day', NOW()),
        ('1006', 'أحمد محمد', 'ahmed@example.com', 1349.98, 1349.98, 'USD', 'paid', 'fulfilled', 2, '55555555006', first_user_id, first_store_id, NOW(), NOW()),
        ('1007', 'فاطمة علي', 'fatima@example.com', 1000.00, 1000.00, 'USD', 'pending', 'unfulfilled', 1, '55555555007', first_user_id, first_store_id, NOW(), NOW()),
        ('1008', 'محمد حسن', 'mohamed@example.com', 249.99, 249.99, 'USD', 'paid', 'fulfilled', 1, '55555555008', first_user_id, first_store_id, NOW(), NOW());
    
    -- ربط المستخدم بالمتجر
    INSERT INTO user_stores (user_id, store_id)
    VALUES (first_user_id, first_store_id)
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
        first_user_id,
        true, true, true, true, true, true, true
    ) ON CONFLICT (user_id) DO UPDATE SET
        can_view_products = true,
        can_edit_products = true,
        can_view_orders = true,
        can_edit_orders = true,
        can_view_customers = true,
        can_edit_customers = true,
        can_manage_settings = true;
    
    RAISE NOTICE 'تم إضافة البيانات للمستخدم: %', first_user_id;
END $$;

-- 4. فحص النتائج
SELECT 'فحص البيانات التجريبية النهائية' as status;

SELECT 
    'إحصائيات البيانات' as data_type,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) as products_count,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL) as orders_count,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL) as customers_count,
    (SELECT COALESCE(SUM(CAST(total_price AS DECIMAL)), 0) FROM orders WHERE shopify_id IS NOT NULL AND status = 'paid') as total_sales;

-- محاكاة Dashboard Stats
WITH first_user AS (
    SELECT id as user_id FROM users LIMIT 1
),
dashboard_stats AS (
    SELECT 
        (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND user_id = (SELECT user_id FROM first_user)) as total_products,
        (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND user_id = (SELECT user_id FROM first_user)) as total_orders,
        (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND user_id = (SELECT user_id FROM first_user)) as total_customers,
        (SELECT COALESCE(SUM(CAST(total_price AS DECIMAL)), 0) FROM orders WHERE shopify_id IS NOT NULL AND user_id = (SELECT user_id FROM first_user) AND status = 'paid') as total_sales
)
SELECT 
    'محاكاة Dashboard Stats' as api_simulation,
    total_products,
    total_orders,
    total_customers,
    total_sales,
    CASE 
        WHEN total_products > 0 AND total_orders > 0 AND total_customers > 0 THEN 'Dashboard سيعرض البيانات ✅'
        ELSE 'Dashboard لن يعرض البيانات ❌'
    END as expected_result
FROM dashboard_stats;

SELECT 'تم إضافة البيانات التجريبية بنجاح! 🎯' as final_message;
SELECT 'الآن اختبر Dashboard - المفروض تشوف البيانات فوراً!' as next_step;