# FastMCP-x: Document-Aware Query Assistant

## Overview
A full-stack MCP (Model Context Protocol) application that ingests documents, answers queries using AI, and provides a modern web interface. Built with FastMCP, FastAPI, Next.js, and Supabase authentication.

### Key Capabilities
- 📄 **Document Ingestion**: CSV, Excel (XLS/XLSX), PPTX, DOC/DOCX, PDF, TXT
- 🧠 **Semantic Search**: AI-powered document search using sentence transformers
- 💬 **Intelligent Querying**: Context-aware responses using Ollama (Llama 3.2:3b)
- 📊 **Structured Data**: Natural language queries for Excel/CSV files
- 🌐 **Web Search**: Tavily API integration for real-time web information
- 🔐 **Authentication**: Supabase-based user management with magic links
- 🎨 **Modern UI**: Next.js dashboard with collapsible sidebar and chat interface

## Architecture

```
Next.js Frontend (Port 3000)
         ↓ HTTP REST API
Bridge Server (Port 3001)
         ↓ MCP Protocol
FastMCP Server (Port 8000)
         ↓
Ollama LLM + Documents
```

### Bridge Server (FastAPI)
- **Purpose**: Connects Next.js frontend to FastMCP backend using Python MCP client
- **Protocol**: Direct MCP communication instead of HTTP
- **Benefits**: Better error handling, connection pooling, type safety
- **Port**: 3001 (localhost only)

### Backend (FastMCP Server)
- **FastMCP Protocol**: Model Context Protocol implementation
- **Document Processing**: Automatic text extraction and storage
- **LLM Integration**: Ollama for local AI inference
- **Semantic Search**: sentence-transformers for document similarity
- **Web Search**: Tavily API for external knowledge retrieval

### Frontend (Next.js)
- **Framework**: Next.js 14 with App Router
- **Authentication**: Supabase Auth with email magic links
- **UI Components**: Chat interface, workspace sidebar, file management
- **Styling**: Tailwind CSS with Framer Motion animations

#### Frontend Features
- 🔐 **Authentication**: Magic link email authentication with Supabase
- 💬 **Chat Interface**: ChatGPT-style UI with message display and input
- 🎨 **Collapsible Sidebar**: Smooth animations, 256px ↔ 64px with hover-to-expand
- 📱 **Responsive**: Desktop-optimized with mobile drawer navigation
- ♿ **Accessible**: Full keyboard navigation, ARIA attributes, screen reader support
- 💾 **Persistent State**: localStorage for sidebar preferences
- 🎭 **Animations**: Framer Motion for smooth transitions (300ms)

#### Frontend Components
- **Chat Components** (`/app/components/Chat/`):
  - `ChatContainer.tsx` - Message list with empty state
  - `ChatMessage.tsx` - Role-based styling (user/assistant)
  - `ChatInput.tsx` - Expandable textarea with Cmd/Ctrl+Enter shortcuts
  
- **Sidebar Components** (`/app/components/Sidebar/`):
  - `Sidebar.tsx` - Main navigation with collapse/expand
  - `SidebarItem.tsx` - Reusable nav items with icons and tooltips
  
- **Pages**:
  - `/dashboard` - Main protected dashboard (chat interface)
  - `/login` - Magic link authentication
  - `/auth/callback` - Auth callback handler
  - `/workspaces`, `/vault`, `/instructions` - Feature pages (UI ready)

#### Frontend Status
✅ **Completed**: UI components, authentication, routing, animations  
🚧 **Pending**: Backend API integration for chat, file upload, workspace management

## Directory Structure
```
FastMCP-x/
├── server/                           # FastMCP backend
│   ├── main.py                      # Main MCP server with tool registration
│   ├── document_ingestion.py       # File ingestion and storage
│   ├── query_handler.py            # Semantic search and LLM querying
│   ├── excel_csv.py                # Excel/CSV query engines
│   └── web_search_file.py          # Tavily web search integration
├── bridge_server.py                 # FastAPI bridge (MCP client)
├── client/
│   └── fast_mcp_client.py          # Python MCP client functions
├── frontend/                        # Next.js web application
│   ├── app/
│   │   ├── dashboard/              # Main dashboard page
│   │   ├── login/                  # Authentication pages
│   │   ├── auth/callback/          # Auth callback handler
│   │   └── components/             # React components
│   │       ├── Chat/               # Chat interface components
│   │       └── Sidebar/            # Navigation sidebar
│   ├── lib/
│   │   └── supabase/               # Supabase client configuration
│   └── middleware.ts               # Auth middleware
├── utils/
│   └── file_parser.py              # Document text extraction utilities
├── storage/                         # Ingested documents storage
├── requirements.txt                # Python dependencies
└── README.md
```

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- Ollama (for AI inference)
- Supabase account (for authentication)

### Backend Setup
1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Install and start Ollama:
   ```bash
   # Install Ollama from https://ollama.ai
   ollama serve
   ollama pull llama3.2:3b
   ```

3. Start all servers (Recommended):
   ```powershell
   .\start_servers.ps1
   ```
   
   This automatically starts:
   - FastMCP Server (port 8000)
   - Bridge Server (port 3001)
   - Next.js Frontend (port 3000)

   **OR** start manually in separate terminals:
   
   **Terminal 1 - FastMCP Server:**
   ```bash
   python server/main.py
   ```
   
   **Terminal 2 - Bridge Server:**
   ```bash
   python bridge_server.py
   ```

### Frontend Setup
1. Navigate to frontend directory:
   ```bash
   cd frontend
   npm install
   ```

2. Configure environment variables:
   ```bash
   # Create .env.local in frontend/ directory
   # Add your Supabase credentials:
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   NEXT_PUBLIC_BRIDGE_SERVER_URL=http://localhost:3001
   ```
   
   **⚠️ Important**: Never commit `.env.local` to git!

3. Configure Supabase:
   - Go to [Supabase Dashboard](https://app.supabase.com)
   - Navigate to Authentication → URL Configuration
   - Add redirect URL: `http://localhost:3000/auth/callback`
   - Set site URL: `http://localhost:3000`

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open http://localhost:3000 and log in with an authorized email

### Using the CLI Client
```bash
python client/fast_mcp_client.py
```

## Features

### Document Management
- **File Ingestion**: Upload and process documents automatically
- **Text Extraction**: Intelligent parsing for multiple file formats
- **Storage**: Persistent document storage with metadata
- **Auto-Loading**: Previously ingested documents loaded on startup

### Intelligent Querying
- **Semantic Search**: Find relevant content using AI embeddings (all-MiniLM-L6-v2)
- **Context-Aware Responses**: LLM answers enriched with document context
- **Excel/CSV Analysis**: Natural language queries on structured data
- **Web Search Fallback**: Real-time information via Tavily API
- **General Knowledge**: Fallback to LLM for non-document queries

### MCP Tools Available
1. `ingest_file_tool` - Ingest and store documents
2. `answer_query_tool` - Answer queries with semantic search
3. `semantic_search_tool` - Direct semantic search on documents
4. `query_with_context_tool` - LLM query with document context
5. `query_excel_with_llm_tool` - Natural language Excel queries
6. `query_csv_with_llm_tool` - Natural language CSV queries
7. `web_search_tool` - Web search with LLM summarization

### Web Interface
- **Dashboard**: Central hub for all interactions
- **Chat Interface**: Conversational AI interface (UI ready, backend integration pending)
- **Collapsible Sidebar**: Navigation with workspaces, vault, and instructions
- **User Authentication**: Secure login with magic links
- **Responsive Design**: Desktop-optimized with mobile support

## Technology Stack

### Backend
- **FastMCP**: Model Context Protocol server framework
- **FastAPI**: REST API capabilities
- **Ollama**: Local LLM inference (Llama 3.2:3b)
- **sentence-transformers**: Semantic search embeddings
- **pandas**: Excel/CSV data processing
- **BeautifulSoup4**: Web content extraction
- **Tavily API**: Web search integration

### Frontend
- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **Framer Motion**: Smooth animations
- **Supabase**: Authentication and database

## Configuration

### Environment Variables

**Backend**:
- Documents stored in `storage/` directory (auto-created)
- Ollama endpoint: `http://localhost:11434`

**Frontend** (`.env.local`):
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### LLM Configuration
- Default model: `llama3.2:3b`
- Configurable via `query_model()` function parameters
- Supports any Ollama-compatible model

## Development

### Running the Full Stack

#### Option A: Automated Startup (Recommended)
```powershell
.\start_servers.ps1
```

This script will:
1. Check if Ollama is running
2. Start FastMCP Server (port 8000)
3. Start Bridge Server (port 3001)
4. Start Next.js Frontend (port 3000)

#### Option B: Manual Startup

**Terminal 1 - Ollama**:
```bash
ollama serve
```

**Terminal 2 - FastMCP Server**:
```bash
python server/main.py
```

**Terminal 3 - Bridge Server**:
```bash
python bridge_server.py
```

**Terminal 4 - Frontend**:
```bash
cd frontend
npm run dev
```

Open http://localhost:3000 in your browser.

### Development Commands

**Backend**:
```bash
# Install dependencies
pip install -r requirements.txt

# Run server
python server/main.py

# Use CLI client
python client/fast_mcp_client.py
```

**Frontend**:
```bash
cd frontend

# Development server (hot reload)
npm run dev

# Production build
npm run build
npm start

# Type checking
npm run type-check

# Linting
npm run lint
```

### Running Tests
```bash
# Backend tests (create tests directory)
pytest tests/

# Frontend tests
cd frontend
npm test
```

### Adding New Features

#### Adding File Format Support
1. Update `utils/file_parser.py` with new extraction logic
2. Add required dependencies to `requirements.txt`
3. Test ingestion with sample files

#### Adding MCP Tools
1. Define tool function in appropriate module
2. Register with `@mcp.tool` decorator in `server/main.py`
3. Update client integration if needed

#### Adding Frontend Components
1. Create component in `frontend/app/components/`
2. Follow TypeScript and Tailwind CSS patterns
3. Add documentation for complex components
4. Test accessibility and responsive design

## Troubleshooting

### Backend Issues
- **Ollama not found**: Install from https://ollama.ai and ensure it's running
- **Documents not loading**: Check `storage/` directory exists and has read permissions
- **Semantic search slow**: First query loads the model (cached afterwards)

### Frontend Issues
- **Auth redirect fails**: Add `http://localhost:3000/auth/callback` to Supabase redirect URLs
- **Session not persisting**: Clear browser cookies and check middleware configuration
- **Port 3000 in use**: Use `npm run dev -- -p 3001` and update Supabase URLs
- **Module not found**: Run `npm install` in frontend directory
- **TypeScript errors**: Check `tsconfig.json` configuration
- **Sidebar state not saving**: Check browser localStorage is enabled
- See `SETUP.md` and `SUPABASE_CONFIG.md` for detailed troubleshooting

## Frontend Component Reference

### Sidebar Component

A collapsible navigation sidebar with smooth animations and persistent state.

#### Props
```typescript
// Sidebar.tsx
interface SidebarProps {
  user: User                    // User object with id, email, role
  onSignOutAction: () => void   // Sign out callback
}

// SidebarItem.tsx
interface SidebarItemProps {
  icon: ReactNode               // SVG icon component
  label: string                 // Item label text
  isActive?: boolean           // Active state (default: false)
  isCollapsed: boolean         // Sidebar collapsed state
  onClick?: () => void         // Click handler
  badge?: number               // Optional badge count
  className?: string           // Additional CSS classes
}
```

#### Features
- **Collapse/Expand**: Toggle between 256px (expanded) and 64px (collapsed)
- **Hover-to-Expand**: Temporarily expand when hovering over collapsed sidebar
- **localStorage**: Persists state across sessions (key: `sidebar-collapsed`)
- **Animations**: 300ms ease-in-out transitions via Framer Motion
- **Accessibility**: Full keyboard navigation with ARIA attributes
- **Tooltips**: Show labels on hover when collapsed

#### Usage Example
```tsx
import Sidebar from '@/app/components/Sidebar/Sidebar'
import SidebarItem from '@/app/components/Sidebar/SidebarItem'

function Dashboard() {
  const [user, setUser] = useState<User>(/* ... */)
  
  return (
    <div className="flex h-screen">
      <Sidebar user={user} onSignOutAction={handleSignOut} />
      <main className="flex-1 min-w-0">
        {/* Main content */}
      </main>
    </div>
  )
}
```

#### Navigation Sections
- **Chat**: Main conversation interface
- **Workspaces**: Organize work into workspaces
- **Vault**: Document storage and management
- **Instructions**: Custom AI instructions
- **User Profile**: Avatar, email, role, and sign out

#### Keyboard Navigation
- **Tab**: Move between navigation items
- **Enter/Space**: Activate selected item
- **Escape**: Close mobile drawer

### Chat Components

#### ChatContainer.tsx
Displays message list with empty state.
- Auto-scrolls to latest messages
- Shows empty state with quick action suggestions
- Message streaming support (UI ready)

#### ChatMessage.tsx
Individual message with role-based styling.
- **User messages**: Right-aligned with gradient background
- **Assistant messages**: Left-aligned with dark background
- Markdown support ready

#### ChatInput.tsx
Message input with file attachment.
- Expandable textarea
- **Keyboard shortcut**: Cmd/Ctrl+Enter to send
- File attachment button
- Character limit validation

#### Usage Example
```tsx
import { ChatContainer, ChatInput, ChatMessage } from '@/app/components/Chat'

const [messages, setMessages] = useState<Message[]>([])

const handleSend = (content: string) => {
  setMessages([...messages, { id: Date.now(), content, role: 'user' }])
  // TODO: Send to backend
}

<ChatContainer messages={messages} />
<ChatInput onSendMessage={handleSend} />
```

## Documentation

### Setup & Configuration
- **SETUP.md** - Detailed setup guide for new developers
- **BRIDGE_SERVER.md** - Bridge server architecture and API reference
- **SUPABASE_CONFIG.md** - Authentication configuration reference
- **QUICK_FIX.md** - Quick troubleshooting for magic link login issues

### Architecture & Design
- **lean_auth_prd.md** - Authentication architecture PRD
- **SIDEBAR_IMPLEMENTATION_SUMMARY.md** - Sidebar implementation details
- **.github/copilot-instructions.md** - AI coding assistant guidelines
- **.github/instructions/github_instructions.instructions.md** - Git workflow

### Testing
- **test_bridge.py** - Bridge server integration tests

## Contributing

See `.github/instructions/github_instructions.instructions.md` for contribution guidelines.

Key points:
- Create feature branches for all changes
- Follow PEP8 for Python code
- Add tests for new features
- Update documentation for significant changes
- Ensure all tests pass before submitting PRs

## License
MIT

## Acknowledgments
- Built with [FastMCP](https://github.com/jlowin/fastmcp)
- Powered by [Ollama](https://ollama.ai)
- UI inspired by ChatGPT
