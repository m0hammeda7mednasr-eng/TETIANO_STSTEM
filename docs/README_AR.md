# نظام إدارة متاجر Shopify 🛍️

نظام متكامل لإدارة متاجر Shopify مع لوحة تحكم احترافية باللغة العربية.

## المميزات ✨

- 🔐 نظام تسجيل دخول وإنشاء حسابات آمن
- 📊 لوحة تحكم تفاعلية مع إحصائيات مباشرة
- 🛒 إدارة الطلبات والمنتجات والعملاء
- 🔄 مزامنة تلقائية مع Shopify
- 🌐 واجهة عربية كاملة (RTL)
- 📱 تصميم متجاوب يعمل على جميع الأجهزة

## التقنيات المستخدمة 🛠️

### Frontend

- React 18
- React Router v6
- Tailwind CSS
- Axios
- Recharts (للرسوم البيانية)
- Lucide React (للأيقونات)

### Backend

- Node.js + Express
- Supabase (PostgreSQL)
- JWT Authentication
- Shopify OAuth2

## التثبيت والإعداد 🚀

### 1. تثبيت المتطلبات

```bash
# تثبيت جميع الحزم
npm run install-all
```

### 2. إعداد قاعدة البيانات

1. اذهب إلى [Supabase](https://supabase.com)
2. أنشئ مشروع جديد
3. افتح SQL Editor
4. نفذ الكود الموجود في ملف `SUPABASE_SETUP.md`

### 3. إعداد ملف البيئة

افتح ملف `backend/.env` وحدّث القيم:

```env
# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key

# Shopify (اختياري - للربط مع Shopify)
SHOPIFY_API_KEY=your_shopify_client_id
SHOPIFY_API_SECRET=your_shopify_client_secret
SHOPIFY_REDIRECT_URI=http://localhost:5000/api/shopify/callback

# JWT
JWT_SECRET=your_strong_secret_key

# Server
PORT=5000
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

### 4. تشغيل المشروع

```bash
# تشغيل Frontend و Backend معاً
npm run dev
```

سيعمل المشروع على:

- Frontend: http://localhost:3000
- Backend: http://localhost:5000

## الاستخدام 📖

### 1. إنشاء حساب

1. افتح http://localhost:3000
2. اضغط على "إنشاء حساب جديد"
3. املأ البيانات المطلوبة
4. سجل دخول

### 2. استكشاف لوحة التحكم

- **لوحة التحكم**: عرض الإحصائيات والرسوم البيانية
- **الطلبات**: إدارة طلبات المتجر
- **المنتجات**: عرض وإدارة المنتجات
- **العملاء**: إدارة بيانات العملاء
- **الإعدادات**: ربط متجر Shopify

### 3. ربط متجر Shopify (اختياري)

⚠️ **مهم**: Shopify لا يقبل `localhost` في Redirect URLs!

**الحل السريع:**

1. اقرأ ملف `FIX_SHOPIFY_LOCALHOST.md` للحل الكامل
2. استخدم ngrok أو Cloudflare Tunnel
3. شغل السكريبت: `setup-ngrok.bat` أو `setup-cloudflare.bat`

للتفاصيل الكاملة، اتبع التعليمات في:

- `FIX_SHOPIFY_LOCALHOST.md` - حل مشكلة localhost
- `NGROK_SETUP_AR.md` - دليل ngrok المفصل
- `SHOPIFY_SETUP_AR.md` - دليل إعداد Shopify

## البنية الهيكلية 📁

```
shopify-store-manager/
├── frontend/                 # تطبيق React
│   ├── src/
│   │   ├── components/      # المكونات المشتركة
│   │   ├── pages/           # صفحات التطبيق
│   │   └── utils/           # أدوات مساعدة
│   └── public/
├── backend/                  # خادم Express
│   ├── src/
│   │   ├── routes/          # مسارات API
│   │   ├── models/          # نماذج البيانات
│   │   └── services/        # خدمات الأعمال
│   └── .env                 # متغيرات البيئة
└── package.json
```

## الأوامر المتاحة 💻

```bash
# تثبيت جميع الحزم
npm run install-all

# تشغيل Frontend و Backend معاً
npm run dev

# تشغيل Frontend فقط
npm run dev:frontend

# تشغيل Backend فقط
npm run dev:backend

# بناء Frontend للإنتاج
npm run build:frontend
```

## استكشاف الأخطاء 🔧

### مشكلة: "customers.filter is not a function"

**الحل**: امسح cache المتصفح (Ctrl+Shift+Delete) أو اضغط Ctrl+Shift+R

### مشكلة: "Failed to fetch"

**الحل**: تأكد من:

1. Backend شغال على port 5000
2. بيانات Supabase صحيحة في `.env`
3. الجداول موجودة في قاعدة البيانات

### مشكلة: "Invalid credentials"

**الحل**: تأكد من:

1. البريد الإلكتروني وكلمة المرور صحيحة
2. الحساب موجود في قاعدة البيانات

### مشكلة: "redirect_uri is not whitelisted" (Shopify)

**الحل**: Shopify لا يقبل localhost!

1. اقرأ ملف `FIX_SHOPIFY_LOCALHOST.md`
2. استخدم ngrok: شغل `setup-ngrok.bat`
3. أو استخدم Cloudflare: شغل `setup-cloudflare.bat`
4. حدث `.env` بالـ URL الجديد
5. حدث Shopify App Settings

## الأمان 🔒

- ✅ تشفير كلمات المرور باستخدام bcrypt
- ✅ JWT tokens للمصادقة
- ✅ CORS محدد للـ frontend فقط
- ✅ متغيرات البيئة منفصلة
- ⚠️ لا ترفع ملف `.env` على Git

## التطوير المستقبلي 🚧

- [ ] إضافة إشعارات البريد الإلكتروني
- [ ] تقارير متقدمة
- [ ] تنبيهات المخزون
- [ ] تقسيم العملاء
- [ ] سير عمل تلقائي
- [ ] تطبيق موبايل
- [ ] دعم لغات متعددة

## الدعم 💬

إذا واجهت أي مشاكل:

1. تحقق من console المتصفح (F12)
2. تحقق من logs الـ backend في terminal
3. راجع ملفات التوثيق

## الترخيص 📄

MIT License - يمكنك استخدام المشروع بحرية

---

**صُنع بـ ❤️ لأصحاب المتاجر الإلكترونية**
