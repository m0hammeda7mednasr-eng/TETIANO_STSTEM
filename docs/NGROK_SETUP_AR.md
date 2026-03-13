# دليل إعداد ngrok لربط Shopify

## المشكلة

Shopify لا يقبل `localhost` في Redirect URLs. نحتاج إلى URL عام (HTTPS) للـ OAuth.

## الحل: استخدام ngrok

### الخطوة 1: تثبيت ngrok

#### على Windows:

1. اذهب إلى: https://ngrok.com/download
2. حمل ngrok لـ Windows
3. فك الضغط عن الملف
4. ضع `ngrok.exe` في مجلد سهل الوصول إليه

#### أو باستخدام Chocolatey:

```bash
choco install ngrok
```

### الخطوة 2: إنشاء حساب مجاني

1. اذهب إلى: https://dashboard.ngrok.com/signup
2. سجل حساب مجاني
3. احصل على Auth Token من: https://dashboard.ngrok.com/get-started/your-authtoken

### الخطوة 3: ربط ngrok بحسابك

```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

### الخطوة 4: تشغيل ngrok

افتح terminal جديد وشغل:

```bash
ngrok http 5000
```

ستحصل على شيء مثل:

```
Forwarding  https://abc123.ngrok.io -> http://localhost:5000
```

### الخطوة 5: تحديث الإعدادات

#### في ملف `backend/.env`:

```env
SHOPIFY_REDIRECT_URI=https://abc123.ngrok.io/api/shopify/callback
```

⚠️ استبدل `abc123.ngrok.io` بالـ URL الذي حصلت عليه من ngrok

#### في Shopify App Settings:

1. اذهب إلى Shopify Admin → Settings → Apps and sales channels → Develop apps
2. افتح التطبيق الخاص بك
3. اذهب إلى Configuration → App setup
4. في Allowed redirection URL(s)، أضف:
   ```
   https://abc123.ngrok.io/api/shopify/callback
   ```
5. احفظ التغييرات

### الخطوة 6: تحديث Frontend

في `frontend/src/pages/Settings.jsx`، غير السطر:

```javascript
redirectUri: "https://abc123.ngrok.io/api/shopify/callback";
```

وفي `handleConnect`، غير:

```javascript
const oauthUrl = `https://abc123.ngrok.io/api/shopify/auth?shop=${shop}&userId=${userId}&apiKey=${encodeURIComponent(shopifyConfig.apiKey)}`;
```

### الخطوة 7: إعادة تشغيل Backend

```bash
cd backend
npm start
```

### الخطوة 8: اختبار الربط

1. اذهب إلى صفحة الإعدادات في التطبيق
2. أدخل Client ID و Client Secret
3. احفظ البيانات
4. أدخل اسم المتجر
5. اضغط "ربط المتجر"

## ملاحظات مهمة

### ngrok المجاني:

- ✅ مجاني تماماً
- ✅ HTTPS تلقائي
- ⚠️ الـ URL يتغير كل مرة تشغل ngrok (إلا إذا اشتركت في النسخة المدفوعة)
- ⚠️ لازم يكون شغال طول الوقت أثناء التطوير

### عند إعادة تشغيل ngrok:

1. ستحصل على URL جديد
2. حدث `backend/.env`
3. حدث Shopify App Settings
4. حدث `frontend/src/pages/Settings.jsx`
5. أعد تشغيل Backend

## بديل: Cloudflare Tunnel (مجاني ودائم)

إذا أردت URL ثابت لا يتغير:

### تثبيت cloudflared:

```bash
# Windows
winget install --id Cloudflare.cloudflared
```

### تشغيل Tunnel:

```bash
cloudflared tunnel --url http://localhost:5000
```

ستحصل على URL مثل: `https://xyz.trycloudflare.com`

## استكشاف الأخطاء

### خطأ: "redirect_uri is not whitelisted"

- تأكد أن الـ URL في Shopify يطابق تماماً الـ URL في `.env`
- تأكد أن ngrok شغال
- تأكد أنك حفظت التغييرات في Shopify

### خطأ: "tunnel not found"

- تأكد أن ngrok شغال في terminal منفصل
- تأكد أن الـ port صحيح (5000)

### Backend لا يستجيب:

- تأكد أن Backend شغال على port 5000
- جرب الوصول إلى: `https://your-ngrok-url.ngrok.io/api/shopify/status`
