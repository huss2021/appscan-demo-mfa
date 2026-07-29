# Simple Bank: Admin Roles & Permissions

## Overview

Simple Bank supports multiple admin roles to provide fine-grained access control. This document explains each role and its capabilities.

---

## Roles

### 1. **Admin** (Full Access)
**Account:** `admin@appscan.com`  
**Password:** Set via `ADMIN_PASSWORD` environment variable

#### Capabilities:
✅ View all users and their complete profiles  
✅ View IP addresses in traffic logs  
✅ Create new users  
✅ Delete users  
✅ Reset user passwords  
✅ Clear comments (XSS payload storage)  
✅ Clear transactions  
✅ Full reset (comments + transactions)  
✅ Access all admin features  
✅ Toggle IP address visibility in traffic logs  

#### Use Case:
Full administrative access for complete system management, security audits, and incident response.

---

### 2. **Admin Lite** (Limited Access)
**Account:** `admin2@appscan.com`  
**Password:** Set via `ADMIN_LITE_PASSWORD` environment variable

#### Capabilities:
✅ View all users (but names/roles only - no IP addresses anywhere)  
❌ **CANNOT** view ANY IP addresses (hidden as `***hidden***` in users list)  
❌ **CANNOT** view IP addresses in traffic logs (automatic masking)  
❌ **CANNOT** delete admin or admin_lite users  
❌ **CANNOT** reset passwords for admin or admin_lite users  
✅ Can delete customer users only  
✅ Can reset customer passwords only  
✅ Create new users  
✅ Clear comments individually  
✅ Clear transactions individually  
❌ **CANNOT** perform FULL RESET (comments + transactions together)  
✅ Access admin features EXCEPT those above  
❌ Cannot toggle IP visibility (toggle hidden)  

#### Use Case:
Administrative access for operational tasks without access to sensitive IP address data or admin user management. Ideal for:
- Support teams handling customer issues
- Operational staff managing demo environments
- Compliance-conscious deployments where IP collection is restricted (GDPR)
- Training environments with limited data exposure
- Segregated duty scenarios (security team vs. ops team)

#### Admin Lite Restrictions Summary:
1. **No IP visibility anywhere** - All IP addresses masked in users table and traffic logs
2. **Cannot manage admins** - Cannot delete or modify admin/admin_lite users
3. **No full reset** - Can only clear comments OR transactions individually, not both
4. **Limited user management** - Can only manage customer users

---

### 3. **Customer** (Standard User)
**Default Role:** All new users created without explicit role are `customer`

#### Capabilities:
✅ Login to dashboard  
✅ View own account and transactions  
✅ Transfer funds  
✅ Post comments  
✅ Enable/disable MFA  
✅ Generate API keys  
❌ No admin access  

#### Use Case:
Regular application user with standard financial application features.

---

## Role-Based Access Control

### Traffic Logs (IP Address Visibility)

| Role | IP Visibility | Toggle Control |
|------|---------------|-----------------|
| **Admin** | ✅ Full IP addresses shown | ✅ Can toggle on/off |
| **Admin Lite** | ❌ Masked as `***hidden***` | ❌ Toggle hidden from UI |
| **Customer** | ❌ No access | ❌ Not applicable |

### Users Management

| Action | Admin | Admin Lite | Customer |
|--------|-------|-----------|----------|
| View all users | ✅ | ✅ | ❌ |
| View user roles | ✅ | ✅ | ❌ |
| View user IPs | ✅ | ❌ | ❌ |
| Create user | ✅ | ✅ | ❌ |
| Delete user | ✅ | ✅ (customers only) | ❌ |
| Delete admin/admin_lite | ✅ | ❌ | ❌ |
| Reset password | ✅ | ✅ (customers only) | ❌ |
| Reset admin password | ✅ | ❌ | ❌ |

### Data Management

| Action | Admin | Admin Lite | Customer |
|--------|-------|-----------|----------|
| Clear comments | ✅ | ✅ | ❌ |
| Clear transactions | ✅ | ✅ | ❌ |
| Full reset (both) | ✅ | ❌ | ❌ |

### IP Address Visibility

| Location | Admin | Admin Lite | Customer |
|----------|-------|-----------|----------|
| Users table | ✅ Real IP | ❌ `***hidden***` | ❌ No access |
| Traffic logs | ✅ Real IP | ❌ `***hidden***` | ❌ No access |
| Toggle control | ✅ Visible | ❌ Hidden | ❌ No access |

---

## Database Schema: Role Column

### users table

```sql
ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'customer';

-- Valid values:
-- 'admin'       → Full administrative access
-- 'admin_lite'  → Administrative access without IP visibility
-- 'customer'    → Standard user (default)
```

### Updating User Roles

```sql
-- Promote customer to admin
UPDATE users SET role = 'admin' WHERE email = 'user@example.com';

-- Demote to admin_lite
UPDATE users SET role = 'admin_lite' WHERE email = 'user@example.com';

-- Demote to customer
UPDATE users SET role = 'customer' WHERE email = 'user@example.com';
```

---

## Setup Instructions

### Step 1: Run Migration

Go to **Supabase SQL Editor** and paste:

```sql
ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'customer';
CREATE INDEX idx_users_role ON users(role);
UPDATE users SET role = 'admin' WHERE email = 'admin@appscan.com';
```

### Step 2: Create Admin Accounts

Run the setup script:

```bash
# With custom passwords
ADMIN_PASSWORD=[your-admin-password] ADMIN_LITE_PASSWORD=[your-admin-lite-password] node setup-admin.js

# With auto-generated passwords
node setup-admin.js
```

The script will output SQL to paste into Supabase:

```sql
-- ADMIN user (full access)
INSERT INTO users (id, email, password, full_name, totp_enabled, created_at, registration_ip, role)
VALUES (
  '[admin-id]',
  'admin@appscan.com',
  '[hashed-password]',
  'Admin User',
  false,
  now(),
  '127.0.0.1',
  'admin'
);
...

-- ADMIN_LITE user (no IP visibility)
INSERT INTO users (id, email, password, full_name, totp_enabled, created_at, registration_ip, role)
VALUES (
  '[admin-lite-id]',
  'admin2@appscan.com',
  '[hashed-password]',
  'Admin Lite User',
  false,
  now(),
  '127.0.0.1',
  'admin_lite'
);
...
```

### Step 3: Set Environment Variables

In Railway environment variables:

```
ADMIN_PASSWORD=[your-secure-admin-password]
ADMIN_LITE_PASSWORD=[your-secure-admin-lite-password]
```

**Note:** Use strong, unique passwords different from any example credentials in documentation.

---

## Admin Panel Features

### Users Tab
Displays all users with a **Role** column:
- 👑 **Admin** (green badge)
- ⭐ **Admin Lite** (yellow badge)
- 👤 **Customer** (gray badge)

### Traffic Logs Tab

#### For Admin Users:
✅ IP toggle visible and functional  
✅ Can enable/disable IP address display  
✅ IP addresses shown or hidden based on toggle state  
✅ Toggle preference saved to browser localStorage  

#### For Admin Lite Users:
❌ IP toggle completely hidden  
❌ IP column display cannot be changed  
❌ All IP addresses automatically masked as `***hidden***`  

---

## API Endpoints

### Admin Check
```
GET /api/admin/check
```

**Response:**
```json
{
  "success": true,
  "role": "admin",
  "canSeeIP": true
}
```

Or for admin_lite:
```json
{
  "success": true,
  "role": "admin_lite",
  "canSeeIP": false
}
```

### Admin Users
```
GET /api/admin/users
```

**Response includes role for each user:**
```json
[
  {
    "id": "...",
    "email": "admin@appscan.com",
    "role": "admin",
    "full_name": "Admin User",
    ...
  },
  {
    "id": "...",
    "email": "admin2@appscan.com",
    "role": "admin_lite",
    "full_name": "Admin Lite User",
    ...
  },
  {
    "id": "...",
    "email": "customer@example.com",
    "role": "customer",
    "full_name": "Customer User",
    ...
  }
]
```

### Traffic Logs
```
GET /api/admin/traffic
```

**Response depends on admin role:**
- Admin: Full IP addresses
- Admin Lite: IP masked as `***hidden***`

---

## Security Considerations

### IP Address Privacy

Admin Lite role is designed for scenarios requiring:
- GDPR compliance (European operations)
- Privacy-first deployments
- Regulatory restrictions on IP logging
- Separation of duties (operational vs. security teams)

### Role-Based Authorization

All admin endpoints check the user's role:
1. User authentication → verified via bcrypt password
2. Role verification → checked against `users.role` column
3. Feature authorization → role determines feature access
4. IP visibility → role gates IP address display

### Audit Trail

When auditing admin actions:
- View **Users > Recent Change** column to see who made changes
- View **Traffic Logs** with proper role authorization

---

## Examples

### Scenario 1: GDPR-Compliant Deployment

Deploy with only `admin_lite` users in European regions:

```sql
-- Create regional support admin (no IP access)
INSERT INTO users (email, password, role, ...)
VALUES ('eu-support@company.com', ..., 'admin_lite', ...);
```

### Scenario 2: Segregated Duties

```sql
-- Security team (full admin access)
INSERT INTO users (email, password, role, ...)
VALUES ('security@company.com', ..., 'admin', ...);

-- Support team (admin_lite, no IP access)
INSERT INTO users (email, password, role, ...)
VALUES ('support@company.com', ..., 'admin_lite', ...);
```

### Scenario 3: Demo Environment

Create admin_lite for customer demos:

```bash
# Support customer demo with IP restrictions
ADMIN_LITE_PASSWORD=DemoPass123! node setup-admin.js
# Create admin2@appscan.com with admin_lite role
```

---

## Troubleshooting

### Admin Lite user can't see traffic logs

**Problem:** No logs displayed  
**Solution:** Verify user role is set to `admin_lite` in database:
```sql
SELECT email, role FROM users WHERE email = 'admin2@appscan.com';
```

### IP addresses still showing for admin_lite

**Problem:** IP addresses visible even though role is admin_lite  
**Solution:** Refresh browser and clear localStorage:
```javascript
// In browser console
localStorage.removeItem('showIPAddresses');
location.reload();
```

### Can't access admin panel

**Problem:** 403 error "Admin only"  
**Solution:** Verify user role is admin or admin_lite:
```sql
UPDATE users SET role = 'admin_lite' WHERE email = 'your-email@example.com';
```

---

## Summary

| Feature | Admin | Admin Lite | Customer |
|---------|-------|-----------|----------|
| **Access Admin Panel** | ✅ | ✅ | ❌ |
| **View Users** | ✅ | ✅ | ❌ |
| **View IP Addresses** | ✅ | ❌ (all masked) | ❌ |
| **Toggle IP Visibility** | ✅ | ❌ (hidden) | ❌ |
| **Create Users** | ✅ | ✅ | ❌ |
| **Delete Users** | ✅ (all) | ✅ (customers only) | ❌ |
| **Delete Admins** | ✅ | ❌ | ❌ |
| **Reset Passwords** | ✅ (all) | ✅ (customers only) | ❌ |
| **Reset Admin Passwords** | ✅ | ❌ | ❌ |
| **Full Reset** | ✅ | ❌ | ❌ |
| **Clear Comments** | ✅ | ✅ | ❌ |
| **Clear Transactions** | ✅ | ✅ | ❌ |
| **Use App Features** | ✅ | ✅ | ✅ |

---

**Role-based access control implemented for fine-grained permission management and regulatory compliance.** 🔐
