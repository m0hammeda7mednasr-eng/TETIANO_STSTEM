-- ====================================
-- البحث عن حساب المدير (Admin Account)
-- ====================================

-- 1. عرض جميع حسابات المدراء
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
-- إذا لم يكن هناك حساب مدير، قم بتحويل حساب موجود إلى مدير
-- ====================================

-- 2. عرض جميع المستخدمين (لاختيار واحد لتحويله إلى مدير)
SELECT 
    id,
    email,
    name,
    role,
    is_active,
    created_at
FROM users 
ORDER BY created_at ASC;

-- ====================================
-- 3. تحويل مستخدم إلى مدير (استبدل البريد الإلكتروني)
-- ====================================

-- استبدل 'your-email@example.com' ببريدك الإلكتروني
UPDATE users 
SET role = 'admin' 
WHERE email = 'your-email@example.com';

-- ====================================
-- 4. التحقق من التحديث
-- ====================================

SELECT 
    id,
    email,
    name,
    role,
    is_active
FROM users 
WHERE role = 'admin';

-- ====================================
-- 5. منح جميع الصلاحيات للمدير (اختياري)
-- ====================================

-- إذا كنت تريد منح جميع الصلاحيات لحساب المدير
-- استبدل 'ADMIN_USER_ID' بـ id المدير من الاستعلام السابق

UPDATE permissions 
SET 
    can_view_dashboard = true,
    can_view_products = true,
    can_edit_products = true,
    can_view_orders = true,
    can_edit_orders = true,
    can_view_customers = true,
    can_edit_customers = true,
    can_manage_users = true,
    can_manage_settings = true,
    can_view_profits = true
WHERE user_id = 'ADMIN_USER_ID';

-- ====================================
-- ملاحظات مهمة:
-- ====================================
-- 
-- 1. المدير (role = 'admin') لا يحتاج صلاحيات في جدول permissions
--    لأنه يملك صلاحيات كاملة تلقائياً
-- 
-- 2. إذا لم يكن لديك أي حساب، قم بالتسجيل أولاً من صفحة /register
--    ثم نفذ الاستعلام رقم 3 لتحويله إلى مدير
-- 
-- 3. يمكن أن يكون لديك أكثر من مدير واحد
-- 
-- 4. المدير يرى جميع الصفحات ما عدا "تقاريري اليومية"
--    لأن المدير لا يكتب تقارير، بل يشاهد تقارير الموظفين
-- 
-- ====================================
