# دليل الاختبار الكامل - Shopify Store Management System

## 📋 المحتويات

1. [التحقق من تشغيل السيرفرات](#التحقق-من-تشغيل-السيرفرات)
2. [اختبار الـ Backend API](#اختبار-الbackend-api)
3. [اختبار الـ Frontend](#اختبار-الfrontend)
4. [اختبار ميزات المدير](#اختبار-ميزات-المدير)
5. [المشاكل الشائعة وحلولها](#المشاكل-الشائعة-وحلولها)

---

## 🚀 التحقق من تشغيل السيرفرات

### 1. تشغيل الـ Backend

```bash
cd backend
npm run dev
```

**النتيجة المتوقعة:**

```
✅ Server running on port 5000
```

### 2. تشغيل الـ Frontend

```bash
cd frontend
npm start
```

**النتيجة المتوقعة:**

```
Compiled successfully!
You can now view shopify-store-frontend in the browser.
  Local:            http://localhost:3000
```

### 3. اختبار سريع

```powershell
# تشغيل سكريبت الاختبار الكامل
./complete-test.ps1
```

---

## 🔧 اختبار الـ Backend API

### 1. Health Check

```powershell
curl http://localhost:5000/api/health
```

**النتيجة المتوقعة:**

```json
{ "status": "OK", "message": "Server is running" }
```

### 2. التسجيل (Register)

```powershell
$body = @{
    email = "testadmin@example.com"
    password = "admin123456"
    name = "Test Admin"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/auth/register" -Method Post -Body $body -ContentType "application/json"
```

### 3. تسجيل الدخول (Login)

```powershell
$body = @{
    email = "testadmin@example.com"
    password = "admin123456"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/login" -Method Post -Body $body -ContentType "application/json"
$token = $response.token
```

### 4. اختبار API المحمية (Protected APIs)

```powershell
$headers = @{
    "Authorization" = "Bearer $token"
}

# Dashboard Stats
Invoke-RestMethod -Uri "http://localhost:5000/api/dashboard/stats" -Method Get -Headers $headers

# Users (Admin only)
Invoke-RestMethod -Uri "http://localhost:5000/api/users" -Method Get -Headers $headers

# Permissions
Invoke-RestMethod -Uri "http://localhost:5000/api/users/me/permissions" -Method Get -Headers $headers
```

---

## 🌐 اختبار الـ Frontend

### 1. فتح التطبيق

افتح المتصفح على: **http://localhost:3000**

### 2. تسجيل الدخول

- **Email:** testadmin@example.com
- **Password:** admin123456

### 3. التحقق من الصفحات

#### ✅ صفحة Dashboard

يجب أن تحتوي على:

- **Stats Cards:** إجمالي المبيعات، الطلبات، المنتجات، العملاء
- **Admin Badge:** "👨‍💼 مدير النظام" (للمدير فقط)
- **زر إدارة المستخدمين** (للمدير فقط)
- **Admin Quick Actions Cards:** (للمدير فقط)
  - كارت المستخدمين (بنفسجي)
  - كارت المهام (أزرق)
  - كارت التقارير (أخضر)
- **Pending Requests Section** (للمدير فقط)
- **Recent Reports Section** (للمدير فقط)
- **Charts:** اتجاه المبيعات والطلبات

#### ✅ صفحة Users (/users)

يجب أن تحتوي على:

- **جدول المستخدمين** مع:
  - الاسم
  - البريد الإلكتروني
  - الدور (مدير/مستخدم)
  - الحالة (نشط/غير نشط)
  - الإجراءات (تعديل/حذف)
- **زر "إضافة مستخدم جديد"**
- **Modal لإضافة مستخدم** مع:
  - حقول: الاسم، البريد، كلمة المرور، الدور
  - قائمة الصلاحيات (checkboxes)
- **Modal لتعديل الصلاحيات**

#### ✅ Sidebar

يجب أن يحتوي على (للمدير):

- لوحة التحكم
- الطلبات
- المنتجات
- العملاء
- المهام
- مهامي
- سجل النشاطات
- صافي الربح
- التقارير
- **المستخدمين** ← هذا المهم!
- الإعدادات

---

## 👨‍💼 اختبار ميزات المدير

### الخطوة 1: تحويل المستخدم إلى مدير

#### الطريقة 1: من Supabase Dashboard

1. افتح **Supabase Dashboard**: https://supabase.com/dashboard
2. اختر مشروعك
3. اذهب إلى **SQL Editor**
4. نفذ الاستعلام التالي:

```sql
UPDATE users
SET role = 'admin'
WHERE email = 'testadmin@example.com';
```

5. تحقق من النتيجة:

```sql
SELECT id, email, name, role
FROM users
WHERE email = 'testadmin@example.com';
```

#### الطريقة 2: من ملف SQL

1. افتح ملف `MAKE_USER_ADMIN.sql`
2. نفذه في Supabase SQL Editor

### الخطوة 2: تسجيل الدخول مرة أخرى

1. سجل الخروج من التطبيق
2. سجل الدخول مرة أخرى بنفس البيانات
3. الآن يجب أن ترى جميع ميزات المدير!

### الخطوة 3: التحقق من ميزات المدير

#### ✅ في Dashboard:

- [ ] يظهر Badge "👨‍💼 مدير النظام"
- [ ] يظهر زر "📋 إدارة المستخدمين"
- [ ] تظهر 3 كروت Admin Quick Actions (بنفسجي، أزرق، أخضر)
- [ ] يظهر قسم "طلبات الصلاحيات المعلقة"
- [ ] يظهر قسم "التقارير اليومية الأخيرة"

#### ✅ في Sidebar:

- [ ] يظهر عنصر "المستخدمين" في القائمة
- [ ] يمكن الضغط عليه للانتقال إلى /users

#### ✅ في صفحة Users:

- [ ] يمكن رؤية جميع المستخدمين
- [ ] يمكن إضافة مستخدم جديد
- [ ] يمكن تعديل صلاحيات المستخدمين
- [ ] يمكن حذف المستخدمين (ما عدا المدراء)

---

## 🐛 المشاكل الشائعة وحلولها

### المشكلة 1: Backend لا يعمل

**الأعراض:**

```
Error: listen EADDRINUSE: address already in use :::5000
```

**الحل:**

```powershell
# إيقاف العملية على port 5000
Get-NetTCPConnection -LocalPort 5000 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }

# إعادة تشغيل Backend
cd backend
npm run dev
```

### المشكلة 2: Frontend لا يعمل

**الأعراض:**

```
Something is already running on port 3000
```

**الحل:**

```powershell
# إيقاف العملية على port 3000
Get-NetTCPConnection -LocalPort 3000 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }

# إعادة تشغيل Frontend
cd frontend
npm start
```

### المشكلة 3: لا تظهر ميزات المدير

**الأعراض:**

- لا يظهر قسم "المستخدمين" في Dashboard
- لا يظهر "المستخدمين" في Sidebar
- لا يمكن الوصول إلى /users

**الحل:**

1. تأكد من أن المستخدم role = 'admin' في Database
2. سجل الخروج وسجل الدخول مرة أخرى
3. افتح Developer Console (F12) وتحقق من:

```javascript
// في Console
localStorage.getItem("user");
// يجب أن يظهر: {"role":"admin",...}
```

### المشكلة 4: خطأ في تسجيل الدخول

**الأعراض:**

```
البريد الإلكتروني أو كلمة المرور غير صحيحة
```

**الحل:**

1. تأكد من أن المستخدم موجود في Database
2. جرب التسجيل مرة أخرى
3. تحقق من كلمة المرور (يجب أن تكون 6 أحرف على الأقل)

### المشكلة 5: صفحة Users فارغة

**الأعراض:**

- صفحة /users تفتح لكن لا يظهر أي مستخدمين

**الحل:**

1. افتح Developer Console (F12)
2. اذهب إلى Network tab
3. حاول تحديث الصفحة
4. ابحث عن request إلى `/api/users`
5. تحقق من الـ Response:
   - إذا كان 401: المستخدم غير مصرح له
   - إذا كان 403: المستخدم ليس admin
   - إذا كان 500: خطأ في Server

---

## 📊 نتائج الاختبار المتوقعة

### ✅ Backend Tests

- [x] Health Check: OK
- [x] Register: OK
- [x] Login: OK
- [x] Dashboard Stats: OK
- [x] Users API (Admin): OK
- [x] Permissions API: OK

### ✅ Frontend Tests

- [x] Dashboard loads: OK
- [x] Admin badge shows: OK (للمدير فقط)
- [x] Admin Quick Actions show: OK (للمدير فقط)
- [x] Pending Requests show: OK (للمدير فقط)
- [x] Recent Reports show: OK (للمدير فقط)
- [x] Sidebar shows Users: OK (للمدير فقط)
- [x] Users page works: OK (للمدير فقط)
- [x] Add user works: OK (للمدير فقط)
- [x] Edit permissions works: OK (للمدير فقط)
- [x] Delete user works: OK (للمدير فقط)

---

## 🎯 الخلاصة

### ما تم تنفيذه:

1. ✅ Backend API كامل وشغال
2. ✅ Frontend كامل وشغال
3. ✅ صفحة Dashboard تحتوي على:
   - Stats Cards
   - Admin Badge
   - زر إدارة المستخدمين
   - Admin Quick Actions (3 كروت)
   - Pending Requests Section
   - Recent Reports Section
   - Charts
4. ✅ صفحة Users كاملة مع:
   - جدول المستخدمين
   - إضافة مستخدم
   - تعديل صلاحيات
   - حذف مستخدم
5. ✅ Sidebar يحتوي على عنصر "المستخدمين"
6. ✅ جميع الـ Routes شغالة
7. ✅ جميع الـ API Endpoints شغالة

### للتأكد من كل شيء:

1. شغل `./complete-test.ps1`
2. حول المستخدم إلى admin من Supabase
3. افتح http://localhost:3000
4. سجل دخول
5. تحقق من Dashboard
6. اذهب إلى /users
7. جرب إضافة/تعديل/حذف مستخدم

---

## 📞 الدعم

إذا واجهت أي مشكلة:

1. تحقق من الـ Console في المتصفح (F12)
2. تحقق من الـ Backend logs
3. تحقق من الـ Database في Supabase
4. راجع هذا الدليل

---

**تم إنشاء هذا الدليل في:** $(Get-Date)
**الإصدار:** 1.0.0
