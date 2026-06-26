-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  totp_enabled BOOLEAN DEFAULT FALSE,
  totp_secret VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Accounts table (checking account)
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_number VARCHAR(20) UNIQUE,
  account_type VARCHAR(50) DEFAULT 'checking',
  balance DECIMAL(15, 2) DEFAULT 5000.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id),
  to_account_id UUID NOT NULL REFERENCES accounts(id),
  amount DECIMAL(15, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'completed',
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API Keys for token-based auth
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key VARCHAR(255) UNIQUE NOT NULL,
  label VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used TIMESTAMP
);

-- Comments (for XSS vulnerability demo)
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_transactions_from_user ON transactions(from_user_id);
CREATE INDEX idx_transactions_to_account ON transactions(to_account_id);
CREATE INDEX idx_api_keys_key ON api_keys(key);
CREATE INDEX idx_comments_user_id ON comments(user_id);

-- Insert test accounts (these will be used for DAST scanning)
INSERT INTO users (email, password, full_name, totp_enabled, totp_secret)
VALUES 
  (
    'demo-user1@appscan.com',
    '$2a$10$qXkuQhNH1YzjL7.dKL.y5eKlJ1H0.n2l0F5zN8vB9cK2A8mZ7Y9I2',
    'Demo User One',
    TRUE,
    'JBSWY3DPEBLW64TMMQ======'
  ),
  (
    'demo-user2@appscan.com',
    '$2a$10$qXkuQhNH1YzjL7.dKL.y5eKlJ1H0.n2l0F5zN8vB9cK2A8mZ7Y9I2',
    'Demo User Two',
    TRUE,
    'KVKFKRCPNZQUYMLXOBZWKY3UPEA======'
  );

-- Insert test accounts for those users
INSERT INTO accounts (user_id, account_number, balance)
SELECT id, 'ACC-' || SUBSTR(id::TEXT, 1, 8), 10000.00
FROM users
WHERE email IN ('demo-user1@appscan.com', 'demo-user2@appscan.com');

-- Insert sample transactions
INSERT INTO transactions (from_user_id, to_account_id, amount, description)
SELECT 
  u.id,
  a.id,
  500.00,
  'Demo transaction'
FROM users u
JOIN accounts a ON a.user_id != u.id
WHERE u.email = 'demo-user1@appscan.com'
LIMIT 1;
