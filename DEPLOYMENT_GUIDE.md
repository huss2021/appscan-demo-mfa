# Deployment Guide: AppScan Demo App

## TL;DR - Quick Deploy (10 minutes)

If you're doing this from iPhone, here's the simplest path:

1. **Create GitHub repo** → GitHub website (2 min)
2. **Create Supabase project** → Supabase website (3 min)
3. **Add files to repo** → GitHub web editor (3 min)
4. **Deploy to Vercel** → Vercel auto-detects GitHub repo (2 min)

---

## Step 1: Set Up Supabase Database (5 minutes)

### 1.1 Create Supabase Account

1. Go to **[supabase.com](https://supabase.com)** (on iPhone)
2. Tap **"Sign Up"**
3. Use email or GitHub to sign up
4. Verify email if needed

### 1.2 Create New Project

1. Once logged in, tap **"New Project"**
2. **Organization:** Create one or use existing (name: "appscan")
3. **Project Name:** `appscan-mfa-demo`
4. **Database Password:** Generate a strong password and save it (copy to Notes)
5. **Region:** Select closest to you (or US-East)
6. **Pricing Plan:** Free tier (you can upgrade later)
7. Tap **"Create new project"** and wait 2-3 minutes

### 1.3 Get Your Credentials

Once project is ready:

1. Go to **Settings** → **API**
2. Copy and save these in Notes:
   - **Project URL** (e.g., `https://xxx.supabase.co`)
   - **anon public** key (labeled "Public API key")

**Save both values—you'll need them in Step 3**

### 1.4 Create Database Tables

1. Still in Supabase, go to **SQL Editor** (left sidebar)
2. Click **"New Query"**
3. **Copy-paste the entire contents of `schema.sql`** (I'll provide this below)
4. Click **"Run"**
5. Wait for success message

---

## Step 2: Set Up GitHub Repository (3 minutes)

### 2.1 Create Repo

1. Go to **[github.com](https://github.com)** (on iPhone)
2. Tap **"+"** (top right) → **"New repository"**
3. **Repository Name:** `appscan-demo-mfa`
4. **Description:** "AppScan DAST demo app with MFA/2FA"
5. **Visibility:** Public (easier for Vercel integration)
6. **Initialize with:** Add `.gitignore` → Node
7. Tap **"Create repository"**

### 2.2 Add Files via GitHub Web UI

You'll add files one-by-one via GitHub's web editor. Here's the structure:

```
appscan-demo-mfa/
├── server.js
├── package.json
├── .env.local.example
├── schema.sql
├── README.md
├── vercel.json
├── .gitignore
├── .github/
│   └── workflows/
│       └── appscan-scan.yml
└── public/
    ├── index.html
    └── app.html
```

**To add each file from iPhone:**

1. Go to your GitHub repo
2. Tap **"Add file"** → **"Create new file"**
3. Enter filename (e.g., `server.js`)
4. Paste file contents (from below)
5. Scroll down → tap **"Commit new file"**
6. Repeat for each file

---

## Step 3: Deploy to Vercel (2 minutes)

### 3.1 Connect Vercel to GitHub

1. Go to **[vercel.com](https://vercel.com)** (on iPhone)
2. Sign in (or create account using GitHub)
3. Tap **"Add New"** → **"Project"**
4. Tap **"Import Git Repository"**
5. Select your `appscan-demo-mfa` repo
6. Tap **"Import"**

### 3.2 Configure Environment Variables

1. Before deploying, you'll see **"Environment Variables"** section
2. Add these variables (from Step 1):
   - **Key:** `SUPABASE_URL` → **Value:** Your Supabase project URL
   - **Key:** `SUPABASE_KEY` → **Value:** Your Supabase anon key
   - **Key:** `SESSION_SECRET` → **Value:** Any random string (e.g., `abc123xyz456`)
   - **Key:** `NODE_ENV` → **Value:** `production`
3. Tap **"Deploy"**

### 3.3 Wait for Deployment

Vercel will:
1. Pull your code from GitHub
2. Install dependencies
3. Build the app
4. Deploy to production

**Live URL** will appear on screen (e.g., `https://appscan-demo-mfa.vercel.app`)

---

## Step 4: Test the App (1 minute)

1. Click your live URL
2. You should see the login page
3. **Test Account Email:** Contact Simple Bank administrator for test credentials
4. **Password:** (Provided by administrator)
5. **TOTP Code:** If MFA is enabled, use the `/api/test/totp/{TOTP_SECRET}` endpoint to generate codes
   - Requires your test account's TOTP secret (provided by administrator)
6. Log in successfully = ✅ App is deployed!

---

## File Contents (Copy-Paste for GitHub Web UI)

When adding files via GitHub, copy the content from each section below:

### File 1: `server.js`
[See full server.js in outputs above]

### File 2: `package.json`
[See full package.json in outputs above]

### File 3: `.env.local.example`
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SESSION_SECRET=your-random-session-secret-here
PORT=3001
NODE_ENV=development
```

### File 4: `schema.sql`
[See full schema.sql in outputs above]

### File 5: `README.md`
[See full README.md in outputs above]

### File 6: `vercel.json`
```json
{
  "buildCommand": "npm install",
  "installCommand": "npm install",
  "devCommand": "node server.js",
  "framework": null,
  "outputDirectory": null,
  "env": [
    "SUPABASE_URL",
    "SUPABASE_KEY",
    "SESSION_SECRET",
    "NODE_ENV"
  ]
}
```

### File 7: `.gitignore`
```
.env
.env.local
.env.*.local
node_modules/
npm-debug.log
yarn-error.log
.vscode/
.idea/
*.swp
.DS_Store
dist/
build/
.next/
*.log
logs/
*.tmp
temp/
*.pem
*.key
secrets.txt
```

### File 8: `public/index.html`
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AppScan Demo — MFA/2FA Financial App</title>
  </head>
  <body>
    <div id="root"></div>
    <script src="/app.html"></script>
  </body>
</html>
```

### File 9: `public/app.html`
[See full app.html in outputs above]

### File 10: `.github/workflows/appscan-scan.yml`
[See full GitHub Actions workflow in outputs above]

---

## Troubleshooting

### Problem: Vercel deployment fails

**Solution:** Check logs in Vercel dashboard → Failed builds. Common issues:
- Missing environment variables (SUPABASE_URL, SUPABASE_KEY)
- Typos in Supabase credentials
- Schema not created in Supabase

### Problem: Login fails with "Invalid credentials"

**Solution:**
- Verify test accounts exist in Supabase (go to SQL Editor, run `SELECT * FROM users;`)
- Check that schema.sql ran successfully
- Try creating a new user via register button

### Problem: TOTP code not working

**Solution:**
- Get fresh code from `/api/test/totp/JBSWY3DPEBLW64TMMQ======`
- TOTP codes are valid for 30 seconds—if expired, get a new one
- Ensure exact secret: `JBSWY3DPEBLW64TMMQ======` (match case)

### Problem: App doesn't load at all

**Solution:**
- Click **Deployments** tab in Vercel
- Check if latest build succeeded
- Look for build errors in logs
- Re-deploy by pushing new commit to GitHub

---

## Next Steps

1. **Test the app** - Log in, verify vulnerabilities can be accessed
2. **Copy app URL** - Use in AppScan ASoC demo
3. **Set up GitHub Actions** - For automated DAST scans (optional)
4. **Configure AppScan ASoC** - See README.md for integration steps

---

## Cost Summary

| Service | Cost | Limit |
|---------|------|-------|
| Supabase (Free) | $0/month | 500MB DB, 2 projects |
| Vercel (Free) | $0/month | 100GB bandwidth |
| GitHub (Free) | $0/month | Unlimited repos |
| **Total** | **$0/month** | Perfect for demo |

---

## Support

If stuck:
1. Check Vercel deployment logs
2. Check Supabase database logs
3. Check GitHub Actions logs (if applicable)
4. Message for help

---

**You're ready to demo! 🚀**
