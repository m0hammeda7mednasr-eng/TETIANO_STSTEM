Failed to save Shopify connection: Could not find the 'store_id' column of 'shopify_tokens' in the schema cache
اى ده بق ؟# ⚡ دليل سريع للحصول على Credentials

## 🗄️ Supabase (مطلوب):

1. **اذهب إلى**: https://supabase.com/dashboard
2. **أنشئ مشروع جديد**: `tetiano-system`
3. **اذهب إلى**: Settings → API
4. **انسخ**:
   - Project URL → `SUPABASE_URL`
   - anon public → `SUPABASE_KEY`
   - service_role → `SUPABASE_SERVICE_ROLE_KEY`

## 🔐 JWT Secret (مطلوب):

**شغل الأمر ده**:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**أو اذهب إلى**: https://generate-secret.vercel.app/64

## 🛍️ Shopify (اختياري - يمكن إضافته لاحقاً):

1. **اذهب إلى**: https://partners.shopify.com/
2. **أنشئ App جديد**: `TETIANO System`
3. **انسخ**: API Key و API Secret

## 🚀 للبدء السريع (بدون Shopify):

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-anon-key-from-supabase
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-from-supabase
JWT_SECRET=your-generated-secret-from-node-command
SHOPIFY_API_KEY=dummy-key-for-now
SHOPIFY_API_SECRET=dummy-secret-for-now
PORT=5000
NODE_ENV=production
```

## ✅ الأولوية:

1. **Supabase** - مطلوب فوراً
2. **JWT Secret** - مطلوب فوراً
3. **Shopify** - يمكن إضافته لاحقاً

بعد ما تجيب Supabase و JWT، تقدر تشغل النظام فوراً!
