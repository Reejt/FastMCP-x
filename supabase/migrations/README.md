# Database Migration Guide: Chat Sessions

**Created:** January 20, 2026  
**Purpose:** Add persistent chat sessions to enable isolated conversation contexts within workspaces

---

## Overview

These migrations add a session-based chat system where each workspace can have multiple conversation threads. This solves the issue where all messages were merged into a single conversation on page refresh.

### What Changes

**New Table:**
- `chat_sessions` - Stores session metadata (title, timestamps, soft delete)

**Updated Table:**
- `chats` - Adds `session_id` column to link messages to sessions

**Migration Files:**
1. `20260120_create_chat_sessions.sql` - Creates the sessions table
2. `20260120_add_session_id_to_chats.sql` - Adds session_id and migrates existing data

---

## How to Apply Migrations

### Option 1: Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Go to https://app.supabase.com
   - Select your project
   - Navigate to **SQL Editor** in the left sidebar

2. **Run First Migration**
   - Click "New Query"
   - Copy contents of `20260120_create_chat_sessions.sql`
   - Paste and click **Run**
   - Verify success message

3. **Run Second Migration**
   - Click "New Query" again
   - Copy contents of `20260120_add_session_id_to_chats.sql`
   - Paste and click **Run**
   - Check the output logs for "Created legacy session..." messages

4. **Verify Migration**
   - Run verification queries (see below)

### Option 2: Supabase CLI

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Apply migrations
supabase db push
```

---

## Verification Queries

Run these in the Supabase SQL Editor to verify the migration succeeded:

### 1. Check for orphaned messages
```sql
-- Should return 0
SELECT COUNT(*) as orphaned_messages 
FROM chats 
WHERE session_id IS NULL;
```

### 2. Count legacy sessions created
```sql
-- Should match number of workspaces with existing messages
SELECT COUNT(*) as legacy_sessions 
FROM chat_sessions 
WHERE title = 'Legacy Chat';
```

### 3. View legacy sessions with message counts
```sql
SELECT 
  cs.id, 
  cs.workspace_id, 
  cs.title, 
  cs.created_at,
  COUNT(c.id) as message_count
FROM chat_sessions cs
LEFT JOIN chats c ON c.session_id = cs.id
WHERE cs.title = 'Legacy Chat'
GROUP BY cs.id, cs.workspace_id, cs.title, cs.created_at
ORDER BY cs.created_at DESC;
```

### 4. Check indexes were created
```sql
SELECT 
  tablename, 
  indexname, 
  indexdef
FROM pg_indexes
WHERE tablename IN ('chat_sessions', 'chats')
ORDER BY tablename, indexname;
```

### 5. Verify RLS policies
```sql
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd
FROM pg_policies
WHERE tablename = 'chat_sessions'
ORDER BY policyname;
```

---

## Expected Results

After successful migration:

✅ **chat_sessions table exists** with columns: id, workspace_id, user_id, title, created_at, updated_at, deleted_at

✅ **chats.session_id column exists** and is NOT NULL

✅ **Legacy sessions created** - One "Legacy Chat" session per workspace containing all existing messages

✅ **Indexes created**:
- `idx_chat_sessions_workspace_id`
- `idx_chat_sessions_user_id`
- `idx_chat_sessions_created_at`
- `idx_chat_sessions_active`
- `idx_chats_session_id`
- `idx_chats_session_created`

✅ **RLS policies active** on chat_sessions table (4 policies: SELECT, INSERT, UPDATE, DELETE)

---

## Rollback Instructions

⚠️ **WARNING:** Rollback will delete all session data!

If you need to rollback these migrations:

```sql
-- Step 1: Remove session_id from chats table
ALTER TABLE chats DROP COLUMN IF EXISTS session_id;

-- Step 2: Drop chat_sessions table (cascades to all sessions)
DROP TABLE IF EXISTS chat_sessions CASCADE;

-- Step 3: Drop indexes (if they still exist)
DROP INDEX IF EXISTS idx_chat_sessions_workspace_id;
DROP INDEX IF EXISTS idx_chat_sessions_user_id;
DROP INDEX IF EXISTS idx_chat_sessions_created_at;
DROP INDEX IF EXISTS idx_chat_sessions_active;
DROP INDEX IF EXISTS idx_chats_session_id;
DROP INDEX IF EXISTS idx_chats_session_created;
```

---

## Troubleshooting

### Error: "function update_updated_at() does not exist"

**Cause:** The trigger function is missing (should exist from workspace schema)

**Solution:**
```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Error: "relation chat_sessions does not exist"

**Cause:** First migration wasn't run successfully

**Solution:** Run `20260120_create_chat_sessions.sql` first, then retry the second migration

### Warning: "No legacy sessions created"

**Cause:** No existing messages in database

**Result:** This is normal for new installations. New sessions will be created as users chat.

---

## Next Steps

After applying migrations:

1. ✅ **Complete Step 1-2** of the implementation plan (this file)
2. ⏭️ **Proceed to Step 3** - Update TypeScript type definitions
3. ⏭️ **Continue with Step 4-12** - Update service layer, API routes, and frontend

---

## Schema Diagram

```
workspaces (existing)
    ↓ workspace_id (1:N)
chat_sessions (NEW)
    ↓ session_id (1:N)
chats (updated with session_id)
```

---

**Migration Status:** Ready to apply  
**Tested:** ✅ Syntax validated  
**Backward Compatible:** ✅ Preserves existing messages in legacy sessions

