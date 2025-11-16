# Workspace & Instructions Database Schema Guide

**Created:** November 15, 2025  
**Status:** ✅ Implemented in Production  
**Database:** Supabase PostgreSQL

---

## Table of Contents

1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [Tables](#tables)
4. [Row Level Security (RLS)](#row-level-security-rls)
5. [Indexes & Performance](#indexes--performance)
6. [Triggers & Functions](#triggers--functions)
7. [Views](#views)
8. [Migration Guide](#migration-guide)
9. [Usage Examples](#usage-examples)
10. [Troubleshooting](#troubleshooting)

---

## Overview

This schema implements a **workspace-based document organization system** for FastMCP-x, allowing users to:
- Create and manage multiple workspaces
- Organize documents within workspaces
- Define custom AI instructions per workspace
- Maintain backward compatibility with existing documents

### Key Features
- ✅ Multi-workspace support per user
- ✅ Document isolation by workspace
- ✅ Custom instructions per workspace (only one active)
- ✅ Soft delete (archive) for workspaces
- ✅ Row Level Security (RLS) for data isolation
- ✅ Automatic timestamps and triggers
- ✅ Backward compatible with existing `vault_documents`

---

## Database Schema

### Entity Relationship Diagram

```
auth.users (Supabase Auth)
    ↓ owner_id (1:N)
workspaces
    ↓ workspace_id (1:N)
    ├─→ vault_documents (documents in workspace)
    └─→ workspace_instructions (AI prompts)
```

### Data Flow

1. **User creates workspace** → `workspaces` table
2. **User uploads document** → `vault_documents` (with `workspace_id`)
3. **User creates instruction** → `workspace_instructions` (one active per workspace)
4. **User archives workspace** → `is_archived = TRUE` (soft delete)

---

## Tables

### 1. `workspaces`

**Purpose:** Store user workspaces for organizing documents and instructions.

```sql
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_archived BOOLEAN DEFAULT FALSE,
  
  CONSTRAINT workspace_name_not_empty CHECK (char_length(trim(name)) > 0)
);
```

#### Columns

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key, auto-generated |
| `name` | TEXT | Workspace name (required, non-empty) |
| `description` | TEXT | Optional workspace description |
| `owner_id` | UUID | Foreign key to `auth.users(id)`, cascades on delete |
| `created_at` | TIMESTAMPTZ | Auto-set on creation |
| `updated_at` | TIMESTAMPTZ | Auto-updated via trigger |
| `is_archived` | BOOLEAN | Soft delete flag (default: FALSE) |

#### Constraints
- ✅ `workspace_name_not_empty`: Ensures name is not empty or whitespace-only
- ✅ `owner_id`: Must reference valid user in `auth.users`

---

### 2. `vault_documents` (Updated)

**Purpose:** Store document metadata with workspace association.

```sql
-- Existing table with new column
ALTER TABLE vault_documents 
  ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
```

#### New Column

| Column | Type | Description |
|--------|------|-------------|
| `workspace_id` | UUID | Foreign key to `workspaces(id)`, optional for backward compatibility |

#### Existing Columns
- `document_id` (UUID, PK)
- `user_id` (UUID, FK to auth.users)
- `file_name` (TEXT)
- `file_path` (TEXT)
- `file_size` (BIGINT)
- `file_type` (TEXT)
- `upload_timestamp` (TIMESTAMPTZ)
- `metadata` (JSONB)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

#### Backward Compatibility
- Old documents can remain with `user_id` only (no `workspace_id`)
- New documents **must** have `workspace_id`
- RLS policies support both patterns

---

### 3. `workspace_instructions`

**Purpose:** Store custom AI system instructions per workspace.

```sql
CREATE TABLE workspace_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Columns

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key, auto-generated |
| `workspace_id` | UUID | Foreign key to `workspaces(id)`, cascades on delete |
| `title` | TEXT | Instruction title (e.g., "Code Review Assistant") |
| `content` | TEXT | Full instruction prompt |
| `is_active` | BOOLEAN | Only one can be active per workspace |
| `created_at` | TIMESTAMPTZ | Auto-set on creation |
| `updated_at` | TIMESTAMPTZ | Auto-updated via trigger |

#### Unique Constraint
**Partial Unique Index:** Only one active instruction per workspace

```sql
CREATE UNIQUE INDEX unique_active_instruction_per_workspace
  ON workspace_instructions(workspace_id, is_active)
  WHERE is_active = TRUE;
```

**Behavior:**
- ✅ Allows multiple **inactive** instructions per workspace
- ✅ Enforces only **ONE active** instruction per workspace
- ❌ Prevents inserting/updating if another instruction is already active

---

## Row Level Security (RLS)

All tables use RLS to ensure users can only access their own data.

### `workspaces` Policies

```sql
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- View own workspaces
CREATE POLICY "Users can view their own workspaces"
  ON workspaces FOR SELECT
  USING (owner_id = auth.uid());

-- Create workspaces
CREATE POLICY "Users can create workspaces"
  ON workspaces FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Update own workspaces
CREATE POLICY "Users can update their own workspaces"
  ON workspaces FOR UPDATE
  USING (owner_id = auth.uid());

-- Delete own workspaces
CREATE POLICY "Users can delete their own workspaces"
  ON workspaces FOR DELETE
  USING (owner_id = auth.uid());
```

### `vault_documents` Policies (Updated)

```sql
-- Drop old policies
DROP POLICY IF EXISTS "Users can view own documents" ON vault_documents;
DROP POLICY IF EXISTS "Users can insert own documents" ON vault_documents;
DROP POLICY IF EXISTS "Users can update own documents" ON vault_documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON vault_documents;

-- New workspace-aware policies
CREATE POLICY "Users can view their workspace documents"
  ON vault_documents FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    ) OR
    user_id = auth.uid()  -- Backward compatibility
  );

CREATE POLICY "Users can upload documents to their workspaces"
  ON vault_documents FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their workspace documents"
  ON vault_documents FOR DELETE
  USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    ) OR
    user_id = auth.uid()  -- Backward compatibility
  );
```

### `workspace_instructions` Policies

```sql
ALTER TABLE workspace_instructions ENABLE ROW LEVEL SECURITY;

-- View instructions in own workspaces
CREATE POLICY "Users can view their workspace instructions"
  ON workspace_instructions FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- Create instructions
CREATE POLICY "Users can create workspace instructions"
  ON workspace_instructions FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- Update instructions
CREATE POLICY "Users can update their workspace instructions"
  ON workspace_instructions FOR UPDATE
  USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- Delete instructions
CREATE POLICY "Users can delete their workspace instructions"
  ON workspace_instructions FOR DELETE
  USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );
```

---

## Indexes & Performance

### Performance Optimization Strategy

1. **Foreign Key Indexes:** All foreign keys are indexed for join performance
2. **Timestamp Indexes:** Descending order for "latest first" queries
3. **Partial Indexes:** For frequently filtered columns (e.g., archived workspaces)
4. **Covering Indexes:** Minimize table lookups for common queries

### Workspaces Indexes

```sql
-- Foreign key index
CREATE INDEX idx_workspaces_owner_id ON workspaces(owner_id);

-- Sort by newest first
CREATE INDEX idx_workspaces_created_at ON workspaces(created_at DESC);

-- Partial index for active workspaces only
CREATE INDEX idx_workspaces_archived 
  ON workspaces(is_archived) 
  WHERE is_archived = FALSE;
```

**Query Performance:**
- ✅ `SELECT * FROM workspaces WHERE owner_id = ?` → Fast (indexed)
- ✅ `SELECT * FROM workspaces WHERE is_archived = FALSE` → Fast (partial index)
- ✅ `ORDER BY created_at DESC` → Fast (indexed)

### Vault Documents Indexes

```sql
-- New workspace index
CREATE INDEX idx_vault_documents_workspace_id 
  ON vault_documents(workspace_id);

-- Existing indexes (already in place)
CREATE INDEX idx_vault_documents_user_id 
  ON vault_documents(user_id);
CREATE INDEX idx_vault_documents_upload_timestamp 
  ON vault_documents(upload_timestamp DESC);
```

### Workspace Instructions Indexes

```sql
-- Foreign key index
CREATE INDEX idx_workspace_instructions_workspace_id 
  ON workspace_instructions(workspace_id);

-- Partial unique index (constraint)
CREATE UNIQUE INDEX unique_active_instruction_per_workspace
  ON workspace_instructions(workspace_id, is_active)
  WHERE is_active = TRUE;
```

---

## Triggers & Functions

### Auto-Update `updated_at` Timestamp

**Function:**
```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Triggers:**
```sql
-- Workspaces
CREATE TRIGGER update_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Workspace Instructions
CREATE TRIGGER update_workspace_instructions_updated_at
  BEFORE UPDATE ON workspace_instructions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

**Behavior:**
- Automatically sets `updated_at = NOW()` on every UPDATE
- Applies to ALL columns (even if `updated_at` is not explicitly set)
- Runs **before** the update is committed

---

## Views

### `workspace_summary`

**Purpose:** Quick overview of workspaces with document counts.

```sql
CREATE OR REPLACE VIEW workspace_summary AS
SELECT 
  w.id,
  w.name,
  w.description,
  w.owner_id,
  w.created_at,
  w.updated_at,
  w.is_archived,
  COUNT(vd.document_id) AS document_count
FROM workspaces w
LEFT JOIN vault_documents vd ON w.id = vd.workspace_id
WHERE w.owner_id = auth.uid()  -- RLS enforced in view
GROUP BY w.id, w.name, w.description, w.owner_id, 
         w.created_at, w.updated_at, w.is_archived;
```

**Usage:**
```sql
-- Get all workspaces with document counts for current user
SELECT * FROM workspace_summary 
ORDER BY created_at DESC;

-- Get only active workspaces
SELECT * FROM workspace_summary 
WHERE is_archived = FALSE;
```

**Security:**
- ✅ RLS enforced via `WHERE w.owner_id = auth.uid()`
- ✅ Users only see their own workspace summaries
- ⚠️ View does **not** automatically inherit table RLS policies

---

## Migration Guide

### Migration Script (For Existing Databases)

**Purpose:** Migrate existing `vault_documents` to workspace-based system.

```sql
BEGIN;

-- Step 1: Clean up orphaned documents (optional)
DELETE FROM vault_documents 
WHERE user_id IS NOT NULL 
  AND user_id NOT IN (SELECT id FROM auth.users);

-- Step 2: Create default "Personal Workspace" for all existing users
INSERT INTO workspaces (name, description, owner_id)
SELECT 
  'Personal Workspace', 
  'Your default workspace', 
  id 
FROM auth.users
WHERE id NOT IN (SELECT DISTINCT owner_id FROM workspaces);

-- Step 3: Assign existing documents to user's default workspace
UPDATE vault_documents vd
SET workspace_id = (
  SELECT w.id 
  FROM workspaces w 
  WHERE w.owner_id = vd.user_id 
  ORDER BY w.created_at ASC
  LIMIT 1
)
WHERE workspace_id IS NULL AND user_id IS NOT NULL;

-- Step 4: (Optional) Make workspace_id required for new documents
-- WARNING: This breaks backward compatibility with user_id-only documents
-- ALTER TABLE vault_documents ALTER COLUMN workspace_id SET NOT NULL;

COMMIT;
```

### Migration Strategy

**Phase 1: Soft Launch (Current)**
- ✅ `workspace_id` is **optional** in `vault_documents`
- ✅ Old documents keep `user_id` only
- ✅ New documents require `workspace_id`
- ✅ RLS policies support both patterns

**Phase 2: Full Migration (Future)**
- Run migration script to create default workspaces
- Assign all documents to workspaces
- Make `workspace_id` NOT NULL
- Remove `user_id` backward compatibility from RLS

---

## Usage Examples

### Create a Workspace

```typescript
// Frontend TypeScript
const { data, error } = await supabase
  .from('workspaces')
  .insert({
    name: 'My Project',
    description: 'Project documentation and files',
    owner_id: user.id  // Auth context
  })
  .select()
  .single();
```

### Upload Document to Workspace

```typescript
const { data, error } = await supabase
  .from('vault_documents')
  .insert({
    document_id: uuidv4(),
    workspace_id: workspace.id,  // NEW: Required
    user_id: user.id,
    file_name: 'report.pdf',
    file_path: 'workspace_123/report.pdf',
    file_size: 1024000,
    file_type: 'application/pdf'
  });
```

### Create Active Instruction

```typescript
// Create first instruction (will be active)
const { data, error } = await supabase
  .from('workspace_instructions')
  .insert({
    workspace_id: workspace.id,
    title: 'Code Review Assistant',
    content: 'You are a senior developer reviewing code...',
    is_active: true
  });
```

### Switch Active Instruction

```typescript
// Deactivate current instruction
await supabase
  .from('workspace_instructions')
  .update({ is_active: false })
  .eq('workspace_id', workspace.id)
  .eq('is_active', true);

// Activate new instruction
await supabase
  .from('workspace_instructions')
  .update({ is_active: true })
  .eq('id', newInstructionId);
```

### Get Workspace Documents

```typescript
const { data, error } = await supabase
  .from('vault_documents')
  .select('*')
  .eq('workspace_id', workspace.id)
  .order('upload_timestamp', { ascending: false });
```

### Get Active Instruction

```typescript
const { data, error } = await supabase
  .from('workspace_instructions')
  .select('*')
  .eq('workspace_id', workspace.id)
  .eq('is_active', true)
  .single();
```

### Archive Workspace (Soft Delete)

```typescript
const { data, error } = await supabase
  .from('workspaces')
  .update({ is_archived: true })
  .eq('id', workspace.id);
```

### Get Workspace Summary

```typescript
const { data, error } = await supabase
  .from('workspace_summary')
  .select('*')
  .eq('is_archived', false)
  .order('created_at', { ascending: false });

// Result:
// [
//   {
//     id: 'uuid-1',
//     name: 'My Project',
//     description: '...',
//     owner_id: 'user-uuid',
//     document_count: 15,
//     created_at: '2025-11-15T10:00:00Z',
//     ...
//   }
// ]
```

---

## Troubleshooting

### Common Issues

#### 1. **Error: Unique constraint violation on `workspace_instructions`**

**Cause:** Trying to create/activate a second active instruction in the same workspace.

**Solution:**
```typescript
// Deactivate all instructions first
await supabase
  .from('workspace_instructions')
  .update({ is_active: false })
  .eq('workspace_id', workspaceId)
  .eq('is_active', true);

// Then activate the new one
await supabase
  .from('workspace_instructions')
  .update({ is_active: true })
  .eq('id', instructionId);
```

---

#### 2. **Error: Documents not appearing in workspace**

**Cause:** RLS policies blocking access, or `workspace_id` not set.

**Solution:**
```sql
-- Check if document has workspace_id
SELECT document_id, workspace_id, user_id 
FROM vault_documents 
WHERE document_id = 'uuid';

-- Check if user owns the workspace
SELECT * FROM workspaces 
WHERE id = 'workspace-uuid' 
  AND owner_id = auth.uid();
```

---

#### 3. **Error: Cannot delete workspace (documents exist)**

**Cause:** Misunderstanding - workspace deletion **cascades** to documents.

**Behavior:**
```sql
-- This will DELETE the workspace AND all its documents
DELETE FROM workspaces WHERE id = 'workspace-uuid';
```

**Recommendation:** Use soft delete instead:
```sql
UPDATE workspaces 
SET is_archived = TRUE 
WHERE id = 'workspace-uuid';
```

---

#### 4. **Error: Old documents not accessible**

**Cause:** Documents created before migration have no `workspace_id`.

**Solution:**
```sql
-- Run migration script to assign workspaces
UPDATE vault_documents vd
SET workspace_id = (
  SELECT w.id FROM workspaces w 
  WHERE w.owner_id = vd.user_id 
  LIMIT 1
)
WHERE workspace_id IS NULL;
```

---

#### 5. **Error: View returns no data**

**Cause:** `workspace_summary` view filters by `auth.uid()`, which may not be set.

**Solution:**
```typescript
// Ensure user is authenticated
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  // Redirect to login
}

// Query view
const { data } = await supabase
  .from('workspace_summary')
  .select('*');
```

---

### Debugging Queries

#### Check RLS Policies

```sql
-- View all policies on a table
SELECT schemaname, tablename, policyname, permissive, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'workspaces';
```

#### Test RLS as Specific User

```sql
-- Set session to specific user
SET request.jwt.claim.sub = 'user-uuid';

-- Run queries as that user
SELECT * FROM workspaces;
```

#### Check Index Usage

```sql
-- Explain query plan
EXPLAIN ANALYZE
SELECT * FROM workspaces 
WHERE owner_id = 'user-uuid' 
  AND is_archived = FALSE;

-- Should show "Index Scan using idx_workspaces_owner_id"
```

---

## Best Practices

### 1. **Always Use Workspaces for New Documents**

```typescript
// ✅ GOOD: New documents with workspace_id
const { data } = await supabase
  .from('vault_documents')
  .insert({
    workspace_id: workspace.id,
    user_id: user.id,  // Keep for backward compat
    ...
  });

// ❌ BAD: Documents without workspace_id
const { data } = await supabase
  .from('vault_documents')
  .insert({
    user_id: user.id,  // No workspace_id!
    ...
  });
```

---

### 2. **Use Soft Delete for Workspaces**

```typescript
// ✅ GOOD: Soft delete (recoverable)
await supabase
  .from('workspaces')
  .update({ is_archived: true })
  .eq('id', workspaceId);

// ❌ BAD: Hard delete (permanent, cascades to documents)
await supabase
  .from('workspaces')
  .delete()
  .eq('id', workspaceId);
```

---

### 3. **Handle Active Instructions Carefully**

```typescript
// ✅ GOOD: Deactivate first, then activate
async function switchInstruction(workspaceId, newInstructionId) {
  // Step 1: Deactivate all
  await supabase
    .from('workspace_instructions')
    .update({ is_active: false })
    .eq('workspace_id', workspaceId)
    .eq('is_active', true);
  
  // Step 2: Activate new
  await supabase
    .from('workspace_instructions')
    .update({ is_active: true })
    .eq('id', newInstructionId);
}

// ❌ BAD: Direct activation (will fail if another is active)
await supabase
  .from('workspace_instructions')
  .update({ is_active: true })
  .eq('id', newInstructionId);
```

---

### 4. **Query Performance**

```typescript
// ✅ GOOD: Use indexed columns in WHERE
const { data } = await supabase
  .from('vault_documents')
  .select('*')
  .eq('workspace_id', workspaceId)  // Indexed
  .order('upload_timestamp', { ascending: false });  // Indexed

// ❌ BAD: Filter by non-indexed columns
const { data } = await supabase
  .from('vault_documents')
  .select('*')
  .ilike('file_name', '%report%');  // Not indexed, slow
```

---

### 5. **Use Views for Dashboard Data**

```typescript
// ✅ GOOD: Use workspace_summary view
const { data } = await supabase
  .from('workspace_summary')
  .select('*')
  .eq('is_archived', false);

// ❌ BAD: Manual join and count
const { data } = await supabase
  .from('workspaces')
  .select(`
    *,
    vault_documents (count)
  `)
  .eq('is_archived', false);
```

---

## Related Documentation

- [Supabase Complete Guide](./SUPABASE_COMPLETE_GUIDE.md) - Auth and storage setup
- [Architecture](./ARCHITECTURE.md) - System architecture overview
- [Quick Reference](./QUICK_REFERENCE.md) - Common commands and patterns
- [Setup Guide](./SETUP.md) - Initial project setup

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2025-11-15 | 1.0.0 | Initial schema implementation |

---

## Support

For issues or questions:
1. Check [Troubleshooting](#troubleshooting) section
2. Review [Supabase RLS documentation](https://supabase.com/docs/guides/auth/row-level-security)
3. Check application logs for RLS policy violations

---

**Document Status:** ✅ Production Ready  
**Last Updated:** November 15, 2025  
**Maintained By:** FastMCP-x Team
