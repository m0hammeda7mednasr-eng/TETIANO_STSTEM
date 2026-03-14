# دليل إعداد Shopify - خطوة بخطوة

## الوضع الحالي:

✅ **البيانات التجريبية تظهر في Dashboard**  
❌ **Shopify sync يرجع 0 نتائج**  
❌ **Shopify connection مقطوع**

## الحل:

### الخطوة 1: إصلاح اتصال Shopify في قاعدة البيانات

```sql
-- في Supabase SQL Editor، شغل:
FIX_SHOPIFY_CONNECTION.sql
```

### الخطوة 2: الحصول على بيانات Shopify الحقيقية

#### A. Shop Domain:

- اذهب إلى Shopify Admin
- انسخ الـ URL (مثل: https://your-store.myshopify.com)
- استخدم الجزء: `your-store.myshopify.com`

#### B. Access Token:

1. **في Shopify Admin:**
   - اذهب إلى **Apps and sales channels**
   - اختر **Develop apps**
   - اضغط **Create an app**
   - أدخل اسم التطبيق (مثل: "Store Management")

2. **إعداد الصلاحيات:**
   - اذهب إلى **Configuration**
   - في **Admin API access scopes**، أضف:
     - ✅ `read_products`
     - ✅ `read_orders`
     - ✅ `read_customers`
   - اضغط **Save**

3. **الحصول على Token:**
   - اذهب إلى **API credentials**
   - اضغط **Install app**
   - انسخ **Admin API access token**

### الخطوة 3: تحديث البيانات في Settings

1. **اذهب إلى Settings في التطبيق**
2. **أدخل البيانات الحقيقية:**
   - **Shop Domain**: `your-store.myshopify.com`
   - **Access Token**: الـ token اللي نسخته
3. **اضغط "Test Connection"**
4. **لو نجح، اضغط "Save"**

### الخطوة 4: تشغيل Sync

1. **اضغط "Sync Shopify Data"**
2. **راقب الرسائل:**
   - ✅ يجب أن تشوف: "Sync completed: X products, X orders, X customers"
   - ❌ لو شفت: "Sync completed: 0 products, 0 orders, 0 customers"

### الخطوة 5: فحص النتائج

- **Dashboard**: أرقام محدثة بالبيانات الحقيقية
- **Products**: منتجات من Shopify
- **Orders**: طلبات من Shopify
- **Customers**: عملاء من Shopify

## الأخطاء الشائعة:

### "401 Unauthorized"

- **السبب**: Access Token غير صحيح
- **الحل**: أنشئ token جديد من Shopify Admin

### "403 Forbidden"

- **السبب**: الصلاحيات مش كافية
- **الحل**: تأكد من إضافة read_products, read_orders, read_customers

### "404 Not Found"

- **السبب**: Shop Domain غير صحيح
- **الحل**: تأكد من الصيغة: `store-name.myshopify.com`

### "Sync completed: 0 products, 0 orders, 0 customers"

- **السبب**: المتجر فاضي أو الصلاحيات مش صحيحة
- **الحل**: تأكد من وجود بيانات في المتجر

## ملاحظات مهمة:

1. **البيانات التجريبية**: هتفضل موجودة جنب البيانات الحقيقية
2. **RLS معطل**: عشان كده البيانات بتظهر
3. **User linking**: كل البيانات مربوطة بالمستخدم الأساسي
4. **Store linking**: كل البيانات مربوطة بالمتجر الأساسي

## إذا استمرت المشكلة:

### فحص Railway Logs:

- ابحث عن رسائل: "❌ Shopify connection test failed"
- ابحث عن تفاصيل الخطأ

### فحص Browser Console:

- ابحث عن أخطاء في Settings page
- ابحث عن أخطاء أثناء الـ Sync

### اختبار مباشر:

```bash
# اختبار الاتصال مباشرة:
curl -H "X-Shopify-Access-Token: YOUR_TOKEN" \
     "https://your-store.myshopify.com/admin/api/2024-01/products.json?limit=1"
```

## النتيجة المتوقعة:

بعد تطبيق هذه الخطوات، الـ Shopify sync هيشتغل صح ويسحب البيانات الحقيقية من المتجر.
