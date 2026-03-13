# 🚀 دليل الـ Deployment الكامل

## الخطوة 1: Deploy Backend على Railway

### 1. إنشاء مشروع Railway

```bash
# تسجيل الدخول
railway login

# إنشاء مشروع جديد
railway init

# ربط GitHub Repository
railway connect
```

### 2. إعداد Environment Variables في Railway

اذهب إلى Railway Dashboard → Variables وأضف:

```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long
SHOPIFY_API_KEY=your-shopify-api-key
SHOPIFY_API_SECRET=your-shopify-api-secret
FRONTEND_URL=https://your-vercel-app.vercel.app
BACKEND_URL=https://your-railway-app.railway.app
PORT=5000
NODE_ENV=production
```

### 3. إعداد Build Settings

في Railway Dashboard → Settings:

- **Root Directory**: `.` (اتركه فارغ)
- **Build Command**: `cd backend && npm install --production`
- **Start Command**: `cd backend && npm start`

أو استخدم الملفات المرفقة:

- ✅ `railway.json` - إعدادات Railway
- ✅ `nixpacks.toml` - إعدادات Nixpacks

### 4. Deploy

```bash
railway up
```

---

## الخطوة 2: Deploy Frontend على Vercel

### 1. ربط GitHub Repository

- اذهب إلى Vercel Dashboard
- اضغط "New Project"
- اختر GitHub Repository: `TETIANO_STSTEM`

### 2. إعداد Build Settings

- **Framework Preset**: React
- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `build`

### 3. إعداد Environment Variables في Vercel

اذهب إلى Vercel Dashboard → Settings → Environment Variables:

```
REACT_APP_API_BASE_URL=https://your-railway-app.railway.app/api
REACT_APP_BACKEND_URL=https://your-railway-app.railway.app
REACT_APP_SUPABASE_URL=https://your-project-id.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-supabase-anon-key
REACT_APP_APP_NAME=TETIANO System
REACT_APP_VERSION=1.0.0
NODE_ENV=production
```

### 4. Deploy

اضغط "Deploy" - Vercel هيعمل auto-deploy من GitHub

---

## الخطوة 3: تحديث URLs

### 1. تحديث Backend URL في Frontend

بعد ما Railway يدي URL للـ backend، حدث المتغيرات في Vercel:

```
REACT_APP_API_BASE_URL=https://tetiano-backend-production.railway.app/api
REACT_APP_BACKEND_URL=https://tetiano-backend-production.railway.app
```

### 2. تحديث Frontend URL في Backend

بعد ما Vercel يدي URL للـ frontend، حدث المتغيرات في Railway:

```
FRONTEND_URL=https://tetiano-system.vercel.app
```

### 3. Redeploy Both

- في Vercel: اضغط "Redeploy"
- في Railway: هيعمل auto-redeploy لما تحدث المتغيرات

---

## الخطوة 4: اختبار النظام

### 1. اختبار Backend

```bash
curl https://your-railway-app.railway.app/api/health
```

### 2. اختبار Frontend

- افتح https://your-vercel-app.vercel.app
- جرب تسجيل الدخول
- تأكد من أن API calls بتشتغل

### 3. اختبار التكامل

- سجل دخول كـ admin
- جرب Analytics page
- تأكد من أن البيانات بتظهر

---

## 🔧 استكشاف الأخطاء

### مشاكل شائعة:

#### 1. CORS Error

**المشكلة**: Frontend مش قادر يوصل للـ Backend
**الحل**: تأكد من أن `FRONTEND_URL` صحيح في Railway

#### 2. 404 على API calls

**المشكلة**: `REACT_APP_API_BASE_URL` غلط
**الحل**: تأكد من أن URL ينتهي بـ `/api`

#### 3. Database Connection Error

**المشكلة**: Supabase credentials غلط
**الحل**: تأكد من `SUPABASE_URL` و `SUPABASE_KEY`

#### 4. JWT Error

**المشكلة**: `JWT_SECRET` مش موجود أو قصير
**الحل**: استخدم secret طويل (32+ حرف)

---

## 📋 Checklist

### قبل الـ Deployment:

- [ ] تأكد من أن Backend يشتغل محلياً
- [ ] تأكد من أن Frontend يشتغل محلياً
- [ ] جهز Supabase credentials
- [ ] جهز Shopify credentials (اختياري)

### بعد الـ Deployment:

- [ ] Backend URL يرد على `/api/health`
- [ ] Frontend يفتح بدون errors
- [ ] تسجيل الدخول يشتغل
- [ ] API calls تشتغل
- [ ] Analytics page تشتغل للـ admin

---

## 🎯 URLs النهائية

بعد الـ deployment الناجح:

- **Frontend**: https://tetiano-system.vercel.app
- **Backend**: https://tetiano-backend-production.railway.app
- **API**: https://tetiano-backend-production.railway.app/api
- **Health Check**: https://tetiano-backend-production.railway.app/api/health

---

## 🔒 الأمان

### Production Security:

- استخدم HTTPS فقط
- لا تشارك SERVICE_ROLE_KEY
- استخدم JWT_SECRET قوي
- فعل CORS للـ frontend domain فقط
- راجع Supabase RLS policies

### Monitoring:

- راقب Railway logs للـ backend errors
- راقب Vercel logs للـ frontend errors
- استخدم Supabase Dashboard لمراقبة Database
- فعل error tracking (Sentry اختياري)
