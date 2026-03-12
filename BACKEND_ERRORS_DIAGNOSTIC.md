# تشخيص مشاكل Backend

## المشاكل المكتشفة:

### 1. Error 500 في `/api/tasks`

- **السبب المحتمل**:
  - JWT token مش صحيح
  - Database connection فيها مشكلة
  - User role مش موجود في database

### 2. Error 500 في `/api/users/:id`

- **السبب المحتمل**:
  - User ID مش موجود
  - Database query فيها مشكلة
  - Permissions table مش موجودة

### 3. Settings page مش بيظهر Shopify

- **السبب المحتمل**:
  - Backend route مش راجع البيانات صح
  - Frontend مش بيعمل fetch للبيانات

## خطوات الحل:

### الخطوة 1: تأكد إن Backend شغال

```bash
cd backend
npm start
```

### الخطوة 2: شوف الـ errors في Terminal

ابحث عن:

- `Error:` باللون الأحمر
- `Cannot find module`
- `ECONNREFUSED`
- `JWT`
- `Supabase`

### الخطوة 3: تأكد من `.env` file

تأكد إن الملف `backend/.env` فيه:

```
SUPABASE_URL=your_url
SUPABASE_KEY=your_key
JWT_SECRET=your_secret
PORT=5000
FRONTEND_URL=http://localhost:3000
```

### الخطوة 4: اختبر الـ endpoints

```bash
# Test health check
curl http://localhost:5000/api/health

# Test tasks (with your token)
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/tasks
```

## الحل السريع:

إذا كان Backend مش شغال خالص:

1. **أوقف Backend** (Ctrl+C)
2. **امسح node_modules**:
   ```bash
   cd backend
   rm -rf node_modules
   npm install
   ```
3. **شغل Backend تاني**:
   ```bash
   npm start
   ```

## ملاحظات مهمة:

- لازم Backend يكون شغال على port 5000
- لازم Frontend يكون شغال على port 3000
- لازم Supabase credentials تكون صحيحة في `.env`
- لازم JWT_SECRET يكون موجود في `.env`

## التواصل:

بعد ما تشغل Backend، ابعتلي:

1. آخر 20 سطر من Backend Terminal
2. أي errors باللون الأحمر
3. هل Backend بيقول "Server running on port 5000"؟
