# 🔐 إنشاء JWT Secret

## طرق إنشاء JWT Secret قوي:

### الطريقة 1: استخدام Node.js

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### الطريقة 2: استخدام OpenSSL

```bash
openssl rand -hex 64
```

### الطريقة 3: استخدام موقع آمن

👉 **https://generate-secret.vercel.app/64**

### الطريقة 4: إنشاء يدوي

استخدم مزيج من:

- أحرف كبيرة وصغيرة
- أرقام
- رموز خاصة
- طول 32 حرف على الأقل

**مثال:**

```
JWT_SECRET=TeTiAnO-SyStEm-2024-SuPeR-SeCrEt-KeY-FoR-PrOdUcTiOn-UsE
```

⚠️ **مهم**:

- لا تستخدم كلمات بسيطة
- لا تشارك الـ secret مع أحد
- استخدم secret مختلف لكل environment
