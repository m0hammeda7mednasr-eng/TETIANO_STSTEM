# الإصلاحات العاجلة المطلوبة 🚨

## المشاكل المكتشفة:

### 1. ✅ صفحة "متاجري" (My Stores) - سيتم حذفها

- الصفحة موجودة في Sidebar
- الصفحة موجودة في App.jsx routes
- الملف: `frontend/src/pages/MyStores.jsx`

### 2. ❌ لوحة الأدمن - بتطلع error

- المشكلة: صفحة `/admin` موجودة في routes لكن مش واضح إيه المشكلة
- محتاج نشوف الـ error message

### 3. ❌ Dashboard Stats - بتطلع error لليوزر العادي

- المشكلة: الـ models بتستخدم `.eq("user_id", userId)`
- **لكن الداتا من Shopify مفروض تبقى shared!**
- Products, Orders, Customers مفروض كل الناس تشوفهم

### 4. ❌ رفع الملفات في Tasks والتقارير

- محتاج نتأكد إن multer شغال صح
- محتاج نتأكد إن fileUploadService شغال

---

## الحل:

### الخطوة 1: حذف صفحة "متاجري"

1. حذف من Sidebar.jsx
2. حذف من App.jsx routes
3. حذف الملف MyStores.jsx

### الخطوة 2: إصلاح Dashboard Stats

**المشكلة الرئيسية:** Products, Orders, Customers بيتفلتروا بـ `user_id`

**الحل:**

- Products, Orders, Customers مفروض يكونوا **shared** (كل الناس تشوفهم)
- بس operational_costs, tasks, reports دول بس اللي user-specific

### الخطوة 3: إصلاح Models

تعديل `backend/src/models/index.js`:

- `Product.findByUser()` → `Product.findAll()` (no user filter)
- `Order.findByUser()` → `Order.findAll()` (no user filter)
- `Customer.findByUser()` → `Customer.findAll()` (no user filter)

### الخطوة 4: تحديث Dashboard Route

تعديل `backend/src/routes/dashboard.js`:

- استخدام `Product.findAll()` بدل `Product.findByUser(userId)`
- استخدام `Order.findAll()` بدل `Order.findByUser(userId)`
- استخدام `Customer.findAll()` بدل `Customer.findByUser(userId)`

---

## التنفيذ:
