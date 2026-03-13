-- ====================================
-- إعداد كامل لجداول Shopify
-- ====================================

-- 1. إنشاء جدول stores إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  shopify_domain VARCHAR(255),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. إنشاء جدول user_stores إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS user_stores (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, store_id)
);

-- 3. إنشاء جدول shopify_tokens مع جميع الأعمدة المطلوبة
CREATE TABLE IF NOT EXISTS shopify_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  shop_domain VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL,
  scope TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, shop_domain)
);

-- 4. إضافة الأعمدة المفقودة إذا كان الجدول موجود بالفعل
ALTER TABLE shopify_tokens 
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;

-- 5. إنشاء جدول shopify_credentials إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS shopify_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  api_key VARCHAR(255) NOT NULL,
  api_secret VARCHAR(255) NOT NULL,
  webhook_secret VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. إضافة Indexes للأداء
CREATE INDEX IF NOT EXISTS idx_shopify_tokens_user_id ON shopify_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_shopify_tokens_store_id ON shopify_tokens(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_tokens_shop_domain ON shopify_tokens(shop_domain);
CREATE INDEX IF NOT EXISTS idx_user_stores_user_id ON user_stores(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stores_store_id ON user_stores(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_credentials_user_id ON shopify_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_shopify_credentials_store_id ON shopify_credentials(store_id);

-- 7. إضافة store_id للجداول الأخرى إذا لم تكن موجودة
ALTER TABLE products ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);

-- 8. إنشاء متجر افتراضي إذا لم يكن موجوداً
INSERT INTO stores (name, shopify_domain, created_by)
SELECT 
    'Default Store',
    'default-store.myshopify.com',
    (SELECT id FROM users WHERE role = 'admin' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM stores);

-- 9. ربط جميع المستخدمين بالمتجر الافتراضي
INSERT INTO user_stores (user_id, store_id)
SELECT 
    u.id,
    s.id
FROM users u
CROSS JOIN stores s
WHERE NOT EXISTS (
    SELECT 1 FROM user_stores us 
    WHERE us.user_id = u.id AND us.store_id = s.id
);

-- 10. التحقق من النتائج
SELECT 'Stores created:' as info, COUNT(*) as count FROM stores
UNION ALL
SELECT 'User-Store mappings:' as info, COUNT(*) as count FROM user_stores
UNION ALL
SELECT 'Shopify tokens table ready:' as info, 
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns 
         WHERE table_name = 'shopify_tokens' AND column_name = 'store_id'
       ) THEN 1 ELSE 0 END as count;