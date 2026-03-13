-- ====================================
-- فحص سريع للبيانات
-- Quick Data Check
-- ====================================

-- 1. فحص المستخدمين
SELECT 'Users:' as info, COUNT(*) as count FROM users;

-- 2. فحص اتصالات Shopify
SELECT 'Shopify Tokens:' as info, COUNT(*) as count FROM shopify_tokens;

-- 3. فحص المتاجر
SELECT 'Stores:' as info, COUNT(*) as count FROM stores;

-- 4. فحص ربط المستخدمين بالمتاجر
SELECT 'User-Store Links:' as info, COUNT(*) as count FROM user_stores;

-- 5. فحص البيانات من Shopify
SELECT 'Products from Shopify:' as info, COUNT(*) as count FROM products WHERE shopify_id IS NOT NULL;
SELECT 'Orders from Shopify:' as info, COUNT(*) as count FROM orders WHERE shopify_id IS NOT NULL;
SELECT 'Customers from Shopify:' as info, COUNT(*) as count FROM customers WHERE shopify_id IS NOT NULL;

-- 6. فحص البيانات المرتبطة بالمستخدمين
SELECT 'Products with user_id:' as info, COUNT(*) as count FROM products WHERE user_id IS NOT NULL;
SELECT 'Orders with user_id:' as info, COUNT(*) as count FROM orders WHERE user_id IS NOT NULL;
SELECT 'Customers with user_id:' as info, COUNT(*) as count FROM customers WHERE user_id IS NOT NULL;

-- 7. فحص البيانات المرتبطة بالمتاجر
SELECT 'Products with store_id:' as info, COUNT(*) as count FROM products WHERE store_id IS NOT NULL;
SELECT 'Orders with store_id:' as info, COUNT(*) as count FROM orders WHERE store_id IS NOT NULL;
SELECT 'Customers with store_id:' as info, COUNT(*) as count FROM customers WHERE store_id IS NOT NULL;

-- 8. فحص الصلاحيات
SELECT 'Permissions records:' as info, COUNT(*) as count FROM permissions;
SELECT 'Users with view products permission:' as info, COUNT(*) as count FROM permissions WHERE can_view_products = true;

-- 9. عرض عينة من البيانات
SELECT 'Sample Products:' as info;
SELECT id, shopify_id, title, price, user_id, store_id FROM products WHERE shopify_id IS NOT NULL LIMIT 3;

SELECT 'Sample Orders:' as info;
SELECT id, shopify_id, order_number, total_price, financial_status, user_id, store_id FROM orders WHERE shopify_id IS NOT NULL LIMIT 3;

-- 10. فحص المشاكل الشائعة
SELECT 'Issues Check:' as info;
SELECT 
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL AND user_id IS NULL) as products_no_user,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL AND user_id IS NULL) as orders_no_user,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL AND user_id IS NULL) as customers_no_user;

SELECT 'فحص البيانات مكتمل - Data check completed' as status;