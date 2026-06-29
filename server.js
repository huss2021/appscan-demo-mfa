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
    const json = await res.json();
    
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
  secret: process.env.SESSION_SECRET || 'demo-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true, maxAge: 1800000 }
}));

// Traffic logging
let trafficLogs = [];

// IP tracking middleware
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  trafficLogs.push({
    timestamp: new Date(),
    ip_address: ip,
    method: req.method,
    path: req.path,
    status_code: res.statusCode,
    user_id: req.session.userId || null,
    user_email: req.session.email || null
  });
  if (trafficLogs.length > 10000) trafficLogs = trafficLogs.slice(-10000);
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
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, totp_code } = req.body;

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

    const users = await supabaseRest('GET', 'users', {
      where: { email: q }
    });

    res.json(users || []);
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

    res.json(result[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/comments
app.get('/api/comments', requireAuth, async (req, res) => {
  try {
    const comments = await supabaseRest('GET', 'comments', {});
    res.json(comments || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/transfer - CSRF + IDOR vulnerable
app.post('/api/transfer', requireAuth, async (req, res) => {
  try {
    const { toAccountId, amount } = req.body;
    if (!toAccountId || !amount) {
      return res.status(400).json({ error: 'Account and amount required' });
    }

    const accounts = await supabaseRest('GET', 'accounts', { where: { user_id: req.session.userId } });
    if (!accounts || accounts.length === 0 || accounts[0].balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const newBalance = accounts[0].balance - amount;
    await supabaseRest('PATCH', 'accounts', {
      update: { balance: newBalance },
      where: { user_id: req.session.userId }
    });

    const recipientAccounts = await supabaseRest('GET', 'accounts', { where: { id: toAccountId } });
    if (recipientAccounts && recipientAccounts.length > 0) {
      await supabaseRest('PATCH', 'accounts', {
        update: { balance: recipientAccounts[0].balance + amount },
        where: { id: toAccountId }
      });
    }

    const txn = await supabaseRest('POST', 'transactions', {
      insert: {
        from_user_id: req.session.userId,
        to_account_id: toAccountId,
        amount,
        status: 'completed',
        created_at: new Date().toISOString()
      }
    });

    res.json({ success: true, transaction: txn[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.json(txns || []);
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

    const usersWithBalance = users.map(user => ({
      ...user,
      balance: accounts.find(a => a.user_id === user.id)?.balance || 0
    }));

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
  res.json(trafficLogs.slice(-500));
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
        totp_secret: null
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
    await supabaseRest('PATCH', 'users', {
      update: { reserved_until: expiresAt.toISOString() },
      where: { id: req.session.userId }
    });
    res.json({ success: true, reservedUntil: expiresAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user/un-reserve', requireAuth, async (req, res) => {
  try {
    await supabaseRest('PATCH', 'users', {
      update: { reserved_until: null },
      where: { id: req.session.userId }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/user/reserve-status', requireAuth, async (req, res) => {
  try {
    const users = await supabaseRest('GET', 'users', { where: { id: req.session.userId } });
    if (!users || users.length === 0) {
      return res.status(500).json({ error: 'User not found' });
    }
    
    const user = users[0];
    const isReserved = user.reserved_until && new Date(user.reserved_until) > new Date();
    res.json({ isReserved, reservedUntil: user.reserved_until });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
  res.json({
    accounts: [
      {
        email: 'demo-user1@appscan.com',
        password: 'DemoPassword123!',
        totp_secret: 'JBSWY3DPEBLW64TMMQ======'
      },
      {
        email: 'demo-user2@appscan.com',
        password: 'DemoPassword123!',
        totp_secret: 'KVKFKRCPNZQUYMLXOBZWKY3UPEA======'
      }
    ]
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