# ربط المشروع بالدومين tetiano.me

## الوضع الحالي

- الدومين: `tetiano.me` (في Namecheap)
- Frontend: Vercel
- Backend: Railway
- DNS Records موجودة جزئياً

## خطة الربط السريع

### 1. إعداد Frontend على Vercel

#### في Vercel Dashboard:

1. اذهب إلى مشروع `tetiano-ststem`
2. Settings → Domains
3. أضف الدومينات:
   - `tetiano.me` (الرئيسي)
   - `www.tetiano.me` (redirect)

#### DNS Records المطلوبة في Namecheap:

```
Type: A Record
Host: @
Value: 76.76.19.61
TTL: Automatic

Type: CNAME Record
Host: www
Value: cname.vercel-dns.com
TTL: Automatic
```

### 2. إعداد Backend على Railway

#### في Railway Dashboard:

1. اذهب إلى مشروع `tetianoststem-production`
2. Settings → Domains
3. أضف الدومين: `api.tetiano.me`

#### DNS Record المطلوب في Namecheap:

```
Type: CNAME Record
Host: api
Value: tetianoststem-production.up.railway.app
TTL: Automatic
```

### 3. تحديث إعدادات المشروع

#### في Backend (.env):

```env
FRONTEND_URL=https://tetiano.me
BACKEND_URL=https://api.tetiano.me
```

#### في Frontend:

```javascript
// في utils/api.js أو config
const API_BASE_URL = "https://api.tetiano.me";
```

## الخطوات التفصيلية

### الخطوة 1: إعداد DNS في Namecheap

1. اذهب إلى Namecheap Dashboard
2. Domains → tetiano.me → Advanced DNS
3. احذف الـ Records الموجودة (ماعدا MX و TXT)
4. أضف الـ Records الجديدة:

```
A Record: @ → 76.76.19.61
CNAME: www → cname.vercel-dns.com
CNAME: api → tetianoststem-production.up.railway.app
```

### الخطوة 2: إعداد Vercel

1. Vercel Dashboard → tetiano-ststem project
2. Settings → Domains → Add Domain
3. أضف: `tetiano.me`
4. أضف: `www.tetiano.me` (redirect to tetiano.me)

### الخطوة 3: إعداد Railway

1. Railway Dashboard → tetianoststem-production
2. Settings → Domains → Add Domain
3. أضف: `api.tetiano.me`

### الخطوة 4: تحديث الكود

#### Backend Environment Variables:

```env
FRONTEND_URL=https://tetiano.me
BACKEND_URL=https://api.tetiano.me
SHOPIFY_REDIRECT_URI=https://api.tetiano.me/api/shopify/callback
```

#### Frontend API Configuration:

```javascript
// في src/utils/api.js
const baseURL =
  process.env.NODE_ENV === "production"
    ? "https://api.tetiano.me/api"
    : "http://localhost:5000/api";
```

## التحقق من الربط

### 1. فحص DNS:

```bash
nslookup tetiano.me
nslookup www.tetiano.me
nslookup api.tetiano.me
```

### 2. فحص المواقع:

- Frontend: https://tetiano.me
- Backend API: https://api.tetiano.me/api/health
- Shopify Callback: https://api.tetiano.me/api/shopify/callback

### 3. فحص SSL:

- تأكد من وجود شهادات SSL على كل الدومينات
- Vercel و Railway يوفروا SSL تلقائياً

## الجدول الزمني

| الخطوة          | الوقت المتوقع | الحالة |
| --------------- | ------------- | ------ |
| DNS Setup       | 5 دقائق       | ⏳     |
| Vercel Domain   | 10 دقائق      | ⏳     |
| Railway Domain  | 5 دقائق       | ⏳     |
| Code Update     | 15 دقائق      | ⏳     |
| DNS Propagation | 5-30 دقيقة    | ⏳     |
| Testing         | 10 دقائق      | ⏳     |

**إجمالي الوقت: 50-75 دقيقة**

## استكشاف الأخطاء

### إذا لم يعمل الدومين:

1. تحقق من DNS propagation: https://dnschecker.org
2. تأكد من صحة الـ Records في Namecheap
3. انتظر حتى 24 ساعة للـ propagation الكامل

### إذا ظهرت أخطاء SSL:

1. انتظر 10-15 دقيقة لإصدار الشهادات
2. تحقق من إعدادات Vercel/Railway
3. جرب Force SSL Renewal

### إذا لم تعمل API calls:

1. تحقق من CORS settings في Backend
2. تأكد من تحديث API URLs في Frontend
3. فحص Network tab في Browser DevTools

## النتيجة النهائية

بعد الانتهاء:

- ✅ Frontend: https://tetiano.me
- ✅ Backend API: https://api.tetiano.me
- ✅ SSL Certificates: تلقائية
- ✅ Custom Domain: مربوط بالكامل
- ✅ Professional Setup: جاهز للإنتاج

**يلا نبدأ الربط! 🚀**
