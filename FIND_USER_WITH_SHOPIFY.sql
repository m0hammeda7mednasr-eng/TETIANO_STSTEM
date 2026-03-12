-- Find which user has Shopify token
SELECT 
    u.id,
    u.email,
    u.name,
    st.shop,
    st.updated_at as token_last_updated
FROM users u
INNER JOIN shopify_tokens st ON u.id = st.user_id
ORDER BY st.updated_at DESC
LIMIT 5;

-- This will show you which user account has the Shopify connection
-- Login with that email to see the synced data
