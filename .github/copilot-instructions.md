# FastMCP-x Copilot Instructions

## Architecture Overview

This is a **Model Context Protocol (MCP) server** that ingests documents and answers queries using configurable LLMs (Gemini CLI, Llama via Ollama). The architecture follows a modular design:

- **FastAPI + FastMCP hybrid**: `server/main.py` mounts MCP protocol endpoints at `/mcp` and `/mcp/api` while also exposing traditional REST endpoints at `/mcp/ingest`, `/mcp/query`, `/mcp/switch-model`
- **Three core modules**: Each defines its own `FastMCP` instance and registers `@mcp.tool` decorated functions:
  - `document_ingestion.py` - File ingestion with storage in `storage/` directory
  - `query_handler.py` - Simple keyword search in documents, fallback to LLM
  - `model_manager.py` - Subprocess calls to external CLI tools (Gemini, Ollama)

**Critical**: The project uses **three separate `FastMCP` instances** (one per module), not a single shared instance. When adding tools, decorate them in the appropriate module.

## Key Data Flow

1. **Document Ingestion**: `ingest_file()` copies files to `storage/`, extracts text via `utils/file_parser.py`, appends to in-memory `documents` list
2. **Query Processing**: `answer_query()` does case-insensitive substring search in `documents`, falls back to `query_model()` if no match
3. **Model Querying**: `query_model()` uses `subprocess.run()` to call external CLIs:
   - Gemini: `gemini chat --message <query>` (30s timeout)
   - Llama: `ollama run <model_name> <query>` (60s timeout)

**Important**: Document context is stored in-memory and lost on server restart. No persistent database exists.

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
1. Add model logic in `model_manager.py`'s `query_model()` function
2. Use `subprocess.run()` pattern with error handling for `TimeoutExpired`, `CalledProcessError`, `FileNotFoundError`
3. Document the CLI tool requirement (e.g., "Ensure X is installed and in PATH")

## Project Conventions

### MCP Protocol Implementation
- **GET /mcp**: Health check returning `{"status": "ok", "protocolVersion": "2024-11-05"}`
- **POST /mcp**: Multiplexer endpoint handling tool discovery and execution
  - If `tool_name` is missing, returns full tool catalog with `inputSchema` definitions
  - Tool responses must follow: `{"jsonrpc": "2.0", "id": <id>, "content": [{"type": "text", "text": <result>}]}`

### Error Handling Pattern
All subprocess calls follow this structure:
```python
try:
    result = subprocess.run([...], capture_output=True, text=True, check=True, timeout=X)
    return result.stdout.strip()
except subprocess.TimeoutExpired:
    return f"<Model> query timed out after X seconds"
except subprocess.CalledProcessError as e:
    return f"<CLI> error: {e.stderr.strip() if e.stderr else str(e)}"
except FileNotFoundError:
    return f"<CLI> not found. Please ensure <tool> is installed and in PATH."
except Exception as e:
    return f"Error querying <model>: {str(e)}"
```

### File Organization
- **No tests directory exists yet** despite README mentioning `tests/test_document_ingestion.py`
- **Storage directory**: Created at runtime in `document_ingestion.py` if missing using `os.makedirs()`
- **Global state**: `documents` list and `current_model` string are module-level globals

## External Dependencies

- **Gemini CLI**: Must be installed separately and available in PATH for `gemini` model
- **Ollama**: Required for Llama models (e.g., `llama3.2:3b`)
- **Python Libraries**: FastMCP, FastAPI, pandas, python-docx, python-pptx, PyPDF2 (see `requirements.txt`)

## Code Style

- Follow **PEP8** conventions
- Use descriptive names (e.g., `extract_text_from_file`, not `parse`)
- Add docstrings to public functions (currently sparse in codebase)
- Tools use simple error message strings, not exceptions propagated to client

## Known Patterns

- **Async/Sync Mix**: REST endpoints are `async def`, but tool functions are synchronous
- **No Database**: All state is in-memory; documents lost on restart
- **Simple Search**: Query matching uses Python `in` operator, no vector search or semantic matching
- **Tool Registration**: Each module creates its own `FastMCP` instance; tools aren't centrally registered in `main.py`
