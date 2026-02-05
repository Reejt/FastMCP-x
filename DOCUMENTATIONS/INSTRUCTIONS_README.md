# Workspace Instructions System

## Overview

The workspace instructions system allows users to provide custom instructions that guide how Ollama responds to queries within a specific workspace. These instructions are stored in Supabase and automatically applied when querying the LLM.

## Architecture

### Components

1. **`server/instructions.py`** - Core instruction handling module
   - Fetches active instructions from Supabase
   - Builds system prompts with instructions
   - Provides instruction-aware query functions
   - Caches instructions for performance

2. **`frontend/app/api/instructions/route.ts`** - REST API endpoint
   - CRUD operations for workspace instructions
   - GET, POST, PATCH, DELETE methods
   - Handles activation/deactivation

3. **`frontend/lib/supabase/instructions.ts`** - Service layer
   - Database interaction functions
   - Ensures only one active instruction per workspace

4. **Integration in `server/main.py`** - MCP tools registration
   - `query_with_workspace_instructions_tool` - Query with instructions applied
   - `get_workspace_instruction_preview_tool` - Preview active instruction
   - `refresh_workspace_instructions_tool` - Refresh cache

## How It Works

### 1. Instruction Storage (Supabase)

Instructions are stored in the `workspace_instructions` table:

```sql
CREATE TABLE workspace_instructions (
  id UUID PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: Only one active instruction per workspace
CREATE UNIQUE INDEX idx_active_instruction 
ON workspace_instructions(workspace_id, is_active) 
WHERE is_active = true;
```

### 2. Instruction Retrieval

When a query is made with a workspace ID:

```python
from server.instructions import query_with_instructions

response = query_with_instructions(
    query="What is Python?",
    workspace_id="123-456-789",
    model_name="llama3.2:3b"
)
```

The system:
1. Fetches the active instruction from Supabase
2. Caches it for subsequent queries
3. Builds a system prompt combining base prompt + instruction
4. Sends the enhanced prompt to Ollama

### 3. System Prompt Construction

Example prompt structure:

```
You are a helpful assistant.

=== Custom Coding Guidelines ===
Always use TypeScript with strict mode.
Follow functional programming principles.
Add JSDoc comments to all functions.
=== End of Custom Instructions ===

Please follow the custom instructions above when responding to queries.

User Query: How do I create a function in JavaScript?
```

### 4. Cache Management

Instructions are cached in memory to avoid repeated Supabase queries:

```python
# Cache is automatically used
instruction = get_active_instruction(workspace_id)

# Force refresh from Supabase
instruction = get_active_instruction(workspace_id, force_refresh=True)

# Clear cache
clear_instruction_cache(workspace_id)  # Clear specific workspace
clear_instruction_cache()              # Clear all
```

## Usage Examples

### Basic Query with Instructions

```python
from server.instructions import query_with_instructions

response = query_with_instructions(
    query="Explain async/await",
    workspace_id="workspace-123"
)
print(response)
```

### Streaming Query with Instructions

```python
from server.instructions import query_with_instructions_stream

for chunk in query_with_instructions_stream(
    query="Write a REST API",
    workspace_id="workspace-123"
):
    print(chunk.get('response', ''), end='', flush=True)
```

### With Conversation History

```python
history = [
    {"role": "user", "content": "What is FastAPI?"},
    {"role": "assistant", "content": "FastAPI is a modern web framework..."}
]

response = query_with_instructions(
    query="How do I install it?",
    workspace_id="workspace-123",
    conversation_history=history
)
```

### Get Instruction Preview

```python
from server.instructions import get_instruction_preview

preview = get_instruction_preview("workspace-123")
print(preview)
# Output: Active Instruction: Coding Standards
#         Always use TypeScript with strict mode...
```

### Using MCP Tools

From the FastMCP client:

```python
# Query with workspace instructions
result = client.call_tool(
    "query_with_workspace_instructions_tool",
    query="How do I handle errors?",
    workspace_id="workspace-123"
)

# Get instruction preview
preview = client.call_tool(
    "get_workspace_instruction_preview_tool",
    workspace_id="workspace-123"
)

# Refresh cache when instructions are updated
client.call_tool(
    "refresh_workspace_instructions_tool",
    workspace_id="workspace-123"
)
```

## Environment Configuration

Required environment variables in `.env`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Frontend Integration

### Creating an Instruction

```typescript
const response = await fetch('/api/instructions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workspaceId: 'workspace-123',
    title: 'Coding Standards',
    content: 'Always use TypeScript...',
    isActive: true
  })
})
```

### Fetching Active Instruction

```typescript
const response = await fetch(
  '/api/instructions?workspaceId=workspace-123&activeOnly=true'
)
const { instructions } = await response.json()
const activeInstruction = instructions[0]
```

### Updating Instruction

```typescript
await fetch('/api/instructions', {
  method: 'PATCH',
  body: JSON.stringify({
    instructionId: 'instruction-id',
    title: 'Updated Title',
    content: 'Updated content...'
  })
})
```

### Activating/Deactivating

```typescript
// Activate
await fetch('/api/instructions', {
  method: 'PATCH',
  body: JSON.stringify({
    instructionId: 'instruction-id',
    activate: true
  })
})

// Switch to another instruction
await fetch('/api/instructions', {
  method: 'PATCH',
  body: JSON.stringify({
    workspaceId: 'workspace-123',
    instructionId: 'new-instruction-id',
    switchTo: true
  })
})
```

## Best Practices

1. **Keep Instructions Focused** - Clear, specific guidelines work best
2. **Use Descriptive Titles** - Help users identify instruction purpose
3. **Cache Awareness** - Call `refresh_workspace_instructions_tool` after updates
4. **Test Instructions** - Verify they produce expected LLM behavior
5. **Version Instructions** - Create new instructions instead of overwriting

## Limitations

- Only one active instruction per workspace (enforced by unique index)
- Instructions are cached - requires refresh after updates
- Supabase credentials must be configured
- Instructions apply to entire workspace, not per-conversation

## Error Handling

The system gracefully degrades if:
- Supabase is unavailable (queries proceed without instructions)
- No active instruction exists (normal query behavior)
- Environment variables are missing (warning logged, continues)

## Future Enhancements

- Instruction templates library
- Version history for instructions
- Instruction inheritance (workspace → organization → global)
- A/B testing different instructions
- Instruction analytics (usage, effectiveness)
- Role-based instruction access control
