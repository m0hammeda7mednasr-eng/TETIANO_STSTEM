# ⚡ Vercel Frontend Environment Variables

## المتغيرات المطلوبة للـ Frontend على Vercel:

### 1. API Configuration

```
REACT_APP_API_BASE_URL=https://your-railway-app.railway.app/api
REACT_APP_BACKEND_URL=https://your-railway-app.railway.app
```

### 2. Supabase (للـ Real-time features)

```
REACT_APP_SUPABASE_URL=https://your-project-id.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. Application Configuration

```
REACT_APP_APP_NAME=TETIANO System
REACT_APP_VERSION=1.0.0
NODE_ENV=production
```

## 📋 كيفية إضافة المتغيرات في Vercel:

1. اذهب إلى Vercel Dashboard
2. اختر مشروعك
3. اذهب إلى Settings → Environment Variables
4. أضف كل متغير:

### مثال للقيم:

```
REACT_APP_API_BASE_URL=https://tetiano-backend.railway.app/api
REACT_APP_BACKEND_URL=https://tetiano-backend.railway.app
REACT_APP_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
REACT_APP_APP_NAME=TETIANO System
REACT_APP_VERSION=1.0.0
NODE_ENV=production
```

## ⚠️ ملاحظات مهمة:

1. **REACT*APP*** prefix مطلوب لكل متغير في React
2. **API_BASE_URL**: يجب أن ينتهي بـ /api
3. **SUPABASE_ANON_KEY**: استخدم anon key فقط (ليس service_role)
4. **NODE_ENV**: production للـ production build

## 🔄 بعد إضافة المتغيرات:

1. اضغط "Redeploy" في Vercel
2. تأكد من أن الـ build نجح
3. اختبر الاتصال بالـ API
