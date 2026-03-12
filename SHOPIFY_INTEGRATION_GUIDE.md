# Shopify Store Manager - Complete Integration Guide

## 🚀 التطبيق الكامل والشامل

هذا التطبيق متكامل 100% مع جميع الميزات المطلوبة:

### ✅ المتطلبات المكتملة

#### 1. **Frontend متكامل**

- ✅ صفحة تسجيل وتسجيل دخول احترافية
- ✅ لوحة تحكم (Dashboard) بإحصائيات حية
- ✅ صفحة إدارة المنتجات مع عرض مفصل
- ✅ صفحة إدارة الطلبات مع حالات معقدة
- ✅ صفحة إدارة العملاء مع تفاصيل كاملة
- ✅ واجهة مستخدم احترافية (Tailwind CSS)
- ✅ نظام تنقل (Navigation) متقدم
- ✅ Loading states و Error handling

#### 2. **Backend API متكامل**

- ✅ نظام المصادقة (Authentication)
- ✅ حماية المسارات (Protected Routes)
- ✅ APIs لجلب البيانات من Shopify
- ✅ مزامنة البيانات التلقائية
- ✅ Pagination و Filtering
- ✅ معالجة الأخطاء الشاملة

#### 3. **Database متقدم**

- ✅ Schema كامل في Supabase (PostgreSQL)
- ✅ جداول: Users, Products, Orders, Customers
- ✅ Indexes للأداء العالي
- ✅ Row Level Security (RLS)
- ✅ Data Validation و Constraints

#### 4. **تكامل Shopify**

- ✅ OAuth 2.0 Authentication
- ✅ سحب المنتجات من Shopify
- ✅ سحب الطلبات من Shopify
- ✅ سحب العملاء من Shopify
- ✅ مزامنة البيانات الدورية
- ✅ تخزين البيانات في Database

---

## 📋 خطوات الإعداد النهائية

### 1. إعداد Supabase

#### أ. إنشاء Project

```
1. اذهب إلى https://supabase.com
2. Sign up وأنشئ project جديد
3. انتظر حتى ينتهي الإعداد
4. انسخ URL و Anon Key من إعدادات المشروع
```

#### ب. إنشاء الجداول

```sql
-- انسخ جميع الـ SQL commands من ملف DATABASE_SCHEMA.sql
-- اذهب إلى SQL Editor في Supabase
-- الصق الـ Schema وقم بتنفيذه
```

### 2. إعداد Shopify

#### أ. إنشاء Custom App

```
1. اذهب إلى https://partners.shopify.com
2. اختر متجرك (أو أنشئ merchant account)
3. اذهب إلى "Apps and integrations" → "App and sales channel"
4. اختر "Create an app" → "Create app manually"
5. اسم التطبيق: "Store Manager"
6. في "Admin API scopes"، اختر:
   - read_products
   - read_orders
   - read_customers
   - write_orders
7. انسخ API Key و API Secret
8. في "App URL"، أضف: http://localhost:5000/api/shopify/callback
```

#### ب. تفعيل التطبيق

```
- اختر متجرك
- ثبّت التطبيق
- الآن لديك access token
```

### 3. تحديث ملف .env

```bash
# Backend/.env
SHOPIFY_API_KEY=your_api_key_from_partners
SHOPIFY_API_SECRET=your_api_secret_from_partners
SHOPIFY_REDIRECT_URI=http://localhost:5000/api/shopify/callback

SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key

JWT_SECRET=any_random_secret_string_here

PORT=5000
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

### 4. تثبيت المتطلبات

```bash
cd c:\Users\mm56m\OneDrive\Desktop\New\ folder\ \(5\)
npm run install-all
```

### 5. تشغيل التطبيق

```bash
# في Terminal جديد
npm run dev

# أو تشغيل كل واحد بشكل منفصل:
# Terminal 1:
cd backend && npm run dev

# Terminal 2:
cd frontend && npm start
```

---

## 🔑 API Endpoints الرئيسية

### Authentication

```
POST /api/auth/register         - تسجيل مستخدم جديد
POST /api/auth/login            - تسجيل الدخول
POST /api/auth/verify           - التحقق من التوكن
```

### Shopify Integration

```
GET  /api/shopify/auth          - بدء عملية OAuth
GET  /api/shopify/callback      - استقبال Callback من Shopify
GET  /api/shopify/products      - جلب المنتجات
GET  /api/shopify/orders        - جلب الطلبات
GET  /api/shopify/customers     - جلب العملاء
POST /api/shopify/sync          - مزامنة البيانات يدوياً
```

### Dashboard

```
GET  /api/dashboard/stats       - الإحصائيات الأساسية
GET  /api/dashboard/products    - قائمة المنتجات
GET  /api/dashboard/orders      - قائمة الطلبات
GET  /api/dashboard/customers   - قائمة العملاء
```

---

## 📊 هيكل البيانات

### Products Table

```
- id: UUID
- user_id: UUID (Reference to Users)
- shopify_id: string (من Shopify)
- title: string
- description: text
- price: decimal
- inventory_quantity: int
- image_url: string
- sku: string
- data: JSONB (بيانات Shopify الكاملة)
```

### Orders Table

```
- id: UUID
- user_id: UUID
- shopify_id: string
- order_number: int
- customer_name: string
- customer_email: string
- total_price: decimal
- status: string (paid, pending, refunded)
- fulfillment_status: string
- items_count: int
- data: JSONB (بيانات Shopify الكاملة)
```

### Customers Table

```
- id: UUID
- user_id: UUID
- shopify_id: string
- name: string
- email: string
- phone: string
- total_spent: decimal
- orders_count: int
- city, country: string
- data: JSONB
```

---

## 🔐 أمان التطبيق

✅ JWT Token Authentication
✅ Password Hashing (bcryptjs)
✅ CORS Configuration
✅ Row Level Security (RLS)
✅ Protected API Routes
✅ OAuth2 for Shopify
✅ Input Validation
✅ Error Handling

---

## 📱 الميزات الإضافية

- 🔄 **Auto Sync**: مزامنة تلقائية للبيانات من Shopify
- 📊 **Analytics**: رسوم بيانية وإحصائيات حية
- 🔍 **Search & Filter**: بحث متقدم وتصفية البيانات
- 📄 **Pagination**: تقسيم البيانات إلى صفحات
- 🎨 **Responsive Design**: يعمل على جميع الأجهزة
- ⚡ **Performance**: موارد قليلة واستجابة سريعة
- 🌐 **Multi-tenant**: دعم عدة متاجر Shopify

---

## 🛠️ ملفات المشروع الرئيسية

```
frontend/
  ├── src/
  │   ├── pages/
  │   │   ├── Dashboard.jsx
  │   │   ├── Products.jsx
  │   │   ├── Orders.jsx
  │   │   ├── Customers.jsx
  │   │   ├── Login.jsx
  │   │   └── Register.jsx
  │   ├── components/
  │   │   ├── Sidebar.jsx
  │   │   └── ProtectedRoute.jsx
  │   └── App.jsx

backend/
  ├── src/
  │   ├── routes/
  │   │   ├── auth.js
  │   │   ├── shopify.js
  │   │   └── dashboard.js
  │   ├── models/
  │   │   └── index.js
  │   ├── services/
  │   │   └── shopifyService.js
  │   └── server.js
  └── .env

DATABASE_SCHEMA.sql   - كل الجداول والـ Schema
SETUP.md             - دليل الإعداد
README.md            - التوثيق الكامل
```

---

## 🚀 الخطوات التالية

1. ✅ ثبّت جميع المتطلبات
2. ✅ أعد الـ Environment variables
3. ✅ أنشئ جداول Supabase
4. ✅ شغّل التطبيق
5. ✅ انتقل إلى http://localhost:3000
6. ✅ أنشئ حسابك
7. ✅ اربط متجرك على Shopify
8. ✅ مزامنة البيانات من Shopify

---

## 📞 الدعم والمساعدة

إذا واجهت أي مشاكل:

1. تحقق من ملف `.env`
2. تأكد من تشغيل Backend
3. تحقق من اتصالك بـ Supabase
4. انظر إلى سجل الأخطاء في Terminal

---

**تم الانتهاء! تطبيقك متكامل وجاهز للاستخدام! 🎉**
