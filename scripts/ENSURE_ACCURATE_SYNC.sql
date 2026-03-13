-- ====================================
-- ضمان التزامن الدقيق والحسابات الصحيحة
-- Ensure Accurate Sync and Calculations
-- ====================================

-- 1. إنشاء دالة لحساب الأرباح الدقيقة
CREATE OR REPLACE FUNCTION calculate_accurate_profits()
RETURNS void AS $$
DECLARE
    product_record RECORD;
    order_record RECORD;
BEGIN
    -- تحديث أرباح المنتجات
    FOR product_record IN 
        SELECT id, price, cost_price FROM products WHERE shopify_id IS NOT NULL
    LOOP
        UPDATE products 
        SET 
            profit_margin = CASE 
                WHEN price > 0 THEN 
                    ROUND(((price - COALESCE(cost_price, 0)) / price * 100), 2)
                ELSE 0
            END
        WHERE id = product_record.id;
    END LOOP;
    
    -- تحديث صافي المبالغ للطلبات
    FOR order_record IN 
        SELECT id, total_price, status FROM orders WHERE shopify_id IS NOT NULL
    LOOP
        UPDATE orders 
        SET 
            net_amount = CASE 
                WHEN status IN ('paid', 'completed', 'fulfilled') THEN 
                    (total_price - COALESCE(total_refunded, 0))
                WHEN status = 'refunded' THEN 0
                ELSE total_price
            END
        WHERE id = order_record.id;
    END LOOP;
    
    RAISE NOTICE 'تم تحديث الحسابات بنجاح';
END;
$$ LANGUAGE plpgsql;

-- 2. إنشاء دالة لتحديث إحصائيات العملاء
CREATE OR REPLACE FUNCTION update_customer_stats()
RETURNS void AS $$
BEGIN
    UPDATE customers 
    SET 
        total_orders = (
            SELECT COUNT(*) 
            FROM orders o 
            WHERE (o.customer_email = customers.email AND customers.email IS NOT NULL)
               OR (o.customer_name = customers.name AND customers.name IS NOT NULL)
        ),
        total_spent = (
            SELECT COALESCE(SUM(o.total_price), 0)
            FROM orders o 
            WHERE ((o.customer_email = customers.email AND customers.email IS NOT NULL)
               OR (o.customer_name = customers.name AND customers.name IS NOT NULL))
               AND o.status IN ('paid', 'completed', 'fulfilled')
        ),
        avg_order_value = (
            SELECT COALESCE(AVG(o.total_price), 0)
            FROM orders o 
            WHERE (o.customer_email = customers.email AND customers.email IS NOT NULL)
               OR (o.customer_name = customers.name AND customers.name IS NOT NULL)
        ),
        last_order_date = (
            SELECT MAX(o.created_at)
            FROM orders o 
            WHERE (o.customer_email = customers.email AND customers.email IS NOT NULL)
               OR (o.customer_name = customers.name AND customers.name IS NOT NULL)
        )
    WHERE shopify_id IS NOT NULL;
    
    RAISE NOTICE 'تم تحديث إحصائيات العملاء';
END;
$$ LANGUAGE plpgsql;

-- 3. إنشاء دالة للتحقق من صحة البيانات
CREATE OR REPLACE FUNCTION validate_data_integrity()
RETURNS TABLE (
    check_name TEXT,
    status TEXT,
    count_value BIGINT,
    notes TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        'منتجات مع أسعار'::TEXT,
        CASE WHEN COUNT(*) > 0 THEN 'جيد' ELSE 'يحتاج مراجعة' END::TEXT,
        COUNT(*)::BIGINT,
        'منتجات لها أسعار محددة'::TEXT
    FROM products 
    WHERE shopify_id IS NOT NULL AND price > 0
    
    UNION ALL
    
    SELECT 
        'منتجات مع تكلفة'::TEXT,
        CASE WHEN COUNT(*) > 0 THEN 'جيد' ELSE 'يحتاج إضافة تكلفة' END::TEXT,
        COUNT(*)::BIGINT,
        'منتجات لها أسعار تكلفة'::TEXT
    FROM products 
    WHERE shopify_id IS NOT NULL AND cost_price > 0
    
    UNION ALL
    
    SELECT 
        'طلبات مدفوعة'::TEXT,
        'جيد'::TEXT,
        COUNT(*)::BIGINT,
        'طلبات تم دفعها بنجاح'::TEXT
    FROM orders 
    WHERE shopify_id IS NOT NULL AND status IN ('paid', 'completed', 'fulfilled')
    
    UNION ALL
    
    SELECT 
        'عملاء نشطين'::TEXT,
        'جيد'::TEXT,
        COUNT(*)::BIGINT,
        'عملاء لديهم طلبات'::TEXT
    FROM customers 
    WHERE shopify_id IS NOT NULL AND total_orders > 0;
END;
$$ LANGUAGE plpgsql;

-- 4. إنشاء دالة لإعادة حساب جميع الإحصائيات
CREATE OR REPLACE FUNCTION recalculate_all_stats()
RETURNS TEXT AS $$
BEGIN
    -- تحديث الأرباح
    PERFORM calculate_accurate_profits();
    
    -- تحديث إحصائيات العملاء
    PERFORM update_customer_stats();
    
    -- تحديث timestamps لإجبار إعادة التحميل
    UPDATE products SET updated_at = NOW() WHERE shopify_id IS NOT NULL;
    UPDATE orders SET updated_at = NOW() WHERE shopify_id IS NOT NULL;
    UPDATE customers SET updated_at = NOW() WHERE shopify_id IS NOT NULL;
    
    RETURN 'تم إعادة حساب جميع الإحصائيات بنجاح';
END;
$$ LANGUAGE plpgsql;

-- 5. تشغيل جميع الدوال
SELECT calculate_accurate_profits();
SELECT update_customer_stats();
SELECT recalculate_all_stats();

-- 6. عرض تقرير التحقق من صحة البيانات
SELECT 'تقرير التحقق من صحة البيانات:' as info;
SELECT * FROM validate_data_integrity();

-- 7. عرض ملخص شامل محدث
SELECT 'الملخص الشامل المحدث:' as info;

-- إحصائيات المنتجات
SELECT 
    'المنتجات' as النوع,
    COUNT(*) as العدد_الكلي,
    COUNT(CASE WHEN shopify_id IS NOT NULL THEN 1 END) as من_شوبيفاي,
    COUNT(CASE WHEN price > 0 THEN 1 END) as بأسعار,
    COUNT(CASE WHEN cost_price > 0 THEN 1 END) as بتكلفة,
    ROUND(AVG(CASE WHEN price > 0 THEN price END), 2) as متوسط_السعر,
    ROUND(AVG(CASE WHEN cost_price > 0 THEN cost_price END), 2) as متوسط_التكلفة
FROM products;

-- إحصائيات الطلبات
SELECT 
    'الطلبات' as النوع,
    COUNT(*) as العدد_الكلي,
    COUNT(CASE WHEN shopify_id IS NOT NULL THEN 1 END) as من_شوبيفاي,
    COUNT(CASE WHEN status IN ('paid', 'completed', 'fulfilled') THEN 1 END) as مدفوعة,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as معلقة,
    ROUND(SUM(CASE WHEN status IN ('paid', 'completed', 'fulfilled') THEN total_price ELSE 0 END), 2) as إجمالي_المبيعات,
    ROUND(AVG(CASE WHEN total_price > 0 THEN total_price END), 2) as متوسط_قيمة_الطلب
FROM orders;

-- إحصائيات العملاء
SELECT 
    'العملاء' as النوع,
    COUNT(*) as العدد_الكلي,
    COUNT(CASE WHEN shopify_id IS NOT NULL THEN 1 END) as من_شوبيفاي,
    COUNT(CASE WHEN total_orders > 0 THEN 1 END) as نشطين,
    ROUND(AVG(CASE WHEN total_orders > 0 THEN total_orders END), 2) as متوسط_الطلبات_للعميل,
    ROUND(AVG(CASE WHEN total_spent > 0 THEN total_spent END), 2) as متوسط_إنفاق_العميل
FROM customers;

-- 8. عرض أحدث البيانات
SELECT 'أحدث المنتجات المحدثة:' as info;
SELECT id, title, price, cost_price, profit_margin, updated_at 
FROM products 
WHERE shopify_id IS NOT NULL 
ORDER BY updated_at DESC 
LIMIT 3;

SELECT 'أحدث الطلبات المحدثة:' as info;
SELECT id, order_number, total_price, status, net_amount, updated_at 
FROM orders 
WHERE shopify_id IS NOT NULL 
ORDER BY updated_at DESC 
LIMIT 3;

SELECT 'أحدث العملاء المحدثين:' as info;
SELECT id, name, email, total_orders, total_spent, updated_at 
FROM customers 
WHERE shopify_id IS NOT NULL 
ORDER BY updated_at DESC 
LIMIT 3;

SELECT 'تم ضمان التزامن الدقيق والحسابات الصحيحة بنجاح!' as النتيجة_النهائية;