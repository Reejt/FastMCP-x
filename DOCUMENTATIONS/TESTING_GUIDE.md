# End-to-End Testing Guide
**Database Integration for FastMCP-x**

**Date:** November 15, 2025  
**Status:** Ready for Testing

---

## Overview

This guide walks through testing the complete database integration for workspaces, documents, and instructions.

---

## Pre-Testing Checklist

### 1. Database Setup
- [ ] Supabase project created
- [ ] Tables created (`workspaces`, `vault_documents`, `workspace_instructions`)
- [ ] RLS policies enabled and configured
- [ ] Storage bucket `vault_files` created
- [ ] Storage policies configured

### 2. Environment Variables

**Backend** (`/.env`):
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Frontend** (`/frontend/.env.local`):
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_BRIDGE_SERVER_URL=http://localhost:3001
```

### 3. Verify Database Schema

Run this query in Supabase SQL Editor:
```sql
-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('workspaces', 'vault_documents', 'workspace_instructions');

-- Check workspace_summary view exists
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public' 
  AND table_name = 'workspace_summary';

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('workspaces', 'vault_documents', 'workspace_instructions');
```

Expected output:
- 3 tables found
- 1 view found
- All tables have `rowsecurity = true`

---

## Testing Procedures

### Test 1: User Authentication

**Objective:** Verify user can log in and session persists

**Steps:**
1. Start frontend: `cd frontend && npm run dev`
2. Navigate to `http://localhost:3000`
3. Click "Login" or navigate to `/login`
4. Enter your email (must exist in `profiles` table)
5. Click "Send Magic Link"
6. Check email for magic link
7. Click magic link
8. Should redirect to `/dashboard`

**Expected Results:**
- ✅ Magic link received within 1 minute
- ✅ Redirect to dashboard after clicking link
- ✅ User info displayed in sidebar
- ✅ Refreshing page keeps you logged in

**Troubleshooting:**
- If no redirect: Check `middleware.ts` and `/auth/callback/route.ts`
- If logged out on refresh: Check cookie settings in browser
- If "User not authorized": Add user to `profiles` table

---

### Test 2: Create Workspace

**Objective:** Create a new workspace and verify database entry

**Steps:**
1. Navigate to `/workspaces`
2. Click "Create Workspace" button
3. Enter workspace name: "Test Workspace 1"
4. Enter description: "Testing workspace creation"
5. Click "Create" or "Save"
6. Wait for modal to close

**Expected Results:**
- ✅ Modal closes automatically
- ✅ New workspace card appears in grid
- ✅ Workspace shows 0 documents

**Database Verification:**
```sql
-- Check workspace was created
SELECT id, name, description, owner_id, is_archived, created_at
FROM workspaces
ORDER BY created_at DESC
LIMIT 5;
```

**Expected:**
- New row with your workspace name
- `owner_id` matches your user ID
- `is_archived = false`

**Troubleshooting:**
- If error "Failed to create workspace": Check browser console and network tab
- If workspace doesn't appear: Check API route `/api/workspaces` logs
- If permission denied: Verify RLS policies allow INSERT

---

### Test 3: Edit Workspace Details

**Objective:** Update workspace name and description

**Steps:**
1. On `/workspaces` page, hover over workspace card
2. Click three-dot menu (appears on hover)
3. Click "Edit"
4. Change name to "Updated Test Workspace"
5. Change description to "Updated description"
6. Click "Save Changes"

**Expected Results:**
- ✅ Modal closes automatically
- ✅ Workspace card shows updated name
- ✅ Workspace card shows updated description

**Database Verification:**
```sql
-- Check workspace was updated
SELECT name, description, updated_at
FROM workspaces
WHERE name LIKE '%Updated%'
ORDER BY updated_at DESC;
```

**Expected:**
- Updated name and description
- `updated_at` timestamp is recent (within last minute)

---

### Test 4: Create Instructions

**Objective:** Add AI instructions to workspace

**Steps:**
1. On workspace card, click three-dot menu → "Edit"
2. Click "Instructions" tab
3. Click "Add Instruction" button
4. Enter title: "Code Review Assistant"
5. Enter content: "You are a senior developer reviewing code for best practices"
6. Click OK (for both prompts)
7. Verify instruction appears in list
8. Click "Add Instruction" again
9. Enter title: "Documentation Writer"
10. Enter content: "You are a technical writer creating clear documentation"
11. Click OK

**Expected Results:**
- ✅ First instruction shows "Active" badge
- ✅ Second instruction has no badge
- ✅ Instructions tab shows "(2)" in title
- ✅ Each instruction has activate/delete buttons

**Database Verification:**
```sql
-- Check instructions were created
SELECT id, workspace_id, title, is_active, created_at
FROM workspace_instructions
ORDER BY created_at DESC
LIMIT 10;
```

**Expected:**
- 2 new rows
- One has `is_active = true`
- One has `is_active = false`
- Both have same `workspace_id`

---

### Test 5: Switch Active Instruction

**Objective:** Activate a different instruction

**Steps:**
1. In Edit Workspace modal → Instructions tab
2. Find the inactive instruction
3. Click the checkmark icon (activate button)
4. Wait for refresh

**Expected Results:**
- ✅ Previously active instruction loses "Active" badge
- ✅ Newly activated instruction shows "Active" badge
- ✅ Only ONE instruction has "Active" badge

**Database Verification:**
```sql
-- Check only one instruction is active per workspace
SELECT workspace_id, COUNT(*) as active_count
FROM workspace_instructions
WHERE is_active = true
GROUP BY workspace_id;
```

**Expected:**
- All counts should be 1 or 0
- No workspace should have `active_count > 1`

**Test Unique Constraint:**
```sql
-- This should FAIL (constraint violation)
UPDATE workspace_instructions
SET is_active = true
WHERE workspace_id = 'your-workspace-id';
```

**Expected Error:** `duplicate key value violates unique constraint "unique_active_instruction_per_workspace"`

---

### Test 6: Delete Instruction

**Objective:** Remove an instruction

**Steps:**
1. In Edit Workspace modal → Instructions tab
2. Click trash icon on an inactive instruction
3. Confirm deletion in alert
4. Wait for refresh

**Expected Results:**
- ✅ Instruction disappears from list
- ✅ Instruction count updates in tab title

**Database Verification:**
```sql
-- Check instruction was deleted
SELECT COUNT(*) FROM workspace_instructions;
```

**Expected:**
- Count decreased by 1

---

### Test 7: Upload Document to Workspace

**Objective:** Upload a file associated with workspace

**Steps:**
1. Navigate to `/vault` page
2. Click "Upload Document" or drag-and-drop
3. Select a test file (PDF, DOCX, TXT, etc.)
4. Wait for upload to complete

**Important Note:**
The current upload implementation needs to be updated to pass `workspaceId`. For now, test that:
- File uploads successfully
- File appears in vault list
- File is stored in Supabase Storage

**Expected Results:**
- ✅ Upload progress bar appears
- ✅ Success message displayed
- ✅ File appears in vault documents list
- ✅ File metadata saved to database

**Database Verification:**
```sql
-- Check document was uploaded
SELECT document_id, user_id, workspace_id, file_name, file_size, upload_timestamp
FROM vault_documents
ORDER BY upload_timestamp DESC
LIMIT 5;
```

**Expected:**
- New row with your file
- `workspace_id` is NULL (will be fixed when vault page is updated)
- File stored in Supabase Storage

**Storage Verification:**
1. Go to Supabase Dashboard → Storage → `vault_files`
2. Navigate to your user folder
3. Verify file exists with timestamp prefix

---

### Test 8: Query Documents by Workspace

**Objective:** Retrieve only documents for specific workspace

**Steps:**
1. Open browser DevTools → Console
2. Run this command:
```javascript
fetch('/api/vault/upload?workspaceId=YOUR_WORKSPACE_ID')
  .then(r => r.json())
  .then(console.log)
```

**Expected Results:**
- ✅ Returns JSON with documents array
- ✅ All documents have matching `workspace_id`
- ✅ Document count matches expected

**Alternative: Manual SQL Test**
```sql
-- Get documents for specific workspace
SELECT d.file_name, d.upload_timestamp, w.name as workspace_name
FROM vault_documents d
JOIN workspaces w ON d.workspace_id = w.id
WHERE w.id = 'your-workspace-id'
ORDER BY d.upload_timestamp DESC;
```

---

### Test 9: Search Workspaces

**Objective:** Test search functionality

**Steps:**
1. Navigate to `/workspaces`
2. Type in search box: "Test"
3. Verify only matching workspaces show
4. Clear search
5. Type: "Documentation"
6. Verify only workspaces with "Documentation" in name/description show

**Expected Results:**
- ✅ Search is case-insensitive
- ✅ Searches both name and description
- ✅ Results update as you type
- ✅ "No workspaces match your search" shown if no results

---

### Test 10: Delete Workspace

**Objective:** Permanently delete workspace (with cascade)

**Steps:**
1. Create a test workspace: "Delete Me Workspace"
2. Add an instruction to it
3. Note the workspace ID
4. Click three-dot menu → "Delete"
5. Confirm deletion in alert
6. Wait for workspace to disappear

**Expected Results:**
- ✅ Confirmation dialog appears
- ✅ Workspace card disappears
- ✅ Associated instructions also deleted (cascade)
- ✅ Associated documents also deleted (cascade)

**Database Verification:**
```sql
-- Check workspace and related data deleted
SELECT COUNT(*) FROM workspaces WHERE name = 'Delete Me Workspace';
-- Expected: 0

SELECT COUNT(*) FROM workspace_instructions 
WHERE workspace_id = 'deleted-workspace-id';
-- Expected: 0

SELECT COUNT(*) FROM vault_documents 
WHERE workspace_id = 'deleted-workspace-id';
-- Expected: 0
```

**Expected:**
- All counts should be 0
- Cascade delete worked correctly

---

### Test 11: Archive Workspace (Soft Delete)

**Objective:** Archive workspace without deleting documents

**Note:** Currently "Delete" permanently deletes. To test archiving:

**Steps:**
1. Open browser DevTools → Console
2. Run this command:
```javascript
fetch('/api/workspaces', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    workspaceId: 'YOUR_WORKSPACE_ID',
    archive: true 
  })
}).then(r => r.json()).then(console.log)
```

**Expected Results:**
- ✅ Workspace hidden from list (is_archived = true)
- ✅ Documents still exist in database
- ✅ Instructions still exist in database

**Database Verification:**
```sql
-- Check workspace was archived, not deleted
SELECT id, name, is_archived FROM workspaces 
WHERE id = 'your-workspace-id';
-- Expected: is_archived = true

-- Check documents still exist
SELECT COUNT(*) FROM vault_documents 
WHERE workspace_id = 'your-workspace-id';
-- Expected: Same count as before
```

---

### Test 12: Multi-User Isolation (RLS Test)

**Objective:** Verify users can't see each other's data

**Steps:**
1. Create a workspace as User A
2. Note workspace ID
3. Log out
4. Log in as User B (different email in `profiles` table)
5. Navigate to `/workspaces`

**Expected Results:**
- ✅ User B cannot see User A's workspace
- ✅ User B has empty workspace list (or only their own)

**Database Test (as superuser):**
```sql
-- Switch to User B context
SET request.jwt.claim.sub = 'user-b-id';

-- Try to query User A's workspace
SELECT * FROM workspaces WHERE id = 'user-a-workspace-id';
-- Expected: Empty result (RLS blocked)

-- Try to insert document into User A's workspace
INSERT INTO vault_documents (user_id, workspace_id, file_name, file_path, file_size, file_type)
VALUES ('user-b-id', 'user-a-workspace-id', 'test.txt', 'test.txt', 100, 'text/plain');
-- Expected: RLS policy violation error
```

---

### Test 13: API Error Handling

**Objective:** Verify graceful error handling

**Test Invalid Workspace ID:**
```javascript
fetch('/api/vault/upload?workspaceId=invalid-uuid-123')
  .then(r => r.json())
  .then(console.log)
```

**Expected:**
- ✅ Returns error response (not crash)
- ✅ Error message is clear
- ✅ Status code is 4xx

**Test Missing Required Field:**
```javascript
fetch('/api/workspaces', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ description: 'No name provided' })
}).then(r => r.json()).then(console.log)
```

**Expected:**
- ✅ Returns 400 Bad Request
- ✅ Error message: "Workspace name is required"

---

### Test 14: Performance Test

**Objective:** Verify app performs well with multiple workspaces

**Steps:**
1. Create 10+ workspaces using the UI
2. Add 2-3 instructions per workspace
3. Navigate to `/workspaces`
4. Measure page load time

**Expected Results:**
- ✅ Page loads in < 2 seconds
- ✅ Search responds instantly
- ✅ No lag when scrolling
- ✅ Cards render smoothly

**Database Query Performance:**
```sql
-- Check query performance
EXPLAIN ANALYZE
SELECT * FROM workspace_summary
WHERE owner_id = 'your-user-id'
ORDER BY created_at DESC;
```

**Expected:**
- Query execution time < 100ms
- Uses index on `owner_id`
- Uses index on `created_at`

---

## Testing Summary Checklist

After completing all tests, verify:

- [ ] ✅ User authentication works
- [ ] ✅ Workspaces can be created
- [ ] ✅ Workspaces can be edited
- [ ] ✅ Workspaces can be deleted
- [ ] ✅ Instructions can be created
- [ ] ✅ Instructions can be activated/deactivated
- [ ] ✅ Only one instruction active per workspace
- [ ] ✅ Instructions can be deleted
- [ ] ✅ Documents can be uploaded
- [ ] ✅ Documents filtered by workspace
- [ ] ✅ Search works correctly
- [ ] ✅ RLS prevents cross-user access
- [ ] ✅ Error handling is graceful
- [ ] ✅ Performance is acceptable

---

## Known Issues / Future Improvements

### Current Limitations:
1. **Vault page doesn't pass workspace_id** - Documents uploaded via `/vault` have NULL workspace_id
   - **Fix:** Update vault upload form to include workspace selector
   
2. **Instruction creation uses simple prompts** - Boilerplate implementation
   - **Fix:** Create proper modal with rich text editor

3. **No dashboard workspace selector** - Step 7 was skipped
   - **Future:** Add workspace context to dashboard

4. **Archive functionality not in UI** - Delete is permanent
   - **Fix:** Add "Archive" option to menu, separate from "Delete"

### Recommended Next Steps:
1. Update `/vault` page to support workspace selection
2. Create proper instruction editor modal
3. Add workspace context provider for global state
4. Implement soft delete in UI
5. Add batch operations (select multiple workspaces)
6. Add workspace export/import functionality

---

## Troubleshooting Common Issues

### Issue: "Cannot read property 'workspaces' of undefined"
**Cause:** API response format mismatch  
**Fix:** Check API route returns `{ success: true, workspaces: [] }`

### Issue: "Workspace not found or access denied"
**Cause:** RLS policy blocking access  
**Fix:** Verify `owner_id` matches authenticated user

### Issue: "Unique constraint violation"
**Cause:** Trying to activate second instruction  
**Fix:** Working as intended! Deactivate others first (service layer should handle this)

### Issue: Documents not appearing in workspace
**Cause:** `workspace_id` is NULL  
**Fix:** Update vault upload to pass workspace_id

### Issue: "Request timeout" when uploading large files
**Cause:** Bridge server timeout  
**Fix:** Increase timeout in `/api/vault/upload/route.ts`

---

## Success Criteria

**Database integration is successful if:**
- ✅ All 14 tests pass
- ✅ No RLS policy violations
- ✅ No data leakage between users
- ✅ Cascade deletes work correctly
- ✅ Unique constraints enforced
- ✅ Performance is acceptable

**Ready for production when:**
- ✅ All tests pass
- ✅ Vault page updated to support workspaces
- ✅ Error handling covers all edge cases
- ✅ User documentation created
- ✅ Backup strategy in place

---

## Support

**Documentation:**
- `WORKSPACE_SCHEMA_GUIDE.md` - Database schema reference
- `DB_INTEGRATION_SUMMARY.md` - Implementation summary
- `SUPABASE_COMPLETE_GUIDE.md` - Supabase setup

**Need Help?**
- Check browser console for errors
- Check Supabase logs in dashboard
- Review RLS policies in SQL Editor
- Check network tab for API failures

---

**Last Updated:** November 15, 2025  
**Test Status:** Ready for Execution  
**Integration Completion:** 6/8 Steps Complete (75%)
