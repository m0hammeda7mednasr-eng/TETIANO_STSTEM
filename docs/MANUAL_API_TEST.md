# اختبار API يدوياً - تشخيص المشكلة

## Manual API Testing - Problem Diagnosis

## 🔍 خطوات التشخيص

### الخطوة 1: شغل فحص قاعدة البيانات

```sql
-- شغل DEBUG_BACKEND_API.sql في Supabase SQL Editor
```

هيقولك بالضبط إيه البيانات الموجودة وإيه المشاكل.

### الخطوة 2: اختبر الـ API مباشرة

افتح الروابط دي **واحد واحد** في tab جديد:

#### أ) فحص حالة الخادم:

```
https://tetianoststem-production.up.railway.app/api/health
```

**لازم يرجع:** `{"status":"OK","message":"Server is running"}`

#### ب) فحص إحصائيات Dashboard:

```
https://tetianoststem-production.up.railway.app/api/dashboard/stats
```

**لازم يرجع:** أرقام المبيعات والمنتجات

#### ج) فحص المنتجات:

```
https://tetianoststem-production.up.railway.app/api/dashboard/products
```

**لازم يرجع:** قائمة بالمنتجات الـ 4

### الخطوة 3: إذا ظهر خطأ Authorization

1. **سجل دخول** في النظام أولاً
2. **اضغط F12** في المتصفح
3. **اذهب إلى Network tab**
4. **حدث أي صفحة** في النظام
5. **ابحث عن أي API call**
6. **انسخ الـ Authorization header**
7. **استخدمه في اختبار الروابط**

### الخطوة 4: فحص Railway Logs

1. **اذهب إلى** Railway Dashboard
2. **اضغط على** المشروع `tetianoststem-production`
3. **اضغط على** "Logs" tab
4. **ابحث عن** أخطاء حمراء
5. **ابحث عن** "Dashboard route accessed" messages

## 🚨 السيناريوهات المحتملة

### السيناريو 1: API يرجع بيانات فارغة

**المشكلة:** RLS أو الصلاحيات
**الحل:**

```sql
-- في Supabase SQL Editor
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
```

### السيناريو 2: API يرجع خطأ 500

**المشكلة:** مشكلة في Backend code
**الحل:** تحقق من Railway Logs

### السيناريو 3: API يرجع خطأ 401/403

**المشكلة:** مشكلة في Authentication
**الحل:** أعد تسجيل الدخول

### السيناريو 4: API يرجع بيانات لكن Frontend مش بيعرضها

**المشكلة:** مشكلة في Frontend code
**الحل:** امسح Cache وحدث الصفحة

## 🔧 حلول سريعة

### إذا كان API مش شغال خالص:

```bash
# أعد تشغيل Backend على Railway
1. اذهب إلى Railway Dashboard
2. اضغط على المشروع
3. اضغط "Restart"
4. انتظر 2-3 دقائق
```

### إذا كان API شغال لكن بيرجع بيانات فارغة:

```sql
-- شغل في Supabase
UPDATE products SET user_id = (SELECT id FROM users LIMIT 1) WHERE shopify_id IS NOT NULL;
UPDATE orders SET user_id = (SELECT id FROM users LIMIT 1) WHERE shopify_id IS NOT NULL;
UPDATE customers SET user_id = (SELECT id FROM users LIMIT 1) WHERE shopify_id IS NOT NULL;
```

### إذا كان API شغال والبيانات موجودة لكن Frontend مش بيعرضها:

```javascript
// في المتصفح Console (F12)
localStorage.clear();
sessionStorage.clear();
location.reload(true);
```

## 📋 تقرير المشكلة

بعد تجربة الخطوات، املأ هذا التقرير:

### نتائج اختبار API:

- [ ] `/api/health` يعمل
- [ ] `/api/dashboard/stats` يرجع بيانات
- [ ] `/api/dashboard/products` يرجع 4 منتجات
- [ ] `/api/dashboard/orders` يرجع 127 طلب
- [ ] `/api/dashboard/customers` يرجع 3 عملاء

### نتائج فحص قاعدة البيانات:

- منتجات من Shopify: \_\_\_
- طلبات من Shopify: \_\_\_
- عملاء من Shopify: \_\_\_
- مستخدمين بصلاحيات: \_\_\_

### الأخطاء المكتشفة:

1. ***
2. ***
3. ***

---

**المطلوب:** شغل `DEBUG_BACKEND_API.sql` أولاً، ثم اختبر الروابط، وقولي النتائج بالضبط إيه عشان أحدد المشكلة الحقيقية.
