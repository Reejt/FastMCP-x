# Query Processing for Code & Configuration Files

## Overview
Your FastMCP system now supports multiple code and configuration file types:
- **Source Code**: `.py`, `.js`, `.ts`, `.java`, `.cpp`, `.c`, `.h`, `.cs`, `.go`, `.rs`, `.jsx`, `.tsx`
- **Web**: `.html`, `.css`, `.scss`
- **Data/Config**: `.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.env`, `.sql`, `.prisma`, `.graphql`
- **Documentation**: `.md`
- **Scripts**: `.sh`, `.bat`, `.ps1`
- **Special**: `.dockerignore`, `.gitignore`

---

## Query Processing Strategy

### 1. **Text Extraction Phase** (in `utils/file_parser.py`)

#### For Code Files (.py, .js, .ts, etc.)
```python
elif ext in [".py", ".js", ".ts", ".java", ".cpp", ".c", ".h", ".cs", ".go", ".rs", ".jsx", ".tsx"]:
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    # Add metadata for semantic search
    text_parts = [
        f"File: {os.path.basename(file_path)}",
        f"Language: {ext[1:].upper()}",
        f"Lines: {len(content.splitlines())}",
        "=" * 80,
        content
    ]
    return "\n".join(text_parts)
```

#### For Configuration Files (.json, .yaml, .sql, etc.)
```python
elif ext in [".json", ".yaml", ".yml", ".toml", ".sql", ".prisma", ".graphql", ".env"]:
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    # Optional: Pretty-print JSON/YAML for readability
    if ext == ".json":
        try:
            import json
            parsed = json.loads(content)
            content = json.dumps(parsed, indent=2)
        except:
            pass  # Keep original if parsing fails
    
    text_parts = [
        f"Config File: {os.path.basename(file_path)}",
        f"Type: {ext[1:].upper()}",
        "=" * 80,
        content
    ]
    return "\n".join(text_parts)
```

#### For Web Files (.html, .css, .scss)
```python
elif ext in [".html", ".css", ".scss"]:
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    # Optional: Use BeautifulSoup for HTML to remove scripts/styles
    if ext == ".html":
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(content, 'html.parser')
            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()
            content = soup.get_text(separator='\n')
        except:
            pass  # Keep original if BeautifulSoup fails
    
    text_parts = [
        f"Web File: {os.path.basename(file_path)}",
        f"Type: {ext[1:].upper()}",
        "=" * 80,
        content
    ]
    return "\n".join(text_parts)
```

#### For Special Files (.dockerignore, .gitignore)
```python
elif base_name in [".dockerignore", ".gitignore"]:
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    text_parts = [
        f"Config: {base_name}",
        f"Entries: {len([l for l in content.split('\n') if l.strip() and not l.startswith('#')])}",
        "=" * 80,
        content
    ]
    return "\n".join(text_parts)
```

#### For Scripts (.sh, .bat, .ps1)
```python
elif ext in [".sh", ".bat", ".ps1"]:
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    text_parts = [
        f"Script: {os.path.basename(file_path)}",
        f"Language: {ext[1:].upper()}",
        "=" * 80,
        content
    ]
    return "\n".join(text_parts)
```

#### For Markdown (.md)
```python
elif ext == ".md":
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        return f.read()  # Already well-structured
```

---

### 2. **Chunking Strategy** (in `server/query_handler.py`)

**Critical for Code Files**: Adjust chunk sizes by file type

```python
def chunk_text_by_type(text: str, file_extension: str) -> list[str]:
    """
    Smart chunking based on file type
    
    Args:
        text: Content to chunk
        file_extension: File extension (e.g., '.py', '.json')
    
    Returns:
        List of text chunks
    """
    
    # Define chunk sizes by file type
    chunk_config = {
        # Code files: smaller chunks to preserve context
        '.py': (400, 50),      # (chunk_size, overlap)
        '.js': (400, 50),
        '.ts': (400, 50),
        '.jsx': (400, 50),
        '.tsx': (400, 50),
        '.java': (500, 75),
        '.cpp': (500, 75),
        '.c': (500, 75),
        '.h': (400, 50),
        '.cs': (400, 50),
        '.go': (400, 50),
        '.rs': (400, 50),
        
        # Config files: full content if small enough
        '.json': (800, 100),
        '.yaml': (800, 100),
        '.yml': (800, 100),
        '.toml': (800, 100),
        '.sql': (600, 75),
        '.prisma': (600, 75),
        '.env': (600, 75),
        '.graphql': (600, 75),
        
        # Web files: moderate chunks
        '.html': (600, 75),
        '.css': (600, 75),
        '.scss': (600, 75),
        
        # Documents: larger chunks
        '.md': (800, 100),
        
        # Default
        'default': (600, 50)
    }
    
    chunk_size, overlap = chunk_config.get(file_extension, chunk_config['default'])
    return chunk_text(text, chunk_size=chunk_size, overlap=overlap)
```

---

### 3. **Semantic Search Enhancement** (in `server/query_handler.py`)

#### Code-Aware Search
```python
def semantic_search_code_aware(query: str, file_extension: str, top_k: int = 5, 
                                workspace_id: str = None) -> list:
    """
    Enhanced semantic search for code files
    
    Optimizations:
    - Boosts relevance for function/class definitions
    - Weights import statements
    - Prioritizes syntax-related queries
    """
    
    # Query expansion for code-specific terms
    code_keywords = {
        '.py': ['def ', 'class ', 'import ', 'from ', 'return', 'yield'],
        '.js': ['function ', 'const ', 'let ', 'var ', 'import', 'export'],
        '.ts': ['interface ', 'type ', 'class ', 'async ', 'await'],
        '.java': ['public ', 'private ', 'class ', 'interface ', 'static'],
    }
    
    # Add syntax keywords to query for better relevance
    if file_extension in code_keywords:
        keywords = code_keywords[file_extension]
        # Check if query mentions any keywords
        expanded_query = query
        for kw in keywords:
            if kw.lower() in query.lower():
                expanded_query += f" {kw.strip()}"
    
    # Perform semantic search with standard pgvector
    return semantic_search_pgvector(expanded_query, top_k=top_k, 
                                    workspace_id=workspace_id)
```

#### Syntax-Aware Query Parsing
```python
def extract_code_context_from_query(query: str, file_extension: str) -> dict:
    """
    Extract code-specific context from natural language queries
    
    Examples:
    - "How does the login function work in auth.ts?" 
      → {"function": "login", "file": "auth.ts"}
    
    - "Show me all classes that extend Component"
      → {"pattern": "class.*extends.*Component"}
    """
    
    import re
    context = {
        'raw_query': query,
        'file_extension': file_extension,
        'keywords': [],
        'patterns': []
    }
    
    # Extract function/method names
    func_match = re.search(r'(function|method|def)\s+(\w+)', query, re.I)
    if func_match:
        context['keywords'].append(('function', func_match.group(2)))
    
    # Extract class names
    class_match = re.search(r'class\s+(\w+)', query, re.I)
    if class_match:
        context['keywords'].append(('class', class_match.group(1)))
    
    # Extract variable/parameter names (quoted strings)
    var_matches = re.findall(r'"([^"]+)"|\'([^\']+)\'', query)
    for match in var_matches:
        var = match[0] or match[1]
        context['keywords'].append(('identifier', var))
    
    return context
```

---

### 4. **Query Processing Pipeline** (in `server/query_handler.py`)

```python
def answer_query_with_code_support(query: str, workspace_id: str = None, 
                                    user_id: str = None) -> dict:
    """
    Complete query processing pipeline for code/config files
    
    Returns:
        {
            'answer': str,
            'sources': list[tuple(filename, similarity, content_snippet)],
            'query_type': str,  # 'code', 'config', 'documentation', 'general'
            'context_used': bool
        }
    """
    
    print(f"🔍 Processing query: {query}")
    
    # Step 1: Detect document and extract file name/type
    cleaned_query, detected_file = extract_document_name(query, workspace_id)
    
    # Step 2: Determine file type from detected file
    file_extension = None
    if detected_file:
        file_extension = os.path.splitext(detected_file)[1].lower()
    
    # Step 3: Perform semantic search with code-awareness
    if file_extension in ['.py', '.js', '.ts', '.java', '.cpp', '.c', '.h', 
                          '.cs', '.go', '.rs', '.jsx', '.tsx']:
        # Code-specific search
        search_results = semantic_search_code_aware(
            cleaned_query, 
            file_extension, 
            top_k=10,  # Get more results for code
            workspace_id=workspace_id
        )
    else:
        # Standard semantic search
        search_results = semantic_search_pgvector(
            cleaned_query,
            top_k=5,
            workspace_id=workspace_id,
            file_name=detected_file
        )
    
    # Step 4: Build context from search results
    if search_results:
        context_text = "\n\n".join([
            f"[{filename}]\n{content[:500]}..."
            for content, similarity, filename, _ in search_results[:3]
        ])
        
        # Step 5: Query LLM with context
        prompt = f"""Based on the following code/config context, answer this question:

Question: {cleaned_query}

Context:
{context_text}

Provide a clear, focused answer. Reference specific lines or sections when possible."""
        
        answer = query_model(prompt)
        
        return {
            'answer': answer,
            'sources': [(f, s, c[:200]) for c, s, f, _ in search_results],
            'query_type': 'code' if file_extension in ['.py', '.js', '.ts'] else 'config',
            'context_used': True
        }
    else:
        # Fallback: General LLM query
        answer = query_model(query)
        return {
            'answer': answer,
            'sources': [],
            'query_type': 'general',
            'context_used': False
        }
```

---

### 5. **LLM Optimization for Code** (in `server/query_handler.py`)

```python
def query_model_with_code_context(prompt: str, file_extension: str = None, 
                                   max_tokens: int = 1024) -> str:
    """
    Query Ollama with code-specific optimizations
    
    Args:
        prompt: The prompt/question
        file_extension: File type for context (e.g., '.py')
        max_tokens: Max response length
    
    Returns:
        LLM response
    """
    
    # Add system context based on file type
    system_prompts = {
        '.py': "You are an expert Python developer. Explain code clearly with examples.",
        '.js': "You are an expert JavaScript developer. Focus on ES6+ patterns.",
        '.ts': "You are an expert TypeScript developer. Emphasize type safety.",
        '.sql': "You are an expert SQL developer. Explain queries in detail.",
        '.json': "You are an expert in JSON data structures. Clarify schema.",
        'default': "You are a helpful code and configuration expert."
    }
    
    system = system_prompts.get(file_extension, system_prompts['default'])
    
    full_prompt = f"""{system}

User Question: {prompt}"""
    
    # Call query_model with optimized settings
    return query_model(full_prompt, timeout=120, max_tokens=max_tokens)
```

---

## Implementation Checklist

- [ ] **Update `utils/file_parser.py`**:
  - Add extraction logic for each new file type
  - Implement `extract_text_from_file()` with elif branches
  - Add file type detection in main condition

- [ ] **Update `server/query_handler.py`**:
  - Implement `chunk_text_by_type()` for smart chunking
  - Add `semantic_search_code_aware()` for code files
  - Add `extract_code_context_from_query()` for query parsing
  - Update `answer_query()` to use code-aware search
  - Add `query_model_with_code_context()` for LLM optimization

- [ ] **Install Dependencies** (if needed):
  ```bash
  pip install beautifulsoup4  # For HTML processing
  ```

- [ ] **Test Query Processing**:
  - Upload a Python file and test queries about functions
  - Upload a JSON config and test schema queries
  - Upload SQL file and test query logic questions
  - Verify embeddings are generated for code chunks

- [ ] **Monitor Performance**:
  - Check chunk size efficiency for your hardware
  - Adjust `top_k` and similarity thresholds as needed
  - Profile LLM response times for different file types

---

## Query Examples by File Type

### Python Code
- "What does the login function do?"
- "Find all database queries in this file"
- "How are decorators used?"

### TypeScript/React
- "Show me all React hooks used"
- "What props does the Button component accept?"
- "Find all API calls"

### SQL
- "What tables are joined in this query?"
- "Find all DELETE operations"
- "Explain the transaction logic"

### JSON Config
- "What database is configured?"
- "Show all API endpoints"
- "What are the authentication settings?"

### Markdown
- "Summarize the API documentation"
- "Find installation instructions"
- "What are the security recommendations?"

---

## Performance Considerations

| File Type | Chunk Size | Overlap | Speed | Quality |
|-----------|-----------|---------|-------|---------|
| `.py`, `.ts`, `.jsx` | 400 | 50 | ⚡ Fast | 🎯 Accurate |
| `.java`, `.cpp` | 500 | 75 | ⚡ Fast | 🎯 Accurate |
| `.json`, `.yaml` | 800 | 100 | ⚡⚡ Very Fast | ✅ Good |
| `.sql`, `.graphql` | 600 | 75 | ⚡ Fast | 🎯 Accurate |
| `.html` | 600 | 75 | ⚡⚡ Very Fast | ✅ Good |
| `.md` | 800 | 100 | ⚡⚡ Very Fast | ✅ Good |

---

## Known Limitations & Solutions

| Issue | Solution |
|-------|----------|
| Large source files (>100KB) slow embeddings | Split by classes/functions; adjust chunk size |
| JSON/YAML semantically similar to comments | Expand query with property names |
| SQL queries with many JOINs lose context | Increase chunk size for `.sql` files |
| Code with same variable names in different scopes | Add function/class context in metadata |
| HTML with inline styles generates noise | Use BeautifulSoup to strip styles |

