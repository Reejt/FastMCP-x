# Supabase Database Setup Instructions

## Quick Start

### Step 1: Get Your Correct Service Role Key

**IMPORTANT:** You currently have the WRONG service role key (from a different project). You need the key for project `fmlanqjduftxlktygpwe`.

1. Go to https://app.supabase.com
2. Click on your project: **fmlanqjduftxlktygpwe** (the one you're using)
3. Go to **Settings** → **API**
4. Under "Project API Keys", copy the **Service Role Key** (the secret key)
   - It should be a long JWT token starting with `eyJ...`
   - When decoded, it should show `"ref":"fmlanqjduftxlktygpwe"`
5. Verify it's NOT the same as the anon key (different signatures)

### Step 2: Update Your Server Environment

Edit `server/.env.local` and replace `your-service-role-key-here` with the actual key:

```env
NEXT_PUBLIC_SUPABASE_URL=https://fmlanqjduftxlktygpwe.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (actual key from dashboard)
BRIDGE_SERVER_URL=http://localhost:3001
```

### Step 3: Create Storage Bucket

1. Go to Supabase Dashboard → **Storage**
2. Click **Create new bucket**
3. Name it: `vault_files` (exactly this name)
4. Keep it **Private** (RLS enabled by default)
5. Set file size limit to 50MB or higher

### Step 4: Run Database Migration

1. Go to Supabase Dashboard → **SQL Editor**
2. Click **New Query**
3. Copy the entire contents of `database/migrations/001_initial_schema.sql`
4. Paste it into the SQL Editor
5. Click **Run** (or press Ctrl+Enter)
6. Wait for it to complete (should show all operations successful)

This will create:
- ✅ All required tables (workspaces, file_upload, document_content, etc.)
- ✅ Row-level security (RLS) policies
- ✅ Indexes for performance
- ✅ pgvector extension for similarity search
- ✅ Storage bucket policies

### Step 5: Verify Setup

Run these verification queries in Supabase SQL Editor:

```sql
-- Check all tables are created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('workspaces', 'file_upload', 'document_content', 'document_embeddings', 'chats', 'workspace_instructions', 'profiles');

-- Check RLS policies are enabled
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies 
WHERE tablename IN ('workspaces', 'file_upload', 'document_content', 'document_embeddings', 'chats', 'workspace_instructions', 'profiles')
GROUP BY tablename;

-- Check pgvector is enabled
SELECT extversion FROM pg_extension WHERE extname = 'vector';

-- Check storage policies
SELECT policyname, tablename FROM pg_policies WHERE tablename = 'objects';
```

All queries should return results. If any table is missing, run the migration again.

### Step 6: Test File Upload

1. Restart your backend: `python server/main.py`
2. Restart bridge server: `python bridge_server.py`
3. Try uploading a file from the frontend
4. You should see:
   - ✅ File uploaded to Supabase Storage (no 403 error)
   - ✅ Metadata saved to file_upload table
   - ✅ Content extracted and saved to document_content table
   - ✅ Embeddings generated and saved to document_embeddings table

## Troubleshooting

### Still Getting "Signature Verification Failed"

**Cause:** Service role key is still invalid or from wrong project

**Solution:**
1. Double-check you copied the key from the CORRECT project dashboard
2. Verify the key starts with `eyJ`
3. Verify it's the **Service Role Key**, not the **Anon Key**
4. Make sure you didn't accidentally include spaces or line breaks

### "Could not find table 'public.profiles'"

**Cause:** Migration wasn't run or failed

**Solution:**
1. Go to Supabase SQL Editor
2. Paste the entire `001_initial_schema.sql` file again
3. Check for any error messages
4. Run verification queries to see which tables are missing
5. Run just the missing table creation statements

### RLS Policy Rejection on Insert

**Cause:** Usually a mismatch between the actual user_id and workspace_id

**Solution:**
1. Make sure you're logged in with a valid Supabase user
2. Check that workspace_id matches one of YOUR workspaces
3. Try creating a workspace first before uploading files
4. Check RLS policy conditions match your data

## Environment Variables Summary

### Backend (`server/.env.local`)
```env
# Supabase configuration
NEXT_PUBLIC_SUPABASE_URL=https://fmlanqjduftxlktygpwe.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (FROM DASHBOARD)

# Bridge server
BRIDGE_SERVER_URL=http://localhost:3001
```

### Frontend (`frontend/.env.local`)
```env
NEXT_PUBLIC_SUPABASE_URL=https://fmlanqjduftxlktygpwe.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## What Gets Created

### Tables
- `workspaces` - User project workspaces
- `file_upload` - File metadata
- `document_content` - Extracted text content
- `document_embeddings` - Vector embeddings (pgvector)
- `chats` - Chat message history
- `workspace_instructions` - Custom instructions per workspace
- `profiles` - User profile data

### Storage
- `vault_files` bucket - Private file storage with RLS

### Security
- Row-level security (RLS) on all tables
- Storage policies ensuring users can only access their own files
- Service role key for backend operations (bypasses user RLS)

### Indexes
- Performance indexes on foreign keys and commonly queried columns
- pgvector IVFFLAT index for fast similarity search

## Next Steps After Setup

1. **Create a Workspace** - Users need a workspace before uploading files
2. **Upload a Document** - Test file ingestion
3. **Query the Document** - Test semantic search with pgvector
4. **Set Instructions** - Add custom instructions for each workspace

All done! Your Supabase database is now ready for FastMCP.
