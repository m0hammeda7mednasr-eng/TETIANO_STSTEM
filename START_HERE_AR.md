# 🚀 ابدأ من هنا - حل مشكلة Shopify

## المشكلة اللي عندك:

```
Oauth error invalid_request: The redirect_uri is not whitelisted
```

## السبب:

Shopify مش بيقبل `http://localhost` - لازم يكون HTTPS URL عام

---

## الحل في 3 خطوات فقط! ⚡

### 1️⃣ حمل وشغل ngrok

**حمل ngrok:**

- اذهب إلى: https://ngrok.com/download
- حمل النسخة لـ Windows
- فك الضغط

**سجل حساب مجاني:**

- https://dashboard.ngrok.com/signup
- احصل على Auth Token من: https://dashboard.ngrok.com/get-started/your-authtoken

**شغل ngrok:**
افتح terminal واكتب:

```bash
ngrok config add-authtoken YOUR_TOKEN_HERE
ngrok http 5000
```

**انسخ الـ URL:**

```
Forwarding  https://abc123.ngrok.io -> http://localhost:5000
              ^^^^^^^^^^^^^^^^^^^^
              انسخ هذا!
```

---

### 2️⃣ حدث الإعدادات

**في ملف `backend/.env`:**
غير السطر ده:

```env
SHOPIFY_REDIRECT_URI=https://abc123.ngrok.io/api/shopify/callback
```

**في Shopify:**

1. اذهب إلى متجرك → Settings → Apps and sales channels → Develop apps
2. افتح تطبيقك (أو أنشئ واحد جديد)
3. Configuration → App setup
4. في **Allowed redirection URL(s)** أضف:
   ```
   https://abc123.ngrok.io/api/shopify/callback
   ```
5. احفظ

---

### 3️⃣ أعد تشغيل Backend وجرب

```bash
cd backend
npm start
```

الآن:

1. افتح التطبيق: http://localhost:3000
2. اذهب للإعدادات
3. أدخل Client ID و Client Secret
4. احفظ البيانات
5. أدخل اسم المتجر
6. اضغط "ربط المتجر"
7. ✅ المفروض يشتغل!

---

## 🎯 ملاحظات مهمة

- ✅ لازم ngrok يكون شغال طول الوقت
- ✅ لازم Backend يكون شغال
- ⚠️ لو أعدت تشغيل ngrok، الـ URL هيتغير - كرر الخطوة 2

---

## 📚 محتاج تفاصيل أكتر؟

- `QUICK_START_AR.md` - خطوات مفصلة
- `FIX_SHOPIFY_LOCALHOST.md` - شرح كامل للمشكلة
- `NGROK_SETUP_AR.md` - دليل ngrok الكامل

---

## 🆘 لو لسه مش شغال؟

تأكد من:

1. ✅ ngrok شغال في terminal منفصل
2. ✅ Backend شغال على port 5000
3. ✅ الـ URL في `.env` نفس الـ URL في Shopify
4. ✅ حفظت التغييرات في Shopify
5. ✅ أعدت تشغيل Backend بعد تغيير `.env`

---

**يلا جرب دلوقتي! 🚀**
