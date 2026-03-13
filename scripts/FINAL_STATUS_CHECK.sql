-- ====================================
-- فحص الحالة النهائية للبيانات
-- Final Status Check for Data
-- ====================================

-- 1. فحص البيانات الأساسية
SELECT 'فحص البيانات الأساسية' as القسم;

SELECT 
    'المنتجات' as النوع,
    COUNT(*) as العدد_الكلي,
    COUNT(CASE WHEN shopify_id IS NOT NULL THEN 1 END) as من_شوبيفاي,
    COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as مرتبطة_بمستخدم,
    COUNT(CASE WHEN store_id IS NOT NULL THEN 1 END) as مرتبطة_بمتجر
FROM products
UNION ALL
SELECT 
    'الطلبات' as النوع,
    COUNT(*) as العدد_الكلي,
    COUNT(CASE WHEN shopify_id IS NOT NULL THEN 1 END) as من_شوبيفاي,
    COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as مرتبطة_بمستخدم,
    COUNT(CASE WHEN store_id IS NOT NULL THEN 1 END) as مرتبطة_بمتجر
FROM orders
UNION ALL
SELECT 
    'العملاء' as النوع,
    COUNT(*) as العدد_الكلي,
    COUNT(CASE WHEN shopify_id IS NOT NULL THEN 1 END) as من_شوبيفاي,
    COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as مرتبطة_بمستخدم,
    COUNT(CASE WHEN store_id IS NOT NULL THEN 1 END) as مرتبطة_بمتجر
FROM customers;

-- 2. فحص المستخدمين والمتاجر
SELECT 'فحص المستخدمين والمتاجر' as القسم;

SELECT 'المستخدمين' as النوع, COUNT(*) as العدد FROM users;
SELECT 'المتاجر' as النوع, COUNT(*) as العدد FROM stores;
SELECT 'ربط المستخدمين بالمتاجر' as النوع, COUNT(*) as العدد FROM user_stores;
SELECT 'اتصالات شوبيفاي' as النوع, COUNT(*) as العدد FROM shopify_tokens;

-- 3. عرض عينة من البيانات الحديثة
SELECT 'عينة من المنتجات الحديثة' as القسم;
SELECT 
    id, 
    shopify_id, 
    title, 
    price, 
    COALESCE(cost_price, 0) as cost_price,
    user_id, 
    store_id,
    created_at
FROM products 
WHERE shopify_id IS NOT NULL 
ORDER BY created_at DESC 
LIMIT 3;

SELECT 'عينة من الطلبات الحديثة' as القسم;
SELECT 
    id, 
    shopify_id, 
    order_number, 
    total_price, 
    status,
    customer_name,
    user_id, 
    store_id,
    created_at
FROM orders 
WHERE shopify_id IS NOT NULL 
ORDER BY created_at DESC 
LIMIT 3;

SELECT 'عينة من العملاء الحديثين' as القسم;
SELECT 
    id, 
    shopify_id, 
    name, 
    email,
    COALESCE(total_spent, 0) as total_spent,
    user_id, 
    store_id,
    created_at
FROM customers 
WHERE shopify_id IS NOT NULL 
ORDER BY created_at DESC 
LIMIT 3;

-- 4. فحص الحسابات المالية
SELECT 'الحسابات المالية' as القسم;

SELECT 
    'إجمالي قيمة المنتجات' as البيان,
    COALESCE(SUM(price), 0) as القيمة
FROM products WHERE shopify_id IS NOT NULL;

SELECT 
    'إجمالي المبيعات' as البيان,
    COALESCE(SUM(total_price), 0) as القيمة
FROM orders WHERE shopify_id IS NOT NULL;

SELECT 
    'المبيعات المدفوعة' as البيان,
    COALESCE(SUM(total_price), 0) as القيمة
FROM orders WHERE shopify_id IS NOT NULL AND status IN ('paid', 'completed', 'fulfilled');

SELECT 
    'إجمالي إنفاق العملاء' as البيان,
    COALESCE(SUM(total_spent), 0) as القيمة
FROM customers WHERE shopify_id IS NOT NULL;

-- 5. فحص حالات الطلبات
SELECT 'توزيع حالات الطلبات' as القسم;
SELECT 
    COALESCE(status, 'غير محدد') as الحالة,
    COUNT(*) as العدد,
    COALESCE(SUM(total_price), 0) as إجمالي_القيمة
FROM orders 
WHERE shopify_id IS NOT NULL 
GROUP BY status
ORDER BY COUNT(*) DESC;

-- 6. فحص الصلاحيات
SELECT 'فحص الصلاحيات' as القسم;
SELECT 
    COUNT(*) as عدد_المستخدمين_بصلاحيات,
    COUNT(CASE WHEN can_view_products = true THEN 1 END) as يمكن_رؤية_المنتجات,
    COUNT(CASE WHEN can_view_orders = true THEN 1 END) as يمكن_رؤية_الطلبات,
    COUNT(CASE WHEN can_view_customers = true THEN 1 END) as يمكن_رؤية_العملاء
FROM permissions;

-- 7. التحقق من آخر تحديث
SELECT 'آخر تحديث للبيانات' as القسم;
SELECT 
    'المنتجات' as النوع,
    MAX(updated_at) as آخر_تحديث,
    COUNT(*) as العدد_المحدث
FROM products WHERE shopify_id IS NOT NULL
UNION ALL
SELECT 
    'الطلبات' as النوع,
    MAX(updated_at) as آخر_تحديث,
    COUNT(*) as العدد_المحدث
FROM orders WHERE shopify_id IS NOT NULL
UNION ALL
SELECT 
    'العملاء' as النوع,
    MAX(updated_at) as آخر_تحديث,
    COUNT(*) as العدد_المحدث
FROM customers WHERE shopify_id IS NOT NULL;

-- 8. ملخص الحالة النهائية
SELECT 'الملخص النهائي' as القسم;
SELECT 
    'البيانات جاهزة للعرض' as الحالة,
    (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) as منتجات_جاهزة,
    (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL) as طلبات_جاهزة,
    (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL) as عملاء_جاهزون,
    (SELECT COUNT(*) FROM user_stores) as اتصالات_المتاجر,
    CASE 
        WHEN (SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL) > 0 
         AND (SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL) > 0 
         AND (SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL) > 0
        THEN 'جميع البيانات متوفرة ✅'
        ELSE 'يحتاج مراجعة ⚠️'
    END as تقييم_الحالة;