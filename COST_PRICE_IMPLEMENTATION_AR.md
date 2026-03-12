# تنفيذ سعر التكلفة وحساب الربح ✅

## ما تم إنجازه

تم إضافة نظام كامل لحساب الربح بناءً على سعر التكلفة للمنتجات والطلبات.

---

## 1. قاعدة البيانات (Database)

### الملف: `ADD_COST_PRICE_AND_PROFIT.sql`

**يجب تنفيذ هذا الملف في Supabase SQL Editor أولاً!**

الملف يضيف:

- عمود `cost_price` لجدول المنتجات
- أعمدة محسوبة تلقائياً: `profit_per_unit` و `profit_margin_percent`
- أعمدة الربح لجدول الطلبات: `total_cost`, `total_profit`, `profit_margin_percent`
- دالة `calculate_order_profit()` لحساب ربح الطلب
- Views للتقارير: `product_profitability` و `order_profitability`

---

## 2. Backend (الخادم)

### ✅ `backend/src/services/productUpdateService.js`

تم إضافة:

- دالة جديدة `updateProduct()` تدعم تحديث السعر، سعر التكلفة، والمخزون معاً
- التحقق من صحة البيانات (validation) لسعر التكلفة
- حفظ سعر التكلفة محلياً (لا يتم إرساله إلى Shopify)
- مزامنة السعر والمخزون فقط مع Shopify

### ✅ `backend/src/routes/shopify.js`

تم تحديث:

- Endpoint `/products/:id/update` ليدعم `cost_price`
- إضافة endpoint جديد `/orders/:id/profit` لحساب ربح الطلب

---

## 3. Frontend (الواجهة)

### ✅ `frontend/src/components/ProductEditModal.jsx`

تم إضافة:

- حقل إدخال لسعر التكلفة
- عرض حساب الربح تلقائياً (الربح لكل وحدة + هامش الربح %)
- تحديث رسالة الملاحظة لتوضيح أن سعر التكلفة يُحفظ محلياً فقط

### ✅ `frontend/src/pages/ProductDetails.jsx`

تم إضافة:

- عرض سعر التكلفة في قسم "السعر والمخزون"
- حقل تعديل لسعر التكلفة في وضع التحرير
- قسم كامل لعرض حسابات الربح:
  - الربح لكل وحدة
  - هامش الربح %
  - الربح المحتمل (إجمالي المخزون × الربح لكل وحدة)
- تحديث دالة `handleSave()` لإرسال cost_price

### ✅ `frontend/src/pages/OrderDetails.jsx`

تم إضافة:

- جلب بيانات الربح من API عند تحميل الصفحة
- قسم "معلومات الربح" في ملخص الطلب يعرض:
  - التكلفة الإجمالية
  - الربح الإجمالي
  - هامش الربح %

### ✅ `frontend/src/pages/Products.jsx`

تم إضافة:

- عرض معلومات الربح على كروت المنتجات (إذا كان cost_price موجود)
- صندوق أخضر يعرض الربح وهامش الربح
- تحديث دالة `handleEditProduct()` لدعم cost_price

---

## كيفية الاستخدام

### 1. تنفيذ SQL Script (مهم جداً!)

```sql
-- افتح Supabase SQL Editor ونفذ محتوى الملف:
ADD_COST_PRICE_AND_PROFIT.sql
```

### 2. إعادة تشغيل Backend

```bash
cd backend
npm start
```

### 3. إعادة تشغيل Frontend

```bash
cd frontend
npm start
```

### 4. إضافة سعر التكلفة للمنتجات

1. اذهب إلى صفحة المنتجات
2. اضغط "تعديل" على أي منتج
3. أدخل سعر التكلفة
4. سيظهر حساب الربح تلقائياً
5. احفظ التغييرات

### 5. عرض الربح

**في صفحة المنتجات:**

- ستظهر معلومات الربح على كل كارت منتج (إذا كان له سعر تكلفة)

**في صفحة تفاصيل المنتج:**

- قسم كامل يعرض الربح لكل وحدة، هامش الربح، والربح المحتمل

**في صفحة تفاصيل الطلب:**

- قسم أخضر في ملخص الطلب يعرض التكلفة الإجمالية، الربح الإجمالي، وهامش الربح

---

## ملاحظات مهمة

### ✅ سعر التكلفة محلي فقط

- سعر التكلفة يُحفظ في قاعدة البيانات المحلية فقط
- لا يتم إرساله إلى Shopify (لأسباب أمنية)
- السعر والمخزون فقط يتم مزامنتهما مع Shopify

### ✅ حساب الربح تلقائي

- الربح لكل وحدة = السعر - سعر التكلفة
- هامش الربح % = (الربح ÷ السعر) × 100
- يتم الحساب تلقائياً في قاعدة البيانات (Generated Columns)

### ✅ ربح الطلبات

- يتم حساب ربح الطلب بناءً على:
  - سعر التكلفة لكل منتج في الطلب
  - الكمية المطلوبة من كل منتج
- إذا لم يكن للمنتج سعر تكلفة، يُعتبر صفر في الحساب

---

## الخطوات التالية (اختياري)

### تقارير الربح

يمكنك استخدام الـ Views الجاهزة:

```sql
-- أكثر المنتجات ربحاً
SELECT * FROM product_profitability
ORDER BY profit_per_unit DESC
LIMIT 10;

-- أكثر الطلبات ربحاً
SELECT * FROM order_profitability
ORDER BY total_profit DESC
LIMIT 10;
```

### صفحة تقارير الربح

يمكن إنشاء صفحة جديدة لعرض:

- إجمالي الربح اليومي/الشهري
- أكثر المنتجات ربحاً
- تحليل هامش الربح
- مقارنة الربح بين الفترات

---

## الملفات المعدلة

### Backend:

- ✅ `backend/src/services/productUpdateService.js`
- ✅ `backend/src/routes/shopify.js`

### Frontend:

- ✅ `frontend/src/components/ProductEditModal.jsx`
- ✅ `frontend/src/pages/ProductDetails.jsx`
- ✅ `frontend/src/pages/OrderDetails.jsx`
- ✅ `frontend/src/pages/Products.jsx`

### Database:

- ✅ `ADD_COST_PRICE_AND_PROFIT.sql` (يجب تنفيذه!)

---

## اختبار الميزة

1. ✅ نفذ SQL script في Supabase
2. ✅ أعد تشغيل Backend و Frontend
3. ✅ افتح صفحة المنتجات
4. ✅ عدّل منتج وأضف سعر تكلفة
5. ✅ تحقق من ظهور حساب الربح في:
   - Modal التعديل
   - كارت المنتج
   - صفحة تفاصيل المنتج
6. ✅ افتح طلب وتحقق من ظهور معلومات الربح

---

تم التنفيذ بنجاح! 🎉
