-- ====================================
-- فحص جميع البيانات في النظام
-- ====================================

-- 1. فحص المستخدمين والصلاحيات
SELECT 'Users and Roles:' as info;
SELECT 
    id,
    email,
    name,
    role,
    is_active,
    created_at
FROM users
ORDER BY created_at DESC
LIMIT 10;

-- 2. فحص المنتجات
SELECT 'Products:' as info;
SELECT 
    COUNT(*) as total_products,
    COUNT(CASE WHEN cost_price > 0 THEN 1 END) as products_with_cost_price,
    COUNT(CASE WHEN store_id IS NOT NULL THEN 1 END) as products_with_store_id
FROM products;

SELECT 
    id,
    title,
    price,
    cost_price,
    inventory_quantity,
    store_id,
    created_at
FROM products
ORDER BY created_at DESC
LIMIT 5;

-- 3. فحص الطلبات
SELECT 'Orders:' as info;
SELECT 
    COUNT(*) as total_orders,
    COUNT(CASE WHEN financial_status = 'paid' THEN 1 END) as paid_orders,
    COUNT(CASE WHEN store_id IS NOT NULL THEN 1 END) as orders_with_store_id,
    SUM(CASE WHEN financial_status = 'paid' THEN total_price::numeric ELSE 0 END) as total_revenue
FROM orders;

SELECT 
    id,
    order_number,
    total_price,
    financial_status,
    fulfillment_status,
    store_id,
    created_at
FROM orders
ORDER BY created_at DESC
LIMIT 5;

-- 4. فحص العملاء
SELECT 'Customers:' as info;
SELECT 
    COUNT(*) as total_customers,
    COUNT(CASE WHEN store_id IS NOT NULL THEN 1 END) as customers_with_store_id
FROM customers;

-- 5. فحص المتاجر وربطها بالمستخدمين
SELECT 'Stores:' as info;
SELECT 
    s.id,
    s.name,
    s.shopify_domain,
    COUNT(us.user_id) as connected_users,
    s.created_at
FROM stores s
LEFT JOIN user_stores us ON s.id = us.store_id
GROUP BY s.id, s.name, s.shopify_domain, s.created_at
ORDER BY s.created_at DESC;

-- 6. فحص Shopify tokens
SELECT 'Shopify Connections:' as info;
SELECT 
    st.id,
    u.email as user_email,
    st.shop,
    s.name as store_name,
    st.created_at
FROM shopify_tokens st
JOIN users u ON st.user_id = u.id
LEFT JOIN stores s ON st.store_id = s.id
ORDER BY st.created_at DESC;

-- 7. فحص التكاليف التشغيلية
SELECT 'Operational Costs:' as info;
SELECT 
    COUNT(*) as total_costs,
    COUNT(CASE WHEN product_id IS NOT NULL THEN 1 END) as product_specific_costs,
    COUNT(CASE WHEN product_id IS NULL THEN 1 END) as global_costs,
    SUM(amount) as total_cost_amount
FROM operational_costs
WHERE is_active = true;