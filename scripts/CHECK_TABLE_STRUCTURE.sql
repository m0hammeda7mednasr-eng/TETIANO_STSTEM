-- ====================================
-- فحص هيكل الجداول الفعلي
-- Check Actual Table Structure
-- ====================================

-- فحص أعمدة جدول المنتجات
SELECT 'Products Table Columns:' as info;
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'products' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- فحص أعمدة جدول الطلبات
SELECT 'Orders Table Columns:' as info;
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- فحص أعمدة جدول العملاء
SELECT 'Customers Table Columns:' as info;
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'customers' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- فحص أعمدة جدول المتاجر
SELECT 'Stores Table Columns:' as info;
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'stores' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- فحص أعمدة جدول shopify_tokens
SELECT 'Shopify Tokens Table Columns:' as info;
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'shopify_tokens' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- فحص أعمدة جدول الصلاحيات
SELECT 'Permissions Table Columns:' as info;
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'permissions' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- عرض عينة من البيانات الموجودة
SELECT 'Sample Orders Data:' as info;
SELECT * FROM orders LIMIT 2;

SELECT 'Sample Products Data:' as info;
SELECT * FROM products LIMIT 2;

SELECT 'Sample Customers Data:' as info;
SELECT * FROM customers LIMIT 2;