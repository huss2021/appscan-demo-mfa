#!/usr/bin/env node

/**
 * Interactive Admin Account Setup Script
 *
 * This script prompts for admin credentials and generates the SQL
 * needed to create an admin user in Supabase.
 *
 * Usage: node setup-admin.js
 *
 * Security:
 * - No hardcoded credentials
 * - Passwords are entered interactively (not passed as args)
 * - Safe to commit to GitHub
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Helper to prompt for input
function prompt(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);

    let input = '';
    rl.once('line', (answer) => {
      resolve(answer.trim());
    });
  });
}

// Helper to prompt for password (hidden input)
function promptPassword(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);

    // Disable echo for password input
    const stdin = process.stdin;
    stdin.resume();
    stdin.setRawMode(true);

    let password = '';
    stdin.on('data', (char) => {
      char = char.toString('utf8');

      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        process.stdout.write('\n');
        resolve(password);
      } else if (char === '\u0003') {
        process.exit();
      } else {
        password += char;
        // Don't echo to screen
      }
    });
  });
}

async function setupAdmin() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║         INTERACTIVE ADMIN ACCOUNT SETUP FOR SUPABASE            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Prompt for admin email
    const email = await prompt('Enter admin email address: ');
    if (!email || !email.includes('@')) {
      console.error('❌ Invalid email address');
      process.exit(1);
    }

    // Prompt for admin password
    const password = await promptPassword('Enter admin password: ');
    if (!password || password.length < 8) {
      console.error('❌ Password must be at least 8 characters');
      process.exit(1);
    }

    // Confirm password
    const confirmPassword = await promptPassword('Confirm admin password: ');
    if (password !== confirmPassword) {
      console.error('❌ Passwords do not match');
      process.exit(1);
    }

    // Generate hash and IDs
    console.log('\n⏳ Generating secure password hash...');
    const hashedPassword = await bcrypt.hash(password, 10);
    const adminId = crypto.randomUUID();
    const accountNumber = 'ACC_ADMIN_' + crypto.randomBytes(4).toString('hex').toUpperCase();

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    COPY & PASTE SQL BELOW                       ║');
    console.log('║         (Paste this into Supabase SQL Editor)                   ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const sql = `-- Admin User Account Setup
-- Generated: ${new Date().toISOString()}
-- Email: ${email}

INSERT INTO users (id, email, password, full_name, totp_enabled, created_at, registration_ip)
VALUES (
  '${adminId}',
  '${email}',
  '${hashedPassword}',
  'Admin User',
  false,
  now(),
  '127.0.0.1'
);

INSERT INTO accounts (user_id, account_number, account_type, balance)
VALUES (
  '${adminId}',
  '${accountNumber}',
  'Checking',
  10000.00
);`;

    console.log(sql);

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                         NEXT STEPS                             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log('1. Go to Supabase Dashboard → SQL Editor');
    console.log('2. Copy the SQL above and paste it into the editor');
    console.log('3. Click "Run" to execute');
    console.log('4. Your admin account is ready!\n');

    console.log('📋 LOGIN CREDENTIALS:');
    console.log(`   Email:    ${email}`);
    console.log(`   Password: (the one you just entered)\n`);

    console.log('✅ Setup complete!\n');
    process.exit(0);

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

setupAdmin();
