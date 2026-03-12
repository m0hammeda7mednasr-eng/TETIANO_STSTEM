-- ====================================
-- إعداد آمن للنظام (لا يحذف البيانات الموجودة)
-- ====================================

-- ====================================
-- الخطوة 1: إضافة أعمدة للمستخدمين
-- ====================================

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='role') THEN
        ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='is_active') THEN
        ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- ====================================
-- الخطوة 2: إنشاء جدول permissions (إذا لم يكن موجوداً)
-- ====================================

CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
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

-- ====================================
-- الخطوة 3: إضافة UNIQUE constraint إذا لم يكن موجوداً
-- ====================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'permissions_user_id_key'
    ) THEN
        ALTER TABLE permissions ADD CONSTRAINT permissions_user_id_key UNIQUE (user_id);
    END IF;
END $$;

-- ====================================
-- الخطوة 4: إضافة عمود can_view_profits إذا لم يكن موجوداً
-- ====================================

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='permissions' AND column_name='can_view_profits') THEN
        ALTER TABLE permissions ADD COLUMN can_view_profits BOOLEAN DEFAULT false;
    END IF;
END $$;

-- ====================================
-- الخطوة 5: إنشاء جدول daily_reports
-- ====================================

CREATE TABLE IF NOT EXISTS daily_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    report_date DATE NOT NULL DEFAULT CURRENT_DATE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    tasks_completed TEXT,
    notes TEXT,
    attachments JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'reviewed')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ====================================
-- الخطوة 6: إنشاء جدول access_requests
-- ====================================

CREATE TABLE IF NOT EXISTS access_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    permission_requested VARCHAR(100) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ====================================
-- الخطوة 7: إضافة عمود cost_price للمنتجات
-- ====================================

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='products' AND column_name='cost_price') THEN
        ALTER TABLE products ADD COLUMN cost_price DECIMAL(10, 2) DEFAULT 0;
    END IF;
END $$;

-- ====================================
-- الخطوة 8: إنشاء Indexes
-- ====================================

CREATE INDEX IF NOT EXISTS idx_permissions_user_id ON permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_user_id ON daily_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_access_requests_user_id ON access_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ====================================
-- الخطوة 9: إنشاء Triggers
-- ====================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_permissions_updated_at ON permissions;
CREATE TRIGGER update_permissions_updated_at BEFORE UPDATE ON permissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_daily_reports_updated_at ON daily_reports;
CREATE TRIGGER update_daily_reports_updated_at BEFORE UPDATE ON daily_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_access_requests_updated_at ON access_requests;
CREATE TRIGGER update_access_requests_updated_at BEFORE UPDATE ON access_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ====================================
-- الخطوة 10: إضافة صلاحيات للمستخدمين الموجودين
-- ====================================

-- إضافة صلاحيات افتراضية للمستخدمين الذين ليس لديهم صلاحيات
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN SELECT id FROM users LOOP
        INSERT INTO permissions (user_id, can_view_dashboard, can_view_products, can_view_orders, can_view_customers)
        VALUES (user_record.id, true, true, true, true)
        ON CONFLICT (user_id) DO NOTHING;
    END LOOP;
END $$;

-- ====================================
-- الخطوة 11: منح صلاحيات كاملة للمدراء
-- ====================================

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

-- ====================================
-- الخطوة 12: إنشاء مدير إذا لم يكن موجوداً
-- ====================================

DO $$
DECLARE
    admin_count INTEGER;
    first_user_id UUID;
BEGIN
    SELECT COUNT(*) INTO admin_count FROM users WHERE role = 'admin';
    
    IF admin_count = 0 THEN
        SELECT id INTO first_user_id FROM users ORDER BY created_at ASC LIMIT 1;
        
        IF first_user_id IS NOT NULL THEN
            UPDATE users SET role = 'admin' WHERE id = first_user_id;
            
            -- تحديث صلاحيات المدير الجديد
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
            WHERE user_id = first_user_id;
            
            RAISE NOTICE 'تم تحويل أول مستخدم إلى مدير: %', first_user_id;
        END IF;
    END IF;
END $$;

-- ====================================
-- الخطوة 13: عرض النتائج
-- ====================================

SELECT 
    '✅ تم الإعداد بنجاح!' as status,
    (SELECT COUNT(*) FROM users) as total_users,
    (SELECT COUNT(*) FROM users WHERE role = 'admin') as admin_users,
    (SELECT COUNT(*) FROM permissions) as total_permissions,
    (SELECT COUNT(*) FROM daily_reports) as total_reports,
    (SELECT COUNT(*) FROM access_requests) as total_requests;

-- عرض المدراء
SELECT 
    '👨‍💼 حسابات المدراء:' as info,
    email,
    name,
    role,
    is_active,
    created_at
FROM users 
WHERE role = 'admin'
ORDER BY created_at ASC;

-- عرض الصلاحيات
SELECT 
    '📋 الصلاحيات:' as info,
    u.email,
    u.name,
    u.role,
    p.can_manage_users,
    p.can_edit_products,
    p.can_view_profits
FROM users u
LEFT JOIN permissions p ON u.id = p.user_id
ORDER BY u.role DESC, u.created_at ASC
LIMIT 10;
