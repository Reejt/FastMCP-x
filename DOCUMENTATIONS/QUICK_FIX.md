# 🚀 Quick Fix for Magic Link Login Issue

## What to Do Right Now

### 1. Pull Latest Code
```bash
git pull origin main
cd frontend
npm install
```

### 2. Configure Supabase (CRITICAL!)
Go to [Supabase Dashboard](https://app.supabase.com) → Your Project → **Authentication** → **URL Configuration**

Add this to **Redirect URLs**:
```
http://localhost:3000/auth/callback
```

Click **Save**.

### 3. Verify Environment File
Check that `frontend/.env.local` exists with:
```env
NEXT_PUBLIC_SUPABASE_URL=https://fmlanqjduftxlktygpwe.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Restart Server
```bash
npm run dev
```

### 5. Test Login
1. Go to `http://localhost:3000/login`
2. Enter your email
3. Check email and click the magic link
4. ✅ You should now reach the dashboard!

## What Was Fixed

✅ Added `/auth/callback` route to handle magic links  
✅ Added middleware for session management  
✅ Updated login redirect URL  
✅ Created setup documentation  

## Still Not Working?

### Clear Browser Data
1. Open DevTools (F12)
2. Application tab → Storage → Clear site data
3. Try login again

### Verify Your Email is Authorized
Your email must be in the `profiles` table. Ask an admin to run:

```sql
INSERT INTO profiles (id, email, role)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'your-email@example.com'),
  'your-email@example.com',
  'user'
);
```

### Check Port Number
If you're using a different port (e.g., 3001), add to Supabase:
```
http://localhost:3001/auth/callback
```

## Need More Help?

Read the detailed guides:
- **MAGIC_LINK_FIX.md** - Complete explanation of the fix
- **SUPABASE_CONFIG.md** - Supabase configuration details
- **SETUP.md** - Full setup guide

---

**TL;DR**: Pull code, add `http://localhost:3000/auth/callback` to Supabase Redirect URLs, restart server, login should work! 🎉
