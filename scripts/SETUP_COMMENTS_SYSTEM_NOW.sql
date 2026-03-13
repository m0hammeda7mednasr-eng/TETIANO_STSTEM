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
    is_internal BOOLEAN DEFAULT false,
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    edited_at TIMESTAMP WITH TIME ZONE NULL,
    edited_by UUID NULL REFERENCES users(id)
);

-- 2. إنشاء الفهارس
CREATE INDEX IF NOT EXISTS idx_order_comments_order_id ON order_comments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_comments_user_id ON order_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_order_comments_created_at ON order_comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_comments_type ON order_comments(comment_type);

-- 3. إنشاء view للتعليقات مع بيانات المستخدم
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

-- 4. إضافة تعليق تجريبي
INSERT INTO order_comments (order_id, user_id, comment_text, comment_type, is_internal) 
SELECT 
    (SELECT shopify_id FROM orders LIMIT 1),
    (SELECT id FROM users WHERE role = 'admin' LIMIT 1),
    'مرحباً! هذا تعليق تجريبي على الطلب. النظام يعمل بشكل ممتاز! 🎉',
    'general',
    false
WHERE EXISTS (SELECT 1 FROM orders LIMIT 1) AND EXISTS (SELECT 1 FROM users WHERE role = 'admin' LIMIT 1);

-- 5. عرض النتائج
SELECT 
    '✅ تم إنشاء نظام التعليقات بنجاح' as status,
    COUNT(*) as total_comments
FROM order_comments;

-- 6. عرض التعليقات مع بيانات المستخدمين
SELECT 
    comment_text,
    user_name,
    comment_type,
    is_internal,
    created_at
FROM order_comments_with_user
ORDER BY created_at DESC;