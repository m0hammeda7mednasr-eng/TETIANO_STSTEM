-- ====================================
-- إصلاح جدول permissions وإضافة UNIQUE constraint
-- ====================================

-- الخطوة 1: حذف الجدول القديم إذا كان موجوداً (احذر: سيحذف البيانات!)
-- إذا كنت تريد الاحتفاظ بالبيانات، لا تنفذ هذا السطر
DROP TABLE IF EXISTS permissions CASCADE;

-- الخطوة 2: إنشاء الجدول من جديد مع UNIQUE constraint
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    can_view_dashboard BOOLEAN DEFAULT true,
    can_view_products BOOLEAN DEFAULT true,
    can_edit_products BOOLEAN DEFAULT false,
    can_view_orders BOOLEAN DEFAULT true,
    can_edit_orders BOOLEAN DEFAULT false,
    can_view_customers BOOLEAN DEFAULT true,
    can_edit_customers BOOLEAN DEFAULT false,
    can_manage_users BOOLEAN DEFAULT false,
    can_manage_settings BOOLEAN DEFAULT false,
    can_view_profits BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- الخطوة 3: إضافة Index للأداء
CREATE INDEX idx_permissions_user_id ON permissions(user_id);

-- الخطوة 4: إضافة صلاحيات افتراضية لجميع المستخدمين
INSERT INTO permissions (user_id, can_view_dashboard, can_view_products, can_view_orders, can_view_customers)
SELECT id, true, true, true, true
FROM users
ON CONFLICT (user_id) DO NOTHING;

-- الخطوة 5: منح صلاحيات كاملة للمدراء
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
WHERE user_id IN (SELECT id FROM users WHERE role = 'admin');

-- الخطوة 6: التحقق من النجاح
SELECT 
    '✅ تم إصلاح جدول permissions بنجاح!' as status,
    (SELECT COUNT(*) FROM permissions) as total_permissions,
    (SELECT COUNT(*) FROM permissions WHERE user_id IN (SELECT id FROM users WHERE role = 'admin')) as admin_permissions;

-- عرض الصلاحيات
SELECT 
    u.email,
    u.name,
    u.role,
    p.can_view_dashboard,
    p.can_edit_products,
    p.can_manage_users
FROM users u
LEFT JOIN permissions p ON u.id = p.user_id
ORDER BY u.role DESC, u.created_at ASC;
