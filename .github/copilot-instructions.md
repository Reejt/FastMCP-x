# FastMCP-x Copilot Instructions

## Architecture Overview

This is a **full-stack enterprise application** combining a Model Context Protocol (MCP) server backend with a Next.js frontend, connected via a FastAPI bridge server. The architecture follows a modular, production-ready design with database-first approach:

### Backend (FastMCP Server)
- **FastMCP Protocol**: `server/main.py` implements MCP protocol with tool registration
- **Core Modules**:
  - `document_ingestion.py` - File ingestion to Supabase Storage, metadata in PostgreSQL
  - `query_handler.py` - pgvector similarity search, context-aware LLM queries with conversation history
  - `csv_excel_processor.py` - Natural language queries for Excel/CSV files using pandas
  - `web_search_file.py` - Tavily API integration for web search with LLM summarization
  - `mermaid_converter.py` - LLM-powered diagram generation (flowcharts, sequence diagrams, etc.)
  - `instructions.py` - Workspace-specific instruction management and caching
- **Single FastMCP Instance**: All tools registered via `@mcp.tool` decorator in `server/main.py`
- **LLM Integration**: Ollama (default: llama3.2:3b) via HTTP API at `localhost:11434`
- **Database**: Supabase PostgreSQL with pgvector extension for enterprise-scale semantic search

### Bridge Server (FastAPI)
- **File**: `bridge_server.py`
- **Purpose**: Connects Next.js frontend to FastMCP backend, handles protocol translation
- **Port**: 3001 (HTTP REST API)
- **Key Features**:
  - Translates HTTP requests to MCP protocol calls
  - Manages file uploads to Supabase Storage
  - Handles streaming responses from Ollama
  - Provides endpoints for diagram generation, chat title generation, and web search
  - Implements AbortController support for canceling LLM streaming

### Frontend (Next.js)
- **Framework**: Next.js 14 with App Router and TypeScript
- **Authentication**: Supabase Auth with magic links
- **UI Components**: 
  - Chat interface with streaming support and cancel capability
  - Collapsible sidebar with workspace navigation
  - Mermaid diagram preview system
  - File vault with multi-format support
  - Context menu for chat session management
- **Styling**: Tailwind CSS + Framer Motion animations
- **State**: Supabase database for persistent state, React hooks for UI state

**Critical**: Three-tier architecture (Frontend → Bridge → FastMCP) with full database integration for production scalability.

## Key Data Flow

### Backend Data Flow
1. **Document Ingestion**: 
   - `ingest_file()` uploads files to Supabase Storage bucket (`user_files`)
   - Extracts text via `utils/file_parser.py`
   - Stores metadata in `files` table with `user_id`, `workspace_id`, `file_name`, `file_size`
   - Chunks documents (600 chars, 50 char overlap) and generates 384-dim embeddings
   - Stores embeddings in `document_embeddings` table with pgvector support

2. **Query Processing**:
   - `answer_query()` performs pgvector similarity search at database level using `<=>` operator
   - `semantic_search_pgvector()` queries embeddings directly from PostgreSQL (no in-memory cache)
   - Filters by `workspace_id` and optional `selected_file_ids`
   - Similarity threshold: 0.2 (configurable)
   - Returns top-k chunks with file metadata for context-aware responses
   - Supports conversation history for multi-turn dialogues

3. **LLM Querying**:
   - `query_model()` calls Ollama HTTP API at `http://localhost:11434/api/generate`
   - Default model: `llama3.2:3b` (lighter, faster than 8b version)
   - 120s timeout for large content summarization
   - Supports conversation history as JSON array
   - Streaming responses with cancel support via AbortController

4. **Structured Data**: 
   - `query_csv_with_context_tool()` / `query_excel_with_context_tool()` download from Supabase Storage
   - Load data with pandas, apply keyword filtering for relevant rows
   - Combine with conversation history and selected file context
   - LLM analyzes data and answers with natural language

5. **Web Search**:
   - `tavily_web_search()` fetches top result via Tavily API
   - Extracts content with BeautifulSoup4
   - Passes to LLM with conversation history for context-aware summarization

6. **Diagram Generation**:
   - `convert_query_to_mermaid_markdown()` in `mermaid_converter.py`
   - LLM generates Mermaid syntax from user query or data
   - `clean_mermaid_syntax()` fixes common LLM errors (broken arrows, malformed labels)
   - Frontend renders with Mermaid.js library in pop-in panel

7. **Workspace Instructions**:
   - `get_active_instruction()` fetches from `workspace_instructions` table
   - Cached in-memory with TTL refresh
   - Automatically included in LLM prompts for workspace-specific behavior
   - Switchable via context menu in UI

8. **Chat Session Management**:
   - Messages stored in `chats` table with `chat_session_id`, `workspace_id`, `role`, `content`
   - `generate_chat_title()` creates descriptive titles (max 6 words) using LLM
   - Auto-generates title after first message, manual regeneration via context menu

**Important**: All data persists in Supabase PostgreSQL. No in-memory document storage. pgvector handles embeddings at enterprise scale (<10ms queries).

## Setup Instructions

### Backend Setup
1. **Python Requirements**: Ensure Python 3.9+ is installed (3.11 recommended)
2. **Install Dependencies**:
   ```powershell
   pip install -r requirements.txt
   ```
   Core dependencies: `fastmcp`, `fastapi`, `pandas`, `sentence-transformers`, `scikit-learn`, `requests`, `beautifulsoup4`, `python-docx`, `python-pptx`, `pypdf`, `openpyxl`, `supabase`, `vecs`

3. **Install Ollama**:
   - Download from https://ollama.ai
   - Start service: `ollama serve` (or `brew services start ollama` on macOS)
   - Pull model: `ollama pull llama3.2:3b`
   
4. **Configure Supabase**:
   - Create `.env.local` in root directory (or `server/.env.local`)
   - Add Supabase credentials:
     ```env
     NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
     SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
     ```
   - Enable pgvector extension in Supabase SQL editor: `CREATE EXTENSION IF NOT EXISTS vector;`
   - Run database migrations from `DOCUMENTATIONS/PGVECTOR_ENTERPRISE_MIGRATION.md`

5. **Verify Installation**:
   ```powershell
   python server/main.py
   ```
   Server should start and connect to Supabase

### Frontend Setup
1. **Install Node.js 18+**
2. **Install Dependencies**:
   ```powershell
   cd frontend
   npm install
   ```

3. **Configure Supabase**:
   - Create `frontend/.env.local` 
   - Add Supabase credentials (same as backend):
     ```env
     NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
     ```
   - Add `http://localhost:3000/auth/callback` to Supabase redirect URLs

4. **Run Development Server**:
   ```powershell
   npm run dev
   ```
   Open http://localhost:3000

### Bridge Server Setup
1. **Start Bridge Server**:
   ```powershell
   python3 bridge_server.py
   ```
   Runs on `http://localhost:3001`

### Docker Deployment (Recommended)
```bash
# Development mode with hot-reload
docker-compose -f docker-compose.dev.yml up --build

# Production mode
docker-compose up --build
```

### Storage Directory
- **DEPRECATED**: Local `storage/` directory no longer used
- All files stored in Supabase Storage bucket: `user_files`
- Embeddings stored in `document_embeddings` table with pgvector
- No local file system dependencies

## Development Workflows

### Starting the Full Stack
1. **Start Ollama** (if not running as service):
   ```bash
   ollama serve
   ```

2. **Start Backend Server**:
   ```bash
   python server/main.py
   ```
   Runs on `http://localhost:8000`

3. **Start Bridge Server**:
   ```bash
   python3 bridge_server.py
   ```
   Runs on `http://localhost:3001`

4. **Start Frontend**:
   ```bash
   cd frontend && npm run dev
   ```
   Runs on `http://localhost:3000`

**Note**: Use `docker-compose -f docker-compose.dev.yml up` to start all services at once with hot-reload.

### Adding New File Format Support
1. Update `SUPPORTED_FILE_TYPES` in `config/settings.py`
2. Add parsing logic in `utils/file_parser.py`'s `extract_text_from_file()` function
3. Install required libraries in `requirements.txt`
4. Update `document_ingestion.py` to handle new format's metadata

### Adding New LLM Support
1. Add model logic in `query_handler.py`'s `query_model()` function
2. Use `requests.post()` pattern for HTTP APIs (like Ollama)
3. Handle `requests.RequestException` errors appropriately
4. Document model requirements and endpoint configuration
5. Update default model in `server/main.py` if needed

### Adding New MCP Tools
1. Define tool function in appropriate module (e.g., `web_search_file.py`)
2. Register in `server/main.py` with `@mcp.tool` decorator
3. Follow existing patterns for conversation history support
4. Update bridge server endpoint if new HTTP route needed
5. Add frontend API route in `frontend/app/api/`
6. Update client in `client/fast_mcp_client.py` if direct MCP access needed

### Working with pgvector Embeddings
1. **Regenerate All Embeddings**:
   ```bash
   python scripts/regenerate_embeddings.py
   ```
   Useful after database schema changes or model upgrades

2. **Query Database Directly** (for debugging):
   ```sql
   -- Check embedding count
   SELECT COUNT(*) FROM document_embeddings;
   
   -- Find similar embeddings
   SELECT file_name, content, 1 - (embedding <=> '[...]'::vector) as similarity
   FROM document_embeddings
   ORDER BY embedding <=> '[...]'::vector
   LIMIT 5;
   ```

3. **Test Similarity Search**:
   Use `server/query_handler.py`'s `semantic_search_pgvector()` function directly

## Project Conventions

### MCP Tools Registration
All tools are registered in `server/main.py` using the `@mcp.tool` decorator:
```python
@mcp.tool
def tool_name(param: str, conversation_history: str = "[]", workspace_id: str = None) -> str:
    """Tool description with conversation history support"""
    try:
        history = json.loads(conversation_history) if conversation_history else []
        result = function_call(param, conversation_history=history, workspace_id=workspace_id)
        return result
    except Exception as e:
        return f"Error: {str(e)}"
```

### Error Handling Pattern
All API and function calls follow this structure:
```python
try:
    response = requests.post(url, json=data, timeout=120)
    response.raise_for_status()
    return response.json()
except requests.RequestException as e:
    return f"API error: {str(e)}"
except Exception as e:
    return f"Error: {str(e)}"
```

### Conversation History Pattern
All context-aware tools support conversation history:
```python
def tool_function(query: str, conversation_history: list = None, workspace_id: str = None):
    history = conversation_history or []
    # Use history in LLM prompt for context-aware responses
    # Format: [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
```

### Database Query Pattern
Use Supabase client for all database operations:
```python
from supabase import create_client
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Query with filters
result = supabase.table('table_name')\
    .select('*')\
    .eq('user_id', user_id)\
    .eq('workspace_id', workspace_id)\
    .execute()
```

### File Organization
- **Supabase Storage**: All uploaded files stored in `user_files` bucket
- **Database Tables**: 
  - `files` - File metadata (id, user_id, workspace_id, file_name, file_size, storage_path)
  - `document_embeddings` - Vector embeddings (id, file_id, user_id, chunk_index, content, embedding)
  - `workspaces` - Workspace metadata (id, user_id, name, description)
  - `workspace_instructions` - Custom instructions (id, workspace_id, content, is_active)
  - `chat_sessions` - Chat sessions (id, workspace_id, user_id, title)
  - `chats` - Chat messages (id, chat_session_id, role, content)
- **Frontend components**: Located in `frontend/app/components/` with TypeScript interfaces
- **Tests directory**: Located at `tests/` with pytest test files

### Streaming and Cancellation
- Bridge server implements AbortController pattern
- Frontend passes `signal` to fetch requests
- Ollama streaming handled by `query_model()` with proper error handling
- Cancel button appears during streaming, disabled during debounce

## External Dependencies

### Backend
- **Ollama**: Required for LLM inference (default: llama3.2:3b)
- **Tavily API**: For web search functionality (API key needed)
- **Supabase**: For authentication, database, and file storage (credentials required)
- **Python Libraries**: See `requirements.txt` for complete list
  - FastMCP, FastAPI, pandas, sentence-transformers, scikit-learn
  - python-docx, python-pptx, pypdf, openpyxl, beautifulsoup4
  - supabase-py, vecs (pgvector client)

### Frontend
- **Supabase**: For authentication and database
- **Node.js 18+**: For Next.js development
- **npm packages**: See `frontend/package.json` for dependencies
  - Next.js 14, React 19, TypeScript
  - Supabase client, Framer Motion, Tailwind CSS
  - Mermaid.js for diagram rendering

### Infrastructure
- **PostgreSQL with pgvector**: Required for embeddings (via Supabase)
- **Docker & Docker Compose**: Optional but recommended for deployment

## Code Style

- Follow **PEP8** conventions
- Use descriptive names (e.g., `extract_text_from_file`, not `parse`)
- Add docstrings to public functions (currently sparse in codebase)
- Tools use simple error message strings, not exceptions propagated to client

## Known Patterns

- **Async/Sync Mix**: REST endpoints can be `async def`, but MCP tool functions are synchronous
- **Database-First**: All state persists in Supabase PostgreSQL (files, embeddings, workspaces, chats)
- **pgvector Enterprise**: Semantic search performed at database level using `<=>` operator (no in-memory embeddings)
- **Tool Registration**: All tools registered centrally in `server/main.py` with `@mcp.tool`
- **Frontend State**: Component state in React hooks, persistent data in Supabase
- **Authentication**: Magic links via Supabase (no password storage)
- **Conversation Context**: All tools support conversation history for multi-turn dialogues
- **Mermaid Diagrams**: LLM-generated diagrams with syntax cleaning, rendered in pop-in panel
- **Streaming Control**: AbortController pattern for canceling LLM responses
- **Chat Titles**: Auto-generated using LLM (max 6 words), manual regeneration available
- **Workspace Instructions**: Cached in-memory, fetched from database, switchable per workspace
