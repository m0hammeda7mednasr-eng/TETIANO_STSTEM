# TETIANO SYSTEM - نظام إدارة متاجر Shopify

## 🎯 نظرة عامة

نظام إدارة متاجر Shopify احترافي مع نظام صلاحيات متقدم وتقارير شاملة.

## ⚡ الميزات الرئيسية

- 🔐 **نظام صلاحيات متعدد المستويات** (RBAC)
- 🏪 **دعم متاجر متعددة** (Multi-store)
- 📊 **تحليلات وتقارير متقدمة**
- 📝 **نظام التقارير اليومية**
- 🛡️ **أمان على مستوى قاعدة البيانات** (RLS)
- 🔗 **تكامل كامل مع Shopify API**

## 🛠️ التقنيات المستخدمة

### Backend

- Node.js + Express.js
- Supabase (PostgreSQL)
- JWT Authentication
- Row-Level Security (RLS)

### Frontend

- React.js
- Bootstrap
- Axios

## 🚀 التشغيل السريع

### 1. تثبيت المكتبات

```bash
npm run install-all
```

### 2. إعداد قاعدة البيانات

```bash
# نفذ هذه الملفات في Supabase SQL Editor بالترتيب:
# 1. SETUP_SAFE.sql
# 2. UPDATE_DB_FOR_RBAC.sql
# 3. QUICK_FIX_ANALYTICS_404.sql
```

### 3. إعداد متغيرات البيئة

```bash
# انسخ backend/.env.example إلى backend/.env
# واملأ البيانات المطلوبة
```

### 4. تشغيل المشروع

```bash
npm run dev
```

## 📱 الوصول للنظام

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000

## 👤 حسابات الاختبار

### Admin Account

- Email: `admin@analytics.com`
- Password: `password`

## 📋 نظام الصلاحيات

### للمدراء (Admin):

- إدارة المستخدمين والصلاحيات
- مراجعة التقارير اليومية
- تحليلات متقدمة
- إدارة المتاجر المتعددة

### للمستخدمين العاديين:

- كتابة التقارير اليومية
- طلب صلاحيات إضافية
- عرض البيانات حسب الصلاحيات

## 🗂️ هيكل المشروع

```
TETIANO_SYSTEM/
├── backend/                 # Node.js Backend
│   ├── src/
│   │   ├── routes/         # API Routes
│   │   ├── middleware/     # Auth & Permissions
│   │   ├── models/         # Database Models
│   │   └── services/       # Business Logic
│   └── package.json
├── frontend/               # React Frontend
│   ├── src/
│   │   ├── components/     # React Components
│   │   ├── pages/          # Page Components
│   │   └── services/       # API Services
│   └── package.json
├── *.sql                   # Database Migrations
└── *_AR.md                # Arabic Documentation
```

## 📊 API Endpoints

- `POST /api/auth/login` - تسجيل الدخول
- `GET /api/dashboard/stats` - إحصائيات عامة
- `GET /api/dashboard/analytics` - تحليلات متقدمة (Admin only)
- `GET /api/users` - إدارة المستخدمين (Admin only)
- `POST /api/daily-reports` - التقارير اليومية
- `POST /api/access-requests` - طلبات الصلاحيات

## 🔧 إعداد Shopify

1. إنشاء Shopify App في Partner Dashboard
2. إضافة Credentials في `.env`
3. إعداد OAuth Callback URLs

## 📚 الوثائق

- [دليل المدير الشامل](ADMIN_GUIDE_AR.md)
- [دليل إعداد Shopify](SHOPIFY_SETUP_AR.md)
- [دليل استكشاف الأخطاء](ADMIN_TROUBLESHOOTING_AR.md)

## 🤝 المساهمة

1. Fork المشروع
2. إنشاء branch جديد (`git checkout -b feature/amazing-feature`)
3. Commit التغييرات (`git commit -m 'Add amazing feature'`)
4. Push للـ branch (`git push origin feature/amazing-feature`)
5. فتح Pull Request

## 📄 الترخيص

هذا المشروع مرخص تحت رخصة MIT - راجع ملف [LICENSE](LICENSE) للتفاصيل.

## 👨‍💻 المطور

تم تطوير هذا النظام بواسطة فريق TETIANO

---

**🚀 نظام TETIANO - حلول إدارة المتاجر الإلكترونية الاحترافية**
