const bcrypt = require('bcryptjs');
const crypto = require('crypto');

  
  console.log('Hashed Password:', hashedPassword);
  console.log('Admin ID:', adminId);
  console.log('\n--- PASTE THIS INTO SUPABASE SQL EDITOR ---\n');
  
  console.log(`INSERT INTO users (id, email, password, full_name, totp_enabled, created_at, registration_ip)
VALUES (
  '${adminId}',
  'admin@appscan.com',
  '${hashedPassword}',
  'Admin User',
  false,
  now(),
  '127.0.0.1'
);

INSERT INTO accounts (user_id, account_number, account_type, balance)
VALUES (
  '${adminId}',
  'ACC_ADMIN_001',
  'Checking',
  10000.00
);`);

  console.log('\n--- END SQL ---\n');
  console.log('LOGIN CREDENTIALS:');
  console.log('Email: admin@appscan.com');
  console.log('Password: AdminPassword123!');
  console.log('\n');
}

createAdmin();
