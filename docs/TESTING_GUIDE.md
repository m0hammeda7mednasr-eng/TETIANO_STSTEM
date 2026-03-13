# 🧪 دليل الاختبار والاستخدام

## قبل البدء

تأكد من أن لديك:

- ✅ Node.js مثبت (v16+)
- ✅ حساب Supabase
- ✅ حساب Shopify Partner
- ✅ Custom App في Shopify

---

## 1️⃣ خطوات الإعداد والتشغيل

### أ. استنساخ/فتح المشروع

```bash
cd "c:\Users\mm56m\OneDrive\Desktop\New folder (5)"
code .
```

### ب. تثبيت المتطلبات

```bash
npm run install-all
```

### ج. إعداد متغيرات البيئة

أنشئ ملف `backend/.env`:

```env
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_REDIRECT_URI=http://localhost:5000/api/shopify/callback

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_anon_key

JWT_SECRET=your_super_secret_key_here

PORT=5000
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

### د. إعداد Supabase Database

```sql
-- اذهب إلى SQL Editor في Supabase
-- انسخ ولصق كل محتويات DATABASE_SCHEMA.sql
-- اضغط "Run"
```

### هـ. تشغيل التطبيق

```bash
# في Terminal جديد
npm run dev

# أو على حدة:
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm start
```

---

## 2️⃣ سيناريوهات الاختبار

### ✅ Test 1: التسجيل والدخول

#### خطوات:

1. اذهب إلى http://localhost:3000
2. اضغط على "Sign Up"
3. أدخل البيانات:
   - Name: `Ahmed Ali`
   - Email: `ahmed@example.com`
   - Password: `Password123`
4. اضغط "Create Account"
5. ستنقل تلقائياً إلى Dashboard

#### النتيجة المتوقعة:

✅ تسجيل ناجح + حفظ التوكن

---

### ✅ Test 2: تسجيل الدخول

#### خطوات:

1. اضغط "Logout" من Sidebar
2. اذهب إلى http://localhost:3000/login
3. أدخل البيانات من الاختبار السابق
4. اضغط "Sign In"

#### النتيجة المتوقعة:

✅ دخول ناجح إلى Dashboard

---

### ✅ Test 3: رؤية Dashboard

#### النتوقعات:

- ✅ بطاقات الإحصائيات تظهر (أولاً 0 لأنه لا توجد بيانات)
- ✅ رسوم بيانية تظهر بشكل صحيح
- ✅ زر "Sync Shopify" يظهر

---

### ✅ Test 4: ربط Shopify

#### خطوات:

1. في Dashboard، اضغط زر "Sync Shopify"
2. ستظهر صفحة تسجيل دخول Shopify
3. أدخل shop name: `your-shop.myshopify.com`
4. وافق على الصلاحيات
5. ستعود إلى Dashboard وتبدأ المزامنة

#### النتوقعات:

- ✅ سيعاد التوجيه إلى Shopify
- ✅ سيظهر OAuth authorization screen
- ✅ بعد الموافقة، تعود إلى التطبيق
- ✅ القائمة تبدأ تحديثها بالبيانات

---

### ✅ Test 5: عرض المنتجات

#### خطوات:

1. اضغط على "Products" في Sidebar
2. انتظر تحميل البيانات

#### النتوقعات:

- ✅ جميع منتجات Shopify تظهر
- ✅ الصور تحميل
- ✅ السعر والمخزون يظهران
- ✅ البحث يعمل

---

### ✅ Test 6: عرض الطلبات

#### خطوات:

1. اضغط على "Orders" في Sidebar
2. انتظر تحميل الطلبات

#### النتوقعات:

- ✅ جدول الطلبات يظهر
- ✅ حالة الدفع تظهر بألوان مختلفة
- ✅ حالة التوصيل تظهر
- ✅ معلومات العميل صحيحة

---

### ✅ Test 7: عرض العملاء

#### خطوات:

1. اضغط على "Customers" في Sidebar

#### النتوقعات:

- ✅ قائمة العملاء تظهر
- ✅ المعلومات الشخصية صحيحة
- ✅ إجمالي المشتريات وعدد الطلبات يظهران

---

## 3️⃣ اختبار الـ APIs باستخدام Postman/Curl

### تسجيل الدخول

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "ahmed@example.com",
    "password": "Password123"
  }'
```

**Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "ahmed@example.com",
    "name": "Ahmed Ali"
  }
}
```

### جلب Dashboard Stats

```bash
curl -X GET http://localhost:5000/api/dashboard/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**

```json
{
  "total_sales": 50000,
  "total_orders": 150,
  "total_products": 250,
  "total_customers": 75,
  "avg_order_value": 333.33
}
```

### جلب المنتجات

```bash
curl -X GET http://localhost:5000/api/dashboard/products \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### جلب الطلبات

```bash
curl -X GET http://localhost:5000/api/dashboard/orders \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### جلب العملاء

```bash
curl -X GET http://localhost:5000/api/dashboard/customers \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### مزامنة Shopify

```bash
curl -X POST http://localhost:5000/api/shopify/sync \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 4️⃣ حل المشاكل الشائعة

### مشكلة: "Cannot GET /api/auth/login"

**الحل:**

- تأكد من أن Backend يعمل: `npm run dev` من مجلد backend
- تأكد من Port 5000

### مشكلة: "Shopify OAuth failed"

**الحل:**

- تحقق من SHOPIFY_API_KEY و SHOPIFY_API_SECRET
- تحقق من SHOPIFY_REDIRECT_URI تماماً
- تأكد من تسجيل الـ Custom App في Shopify

### مشكلة: "Cannot connect to Supabase"

**الحل:**

- تحقق من SUPABASE_URL و SUPABASE_KEY
- تأكد من إنشاء الجداول
- تأكد من الاتصال بالإنترنت

### مشكلة: "No products/orders showing"

**الحل:**

- اضغط "Sync Shopify" زر
- انتظر المزامنة (قد تستغرق دقيقة)
- تحقق من أن المتجر به منتجات فعلاً في Shopify

---

## 5️⃣ مؤشرات النجاح

### ✅ Frontend Success Indicators

- صفحات التسجيل تعمل بسلاسة
- التنقل بين الصفحات سريع
- الرسوم البيانية تحمل وتعرض البيانات
- البحث يعمل فقط
- الـ Loading states تظهر وتختفي

### ✅ Backend Success Indicators

- المشاهد الملونة خضراء في Terminal
- لا توجد أخطاء في Console
- الـ APIs تستجيب برسائل JSON صحيحة
- الـ Tokens تُحفظ وتُتحقق منها

### ✅ Database Success Indicators

- الجداول موجودة في Supabase
- البيانات تُدرج بسلاسة
- الـ RLS policies تعمل
- الفهارس محسّنة

### ✅ Shopify Integration Success Indicators

- OAuth يعمل بنجاح
- البيانات تتزامن من Shopify
- الصور في المنتجات تحمل
- المعلومات محدثة

---

## 6️⃣ اختبار الأداء

### افتح DevTools (F12):

#### Console Tab

```javascript
// قياس أداء التحميل
console.time("Dashboard Load");
// ... قم بتفاعل
console.timeEnd("Dashboard Load");
```

#### Network Tab

- تحقق من أن طلبات API سريعة (< 1s)
- تحقق من أن الصور تحمل بسرعة
- لا توجد أخطاء 500

#### Performance Tab

- شغّل Lighthouse
- التقييم يجب أن يكون 80+

---

## 7️⃣ قائمة التحقق قبل الإنتاج

- [ ] جميع المتغيرات البيئية صحيحة
- [ ] Database Schema موجود
- [ ] جميع APIs تعمل
- [ ] الـ Frontend و Backend متصلة
- [ ] Shopify Integration يعمل
- [ ] No console errors
- [ ] All tests passing
- [ ] البيانات تتزامن بسهولة
- [ ] الأمان مطبق (JWT, CORS, RLS)
- [ ] Performance جيد

---

## 📝 ملاحظات إضافية

- جميع كلمات المرور تُشفر تلقائياً باستخدام bcryptjs
- جميع الطلبات تحتاج على Token في Headers
- الـ Database يحمي البيانات باستخدام RLS
- يمكنك الوثوق بـ API 100%

---

## 🎓 ترتيب الاختبار المقترح

1. اختبر التسجيل/الدخول أولاً
2. ثم اختبر Dashboard (بدون بيانات)
3. ثم اربط Shopify (OAuth)
4. ثم اختبر المزامنة
5. ثم اختبر عرض البيانات بعد المزامنة
6. أخيراً اختبر البحث والفلترة

---

**تم! التطبيق جاهز للاختبار الشامل والاستخدام الفعلي! 🎉**
