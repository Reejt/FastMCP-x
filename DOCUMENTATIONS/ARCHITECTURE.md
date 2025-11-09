# FastMCP Architecture Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                            │
│                     http://localhost:3000                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ HTTP REST API
                            │ (fetch requests)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NEXT.JS FRONTEND                             │
│                     Port: 3000                                  │
├─────────────────────────────────────────────────────────────────┤
│  Components:                                                    │
│  • Chat Interface (ChatContainer, ChatMessage, ChatInput)       │
│  • Sidebar Navigation (collapsible, persistent)                │
│  • Workspace Management (UI ready)                             │
│                                                                 │
│  Auth: Supabase (magic links)                                  │
│  State: React hooks + localStorage                             │
│  Styling: Tailwind CSS + Framer Motion                         │
│                                                                 │
│  API Routes: /api/chat/query/route.ts                          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ HTTP POST
                            │ /api/query, /api/semantic-search, etc.
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BRIDGE SERVER (FastAPI)                       │
│                     Port: 3001                                  │
├─────────────────────────────────────────────────────────────────┤
│  Purpose: MCP Protocol Bridge                                  │
│                                                                 │
│  Endpoints:                                                     │
│  • POST /api/query              - Main query with context      │
│  • POST /api/query-context      - Query with explicit params   │
│  • POST /api/semantic-search    - Document search              │
│  • POST /api/ingest             - Ingest documents             │
│  • POST /api/query-excel        - Excel/CSV queries            │
│  • POST /api/web-search         - Web search                   │
│  • GET  /api/health             - Health check                 │
│                                                                 │
│  Features:                                                      │
│  • Pydantic request validation                                 │
│  • Persistent MCP client connection                            │
│  • CORS for localhost:3000                                     │
│  • Proper error handling                                       │
│                                                                 │
│  Dependencies:                                                  │
│  • fastapi, uvicorn, pydantic                                  │
│  • client/fast_mcp_client.py (MCP functions)                   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ MCP Protocol
                            │ (fastmcp.Client)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                 FASTMCP SERVER (Backend)                        │
│                     Port: 8000                                  │
├─────────────────────────────────────────────────────────────────┤
│  server/main.py - Tool registration                             │
│                                                                 │
│  MCP Tools (@mcp.tool):                                         │
│  • ingest_file_tool           - Document ingestion             │
│  • answer_query_tool          - Query with context             │
│  • semantic_search_tool       - Semantic document search       │
│  • query_with_context_tool    - Context-aware LLM query        │
│  • query_excel_with_llm_tool  - Excel natural language         │
│  • query_csv_with_llm_tool    - CSV natural language           │
│  • web_search_tool            - Web search + summarization     │
│                                                                 │
│  Modules:                                                       │
│  • document_ingestion.py  - File storage & loading             │
│  • query_handler.py       - Semantic search + LLM integration  │
│  • excel_csv.py          - Structured data queries             │
│  • web_search_file.py    - Tavily API integration              │
│                                                                 │
│  Storage: storage/ directory (auto-created)                    │
│  Models: sentence-transformers (all-MiniLM-L6-v2)              │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ HTTP API
                            │ POST /api/generate
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OLLAMA LLM SERVICE                          │
│                   Port: 11434                                   │
├─────────────────────────────────────────────────────────────────┤
│  Model: llama3.2:1b (default)                                  │
│  Purpose: AI inference for:                                     │
│  • Document-aware question answering                            │
│  • Excel/CSV natural language queries                           │
│  • Web search result summarization                              │
│  • General knowledge queries                                    │
│                                                                 │
│  Timeout: 120s for long operations                             │
│  Endpoint: http://localhost:11434/api/generate                 │
└─────────────────────────────────────────────────────────────────┘

                            ▲
                            │
                            │ External HTTP
                            │
┌─────────────────────────────────────────────────────────────────┐
│                    TAVILY SEARCH API                            │
│                  (External Service)                             │
├─────────────────────────────────────────────────────────────────┤
│  Purpose: Web search for real-time information                 │
│  Used by: web_search_tool                                      │
│  Content: Extracted via BeautifulSoup4                         │
└─────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────┐
│                    STORAGE (File System)                        │
│                    storage/ directory                           │
├─────────────────────────────────────────────────────────────────┤
│  Purpose: Persistent document storage                           │
│  Contents:                                                      │
│  • Ingested documents (copied from source)                     │
│  • Auto-loaded on server startup                               │
│                                                                 │
│  Supported Formats:                                             │
│  • Text: .txt, .md                                             │
│  • Documents: .pdf, .doc, .docx                                │
│  • Presentations: .ppt, .pptx                                  │
│  • Spreadsheets: .csv, .xls, .xlsx                             │
└─────────────────────────────────────────────────────────────────┘

```

## Data Flow

### 1. User Query Flow
```
User Input
   ↓
ChatInput Component (frontend)
   ↓
ChatContainer state update
   ↓
fetch('/api/chat/query', {query, action: 'query'})
   ↓
Next.js API Route (/api/chat/query/route.ts)
   ↓
fetch('http://localhost:3001/api/query', {query})
   ↓
Bridge Server (bridge_server.py)
   ↓
await answer_query(mcp_client, query)
   ↓
MCP Protocol: call_tool("answer_query_tool", {query})
   ↓
FastMCP Server (server/main.py)
   ↓
query_handler.py: answer_query()
   ↓
Semantic Search → Find relevant documents
   ↓
query_with_context() → Enrich LLM prompt
   ↓
query_model() → HTTP POST to Ollama
   ↓
Ollama generates response
   ↓
Response flows back through stack
   ↓
User sees answer in chat
```

### 2. Document Ingestion Flow
```
User uploads file
   ↓
Frontend sends file path to /api/chat/query
   ↓
action: 'ingest', file_path: 'D:/docs/file.pdf'
   ↓
Bridge Server: POST /api/ingest
   ↓
await ingest_file(mcp_client, file_path)
   ↓
MCP: call_tool("ingest_file_tool", {file_path})
   ↓
document_ingestion.py: ingest_file()
   ↓
Copy file to storage/
   ↓
Extract text (utils/file_parser.py)
   ↓
Store in documents list (in-memory)
   ↓
Return success message
   ↓
User sees confirmation
```

### 3. Semantic Search Flow
```
User searches documents
   ↓
Frontend: action: 'semantic_search'
   ↓
Bridge Server: POST /api/semantic-search
   ↓
await semantic_search(mcp_client, query, top_k)
   ↓
MCP: call_tool("semantic_search_tool", {query, top_k})
   ↓
query_handler.py: semantic_search()
   ↓
Load sentence-transformers model
   ↓
Generate embeddings for query
   ↓
Calculate cosine similarity with documents
   ↓
Return top K matches with similarity scores
   ↓
User sees relevant document chunks
```

### 4. Web Search Flow
```
User asks web-based question
   ↓
Frontend: action: 'web_search'
   ↓
Bridge Server: POST /api/web-search
   ↓
await web_search(mcp_client, query)
   ↓
MCP: call_tool("web_search_tool", {query})
   ↓
web_search_file.py: tavily_web_search()
   ↓
HTTP GET to Tavily API
   ↓
Extract content with BeautifulSoup4
   ↓
Pass content to Ollama for summarization
   ↓
Return summarized answer
   ↓
User sees web-informed response
```

## Component Communication

### Protocol Stack
```
Layer 7 (Application):  User Interface (React Components)
Layer 6 (Presentation): HTTP/JSON API (REST)
Layer 5 (Session):      Bridge Server (FastAPI)
Layer 4 (Transport):    MCP Protocol (fastmcp.Client)
Layer 3 (Network):      FastMCP Server (Tool Handlers)
Layer 2 (Data Link):    Python Functions (Business Logic)
Layer 1 (Physical):     Ollama API (HTTP) + File System
```

### Connection Types
```
Frontend ←→ Bridge:     HTTP REST (stateless)
Bridge ←→ FastMCP:      MCP Protocol (persistent connection)
FastMCP ←→ Ollama:      HTTP API (stateless)
FastMCP ←→ Storage:     File System (read/write)
FastMCP ←→ Tavily:      HTTP API (stateless)
```

## Startup Sequence

```
1. User runs: .\start_servers.ps1
   │
   ├─→ 2. Check Ollama is running
   │     └─→ curl http://localhost:11434/api/tags
   │
   ├─→ 3. Start FastMCP Server (Terminal 1)
   │     └─→ python server/main.py
   │           └─→ Load documents from storage/
   │           └─→ Register MCP tools
   │           └─→ Listen on port 8000
   │
   ├─→ 4. Start Bridge Server (Terminal 2)
   │     └─→ python bridge_server.py
   │           └─→ Connect to FastMCP (MCP client)
   │           └─→ Register FastAPI endpoints
   │           └─→ Listen on port 3001
   │
   └─→ 5. Start Frontend (Terminal 3)
       └─→ cd frontend && npm run dev
             └─→ Load environment variables
             └─→ Start Next.js dev server
             └─→ Listen on port 3000

6. User opens: http://localhost:3000
   └─→ Frontend loads
       └─→ Auth check (Supabase)
       └─→ Redirect to /login or /dashboard
```

## Error Flow

```
Error occurs in:
   │
   ├─→ Ollama
   │     └─→ HTTP error
   │           └─→ FastMCP catches: requests.RequestException
   │                 └─→ Returns: "API error: {message}"
   │                       └─→ Bridge Server catches: Exception
   │                             └─→ HTTPException(500, detail="...")
   │                                   └─→ Next.js receives error
   │                                         └─→ Frontend shows error message
   │
   ├─→ FastMCP Server
   │     └─→ Tool execution error
   │           └─→ Returns: "Error: {message}"
   │                 └─→ Bridge Server receives error response
   │                       └─→ HTTPException(500, detail="...")
   │                             └─→ Frontend shows error
   │
   ├─→ Bridge Server
   │     └─→ MCP connection error
   │           └─→ HTTPException(503, "MCP client not connected")
   │                 └─→ Frontend shows service unavailable
   │
   └─→ Frontend
       └─→ Fetch error
             └─→ catch block
                   └─→ Show error toast/message
```

## Security Boundaries

```
Public Internet
   ║
   ║ HTTPS (Production)
   ║
   ▼
┌──────────────────────────┐
│  Next.js Frontend        │  ← Supabase Auth
│  (Port 3000)             │
└────────┬─────────────────┘
         │ localhost only
         │ CORS restricted
         ▼
┌──────────────────────────┐
│  Bridge Server           │  ← No auth (trusted network)
│  (Port 3001)             │
└────────┬─────────────────┘
         │ localhost only
         │ MCP protocol
         ▼
┌──────────────────────────┐
│  FastMCP Server          │  ← File path validation
│  (Port 8000)             │
└────────┬─────────────────┘
         │ localhost only
         │
         ├─→ Ollama (local)
         ├─→ File System (restricted to storage/)
         └─→ Tavily API (external, requires key)
```

---

*Generated: November 8, 2025*
*Version: 1.0*
