require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const crypto = require('crypto');
const cron = require('node-cron');

const app = express();

// ⚠️  INTENTIONAL DEMO VULNERABILITIES - FOR DAST SCANNING ONLY
// These hardcoded credentials do NOT work for authentication
// Real authentication uses Supabase database verification
// DAST scanners will find these, but they won't grant access
const DEMO_HARDCODED_CREDS = {
  // These are FAKE and will NOT authenticate
  // Real auth happens via database password verification below
  username: 'testuser@example.com',
  password: 'TestPassword123!',
  apikey: 'sk-test-abcdefghijklmnopqrstuvwxyz123456789',
  database_user: 'postgres',
  database_password: 'postgres_demo_123'
};

// Supabase REST API config
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rczasgalkjungxegwtbt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ADMIN_EMAIL = 'admin@appscan.com';

// Helper to make Supabase REST calls
async function supabaseRest(method, table, options = {}) {
  const { data, where, match, insert, update, select = '*' } = options;
  
  let url = `${SUPABASE_URL}/rest/v1/${table}`;
  
  if (where) {
    const params = Object.entries(where).map(([key, val]) => 
      `${key}=eq.${encodeURIComponent(val)}`
    ).join('&');
    url += `?${params}`;
  }
  
  if (match) {
    const params = Object.entries(match).map(([key, val]) => 
      `${key}=eq.${encodeURIComponent(val)}`
    ).join('&');
    url += url.includes('?') ? `&${params}` : `?${params}`;
  }
  
  const headers = {
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY
  };
  
  const options_fetch = {
    method,
    headers
  };
  
  if (data || insert || update) {
    options_fetch.body = JSON.stringify(data || insert || update);
  }
  
  try {
    const res = await fetch(url, options_fetch);
    
    // Handle 204 No Content (PATCH/DELETE success)
    if (res.status === 204) {
      return [];
    }
    
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : [];
    } catch (e) {
      json = [];
    }
    
    if (!res.ok) {
      throw new Error(json.message || json.error_description || 'Database error');
    }
    
    return json;
  } catch (err) {
    console.error(`Supabase REST error:`, err.message);
    throw err;
  }
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true, maxAge: 1800000 }
}));

// Traffic logging
let trafficLogs = [];

// IP tracking middleware
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const now = new Date();
  trafficLogs.push({
    timestamp: now,
    ip_address: ip,
    method: req.method,
    path: req.path,
    status_code: res.statusCode,
    user_id: req.session.userId || null,
    user_email: req.session.email || null
  });
  
  // Keep only last 30 days of logs (30 * 24 * 60 * 60 * 1000 ms)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  trafficLogs = trafficLogs.filter(log => log.timestamp > thirtyDaysAgo);
  
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// ROUTES
// ============================================

// Serve pages
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

app.get('/app.html', (req, res) => {
  res.sendFile(__dirname + '/public/app.html');
});

app.get('/admin', (req, res) => {
  res.sendFile(__dirname + '/public/admin.html');
});

// ============================================
// AUTH ROUTES
// ============================================

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    const newUser = {
      id: userId,
      email,
      password: hashedPassword,
      full_name: fullName,
      totp_enabled: false,
      registration_ip: ip,
      created_at: new Date().toISOString()
    };

    await supabaseRest('POST', 'users', { insert: newUser });

    // Create TWO accounts: Checking and Savings
    const checkingAccount = {
      user_id: userId,
      account_number: 'CHK' + Math.random().toString(36).substring(2, 11).toUpperCase(),
      account_type: 'Checking',
      balance: 100.00
    };

    const savingsAccount = {
      user_id: userId,
      account_number: 'SAV' + Math.random().toString(36).substring(2, 11).toUpperCase(),
      account_type: 'Savings',
      balance: 100.00
    };

    await supabaseRest('POST', 'accounts', { insert: checkingAccount });
    await supabaseRest('POST', 'accounts', { insert: savingsAccount });

    res.json({ success: true, message: 'User registered' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/auth/login
// ⚠️  Note: Hardcoded demo credentials exist in code but DO NOT WORK
// Authentication uses bcrypt verification against database passwords only
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, totp_code } = req.body;

    // Only authenticates against database users (real passwords)
    // Hardcoded credentials at top of file are intentional DEMO vulnerabilities
    const users = await supabaseRest('GET', 'users', { where: { email } });
    
    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Only require TOTP if user has MFA enabled
    if (user.totp_enabled) {
      if (!totp_code) {
        return res.status(400).json({ error: 'TOTP code required' });
      }

      const verified = speakeasy.totp.verify({
        secret: user.totp_secret,
        encoding: 'base32',
        token: totp_code,
        window: 2
      });

      if (!verified) {
        return res.status(401).json({ error: 'Invalid TOTP code' });
      }
    }

    req.session.userId = user.id;
    req.session.email = user.email;

    const apiKey = 'sk_' + crypto.randomBytes(16).toString('hex');

    res.json({
      success: true,
      user: { id: user.id, email: user.email, fullName: user.full_name },
      apiKey
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/logout
app.get('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ success: true });
  });
});

// GET /api/openapi.json - Public OpenAPI specification
// Can be used to import into HCL AppScan, Postman, or other API tools
app.get('/api/openapi.json', (req, res) => {
  const openApiSpec = {
    "openapi": "3.0.0",
    "info": {
      "title": "Simple Bank API - DAST Demo",
      "description": "Intentionally vulnerable banking application with MFA/TOTP authentication for DAST security testing. Designed for AppScan demonstrations.",
      "version": "1.0.0",
      "contact": {
        "name": "HCL AppScan Demo",
        "url": "https://appscan-demo-mfa-production.up.railway.app"
      }
    },
    "servers": [
      {
        "url": "https://appscan-demo-mfa-production.up.railway.app",
        "description": "Production Demo Server"
      }
    ],
    "components": {
      "securitySchemes": {
        "cookieAuth": {
          "type": "apiKey",
          "in": "cookie",
          "name": "connect.sid"
        }
      }
    },
    "paths": {
      "/api/auth/login": {"post": {"summary": "User Login", "tags": ["Authentication"], "requestBody": {"required": true, "content": {"application/json": {"schema": {"type": "object", "properties": {"email": {"type": "string"}, "password": {"type": "string"}, "totp_code": {"type": "string"}}, "required": ["email", "password"]}}}}, "responses": {"200": {"description": "Login successful"}}}},
      "/api/user/profile": {"get": {"summary": "Get User Profile", "tags": ["User"], "security": [{"cookieAuth": []}], "responses": {"200": {"description": "User profile"}}}},
      "/api/user/account": {"get": {"summary": "Get User Accounts", "tags": ["User"], "security": [{"cookieAuth": []}], "responses": {"200": {"description": "Array of accounts"}}}},
      "/api/v1/transactions": {"get": {"summary": "Get Transactions", "tags": ["Transactions"], "security": [{"cookieAuth": []}], "responses": {"200": {"description": "Array of transactions"}}}},
      "/api/transfer": {"post": {"summary": "Transfer Money", "tags": ["Transactions"], "security": [{"cookieAuth": []}], "requestBody": {"required": true, "content": {"application/json": {"schema": {"type": "object", "properties": {"fromAccountId": {"type": "string"}, "toAccountId": {"type": "string"}, "amount": {"type": "number"}}, "required": ["fromAccountId", "toAccountId", "amount"]}}}}, "responses": {"200": {"description": "Transfer successful"}}}},
      "/api/search": {"get": {"summary": "Search Users", "tags": ["User"], "security": [{"cookieAuth": []}], "parameters": [{"name": "q", "in": "query", "required": true, "schema": {"type": "string"}}], "responses": {"200": {"description": "Search results"}}}},
      "/api/comments": {"get": {"summary": "Get Community Chat", "tags": ["Community"], "security": [{"cookieAuth": []}], "responses": {"200": {"description": "Array of comments"}}}},
      "/api/profile/comment": {"post": {"summary": "Post Comment", "tags": ["Community"], "security": [{"cookieAuth": []}], "requestBody": {"required": true, "content": {"application/json": {"schema": {"type": "object", "properties": {"content": {"type": "string"}}, "required": ["content"]}}}}, "responses": {"200": {"description": "Comment posted"}}}},
      "/api/mfa/enable": {"post": {"summary": "Enable MFA", "tags": ["Security"], "security": [{"cookieAuth": []}], "responses": {"200": {"description": "MFA secret generated"}}}},
      "/api/mfa/verify": {"post": {"summary": "Verify MFA", "tags": ["Security"], "security": [{"cookieAuth": []}], "requestBody": {"required": true, "content": {"application/json": {"schema": {"type": "object", "properties": {"totp_code": {"type": "string"}}, "required": ["totp_code"]}}}}, "responses": {"200": {"description": "MFA enabled"}}}},
      "/api/mfa/disable": {"post": {"summary": "Disable MFA", "tags": ["Security"], "security": [{"cookieAuth": []}], "responses": {"200": {"description": "MFA disabled"}}}},
      "/api/mfa/status": {"get": {"summary": "Get MFA Status", "tags": ["Security"], "security": [{"cookieAuth": []}], "responses": {"200": {"description": "MFA status"}}}},
      "/api/user/reserve": {"post": {"summary": "Reserve Account", "tags": ["User"], "security": [{"cookieAuth": []}], "responses": {"200": {"description": "Account reserved"}}}},
      "/api/user/un-reserve": {"post": {"summary": "Clear Reservation", "tags": ["User"], "security": [{"cookieAuth": []}], "responses": {"200": {"description": "Reservation cleared"}}}},
      "/api/user/api-key": {"get": {"summary": "Get API Key", "tags": ["User"], "security": [{"cookieAuth": []}], "responses": {"200": {"description": "API key"}}}},
      "/api/user/rotate-api-key": {"post": {"summary": "Rotate API Key", "tags": ["User"], "security": [{"cookieAuth": []}], "responses": {"200": {"description": "New API key"}}}},
      "/api/auth/logout": {"get": {"summary": "User Logout", "tags": ["Authentication"], "security": [{"cookieAuth": []}], "responses": {"200": {"description": "Logout successful"}}}}
    },
    "tags": [
      {"name": "Authentication", "description": "User login and logout"},
      {"name": "User", "description": "User profile, accounts, and settings"},
      {"name": "Transactions", "description": "Transaction history and transfers"},
      {"name": "Community", "description": "Community chat and comments"},
      {"name": "Security", "description": "MFA and security settings"}
    ]
  };
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'inline; filename="simple-bank-openapi-spec.json"');
  res.json(openApiSpec);
});

// ============================================
// PROTECTED ROUTES
// ============================================

const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};

// GET /api/user/profile
app.get('/api/user/profile', requireAuth, async (req, res) => {
  try {
    const users = await supabaseRest('GET', 'users', { where: { id: req.session.userId } });
    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = users[0];
    res.json({ id: user.id, email: user.email, full_name: user.full_name, created_at: user.created_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/user/account
app.get('/api/user/account', requireAuth, async (req, res) => {
  try {
    const accounts = await supabaseRest('GET', 'accounts', { where: { user_id: req.session.userId } });
    if (!accounts || accounts.length === 0) {
      return res.status(404).json({ error: 'No accounts found' });
    }
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// VULNERABLE ENDPOINTS (DAST)
// ============================================

// GET /api/search - SQL Injection vulnerable
app.get('/api/search', requireAuth, async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'Query required' });

    // Get all users and filter by email or name (partial match)
    const allUsers = await supabaseRest('GET', 'users');
    const searchLower = q.toLowerCase();
    
    const results = allUsers.filter(user => 
      user.email.toLowerCase().includes(searchLower) || 
      (user.full_name && user.full_name.toLowerCase().includes(searchLower))
    );

    // For each user, get their checking and savings account IDs
    const usersWithAccounts = await Promise.all(
      results.map(async (user) => {
        try {
          const accounts = await supabaseRest('GET', 'accounts', { where: { user_id: user.id } });
          const checkingAccount = accounts.find(a => a.account_type === 'Checking');
          const savingsAccount = accounts.find(a => a.account_type === 'Savings');
          return {
            id: user.id,
            email: user.email,
            full_name: user.full_name || 'N/A',
            checking_account_id: checkingAccount?.id || 'N/A',
            savings_account_id: savingsAccount?.id || 'N/A'
          };
        } catch {
          return {
            id: user.id,
            email: user.email,
            full_name: user.full_name || 'N/A',
            checking_account_id: 'N/A',
            savings_account_id: 'N/A'
          };
        }
      })
    );

    res.json(usersWithAccounts || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/user/:userId/account - IDOR vulnerable
app.get('/api/user/:userId/account', requireAuth, async (req, res) => {
  try {
    const accounts = await supabaseRest('GET', 'accounts', { where: { user_id: req.params.userId } });
    if (!accounts || accounts.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json(accounts[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/transaction/:transactionId - IDOR vulnerable
app.get('/api/transaction/:transactionId', requireAuth, async (req, res) => {
  try {
    const txns = await supabaseRest('GET', 'transactions', { where: { id: req.params.transactionId } });
    if (!txns || txns.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json(txns[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/profile/comment - XSS vulnerable
app.post('/api/profile/comment', requireAuth, async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment) return res.status(400).json({ error: 'Comment required' });

    const result = await supabaseRest('POST', 'comments', {
      insert: {
        user_id: req.session.userId,
        content: comment,
        created_at: new Date().toISOString()
      }
    });

    return res.json({ 
      success: true, 
      comment: (result && result[0]) || { content: comment, user_id: req.session.userId } 
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/comments
app.get('/api/comments', requireAuth, async (req, res) => {
  try {
    const comments = await supabaseRest('GET', 'comments', {});
    const users = await supabaseRest('GET', 'users', {});
    
    // Enrich comments with full names
    const enrichedComments = comments.map(comment => {
      const user = users.find(u => u.id === comment.user_id);
      return {
        ...comment,
        user_full_name: user?.full_name || 'Unknown'
      };
    });
    
    return res.json(enrichedComments || []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/transfer - CSRF + IDOR vulnerable
app.post('/api/transfer', requireAuth, async (req, res) => {
  try {
    const { toAccountId, amount, fromAccountId } = req.body;
    if (!toAccountId || !amount || !fromAccountId) {
      return res.status(400).json({ error: 'Account, amount, and from account required' });
    }

    // Get the FROM account and verify it belongs to user
    const fromAccount = await supabaseRest('GET', 'accounts', { where: { id: fromAccountId } });
    if (!fromAccount || fromAccount.length === 0) {
      return res.status(400).json({ error: 'Account not found' });
    }
    
    if (fromAccount[0].user_id !== req.session.userId) {
      return res.status(403).json({ error: 'Cannot transfer from another user account' });
    }

    if (fromAccount[0].balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Deduct from source account
    const newBalance = fromAccount[0].balance - amount;
    await supabaseRest('PATCH', 'accounts', {
      update: { balance: newBalance },
      where: { id: fromAccountId }
    });

    // Add to recipient account
    const recipientAccounts = await supabaseRest('GET', 'accounts', { where: { id: toAccountId } });
    if (recipientAccounts && recipientAccounts.length > 0) {
      await supabaseRest('PATCH', 'accounts', {
        update: { balance: recipientAccounts[0].balance + amount },
        where: { id: toAccountId }
      });
    }

    // Create transaction record
    const txn = await supabaseRest('POST', 'transactions', {
      insert: {
        from_user_id: req.session.userId,
        to_account_id: toAccountId,
        amount,
        status: 'completed',
        created_at: new Date().toISOString()
      }
    });

    return res.json({ success: true, transaction: (txn && txn[0]) || { amount, status: 'completed' } });
  } catch (err) {
    console.error('Transfer error:', err);
    return res.status(500).json({ error: 'Transfer failed: ' + err.message });
  }
});

// ============================================
// API ROUTES
// ============================================

// GET /api/v1/accounts
app.get('/api/v1/accounts', requireAuth, async (req, res) => {
  try {
    const accounts = await supabaseRest('GET', 'accounts', { where: { user_id: req.session.userId } });
    if (!accounts || accounts.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json(accounts[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/transactions
app.get('/api/v1/transactions', requireAuth, async (req, res) => {
  try {
    const userId = req.query.user_id || req.session.userId;
    const txns = await supabaseRest('GET', 'transactions', {});
    const users = await supabaseRest('GET', 'users', {});
    const accounts = await supabaseRest('GET', 'accounts', {});
    
    // Enrich transactions with user names and account numbers
    const enrichedTxns = txns.map(txn => {
      const fromUser = users.find(u => u.id === txn.from_user_id);
      const toAccount = accounts.find(a => a.id === txn.to_account_id);
      const toUser = toAccount ? users.find(u => u.id === toAccount.user_id) : null;
      
      return {
        ...txn,
        from_user_name: fromUser?.full_name || 'Unknown',
        from_user_account_number: fromUser ? accounts.find(a => a.user_id === fromUser.id && a.account_type === 'Checking')?.account_number || 'N/A' : 'N/A',
        to_account_number: toAccount?.account_number || 'N/A',
        to_user_name: toUser?.full_name || 'Unknown'
      };
    });
    
    res.json(enrichedTxns || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN ROUTES
// ============================================

app.get('/api/admin/check', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  if (req.session.email === ADMIN_EMAIL) {
    return res.json({ success: true });
  }
  
  res.status(403).json({ error: 'Not admin' });
});

// GET /api/admin/users
app.get('/api/admin/users', async (req, res) => {
  try {
    if (req.session.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin only' });
    }

    const users = await supabaseRest('GET', 'users', {});
    const accounts = await supabaseRest('GET', 'accounts', {});

    const usersWithBalance = users.map(user => {
      const userAccounts = accounts.filter(a => a.user_id === user.id);
      const checkingAccount = userAccounts.find(a => a.account_type === 'Checking');
      const savingsAccount = userAccounts.find(a => a.account_type === 'Savings');
      
      return {
        ...user,
        balance: userAccounts[0]?.balance || 0,
        checking_account_id: checkingAccount?.id || 'N/A',
        savings_account_id: savingsAccount?.id || 'N/A'
      };
    });

    res.json(usersWithBalance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/traffic
app.get('/api/admin/traffic', (req, res) => {
  if (req.session.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin only' });
  }
  // Return latest logs first (descending order)
  const logs = trafficLogs.slice().reverse();
  res.json(logs);
});

// POST /api/admin/users/create
app.post('/api/admin/users/create', async (req, res) => {
  try {
    if (req.session.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { email, password, fullName } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    await supabaseRest('POST', 'users', {
      insert: {
        id: userId,
        email,
        password: hashedPassword,
        full_name: fullName,
        totp_enabled: false,
        registration_ip: ip,
        created_at: new Date().toISOString()
      }
    });

    // Create TWO accounts: Checking and Savings
    await supabaseRest('POST', 'accounts', {
      insert: {
        user_id: userId,
        account_number: 'CHK' + Math.random().toString(36).substring(2, 11).toUpperCase(),
        account_type: 'Checking',
        balance: 100.00
      }
    });

    await supabaseRest('POST', 'accounts', {
      insert: {
        user_id: userId,
        account_number: 'SAV' + Math.random().toString(36).substring(2, 11).toUpperCase(),
        account_type: 'Savings',
        balance: 100.00
      }
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/users/:userId
app.delete('/api/admin/users/:userId', async (req, res) => {
  try {
    if (req.session.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin only' });
    }

    const userId = req.params.userId;

    // Step 1: Get user's account IDs
    let userAccounts = [];
    try {
      userAccounts = await supabaseRest('GET', 'accounts', { where: { user_id: userId } });
    } catch (err) {
      console.log('No accounts found');
    }

    const accountIds = userAccounts ? userAccounts.map(a => a.id) : [];

    // Step 2: Delete transactions (both from_user and to_account)
    try {
      await supabaseRest('DELETE', 'transactions', { where: { from_user_id: userId } });
    } catch (err) {
      console.log('No outgoing transactions to delete');
    }

    // Also delete transactions pointing to this user's accounts
    if (accountIds.length > 0) {
      for (const accountId of accountIds) {
        try {
          await supabaseRest('DELETE', 'transactions', { where: { to_account_id: accountId } });
        } catch (err) {
          console.log('No incoming transactions to delete for account:', accountId);
        }
      }
    }

    // Step 3: Delete comments
    try {
      await supabaseRest('DELETE', 'comments', { where: { user_id: userId } });
    } catch (err) {
      console.log('No comments to delete');
    }

    // Step 4: Delete accounts
    try {
      await supabaseRest('DELETE', 'accounts', { where: { user_id: userId } });
    } catch (err) {
      console.log('No accounts to delete');
    }

    // Step 5: Delete user
    await supabaseRest('DELETE', 'users', { where: { id: userId } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users/reset-password - Reset user password
app.post('/api/admin/users/reset-password', async (req, res) => {
  try {
    if (req.session.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
      return res.status(400).json({ error: 'User ID and password required' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await supabaseRest('PATCH', 'users', {
      update: { 
        password: hashedPassword,
        totp_enabled: false,
        totp_secret: null,
        recent_change: 'Password reset by admin',
        last_updated: new Date().toISOString()
      },
      where: { id: userId }
    });

    res.json({ success: true, message: 'Password reset and MFA disabled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/reset - Reset app state
app.post('/api/admin/reset', async (req, res) => {
  try {
    if (req.session.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { type } = req.body;

    if (type === 'comments') {
      await supabaseRest('DELETE', 'comments', {});
      res.json({ success: true, message: 'All comments cleared' });
    } else if (type === 'transactions') {
      await supabaseRest('DELETE', 'transactions', {});
      res.json({ success: true, message: 'All transactions cleared' });
    } else if (type === 'full') {
      await supabaseRest('DELETE', 'comments', {});
      await supabaseRest('DELETE', 'transactions', {});
      res.json({ success: true, message: 'Comments and transactions cleared' });
    } else {
      res.status(400).json({ error: 'Invalid reset type' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// RESERVE ROUTES
// ============================================

app.post('/api/user/reserve', requireAuth, async (req, res) => {
  try {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    // Use UPDATE instead of PATCH for reliability
    const updateResult = await supabaseRest('PATCH', 'users', {
      update: { reserved_until: expiresAt.toISOString() },
      where: { id: req.session.userId }
    });
    
    return res.json({ success: true, reservedUntil: expiresAt });
  } catch (err) {
    console.error('[RESERVE] Error:', err.message);
    return res.status(500).json({ error: 'Reserve failed' });
  }
});

app.post('/api/user/un-reserve', requireAuth, async (req, res) => {
  try {
    await supabaseRest('PATCH', 'users', {
      update: { reserved_until: null },
      where: { id: req.session.userId }
    });
    
    return res.json({ success: true });
  } catch (err) {
    console.error('[UN-RESERVE] Error:', err.message);
    return res.status(500).json({ error: 'Un-reserve failed' });
  }
});

app.get('/api/user/reserve-status', requireAuth, async (req, res) => {
  try {
    const users = await supabaseRest('GET', 'users', { where: { id: req.session.userId } });
    
    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'User not found', isReserved: false });
    }
    
    const user = users[0];
    const isReserved = user.reserved_until && new Date(user.reserved_until) > new Date();
    
    return res.json({ success: true, isReserved, reservedUntil: user.reserved_until });
  } catch (err) {
    console.error('[RESERVE-STATUS] Error:', err.message);
    return res.status(500).json({ error: 'Status check failed', isReserved: false });
  }
});

// ============================================
// TEST ENDPOINTS
// ============================================

app.get('/api/test/totp/:secret', (req, res) => {
  try {
    const secret = req.params.secret;
    const token = speakeasy.totp({
      secret,
      encoding: 'base32'
    });
    res.json({ secret, token, valid_for_seconds: 30 });
  } catch (err) {
    res.status(400).json({ error: 'Invalid secret' });
  }
});

app.get('/api/test-accounts', (req, res) => {
  // Test accounts - credentials should come from .env or admin panel
  res.json({
    message: 'Use admin panel to create test accounts',
    demo_account_1: 'admin@appscan.com (Admin account)',
    note: 'No credentials exposed in API response'
  });
});

// ============================================
// MFA ROUTES
// ============================================

// POST /api/mfa/enable - Generate QR code for MFA setup
app.post('/api/mfa/enable', requireAuth, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `AppScan Demo (${req.session.email})`,
      length: 32
    });

    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      secret: secret.base32,
      qrCode,
      message: 'Scan this QR code with your authenticator app'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mfa/verify - Verify TOTP and enable MFA
app.post('/api/mfa/verify', requireAuth, async (req, res) => {
  try {
    const { totp_secret, totp_code } = req.body;

    if (!totp_secret || !totp_code) {
      return res.status(400).json({ error: 'Secret and code required' });
    }

    const verified = speakeasy.totp.verify({
      secret: totp_secret,
      encoding: 'base32',
      token: totp_code,
      window: 2
    });

    if (!verified) {
      return res.status(401).json({ error: 'Invalid TOTP code' });
    }

    // Save secret to user
    await supabaseRest('PATCH', 'users', {
      update: {
        totp_secret: totp_secret,
        totp_enabled: true
      },
      where: { id: req.session.userId }
    });

    res.json({ success: true, message: 'MFA enabled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mfa/disable - Disable MFA
app.post('/api/mfa/disable', requireAuth, async (req, res) => {
  try {
    const { totp_code } = req.body;

    const users = await supabaseRest('GET', 'users', { where: { id: req.session.userId } });
    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];

    // Verify code before allowing disable
    if (totp_code && user.totp_secret) {
      const verified = speakeasy.totp.verify({
        secret: user.totp_secret,
        encoding: 'base32',
        token: totp_code,
        window: 2
      });

      if (!verified) {
        return res.status(401).json({ error: 'Invalid TOTP code' });
      }
    }

    await supabaseRest('PATCH', 'users', {
      update: {
        totp_secret: null,
        totp_enabled: false
      },
      where: { id: req.session.userId }
    });

    res.json({ success: true, message: 'MFA disabled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mfa/status - Check MFA status
app.get('/api/mfa/status', requireAuth, async (req, res) => {
  try {
    const users = await supabaseRest('GET', 'users', { where: { id: req.session.userId } });
    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];
    res.json({
      mfa_enabled: user.totp_enabled || false,
      email: user.email
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/user/rotate-api-key - Generate new API key
app.post('/api/user/rotate-api-key', requireAuth, async (req, res) => {
  try {
    // Generate new API key (32 random characters)
    const newApiKey = crypto.randomBytes(16).toString('hex');
    
    await supabaseRest('PATCH', 'users', {
      update: { api_key: newApiKey },
      where: { id: req.session.userId }
    });
    
    res.json({ success: true, api_key: newApiKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/user/api-key - Get current API key
app.get('/api/user/api-key', requireAuth, async (req, res) => {
  try {
    const users = await supabaseRest('GET', 'users', { where: { id: req.session.userId } });
    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = users[0];
    // If no API key exists, generate one
    if (!user.api_key) {
      const newApiKey = crypto.randomBytes(16).toString('hex');
      await supabaseRest('PATCH', 'users', {
        update: { api_key: newApiKey },
        where: { id: req.session.userId }
      });
      return res.json({ success: true, api_key: newApiKey });
    }
    
    res.json({ success: true, api_key: user.api_key });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ⚠️  INTENTIONAL DEMO HARDCODED CREDENTIALS FOR DAST SCANNING
// These are FAKE test credentials that DAST scanners should find
// They do NOT work for actual authentication - database verification is used instead
// These demonstrate the vulnerability without compromising security
const DEMO_TEST_CREDENTIALS = {
  backup_admin: 'admin@backup.com:BackupAdminPass123!',
  legacy_user: 'olduser@test.com:OldPassword456!',
  staging_db: 'staging_user:staging_password_789',
  api_tokens: [
    'sk-proj-test123456789abcdefghijk',
    'sk-test-xyzabc123456789'
  ]
};

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`AppScan Demo App running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // Initialize cleanup schedule AFTER server starts
  cron.schedule('0 8 * * *', async () => {
    try {
      await supabaseRest('DELETE', 'comments', {});
      console.log('[CLEANUP] ✓ XSS comments cleared at midnight PST');
    } catch (err) {
      console.error('[CLEANUP] Failed to clear comments:', err.message);
    }
  });

  console.log('✓ Nightly cleanup scheduled for 00:00 PST (08:00 UTC)');
});