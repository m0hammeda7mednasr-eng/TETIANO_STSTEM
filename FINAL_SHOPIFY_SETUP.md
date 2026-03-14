# الإعداد النهائي لـ Shopify - خطوة بخطوة

## الوضع الحالي:

✅ **500 Internal Server Error اختفى**  
✅ **البيانات التجريبية تظهر في Dashboard**  
❌ **"Failed to sync data from Shopify"** - يحتاج بيانات Shopify حقيقية

## المطلوب الآن:

### الخطوة 1: الحصول على بيانات Shopify الحقيقية

#### A. Shop Domain:

- اذهب إلى متجر Shopify الخاص بك
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

### الخطوة 2: تحديث البيانات في قاعدة البيانات

```sql
-- في Supabase SQL Editor، شغل هذا الكود مع تعديل البيانات:

UPDATE shopify_tokens
SET
    shop = 'YOUR-ACTUAL-STORE.myshopify.com',  -- ضع اسم متجرك هنا
    access_token = 'shpat_YOUR_ACTUAL_ACCESS_TOKEN',  -- ضع الـ token الحقيقي هنا
    updated_at = NOW()
WHERE shop = 'demo-store.myshopify.com';

-- فحص النتائج
SELECT shop, access_token IS NOT NULL as has_token, LENGTH(access_token) as token_length
FROM shopify_tokens;
```

### الخطوة 3: اختبار الاتصال

1. **اذهب إلى Settings في التطبيق**
2. **اضغط "Sync Shopify Data"**
3. **المفروض تشوف رسالة زي:**
   - ✅ "Sync completed: X products, X orders, X customers"
   - ❌ لو لسه "Failed to sync data from Shopify"

### الخطوة 4: فحص النتائج

- **Dashboard**: أرقام محدثة بالبيانات الحقيقية
- **Products**: منتجات من Shopify
- **Orders**: طلبات من Shopify
- **Customers**: عملاء من Shopify

## إذا لم تكن تملك متجر Shopify:

### خيار 1: إنشاء متجر تجريبي

1. اذهب إلى https://www.shopify.com/partners
2. أنشئ حساب Shopify Partner
3. أنشئ Development Store
4. أضف بعض المنتجات والطلبات التجريبية

### خيار 2: استخدام البيانات التجريبية الحالية

- البيانات التجريبية اللي موجودة دلوقتي كافية للاختبار
- Dashboard يعرض البيانات صح
- كل الوظائف تشتغل

## الأخطاء المحتملة:

### "401 Unauthorized"

- **السبب**: Access Token غير صحيح
- **الحل**: تأكد من نسخ الـ token صح من Shopify Admin

### "403 Forbidden"

- **السبب**: الصلاحيات مش كافية
- **الحل**: تأكد من إضافة read_products, read_orders, read_customers

### "404 Not Found"

- **السبب**: Shop Domain غير صحيح
- **الحل**: تأكد من الصيغة: `store-name.myshopify.com`

## ملاحظة مهمة:

**النظام يشتغل تماماً بالبيانات التجريبية الحالية. ربط Shopify الحقيقي اختياري وفقط لسحب بيانات حقيقية من متجر موجود.**

## الخلاصة:

- ✅ **المشكلة الأساسية (500 error) اتحلت**
- ✅ **البيانات تظهر في Dashboard**
- ✅ **النظام يشتغل كاملاً**
- ⚠️ **Shopify sync يحتاج بيانات حقيقية (اختياري)**
