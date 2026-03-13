# تثبيت Multer لرفع الملفات

## الخطوة 1: تثبيت multer

افتح terminal في مجلد `backend` ونفذ:

```bash
cd backend
npm install multer
```

## الخطوة 2: إعادة تشغيل Backend

بعد التثبيت، أعد تشغيل الـ backend:

```bash
npm start
```

## ملاحظات

- multer: مكتبة لرفع الملفات في Node.js
- تدعم: صور، PDF، Excel، Word
- الحد الأقصى لحجم الملف: 10MB
- الملفات تُحفظ في Supabase Storage

## التحقق من التثبيت

بعد التثبيت، تأكد من ظهور multer في `package.json`:

```json
"dependencies": {
  "multer": "^1.4.5-lts.1"
}
```
