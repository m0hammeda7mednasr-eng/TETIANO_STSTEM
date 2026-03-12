# 🗄️ الحصول على Supabase Credentials

## الخطوات:

### 1. اذهب إلى Supabase Dashboard

👉 **https://supabase.com/dashboard**

### 2. اختر مشروعك أو أنشئ مشروع جديد

- إذا لم يكن لديك مشروع: اضغط "New Project"
- اختر Organization
- اسم المشروع: `tetiano-system`
- كلمة مرور قاعدة البيانات: (احفظها!)
- المنطقة: اختر الأقرب لك

### 3. احصل على الـ Credentials

بعد إنشاء المشروع:

- اذهب إلى **Settings** (الترس في الشريط الجانبي)
- اختر **API**

ستجد:

#### SUPABASE_URL:

```
Project URL: https://abcdefghijklmnop.supabase.co
```

#### SUPABASE_KEY (anon/public):

```
anon public: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### SUPABASE_SERVICE_ROLE_KEY:

```
service_role: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

⚠️ **مهم جداً**:

- **anon key** آمن للاستخدام في Frontend
- **service_role key** سري جداً - استخدمه في Backend فقط!

## 4. إعداد قاعدة البيانات

بعد الحصول على الـ credentials:

1. اذهب إلى **SQL Editor** في Supabase
2. نفذ الملفات بالترتيب:
   - `SETUP_SAFE.sql`
   - `UPDATE_DB_FOR_RBAC.sql`
   - `QUICK_FIX_ANALYTICS_404.sql`
