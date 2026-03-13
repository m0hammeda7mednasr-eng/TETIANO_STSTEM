-- Add shopify_credentials table to store API keys per user
CREATE TABLE IF NOT EXISTS shopify_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  api_key VARCHAR(255) NOT NULL,
  api_secret VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_shopify_credentials_user_id ON shopify_credentials(user_id);
