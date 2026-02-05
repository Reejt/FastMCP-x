# FastMCP-x High-Level LLM Guidance Summary

**Purpose & Scope**

FastMCP-x is a full-stack, document-aware query assistant built on the Model Context Protocol (MCP). It ingests files, extracts and embeds content, performs semantic search with pgvector, and generates context-aware answers via a local LLM (Ollama). This document is a high-level briefing intended to help another LLM understand the system, its workflows, and its key technical constraints so it can answer questions about the repo accurately and safely.

**System Overview**

At a high level, FastMCP-x is a three-tier system:

- Next.js frontend (port 3000) provides the user interface, authentication, and chat experience.
- FastAPI bridge server (port 3001) exposes REST endpoints to the frontend and communicates with the MCP backend via the Python MCP client. It also supports streaming responses using Server-Sent Events (SSE).
- FastMCP server (port 8000) handles ingestion, semantic search, structured data querying, web search, and LLM calls. It integrates with Supabase for storage and uses Ollama for LLM inference.

Data and control flow (text-only):

- Browser -> Next.js UI -> Next.js API routes -> Bridge Server -> MCP Client -> FastMCP Server -> Supabase/Ollama/Tavily -> response stream -> frontend chat UI.

**Core Workflows**

Document ingestion

- A user uploads a file via the frontend vault UI.
- The frontend calls the bridge server ingest endpoint with base64 content, filename, user_id, and optional workspace_id.
- The bridge server calls the MCP tool `ingest_file_tool`.
- The FastMCP server stores metadata in Supabase (file metadata and optional workspace association) and extracts text using `utils/file_parser.py`.
- Text is chunked into 600-character segments with 50-character overlap for semantic matching.
- The system generates embeddings using `sentence-transformers` with the `all-MiniLM-L6-v2` model (384 dimensions).
- Embeddings are persisted to Supabase in a `document_embeddings` table and also loaded or cached for query performance.

Querying documents

- The frontend sends user queries to the bridge server, optionally including conversation history and a workspace_id.
- The bridge server forwards the request to the MCP backend (or directly to specialized tools based on query content).
- The FastMCP server embeds the query and performs pgvector similarity search through a Supabase RPC (for example, `search_embeddings`).
- The top matching text chunks are sent to the LLM as context.
- The LLM response is returned to the bridge server and streamed back to the frontend via SSE.

Structured data queries (CSV and Excel)

- The bridge server routes queries for CSV/XLS/XLSX to specialized MCP tools.
- The backend loads the file into a pandas DataFrame and applies a programmatic reasoning pipeline.
- The system generates and executes pandas logic to answer queries with computed results rather than hallucinated answers.

Web search

- If the query requires external information, the system uses Tavily API for web search.
- The backend fetches top results and extracts content (via requests and BeautifulSoup) for LLM summarization.
- The response is returned through the same streaming pipeline.

Workspace instructions

- Workspaces can define custom instructions (prompt overlays) that alter the behavior of the LLM.
- When workspace_id is provided, the bridge server fetches the active instruction and injects it into the system prompt.
- If no active instruction is available, the system falls back to the default prompt.

**Key Capabilities**

Supported file types for ingestion and parsing (from `utils/file_parser.py`):

- Text and data: `.txt`, `.csv`, `.xls`, `.xlsx`
- Documents: `.docx`, `.pptx`, `.ppt`
- PDFs: `.pdf`, including OCR support for image-based text

Note on legacy formats:

- `.ppt` support may require Windows COM automation (`pywin32`) when running on Windows.

Search and LLM behavior:

- Embeddings model: `all-MiniLM-L6-v2` (384 dimensions).
- Chunking strategy: 600 characters with 50-character overlap.
- Similarity: pgvector cosine distance operator via RPC in Supabase.
- Streaming responses: SSE from bridge to frontend.

Frontend capabilities:

- Next.js App Router, TypeScript, Tailwind CSS v4, Framer Motion animations.
- Passwordless authentication via Supabase magic links.
- Responsive chat UI with sidebar navigation, workspace selection, and vault management.

**Data & Storage Model**

Core data concepts:

- Workspaces: logical grouping for documents and instructions.
- File metadata: records of uploaded files and their storage paths.
- Document content: extracted text stored separately for retrieval and context.
- Document embeddings: 384-d vectors for semantic search.
- Instructions: workspace-specific prompt content.
- Chats and sessions: message history scoped to a workspace or session.

Tables referenced across docs and code include:

- `workspaces`
- `workspace_instructions`
- `document_embeddings`
- `document_content`
- `chats` and `chat_sessions`
- File metadata tables such as `vault_documents` and `file_upload` (naming varies by doc vs code; treat these as the file metadata layer).

Important relationships:

- A workspace has many documents and instructions.
- Each workspace can have exactly one active instruction at a time (enforced by a partial unique index in the database).
- Embeddings reference file metadata and user ownership.

**Interfaces & Integration Points**

Bridge server API endpoints (FastAPI):

- `GET /` for health check.
- `GET /api/health` for detailed status.
- `POST /api/query` for main chat queries (supports SSE streaming).
- `POST /api/query-context` for explicit context retrieval.
- `POST /api/semantic-search` for raw semantic search.
- `POST /api/ingest` for document ingestion (base64 upload).
- `POST /api/query-excel` for Excel queries.
- `POST /api/web-search` for web search with summarization.

MCP tools (from `server/main.py`):

- `ingest_file_tool` for ingestion and embedding.
- `answer_query_tool` for standard semantic search + LLM answers.
- `web_search_tool` for Tavily-based search + summarization.
- `answer_link_query_tool` for URL content extraction and Q&A.
- `query_csv_with_context_tool` for CSV reasoning with conversation context.
- `query_excel_with_context_tool` for Excel reasoning with conversation context.
- `generate_diagram_tool` for Mermaid output (available but not used in this summary).

Frontend integration:

- The frontend uses a Next.js API route to proxy chat requests to the bridge server.
- It includes `workspace_id` and conversation history as JSON to preserve context.

**Operational Requirements**

Runtime services and dependencies:

- Python 3.9+
- Node.js 18+
- Ollama (local LLM inference)
- Supabase (auth + PostgreSQL with pgvector)
- Tavily API key for web search
- Docker and Docker Compose for full-stack local deployment

Key environment variables:

Backend `.env` (root):

- `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (preferred for server operations)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` as fallback
- `OLLAMA_BASE_URL` (code) or `OLLAMA_HOST` (docs)
- `TAVILY_API_KEY` for web search

Frontend `frontend/.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_BRIDGE_SERVER_URL` (typically `http://localhost:3001`)

Ports:

- Frontend: 3000
- Bridge server: 3001
- FastMCP server: 8000
- Ollama: 11434

**Stack Snapshot**

Backend:

- FastMCP, FastAPI, Pydantic, Uvicorn
- sentence-transformers, scikit-learn, pandas, numpy
- Supabase Python client
- requests + BeautifulSoup for web search scraping
- PDF parsing with pypdf plus OCR via pdf2image and pytesseract

Frontend:

- Next.js 16.0.10
- React 19.1.0
- TypeScript 5.9.x
- Tailwind CSS v4
- Framer Motion
- Radix UI components
- Supabase JS client
- Zustand state management

**Constraints & Assumptions**

Local LLM dependency:

- The system expects Ollama running locally; if Ollama is unavailable, LLM responses fail or degrade.

Supabase dependency:

- Supabase is required for auth, file metadata, embeddings, and workspace instructions.
- The backend supports multiple env var names for Supabase to tolerate inconsistencies.

Caching and persistence:

- Embeddings are stored in Supabase and loaded or cached in memory for fast similarity checks.
- In-memory caches may require refresh or restart to reflect updated embeddings or instructions.

Environment and tooling:

- Docker Compose is the recommended path for consistent multi-service startup.
- Manual local development requires starting Ollama, FastMCP server, bridge server, and the Next.js frontend separately.

**Operational Guidance for Another LLM**

If asked to explain or troubleshoot FastMCP-x, keep these points in mind:

- Always identify which layer is involved: frontend, bridge, or FastMCP backend.
- Verify that Ollama and Supabase are reachable before attributing failures to the app logic.
- For missing search results, confirm that embeddings exist for the uploaded file and that pgvector is enabled.
- For workspace-specific behavior, check that an active instruction is set for that workspace.
- For file parsing issues, confirm the file extension matches supported parsers and OCR dependencies are installed if the document is image-based.

**Suggested Positioning**

FastMCP-x is best described as:

- A production-oriented, document-aware assistant for enterprise knowledge search.
- An MCP-based platform that combines semantic search, structured data reasoning, and web augmentation.
- A modular, multi-service architecture designed for extensibility and local deployment.

**LLM Response Instructions (OpenAI/Anthropic Developer Voice)**

Use the following guidelines when answering queries about this project. The goal is to sound like a senior developer at OpenAI or Anthropic: precise, technical, and candid about limitations.

- Start with a short, direct answer, then expand with implementation details and relevant file paths.
- Be evidence-driven. Prefer code and manifests over narrative docs when facts conflict, and cite the source via inline file references like `server/query_handler.py` or `frontend/package.json`.
- Call out uncertainty explicitly. If a fact is not in the repo, say so and suggest where to verify.
- Avoid marketing language. Use neutral, engineering tone and focus on how the system works, not hype.
- Emphasize correctness, reliability, and failure modes. Mention dependencies like Supabase and Ollama and what happens when they are unavailable.
- Use consistent layer framing: frontend (Next.js), bridge (FastAPI), backend (FastMCP), and external services (Supabase, Ollama, Tavily).
- When asked to change behavior or add features, propose a concrete plan, identify tradeoffs, and mention tests or verification steps.
- When troubleshooting, isolate the layer first, then check ports, env vars, and service health before diagnosing app logic.
- Mention known naming inconsistencies across docs and code (for example, `vault_documents` vs `file_upload`) and defer to code as the source of truth.

Suggested response template:

- **Answer**: One paragraph summary.
- **Details**: Key flows, relevant modules, and critical constraints with file references.
- **Risks/Unknowns**: Anything not confirmed in code or likely to vary by environment.
- **Next Steps**: Clear actions or checks the user can run.
