# 🔧 إصلاح مشكلة "لم يتم العثور على الطلب"

## المشكلة

لما بتضغط على "عرض" في الطلب، بيظهر:

```
لم يتم العثور على الطلب
العودة إلى الطلبات
```

## الأسباب المحتملة

### 1️⃣ مشكلة في user_id

- الطلب موجود في قاعدة البيانات
- لكن الـ user_id مش متطابق
- أو الـ user_id = NULL

### 2️⃣ مشكلة في JWT Token

- الـ token مش بيبعت الـ user_id صح
- أو في فرق بين `req.user.id` و `req.user.userId`

### 3️⃣ مشكلة في قاعدة البيانات

- الطلبات مش مربوطة بالمستخدم الصح
- أو في مشكلة في العلاقة بين الجداول

---

## الحل

### الخطوة 1: التحقق من البيانات

نفذ الـ SQL التالي في Supabase:

```sql
-- عرض كل الطلبات مع معلومات المستخدم
SELECT
    o.id,
    o.order_number,
    o.shopify_id,
    o.user_id,
    u.email as user_email,
    u.name as user_name,
    o.customer_name,
    o.total_price,
    o.status,
    o.created_at
FROM orders o
LEFT JOIN users u ON o.user_id = u.id
ORDER BY o.created_at DESC
LIMIT 10;
```

**النتيجة المتوقعة:**

- كل طلب لازم يكون له `user_id`
- الـ `user_email` و `user_name` لازم يظهروا
- إذا كان `user_id` = NULL أو `user_email` = NULL، في مشكلة

### الخطوة 2: إصلاح الطلبات بدون user_id

إذا وجدت طلبات بدون `user_id`، نفذ:

```sql
-- التحقق من الطلبات بدون user_id
SELECT
    id,
    order_number,
    shopify_id,
    user_id,
    customer_name
FROM orders
WHERE user_id IS NULL;

-- إصلاح الطلبات بدون user_id (استبدل YOUR_USER_ID بالـ ID الصحيح)
UPDATE orders
SET user_id = 'YOUR_USER_ID'
WHERE user_id IS NULL;
```

**كيف تعرف الـ user_id الصحيح؟**

```sql
-- عرض كل المستخدمين
SELECT id, email, name FROM users;
```

### الخطوة 3: التحقق من الـ JWT Token

افتح الـ Backend logs وشوف الـ console:

```bash
# في terminal الـ backend
npm start
```

لما تضغط على "عرض" في الطلب، هتشوف:

```
Fetching order details: { orderId: '123', userId: 'abc' }
OrderManagementService.getOrderDetails called: { userId: 'abc', orderId: '123' }
Order query result: { found: true, error: null }
Checking ownership: { orderUserId: 'xyz', requestUserId: 'abc', match: false }
```

**إذا كان `match: false`:**

- معناها الـ user_id في الطلب مش نفس الـ user_id في الـ token
- لازم تصلح الـ user_id في قاعدة البيانات

### الخطوة 4: إصلاح user_id في الطلبات

```sql
-- إصلاح user_id لكل الطلبات
-- استبدل YOUR_CORRECT_USER_ID بالـ ID الصحيح من جدول users

UPDATE orders
SET user_id = 'YOUR_CORRECT_USER_ID'
WHERE user_id IS NULL OR user_id != 'YOUR_CORRECT_USER_ID';
```

**أو إذا كنت عاوز تربط الطلبات بالمستخدم بناءً على البريد الإلكتروني:**

```sql
-- ربط الطلبات بالمستخدم بناءً على customer_email
UPDATE orders o
SET user_id = u.id
FROM users u
WHERE o.customer_email = u.email
AND o.user_id IS NULL;
```

### الخطوة 5: إعادة تشغيل Backend

بعد إصلاح البيانات:

```bash
# أوقف الـ backend (Ctrl+C)
# ثم شغله تاني
npm start
```

### الخطوة 6: اختبار الحل

1. اذهب إلى صفحة "الطلبات"
2. اضغط "عرض" على أي طلب
3. المفروض تشوف كل التفاصيل دلوقتي

---

## التعديلات اللي اتعملت في الكود

### 1. `backend/src/routes/shopify.js`

```javascript
router.get("/orders/:id/details", verifyToken, async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.user.id || req.user.userId; // Support both formats

    console.log("Fetching order details:", { orderId, userId });

    const order = await OrderManagementService.getOrderDetails(userId, orderId);

    console.log("Order found:", order ? "Yes" : "No");

    res.json(order);
  } catch (error) {
    console.error("Get order details error:", error);
    res.status(500).json({ error: error.message });
  }
});
```

### 2. `backend/src/services/orderManagementService.js`

```javascript
static async getOrderDetails(userId, orderId) {
  try {
    console.log("OrderManagementService.getOrderDetails called:", {
      userId,
      orderId,
    });

    const { data: order, error } = await Order.findById(orderId);

    console.log("Order query result:", { found: !!order, error: error });

    if (error || !order) {
      console.error("Order not found or error:", error);
      throw new Error("Order not found");
    }

    // Check user ownership
    console.log("Checking ownership:", {
      orderUserId: order.user_id,
      requestUserId: userId,
      match: order.user_id === userId,
    });

    if (order.user_id !== userId) {
      throw new Error("Unauthorized");
    }

    // ... rest of the code
  }
}
```

---

## استكشاف الأخطاء

### الخطأ: "Order not found"

**السبب:** الطلب مش موجود في قاعدة البيانات

**الحل:**

1. تأكد من وجود الطلب:

```sql
SELECT * FROM orders WHERE id = 'YOUR_ORDER_ID';
```

2. إذا لم يكن موجوداً، قم بمزامنة الطلبات من شوبيفاي

### الخطأ: "Unauthorized"

**السبب:** الـ user_id في الطلب مش نفس الـ user_id في الـ token

**الحل:**

1. تحقق من الـ user_id في الطلب:

```sql
SELECT id, order_number, user_id FROM orders WHERE id = 'YOUR_ORDER_ID';
```

2. تحقق من الـ user_id في الـ token (شوف الـ console logs)
3. إصلاح الـ user_id في الطلب:

```sql
UPDATE orders SET user_id = 'CORRECT_USER_ID' WHERE id = 'YOUR_ORDER_ID';
```

### الخطأ: "Cannot read property 'id' of undefined"

**السبب:** الـ JWT token مش بيبعت الـ user object صح

**الحل:**

1. تأكد من تسجيل الدخول
2. امسح الـ localStorage وسجل دخول تاني:

```javascript
// في console المتصفح
localStorage.clear();
// ثم سجل دخول تاني
```

---

## الوقاية من المشكلة في المستقبل

### 1. التأكد من user_id عند المزامنة

في `shopifyService.js`، تأكد من إضافة `user_id` لكل طلب:

```javascript
const orderData = {
  user_id: userId, // IMPORTANT!
  shopify_id: order.id,
  order_number: order.order_number,
  // ... rest of the data
};
```

### 2. إضافة constraint في قاعدة البيانات

```sql
-- التأكد من أن user_id مطلوب
ALTER TABLE orders
ALTER COLUMN user_id SET NOT NULL;

-- إضافة foreign key constraint
ALTER TABLE orders
ADD CONSTRAINT fk_orders_user
FOREIGN KEY (user_id) REFERENCES users(id)
ON DELETE CASCADE;
```

### 3. إضافة validation في الـ backend

```javascript
// في Order model
static async create(orderData) {
  if (!orderData.user_id) {
    throw new Error("user_id is required");
  }
  // ... rest of the code
}
```

---

## ملخص الحل

1. ✅ تحقق من البيانات في قاعدة البيانات
2. ✅ إصلاح الطلبات بدون user_id
3. ✅ تحقق من الـ JWT token
4. ✅ إضافة console logs للـ debugging
5. ✅ إعادة تشغيل Backend
6. ✅ اختبار الحل

---

## الملفات المساعدة

- `CHECK_ORDERS_AND_USERS.sql` - SQL queries للتحقق من البيانات
- Backend logs - شوف الـ console للـ debugging

---

كل شيء جاهز! 🚀

بعد تنفيذ الخطوات دي، المفروض تفاصيل الطلب تظهر بشكل صحيح.
