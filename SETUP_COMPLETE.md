# FastMCP-x Quick Start Guide

## ✅ Installation Complete!

All dependencies have been successfully installed on your macOS system.

## 📋 What Was Installed

### System Requirements
- ✅ **Python 3.11.14** - Backend runtime
- ✅ **Node.js 25.2.1** - Frontend runtime  
- ✅ **Ollama 0.13.5** - LLM inference engine
- ✅ **Homebrew** - Package manager

### Python Dependencies
All packages from `requirements.txt` including:
- FastMCP framework
- FastAPI & Uvicorn
- Pandas, NumPy, scikit-learn
- Sentence-transformers for embeddings
- Supabase client
- Document parsers (pypdf, python-docx, python-pptx)
- And many more...

### Frontend Dependencies
All npm packages from `package.json` including:
- Next.js 16 with App Router
- React 19
- Supabase client
- Tailwind CSS
- Framer Motion
- And many more...

### LLM Model
- ✅ **llama3.2:3b** model (2.0 GB) - Downloaded and ready

## 🚀 Running the Application

### 1. Configure Supabase (Required for Authentication)

Edit `frontend/.env.local` and replace the placeholder values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-actual-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key
```

**To get your credentials:**
1. Go to https://app.supabase.com
2. Create a new project or select an existing one
3. Navigate to **Settings → API**
4. Copy the **Project URL** and **anon public** key
5. In **Authentication → URL Configuration**, add: `http://localhost:3000/auth/callback`

### 2. Start the Backend Server

Open a terminal and run:

```bash
cd /Users/vanshchaudhari/FastMCP-x
python3.11 server/main.py
```

The server will start on `http://localhost:8000`

### 3. Start the Frontend

Open a **new terminal** and run:

```bash
cd /Users/vanshchaudhari/FastMCP-x/frontend
npm run dev
```

The frontend will start on `http://localhost:3000`

### 4. Access the Application

Open your browser and go to:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000

## 🔍 Verify Setup

Run the verification script anytime to check your setup:

```bash
./verify-setup.sh
```

## 🛠️ Troubleshooting

### Ollama Service Not Running

If Ollama isn't running:

```bash
brew services start ollama
```

To check Ollama status:

```bash
brew services list
```

### Backend Server Issues

Make sure you're using Python 3.11:

```bash
python3.11 --version
```

Check if the server is running:

```bash
lsof -i :8000
```

### Frontend Issues

Clear the Next.js cache if needed:

```bash
cd frontend
rm -rf .next
npm run dev
```

### Homebrew Path Issues

If commands aren't found, add Homebrew to your PATH:

```bash
eval "$(/opt/homebrew/bin/brew shellenv zsh)"
```

Or add it permanently to your `~/.zshrc`:

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv zsh)"' >> ~/.zshrc
source ~/.zshrc
```

## 📚 Project Structure

```
FastMCP-x/
├── server/              # Backend FastMCP server
│   ├── main.py         # Main server entry point
│   ├── document_ingestion.py
│   ├── query_handler.py
│   └── ...
├── frontend/           # Next.js frontend
│   ├── app/           # App router pages
│   ├── lib/           # Supabase client
│   └── ...
├── storage/           # Document storage (auto-created)
├── requirements.txt   # Python dependencies
└── verify-setup.sh   # Setup verification script
```

## 🎯 Next Steps

1. **Configure Supabase** credentials in `frontend/.env.local`
2. **Start both servers** (backend and frontend)
3. **Create an account** using magic link authentication
4. **Upload documents** to your workspace
5. **Ask questions** about your documents

## 📖 Documentation

For more detailed information, see:
- [ARCHITECTURE.md](DOCUMENTATIONS/ARCHITECTURE.md)
- [SUPABASE_SETUP_INSTRUCTIONS.md](DOCUMENTATIONS/SUPABASE_SETUP_INSTRUCTIONS.md)
- [WORKSPACE_SCHEMA_GUIDE.md](DOCUMENTATIONS/WORKSPACE_SCHEMA_GUIDE.md)

## 💡 Features

- 📄 Document ingestion (PDF, DOCX, PPTX, TXT, etc.)
- 🔍 Semantic search with sentence-transformers
- 💬 LLM-powered Q&A with document context
- 🌐 Web search integration
- 📊 Excel/CSV natural language queries
- 👥 Multi-user workspaces
- 🔐 Supabase authentication
- 📝 Workspace-specific instructions
- 💾 pgvector database integration

---

**Setup completed on:** January 9, 2026

For issues or questions, refer to the documentation or check the logs.
