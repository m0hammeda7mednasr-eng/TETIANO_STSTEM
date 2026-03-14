# دليل ربط Shopify من جديد

## المشكلة:

بيانات الستور فاضية تماماً - معناها إن الـ Shopify connection مقطوع أو مش شغال

## الحل الشامل:

### الخطوة 1: إعادة تعيين قاعدة البيانات

```sql
-- في Supabase SQL Editor، شغل:
COMPLETE_SHOPIFY_RESET.sql
```

### الخطوة 2: إعادة ربط Shopify

1. **اذهب إلى Settings في التطبيق**
2. **امسح الاتصال الحالي** (إذا كان موجود)
3. **أدخل بيانات Shopify الجديدة:**
   - **Shop Domain**: اسم المتجر + `.myshopify.com`
   - **Access Token**: من Shopify Admin

### الخطوة 3: الحصول على Access Token جديد

#### من Shopify Admin:

1. اذهب إلى **Apps and sales channels**
2. اختر **Develop apps**
3. اضغط على **Create an app**
4. أدخل اسم التطبيق
5. اذهب إلى **Configuration**
6. في **Admin API access scopes**، أضف:
   - `read_products`
   - `read_orders`
   - `read_customers`
7. اضغط **Save**
8. اذهب إلى **API credentials**
9. انسخ **Admin API access token**

### الخطوة 4: اختبار الاتصال

1. **أدخل البيانات في Settings**
2. **اضغط على "Test Connection"**
3. **إذا نجح، اضغط على "Save"**

### الخطوة 5: تشغيل Sync

1. **اضغط على "Sync Shopify Data"**
2. **راقب الرسائل:**
   - يجب أن تشوف: "Sync completed: X products, X orders, X customers"
   - لو شفت "0 products, 0 orders, 0 customers" يبقى لسه فيه مشكلة

### الخطوة 6: فحص النتائج

1. **اذهب إلى Dashboard**
2. **تأكد من ظهور الأرقام الصحيحة**
3. **اذهب إلى Products/Orders/Customers**
4. **تأكد من ظهور البيانات**

## الأخطاء الشائعة وحلولها:

### "401 Unauthorized"

- **السبب**: Access Token غير صحيح أو منتهي الصلاحية
- **الحل**: أنشئ Access Token جديد

### "403 Forbidden"

- **السبب**: التطبيق ليس له الصلاحيات المطلوبة
- **الحل**: تأكد من إضافة الصلاحيات المطلوبة في Shopify

### "404 Not Found"

- **السبب**: Shop Domain غير صحيح
- **الحل**: تأكد من Shop Domain (مثل: mystore.myshopify.com)

### "Sync completed: 0 products, 0 orders, 0 customers"

- **السبب**: المتجر فاضي أو الصلاحيات مش كافية
- **الحل**: تأكد من وجود بيانات في المتجر وصحة الصلاحيات

## ملاحظات مهمة:

1. **Shop Domain Format**: يجب أن ينتهي بـ `.myshopify.com`
2. **Access Token**: يجب أن يكون من نوع "Admin API access token"
3. **Permissions**: يجب أن تشمل read_products, read_orders, read_customers
4. **Store Data**: تأكد من وجود منتجات وطلبات في المتجر

## إذا استمرت المشكلة:

### فحص Railway Logs:

1. اذهب إلى Railway Dashboard
2. اختر Backend Service
3. اذهب إلى Logs
4. ابحث عن رسائل الخطأ

### فحص Browser Console:

1. اضغط F12
2. اذهب إلى Console
3. ابحث عن رسائل الخطأ أثناء الـ Sync

### فحص Shopify Store:

1. تأكد من وجود منتجات في المتجر
2. تأكد من وجود طلبات في المتجر
3. تأكد من وجود عملاء في المتجر

## الدعم الفني:

إذا لم تنجح هذه الخطوات، أرسل:

1. رسائل الخطأ من Railway Logs
2. رسائل الخطأ من Browser Console
3. Shop Domain المستخدم
4. نوع Access Token المستخدم
