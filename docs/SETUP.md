# Shopify Store Manager - Setup Guide

## قائمة البدء السريع

### 1. تثبيت المتطلبات

```bash
# في المجلد الرئيسي
npm run install-all
```

### 2. إعداد متغيرات البيئة

قم بإنشاء ملف `.env` في مجلد `backend`:

```env
# Shopify Configuration
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_REDIRECT_URI=http://localhost:5000/api/shopify/callback

# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key

# JWT Secret
JWT_SECRET=your_super_secret_jwt_key

# Server Configuration
PORT=5000
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

### 3. الحصول على مفاتيح Shopify

1. اذهب إلى [Shopify Partners Dashboard](https://partners.shopify.com)
2. أنشئ تطبيق Custom App جديد
3. فعّل الصلاحيات المطلوبة
4. انسخ API Key و API Secret

### 4. إعداد Supabase

1. اذهب إلى [Supabase](https://supabase.com)
2. أنشئ project جديد
3. انسخ Project URL و Anon Key
4. أنشئ الجداول التالية:

```sql
-- Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR UNIQUE NOT NULL,
  password VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  shopify_access_token VARCHAR,
  shopify_shop VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Customers Table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  name VARCHAR NOT NULL,
  email VARCHAR,
  total_orders INT DEFAULT 0,
  total_spent DECIMAL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User Stats Table
CREATE TABLE user_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) UNIQUE,
  total_sales DECIMAL DEFAULT 0,
  total_orders INT DEFAULT 0,
  total_products INT DEFAULT 0,
  total_customers INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 5. تشغيل التطبيق

```bash
# تشغيل كلا السيرفر والـ Frontend
npm run dev

# أو تشغيل كل واحد بشكل منفصل:

# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm start
```

### 6. الوصول إلى التطبيق

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **API Health Check**: http://localhost:5000/api/health

## الميزات الرئيسية

### لوحة التحكم الإدارية

- 📊 إحصائيات المبيعات
- 📦 إدارة المنتجات
- 👥 إدارة العملاء
- 📋 إدارة الطلبات
- 📈 الرسوم البيانية والتقارير

### التكامل مع Shopify

- 🔐 مصادقة OAuth
- 📤 مزامنة المنتجات تلقائياً
- 📥 مزامنة الطلبات تلقائياً
- 👤 مزامنة بيانات العملاء

### واجهة المستخدم المحترفة

- 📱 تصميم متجاوب (Responsive)
- 🎨 نمط حديث وجميل
- ⚡ أداء سريع وسلس
- 🌙 دعم المظهر الليلي (قريباً)

## حل المشاكل الشائعة

### المشكلة: `CORS Error`

**الحل**: تأكد من أن `FRONTEND_URL` في `.env` صحيح وأن CORS مفعل في `server.js`

### المشكلة: `Cannot connect to Supabase`

**الحل**: تحقق من `SUPABASE_URL` و `SUPABASE_KEY`

### المشكلة: `Shopify OAuth fails`

**الحل**: تأكد من أن `SHOPIFY_REDIRECT_URI` مطابق تماماً في لوحة تحكم Shopify

## أوامر مفيدة

```bash
# تثبيت المتطلبات فقط
npm run install-all

# تشغيل وضع التطوير
npm run dev

# بناء للإنتاج
npm run build

# تشغيل الـ Frontend فقط
npm run dev:frontend

# تشغيل الـ Backend فقط
npm run dev:backend
```

## الملفات المهمة

- `backend/.env` - متغيرات البيئة للـ Backend
- `backend/src/server.js` - نقطة الدخول الرئيسية للـ Backend
- `frontend/src/App.jsx` - المكون الرئيسي للـ Frontend
- `README.md` - التوثيق الكامل

## الدعم والمشاكل

إذا واجهت أي مشاكل:

1. تحقق من سجل الأخطاء في Terminal
2. تأكد من تثبيت Node.js بشكل صحيح
3. افسح ذاكرة التخزين المؤقت: `npm cache clean --force`
4. اعد تثبيت المتطلبات: `npm run install-all`

---

**Happy Coding! 🚀**
