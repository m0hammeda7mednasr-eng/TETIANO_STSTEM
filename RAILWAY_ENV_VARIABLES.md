# 🚂 Railway Backend Environment Variables

## المتغيرات المطلوبة للـ Backend على Railway:

### 1. Database (Supabase)

```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

### 2. Authentication

```
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long
```

### 3. Shopify Integration

```
SHOPIFY_API_KEY=your-shopify-api-key
SHOPIFY_API_SECRET=your-shopify-api-secret
```

### 4. Application URLs

```
FRONTEND_URL=https://your-vercel-app.vercel.app
BACKEND_URL=https://your-railway-app.railway.app
```

### 5. Server Configuration

```
PORT=5000
NODE_ENV=production
```

## 📋 كيفية إضافة المتغيرات في Railway:

1. اذهب إلى Railway Dashboard
2. اختر مشروعك
3. اذهب إلى Variables tab
4. أضف كل متغير على حدة:

### مثال للقيم:

```
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
JWT_SECRET=my-super-secret-jwt-key-for-tetiano-system-2024
SHOPIFY_API_KEY=1234567890abcdef
SHOPIFY_API_SECRET=abcdef1234567890
FRONTEND_URL=https://tetiano-system.vercel.app
BACKEND_URL=https://tetiano-backend.railway.app
PORT=5000
NODE_ENV=production
```

## ⚠️ ملاحظات مهمة:

1. **JWT_SECRET**: يجب أن يكون طويل ومعقد (32 حرف على الأقل)
2. **SUPABASE_URL**: من Supabase Project Settings → API
3. **SUPABASE_KEY**: anon/public key من Supabase
4. **SUPABASE_SERVICE_ROLE_KEY**: service_role key من Supabase (سري جداً!)
5. **SHOPIFY_API_KEY/SECRET**: من Shopify Partner Dashboard
6. **FRONTEND_URL**: URL الـ Vercel بعد الـ deployment
7. **BACKEND_URL**: URL الـ Railway بعد الـ deployment

## 🔒 الأمان:

- لا تشارك الـ SERVICE_ROLE_KEY مع أحد
- لا تضع المتغيرات في الكود
- استخدم HTTPS فقط في Production
