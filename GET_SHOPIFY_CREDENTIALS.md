# 🛍️ الحصول على Shopify Credentials

## الخطوات:

### 1. إنشاء Shopify Partner Account

👉 **https://partners.shopify.com/**

- سجل حساب جديد أو سجل دخول
- أكمل معلومات الحساب

### 2. إنشاء App جديد

- اذهب إلى **Apps** في Dashboard
- اضغط **Create app**
- اختر **Public app**
- املأ البيانات:
  - **App name**: `TETIANO System`
  - **App URL**: `https://your-vercel-app.vercel.app`
  - **Allowed redirection URL(s)**:
    ```
    https://your-railway-app.railway.app/api/shopify/callback
    https://your-vercel-app.vercel.app/shopify/callback
    ```

### 3. احصل على الـ Credentials

بعد إنشاء الـ App:

#### في صفحة App details:

```
SHOPIFY_API_KEY=1234567890abcdef1234567890abcdef
SHOPIFY_API_SECRET=abcdef1234567890abcdef1234567890
```

### 4. إعداد Permissions (Scopes)

في **App setup** → **App scopes**:

- ✅ `read_products`
- ✅ `write_products`
- ✅ `read_orders`
- ✅ `write_orders`
- ✅ `read_customers`
- ✅ `write_customers`
- ✅ `read_inventory`
- ✅ `write_inventory`

### 5. إعداد Webhooks (اختياري)

في **App setup** → **Webhooks**:

```
Order creation: https://your-railway-app.railway.app/api/shopify/webhooks/orders/create
Product update: https://your-railway-app.railway.app/api/shopify/webhooks/products/update
```

## ⚠️ ملاحظات:

- **API Key** آمن للاستخدام في Frontend
- **API Secret** سري - استخدمه في Backend فقط
- يمكنك البدء بدون Shopify وإضافته لاحقاً
- للاختبار، استخدم قيم وهمية مؤقتاً
