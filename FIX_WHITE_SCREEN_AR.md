# حل مشكلة الشاشة البيضاء - 403 Forbidden ✅

## المشكلة

الموقع بيفتح أبيض والـ Console بيظهر الأخطاء التالية:

- ❌ `403 Forbidden` على `/api/daily-reports/all`
- ❌ `403 Forbidden` على `/api/access-requests/all`
- ❌ `401 Unauthorized` على `/api/shopify/sync`

## السبب

المستخدم اللي داخل **مش Admin**! الـ Dashboard بيحاول يجيب بيانات تحتاج صلاحيات Admin لكن اليوزر مش عنده الصلاحيات دي.

## الحل

### 1. تحديث AuthContext ✅

أضفنا `isAdmin` في الـ AuthContext عشان نعرف إذا كان اليوزر admin ولا لأ:

- أضفنا `useState` للـ `isAdmin`
- أضفنا endpoint جديد `/api/users/me` عشان نجيب معلومات اليوزر بدون ما نحتاج admin permissions
- بنجيب الـ `role` من الـ database ونحدد `isAdmin` على أساسه

### 2. إضافة Endpoint جديد في Backend ✅

أضفنا `GET /api/users/me` في `backend/src/routes/users.js`:

- بيجيب معلومات اليوزر الحالي (id, email, name, role)
- مش محتاج admin permissions
- بيستخدم `req.user.id` من التوكن

### 3. تحديث المستخدم ليكون Admin 🔧

**خطوات التنفيذ:**

#### الطريقة 1: من Supabase Dashboard

1. افتح Supabase Dashboard
2. اذهب إلى Table Editor
3. افتح جدول `users`
4. ابحث عن المستخدم بتاعك (بالبريد الإلكتروني)
5. غير الـ `role` من `employee` إلى `admin`
6. احفظ التغييرات

#### الطريقة 2: باستخدام SQL

1. افتح ملف `CHECK_AND_FIX_ADMIN.sql`
2. استبدل `YOUR_EMAIL_HERE` بالبريد الإلكتروني بتاعك
3. نفذ الـ SQL في Supabase SQL Editor
4. تأكد إن الـ role اتغير لـ `admin`

```sql
-- مثال
UPDATE users
SET role = 'admin'
WHERE email = 'your-email@example.com';
```

### 4. تحديث الصلاحيات

بعد ما تخلي اليوزر admin، نفذ الـ SQL ده عشان تضيف كل الصلاحيات:

```sql
INSERT INTO permissions (
  user_id,
  can_view_dashboard,
  can_view_products,
  can_edit_products,
  can_view_orders,
  can_edit_orders,
  can_view_customers,
  can_edit_customers,
  can_manage_users,
  can_manage_settings,
  can_view_profits
)
SELECT
  id,
  true, true, true, true, true,
  true, true, true, true, true
FROM users
WHERE role = 'admin'
AND id NOT IN (SELECT user_id FROM permissions)
ON CONFLICT (user_id) DO UPDATE SET
  can_view_dashboard = true,
  can_view_products = true,
  can_edit_products = true,
  can_view_orders = true,
  can_edit_orders = true,
  can_view_customers = true,
  can_edit_customers = true,
  can_manage_users = true,
  can_manage_settings = true,
  can_view_profits = true;
```

### 5. إعادة تحميل الصفحة

بعد ما تعمل التغييرات:

1. امسح الـ localStorage: `localStorage.clear()` في Console
2. أعد تسجيل الدخول
3. الموقع هيشتغل صح والـ Dashboard هيظهر كل البيانات

## التحقق من النجاح

بعد التنفيذ، تأكد من:

- ✅ الموقع بيفتح بدون شاشة بيضاء
- ✅ Dashboard بيظهر كل الإحصائيات
- ✅ مفيش 403 errors في Console
- ✅ Sidebar بيظهر كل القوائم (Users Management, Tasks Management, Daily Reports)
- ✅ زر "مزامنة البيانات" شغال

## ملاحظات مهمة

- الـ `isAdmin` دلوقتي متاح في كل الـ components عن طريق `useAuth()`
- استخدم `const { isAdmin } = useAuth()` عشان تتحقق من صلاحيات Admin
- الـ Dashboard بيحاول يجيب بيانات admin-only، فلازم اليوزر يكون admin
- لو عندك مستخدمين تانيين، ممكن تخليهم employees وهيشوفوا صفحات محدودة بس

## الملفات المعدلة

1. ✅ `frontend/src/context/AuthContext.jsx` - أضفنا isAdmin
2. ✅ `backend/src/routes/users.js` - أضفنا GET /api/users/me
3. 🔧 `CHECK_AND_FIX_ADMIN.sql` - SQL لتحديث المستخدم

## الخطوة التالية

**نفذ الـ SQL في Supabase عشان تخلي المستخدم admin، وبعدين أعد تسجيل الدخول!**
