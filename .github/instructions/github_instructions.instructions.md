## FastMCP-x GitHub Contribution Instructions

applyTo: '**'

### Branching
- Always create a new branch for each feature or bugfix.
- Use descriptive branch names (e.g., `feature/web-search-integration`, `bugfix/auth-redirect`, `frontend/chat-api`).

### Pull Requests (PRs)
- Open a PR against the `main` branch when your work is ready for review.
- Add a clear description of your changes and reference related issues.
- Ensure all tests pass before requesting a review (when tests exist).
- Tag PRs with `backend`, `frontend`, or `docs` labels as appropriate.

### Code Style

#### Backend (Python)
- Follow **PEP8** conventions
- Use clear, descriptive variable and function names
- Add docstrings to all public functions and classes
- Use type hints where appropriate

#### Frontend (TypeScript/React)
- Follow TypeScript best practices with strict typing
- Use functional components with React hooks
- Use descriptive component and prop names
- Add JSDoc comments for complex logic

### Testing

#### Backend
- Add tests in the `tests/` directory (tests already implemented for core modules)
- Test all MCP tool functions with various inputs
- Run tests with: `pytest tests/`

#### Frontend
- Add component tests using Jest/React Testing Library
- Test user interactions and accessibility features
- Run tests with: `cd frontend && npm test`

### Backend Development

#### Adding New MCP Tools
1. Define the tool function in the appropriate module (`document_ingestion.py`, `query_handler.py`, `csv_excel_processor.py`, `web_search_file.py`)
2. Register the tool in `server/main.py` with `@mcp.tool` decorator
3. Add tests in `tests/` directory for the new tool
4. Update the CLI client (`client/fast_mcp_client.py`) if needed
5. Document the new tool in `README.md`

#### LLM Integration
- Default model: **Ollama (llama3.2:8b)** via HTTP API at `localhost:11434`
- To add support for new models, update `query_handler.py`'s `query_model()` function
- Use `requests.post()` for HTTP APIs and handle `requests.RequestException` errors

#### File Format Support
- To add new file types: Update `utils/file_parser.py` and add parsing library to `requirements.txt`

### Frontend Development

#### Component Structure
- Create components in `frontend/app/components/` following existing patterns (e.g., `Chat/`, `Sidebar/`)
- Use TypeScript with strict typing and functional components with React hooks
- Follow Tailwind CSS utility-first approach

#### Styling Guidelines
- Use consistent spacing: `p-4`, `gap-4`, `space-y-4`
- Primary colors: `indigo-500` to `indigo-700`
- Animations: Use Framer Motion with 300ms duration

#### Authentication
- All auth logic uses **Supabase Auth** with magic links only
- Protected routes handled by `middleware.ts`

### Documentation
- Update `README.md` for major changes, new features, or new dependencies
- Update `SETUP.md` if setup process changes
- Update `SUPABASE_CONFIG.md` for authentication changes

### Review & Merge
- At least one approval is required before merging to `main`.
- Squash commits if possible for a clean history.
---

---
Provide project context and coding guidelines that AI should follow when generating code, answering questions, or reviewing changes.