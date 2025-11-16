# Quick Testing Checklist
**FastMCP-x Database Integration**

Use this checklist while testing. Refer to `TESTING_GUIDE.md` for detailed steps.

---

## Pre-Testing Setup

```bash
# Start Frontend
cd frontend
npm run dev

# Start Backend (separate terminal)
cd server
python main.py

# Start Bridge Server (separate terminal)
python bridge_server.py
```

**Environment Check:**
- [ ] `.env` file in root with Supabase credentials
- [ ] `.env.local` in `frontend/` with Supabase credentials
- [ ] User exists in `profiles` table in Supabase
- [ ] Storage bucket `vault_files` exists and is private

---

## Quick Test Sequence

### 1. Authentication (2 min)
- [ ] Navigate to `http://localhost:3000/login`
- [ ] Enter email and click "Send Magic Link"
- [ ] Click magic link from email
- [ ] Redirected to dashboard
- [ ] User info shows in sidebar

### 2. Create Workspace (1 min)
- [ ] Navigate to `/workspaces`
- [ ] Click "Create Workspace"
- [ ] Enter name: "Test Workspace"
- [ ] Enter description: "Testing workspace features"
- [ ] Click Create
- [ ] Workspace card appears

**Verify in Supabase:**
```sql
SELECT * FROM workspaces ORDER BY created_at DESC LIMIT 1;
```

### 3. Edit Workspace (1 min)
- [ ] Hover over workspace card
- [ ] Click three-dot menu → Edit
- [ ] Change name to "Updated Workspace"
- [ ] Click "Save Changes"
- [ ] Card updates with new name

### 4. Add Instructions (2 min)
- [ ] Click Edit on workspace
- [ ] Switch to "Instructions" tab
- [ ] Click "Add Instruction"
- [ ] Enter title: "Test Instruction 1"
- [ ] Enter content: "Test content 1"
- [ ] Confirm
- [ ] Instruction appears with "Active" badge
- [ ] Add another instruction
- [ ] Second instruction has no badge

**Verify in Supabase:**
```sql
SELECT title, is_active FROM workspace_instructions ORDER BY created_at DESC LIMIT 2;
```

### 5. Switch Active Instruction (30 sec)
- [ ] Click checkmark on inactive instruction
- [ ] Badge moves to newly activated instruction
- [ ] Only ONE badge visible

**Verify constraint:**
```sql
-- Should return max 1 per workspace
SELECT workspace_id, COUNT(*) FROM workspace_instructions 
WHERE is_active = true GROUP BY workspace_id;
```

### 6. Delete Instruction (30 sec)
- [ ] Click trash icon on inactive instruction
- [ ] Confirm deletion
- [ ] Instruction disappears
- [ ] Count updates in tab title

### 7. Upload Document (2 min)
- [ ] Navigate to `/vault`
- [ ] Click "Upload Document"
- [ ] Select a test file
- [ ] Wait for upload
- [ ] File appears in list

**Note:** Currently uploads without workspace_id (will be NULL)

**Verify in Supabase:**
```sql
SELECT file_name, workspace_id FROM vault_documents ORDER BY upload_timestamp DESC LIMIT 1;
```

### 8. Search Workspaces (30 sec)
- [ ] Navigate to `/workspaces`
- [ ] Type "Test" in search box
- [ ] Only matching workspaces show
- [ ] Clear search
- [ ] All workspaces reappear

### 9. Delete Workspace (1 min)
- [ ] Create temporary workspace "Delete Me"
- [ ] Click three-dot menu → Delete
- [ ] Confirm deletion
- [ ] Workspace disappears

**Verify cascade:**
```sql
-- Replace with actual workspace ID
SELECT COUNT(*) FROM workspace_instructions WHERE workspace_id = 'deleted-id';
-- Should return 0
```

---

## RLS Security Test (2 min)

**Setup:**
- Have two different users in `profiles` table

**Test:**
1. [ ] Create workspace as User A
2. [ ] Note workspace ID
3. [ ] Log out
4. [ ] Log in as User B
5. [ ] Navigate to `/workspaces`
6. [ ] User B cannot see User A's workspace ✓

---

## API Test (DevTools Console)

```javascript
// Test workspace API
fetch('/api/workspaces?withSummary=true')
  .then(r => r.json())
  .then(console.log)

// Test instructions API
fetch('/api/instructions?workspaceId=YOUR_WORKSPACE_ID')
  .then(r => r.json())
  .then(console.log)

// Test vault API with workspace filter
fetch('/api/vault/upload?workspaceId=YOUR_WORKSPACE_ID')
  .then(r => r.json())
  .then(console.log)
```

---

## Common Issues Quick Fix

| Issue | Quick Fix |
|-------|-----------|
| Can't log in | Check `profiles` table has your email |
| Workspace not appearing | Check browser console + Network tab |
| "Permission denied" | Verify RLS policies in Supabase |
| Upload fails | Check bridge server is running |
| Instruction won't activate | Check only one active per workspace |

---

## Success Criteria

**All green? You're ready! ✅**

- [ ] Can create/edit/delete workspaces
- [ ] Can create/activate/delete instructions
- [ ] Only one instruction active per workspace
- [ ] Can upload documents
- [ ] Search works
- [ ] RLS prevents cross-user access
- [ ] No console errors

---

## Files to Check

```bash
# Check these files if issues arise
frontend/app/workspaces/page.tsx              # Workspace list
frontend/app/workspaces/components/WorkspaceCard.tsx  # Card component
frontend/app/workspaces/components/EditWorkspaceModal.tsx  # Edit modal
frontend/app/api/workspaces/route.ts          # Workspace API
frontend/app/api/instructions/route.ts        # Instructions API
frontend/app/api/vault/upload/route.ts        # Upload API
```

---

**Total Test Time:** ~15 minutes  
**Status:** Ready for testing
