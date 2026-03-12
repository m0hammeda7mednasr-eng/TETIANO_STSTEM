-- Check user information
SELECT 
  id,
  email,
  name,
  role,
  created_at
FROM users
ORDER BY created_at DESC;

-- Check shopify tokens
SELECT 
  user_id,
  shop,
  created_at,
  updated_at
FROM shopify_tokens;

-- Check shopify credentials
SELECT 
  user_id,
  api_key,
  created_at
FROM shopify_credentials;
