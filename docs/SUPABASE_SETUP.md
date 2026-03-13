# إعداد قاعدة البيانات - Supabase

## الخطوات المطلوبة:

### 1. إنشاء الجداول في Supabase

1. اذهب إلى لوحة تحكم Supabase: https://supabase.com/dashboard
2. اختر مشروعك
3. من القائمة الجانبية، اختر **SQL Editor**
4. انسخ والصق الكود التالي وشغله:

```sql
-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  shopify_shop VARCHAR(255),
  shopify_access_token VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  shopify_id VARCHAR(255),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  vendor VARCHAR(255),
  product_type VARCHAR(255),
  image_url TEXT,
  price DECIMAL(10, 2),
  currency VARCHAR(3) DEFAULT 'USD',
  sku VARCHAR(255),
  inventory_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  data JSONB,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  shopify_id VARCHAR(255),
  order_number INTEGER,
  customer_name VARCHAR(255),
  customer_email VARCHAR(255),
  total_price DECIMAL(10, 2),
  subtotal_price DECIMAL(10, 2),
  total_tax DECIMAL(10, 2),
  total_discounts DECIMAL(10, 2),
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(50),
  fulfillment_status VARCHAR(50),
  items_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  data JSONB,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  shopify_id VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  total_spent DECIMAL(10, 2),
  orders_count INTEGER DEFAULT 0,
  default_address VARCHAR(255),
  city VARCHAR(100),
  country VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  data JSONB,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create shopify_tokens table
CREATE TABLE IF NOT EXISTS shopify_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  shop VARCHAR(255) NOT NULL,
  access_token VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, shop)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_products_shopify_id ON products(shopify_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_shopify_id ON orders(shopify_id);
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_shopify_id ON customers(shopify_id);
CREATE INDEX IF NOT EXISTS idx_shopify_tokens_user_id ON shopify_tokens(user_id);
```

### 2. تعطيل Row Level Security (RLS)

بما أننا نستخدم JWT authentication وليس Supabase Auth، نحتاج لتعطيل RLS:

```sql
-- Disable RLS for all tables
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_tokens DISABLE ROW LEVEL SECURITY;
```

### 3. التحقق من الإعداد

بعد تنفيذ الأوامر، تحقق من:

- ✅ تم إنشاء 5 جداول: users, products, orders, customers, shopify_tokens
- ✅ تم إنشاء الـ indexes
- ✅ تم تعطيل RLS

## ملاحظات مهمة:

1. **الأمان**: تأكد من تغيير `JWT_SECRET` في ملف `.env` إلى قيمة قوية وعشوائية
2. **الاتصال**: تأكد من أن بيانات الاتصال في `backend/.env` صحيحة
3. **الصلاحيات**: تأكد من استخدام `anon` key وليس `service_role` key في الـ `.env`

## اختبار الاتصال:

بعد إعداد قاعدة البيانات:

1. شغل المشروع: `npm run dev`
2. افتح المتصفح على: http://localhost:3000
3. سجل حساب جديد
4. إذا نجح التسجيل، فالإعداد صحيح! ✅
