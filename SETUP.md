# FastMCP-x Setup Guide

## Prerequisites
- Node.js 18+ installed
- Access to the Supabase project

## Setup Instructions for New Developers

### 1. Clone the Repository
```bash
git clone <repository-url>
cd FastMCP-x
```

### 2. Frontend Setup

#### Navigate to Frontend Directory
```bash
cd frontend
```

#### Install Dependencies
```bash
npm install
```

#### Configure Environment Variables
1. Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```

2. Contact the project admin to get the Supabase credentials
3. Update `.env.local` with the correct values:
   - `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key

**⚠️ IMPORTANT**: Never commit `.env.local` to git!

### 3. Supabase Configuration

#### Update Supabase Authentication Settings

The other developer needs to configure their **local development URL** in Supabase:

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Navigate to your project → **Authentication** → **URL Configuration**
3. Add your local development URL to **Redirect URLs**:
   ```
   http://localhost:3000/auth/callback
   ```
   
4. If deploying to production, also add:
   ```
   https://your-production-domain.com/auth/callback
   ```

5. Set the **Site URL** to:
   - Development: `http://localhost:3000`
   - Production: `https://your-production-domain.com`

#### Database Setup

Ensure the `profiles` table exists in Supabase (should already be set up):

```sql
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  role text check (role in ('admin','user')) default 'user',
  created_at timestamp default now()
);
```

Enable Row-Level Security policies (should already be configured).

### 4. Run the Application

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### 5. Getting Access

To log in, your email must be added to the `profiles` table by an admin:

1. Contact the project admin
2. Provide your email address
3. Admin will add your email to the `profiles` table
4. You'll receive a magic link to log in

## Troubleshooting

### "Redirected back to login page after clicking magic link"

**Cause**: Supabase redirect URLs not configured properly

**Solution**:
1. Verify `.env.local` has the correct Supabase credentials
2. Check that `http://localhost:3000/auth/callback` is added to **Redirect URLs** in Supabase Dashboard
3. Ensure you're using the same port (3000) as configured in Supabase
4. Clear browser cookies and try again

### "This email is not authorized"

**Cause**: Your email is not in the `profiles` table

**Solution**: Contact an admin to add your email to the system

### "Database error" or authentication failures

**Cause**: Environment variables not set correctly

**Solution**: 
1. Verify `.env.local` exists in the `frontend/` directory
2. Check that both environment variables are set correctly
3. Restart the development server after changing `.env.local`

## File Structure

```
frontend/
├── app/
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts          # Handles magic link authentication
│   ├── login/
│   │   └── page.tsx              # Login page
│   └── dashboard/
│       └── page.tsx              # Protected dashboard page
├── lib/
│   └── supabase/
│       ├── client.ts             # Browser Supabase client
│       └── server.ts             # Server Supabase client
├── middleware.ts                 # Auth middleware for protected routes
├── .env.local                    # Your local environment variables (DO NOT COMMIT)
└── .env.example                  # Template for environment variables
```

## Security Notes

- **Never commit `.env.local`** - it contains sensitive credentials
- The `.env.local` file is already in `.gitignore`
- Only share Supabase credentials through secure channels
- Each developer should have their own `.env.local` file

## Admin Access

First admin setup is done manually via Supabase Dashboard. See `lean_auth_prd.md` for details.
