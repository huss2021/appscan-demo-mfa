# AppScan Demo — MFA/2FA Financial Application

A fully functional financial application with **TOTP-based MFA/2FA authentication** and intentional DAST vulnerabilities. Designed for **AppScan ASoC** and other DAST scanner demonstrations in financial sector environments.

---

## 📋 Features

✅ **User Registration & Login** with email/password  
✅ **TOTP (Time-Based OTP)** - QR code enrollment via Microsoft Authenticator  
✅ **Test Accounts** - Pre-configured with known TOTP secrets for DAST scanning  
✅ **Session Management** - HTTP session-based authentication (30-min timeout)  
✅ **API Authentication** - Bearer token auth for API-level scanning  
✅ **Financial App UI** - Checking account, balance, transaction history  
✅ **Intentional Vulnerabilities** for DAST discovery:
  - SQL Injection (search endpoint)
  - Insecure Direct Object Reference (IDOR) - accounts & transactions
  - Stored XSS (comments)
  - CSRF (fund transfer)
  - Weak input validation

✅ **Test Data Endpoints** - TOTP code generation for AppScan macros  
✅ **CI/CD Ready** - GitHub Actions integration example included

---

## 🚀 Quick Start

### Prerequisites
- GitHub account
- Vercel account (connected to GitHub)
- Supabase account
- Node.js 18+ (optional, for local development)

### 1. Set Up Supabase Database (5 minutes)

1. Go to **[supabase.com](https://supabase.com)** and sign in
2. Click "New Project"
3. Name it: `appscan-mfa-demo`
4. Select region closest to you
5. Wait for project creation
6. Go to **SQL Editor** → Create new query
7. Copy-paste the entire contents of `schema.sql`
8. Execute the query
9. Go to **Settings** → **API** and copy:
   - `URL` (your Supabase URL)
   - `anon` key (public key)

### 2. Deploy to Vercel (2 minutes)

#### Option A: Use GitHub Web UI (from iPhone)

1. Create a new GitHub repo: `appscan-demo-mfa`
2. Clone or create files locally, then push to GitHub
3. In Vercel, click **"Add New"** → **"Project"**
4. Import from GitHub
5. Add Environment Variables:
   ```
   SUPABASE_URL=<your-supabase-url>
   SUPABASE_KEY=<your-supabase-anon-key>
   SESSION_SECRET=<random-string>
   ```
6. Click **"Deploy"**
7. Done! Your app is live at `https://appscan-demo-mfa.vercel.app`

#### Option B: Desktop Git Deployment

```bash
# Clone repo
git clone https://github.com/YOUR-USERNAME/appscan-demo-mfa.git
cd appscan-demo-mfa

# Install dependencies
npm install

# Create .env.local with Supabase credentials
cp .env.local.example .env.local
# Edit .env.local with your Supabase URL and key

# Deploy to Vercel
vercel --prod
```

---

## 📖 Test Accounts (for DAST Scanning)

These accounts are pre-created in the database for scanning:

| Email | Password | TOTP Secret |
|-------|----------|-------------|
| `demo-user1@appscan.com` | `DemoPassword123!` | `JBSWY3DPEBLW64TMMQ======` |
| `demo-user2@appscan.com` | `DemoPassword123!` | `KVKFKRCPNZQUYMLXOBZWKY3UPEA======` |

### Password Hash Note
The passwords in the test accounts are hashed with bcrypt. The plaintext passwords above work with bcrypt verification. These are **test accounts only** and should never be used in production.

---

## 🔐 Authentication Flows

### Session-Based (Web UI)
```
1. User navigates to login page
2. Enters email + password
3. Server verifies password with bcrypt
4. If TOTP enabled, prompts for 6-digit code
5. Server verifies code with TOTP secret
6. Sets express-session cookie (30-min expiry)
7. User can browse app, transfer funds, etc.
```

### Bearer Token (API)
```
1. User logs in via /api/auth/login
2. Server returns API key (sk_xxxxx)
3. Tester includes in Authorization header:
   Authorization: Bearer sk_xxxxx
4. API endpoints validate token
5. Tester can scan API endpoints: /api/v1/accounts, /api/v1/transactions
```

---

## 🔍 Intentional Vulnerabilities (for DAST Discovery)

### 1. SQL Injection
**Endpoint:** `GET /api/search?q=...`

**Vulnerability:** User input is directly interpolated into SQL query.

**Exploit Example:**
```
GET /api/search?q=' OR '1'='1
```

**Expected Discovery:** DAST scanner should detect SQL injection in query parameter.

---

### 2. Insecure Direct Object Reference (IDOR)
**Endpoints:**
- `GET /api/user/:userId/account` - Access any user's account without authorization
- `GET /api/transaction/:transactionId` - Access any transaction
- `GET /api/v1/transactions?user_id=<USER_ID>` - API-level IDOR

**Vulnerability:** No authorization checks. If you're authenticated, you can access other users' accounts and transactions.

**Exploit Example:**
```
# Logged in as user A
GET /api/user/UUID-OF-USER-B/account
# Returns User B's account balance and details
```

**Expected Discovery:** DAST should attempt IDOR by modifying IDs in requests.

---

### 3. Stored XSS (Cross-Site Scripting)
**Endpoint:** `POST /api/profile/comment` (store) and `GET /api/comments` (retrieve)

**Vulnerability:** Comments are stored without sanitization and returned without encoding.

**Exploit Example:**
```
POST /api/profile/comment
{"comment": "<script>alert('XSS')</script>"}

# Later, GET /api/comments returns unsanitized HTML
# Frontend renders it directly → XSS executes
```

**Expected Discovery:** DAST should submit XSS payloads in comment field and look for reflected/stored XSS in responses.

---

### 4. Cross-Site Request Forgery (CSRF)
**Endpoint:** `POST /api/transfer`

**Vulnerability:** No CSRF token validation. POST endpoint doesn't verify referer or custom headers.

**Exploit Example:**
```html
<!-- Attacker's website -->
<form action="https://appscan-demo.vercel.app/api/transfer" method="POST">
  <input name="toAccountId" value="ATTACKER-ACCOUNT-ID">
  <input name="amount" value="5000">
</form>
<script>document.forms[0].submit();</script>
```

If user is logged in and visits attacker's site, transfer happens without user's knowledge.

**Expected Discovery:** DAST should attempt CSRF by submitting POST requests without CSRF tokens.

---

### 5. Weak Input Validation
**Endpoint:** `POST /api/transfer`

**Vulnerability:** No validation on amount (negative, zero, or excessive amounts).

**Exploit Example:**
```
POST /api/transfer
{"toAccountId": "...", "amount": -5000}  // Negative amount
# May credit instead of debit
```

**Expected Discovery:** DAST should test boundary conditions on amount field.

---

## 🧪 AppScan ASoC Integration

### Scenario 1: Scheduled Scan with Pre-Auth Session

**Goal:** Scan the authenticated app nightly without human intervention.

#### Setup in ASoC:

1. **Create a scan configuration**
   - Target URL: `https://appscan-demo-mfa.vercel.app`
   - Scan Type: Dynamic Scan (DAST)

2. **Configure authentication (Session Replay)**
   - Use AppScan's **Selenium recording** to capture authenticated session
   - OR use **Macro recording** to automate login + TOTP

3. **Create a Macro** (if using macro-based auth):
   ```
   Step 1: POST /api/auth/login
   - Credentials: demo-user1@appscan.com / DemoPassword123!
   
   Step 2: GET /api/test/totp/JBSWY3DPEBLW64TMMQ======
   - Extract TOTP code from response
   
   Step 3: POST /api/auth/login (with TOTP code)
   - Complete login with TOTP
   
   Step 4: Continue scanning with authenticated session
   ```

4. **Schedule Scan**
   - Frequency: Nightly at 2 AM
   - ASoC will run macro, get session, scan authenticated endpoints

### Scenario 2: API-Level Scanning with Bearer Token

**Goal:** Scan REST API endpoints without web authentication friction.

#### Setup in ASoC:

1. **Create scan configuration**
   - Target URL: `https://appscan-demo-mfa.vercel.app/api/v1`
   - Scan Type: API Scan

2. **Configure API Authentication**
   - Method: Bearer Token
   - Token: Get from test account login response
   ```
   POST /api/auth/login
   {"email": "demo-user1@appscan.com", "password": "DemoPassword123!", "totp_code": "123456"}
   # Response: {"apiKey": "sk_xxxxx"}
   ```
   - Add to all API requests:
   ```
   Authorization: Bearer sk_xxxxx
   ```

3. **Scan API Endpoints**
   - ASoC will test:
     - `GET /api/v1/accounts` - Fetch account
     - `GET /api/v1/transactions` - Fetch transactions (IDOR vulnerable)
     - `GET /api/v1/transactions?user_id=<OTHER_USER_ID>` - IDOR exploitation

### Scenario 3: CI/CD Integration (GitHub Actions)

**Goal:** Run automated scans on every deployment.

#### Create `.github/workflows/appscan-scan.yml`:

```yaml
name: AppScan ASoC DAST Scan

on:
  deployment:
  schedule:
    - cron: '0 2 * * *'  # 2 AM daily

jobs:
  scan:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Run AppScan ASoC Scan
        uses: HCL-TECH-SOFTWARE/appscan-action@v1
        with:
          asoc_url: ${{ secrets.ASOC_URL }}
          asoc_api_key_id: ${{ secrets.ASOC_API_KEY_ID }}
          asoc_api_key_secret: ${{ secrets.ASOC_API_KEY_SECRET }}
          app_id: ${{ secrets.ASOC_APP_ID }}
          
          # Target the deployed app
          scan_type: "Dynamic"
          scan_name: "Nightly DAST Scan"
          target_url: "https://appscan-demo-mfa.vercel.app"
          
          # Use test account credentials
          login_email: "demo-user1@appscan.com"
          login_password: "DemoPassword123!"
          totp_secret: "JBSWY3DPEBLW64TMMQ======"
          
          # Optional: Set scan policies
          policy_name: "Financial Industry"
      
      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: appscan-results
          path: appscan-results.html
```

---

## 🔑 Test TOTP Endpoint

For AppScan macros that need to auto-generate TOTP codes:

```
GET /api/test/totp/{TOTP_SECRET}

Example:
GET /api/test/totp/JBSWY3DPEBLW64TMMQ======

Response:
{
  "secret": "JBSWY3DPEBLW64TMMQ======",
  "token": "123456",
  "valid_for_seconds": 30
}
```

Use the `token` value in your login request.

---

## 📝 API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/enroll-totp` | Get QR code for TOTP setup |
| POST | `/api/auth/verify-totp-setup` | Verify TOTP code and enable 2FA |
| POST | `/api/auth/login` | Login with email/password/TOTP |
| GET | `/api/auth/logout` | Logout |

### Protected (Session-based)

| Method | Endpoint | Description | Vulnerabilities |
|--------|----------|-------------|---|
| GET | `/api/user/profile` | Get user profile | - |
| GET | `/api/user/account` | Get account details | - |
| GET | `/api/search?q=...` | Search users | SQL Injection |
| GET | `/api/user/:userId/account` | Get any user's account | IDOR |
| GET | `/api/transaction/:txnId` | Get any transaction | IDOR |
| POST | `/api/profile/comment` | Post comment | Stored XSS |
| GET | `/api/comments` | Get all comments | Stored XSS (reflected) |
| POST | `/api/transfer` | Transfer funds | CSRF, IDOR, Weak validation |

### API (Bearer Token-based)

| Method | Endpoint | Description | Vulnerabilities |
|--------|----------|-------------|---|
| GET | `/api/v1/accounts` | Get account (requires Bearer token) | - |
| GET | `/api/v1/transactions` | Get transactions | IDOR (user_id param) |

### Test/Demo

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/test/totp/:secret` | Generate TOTP code for given secret |
| GET | `/api/test-accounts` | Get list of test accounts & secrets |
| GET | `/health` | Health check |

---

## 🛠️ Local Development

```bash
# Install dependencies
npm install

# Create .env.local
cp .env.local.example .env.local
# Edit with your Supabase credentials

# Start server (http://localhost:3001)
npm run dev
```

---

## 📊 Expected DAST Scan Results

A properly configured DAST scan should find:

- ✅ **SQL Injection** - Search endpoint
- ✅ **IDOR** - User account and transaction endpoints
- ✅ **Stored XSS** - Comments endpoint
- ✅ **CSRF** - Transfer endpoint (if CSRF token check is enabled)
- ✅ **Weak Input Validation** - Transfer amount field
- ✅ **Information Disclosure** - API errors revealing database details
- ✅ **Broken Access Control** - API parameters allowing cross-user access

---

## 📖 Documentation

- **Vulnerabilities Deep-Dive:** See sections above for detailed exploitation examples
- **AppScan ASoC Guide:** [HCL AppScan Documentation](https://www.hcltechsw.com/products/appscan)
- **OWASP Top 10:** [owasp.org/Top10](https://owasp.org/www-project-top-ten/)

---

## ⚠️ Security Notice

**This is a demo application with intentional vulnerabilities.** It is designed for security testing and educational purposes only. Never use these patterns in production applications.

### Key Points:
- Passwords are stored (hashed) and transmitted over HTTP for demo purposes
- TOTP secrets are exposed for testing convenience
- No rate limiting or DDoS protection
- No WAF or input sanitization (intentional)
- Not HIPAA, PCI-DSS, or SOC 2 compliant

---

## 🔄 Iteration & Feedback

To request changes or report issues:
1. Create a GitHub issue
2. Or contact: [your-email@example.com]

---

**Built for security professionals demonstrating DAST capabilities to financial sector customers.**
