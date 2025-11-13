# Complete Supabase Integration Guide

> **Consolidated Documentation**: This guide combines all Supabase-related setup, configuration, and troubleshooting for the FastMCP-x project.

**Last Updated**: November 12, 2025

---

## Table of Contents
1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Authentication Setup](#authentication-setup)
4. [Database Setup](#database-setup)
5. [Storage Integration](#storage-integration)
6. [Environment Configuration](#environment-configuration)
7. [Implementation Details](#implementation-details)
8. [Testing & Verification](#testing--verification)
9. [Troubleshooting](#troubleshooting)
10. [Security Best Practices](#security-best-practices)

---

## Overview

FastMCP-x integrates with Supabase for:
- **Authentication**: Magic link email authentication
- **Database**: User profiles and document metadata storage
- **Storage**: Cloud-based file storage for uploaded documents

### Key Features
- ✅ Multi-user support with isolated document storage
- ✅ Row Level Security (RLS) for data protection
- ✅ Magic link authentication (no passwords)
- ✅ Real-time document synchronization

---

## Quick Start

### Prerequisites
- Supabase account (free tier works)
- Node.js 18+
- Python 3.9+
- Git

### 5-Minute Setup

1. **Create Supabase Project**
   ```bash
   # Go to https://app.supabase.com
   # Click "New Project"
   # Note your Project URL and API keys
   ```

2. **Install Dependencies**
   ```powershell
   # Backend
   pip install supabase python-dotenv
   
   # Frontend (if needed)
   cd frontend
   npm install
   ```

3. **Configure Environment Variables**
   
   **Backend** (root directory `.env`):
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```
   
   **Frontend** (`frontend/.env.local`):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

4. **Run Database Migrations**
   ```sql
   -- Copy and run supabase/vault_setup.sql in Supabase SQL Editor
   ```

5. **Create Storage Bucket**
   - Go to Storage in Supabase Dashboard
   - Create bucket named `vault_files` (private)

6. **Start the Application**
   ```powershell
   python server/main.py
   # Should see: ✅ Supabase client initialized successfully
   ```

---

## Authentication Setup

### 1. Enable Email Provider

1. Go to **Supabase Dashboard** → **Authentication** → **Providers**
2. Find **Email** provider
3. Ensure it's **Enabled**
4. Save changes

### 2. Configure URL Settings

Navigate to **Authentication** → **URL Configuration**

#### Site URL
Set your application's base URL:
- **Development**: `http://localhost:3000`
- **Production**: `https://your-domain.com`

#### Redirect URLs (Add all that apply)
```
http://localhost:3000/auth/callback
http://localhost:3001/auth/callback
https://your-domain.com/auth/callback
```

**Important**: Include the exact port number you're using!

### 3. Email Templates

1. Navigate to **Authentication** → **Email Templates**
2. Select **Magic Link** template
3. Verify it contains: `{{ .ConfirmationURL }}`
4. Customize the template if needed (optional)

### 4. Create User Profiles

After a user signs up via magic link, they'll exist in `auth.users` but need a profile:

```sql
-- Add user to profiles table
INSERT INTO profiles (id, email, role)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'user@example.com'),
  'user@example.com',
  'user'
);
```

Or via Dashboard:
1. **Authentication** → **Users** → **Add User**
2. Enter email
3. Manually add profile entry via SQL Editor

---

## Database Setup

### Required Tables

Run this SQL in **Supabase SQL Editor**:

```sql
-- ============================================
-- 1. Enable UUID Extension
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 2. Create Profiles Table
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role TEXT CHECK (role IN ('admin', 'user')) DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profiles RLS Policies
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- ============================================
-- 3. Create Vault Documents Table
-- ============================================
CREATE TABLE IF NOT EXISTS vault_documents (
    document_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT,
    file_type TEXT,
    upload_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vault_documents_user_id 
    ON vault_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_documents_upload_timestamp 
    ON vault_documents(upload_timestamp DESC);

-- Enable RLS on vault_documents
ALTER TABLE vault_documents ENABLE ROW LEVEL SECURITY;

-- Vault Documents RLS Policies
CREATE POLICY "Users can view own documents"
    ON vault_documents FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
    ON vault_documents FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
    ON vault_documents FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
    ON vault_documents FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- 4. Create Triggers
-- ============================================

-- Auto-update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_vault_documents_updated_at
    BEFORE UPDATE ON vault_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. Table Comments
-- ============================================
COMMENT ON TABLE profiles IS 'User profile information with roles';
COMMENT ON TABLE vault_documents IS 'Stores user uploaded documents with metadata and access control';
```

### Verify Database Setup

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND table_name IN ('profiles', 'vault_documents');

-- Check RLS policies
SELECT policyname, tablename, cmd 
FROM pg_policies 
WHERE tablename IN ('profiles', 'vault_documents');

-- View profiles
SELECT id, email, role, created_at FROM profiles;

-- View documents
SELECT document_id, user_id, file_name, upload_timestamp 
FROM vault_documents 
ORDER BY upload_timestamp DESC 
LIMIT 10;
```

---

## Storage Integration

### 1. Create Storage Bucket

1. Navigate to **Storage** in Supabase Dashboard
2. Click **New Bucket**
3. Settings:
   - **Name**: `vault_files` (exact name, no spaces)
   - **Public**: ❌ OFF (keep private)
   - **File size limit**: 50MB (or customize)
4. Click **Create Bucket**

### 2. Configure Storage Policies

After creating the bucket, add these policies:

```sql
-- ============================================
-- Storage Bucket Policies for vault_files
-- ============================================

-- Policy: Users can upload files to their own folder
CREATE POLICY "Users can upload own files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'vault_files' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can view their own files
CREATE POLICY "Users can view own files"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'vault_files' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can update their own files
CREATE POLICY "Users can update own files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'vault_files' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can delete their own files
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'vault_files' AND
    (storage.foldername(name))[1] = auth.uid()::text
);
```

### 3. File Organization

Files are automatically organized by user:

```
vault_files/
├── <user_id_1>/
│   ├── 20250112_143022_document1.pdf
│   ├── 20250112_143045_report.docx
│   └── 20250112_150000_data.xlsx
├── <user_id_2>/
│   ├── 20250112_160000_presentation.pptx
│   └── ...
```

---

## Environment Configuration

### Backend Configuration

**File**: Root directory `.env` (create from `.env.example`)

```env
# Supabase Configuration (Backend)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Tavily API (Optional - for web search)
TAVILY_API_KEY=your-tavily-api-key

# Ollama Configuration (Optional)
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
```

**Important**: Use **service_role** key for backend (not anon key!)

### Frontend Configuration

**File**: `frontend/.env.local` (create from `frontend/.env.example`)

```env
# Supabase Configuration (Frontend)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Bridge Server URL
NEXT_PUBLIC_BRIDGE_SERVER_URL=http://localhost:3001
```

### Where to Find API Keys

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Project Settings** (⚙️ gear icon) → **API**
4. Copy the following:

| Key | Environment Variable | Use Case |
|-----|---------------------|----------|
| Project URL | `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Both frontend & backend |
| anon public | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend only (with RLS) |
| service_role | `SUPABASE_SERVICE_ROLE_KEY` | Backend only (bypasses RLS) |

**⚠️ Security Warning**: 
- **Never** expose `service_role` key in frontend code
- **Never** commit `.env` files to git
- **Always** add `.env` and `.env.local` to `.gitignore`

---

## Implementation Details

### Document Ingestion Flow

```mermaid
User Upload → Frontend API → Bridge Server → MCP Client → Document Ingestion
                                                              ↓
                                                    Supabase Storage Upload
                                                              ↓
                                                    Database Metadata Insert
                                                              ↓
                                                    Text Extraction
                                                              ↓
                                                    Embedding Generation
```

**Step-by-step:**

1. **User Action**: Uploads file via `/vault` page
2. **Frontend API** (`/api/vault/upload/route.ts`):
   - Authenticates user with Supabase
   - Validates file (type, size)
   - Encodes file as base64
   - Sends to bridge server with `user_id`
3. **Bridge Server** (`bridge_server.py`):
   - Receives file + `user_id`
   - Creates temporary file
   - Calls MCP client with file path and `user_id`
4. **MCP Client** (`client/fast_mcp_client.py`):
   - Forwards request to MCP server
   - Passes `user_id` parameter
5. **Document Ingestion** (`server/document_ingestion.py`):
   - **Supabase Path** (if configured):
     - Uploads file to `vault_files/{user_id}/{timestamp}_{filename}`
     - Inserts metadata to `vault_documents` table
     - Extracts text content
     - Stores in-memory for semantic search
     - Updates embeddings
   - **Fallback Path** (if Supabase unavailable):
     - Copies file to local `storage/` directory
     - Extracts text and continues processing

### Document Loading (Server Startup)

When the FastMCP server starts:

1. Checks for Supabase credentials
2. If available:
   - Queries `vault_documents` table for all documents
   - Downloads each file from Supabase Storage
   - Extracts text content (using temporary files)
   - Loads into in-memory `documents` list
   - Builds/loads embeddings for semantic search
3. If unavailable:
   - Falls back to loading from local `storage/` directory

### API Endpoints

#### POST `/api/vault/upload`
Upload a document to the vault.

**Request**: `multipart/form-data` with `file` field

**Response**:
```json
{
  "success": true,
  "message": "File uploaded and processed successfully",
  "document": {
    "document_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "123e4567-e89b-12d3-a456-426614174000",
    "file_name": "report.pdf",
    "file_path": "123e4567.../20250112_143022_report.pdf",
    "file_size": 245678,
    "file_type": "application/pdf",
    "upload_timestamp": "2025-11-12T14:30:22Z"
  }
}
```

#### GET `/api/vault/upload`
List all documents for authenticated user.

**Response**:
```json
{
  "success": true,
  "documents": [
    {
      "document_id": "550e8400-e29b-41d4-a716-446655440000",
      "file_name": "report.pdf",
      "file_size": 245678,
      "file_type": "application/pdf",
      "upload_timestamp": "2025-11-12T14:30:22Z",
      "metadata": {
        "original_name": "report.pdf",
        "processed": true,
        "character_count": 12500
      }
    }
  ],
  "count": 1
}
```

### Supported File Types

- **Documents**: `.txt`, `.md`, `.pdf`, `.doc`, `.docx`
- **Spreadsheets**: `.xls`, `.xlsx`, `.csv`
- **Presentations**: `.ppt`, `.pptx`
- **Images**: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp` (metadata only)

### Fallback Behavior

The system gracefully degrades if Supabase is unavailable:

| Scenario | Behavior |
|----------|----------|
| No credentials | Uses local `storage/` directory |
| Connection fails | Falls back to local storage |
| Bucket doesn't exist | Error logged, uses local storage |
| RLS policy error | Error logged, uses local storage |

Console output indicates which storage method is active:
- `✅ Supabase client initialized successfully` - Using Supabase
- `⚠️ Supabase credentials not found...` - Using local storage

---

## Testing & Verification

### 1. Verify Environment Setup

**Backend**:
```powershell
# Start server
python server/main.py

# Expected output:
# ✅ Supabase client initialized successfully
# 📂 Loading documents from Supabase...
# ✅ Documents loaded from Supabase: X
```

**Frontend**:
```powershell
cd frontend
npm run dev

# Open http://localhost:3000
```

### 2. Test Authentication Flow

**Step 1: Clear browser state**
- Open DevTools → Application → Storage
- Clear all cookies and local storage

**Step 2: Test login**
1. Navigate to `http://localhost:3000/login`
2. Enter email address (must exist in `profiles` table)
3. Click "Send Login Link"
4. Check email for magic link

**Step 3: Click magic link**
- Should redirect to `http://localhost:3000/auth/callback?token_hash=...`
- Then auto-redirect to `/dashboard`

**Step 4: Verify session**
- DevTools → Application → Cookies
- Should see Supabase auth cookies

**Step 5: Test protected routes**
- Navigate to `/dashboard` - should stay
- Log out
- Try `/dashboard` again - should redirect to `/login`

### 3. Test Document Upload

**Step 1: Navigate to Vault**
```
http://localhost:3000/vault
```

**Step 2: Upload a test file**
- Click "Upload Document" or drag-and-drop
- Select a `.pdf`, `.docx`, or `.txt` file
- Click upload

**Step 3: Verify in Supabase Dashboard**

**Storage Check**:
1. Go to **Storage** → `vault_files`
2. Navigate to your user folder (UUID)
3. Should see uploaded file with timestamp prefix

**Database Check**:
1. Go to **Table Editor** → `vault_documents`
2. Should see new row with file metadata
3. Verify `user_id` matches your user

**Step 4: Verify document is searchable**
1. Go to `/dashboard`
2. Ask a question about the uploaded document
3. Should get AI-generated answer based on document content

### 4. Test Document Loading

**Restart the server**:
```powershell
# Stop server (Ctrl+C)
python server/main.py
```

**Expected console output**:
```
✅ Supabase client initialized successfully
📂 Loading documents from Supabase...
✅ Documents loaded from Supabase: 1
Loaded precomputed embeddings from disk.
```

### 5. Database Queries for Verification

```sql
-- Check your user ID
SELECT id, email FROM auth.users WHERE email = 'your@email.com';

-- Check profile exists
SELECT * FROM profiles WHERE email = 'your@email.com';

-- List all your documents
SELECT 
    file_name, 
    file_size, 
    file_type, 
    upload_timestamp 
FROM vault_documents 
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your@email.com')
ORDER BY upload_timestamp DESC;

-- Count documents per user
SELECT 
    p.email, 
    COUNT(vd.document_id) as document_count 
FROM profiles p
LEFT JOIN vault_documents vd ON p.id = vd.user_id
GROUP BY p.email;
```

---

## Troubleshooting

### Authentication Issues

#### "Invalid redirect URL" Error

**Symptoms**: Magic link shows error page

**Cause**: Callback URL not whitelisted in Supabase

**Solution**:
1. Go to **Authentication** → **URL Configuration**
2. Add exact URL to **Redirect URLs**: `http://localhost:3000/auth/callback`
3. Include port number if using non-default port
4. Save and retry

#### Magic Link Redirects to Login

**Symptoms**: Clicking magic link goes back to login page

**Cause**: Missing or incorrect callback route

**Solution**:
1. Verify `frontend/app/auth/callback/route.ts` exists
2. Check `middleware.ts` is in `frontend/` directory (not `app/`)
3. Restart dev server: `npm run dev`

#### "Session not persisting"

**Symptoms**: Login works but refreshing logs you out

**Cause**: Middleware not refreshing session properly

**Solution**:
1. Check `middleware.ts` calls `supabase.auth.getUser()`
2. Verify cookies are being set (DevTools → Application → Cookies)
3. Ensure browser allows cookies for localhost
4. Check `middleware.ts` uses `updateSession()` helper

#### "This email is not authorized"

**Symptoms**: Cannot log in even with correct email

**Cause**: Email not in `profiles` table

**Solution**:
```sql
-- First, check if user exists in auth.users
SELECT id, email FROM auth.users WHERE email = 'user@example.com';

-- If exists, add to profiles
INSERT INTO profiles (id, email, role)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'user@example.com'),
  'user@example.com',
  'user'
);

-- If doesn't exist, user needs to sign up first
```

### Database Issues

#### "relation 'vault_documents' does not exist"

**Cause**: Database migration not run

**Solution**:
1. Open Supabase SQL Editor
2. Copy entire SQL script from [Database Setup](#database-setup) section
3. Run it
4. Verify: `SELECT * FROM vault_documents LIMIT 1;`

#### "RLS policy violation" / "permission denied"

**Cause**: Row Level Security preventing access

**Solution**:
```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'vault_documents';

-- Check policies exist
SELECT * FROM pg_policies WHERE tablename = 'vault_documents';

-- If policies missing, re-run policy creation SQL
```

#### "Cannot insert into vault_documents"

**Cause**: User not authenticated or user_id mismatch

**Solution**:
1. Verify user is logged in (check cookies)
2. Check `user_id` in request matches authenticated user
3. Verify RLS policies allow INSERT for user's own records

### Storage Issues

#### "Bucket 'vault_files' does not exist"

**Cause**: Storage bucket not created

**Solution**:
1. Go to **Storage** in Supabase Dashboard
2. Click **New Bucket**
3. Name: `vault_files` (exact spelling, no spaces)
4. Set as **Private**
5. Create bucket

#### "Failed to upload file to storage"

**Cause**: Missing storage policies or incorrect bucket permissions

**Solution**:
1. Verify bucket exists and is private
2. Run storage policies SQL from [Storage Integration](#storage-integration)
3. Check user is authenticated
4. Verify file path format: `{user_id}/{timestamp}_{filename}`

#### Files not loading on startup

**Cause**: Service role key doesn't have storage access

**Solution**:
1. Verify using **service_role** key (not anon key) in backend `.env`
2. Check console for specific error messages
3. Verify bucket name is `vault_files` (no typo)
4. Test with simpler query: `supabase.table('vault_documents').select('*').limit(1).execute()`

### Backend Issues

#### "Supabase credentials not found"

**Symptoms**: Console shows warning about missing credentials

**Cause**: `.env` file missing or not loaded

**Solution**:
```powershell
# 1. Verify .env file exists in root directory
Get-Content .env

# 2. Verify python-dotenv is installed
pip install python-dotenv

# 3. Check .env contains correct variables
# Should have:
# SUPABASE_URL=https://...
# SUPABASE_SERVICE_ROLE_KEY=...

# 4. Restart server
python server/main.py
```

#### "Failed to initialize Supabase client"

**Symptoms**: Error on server startup

**Cause**: Invalid credentials or connection issue

**Solution**:
1. Verify `SUPABASE_URL` includes `https://`
2. Verify `SUPABASE_SERVICE_ROLE_KEY` is the service role (not anon)
3. Test credentials manually:
   ```python
   from supabase import create_client
   import os
   
   url = os.getenv("SUPABASE_URL")
   key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
   
   print(f"URL: {url}")
   print(f"Key: {key[:20]}...")  # Show first 20 chars
   
   client = create_client(url, key)
   result = client.table('profiles').select('*').limit(1).execute()
   print(f"Connection successful: {result}")
   ```

#### "Module 'supabase' not found"

**Cause**: Supabase Python client not installed

**Solution**:
```powershell
pip install supabase python-dotenv
# Or reinstall all dependencies:
pip install -r requirements.txt
```

### Port and Connection Issues

#### Different port not working (3001 instead of 3000)

**Cause**: Redirect URL doesn't match actual port

**Solution**:
1. Update Supabase **Redirect URLs**: `http://localhost:3001/auth/callback`
2. Update **Site URL**: `http://localhost:3001`
3. Update `frontend/.env.local`:
   ```env
   NEXT_PUBLIC_BRIDGE_SERVER_URL=http://localhost:3001
   ```
4. Restart server: `npm run dev -- -p 3001`

#### "CORS error" when calling API

**Cause**: Bridge server not allowing frontend origin

**Solution**:
1. Check `bridge_server.py` CORS configuration includes your frontend URL
2. Verify bridge server is running: `http://localhost:3001`
3. Check frontend is using correct bridge server URL in `.env.local`

---

## Security Best Practices

### 1. Environment Variables

✅ **DO**:
- Keep `.env` and `.env.local` in `.gitignore`
- Use different keys for development and production
- Rotate keys if exposed
- Use service role key only in backend

❌ **DON'T**:
- Commit `.env` files to git
- Expose service role key in frontend
- Share keys in public forums/issues
- Use same keys across multiple projects

### 2. Row Level Security (RLS)

✅ **DO**:
- Enable RLS on all tables with user data
- Test policies with different users
- Use `auth.uid()` for user-specific policies
- Review policies regularly

❌ **DON'T**:
- Disable RLS in production
- Use `USING (true)` policies (allows all access)
- Bypass RLS with service role in user-facing features

### 3. Storage Policies

✅ **DO**:
- Organize files by user ID
- Set appropriate file size limits
- Use private buckets for user data
- Implement file type validation

❌ **DON'T**:
- Make user file buckets public
- Allow unlimited file sizes
- Skip file validation
- Use predictable file paths

### 4. Authentication

✅ **DO**:
- Use HTTPS in production
- Set session expiry appropriately
- Implement rate limiting for magic links
- Validate email formats

❌ **DON'T**:
- Allow infinite login attempts
- Use weak password policies (if adding password auth)
- Skip email verification
- Trust client-side authentication checks

### 5. API Security

✅ **DO**:
- Validate all inputs
- Use parameterized queries
- Implement rate limiting
- Log security events

❌ **DON'T**:
- Trust user input
- Expose internal errors to users
- Skip authentication checks
- Allow SQL injection vectors

---

## Advanced Topics

### Multi-Tenancy Support

The system supports multiple users by default:
- Files isolated by `user_id` in storage
- RLS policies enforce data isolation
- Embeddings shared across users (for semantic search)

To add workspace/organization support:
1. Add `workspace_id` to `vault_documents`
2. Update RLS policies to check workspace membership
3. Modify file paths: `{workspace_id}/{user_id}/{filename}`

### Batch Document Loading

For systems with many documents:

```python
# In document_ingestion.py
def load_documents_paginated(page_size=100):
    offset = 0
    while True:
        response = supabase.table('vault_documents') \
            .select('*') \
            .range(offset, offset + page_size - 1) \
            .execute()
        
        if not response.data:
            break
            
        for doc in response.data:
            # Process document
            pass
        
        offset += page_size
```

### File Deletion

To implement document deletion:

```typescript
// Frontend: /api/vault/[documentId]/route.ts
export async function DELETE(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  // Get document
  const { data: doc } = await supabase
    .from('vault_documents')
    .select('file_path')
    .eq('document_id', params.documentId)
    .eq('user_id', user.id)
    .single();
  
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  
  // Delete from storage
  await supabase.storage.from('vault_files').remove([doc.file_path]);
  
  // Delete from database
  await supabase
    .from('vault_documents')
    .delete()
    .eq('document_id', params.documentId);
  
  return NextResponse.json({ success: true });
}
```

### Signed URLs for File Download

```typescript
// Generate temporary download URL
const { data, error } = await supabase.storage
  .from('vault_files')
  .createSignedUrl(filePath, 60); // 60 seconds validity

if (data) {
  // data.signedUrl contains temporary download link
}
```

---

## Migration from Local Storage

If you have existing files in the local `storage/` directory:

### 1. Export Local Documents

```python
# migration_script.py
import os
from server.document_ingestion import documents

# Assuming documents are already loaded
for doc in documents:
    print(f"File: {doc['filename']}")
    print(f"Path: {doc['filepath']}")
    print(f"Size: {len(doc['content'])} chars")
    print("---")
```

### 2. Upload to Supabase

```python
# migration_to_supabase.py
import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
)

# Assign to a user (replace with actual user_id)
user_id = "your-user-uuid"

storage_dir = "storage/"
for filename in os.listdir(storage_dir):
    filepath = os.path.join(storage_dir, filename)
    
    # Upload to Supabase Storage
    with open(filepath, 'rb') as f:
        file_content = f.read()
        
    storage_path = f"{user_id}/{filename}"
    supabase.storage.from_('vault_files').upload(storage_path, file_content)
    
    # Add to database
    supabase.table('vault_documents').insert({
        'user_id': user_id,
        'file_name': filename,
        'file_path': storage_path,
        'file_size': len(file_content),
        'file_type': 'application/octet-stream'
    }).execute()
    
    print(f"✅ Migrated: {filename}")
```

---

## Quick Reference

### Common Commands

```powershell
# Backend
python server/main.py                    # Start FastMCP server
python bridge_server.py                  # Start bridge server
pip install -r requirements.txt          # Install dependencies

# Frontend
cd frontend
npm install                              # Install dependencies
npm run dev                              # Start dev server
npm run build                            # Build for production
npm start                                # Start production server
```

### SQL Queries

```sql
-- User management
SELECT id, email FROM auth.users WHERE email = 'user@example.com';
INSERT INTO profiles (id, email, role) VALUES (...);

-- Document queries
SELECT * FROM vault_documents WHERE user_id = '...';
DELETE FROM vault_documents WHERE document_id = '...';

-- RLS verification
SELECT * FROM pg_policies WHERE tablename = 'vault_documents';

-- Performance
EXPLAIN ANALYZE SELECT * FROM vault_documents WHERE user_id = '...';
```

### Environment Variables Cheat Sheet

| Variable | Location | Purpose | Key Type |
|----------|----------|---------|----------|
| `SUPABASE_URL` | Backend `.env` | API endpoint | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend `.env` | Admin access | Service Role |
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend `.env.local` | API endpoint | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend `.env.local` | User access | Anon Key |

---

## Additional Resources

### Official Documentation
- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Auth Guide](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Storage Guide](https://supabase.com/docs/guides/storage)

### Project Documentation
- `README.md` - Project overview
- `SETUP.md` - Detailed setup instructions
- `ARCHITECTURE.md` - System architecture
- `supabase/vault_setup.sql` - Database migration script

### Support
- GitHub Issues: [FastMCP-x Repository](https://github.com/Reejt/FastMCP-x)
- Supabase Discord: [https://discord.supabase.com](https://discord.supabase.com)

---

**This guide consolidates**:
- ✅ `SUPABASE_CONFIG.md` - Authentication and configuration
- ✅ `VAULT_SUPABASE_SETUP.md` - Database and storage setup
- ✅ `SUPABASE_STORAGE_INTEGRATION.md` - Integration details
- ✅ `SUPABASE_INTEGRATION_SUMMARY.md` - Quick reference

All information has been merged into this comprehensive guide.
