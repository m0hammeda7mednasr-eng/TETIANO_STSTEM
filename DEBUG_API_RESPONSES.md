# فحص API Responses مباشرة

## المشكلة

الـ API calls بتشتغل بس البيانات فاضية في Dashboard.

## خطوات الفحص

### 1. فحص API Response مباشرة

افتح Browser Console (F12) وشغل الكود ده:

```javascript
// فحص Dashboard Stats API
fetch("https://tetianoststem-production.up.railway.app/api/dashboard/stats", {
  headers: {
    Authorization: `Bearer ${localStorage.getItem("token")}`,
  },
})
  .then((response) => response.json())
  .then((data) => {
    console.log("Dashboard Stats Response:", data);
  });

// فحص Shopify Orders API
fetch(
  "https://tetianoststem-production.up.railway.app/api/shopify/orders?limit=10",
  {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  },
)
  .then((response) => response.json())
  .then((data) => {
    console.log("Shopify Orders Response:", data);
  });

// فحص Dashboard Products API
fetch(
  "https://tetianoststem-production.up.railway.app/api/dashboard/products?limit=10",
  {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  },
)
  .then((response) => response.json())
  .then((data) => {
    console.log("Dashboard Products Response:", data);
  });

// فحص Dashboard Customers API
fetch(
  "https://tetianoststem-production.up.railway.app/api/dashboard/customers?limit=10",
  {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  },
)
  .then((response) => response.json())
  .then((data) => {
    console.log("Dashboard Customers Response:", data);
  });
```

### 2. فحص Sync Response

```javascript
// فحص Sync API
fetch("https://tetianoststem-production.up.railway.app/api/shopify/sync", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${localStorage.getItem("token")}`,
    "Content-Type": "application/json",
  },
})
  .then((response) => response.json())
  .then((data) => {
    console.log("Sync Response:", data);
  });
```

## النتائج المتوقعة

### إذا كانت المشكلة في قاعدة البيانات:

```json
{
  "total_sales": 0,
  "total_orders": 0,
  "total_products": 0,
  "total_customers": 0,
  "avg_order_value": 0
}
```

### إذا كانت المشكلة في الـ Backend Code:

```json
{
  "error": "Failed to fetch dashboard stats"
}
```

### إذا كان الـ Sync يشتغل صح:

```json
{
  "success": true,
  "message": "Data synced successfully",
  "counts": {
    "products": 4,
    "orders": 129,
    "customers": 3
  }
}
```

## الخطوات التالية

### إذا كان Sync Response يظهر أرقام صح:

- المشكلة في الـ API endpoints
- نحتاج نفحص Backend code

### إذا كان Sync Response يظهر أرقام صفر:

- المشكلة في الـ Sync نفسه
- نحتاج نفحص Shopify connection

### إذا كان Dashboard APIs ترجع arrays فاضية:

- المشكلة في ربط البيانات بالمستخدمين
- نحتاج نشغل FORCE_LINK_DATA.sql

## شغل الكود ده وقولي إيه النتائج!
