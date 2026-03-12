# حل مشكلة Shopify Localhost

## المشكلة

```
Oauth error invalid_request: The redirect_uri is not whitelisted
```

Shopify لا يقبل `http://localhost` في Redirect URLs. يجب استخدام HTTPS URL عام.

## الحل السريع (اختر واحد)

### الخيار 1: ngrok (سهل وسريع) ⭐ مُوصى به للمبتدئين

1. **حمل ngrok:**
   - اذهب إلى: https://ngrok.com/download
   - حمل النسخة لـ Windows
   - فك الضغط

2. **شغل السكريبت:**

   ```bash
   setup-ngrok.bat
   ```

3. **انسخ الـ URL:**
   سيظهر شيء مثل:

   ```
   Forwarding  https://abc123.ngrok.io -> http://localhost:5000
   ```

4. **حدث الإعدادات:**
   - افتح `backend/.env`
   - غير السطر:
     ```
     SHOPIFY_REDIRECT_URI=https://abc123.ngrok.io/api/shopify/callback
     ```

5. **حدث Shopify:**
   - اذهب إلى Shopify Admin
   - Settings → Apps and sales channels → Develop apps
   - افتح تطبيقك → Configuration
   - أضف في Allowed redirection URL(s):
     ```
     https://abc123.ngrok.io/api/shopify/callback
     ```

6. **أعد تشغيل Backend:**

   ```bash
   cd backend
   npm start
   ```

7. **جرب الربط من صفحة الإعدادات!**

---

### الخيار 2: Cloudflare Tunnel (URL ثابت) ⭐ مُوصى به للاستخدام الطويل

1. **ثبت cloudflared:**

   ```bash
   winget install --id Cloudflare.cloudflared
   ```

2. **شغل السكريبت:**

   ```bash
   setup-cloudflare.bat
   ```

3. **باقي الخطوات نفس ngrok** (استخدم الـ URL من Cloudflare)

---

## الفرق بين الخيارين

| الميزة        | ngrok           | Cloudflare Tunnel |
| ------------- | --------------- | ----------------- |
| السعر         | مجاني           | مجاني             |
| HTTPS         | ✅ تلقائي       | ✅ تلقائي         |
| URL ثابت      | ❌ يتغير كل مرة | ✅ يبقى ثابت      |
| سهولة الإعداد | ⭐⭐⭐⭐⭐      | ⭐⭐⭐⭐          |
| التثبيت       | سهل جداً        | يحتاج winget      |

---

## خطوات مفصلة بعد تشغيل Tunnel

### 1. تحديث Backend Environment

افتح `backend/.env` وغير:

```env
SHOPIFY_REDIRECT_URI=https://YOUR-TUNNEL-URL/api/shopify/callback
```

### 2. تحديث Shopify App

1. اذهب إلى: https://partners.shopify.com/
2. أو من متجرك: Settings → Apps and sales channels → Develop apps
3. افتح التطبيق
4. اذهب إلى: Configuration → App setup
5. في **Allowed redirection URL(s)**، أضف:
   ```
   https://YOUR-TUNNEL-URL/api/shopify/callback
   ```
6. احفظ

### 3. إعادة تشغيل Backend

```bash
cd backend
npm start
```

### 4. اختبار الربط

1. افتح التطبيق: http://localhost:3000
2. اذهب إلى الإعدادات
3. أدخل:
   - Client ID (من Shopify)
   - Client Secret (من Shopify)
4. احفظ البيانات
5. أدخل اسم المتجر: `your-store.myshopify.com`
6. اضغط "ربط المتجر"
7. سيتم توجيهك إلى Shopify للموافقة
8. بعد الموافقة، سيتم الرجوع إلى التطبيق

---

## استكشاف الأخطاء

### ❌ "redirect_uri is not whitelisted"

**الحل:**

- تأكد أن الـ URL في `.env` يطابق تماماً الـ URL في Shopify
- تأكد أن الـ tunnel شغال
- تأكد أنك حفظت التغييرات في Shopify

### ❌ "Could not find Shopify API application"

**الحل:**

- تأكد أنك أدخلت Client ID صحيح في صفحة الإعدادات
- تأكد أنك ضغطت "حفظ البيانات" قبل "ربط المتجر"

### ❌ Backend لا يستجيب

**الحل:**

- تأكد أن Backend شغال على port 5000
- تأكد أن الـ tunnel شغال
- جرب الوصول إلى: `https://your-tunnel-url/api/shopify/status`

### ❌ ngrok URL يتغير كل مرة

**الحل:**

- استخدم Cloudflare Tunnel بدلاً من ngrok
- أو اشترك في ngrok المدفوع للحصول على URL ثابت

---

## ملاحظات مهمة

1. **لازم الـ tunnel يكون شغال:**
   - افتح terminal منفصل
   - شغل `ngrok http 5000` أو `cloudflared tunnel --url http://localhost:5000`
   - اتركه شغال طول فترة التطوير

2. **عند إعادة تشغيل ngrok:**
   - ستحصل على URL جديد
   - حدث `.env`
   - حدث Shopify App Settings
   - أعد تشغيل Backend

3. **للإنتاج (Production):**
   - استخدم domain حقيقي
   - أو استخدم Cloudflare Tunnel مع custom domain

---

## الخطوات التالية

بعد نجاح الربط:

1. ✅ سيتم مزامنة المنتجات تلقائياً
2. ✅ سيتم مزامنة الطلبات
3. ✅ سيتم مزامنة العملاء
4. ✅ يمكنك عرض كل البيانات في التطبيق

---

## روابط مفيدة

- ngrok: https://ngrok.com/
- Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- Shopify OAuth: https://shopify.dev/docs/apps/auth/oauth
- دليل الإعداد الكامل: `NGROK_SETUP_AR.md`
