# FastMCP-x Copilot Instructions

## Architecture Overview

This is a **full-stack application** combining a Model Context Protocol (MCP) server backend with a Next.js frontend. The architecture follows a modular design:

### Backend (FastMCP Server)
- **FastMCP Protocol**: `server/main.py` implements MCP protocol with tool registration
- **Core Modules**:
  - `document_ingestion.py` - File ingestion, storage in `storage/`, auto-loading on startup
  - `query_handler.py` - Semantic search (sentence-transformers), context-aware LLM queries
  - `excel_csv.py` - Natural language queries for Excel/CSV files using pandas
  - `web_search_file.py` - Tavily API integration for web search
- **Single FastMCP Instance**: All tools registered via `@mcp.tool` decorator in `server/main.py`
- **LLM Integration**: Ollama (default: llama3.2:3b) via HTTP API at `localhost:11434`

### Frontend (Next.js)
- **Framework**: Next.js 14 with App Router and TypeScript
- **Authentication**: Supabase Auth with magic links
- **UI Components**: Chat interface, collapsible sidebar, workspace management
- **Styling**: Tailwind CSS + Framer Motion animations
- **State**: localStorage for sidebar, React hooks for component state

**Critical**: Single FastMCP instance in `server/main.py`. Frontend UI complete but backend integration pending.

## Key Data Flow

### Backend Data Flow
1. **Document Ingestion**: 
   - `ingest_file()` copies files to `storage/`, extracts text via `utils/file_parser.py`
   - Stores as dict: `{"content": str, "filename": str, "filepath": str}` in `documents` list
   - Auto-loads existing documents from `storage/` on server startup

2. **Query Processing**:
   - `answer_query()` performs semantic search using sentence-transformers (all-MiniLM-L6-v2)
   - Chunks documents (600 chars, 50 char overlap) for better semantic matching
   - Falls back to general LLM query if no relevant documents (similarity < 0.3)
   - Uses `query_with_context()` to enrich LLM prompt with relevant document chunks

3. **LLM Querying**:
   - `query_model()` calls Ollama HTTP API at `http://localhost:11434/api/generate`
   - Default model: `llama3.2:3b`
   - 120s timeout for large content summarization
   - Supports any Ollama-compatible model

4. **Structured Data**: 
   - `query_excel_with_llm_tool()` / `query_csv_with_llm_tool()` load data with pandas
   - Convert to string representation, pass to LLM with natural language query
   - LLM analyzes data and answers question directly

5. **Web Search**:
   - `tavily_web_search()` fetches top result, extracts content with BeautifulSoup4
   - Passes extracted content to LLM for summarization

**Important**: Document context is stored in-memory (no persistent DB). Documents persist in `storage/` directory and reload on restart.

## Setup Instructions

### Backend Setup
1. **Python Requirements**: Ensure Python 3.9+ is installed
2. **Install Dependencies**:
   ```powershell
   pip install -r requirements.txt
   ```
   Core dependencies: `fastmcp`, `fastapi`, `pandas`, `sentence-transformers`, `scikit-learn`, `requests`, `beautifulsoup4`, `python-docx`, `python-pptx`, `pypdf`, `openpyxl`

3. **Install Ollama**:
   - Download from https://ollama.ai
   - Start service: `ollama serve`
   - Pull model: `ollama pull llama3.2:3b`
   
4. **Verify Installation**:
   ```powershell
   python server/main.py
   ```
   Server loads documents from `storage/` and starts listening

### Frontend Setup
1. **Install Node.js 18+**
2. **Install Dependencies**:
   ```powershell
   cd frontend
   npm install
   ```

3. **Configure Supabase**:
   - Create `.env.local` in `frontend/` directory
   - Add Supabase credentials:
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

### Storage Directory
- Created automatically at runtime in `storage/` relative to project root
- Ingested documents are copied here and persist across server restarts
- Auto-loaded on server startup via `load_existing_documents()`

## Development Workflows

### Starting the Server
```powershell
python server/main.py
```
Runs on `0.0.0.0:8000` with hot-reload enabled (`reload=True` in uvicorn config).

### Adding New File Format Support
1. Update `SUPPORTED_FILE_TYPES` in `config/settings.py`
2. Add parsing logic in `utils/file_parser.py`'s `extract_text_from_file()` function
3. Install required libraries in `requirements.txt`

### Adding New LLM Support
1. Add model logic in `query_handler.py`'s `query_model()` function
2. Use `requests.post()` pattern for HTTP APIs (like Ollama)
3. Handle `requests.RequestException` errors appropriately
4. Document model requirements and endpoint configuration

### Adding New MCP Tools
1. Define tool function in appropriate module (e.g., `web_search_file.py`)
2. Register in `server/main.py` with `@mcp.tool` decorator
3. Follow existing patterns for error handling and LLM integration
4. Update CLI client if needed for new tool support

## Project Conventions

### MCP Tools Registration
All tools are registered in `server/main.py` using the `@mcp.tool` decorator:
```python
@mcp.tool
def tool_name(param: str) -> str:
    """Tool description"""
    try:
        result = function_call(param)
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

### File Organization
- **Storage directory**: Created at runtime in `document_ingestion.py` if missing using `os.makedirs()`
- **Global state**: `documents` list is module-level in `document_ingestion.py`
- **Frontend components**: Located in `frontend/app/components/` with TypeScript interfaces
- **No tests directory exists yet** - tests need to be created

## External Dependencies

### Backend
- **Ollama**: Required for LLM inference (default: llama3.2:3b)
- **Tavily API**: For web search functionality (API key needed)
- **Python Libraries**: See `requirements.txt` for complete list
  - FastMCP, FastAPI, pandas, sentence-transformers, scikit-learn
  - python-docx, python-pptx, pypdf, openpyxl, beautifulsoup4

### Frontend
- **Supabase**: For authentication and database
- **Node.js 18+**: For Next.js development
- **npm packages**: See `frontend/package.json` for dependencies

## Code Style

- Follow **PEP8** conventions
- Use descriptive names (e.g., `extract_text_from_file`, not `parse`)
- Add docstrings to public functions (currently sparse in codebase)
- Tools use simple error message strings, not exceptions propagated to client

## Known Patterns

- **Async/Sync Mix**: REST endpoints can be `async def`, but MCP tool functions are synchronous
- **No Database**: All state is in-memory; documents persist in `storage/` and reload on startup
- **Semantic Search**: Uses sentence-transformers with cosine similarity for document matching
- **Tool Registration**: All tools registered centrally in `server/main.py` with `@mcp.tool`
- **Frontend State**: Component state in React hooks, user preferences in localStorage
- **Authentication**: Magic links via Supabase (no password storage)
