# حالة ربط Railway Domain

## ✅ تم بالفعل!

- Railway Domain: `api.tetiano.me` مضاف ومربوط
- Port: 5000 (صحيح)
- Status: Active

## ⚠️ مشكلة مؤقتة

- Outbound Networking Issue في Railway
- هذا لا يؤثر على الدومين المخصص
- المشكلة في الاتصالات الخارجية (مثل Shopify API)

## الخطوات المتبقية

### 1. إعداد Vercel Domain (الأهم الآن)

في Vercel Dashboard:

1. اذهب إلى مشروع `tetiano-ststem`
2. Settings → Domains
3. Add Domain: `tetiano.me`
4. Add Domain: `www.tetiano.me`

### 2. تحديث DNS في Namecheap

في Namecheap → tetiano.me → Advanced DNS:

**احذف الـ Records الموجودة واستبدلها بـ:**

```
Type: A Record
Host: @
Value: 76.76.19.61
TTL: Automatic

Type: CNAME Record
Host: www
Value: cname.vercel-dns.com
TTL: Automatic

Type: CNAME Record
Host: api
Value: tetianoststem-production.up.railway.app
TTL: Automatic
```

### 3. تحديث Environment Variables في Railway

في Railway → Settings → Variables:

```
FRONTEND_URL=https://tetiano.me
BACKEND_URL=https://api.tetiano.me
SHOPIFY_REDIRECT_URI=https://api.tetiano.me/api/shopify/callback
```

### 4. Redeploy (بعد حل مشكلة Networking)

انتظر حل مشكلة الـ outbound networking ثم:

1. Railway → Redeploy
2. Vercel → سيعمل تلقائياً

## الجدول الزمني المحدث

| المرحلة            | الحالة     | الوقت       |
| ------------------ | ---------- | ----------- |
| Railway Domain     | ✅ مكتمل   | 0 دقيقة     |
| Vercel Domain      | ⏳ مطلوب   | 10 دقائق    |
| DNS Update         | ⏳ مطلوب   | 5 دقائق     |
| Railway Networking | ⚠️ انتظار  | غير محدد    |
| DNS Propagation    | ⏳ بعد DNS | 15-30 دقيقة |

## خطة بديلة (إذا استمرت مشكلة Railway)

### استخدام الدومين الحالي مؤقتاً:

```
Frontend: https://tetiano.me (Vercel)
Backend: https://tetianoststem-production.up.railway.app (مؤقت)
```

### تحديث Frontend للاستخدام المؤقت:

```javascript
// في frontend/src/utils/api.js
const API_BASE =
  process.env.NODE_ENV === "production"
    ? "https://tetianoststem-production.up.railway.app/api" // مؤقت
    : "http://localhost:5000/api";
```

## النتيجة الحالية

✅ **Railway**: api.tetiano.me جاهز  
⏳ **Vercel**: يحتاج إعداد tetiano.me  
⏳ **DNS**: يحتاج تحديث في Namecheap  
⚠️ **Railway Issue**: مشكلة مؤقتة في الشبكة

**الأولوية الآن: إعداد Vercel Domain + تحديث DNS** 🚀
