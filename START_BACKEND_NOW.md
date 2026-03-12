# 🚀 تشغيل الخادم الخلفي (Backend) - حل مشكلة 404

## 🔴 المشكلة الحالية

صفحة صافي الربح فاضية عشان الـ Backend مش شغال أو محتاج restart!

الخطأ في Console:

```
GET http://localhost:3000/api/operational-costs 404 (Not Found)
```

---

## ✅ الحل (خطوتين بس!)

### الخطوة 1: تشغيل الخادم الخلفي

افتح Terminal جديد وشغّل:

```bash
cd backend
npm start
```

**يجب أن ترى:**

```
✅ Server running on port 5000
```

### الخطوة 2: أعد تحميل صفحة صافي الربح

1. ارجع للمتصفح
2. اضغط F5 أو Ctrl+R
3. الصفحة هتشتغل! 🎉

---

## 🔍 التحقق من أن Backend شغال

افتح في المتصفح:

```
http://localhost:5000/api/health
```

**يجب أن ترى:**

```json
{
  "status": "OK",
  "message": "Server is running"
}
```

---

## ⚠️ إذا Backend مش عاوز يشتغل

### المشكلة 1: Port 5000 مشغول

**الحل:**

```bash
# أوقف أي process على port 5000
# Windows:
netstat -ano | findstr :5000
taskkill /PID <PID_NUMBER> /F

# أو غيّر الـ port في backend/.env:
PORT=5001
```

### المشكلة 2: npm start بيقول "command not found"

**الحل:**

```bash
cd backend
npm install
npm start
```

### المشكلة 3: أخطاء في التثبيت

**الحل:**

```bash
cd backend
rm -rf node_modules
rm package-lock.json
npm install
npm start
```

---

## 📊 بعد ما Backend يشتغل

صفحة صافي الربح هتعرض:

✅ 5 بطاقات إحصائية  
✅ جدول المنتجات  
✅ التكاليف التشغيلية  
✅ حساب صافي الربح

---

## 🎯 ملخص سريع

```bash
# 1. شغّل Backend
cd backend
npm start

# 2. في نافذة تانية، تأكد إن Frontend شغال
cd frontend
npm start

# 3. افتح المتصفح
http://localhost:3000

# 4. سجّل دخول واضغط على "صافي الربح"
```

---

**ملحوظة مهمة:** لازم Backend يكون شغال طول الوقت عشان الصفحة تشتغل!
