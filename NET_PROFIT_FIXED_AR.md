# ✅ تم إصلاح صفحة صافي الربح

## المشكلة

صفحة صافي الربح كانت بترجع 404 error لأنها كانت بتستخدم `axios` مباشرة بدل `api` instance، وده كان بيخلي الطلبات تروح على Frontend port (3000) بدل Backend port (5000).

## الحل المُطبق

### التغييرات في `frontend/src/pages/NetProfit.jsx`

1. **تغيير الـ import:**

```javascript
// قبل
import axios from "axios";

// بعد
import api from "../utils/api";
```

2. **تحديث جميع الـ API calls:**

#### `fetchProducts()`

```javascript
// قبل
const token = localStorage.getItem("token");
const response = await axios.get("/api/dashboard/products", {
  headers: { Authorization: `Bearer ${token}` },
});

// بعد
const response = await api.get("/dashboard/products");
```

#### `fetchOperationalCosts()`

```javascript
// قبل
const token = localStorage.getItem("token");
const response = await axios.get("/api/operational-costs", {
  headers: { Authorization: `Bearer ${token}` },
});

// بعد
const response = await api.get("/operational-costs");
```

#### `handleUpdateCostPrice()`

```javascript
// قبل
const token = localStorage.getItem("token");
await axios.put(
  `/api/dashboard/products/${productId}`,
  { cost_price: parseFloat(costPrice) },
  { headers: { Authorization: `Bearer ${token}` } },
);

// بعد
await api.put(`/dashboard/products/${productId}`, {
  cost_price: parseFloat(costPrice),
});
```

#### `handleAddOperationalCost()`

```javascript
// قبل
const token = localStorage.getItem("token");
await axios.post(
  "/api/operational-costs",
  {
    ...newCost,
    product_id: selectedProduct,
    amount: parseFloat(newCost.amount),
  },
  { headers: { Authorization: `Bearer ${token}` } },
);

// بعد
await api.post("/operational-costs", {
  ...newCost,
  product_id: selectedProduct,
  amount: parseFloat(newCost.amount),
});
```

#### `handleDeleteOperationalCost()`

```javascript
// قبل
const token = localStorage.getItem("token");
await axios.delete(`/api/operational-costs/${costId}`, {
  headers: { Authorization: `Bearer ${token}` },
});

// بعد
await api.delete(`/operational-costs/${costId}`);
```

## الفوائد

### 1. الـ baseURL الصحيح

الـ `api` instance معمول في `frontend/src/utils/api.js` وبيستخدم:

```javascript
const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";
```

ده معناه إن كل الطلبات دلوقتي بتروح على `http://localhost:5000/api` (Backend الصحيح).

### 2. Authentication تلقائي

الـ `api` instance عنده interceptor بيضيف الـ token تلقائياً:

```javascript
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

ده معناه مش محتاجين نكتب `localStorage.getItem("token")` في كل مرة.

### 3. Error handling أفضل

الـ `api` instance عنده interceptor للـ errors:

```javascript
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);
```

ده معناه لو الـ token expired، اليوزر هيتوجه تلقائياً لصفحة الـ login.

### 4. كود أنظف وأقصر

- مش محتاجين نكرر `const token = localStorage.getItem("token")` في كل function
- مش محتاجين نكتب `headers: { Authorization: Bearer ${token} }` في كل request
- مش محتاجين نكتب `/api/` في بداية كل endpoint

## الخطوة التالية

**ارجع للمتصفح واعمل Refresh (F5) في صفحة صافي الربح.**

المفروض دلوقتي:

- ✅ الصفحة تحمل بدون 404 errors
- ✅ المصاريف التشغيلية تظهر
- ✅ تقدر تضيف مصروف جديد
- ✅ تقدر تعدل سعر التكلفة
- ✅ تقدر تحذف مصروف

## لو لسه في مشكلة

1. **تأكد إن Backend شغال:**

```
http://localhost:5000/api/health
```

لازم تشوف: `{"status":"OK","message":"Server is running"}`

2. **تأكد إن Frontend شغال:**

```
http://localhost:3000
```

3. **شوف الـ Console في المتصفح:**

- اضغط `F12`
- روح على tab "Console"
- شوف لو في أي errors جديدة

4. **لو لسه 404:**

- Backend محتاج restart (Ctrl+C ثم npm start)
- Frontend محتاج restart (Ctrl+C ثم npm start)

---

## الخلاصة

تم إصلاح المشكلة بتغيير كل الـ `axios` calls في NetProfit.jsx لاستخدام `api` instance بدلها. ده بيضمن إن كل الطلبات تروح على Backend الصحيح (port 5000) مع الـ authentication headers الصحيحة.

الصفحة دلوقتي جاهزة للاستخدام! 🎉
