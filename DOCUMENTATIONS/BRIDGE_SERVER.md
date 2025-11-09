# FastMCP Bridge Server

A FastAPI server that bridges the Next.js frontend with the FastMCP backend using the Python MCP client directly, instead of HTTP requests.

## Architecture

```
Next.js Frontend (Port 3000)
         ↓ HTTP
Bridge Server (Port 3001)
         ↓ MCP Protocol
FastMCP Server (Port 8000)
         ↓
Ollama LLM + Documents
```

## Why This Approach?

- **Direct MCP Communication**: Uses the official FastMCP Python client
- **Type Safety**: Pydantic models for request validation
- **Better Error Handling**: Proper exception propagation
- **Connection Pooling**: Single persistent MCP client connection
- **Async Native**: Full async/await support throughout

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
| `/api/query` | POST | Answer query with document context |
| `/api/query-context` | POST | Query with explicit context retrieval |
| `/api/semantic-search` | POST | Semantic search across documents |
| `/api/ingest` | POST | Ingest a new document |
| `/api/query-excel` | POST | Query Excel/CSV files |
| `/api/web-search` | POST | Web search with summarization |
| `/api/health` | GET | Detailed health check |

### Request Examples

#### Simple Query
```json
POST /api/query
{
  "query": "What is the company revenue?"
}
```

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
  "file_path": "D:/documents/report.pdf"
}
```

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

## Frontend Integration

The Next.js frontend connects to the bridge server through `/api/chat/query/route.ts`:

```typescript
// Usage in components
const response = await fetch('/api/chat/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'Your question here',
    action: 'query' // or 'semantic_search', 'web_search', etc.
  })
});
```

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

## Performance

- **Connection**: Single persistent MCP client (no connection overhead per request)
- **Async**: All operations are async for better concurrency
- **Timeout**: 120s timeout for LLM operations (configurable in FastMCP server)

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

## Security Notes

- Bridge server runs on localhost only (not exposed externally)
- CORS restricted to Next.js frontend ports
- No authentication on bridge layer (handled by Next.js + Supabase)
- File paths validated by FastMCP server

## License

Same as parent FastMCP-x project
