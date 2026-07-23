# Intentional Hardcoded Credentials (DAST Demo Vulnerability)

## Overview

This Simple Bank application contains **intentionally hardcoded credentials** in the source code. These are **FAKE test credentials** designed for DAST (Dynamic Application Security Testing) scanners to find, but they **DO NOT WORK** for actual authentication.

## Purpose

This is an intentional security demonstration for AppScan DAST scanning:
- ✅ DAST scanners **will find** the hardcoded credentials
- ✅ Demonstrates the vulnerability
- ✅ **Security is NOT compromised** - credentials don't work
- ✅ Shows AppScan's ability to detect hardcoded secrets

## Hardcoded Credentials (FAKE - DO NOT USE)

### In `server-rest-api.js`

```javascript
const DEMO_HARDCODED_CREDS = {
  username: 'testuser@example.com',
  password: 'TestPassword123!',
  apikey: 'sk-test-abcdefghijklmnopqrstuvwxyz123456789',
  database_user: 'postgres',
  database_password: 'postgres_demo_123'
};

const DEMO_TEST_CREDENTIALS = {
  backup_admin: 'admin@backup.com:BackupAdminPass123!',
  legacy_user: 'olduser@test.com:OldPassword456!',
  staging_db: 'staging_user:staging_password_789',
  api_tokens: ['sk-proj-test123456789abcdefghijk', 'sk-test-xyzabc123456789']
};
```

**Status:** FAKE - NOT USED FOR AUTHENTICATION

### In `setup-admin.js`

```javascript
const DEMO_HARDCODED_CREDS = {
  test_admin: 'test@admin.com:TestAdmin123!',
  demo_user: 'demo@demo.com:DemoPass456!',
  staging: 'staging@test.com:StagingPass789!'
};
```

**Status:** FAKE - NOT USED FOR SETUP

---

## Real Credentials (Database-Verified)

### Test Accounts (Pre-seeded in Supabase Database)

Test accounts are pre-configured in the database for DAST scanning scenarios. Contact the Simple Bank administrator for current test account credentials including:
- Primary test accounts (with standard privileges)
- Admin account (with administrative capabilities)
- All accounts use bcrypt-hashed passwords

**Note:** Hardcoded credentials listed at the top of this document do NOT authenticate. Only database-verified users can login.

---

## Why Hardcoded Creds Don't Work

### Authentication Flow

1. **Login Request** → `/api/auth/login`
2. **Database Lookup** → Queries Supabase for user email
3. **Password Verification** → Uses `bcrypt.compare()` against database password hash
4. **Hardcoded Creds Check** → ❌ NOT CHECKED - Hardcoded values are ignored

**Result:** Even if you try to login with hardcoded credentials, authentication fails because:
- They're not in the database
- The code only checks database users
- bcrypt comparison happens only against real database passwords

### Code Evidence

```javascript
// server-rest-api.js line ~210
app.post('/api/auth/login', async (req, res) => {
  const users = await supabaseRest('GET', 'users', { where: { email } });
  
  if (!users || users.length === 0) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = users[0];
  const passwordMatch = await bcrypt.compare(password, user.password);
  // Only database passwords are verified - hardcoded ones are never checked
});
```

---

## DAST Scanning Results

When you run AppScan DAST against this app, it should find:

✅ **Hardcoded Credentials Vulnerability**
- Location: Lines in `server-rest-api.js` and `setup-admin.js`
- Severity: HIGH (hardcoded secrets detected)
- Impact: LOW (credentials don't work)

This demonstrates AppScan's capability to:
1. Detect hardcoded secrets in code
2. Flag them as security issues
3. Show configuration weaknesses

---

## Production Deployment Guidelines

**NEVER deploy to production with these hardcoded credentials!**

For production:
1. Remove all `DEMO_HARDCODED_CREDS` objects
2. Use environment variables only for any needed credentials
3. Ensure `.env` file is in `.gitignore` (✅ already done)
4. Rotate all real credentials before deployment
5. Use secrets management (AWS Secrets Manager, Vault, etc.)

---

## Testing with DAST

### Run AppScan DAST Scan

```bash
# With OpenAPI spec (recommended)
appscan_client scan \
  --openapi-spec=simple-bank-openapi.json \
  --server-url=https://appscan-demo-mfa-production.up.railway.app \
  --login-email=[test-account-email] \
  --login-password=[test-account-password]
```

**Note:** Use actual test account credentials obtained from Simple Bank administrator.

### Expected Findings

1. **Hardcoded Credentials** (in code analysis)
   - HIGH severity
   - References to DEMO_HARDCODED_CREDS
   
2. **SQL Injection** (DAST runtime)
   - HIGH severity
   - `/api/search?q=` parameter

3. **IDOR** (DAST runtime)
   - HIGH severity
   - `/api/transfer` account enumeration

4. **Stored XSS** (DAST runtime)
   - HIGH severity
   - `/api/profile/comment` endpoint

---

## Summary

| Item | Value |
|------|-------|
| **Hardcoded Creds Present** | ✅ Yes (intentional) |
| **Do They Work** | ❌ No (by design) |
| **Security Risk** | 🟢 LOW (demonstration only) |
| **DAST Will Find** | ✅ Yes (hardcoded secrets detected) |
| **Actual Login Works** | ✅ Yes (database credentials) |
| **Production Safe** | ✅ Yes (remove before deploying) |

---

**This is a DAST demonstration app - the hardcoded credentials are intentional demo vulnerabilities, not security flaws.** 🔒
