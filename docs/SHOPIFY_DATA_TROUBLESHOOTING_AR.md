# حل مشكلة عدم ظهور بيانات Shopify

## Shopify Data Display Troubleshooting Guide

## 🔍 المشكلة

بعد ربط Shopify بنجاح وسحب البيانات، البيانات لا تظهر في النظام (المنتجات، الطلبات، العملاء).

## 🎯 الحل السريع

### الخطوة 1: تشخيص المشكلة

1. افتح Supabase Dashboard
2. اذهب إلى SQL Editor
3. انسخ والصق محتوى ملف `DEBUG_SHOPIFY_DATA_SYNC.sql`
4. اضغط Run
5. راجع النتائج لفهم المشكلة

### الخطوة 2: إصلاح المشكلة

1. في نفس SQL Editor
2. انسخ والصق محتوى ملف `FIX_DATA_DISPLAY_ISSUE.sql`
3. اضغط Run
4. انتظر حتى اكتمال التنفيذ

### الخطوة 3: التحقق من الحل

1. حدث الصفحة في المتصفح (F5)
2. أو سجل خروج ودخول مرة أخرى
3. تحقق من ظهور البيانات في جميع الصفحات

---

## 🔧 الأسباب المحتملة للمشكلة

### 1. مشاكل Row Level Security (RLS)

- **المشكلة:** سياسات RLS تمنع عرض البيانات
- **الحل:** تبسيط سياسات RLS مؤقتاً

### 2. مشاكل الصلاحيات

- **المشكلة:** المستخدم لا يملك صلاحيات عرض البيانات
- **الحل:** إنشاء صلاحيات شاملة للمستخدمين

### 3. مشاكل ربط البيانات

- **المشكلة:** البيانات غير مرتبطة بـ user_id أو store_id
- **الحل:** ربط البيانات بالمستخدمين والمتاجر

### 4. مشاكل في المتاجر

- **المشكلة:** عدم وجود متجر افتراضي أو مشاكل في user_stores
- **الحل:** إنشاء متجر افتراضي وربط المستخدمين به

---

## 📋 خطوات التشخيص التفصيلية

### فحص اتصالات Shopify

```sql
SELECT * FROM shopify_tokens ORDER BY created_at DESC;
```

**المتوقع:** وجود سجل واحد على الأقل مع access_token

### فحص المتاجر

```sql
SELECT * FROM stores ORDER BY created_at DESC;
```

**المتوقع:** وجود متجر واحد على الأقل

### فحص ربط المستخدمين بالمتاجر

```sql
SELECT * FROM user_stores;
```

**المتوقع:** وجود ربط بين المستخدم والمتجر

### فحص البيانات المستوردة

```sql
SELECT COUNT(*) FROM products WHERE shopify_id IS NOT NULL;
SELECT COUNT(*) FROM orders WHERE shopify_id IS NOT NULL;
SELECT COUNT(*) FROM customers WHERE shopify_id IS NOT NULL;
```

**المتوقع:** أرقام أكبر من 0

### فحص الصلاحيات

```sql
SELECT * FROM permissions WHERE user_id = 'YOUR_USER_ID';
```

**المتوقع:** can_view_products = true, can_view_orders = true, etc.

---

## 🛠️ الحلول المتقدمة

### إذا لم تنجح الحلول السريعة:

#### 1. إعادة تزامن البيانات

```sql
-- تحديث timestamps لإجبار إعادة التحميل
UPDATE products SET updated_at = NOW() WHERE shopify_id IS NOT NULL;
UPDATE orders SET updated_at = NOW() WHERE shopify_id IS NOT NULL;
UPDATE customers SET updated_at = NOW() WHERE shopify_id IS NOT NULL;
```

#### 2. تعطيل RLS مؤقتاً

```sql
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
```

#### 3. إنشاء صلاحيات كاملة

```sql
UPDATE permissions
SET
    can_view_products = true,
    can_view_orders = true,
    can_view_customers = true,
    can_view_reports = true,
    can_view_analytics = true
WHERE user_id = 'YOUR_USER_ID';
```

#### 4. إعادة ربط البيانات

```sql
-- ربط جميع البيانات بأول مستخدم ومتجر
UPDATE products
SET
    user_id = (SELECT id FROM users ORDER BY created_at LIMIT 1),
    store_id = (SELECT id FROM stores ORDER BY created_at LIMIT 1)
WHERE shopify_id IS NOT NULL;
```

---

## 🔍 فحص النتائج

بعد تطبيق الحلول، تحقق من:

### في لوحة التحكم:

- [ ] إحصائيات المبيعات تظهر أرقام حقيقية
- [ ] عدد المنتجات والطلبات والعملاء صحيح
- [ ] لا توجد أخطاء في Console (F12)

### في صفحة المنتجات:

- [ ] قائمة المنتجات تظهر البيانات من Shopify
- [ ] الأسعار والصور والتفاصيل موجودة
- [ ] أسعار التكلفة محسوبة

### في صفحة الطلبات:

- [ ] قائمة الطلبات تظهر البيانات من Shopify
- [ ] الحالات المالية وتفاصيل العملاء موجودة
- [ ] المبالغ والتواريخ صحيحة

### في صفحة العملاء:

- [ ] قائمة العملاء تظهر البيانات من Shopify
- [ ] الأسماء والإيميلات وإجمالي الإنفاق موجود

### في صفحة التحليلات:

- [ ] الرسوم البيانية تعرض بيانات حقيقية
- [ ] الإحصائيات والنسب محسوبة بشكل صحيح
- [ ] أفضل المنتجات والعملاء يظهرون

---

## 🚨 إذا استمرت المشكلة

### فحص إضافي:

1. **تحقق من Backend Logs:**
   - افتح Railway Dashboard
   - اذهب إلى Logs
   - ابحث عن أخطاء في API calls

2. **تحقق من Frontend Console:**
   - اضغط F12 في المتصفح
   - ابحث عن أخطاء JavaScript
   - تحقق من Network tab للـ API calls

3. **تحقق من Supabase Logs:**
   - افتح Supabase Dashboard
   - اذهب إلى Logs
   - ابحث عن أخطاء في Database queries

### حلول الطوارئ:

#### إعادة تزامن كاملة من Shopify:

1. اذهب إلى صفحة Settings في النظام
2. اضغط "Sync Data from Shopify"
3. انتظر اكتمال التزامن
4. حدث الصفحة

#### إعادة ربط Shopify:

1. اذهب إلى صفحة Settings
2. اقطع الاتصال مع Shopify
3. أعد الربط مرة أخرى
4. انتظر اكتمال التزامن الأولي

---

## 📞 الدعم الفني

إذا لم تنجح جميع الحلول:

### معلومات مطلوبة للدعم:

1. **نتائج** `DEBUG_SHOPIFY_DATA_SYNC.sql`
2. **لقطات شاشة** من الأخطاء
3. **Backend Logs** من Railway
4. **Frontend Console Errors**
5. **تفاصيل متجر Shopify** (الدومين، عدد المنتجات المتوقع)

### خطوات التواصل:

1. جمع المعلومات المطلوبة أعلاه
2. توثيق الخطوات التي تم تجريبها
3. إرسال التفاصيل للمراجعة

---

## ✅ الخلاصة

المشكلة الأكثر شيوعاً هي مشاكل RLS والصلاحيات. الحل السريع:

1. **تشغيل** `DEBUG_SHOPIFY_DATA_SYNC.sql` للتشخيص
2. **تشغيل** `FIX_DATA_DISPLAY_ISSUE.sql` للإصلاح
3. **تحديث الصفحة** أو إعادة تسجيل الدخول
4. **التحقق** من ظهور البيانات في جميع الصفحات

**النتيجة المتوقعة:** عرض كامل لجميع بيانات Shopify في النظام بشكل صحيح ومفصل.
