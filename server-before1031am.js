require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const session = require('express-session');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'demo-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true, maxAge: 1800000 } // 30 min
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
    status_code: res.statusCode
  });
  if (trafficLogs.length > 10000) trafficLogs = trafficLogs.slice(-10000);
  next();
});

// Supabase - Simple initialization without Realtime
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// AUTH ROUTES
// ============================================

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = require('crypto').randomUUID();

    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert({
        id: userId,
        email,
        password: hashedPassword,
        full_name: fullName,
        totp_enabled: false
      })
      .select();

    if (userError) {
      return res.status(400).json({ error: userError.message });
    }

    // Create account with $100 balance
    const accountNumber = 'ACC' + Math.random().toString(36).substring(2, 11).toUpperCase();
    const { error: accountError } = await supabase
      .from('accounts')
      .insert({
        user_id: userId,
        account_number: accountNumber,
        account_type: 'Checking',
        balance: 100.00
      });

    if (accountError) {
      console.error('Account creation error:', accountError);
    }

    res.json({ success: true, message: 'User registered. Please set up TOTP.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/enroll-totp
app.post('/api/auth/enroll-totp', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email);

    if (error || users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `AppScan Demo (${email})`,
      issuer: 'AppScan Demo',
      length: 32
    });

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    // Store temporary secret in session
    req.session.pendingSecret = secret.base32;
    req.session.pendingSecretId = user.id;

    res.json({
      qrCode,
      secret: secret.base32,
      manualEntryKey: secret.base32
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/verify-totp-setup
app.post('/api/auth/verify-totp-setup', async (req, res) => {
  try {
    const { token } = req.body;
    const secret = req.session.pendingSecret;
    const userId = req.session.pendingSecretId;

    if (!secret) {
      return res.status(400).json({ error: 'No pending TOTP setup' });
    }

    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2
    });

    if (!verified) {
      return res.status(401).json({ error: 'Invalid TOTP code' });
    }

    // Save TOTP secret to database
    const { error } = await supabase
      .from('users')
      .update({
        totp_secret: secret,
        totp_enabled: true
      })
      .eq('id', userId);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    delete req.session.pendingSecret;
    delete req.session.pendingSecretId;

    res.json({ success: true, message: 'TOTP enabled successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, totp_code } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email);

    if (error || users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // If TOTP enabled, verify code
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

    // Set session
    req.session.userId = user.id;
    req.session.email = user.email;

    // Generate API key for this session
    const apiKey = 'sk_' + require('crypto').randomBytes(16).toString('hex');
    await supabase
      .from('api_keys')
      .insert({
        user_id: user.id,
        key: apiKey,
        label: `Session ${new Date().toISOString()}`
      });

    res.json({
      success: true,
      message: 'Login successful',
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
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true, message: 'Logged out' });
  });
});

// ============================================
// PROTECTED ROUTES (require session)
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
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, full_name, created_at')
      .eq('id', req.session.userId)
      .single();

    if (error) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/user/account
app.get('/api/user/account', requireAuth, async (req, res) => {
  try {
    const { data: account, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', req.session.userId)
      .single();

    if (error || !account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// VULNERABLE ENDPOINTS (DAST should find these)
// ============================================

// VULNERABILITY 1: SQL Injection in search
// GET /api/search?q=...
app.get('/api/search', requireAuth, async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) {
      return res.status(400).json({ error: 'Query required' });
    }

    // VULNERABLE: Direct SQL injection
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name')
      .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// VULNERABILITY 2: IDOR (Insecure Direct Object Reference)
// GET /api/user/:userId/account
app.get('/api/user/:userId/account', requireAuth, async (req, res) => {
  try {
    const targetUserId = req.params.userId;

    // VULNERABLE: No authorization check
    const { data: account, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', targetUserId)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// VULNERABILITY 3: IDOR in transactions
// GET /api/transaction/:transactionId
app.get('/api/transaction/:transactionId', requireAuth, async (req, res) => {
  try {
    const txnId = req.params.transactionId;

    // VULNERABLE: No authorization check
    const { data: txn, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', txnId)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(txn);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// VULNERABILITY 4: Stored XSS in comments
// POST /api/profile/comment
app.post('/api/profile/comment', requireAuth, async (req, res) => {
  try {
    const { comment } = req.body;

    if (!comment) {
      return res.status(400).json({ error: 'Comment required' });
    }

    // VULNERABLE: Storing unsanitized comment (XSS)
    const { data, error } = await supabase
      .from('comments')
      .insert({
        user_id: req.session.userId,
        content: comment
      })
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/comments
app.get('/api/comments', requireAuth, async (req, res) => {
  try {
    const { data: comments, error } = await supabase
      .from('comments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // VULNERABLE: Returning raw unsanitized HTML (XSS reflected in frontend)
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// VULNERABILITY 5: Missing CSRF protection & IDOR on transfer
// POST /api/transfer
app.post('/api/transfer', requireAuth, async (req, res) => {
  try {
    const { toAccountId, amount } = req.body;

    if (!toAccountId || !amount) {
      return res.status(400).json({ error: 'Account and amount required' });
    }

    // VULNERABLE: No CSRF token check
    const { data: account, error } = await supabase
      .from('accounts')
      .select('balance')
      .eq('user_id', req.session.userId)
      .single();

    if (error || account.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Deduct balance
    await supabase
      .from('accounts')
      .update({ balance: account.balance - amount })
      .eq('user_id', req.session.userId);

    // Credit recipient
    const { data: recipientAccount } = await supabase
      .from('accounts')
      .select('balance')
      .eq('id', toAccountId)
      .single();

    await supabase
      .from('accounts')
      .update({ balance: recipientAccount.balance + amount })
      .eq('id', toAccountId);

    // Log transaction
    const { data: txn } = await supabase
      .from('transactions')
      .insert({
        from_user_id: req.session.userId,
        to_account_id: toAccountId,
        amount,
        status: 'completed'
      })
      .select();

    res.json({ success: true, transaction: txn[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// API KEY AUTH ROUTES (for DAST API scanning)
// ============================================

const requireApiKey = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing API key' });
  }

  const apiKey = authHeader.substring(7);
  const { data: keys, error } = await supabase
    .from('api_keys')
    .select('user_id')
    .eq('key', apiKey);

  if (error || keys.length === 0) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  req.userId = keys[0].user_id;
  next();
};

// GET /api/v1/accounts (API endpoint)
app.get('/api/v1/accounts', requireApiKey, async (req, res) => {
  try {
    const { data: account, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', req.userId)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/transactions (API endpoint - vulnerable IDOR)
app.get('/api/v1/transactions', requireApiKey, async (req, res) => {
  try {
    // VULNERABLE: Can query any user's transactions if you know their ID
    const userId = req.query.user_id || req.userId;

    const { data: txns, error } = await supabase
      .from('transactions')
      .select('*')
      .or(`from_user_id.eq.${userId},to_account_id.eq.${userId}`)
      .limit(50);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(txns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// TEST DATA ENDPOINTS (for AppScan/DAST)
// ============================================

// GET /api/test/totp/:secret
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

// GET /api/test-accounts
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
    ],
    note: 'These are test accounts for DAST scanning. Use with AppScan ASoC.'
  });
});

// Serve login page as default
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

// Serve app dashboard
app.get('/app.html', (req, res) => {
  res.sendFile(__dirname + '/public/app.html');
});

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(__dirname + '/public/admin.html');
});

// ============================================
// ADMIN ROUTES
// ============================================

const ADMIN_EMAIL = 'admin@appscan.com';

// Check if admin
app.get('/api/admin/check', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  if (req.session.email === ADMIN_EMAIL) {
    return res.json({ success: true });
  }
  
  res.status(403).json({ error: 'Not admin' });
});

// Get all users
app.get('/api/admin/users', async (req, res) => {
  try {
    if (req.session.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { data: users, error } = await supabase
      .from('users')
      .select(`
        id,
        email,
        full_name,
        created_at,
        registration_ip,
        accounts(balance)
      `);

    if (error) throw error;

    const usersWithBalance = users.map(user => ({
      ...user,
      balance: user.accounts && user.accounts[0] ? user.accounts[0].balance : 0
    }));

    res.json(usersWithBalance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get traffic logs
app.get('/api/admin/traffic', (req, res) => {
  if (req.session.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin only' });
  }
  res.json(trafficLogs.slice(-500));
});

// Create user (admin only)
app.post('/api/admin/users/create', async (req, res) => {
  try {
    if (req.session.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { email, password, fullName } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = require('crypto').randomUUID();
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    const { error: userError } = await supabase
      .from('users')
      .insert({
        id: userId,
        email,
        password: hashedPassword,
        full_name: fullName,
        totp_enabled: false,
        registration_ip: ip
      });

    if (userError) return res.status(400).json({ error: userError.message });

    await supabase
      .from('accounts')
      .insert({
        user_id: userId,
        account_number: 'ACC' + Math.random().toString(36).substring(2, 11).toUpperCase(),
        account_type: 'Checking',
        balance: 100.00
      });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete user (admin only)
app.delete('/api/admin/users/:userId', async (req, res) => {
  try {
    if (req.session.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin only' });
    }

    await supabase.from('users').delete().eq('id', req.params.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// RESERVE/IN-USE ROUTES
// ============================================

app.post('/api/user/reserve', requireAuth, async (req, res) => {
  try {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const { error } = await supabase
      .from('users')
      .update({ reserved_until: expiresAt })
      .eq('id', req.session.userId);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, reservedUntil: expiresAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/user/reserve-status', requireAuth, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('reserved_until')
      .eq('id', req.session.userId)
      .single();

    if (error) return res.status(500).json({ error: error.message });
    
    const isReserved = user.reserved_until && new Date(user.reserved_until) > new Date();
    res.json({ isReserved, reservedUntil: user.reserved_until });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
