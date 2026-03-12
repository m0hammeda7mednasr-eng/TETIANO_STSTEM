@echo off
echo ========================================
echo       Shopify OAuth Setup with ngrok
echo ========================================
echo.

echo [1] تأكد من تثبيت ngrok أولاً
echo     قم بتحميله من: https://ngrok.com/download
echo.

echo [2] سجل حساب مجاني على ngrok
echo     https://dashboard.ngrok.com/signup
echo.

echo [3] احصل على Auth Token
echo     https://dashboard.ngrok.com/get-started/your-authtoken
echo.

set /p token="أدخل Auth Token من ngrok (أو اضغط Enter إذا كنت قد أضفته مسبقاً): "

if not "%token%"=="" (
    echo.
    echo جاري إضافة Auth Token...
    ngrok config add-authtoken %token%
    echo تم إضافة Token بنجاح!
)

echo.
echo ========================================
echo الآن سيتم تشغيل ngrok على port 5000
echo ========================================
echo.
echo ⚠️ ملاحظة مهمة:
echo 1. انسخ الـ HTTPS URL الذي سيظهر (مثل: https://abc123.ngrok.io)
echo 2. افتح ملف backend/.env
echo 3. غير SHOPIFY_REDIRECT_URI إلى: https://YOUR-URL.ngrok.io/api/shopify/callback
echo 4. اذهب إلى Shopify App Settings وأضف نفس الـ URL
echo 5. أعد تشغيل Backend
echo.
pause

echo.
echo جاري تشغيل ngrok...
echo.
ngrok http 5000
