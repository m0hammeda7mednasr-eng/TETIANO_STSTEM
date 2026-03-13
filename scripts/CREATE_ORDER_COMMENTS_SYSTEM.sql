-- ====================================
-- إنشاء نظام التعليقات الاحترافي للطلبات
-- ====================================

-- 1. إنشاء جدول التعليقات
CREATE TABLE IF NOT EXISTS order_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id BIGINT NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment_text TEXT NOT NULL,
    comment_type VARCHAR(50) DEFAULT 'general' CHECK (comment_type IN ('general', 'status_change', 'payment', 'shipping', 'customer_service', 'internal')),
    is_internal BOOLEAN DEFAULT false, -- للتعليقات الداخلية فقط
    is_pinned BOOLEAN DEFAULT false, -- للتعليقات المهمة
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    edited_at TIMESTAMP WITH TIME ZONE NULL,
    edited_by UUID NULL REFERENCES users(id)
);

-- 2. إنشاء الفهارس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_order_comments_order_id ON order_comments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_comments_user_id ON order_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_order_comments_created_at ON order_comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_comments_type ON order_comments(comment_type);

-- 3. إنشاء trigger لتحديث updated_at
CREATE OR REPLACE FUNCTION update_order_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_order_comments_updated_at
    BEFORE UPDATE ON order_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_order_comments_updated_at();

-- 4. إضافة RLS (Row Level Security) للتعليقات
ALTER TABLE order_comments ENABLE ROW LEVEL SECURITY;

-- 5. إنشاء policies للتحكم في الوصول
-- Policy للقراءة: يمكن للجميع قراءة التعليقات العامة، والأدمن يقرأ كل شيء
CREATE POLICY "Users can view non-internal comments" ON order_comments
    FOR SELECT USING (
        is_internal = false OR 
        auth.uid() IN (SELECT id FROM users WHERE role = 'admin')
    );

-- Policy للإدراج: المستخدمون المسجلون يمكنهم إضافة تعليقات
CREATE POLICY "Authenticated users can insert comments" ON order_comments
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Policy للتحديث: المستخدم يمكنه تعديل تعليقاته فقط، والأدمن يعدل أي تعليق
CREATE POLICY "Users can update own comments or admins can update any" ON order_comments
    FOR UPDATE USING (
        user_id = auth.uid() OR 
        auth.uid() IN (SELECT id FROM users WHERE role = 'admin')
    );

-- Policy للحذف: المستخدم يمكنه حذف تعليقاته فقط، والأدمن يحذف أي تعليق
CREATE POLICY "Users can delete own comments or admins can delete any" ON order_comments
    FOR DELETE USING (
        user_id = auth.uid() OR 
        auth.uid() IN (SELECT id FROM users WHERE role = 'admin')
    );

-- 6. إنشاء view للتعليقات مع بيانات المستخدم
CREATE OR REPLACE VIEW order_comments_with_user AS
SELECT 
    oc.*,
    u.name as user_name,
    u.email as user_email,
    u.role as user_role,
    editor.name as edited_by_name
FROM order_comments oc
LEFT JOIN users u ON oc.user_id = u.id
LEFT JOIN users editor ON oc.edited_by = editor.id
ORDER BY oc.created_at ASC;

-- 7. إضافة بعض التعليقات التجريبية
INSERT INTO order_comments (order_id, user_id, comment_text, comment_type, is_internal) 
SELECT 
    (SELECT shopify_id FROM orders LIMIT 1),
    (SELECT id FROM users WHERE role = 'admin' LIMIT 1),
    'تم استلام الطلب وجاري المراجعة',
    'status_change',
    false
WHERE EXISTS (SELECT 1 FROM orders LIMIT 1) AND EXISTS (SELECT 1 FROM users WHERE role = 'admin' LIMIT 1);

INSERT INTO order_comments (order_id, user_id, comment_text, comment_type, is_internal) 
SELECT 
    (SELECT shopify_id FROM orders LIMIT 1),
    (SELECT id FROM users WHERE role = 'admin' LIMIT 1),
    'العميل طلب تغيير العنوان - تم التواصل معه',
    'customer_service',
    false
WHERE EXISTS (SELECT 1 FROM orders LIMIT 1) AND EXISTS (SELECT 1 FROM users WHERE role = 'admin' LIMIT 1);

INSERT INTO order_comments (order_id, user_id, comment_text, comment_type, is_internal) 
SELECT 
    (SELECT shopify_id FROM orders LIMIT 1),
    (SELECT id FROM users WHERE role = 'admin' LIMIT 1),
    'ملاحظة داخلية: هذا العميل من العملاء المميزين',
    'internal',
    true
WHERE EXISTS (SELECT 1 FROM orders LIMIT 1) AND EXISTS (SELECT 1 FROM users WHERE role = 'admin' LIMIT 1);

-- 8. عرض النتائج
SELECT 
    '✅ تم إنشاء نظام التعليقات بنجاح' as status,
    COUNT(*) as total_comments
FROM order_comments;

-- 9. عرض التعليقات مع بيانات المستخدمين
SELECT 
    comment_text,
    user_name,
    comment_type,
    is_internal,
    created_at
FROM order_comments_with_user
ORDER BY created_at DESC;

-- 10. إحصائيات سريعة
SELECT 
    comment_type,
    COUNT(*) as count,
    COUNT(CASE WHEN is_internal THEN 1 END) as internal_count
FROM order_comments 
GROUP BY comment_type
ORDER BY count DESC;