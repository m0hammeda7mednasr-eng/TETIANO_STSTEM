# اختبار صفحة صافي الربح - خطوة بخطوة

## الخطوة 1: تحقق من الكود

### 1.1 تحقق من Sidebar.jsx

افتح ملف `frontend/src/components/Sidebar.jsx` وابحث عن:

```javascript
{
  icon: TrendingUp,
  label: "صافي الربح",
  path: "/net-profit",
  show: true, // لازم تكون true
},
```

**السؤال:** هل `show: true` موجودة؟

- ✅ نعم → روح للخطوة 1.2
- ❌ لا → غيرها لـ `true` واحفظ الملف

### 1.2 تحقق من App.jsx

افتح ملف `frontend/src/App.jsx` وابحث عن:

```javascript
<Route
  path="/net-profit"
  element={
    <ProtectedRoute>
      <NetProfit />
    </ProtectedRoute>
  }
/>
```

**السؤال:** هل الـ Route موجود؟

- ✅ نعم → روح للخطوة 2
- ❌ لا → في مشكلة في الملف

## الخطوة 2: تحقق من Frontend

### 2.1 افتح المتصفح

```
http://localhost:3000
```

### 2.2 افتح Developer Tools

اضغط `F12` أو `Ctrl+Shift+I`

### 2.3 شوف Console

**السؤال:** في أخطاء (errors) حمراء؟

- ✅ نعم → اكتب الخطأ هنا: ******\_\_\_******
- ❌ لا → روح للخطوة 2.4

### 2.4 شوف القائمة الجانبية

**السؤال:** هل "صافي الربح" ظاهر في القائمة؟

- ✅ نعم → روح للخطوة 3
- ❌ لا → روح للخطوة 4

## الخطوة 3: اختبار الصفحة

### 3.1 اضغط على "صافي الربح"

**السؤال:** إيه اللي حصل؟

- الصفحة فتحت بس فاضية → روح للخطوة 5
- الصفحة فتحت وفيها محتوى → روح للخطوة 6
- ظهرت رسالة خطأ → اكتب الرسالة: ******\_\_\_******
- مفيش حاجة حصلت → روح للخطوة 4

## الخطوة 4: المشكلة - اللينك مش ظاهر

### الحل 1: تحقق من الكود

```bash
# افتح Terminal في مجلد frontend
cd frontend

# ابحث عن "صافي الربح" في الكود
grep -r "صافي الربح" src/
```

**النتيجة المتوقعة:**

```
src/components/Sidebar.jsx:      label: "صافي الربح",
```

### الحل 2: أعد تشغيل Frontend

```bash
# أوقف Frontend (Ctrl+C)
# ثم شغله من جديد
npm start
```

### الحل 3: امسح Cache

```bash
# في المتصفح
Ctrl+Shift+Delete
# امسح Cache
# أعد تحميل الصفحة
```

## الخطوة 5: المشكلة - الصفحة فاضية

### 5.1 شوف Console

افتح Developer Tools (F12) → Console

**السؤال:** في رسالة خطأ؟

- "فشل تحميل المنتجات" → Backend مش شغال
- "401 Unauthorized" → Token مش صحيح
- "404 Not Found" → API endpoint مش موجود
- غير ذلك → اكتب الخطأ: ******\_\_\_******

### 5.2 تحقق من Backend

```bash
# افتح Terminal جديد
cd backend
npm start
```

**السؤال:** Backend شغال على port 5000؟

- ✅ نعم → روح للخطوة 5.3
- ❌ لا → شغل Backend الأول

### 5.3 اختبر API

افتح في المتصفح:

```
http://localhost:5000/api/health
```

**النتيجة المتوقعة:**

```json
{ "status": "OK", "message": "Server is running" }
```

### 5.4 اختبر Products API

في Developer Tools → Network → اضغط Refresh

**السؤال:** في request لـ `/api/dashboard/products`؟

- ✅ نعم → شوف الـ Response
- ❌ لا → في مشكلة في الكود

## الخطوة 6: المشكلة - الصفحة فيها محتوى بس مش كامل

### 6.1 شوف البطاقات الإحصائية

**السؤال:** البطاقات الـ 5 ظاهرة؟

- ✅ نعم → روح للخطوة 6.2
- ❌ لا → في مشكلة في الكود

### 6.2 شوف الجدول

**السؤال:** الجدول فيه منتجات؟

- ✅ نعم → الصفحة شغالة! 🎉
- ❌ لا → مفيش منتجات في Database

## الخطوة 7: حلول سريعة

### الحل 1: أعد تحميل الصفحة

```
اضغط F5 أو Ctrl+R
```

### الحل 2: امسح Local Storage

```javascript
// في Console
localStorage.clear();
// ثم أعد تسجيل الدخول
```

### الحل 3: تحقق من Token

```javascript
// في Console
console.log(localStorage.getItem("token"));
// لازم يطلع Token طويل
```

### الحل 4: أعد تشغيل كل حاجة

```bash
# أوقف Frontend (Ctrl+C)
# أوقف Backend (Ctrl+C)

# شغل Backend
cd backend
npm start

# في Terminal جديد، شغل Frontend
cd frontend
npm start
```

## الخطوة 8: اختبار شامل

### 8.1 تحقق من المنتجات

```
1. افتح صفحة "المنتجات"
2. شوف لو في منتجات
3. لو مفيش، اعمل Sync من Shopify
```

### 8.2 تحقق من صفحة صافي الربح

```
1. افتح صفحة "صافي الربح"
2. لازم تشوف نفس المنتجات
3. لو مفيش، في مشكلة في API
```

## التشخيص النهائي

### السيناريو 1: اللينك مش ظاهر

```
السبب: show: false في Sidebar
الحل: غيرها لـ show: true
```

### السيناريو 2: الصفحة مش بتفتح

```
السبب: Route مش موجود في App.jsx
الحل: تأكد من وجود Route
```

### السيناريو 3: الصفحة فاضية

```
السبب: مفيش منتجات أو Backend مش شغال
الحل: تأكد من Backend وعمل Sync
```

### السيناريو 4: خطأ في API

```
السبب: Backend مش شغال أو Token مش صحيح
الحل: أعد تشغيل Backend وتسجيل الدخول
```

## معلومات مهمة للتشخيص

### URLs المهمة

```
Frontend: http://localhost:3000
Backend: http://localhost:5000
Health Check: http://localhost:5000/api/health
Products API: http://localhost:5000/api/dashboard/products
Net Profit Page: http://localhost:3000/net-profit
```

### الملفات المهمة

```
frontend/src/components/Sidebar.jsx
frontend/src/pages/NetProfit.jsx
frontend/src/App.jsx
backend/src/routes/dashboard.js
```

### الأوامر المهمة

```bash
# Frontend
cd frontend
npm start

# Backend
cd backend
npm start

# تنظيف Cache
npm cache clean --force
rm -rf node_modules
npm install
```

---

## اكتب هنا المشكلة اللي عندك:

**1. اللينك ظاهر في القائمة؟**

- [ ] نعم
- [ ] لا

**2. لما تضغط على اللينك، إيه اللي بيحصل؟**

---

**3. في رسالة خطأ في Console؟**

---

**4. Backend شغال؟**

- [ ] نعم
- [ ] لا

**5. عندك منتجات في صفحة "المنتجات"؟**

- [ ] نعم
- [ ] لا

**6. Screenshot للمشكلة (لو ممكن):**

---
