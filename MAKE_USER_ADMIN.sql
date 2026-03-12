-- ====================================
-- تحويل المستخدم إلى مدير (Make User Admin)
-- ====================================

-- 1. تحويل المستخدم testadmin@example.com إلى مدير
UPDATE users 
SET role = 'admin' 
WHERE email = 'testadmin@example.com';

-- 2. التحقق من التحديث
SELECT 
    id,
    email,
    name,
    role,
    is_active,
    created_at
FROM users 
WHERE email = 'testadmin@example.com';

-- 3. عرض جميع المدراء
SELECT 
    id,
    email,
    name,
    role,
    is_active,
    created_at
FROM users 
WHERE role = 'admin'
ORDER BY created_at DESC;

-- ====================================
-- ملاحظة: بعد تنفيذ هذا الاستعلام:
-- 1. قم بتسجيل الخروج من التطبيق
-- 2. قم بتسجيل الدخول مرة أخرى
-- 3. ستظهر لك جميع ميزات المدير
-- ====================================
