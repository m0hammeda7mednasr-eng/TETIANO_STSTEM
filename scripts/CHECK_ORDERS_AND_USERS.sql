-- التحقق من الطلبات والمستخدمين

-- 1. عرض كل الطلبات مع معلومات المستخدم
SELECT 
    o.id,
    o.order_number,
    o.shopify_id,
    o.user_id,
    u.email as user_email,
    u.name as user_name,
    o.customer_name,
    o.total_price,
    o.status,
    o.created_at
FROM orders o
LEFT JOIN users u ON o.user_id = u.id
ORDER BY o.created_at DESC
LIMIT 10;

-- 2. عرض عدد الطلبات لكل مستخدم
SELECT 
    u.id,
    u.email,
    u.name,
    COUNT(o.id) as order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.email, u.name
ORDER BY order_count DESC;

-- 3. التحقق من وجود طلبات بدون user_id
SELECT 
    id,
    order_number,
    shopify_id,
    user_id,
    customer_name,
    total_price
FROM orders
WHERE user_id IS NULL
LIMIT 10;

-- 4. عرض تفاصيل طلب معين (غير رقم الطلب بالرقم اللي عندك)
-- SELECT * FROM orders WHERE id = 'YOUR_ORDER_ID_HERE';

-- 5. التحقق من صحة العلاقة بين المستخدمين والطلبات
SELECT 
    o.id as order_id,
    o.order_number,
    o.user_id,
    CASE 
        WHEN u.id IS NULL THEN 'User not found'
        ELSE 'User exists'
    END as user_status
FROM orders o
LEFT JOIN users u ON o.user_id = u.id
WHERE u.id IS NULL
LIMIT 10;
