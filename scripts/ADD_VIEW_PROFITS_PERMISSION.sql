-- إضافة صلاحية عرض صافي الربح
-- Add permission to view net profit page

-- إضافة الصلاحية للجدول
INSERT INTO permissions (name, description, category)
VALUES ('can_view_profits', 'يمكنه عرض صافي الربح', 'profits')
ON CONFLICT (name) DO NOTHING;

-- إعطاء الصلاحية للأدمن
INSERT INTO user_permissions (user_id, permission_id)
SELECT u.id, p.id
FROM users u
CROSS JOIN permissions p
WHERE u.role = 'admin'
  AND p.name = 'can_view_profits'
  AND NOT EXISTS (
    SELECT 1 FROM user_permissions up
    WHERE up.user_id = u.id AND up.permission_id = p.id
  );

-- إعطاء الصلاحية لكل المستخدمين (اختياري - احذف هذا الجزء لو عايز الأدمن بس)
INSERT INTO user_permissions (user_id, permission_id)
SELECT u.id, p.id
FROM users u
CROSS JOIN permissions p
WHERE p.name = 'can_view_profits'
  AND NOT EXISTS (
    SELECT 1 FROM user_permissions up
    WHERE up.user_id = u.id AND up.permission_id = p.id
  );

-- التحقق من الصلاحيات
SELECT 
  u.email,
  u.role,
  p.name as permission_name,
  p.description
FROM users u
JOIN user_permissions up ON u.id = up.user_id
JOIN permissions p ON up.permission_id = p.id
WHERE p.name = 'can_view_profits'
ORDER BY u.email;
