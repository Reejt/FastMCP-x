# FastMCP Bridge Server

A FastAPI server that bridges the Next.js frontend with the FastMCP backend using the Python MCP client directly, instead of HTTP requests.

## Architecture

```
Next.js Frontend (Port 3000)
    ↓ HTTP (workspace_id, query)
Bridge Server (Port 3001)
    ↓ MCP Protocol / Direct Python Calls
FastMCP Server (Port 8000)
    ↓ Instructions Module (Supabase)
    ↓ Query Handler (Semantic Search)
    ↓
Ollama LLM + Documents + Workspace Instructions
```

## Why This Approach?

- **Direct MCP Communication**: Uses the official FastMCP Python client
- **Type Safety**: Pydantic models for request validation
- **Better Error Handling**: Proper exception propagation
- **Connection Pooling**: Single persistent MCP client connection
- **Async Native**: Full async/await support throughout
- **Workspace Intelligence**: Automatic workspace instructions integration
- **Streaming Support**: Server-Sent Events (SSE) for real-time responses
- **Flexible Routing**: Conditional query routing based on workspace context

## Setup

### 1. Install Dependencies

```powershell
pip install -r requirements.txt
```

Ensure you have:
- `fastapi`
- `uvicorn[standard]`
- `pydantic`
- `fastmcp`

### 2. Start the Services

#### Option A: Use the Startup Script (Recommended)

```powershell
.\start_servers.ps1
```

This will automatically start:
1. FastMCP Server (port 8000)
2. Bridge Server (port 3001)
3. Next.js Frontend (port 3000)

#### Option B: Manual Start

**Terminal 1 - FastMCP Server:**
```powershell
python server/main.py
```

**Terminal 2 - Bridge Server:**
```powershell
python bridge_server.py
```

**Terminal 3 - Next.js Frontend:**
```powershell
cd frontend
npm run dev
```

### 3. Configure Frontend

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_BRIDGE_SERVER_URL=http://localhost:3001
```

## API Endpoints

### Bridge Server Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/api/query` | POST | Answer query with document context (workspace-aware, SSE streaming) |
| `/api/query-context` | POST | Query with explicit context retrieval |
| `/api/semantic-search` | POST | Semantic search across documents |
| `/api/ingest` | POST | Ingest a document to workspace vault (base64 upload) |
| `/api/query-excel` | POST | Query Excel/CSV files |
| `/api/web-search` | POST | Web search with summarization |
| `/api/health` | GET | Detailed health check |

### Request Examples

#### Simple Query
```json
POST /api/query
{
  "query": "What is the company revenue?",
  "workspace_id": "uuid-of-workspace" // Optional: enables workspace instructions
}
```

**With Workspace Instructions:**
When `workspace_id` is provided, the bridge server:
1. Routes to `query_with_instructions_stream()` in instructions module
2. Fetches active instruction from Supabase
3. Applies instruction to system prompt
4. Streams response via SSE

**Without Workspace:**
Routes to standard `answer_query()` for general queries

#### Query with Context
```json
POST /api/query-context
{
  "query": "What is the company revenue?",
  "max_chunks": 5,
  "include_context_preview": true
}
```

#### Semantic Search
```json
POST /api/semantic-search
{
  "query": "financial performance",
  "top_k": 10
}
```

#### Ingest Document
```json
POST /api/ingest
{
  "file_content": "base64EncodedString",
  "filename": "report.pdf",
  "workspace_id": "uuid-of-workspace"
}
```

**Flow:**
1. Frontend uploads file via `/api/vault/upload`
2. File stored in Supabase `vault_documents` table
3. Bridge server receives base64 content
4. Decodes and writes temporary file
5. Calls MCP `ingest_file` tool
6. Document copied to `storage/` directory
7. Auto-loaded on server restart

#### Query Excel
```json
POST /api/query-excel
{
  "file_path": "D:/data/sales.xlsx",
  "query": "What were the total sales in Q4?",
  "sheet_name": "2024"
}
```

#### Web Search
```json
POST /api/web-search
{
  "query": "latest AI developments 2025"
}
```

### Workspace Instructions Integration

The bridge server intelligently routes queries based on workspace context:

```python
# In bridge_server.py
@app.post("/api/query")
async def query_endpoint(request: QueryRequest):
    if request.workspace_id:
        # Route to instructions-aware handler
        return StreamingResponse(
            query_with_instructions_stream(
                request.workspace_id,
                request.query
            ),
            media_type="text/event-stream"
        )
    else:
        # Standard query without workspace context
        response = await answer_query(mcp_client, request.query)
        return {"success": True, "response": response}
```

**Instruction Flow:**
1. Frontend passes `workspace_id` from dashboard
2. Bridge server checks if workspace_id exists
3. Calls `get_active_instruction(workspace_id)` from instructions module
4. Instruction fetched from Supabase, cached in-memory
5. System prompt built: `base_prompt + "\n\nIMPORTANT INSTRUCTIONS:\n" + instruction_content`
6. Query sent to Ollama with enhanced prompt
7. Response streamed back via SSE

**Graceful Degradation:**
- No workspace_id: Uses standard query flow
- No active instruction: Uses base prompt only
- Supabase error: Logs error, continues without instruction

## Frontend Integration

The Next.js frontend connects to the bridge server through `/api/chat/query/route.ts`:

```typescript
// Usage in components (from dashboard/page.tsx)
const response = await fetch('/api/chat/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'Your question here',
    workspace_id: selectedWorkspaceId, // Automatically includes workspace context
    action: 'query' // or 'semantic_search', 'web_search', etc.
  })
});
```

**Workspace Context:**
- Dashboard fetches active instruction on workspace change
- Displays instruction banner with title/content
- Passes workspace_id in all chat queries
- Instructions automatically applied to Ollama prompts

### Available Actions

- `query` - Standard query with document context
- `query_context` - Query with explicit context parameters
- `semantic_search` - Semantic search only
- `web_search` - Web search
- `query_excel` - Query Excel/CSV files
- `ingest` - Ingest new documents

## Connection Management

The bridge server maintains a persistent connection to the FastMCP server:

- **Initialization**: Connection established on startup via `lifespan` context manager
- **Reuse**: Same client instance used for all requests
- **Cleanup**: Proper cleanup on shutdown
- **Direct Python Access**: Instructions module called directly (not via MCP protocol)
- **Supabase Connection**: Instructions module uses REST API for Supabase queries
- **Caching**: In-memory instruction cache for performance (invalidated manually or on TTL)

## Error Handling

All endpoints return standardized responses:

**Success:**
```json
{
  "success": true,
  "response": "Answer here",
  "query": "Original question"
}
```

**Error:**
```json
{
  "detail": "Error message"
}
```

## Monitoring

Check bridge server status:
```bash
curl http://localhost:3001/api/health
```

Response:
```json
{
  "status": "healthy",
  "mcp_connected": true,
  "endpoints": {
    "query": "/api/query",
    "query_context": "/api/query-context",
    ...
  }
}
```

## Troubleshooting

### Bridge Server Won't Start

1. **Check FastMCP Server**: Ensure it's running on port 8000
   ```powershell
   curl http://localhost:8000
   ```

2. **Check Port Availability**: Ensure port 3001 is free
   ```powershell
   netstat -ano | findstr :3001
   ```

3. **Check Dependencies**: Reinstall if needed
   ```powershell
   pip install -r requirements.txt --force-reinstall
   ```

### Frontend Can't Connect

1. **Verify Bridge Server**: 
   ```powershell
   curl http://localhost:3001/api/health
   ```

2. **Check Environment Variable**: Ensure `.env.local` has correct URL

3. **Check CORS**: Bridge server allows `localhost:3000` by default

### MCP Connection Issues

1. **Check FastMCP Server Logs**: Look for errors in Terminal 1
2. **Restart Services**: Use `start_servers.ps1` to restart all services
3. **Check Ollama**: Ensure Ollama is running
   ```powershell
   ollama serve
   ```

### Workspace Instructions Not Applied

1. **Verify Supabase Connection**: Check environment variables in `.env`
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-service-role-key
   ```

2. **Check Instruction Status**: Ensure instruction is active in database
   ```sql
   SELECT * FROM workspace_instructions WHERE workspace_id = 'uuid' AND is_active = true;
   ```

3. **Clear Instruction Cache**: Use MCP tool or restart server
   ```python
   # Via MCP tool
   result = await client.call_tool("refresh_workspace_instructions_tool", {})
   ```

4. **Check Bridge Server Logs**: Look for instruction fetch errors
   - "Successfully fetched instruction" = working
   - "No active instruction" = create one in frontend
   - "Supabase error" = check credentials

## Performance

- **Connection**: Single persistent MCP client (no connection overhead per request)
- **Async**: All operations are async for better concurrency
- **Timeout**: 120s timeout for LLM operations (configurable in FastMCP server)
- **Streaming**: SSE for real-time response chunks (reduces perceived latency)
- **Instruction Caching**: In-memory cache prevents repeated Supabase queries
- **Semantic Search**: sentence-transformers with cosine similarity (600 char chunks, 50 char overlap)
- **Base64 Upload**: Efficient binary file transfer to bridge server

## Development

### Adding New Endpoints

1. Add function to `client/fast_mcp_client.py`:
```python
async def my_new_tool(client, param: str):
    result = await client.call_tool("my_tool_name", {"param": param})
    return result.data
```

2. Add route to `bridge_server.py`:
```python
@app.post("/api/my-endpoint")
async def my_endpoint(request: MyRequest):
    response = await my_new_tool(mcp_client, request.param)
    return {"success": True, "response": response}
```

3. Update Next.js route in `frontend/app/api/chat/query/route.ts`

### Adding Direct Module Access (like Instructions)

For modules that need direct Python access (not via MCP):

```python
# In bridge_server.py
from server.my_module import my_function

@app.post("/api/my-endpoint")
async def my_endpoint(request: MyRequest):
    # Direct call (no MCP client needed)
    result = my_function(request.param)
    return {"success": True, "result": result}
```

**When to use direct access:**
- Need streaming responses (SSE)
- Complex Supabase queries
- Performance-critical paths
- Multi-step workflows with conditionals

## Security Notes

- Bridge server runs on localhost only (not exposed externally)
- CORS restricted to Next.js frontend ports
- No authentication on bridge layer (handled by Next.js + Supabase)
- File paths validated by FastMCP server
- **Workspace Isolation**: Instructions only fetched for valid workspace_id
- **Base64 Upload**: Binary files transferred securely via POST body
- **Environment Variables**: Sensitive keys (Supabase, Tavily) in `.env` file
- **SQL Injection**: Supabase REST API handles parameterization automatically
- **LLM Safety**: Instructions applied to system prompt (not user-controllable at query time)

## License

Same as parent FastMCP-x project
