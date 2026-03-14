# تشخيص Railway Logs

## المشكلة الحالية:

- الـ sync API بيشتغل صح
- بس بيرجع `0 products, 0 orders, 0 customers`
- معناها إن Shopify API مش بيرجع بيانات

## الخطوات للتشخيص:

### 1. فحص Railway Logs:

```
1. اذهب إلى Railway Dashboard
2. اختر الـ backend service
3. اذهب إلى "Logs" tab
4. ابحث عن رسائل الـ sync:
   - "Starting Shopify sync process..."
   - "Testing Shopify connection..."
   - "✅ Shopify connection test successful"
   - "❌ Shopify connection test failed"
```

### 2. الرسائل المتوقعة في Logs:

#### إذا كان الاتصال شغال:

```
✅ Shopify connection test successful
🔍 Fetching products from: https://shop.myshopify.com/admin/api/2024-01/products.json
✅ Successfully fetched X products from Shopify
🔍 Fetching orders from: https://shop.myshopify.com/admin/api/2024-01/orders.json
✅ Successfully fetched X orders from Shopify
🔍 Fetching customers from: https://shop.myshopify.com/admin/api/2024-01/customers.json
✅ Successfully fetched X customers from Shopify
```

#### إذا كان الاتصال مقطوع:

```
❌ Shopify connection test failed: 401 Unauthorized
❌ Shopify connection test failed: Invalid access token
❌ Shopify connection test failed: Shop domain not found
```

### 3. الأسباب المحتملة:

#### A. Access Token منتهي الصلاحية:

- الحل: إعادة ربط Shopify من Settings

#### B. Shop Domain غير صحيح:

- الحل: تأكد من أن Shop Domain صحيح (مثل: store-name.myshopify.com)

#### C. Shopify App Permissions:

- الحل: تأكد من أن الـ App له صلاحيات:
  - read_products
  - read_orders
  - read_customers

#### D. Network/Firewall Issues:

- الحل: تأكد من أن Railway يقدر يوصل لـ Shopify API

### 4. خطوات الإصلاح:

#### الخطوة 1: فحص Shopify Connection في Settings

```
1. اذهب إلى Settings
2. شوف Shop Domain و Access Token
3. لو مفيش، اعمل ربط جديد
```

#### الخطوة 2: تطبيق إصلاح قاعدة البيانات

```sql
-- في Supabase SQL Editor:
-- شغل EMERGENCY_DATA_LINK_FIX.sql
```

#### الخطوة 3: اختبار الـ Sync مرة أخرى

```
1. اضغط على "Sync Shopify Data"
2. راقب Railway Logs
3. راقب Browser Console
```

## التوقعات:

### إذا كان الإصلاح نجح:

- Railway Logs: "✅ Successfully fetched X products/orders/customers"
- Browser Console: "Sync completed: X products, X orders, X customers"
- Dashboard: أرقام صحيحة في الإحصائيات

### إذا لسه فيه مشكلة:

- Railway Logs: رسائل خطأ واضحة
- Browser Console: "Sync completed: 0 products, 0 orders, 0 customers"
- Dashboard: أرقام صفر

## الخطوة التالية:

**فحص Railway Logs الآن وإرسال النتيجة**
