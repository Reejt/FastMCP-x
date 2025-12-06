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
│  • Workspace Management (create, edit, delete, search)         │
│  • Vault Management (upload, list, delete documents)           │
│  • Instructions Management (create, edit, activate, preview)   │
│                                                                 │
│  Auth: Supabase (magic links)                                  │
│  State: React hooks + localStorage                             │
│  Styling: Tailwind CSS + Framer Motion                         │
│                                                                 │
│  API Routes:                                                    │
│  • /api/chat/query          - Chat queries with workspace ctx  │
│  • /api/vault/upload        - Document upload                  │
│  • /api/workspaces          - Workspace CRUD                   │
│  • /api/instructions        - Instruction CRUD                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ HTTP POST
                            │ /api/query, /api/semantic-search, etc.
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BRIDGE SERVER (FastAPI)                       │
│                     Port: 3001                                  │
├─────────────────────────────────────────────────────────────────┤
│  Purpose: MCP Protocol Bridge + Workspace Intelligence         │
│                                                                 │
│  Endpoints:                                                     │
│  • POST /api/query              - Main query with workspace ctx│
│  • POST /api/ingest             - Ingest documents (base64)    │
│  • POST /api/query-excel        - Excel/CSV queries            │
│  • POST /api/web-search         - Web search                   │
│  • GET  /api/health             - Health check                 │
│                                                                 │
│  Features:                                                      │
│  • Workspace-aware query routing                               │
│  • Automatic instruction application (workspace_id param)      │
│  • SSE streaming for real-time responses                       │
│  • URL detection & link content extraction                     │
│  • Web search pattern detection (versions, CVEs, etc.)         │
│  • Pydantic request validation                                 │
│  • CORS for localhost:3000                                     │
│  • Proper error handling                                       │
│                                                                 │
│  Dependencies:                                                  │
│  • fastapi, uvicorn, pydantic                                  │
│  • server/instructions.py (workspace instructions)             │
│  • server/query_handler.py (semantic search)                   │
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
│  • ingest_file_tool              - Document ingestion          │
│  • answer_query_tool             - Query with context          │
│  • query_excel_with_llm_tool     - Excel natural language      │
│  • query_csv_with_llm_tool       - CSV natural language        │
│  • web_search_tool               - Web search + summarization  │
│  • answer_link_query_tool        - URL content extraction + Q&A│
│  • get_active_instruction_tool   - Fetch workspace instruction │
│  • get_instruction_preview_tool  - Get instruction preview     │
│  • clear_instruction_cache_tool  - Refresh instruction cache   │
│                                                                 │
│  Modules:                                                       │
│  • document_ingestion.py  - File storage & loading             │
│  • query_handler.py       - Semantic search + LLM integration  │
│  • excel_csv.py          - Structured data queries             │
│  • web_search_file.py    - Tavily API integration              │
│  • instructions.py       - Workspace-specific AI instructions  │
│                                                                 │
│  Storage: storage/ directory (auto-created)                    │
│  Models: sentence-transformers (all-MiniLM-L6-v2)              │
│  Database: Supabase (workspace_instructions, vault_documents)  │
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
│                    STORAGE LAYER                                │
├─────────────────────────────────────────────────────────────────┤
│  1. SUPABASE DATABASE                                          │
│     • vault_documents table (metadata)                         │
│       - document_id, user_id, workspace_id                     │
│       - file_name, file_path, file_size, file_type            │
│       - upload_timestamp, metadata (JSONB)                     │
│     • workspaces table (workspace info)                        │
│     • workspace_instructions table (custom AI instructions)    │
│                                                                 │
│  2. FILE SYSTEM (storage/ directory)                           │
│     • Persistent document storage                              │
│     • Ingested documents (copied from source)                  │
│     • Auto-loaded on server startup                            │
│     • Path structure: storage/{filename}                       │
│                                                                 │
│  Supported Formats:                                             │
│  • Text: .txt, .md                                             │
│  • Documents: .pdf, .doc, .docx                                │
│  • Presentations: .ppt, .pptx                                  │
│  • Spreadsheets: .csv, .xls, .xlsx                             │
└─────────────────────────────────────────────────────────────────┘

```

## Data Flow

### 1. User Query Flow (With Workspace Instructions)
```
User Input in workspace chat
   ↓
ChatInput Component (frontend)
   ↓
Dashboard fetches active instruction for workspace
   ↓
ChatContainer state update
   ↓
fetch('/api/chat/query', {
   query, 
   conversation_history,
   workspace_id  ← Included for instruction application
})
   ↓
Next.js API Route (/api/chat/query/route.ts)
   ↓
Forwards workspace_id to bridge server
   ↓
fetch('http://localhost:3001/api/query', {
   query,
   conversation_history,
   workspace_id
})
   ↓
Bridge Server (bridge_server.py)
   ↓
Checks if workspace_id exists
   │
   ├─→ If workspace_id:
   │     └─→ query_with_instructions_stream()
   │           ↓
   │           Fetches active instruction from Supabase
   │           ↓
   │           Builds system prompt with instruction
   │           ↓
   │           Sends enhanced prompt to Ollama
   │
   └─→ If no workspace_id:
         └─→ answer_query() (standard flow)
               ↓
               Semantic Search → Find relevant documents
               ↓
               query_with_context() → Enrich LLM prompt
   ↓
query_model() → HTTP POST to Ollama
   ↓
Ollama generates response (following workspace instructions)
   ↓
Response streams back through SSE
   ↓
User sees answer in chat (guided by workspace rules)
```

### 2. Document Ingestion Flow
```
User uploads file in Vault page
   ↓
Frontend: /vault/page.tsx handles file upload
   ↓
File converted to base64
   ↓
POST /api/vault/upload
   ↓
Next.js API Route: /api/vault/upload/route.ts
   ↓
Validates file (size, type)
   ↓
Stores metadata in Supabase (vault_documents table)
   ↓
   ├─→ If user_id provided: Associates with workspace
   │   └─→ Records: file_name, file_path, file_size, file_type, workspace_id
   │
   └─→ Sends base64 file to Bridge Server
       ↓
       POST http://localhost:3001/api/ingest
       ↓
       Bridge Server: ingest_endpoint()
       ↓
       Decodes base64 → Creates temp file
       ↓
       await ingest_file(mcp_client, temp_file_path, user_id)
       ↓
       MCP: call_tool("ingest_file_tool", {file_path, user_id})
       ↓
       FastMCP Server: ingest_file_tool()
       ↓
       document_ingestion.py: ingest_file()
       ↓
       Copy file to storage/ directory
       ↓
       Extract text (utils/file_parser.py)
         ↓
         Supports: .txt, .pdf, .docx, .pptx, .csv, .xlsx
       ↓
       Store in documents list (in-memory)
         └─→ {"content": str, "filename": str, "filepath": str}
       ↓
       Auto-loads on server restart from storage/
       ↓
       Return success message
       ↓
       Clean up temp file
       ↓
       Frontend receives confirmation
       ↓
       UI updates with new document in workspace vault
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
