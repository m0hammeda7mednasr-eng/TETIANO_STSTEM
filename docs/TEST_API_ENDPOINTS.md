# اختبار API Endpoints مباشرة

## Direct API Testing

بعد تشغيل `DIRECT_DATA_FIX.sql`، اختبر هذه الروابط مباشرة في المتصفح:

## 🔗 روابط الاختبار المباشر

### 1. فحص حالة الخادم:

```
https://tetianoststem-production.up.railway.app/api/health
```

**المتوقع:** `{"status":"OK","message":"Server is running"}`

### 2. فحص إحصائيات لوحة التحكم:

```
https://tetianoststem-production.up.railway.app/api/dashboard/stats
```

**المتوقع:** أرقام المبيعات والمنتجات والطلبات

### 3. فحص المنتجات:

```
https://tetianoststem-production.up.railway.app/api/dashboard/products?limit=10
```

**المتوقع:** قائمة بـ 4 منتجات مع التفاصيل

### 4. فحص الطلبات:

```
https://tetianoststem-production.up.railway.app/api/dashboard/orders?limit=10
```

**المتوقع:** قائمة بـ 127 طلب مع التفاصيل

### 5. فحص العملاء:

```
https://tetianoststem-production.up.railway.app/api/dashboard/customers?limit=10
```

**المتوقع:** قائمة بـ 3 عملاء مع التفاصيل

### 6. فحص التحليلات:

```
https://tetianoststem-production.up.railway.app/api/dashboard/analytics
```

**المتوقع:** بيانات تحليلية شاملة

## 🔧 إذا ظهرت أخطاء:

### خطأ: "Unauthorized" أو 401

**الحل:**

- تسجيل الدخول في النظام أولاً
- نسخ الـ Authorization token من Network tab
- إضافة Header: `Authorization: Bearer YOUR_TOKEN`

### خطأ: "No data" أو مصفوفة فارغة []

**الحل:**

- تأكد من تشغيل `DIRECT_DATA_FIX.sql`
- أعد تشغيل Backend على Railway
- تحقق من قاعدة البيانات

### خطأ: "Permission denied"

**الحل:**

- تحقق من جدول `permissions`
- تأكد من وجود `user_stores` connections
- أعد تسجيل الدخول

## 📱 اختبار في النظام:

بعد التأكد من عمل الـ API:

### 1. حدث الصفحة:

- اضغط `Ctrl + Shift + R`
- أو `F5` عدة مرات

### 2. امسح Cache:

- اضغط `F12`
- اذهب إلى Application → Storage
- اضغط "Clear Storage"

### 3. أعد تسجيل الدخول:

- سجل خروج
- سجل دخول مرة أخرى
- تحقق من البيانات

### 4. اختبر الصفحات:

- [ ] لوحة التحكم الرئيسية
- [ ] صفحة المنتجات
- [ ] صفحة الطلبات
- [ ] صفحة العملاء
- [ ] صفحة التحليلات

## 🚨 إذا استمرت المشكلة:

### فحص متقدم:

1. **افتح F12 → Network tab**
2. **حدث الصفحة**
3. **ابحث عن API calls**
4. **تحقق من Response لكل call**

### معلومات مطلوبة:

- Response من `/api/dashboard/stats`
- Response من `/api/dashboard/products`
- أي رسائل خطأ في Console
- لقطة شاشة من Network tab

---

**الهدف:** التأكد من أن الـ API يرجع البيانات الصحيحة (4 منتجات، 127 طلب، 3 عملاء) وأن الواجهة تعرضها بشكل صحيح.
