# FastMCP Bridge Quick Reference

## 🚀 Quick Start

### Start Everything
```powershell
.\start_servers.ps1
```

### Verify Setup
```powershell
python verify_setup.py
```

### Test Bridge Server
```powershell
python test_bridge.py
```

---

## 🌐 Service URLs

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:3000 | Next.js UI |
| Bridge Server | http://localhost:3001 | MCP Bridge |
| FastMCP Server | http://localhost:8000 | MCP Backend |
| Ollama | http://localhost:11434 | LLM Inference |

---

## 📡 Bridge Server API

### Base URL
```
http://localhost:3001
```

### Endpoints

#### Query (Main)
```http
POST /api/query
Content-Type: application/json

{
  "query": "What is the revenue?"
}
```

#### Semantic Search
```http
POST /api/semantic-search
Content-Type: application/json

{
  "query": "financial performance",
  "top_k": 5
}
```

#### Query with Context
```http
POST /api/query-context
Content-Type: application/json

{
  "query": "What is the revenue?",
  "max_chunks": 3,
  "include_context_preview": true
}
```

#### Ingest Document
```http
POST /api/ingest
Content-Type: application/json

{
  "file_path": "D:/documents/report.pdf"
}
```

#### Query Excel/CSV
```http
POST /api/query-excel
Content-Type: application/json

{
  "file_path": "D:/data/sales.xlsx",
  "query": "What were Q4 sales?",
  "sheet_name": "2024"
}
```

#### Web Search
```http
POST /api/web-search
Content-Type: application/json

{
  "query": "latest AI developments"
}
```

#### Health Check
```http
GET /api/health
```

---

## 🔧 Frontend Integration

### Next.js API Route
```typescript
// frontend/app/api/chat/query/route.ts
const response = await fetch('http://localhost:3001/api/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: userQuery })
});
```

### Component Usage
```typescript
// In your React component
const handleQuery = async (query: string) => {
  const res = await fetch('/api/chat/query', {
    method: 'POST',
    body: JSON.stringify({ query, action: 'query' })
  });
  const data = await res.json();
  return data.response;
};
```

### Available Actions
- `query` - Standard query with context
- `semantic_search` - Search only
- `query_context` - Query with explicit context
- `web_search` - Web search
- `query_excel` - Excel/CSV query
- `ingest` - Ingest document

---

## 🛠️ Development Commands

### Backend
```powershell
# Start FastMCP server
python server/main.py

# Start bridge server
python bridge_server.py

# Test bridge
python test_bridge.py

# Verify setup
python verify_setup.py
```

### Frontend
```powershell
cd frontend

# Install dependencies
npm install

# Development server
npm run dev

# Production build
npm run build && npm start

# Type check
npm run type-check

# Lint
npm run lint
```

### Ollama
```powershell
# Start Ollama service
ollama serve

# List models
ollama list

# Pull model
ollama pull llama3.2:3b

# Test model
ollama run llama3.2:3b "Hello, world!"
```

---

## 🐛 Troubleshooting

### Bridge Server Won't Start
```powershell
# Check FastMCP is running
curl http://localhost:8000

# Check port availability
netstat -ano | findstr :3001

# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

### Frontend Can't Connect
```powershell
# Check bridge server
curl http://localhost:3001/api/health

# Check environment variable
cat frontend/.env.local | findstr BRIDGE

# Clear Next.js cache
cd frontend
rm -rf .next
npm run dev
```

### Ollama Issues
```powershell
# Check Ollama is running
ollama list

# Restart Ollama
# Close Ollama app, then:
ollama serve

# Check model
ollama pull llama3.2:3b
ollama run llama3.2:3b "test"
```

---

## 📝 File Structure

```
FastMCP-x/
├── bridge_server.py              # Bridge server (port 3001)
├── start_servers.ps1             # Startup script
├── test_bridge.py                # Bridge tests
├── verify_setup.py               # Setup verification
├── server/
│   └── main.py                   # FastMCP server (port 8000)
├── client/
│   └── fast_mcp_client.py        # MCP client functions
├── frontend/
│   ├── .env.local                # Environment config
│   └── app/api/chat/query/
│       └── route.ts              # Next.js API route
└── storage/                      # Document storage
```

---

## 🔗 Important Links

- **Main README**: [README.md](README.md)
- **Bridge Docs**: [BRIDGE_SERVER.md](BRIDGE_SERVER.md)
- **Setup Guide**: [SETUP.md](documentations/SETUP.md)
- **Supabase Config**: [SUPABASE_CONFIG.md](documentations/SUPABASE_CONFIG.md)

---

## ⌨️ Keyboard Shortcuts

### VS Code
- `Ctrl+Shift+P` - Command palette
- `Ctrl+`` - Toggle terminal
- `Ctrl+Shift+5` - Split terminal

### Frontend (Chat)
- `Ctrl+Enter` - Send message (Windows)
- `Cmd+Enter` - Send message (Mac)
- `Escape` - Clear input

---

## 📊 Environment Variables

### Frontend (.env.local)
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
NEXT_PUBLIC_BRIDGE_SERVER_URL=http://localhost:3001
```

### Bridge Server (bridge_server.py)
- Port: `3001`
- CORS: `http://localhost:3000`
- MCP URL: `http://localhost:8000`

### FastMCP Server (server/main.py)
- Port: `8000`
- Ollama: `http://localhost:11434`
- Model: `llama3.2:3b`

---

## 🎯 Common Tasks

### Add New Document
```python
# Using Python client
await ingest_file(client, "D:/docs/file.pdf")
```

```http
# Using HTTP
POST http://localhost:3001/api/ingest
{"file_path": "D:/docs/file.pdf"}
```

### Query Documents
```http
POST http://localhost:3001/api/query
{"query": "What is the main topic?"}
```

### Search Documents
```http
POST http://localhost:3001/api/semantic-search
{"query": "revenue", "top_k": 5}
```

### Web Search
```http
POST http://localhost:3001/api/web-search
{"query": "Python FastAPI tutorial"}
```

---

*Last Updated: November 8, 2025*
