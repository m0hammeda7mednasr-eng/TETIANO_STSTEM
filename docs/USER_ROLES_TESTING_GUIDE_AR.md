# 🔧 دليل اختبار نظام الرولز والصلاحيات

## 📋 ملخص المشكلة والحل

**المشكلة**: اليوزر مش بيشوف الصفحات على حسب الرولز بتاعته
**السبب**: كان فيه مشكلة في permissions في قاعدة البيانات
**الحل**: تم إصلاح جميع permissions للمستخدمين

## 👥 المستخدمين المتاحين للاختبار

### 👑 Admin Users (يشوفوا كل الصفحات):

1. **midooooahmed28@gmail.com** - Role: admin ✅
2. **mmm@gmail.com** - Role: admin ✅
3. **testadmin@example.com** - Role: admin ✅
4. **admin@analytics-test.com** - Role: admin ✅

### 👤 Employee Users (صفحات محدودة):

1. **admin@test.com** - Role: user ✅
2. **m@gmail.com** - Role: user ✅

## 🔍 كيفية الاختبار

### الخطوة 1: تسجيل دخول Admin

1. اذهب إلى `/login`
2. استخدم أي من Admin users (مثل: `mmm@gmail.com`)
3. كلمة المرور: `password` (أو كلمة المرور الأصلية)

### الخطوة 2: فحص Sidebar للـ Admin

يجب أن تشوف:

**📊 الصفحات المشتركة:**

- ✅ لوحة التحكم
- ✅ الطلبات
- ✅ المنتجات
- ✅ العملاء
- ✅ صافي الربح

**👑 صفحات الأدمن فقط:**

- ✅ التحليلات المتقدمة
- ✅ لوحة تحكم الأدمن
- ✅ إدارة المهام
- ✅ التقارير اليومية
- ✅ إدارة المستخدمين
- ✅ سجل النشاط

### الخطوة 3: تسجيل دخول Employee

1. سجل خروج من Admin
2. سجل دخول بـ: `m@gmail.com`
3. كلمة المرور: `password`

### الخطوة 4: فحص Sidebar للـ Employee

يجب أن تشوف:

**📊 الصفحات المشتركة:**

- ✅ لوحة التحكم
- ✅ الطلبات
- ✅ المنتجات
- ✅ العملاء
- ❌ صافي الربح (مخفي)

**👤 صفحات الموظف فقط:**

- ✅ مهامي
- ✅ تقاريري
- ✅ طلبات الصلاحيات

**❌ صفحات مخفية (Admin فقط):**

- ❌ التحليلات المتقدمة
- ❌ لوحة تحكم الأدمن
- ❌ إدارة المهام
- ❌ التقارير اليومية
- ❌ إدارة المستخدمين
- ❌ سجل النشاط

## 🔧 إذا لم تعمل الرولز

### تحقق من Token في المتصفح:

1. افتح Developer Tools (F12)
2. اذهب إلى Console
3. اكتب:

```javascript
const token = localStorage.getItem("token");
const payload = JSON.parse(atob(token.split(".")[1]));
console.log("User role:", payload.role);
```

### تحقق من Permissions:

```javascript
fetch("/api/users/me/permissions", {
  headers: { Authorization: "Bearer " + localStorage.getItem("token") },
})
  .then((r) => r.json())
  .then(console.log);
```

## 📊 الصلاحيات الحالية

### Admin Users:

```json
{
  "can_view_dashboard": true,
  "can_view_products": true,
  "can_edit_products": true,
  "can_view_orders": true,
  "can_edit_orders": true,
  "can_view_customers": true,
  "can_edit_customers": true,
  "can_manage_users": true,
  "can_manage_settings": true,
  "can_view_profits": true
}
```

### Employee Users:

```json
{
  "can_view_dashboard": true,
  "can_view_products": true,
  "can_edit_products": false,
  "can_view_orders": true,
  "can_edit_orders": false,
  "can_view_customers": true,
  "can_edit_customers": false,
  "can_manage_users": false,
  "can_manage_settings": false,
  "can_view_profits": false
}
```

## 🎯 النتيجة المتوقعة

- ✅ Admin users يشوفوا جميع الصفحات والأقسام
- ✅ Employee users يشوفوا صفحات محدودة فقط
- ✅ Sidebar يتغير حسب نوع المستخدم
- ✅ صفحة Analytics تعمل للـ Admin فقط
- ✅ صفحات الإدارة مخفية عن الـ Employee

## 🚨 استكشاف الأخطاء

### إذا كانت الصفحات لا تزال لا تظهر:

1. امسح cache المتصفح
2. سجل خروج وادخل مرة أخرى
3. تأكد من أن الباك إند يعمل على port 5000
4. تأكد من أن الفرونت إند يعمل على port 3000

### إذا ظهر خطأ 403 Forbidden:

- المستخدم ليس لديه صلاحية للصفحة
- هذا سلوك طبيعي للـ Employee users

### إذا ظهر خطأ 401 Unauthorized:

- Token منتهي الصلاحية أو غير صحيح
- سجل دخول مرة أخرى

## 🎉 تأكيد النجاح

إذا رأيت الفروق التالية، فالنظام يعمل بشكل صحيح:

**Admin Sidebar**: 10+ عناصر مع قسم "إدارة النظام"
**Employee Sidebar**: 6-7 عناصر مع قسم "مهامي وتقاريري"

النظام الآن يعمل بشكل صحيح! 🎉
