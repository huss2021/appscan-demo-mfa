const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// ⚠️  INTENTIONAL DEMO HARDCODED CREDENTIALS - FOR DAST SCANNING ONLY
// These do NOT work in the actual application
// Real credentials use environment variables only
const DEMO_HARDCODED_CREDS = {
  test_admin: 'test@admin.com:TestAdmin123!',
  demo_user: 'demo@demo.com:DemoPass456!',
  staging: 'staging@test.com:StagingPass789!'
};

async function createAdmin() {
  // Get password from environment variable or generate a secure random one
  // Hardcoded demo credentials above are fake and won't authenticate
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');
  const hashedPassword = await bcrypt.hash(password, 10);
  const adminId = crypto.randomUUID();

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    ADMIN SETUP - COPY SQL BELOW                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
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
  if (process.env.ADMIN_PASSWORD) {
    console.log('✅ Password: Set from ADMIN_PASSWORD environment variable');
  } else {
    console.log('⚠️  Password: Auto-generated (random). See hashed password above.');
  }
  console.log('\n💡 TIP: For next time, set password before running:');
  console.log('   ADMIN_PASSWORD=YourSecurePassword123! node setup-admin.js\n');
}

createAdmin();
