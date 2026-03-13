-- ====================================
-- التحقق من حالة حساب المدير
-- ====================================

-- 1. عرض جميع المستخدمين مع أدوارهم
SELECT 
    '👥 جميع المستخدمين:' as info,
    email,
    name,
    role,
    is_active,
    created_at
FROM users
ORDER BY 
    CASE role 
        WHEN 'admin' THEN 1 
        ELSE 2 
    END,
    created_at ASC;

-- 2. عرض المدراء فقط
SELECT 
    '👨‍💼 المدراء:' as info,
    id,
    email,
    name,
    role,
    is_active
FROM users 
WHERE role = 'admin';

-- 3. عرض صلاحيات المدراء
SELECT 
    '🔐 صلاحيات المدراء:' as info,
    u.email,
    u.name,
    p.can_manage_users,
    p.can_edit_products,
    p.can_edit_orders,
    p.can_manage_settings,
    p.can_view_profits
FROM users u
LEFT JOIN permissions p ON u.id = p.user_id
WHERE u.role = 'admin';

-- 4. عرض عدد الطلبات المعلقة
SELECT 
    '📋 طلبات الصلاحيات المعلقة:' as info,
    COUNT(*) as count
FROM access_requests
WHERE status = 'pending';

-- 5. عرض آخر 5 طلبات صلاحيات
SELECT 
    '📝 آخر طلبات الصلاحيات:' as info,
    u.name as user_name,
    u.email,
    ar.permission_requested,
    ar.status,
    ar.created_at
FROM access_requests ar
JOIN users u ON ar.user_id = u.id
ORDER BY ar.created_at DESC
LIMIT 5;

-- 6. عرض عدد التقارير اليومية
SELECT 
    '📊 التقارير اليومية:' as info,
    COUNT(*) as total_reports,
    COUNT(CASE WHEN status = 'submitted' THEN 1 END) as submitted_reports,
    COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_reports
FROM daily_reports;

-- 7. عرض آخر 5 تقارير يومية
SELECT 
    '📄 آخر التقارير اليومية:' as info,
    u.name as user_name,
    u.email,
    dr.title,
    dr.status,
    dr.report_date,
    dr.created_at
FROM daily_reports dr
JOIN users u ON dr.user_id = u.id
ORDER BY dr.created_at DESC
LIMIT 5;

-- ====================================
-- إذا لم يكن هناك مدير، نفذ هذا:
-- ====================================

-- تحويل مستخدم معين إلى مدير (استبدل البريد)
-- UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';

-- أو تحويل أول مستخدم إلى مدير
-- UPDATE users SET role = 'admin' WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1);

-- ====================================
-- ملاحظات:
-- ====================================
-- 
-- إذا كان المدير لا يرى الصفحات الصحيحة:
-- 1. تأكد من أن role = 'admin' في قاعدة البيانات
-- 2. اعمل Logout ثم Login تاني
-- 3. امسح الـ cache: Ctrl + Shift + R
-- 4. افتح المتصفح في وضع Incognito
-- 
-- ====================================
