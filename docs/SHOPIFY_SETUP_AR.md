# دليل ربط متجر Shopify

## الخطوات المطلوبة:

### 1. إنشاء تطبيق Shopify

1. اذهب إلى Shopify Partner Dashboard: https://partners.shopify.com/
2. إذا لم يكن لديك حساب، أنشئ حساب Partner مجاني
3. من لوحة التحكم، اختر **Apps** → **Create app**
4. اختر **Custom app** أو **Public app**
5. املأ معلومات التطبيق:
   - App name: اسم تطبيقك (مثلاً: Store Manager)
   - App URL: `http://localhost:5000`

### 2. إعداد OAuth

1. في صفحة التطبيق، اذهب إلى **App setup**
2. في قسم **URLs**:
   - **Allowed redirection URL(s)**: أضف `http://localhost:5000/api/shopify/callback`
3. في قسم **API credentials**:
   - انسخ **Client ID** (API key)
   - انسخ **Client secret** (API secret key)

### 3. تحديد الصلاحيات (Scopes)

في قسم **API access scopes**، فعّل الصلاحيات التالية:

- ✅ `read_products` - قراءة المنتجات
- ✅ `read_orders` - قراءة الطلبات
- ✅ `read_customers` - قراءة بيانات العملاء
- ✅ `write_orders` - تعديل الطلبات (اختياري)

### 4. تحديث ملف .env

افتح ملف `backend/.env` وحدّث القيم التالية:

```env
SHOPIFY_API_KEY=your_client_id_here
SHOPIFY_API_SECRET=your_client_secret_here
SHOPIFY_REDIRECT_URI=http://localhost:5000/api/shopify/callback
```

### 5. ربط المتجر من التطبيق

1. شغل المشروع: `npm run dev`
2. افتح المتصفح على: http://localhost:3000
3. سجل دخول أو أنشئ حساب جديد
4. اذهب إلى **الإعدادات** من القائمة الجانبية
5. املأ البيانات:
   - **اسم المتجر**: اسم متجرك على Shopify (مثلاً: `my-store` أو `my-store.myshopify.com`)
   - **Client ID**: الذي نسخته من Shopify
   - **Client Secret**: الذي نسخته من Shopify
6. اضغط **ربط المتجر**
7. سيتم توجيهك إلى صفحة Shopify للموافقة على الصلاحيات
8. بعد الموافقة، سيتم توجيهك مرة أخرى إلى التطبيق

## ملاحظات مهمة:

### للتطوير المحلي (Development):

- استخدم `http://localhost:5000` كـ App URL
- استخدم `http://localhost:5000/api/shopify/callback` كـ Redirect URI

### للإنتاج (Production):

- غيّر الـ URLs إلى domain الحقيقي
- مثال: `https://yourdomain.com` و `https://yourdomain.com/api/shopify/callback`
- حدّث ملف `.env` بالقيم الجديدة

### الأمان:

- ⚠️ لا تشارك الـ Client Secret مع أحد
- ⚠️ لا ترفع ملف `.env` على Git
- ✅ استخدم متغيرات البيئة في الإنتاج

## استكشاف الأخطاء:

### خطأ: "Invalid redirect_uri"

- تأكد من أن الـ Redirect URI في Shopify يطابق تماماً الموجود في `.env`
- تأكد من عدم وجود مسافات أو أحرف إضافية

### خطأ: "Invalid API credentials"

- تأكد من نسخ Client ID و Client Secret بشكل صحيح
- تأكد من عدم وجود مسافات في البداية أو النهاية

### خطأ: "Shop not found"

- تأكد من كتابة اسم المتجر بشكل صحيح
- يمكنك كتابة `my-store` أو `my-store.myshopify.com`

## الدعم:

إذا واجهت أي مشاكل:

1. تحقق من console في المتصفح (F12)
2. تحقق من logs في terminal الخاص بالـ backend
3. راجع Shopify Partner Dashboard للتأكد من إعدادات التطبيق

---

**ملاحظة**: هذا الدليل للتطوير المحلي. للإنتاج، ستحتاج إلى:

- Domain حقيقي مع HTTPS
- تحديث جميع الـ URLs
- مراجعة Shopify App Review (للتطبيقات العامة)
