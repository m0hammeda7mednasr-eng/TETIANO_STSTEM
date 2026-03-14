-- ====================================
-- تعطيل RLS على الجداول الأساسية فقط
-- Disable RLS on Main Tables Only
-- ====================================

-- تعطيل RLS على الجداول الأساسية (مش الـ views)
ALTER TABLE access_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE operational_costs DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE report_attachments DISABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_credentials DISABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_tokens DISABLE ROW LEVEL SECURITY;
ALTER TABLE stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE sync_operations DISABLE ROW LEVEL SECURITY;
ALTER TABLE task_attachments DISABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- ملاحظة: تم تجاهل الـ views التالية لأنها لا تدعم RLS:
-- order_profitability, product_profitability, ready_data_summary

-- فحص النتائج
SELECT 'تم تعطيل RLS على الجداول الأساسية ✅' as status;

-- عرض حالة الجداول المهمة
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('products', 'orders', 'customers', 'users', 'shopify_tokens', 'stores', 'permissions', 'user_stores')
ORDER BY tablename;

SELECT 'الآن جميع البيانات ستكون متاحة للقراءة والكتابة! 🎯' as final_message;