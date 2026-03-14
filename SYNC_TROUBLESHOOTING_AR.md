# دليل حل مشاكل Shopify Sync

## المشكلة: Sync يرجع 0 منتجات، 0 أوردرات، 0 عملاء

### السبب المحتمل

مشكلة في اتصال Shopify API أو انتهاء صلاحية Access Token

## خطوات الحل السريع

### 1. فحص الاتصال

```
1. اذهب إلى Settings في التطبيق
2. تحقق من Shop Domain (يجب أن ينتهي بـ .myshopify.com)
3. تحقق من وجود Access Token
```

### 2. إعادة ربط Shopify

```
1. في Settings، احذف الاتصال الحالي
2. اضغط على "Connect to Shopify"
3. أدخل Shop Domain الصحيح
4. أدخل Access Token جديد
```

### 3. اختبار الـ Sync

```
1. اضغط على "Sync Shopify Data"
2. افتح Console في المتصفح (F12)
3. راقب الرسائل:
   - ✅ "Shopify connection test successful"
   - ✅ "Successfully fetched X products"
   - ❌ "Shopify connection test failed"
```

### 4. إذا استمرت المشكلة

#### فحص Shopify App Settings:

```
1. اذهب إلى Shopify Admin
2. Apps > App and sales channel settings
3. تأكد من أن التطبيق له الصلاحيات:
   - read_products
   - read_orders
   - read_customers
```

#### فحص Access Token:

```
1. تأكد من أن Token لم تنته صلاحيته
2. تأكد من أن Token له الصلاحيات المطلوبة
3. جرب إنشاء Token جديد
```

## رسائل الخطأ الشائعة

### "401 Unauthorized"

- Access Token غير صحيح أو منتهي الصلاحية
- **الحل**: أنشئ Access Token جديد

### "403 Forbidden"

- التطبيق ليس له الصلاحيات المطلوبة
- **الحل**: تحقق من صلاحيات Shopify App

### "404 Not Found"

- Shop Domain غير صحيح
- **الحل**: تأكد من Shop Domain (مثل: store-name.myshopify.com)

### "Connection timeout"

- مشكلة في الشبكة أو Firewall
- **الحل**: تحقق من اتصال الإنترنت

## التحقق من نجاح الإصلاح

### في Console المتصفح:

```
✅ "Shopify connection test successful"
✅ "Successfully fetched X products from Shopify"
✅ "Successfully fetched X orders from Shopify"
✅ "Successfully fetched X customers from Shopify"
✅ "Sync completed: X products, X orders, X customers"
```

### في Dashboard:

```
- إحصائيات تظهر أرقام صحيحة
- قوائم المنتجات والأوردرات تحتوي على بيانات
- لا توجد رسائل خطأ
```

## ملاحظات مهمة

1. **Redeploy Backend**: بعد أي تغيير في الكود، ارفع التحديثات على Railway
2. **Clear Cache**: امسح cache المتصفح بعد التحديثات
3. **Check Logs**: راقب Railway logs للتأكد من عدم وجود أخطاء في الـ backend
4. **Database**: تأكد من تطبيق إصلاحات قاعدة البيانات في Supabase

## الدعم الفني

إذا استمرت المشكلة:

1. شغل `CHECK_SHOPIFY_STATUS.sql` في Supabase
2. شغل `QUICK_SHOPIFY_FIX.sql` في Supabase
3. تحقق من Railway logs
4. تحقق من Browser console
5. تحقق من Shopify App settings
