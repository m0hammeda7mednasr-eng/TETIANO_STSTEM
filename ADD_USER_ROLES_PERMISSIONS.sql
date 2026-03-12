-- إضافة عمود role للمستخدمين
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- تحديث المستخدمين الموجودين ليكونوا admins
UPDATE users SET role = 'admin' WHERE role IS NULL OR role = 'user';

-- جدول الصلاحيات
CREATE TABLE IF NOT EXISTS permissions (
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

-- إضافة صلاحيات كاملة للـ admins الموجودين
INSERT INTO permissions (user_id, can_view_dashboard, can_view_products, can_edit_products, can_view_orders, can_edit_orders, can_view_customers, can_edit_customers, can_manage_users, can_manage_settings, can_view_profits)
SELECT id, true, true, true, true, true, true, true, true, true, true
FROM users
WHERE role = 'admin'
ON CONFLICT (user_id) DO NOTHING;

-- Index للبحث السريع
CREATE INDEX IF NOT EXISTS idx_permissions_user_id ON permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_created_by ON users(created_by);
