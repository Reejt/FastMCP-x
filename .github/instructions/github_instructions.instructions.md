## FastMCP-x GitHub Contribution Instructions

### Branching
- Always create a new branch for each feature or bugfix.
- Use descriptive branch names (e.g., `feature/llama3-integration`, `bugfix/query-endpoint`).

### Pull Requests (PRs)
- Open a PR against the `main` branch when your work is ready for review.
- Add a clear description of your changes and reference related issues.
- Ensure all tests pass before requesting a review.

### Code Style
- Follow PEP8 for Python code.
- Use clear, descriptive variable and function names.
- Add docstrings to all public functions and classes.

### Testing
- Add or update tests for new features and bugfixes in the `tests/` directory.
- Run all tests locally before pushing changes.

### Model Integration
- When adding a new model (e.g., Llama 3.2), update `model_manager.py` and document the model name and requirements in the PR.
- Ensure the MCP protocol endpoints (`/mcp`, `/mcp/query`, etc.) work with the new model.

### Documentation
- Update `README.md` for major changes, new features, or new model support.

### Review & Merge
- At least one approval is required before merging to `main`.
- Squash commits if possible for a clean history.
---
applyTo: '**'
---
Provide project context and coding guidelines that AI should follow when generating code, answering questions, or reviewing changes.