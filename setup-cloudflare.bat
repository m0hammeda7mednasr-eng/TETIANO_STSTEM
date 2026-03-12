@echo off
echo ========================================
echo   Shopify OAuth Setup with Cloudflare
echo ========================================
echo.

echo [1] تثبيت Cloudflare Tunnel
echo.

where cloudflared >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo cloudflared غير مثبت. جاري التثبيت...
    echo.
    echo يرجى تثبيته يدوياً من:
    echo https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
    echo.
    echo أو باستخدام:
    echo winget install --id Cloudflare.cloudflared
    echo.
    pause
    exit /b
)

echo cloudflared مثبت بنجاح!
echo.
echo ========================================
echo الآن سيتم تشغيل Cloudflare Tunnel
echo ========================================
echo.
echo ⚠️ ملاحظة مهمة:
echo 1. انسخ الـ HTTPS URL الذي سيظهر (مثل: https://xyz.trycloudflare.com)
echo 2. افتح ملف backend/.env
echo 3. غير SHOPIFY_REDIRECT_URI إلى: https://YOUR-URL.trycloudflare.com/api/shopify/callback
echo 4. اذهب إلى Shopify App Settings وأضف نفس الـ URL
echo 5. أعد تشغيل Backend
echo.
echo ✅ ميزة: الـ URL يبقى ثابت لفترة طويلة!
echo.
pause

echo.
echo جاري تشغيل Cloudflare Tunnel...
echo.
cloudflared tunnel --url http://localhost:5000
