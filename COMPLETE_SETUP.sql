-- ====================================
-- إعداد كامل لنظام إدارة متجر Shopify
-- نفذ هذا الملف بالكامل في Supabase SQL Editor
-- ====================================

-- ====================================
-- الخطوة 1: نظام الصلاحيات والمستخدمين
-- ====================================

-- إضافة عمود role إلى جدول users إذا لم يكن موجوداً
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='role') THEN
        ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user';
    END IF;
END $$;

-- إضافة عمود is_active إلى جدول users إذا لم يكن موجوداً
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='is_active') THEN
        ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- إنشاء جدول permissions
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

-- ====================================
-- الخطوة 2: التقارير اليومية وطلبات الصلاحيات
-- ====================================

-- إنشاء جدول daily_reports
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

-- إنشاء جدول access_requests
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
-- الخطوة 3: سعر التكلفة والأرباح
-- ====================================

-- إضافة عمود cost_price إلى جدول products
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='products' AND column_name='cost_price') THEN
        ALTER TABLE products ADD COLUMN cost_price DECIMAL(10, 2) DEFAULT 0;
    END IF;
END $$;

-- إضافة عمود محسوب للربح
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='products' AND column_name='profit_margin') THEN
        ALTER TABLE products ADD COLUMN profit_margin DECIMAL(10, 2) 
        GENERATED ALWAYS AS (
            CASE 
                WHEN cost_price > 0 THEN ((price - cost_price) / cost_price * 100)
                ELSE 0
            END
        ) STORED;
    END IF;
END $$;

-- ====================================
-- الخطوة 4: إنشاء Indexes للأداء
-- ====================================

CREATE INDEX IF NOT EXISTS idx_permissions_user_id ON permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_user_id ON daily_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_access_requests_user_id ON access_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ====================================
-- الخطوة 5: إنشاء Triggers للتحديث التلقائي
-- ====================================

-- Trigger لتحديث updated_at في permissions
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
-- الخطوة 6: إنشاء صلاحيات افتراضية للمستخدمين الحاليين
-- ====================================

-- إضافة صلاحيات افتراضية لجميع المستخدمين الذين ليس لديهم صلاحيات
INSERT INTO permissions (user_id, can_view_dashboard, can_view_products, can_view_orders, can_view_customers)
SELECT id, true, true, true, true
FROM users
WHERE id NOT IN (SELECT user_id FROM permissions)
ON CONFLICT (user_id) DO NOTHING;

-- ====================================
-- الخطوة 7: التحقق من النجاح
-- ====================================

-- عرض عدد المستخدمين
SELECT 'عدد المستخدمين:' as info, COUNT(*) as count FROM users;

-- عرض عدد الصلاحيات
SELECT 'عدد الصلاحيات:' as info, COUNT(*) as count FROM permissions;

-- عرض المدراء
SELECT 'المدراء:' as info, email, name, role FROM users WHERE role = 'admin';

-- ====================================
-- الخطوة 8: (اختياري) إنشاء مدير إذا لم يكن موجوداً
-- ====================================

-- إذا لم يكن هناك مدير، قم بتحويل أول مستخدم إلى مدير
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
            RAISE NOTICE 'تم تحويل أول مستخدم إلى مدير: %', first_user_id;
        END IF;
    END IF;
END $$;

-- ====================================
-- الخطوة 9: عرض النتائج النهائية
-- ====================================

SELECT 
    '✅ تم الإعداد بنجاح!' as status,
    (SELECT COUNT(*) FROM users) as total_users,
    (SELECT COUNT(*) FROM users WHERE role = 'admin') as admin_users,
    (SELECT COUNT(*) FROM permissions) as total_permissions,
    (SELECT COUNT(*) FROM daily_reports) as total_reports,
    (SELECT COUNT(*) FROM access_requests) as total_requests;

-- ====================================
-- ملاحظات مهمة:
-- ====================================
-- 
-- 1. إذا لم يكن لديك أي مستخدم، قم بالتسجيل أولاً من /register
-- 2. لتحويل مستخدم معين إلى مدير، نفذ:
--    UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
-- 3. لمعرفة حساب المدير، نفذ:
--    SELECT id, email, name, role FROM users WHERE role = 'admin';
-- 4. المدير لا يحتاج صلاحيات في جدول permissions
--    لأنه يملك صلاحيات كاملة تلقائياً
-- 
-- ====================================
-- للمزيد من المعلومات:
-- ====================================
-- 
-- - اقرأ START_HERE.md للبداية السريعة
-- - اقرأ ADMIN_GUIDE_AR.md للدليل الشامل
-- - اقرأ FINAL_CHANGES_SUMMARY.md لملخص التغييرات
-- 
-- ====================================
