# Supabase Configuration Checklist

## Required Supabase Settings

### Authentication → URL Configuration

#### Site URL
The base URL of your application:
- **Development**: `http://localhost:3000`
- **Production**: `https://your-domain.com`

#### Redirect URLs
URLs that Supabase is allowed to redirect to after authentication:

**Development**:
```
http://localhost:3000/auth/callback
```

**Production**:
```
https://your-domain.com/auth/callback
```

**If using custom port** (e.g., 3001):
```
http://localhost:3001/auth/callback
```

#### How to Configure:

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Authentication** (left sidebar)
4. Click on **URL Configuration**
5. Add the callback URLs to **Redirect URLs** field
6. Set the **Site URL** to your base application URL
7. Click **Save**

### Email Templates

Ensure the email template includes the correct magic link format:

1. Navigate to **Authentication** → **Email Templates**
2. Select **Magic Link**
3. Ensure the template contains:
   ```html
   {{ .ConfirmationURL }}
   ```

This will automatically generate the correct callback URL.

### Authentication Providers

Ensure **Email** provider is enabled:

1. Navigate to **Authentication** → **Providers**
2. Find **Email** in the list
3. Ensure it's **Enabled**
4. **Enable email confirmations** can be OFF for magic links (it's for email/password signup)

## Database Setup

### Profiles Table

Ensure this table exists:

```sql
-- Run in SQL Editor
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  role text check (role in ('admin','user')) default 'user',
  created_at timestamp default now()
);
```

### Row Level Security (RLS)

Ensure RLS is enabled and policies are set:

```sql
-- Enable RLS
alter table profiles enable row level security;

-- Users can view their own profile
create policy "Users can view own profile"
on profiles for select
using (auth.uid() = id);

-- Users can update their own profile
create policy "Users can update own profile"
on profiles for update
using (auth.uid() = id);
```

## Adding New Users

### Method 1: Via SQL (Recommended for existing auth users)

```sql
-- If user already exists in auth.users
INSERT INTO profiles (id, email, role)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'user@example.com'),
  'user@example.com',
  'user'
);
```

### Method 2: Manual Entry (For new users)

1. First, the user must attempt to log in (which will create an auth.users record if email is not confirmed required)
2. Or, create the user manually:

```sql
-- This creates both auth.users and profiles entries
-- Note: User will still need to use magic link to set session
INSERT INTO profiles (id, email, role)
VALUES (
  gen_random_uuid(),
  'user@example.com',
  'user'
);
```

### Method 3: Via Supabase Dashboard

1. Navigate to **Authentication** → **Users**
2. Click **Add User**
3. Enter email (password is optional for magic link only)
4. User will be created in `auth.users`
5. Manually add entry to `profiles` table via SQL Editor

## Environment Variables

Required in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### Where to Find These Values:

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Project Settings** (gear icon) → **API**
4. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Testing Authentication Flow

### Manual Test Steps:

1. **Clear all auth state**:
   - Open browser DevTools
   - Application → Cookies → Delete all for localhost
   - Application → Local Storage → Clear

2. **Test login**:
   - Navigate to `http://localhost:3000/login`
   - Enter an email that exists in `profiles` table
   - Click "Send Login Link"
   - Check email for magic link

3. **Verify email**:
   - Magic link should look like:
     ```
     http://localhost:3000/auth/callback?token_hash=...&type=magiclink
     ```
   - Or with code parameter:
     ```
     http://localhost:3000/auth/callback?code=...
     ```

4. **Click the link**:
   - Should redirect to `/dashboard`
   - Check DevTools → Application → Cookies
   - Should see Supabase auth cookies set

5. **Test protected routes**:
   - Try accessing `/dashboard` directly
   - Should remain on dashboard if authenticated
   - If not authenticated, should redirect to `/login`

## Troubleshooting

### "Invalid redirect URL" error

**Cause**: The callback URL is not whitelisted in Supabase

**Solution**: Add the exact URL (including port) to Redirect URLs in Supabase Dashboard

### Magic link redirects to login page

**Cause**: Missing `/auth/callback` route or incorrect implementation

**Solution**: 
1. Verify `frontend/app/auth/callback/route.ts` exists
2. Check that `middleware.ts` is in `frontend/` directory
3. Restart dev server

### "This email is not authorized"

**Cause**: Email not in `profiles` table

**Solution**: Add email to `profiles` table via SQL:
```sql
INSERT INTO profiles (id, email, role)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'user@example.com'),
  'user@example.com',
  'user'
);
```

### Session not persisting

**Cause**: Middleware not properly refreshing session

**Solution**:
1. Verify `middleware.ts` is calling `supabase.auth.getUser()`
2. Check that cookies are being set in response
3. Ensure browser allows cookies for localhost

### Different port not working

**Cause**: Redirect URL doesn't match the port

**Solution**: If using port 3001 instead of 3000:
1. Add `http://localhost:3001/auth/callback` to Supabase Redirect URLs
2. Update Site URL to `http://localhost:3001`
3. Restart dev server on the correct port

## Security Best Practices

1. **Never commit `.env.local`** - it contains sensitive keys
2. **Use Row Level Security** - always enable RLS on profiles table
3. **Validate emails** - ensure only authorized emails can access the system
4. **Rotate keys** - if anon key is exposed, rotate it in Supabase Dashboard
5. **Use HTTPS** - in production, always use HTTPS for redirect URLs

## Quick Reference Commands

```bash
# Pull latest code
git pull origin main

# Install dependencies
cd frontend
npm install

# Start dev server
npm run dev

# Check if server is running on correct port
# Should see: http://localhost:3000
```

```sql
-- Check if email exists in profiles
SELECT * FROM profiles WHERE email = 'user@example.com';

-- Check auth.users
SELECT id, email, created_at FROM auth.users WHERE email = 'user@example.com';

-- Add new user to profiles
INSERT INTO profiles (id, email, role)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'user@example.com'),
  'user@example.com',
  'user'
);
```

---

**Last Updated**: November 7, 2025
