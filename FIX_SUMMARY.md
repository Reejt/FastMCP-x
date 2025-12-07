# Foreign Key Constraint Fix - File Upload Error

## Problem
When uploading files without specifying a workspace, the system was trying to insert a `workspace_id` value of `user.id`, which caused a foreign key constraint violation:

```
Error: insert or update on table "file_upload" violates foreign key constraint "fk_file_upload_workspace"
Details: Key is not present in table "workspaces"
```

This occurred because:
1. The upload route defaulted `workspace_id` to `user.id` when no workspace was specified
2. `user.id` is not a valid workspace UUID in the `workspaces` table
3. The `workspaces` table uses `owner_id` (not `user_id`), and user IDs never exist as workspace IDs

## Root Causes Fixed

### 1. **Upload Route Logic** (`frontend/app/api/vault/upload/route.ts`)
- **Before**: `workspace_id: workspaceId || user.id` (invalid fallback)
- **After**: Intelligently get or create a default workspace
  - If `workspaceId` provided: Validates it belongs to the user
  - If no `workspaceId`: Checks for existing user workspaces
  - If no workspaces exist: Creates a "Personal Workspace" for the user
  - Uses the valid workspace ID for database insert

### 2. **Workspaces Service Schema Mismatch** (`frontend/lib/supabase/workspaces.ts`)
- **Before**: All queries used `user_id` column
- **After**: All queries now use `owner_id` (correct schema column)
- **Fixed functions**:
  - `getUserWorkspaces()` - Changed `.eq('user_id', ...)` → `.eq('owner_id', ...)`
  - `getWorkspaceById()` - Changed `.eq('user_id', ...)` → `.eq('owner_id', ...)`
  - `createWorkspace()` - Changed `user_id:` → `owner_id:`
  - `updateWorkspace()` - Changed `.eq('user_id', ...)` → `.eq('owner_id', ...)`
  - `deleteWorkspace()` - Changed `.eq('user_id', ...)` → `.eq('owner_id', ...)`
  - `getOrCreateDefaultWorkspace()` - Changed `.eq('user_id', ...)` → `.eq('owner_id', ...)`

## How It Works Now

### File Upload Flow (Updated)
1. User uploads file without specifying workspace
2. Route checks if user has existing workspaces
3. If yes: Uses the first (oldest) workspace
4. If no: Creates "Personal Workspace" automatically
5. Uses valid workspace UUID for database insert
6. Foreign key constraint is satisfied ✓

### Example Scenario
```
User uploads file → No workspace specified
→ System checks for existing workspaces
→ None found → Creates "Personal Workspace" with valid UUID
→ Uses that UUID in file_upload.workspace_id
→ Insert succeeds (foreign key valid)
```

## Files Modified
1. `frontend/app/api/vault/upload/route.ts` - Added workspace resolution logic
2. `frontend/lib/supabase/workspaces.ts` - Fixed schema column references

## Testing Recommendations
1. Upload file without workspace ID - Should create default workspace
2. Verify default workspace appears in workspaces list
3. Upload file with explicit workspace ID - Should validate and use it
4. Check database for proper workspace_id relationships

## Prevention
- Always validate foreign key references before insert
- Ensure service layer column names match actual database schema
- Consider nullable columns for optional relationships if this is needed
