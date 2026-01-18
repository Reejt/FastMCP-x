# Starting FastMCP-x Services

This guide helps you start all required services for FastMCP-x to work properly.

## Required Services

1. **Frontend** (Next.js) - Port 3000 ✅ Already running
2. **Bridge Server** (FastAPI) - Port 3001 ❌ Not running
3. **Backend** (FastMCP) - Port 8000 ❌ Not running
4. **Ollama** (LLM) - Port 11434 ⚠️ Attempted but failed

## Quick Start Options

### Option A: Using Docker (Recommended)

If you have Docker installed:

```bash
# Start Ollama + backend + bridge (recommended)
docker compose -f docker-compose.dev.yml up --build -d ollama backend bridge

# Check status
docker compose -f docker-compose.dev.yml ps

# View logs
docker compose -f docker-compose.dev.yml logs -f bridge
```

### Option B: Manual Setup (Python 3.10+ Required)

Your current Python version is **3.9.6**, but FastMCP requires **Python 3.10+**.

#### Step 1: Install Python 3.11

```bash
# Using Homebrew
brew install python@3.11

# Verify installation
python3.11 --version
```

#### Step 2: Create Virtual Environment

```bash
# In the FastMCP-x directory
python3.11 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Verify Python version in venv
python --version  # Should show 3.11.x
```

#### Step 3: Install Dependencies

```bash
pip install -r requirements.txt
```

#### Step 4: Configure Environment Variables

Create a `.env` file in the root directory:

```bash
# Copy the template
cat > .env << 'EOF'
# Supabase Configuration
SUPABASE_URL=https://fxdaznzojfrtwdwwaxna.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4ZGF6bnpvamZydHdkd3dheG5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTM2ODIsImV4cCI6MjA3MjQ4OTY4Mn0.zLOEPlNbdK67AoC9VlGDZV2jYCKN7SB30ci0LDBb7_4
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Tavily API Key (optional - for web search)
TAVILY_API_KEY=your_tavily_api_key_here

# MCP Server Configuration
MCP_SERVER_HOST=localhost
MCP_SERVER_PORT=8000
EOF
```

#### Step 5: Start Ollama (LLM Service)

In a separate terminal:

```bash
ollama serve
```

If you don't have Ollama installed:

```bash
# Install Ollama
brew install ollama

# Pull the required model
ollama pull llama3.2:3b
```

#### Step 6: Start Backend Server

In a separate terminal (with venv activated):

```bash
python server/main.py
```

This starts the FastMCP backend on port 8000.

#### Step 7: Start Bridge Server

In another terminal (with venv activated):

```bash
python bridge_server.py
```

This starts the bridge server on port 3001.

## Verify Everything is Running

Open a new terminal and test each service:

```bash
# Test Ollama
curl http://localhost:11434/api/tags

# Test Bridge Server
curl http://localhost:3001/

# Test Frontend (should already be running)
curl http://localhost:3000/
```

## Current Status

Based on your terminal output:

- ✅ **Frontend**: Running on port 3000
- ❌ **Bridge Server**: Not running (causing the error)
- ❌ **Backend**: Not running
- ⚠️ **Ollama**: Start failed (exit code 1)

## Troubleshooting

### "ModuleNotFoundError: No module named 'fastapi'"

You need Python 3.10+ and to install dependencies:
```bash
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### "docker: command not found"

Install Docker Desktop from: https://www.docker.com/products/docker-desktop/

### Bridge Server Connection Error

The error you're seeing:
```
API error: Internal Server Error
at handleSendMessage (app/workspaces/[id]/page.tsx:328:15)
```

This happens because the frontend is trying to connect to the bridge server at `http://bridge:3001`, but the bridge server isn't running.

**Solution**: Start the bridge server using one of the options above.

### Ollama Service Won't Start

Check if it's already running:
```bash
ps aux | grep ollama
```

If it's running, you're good! If not:
```bash
ollama serve
```

## Next Steps

1. Choose either Option A (Docker) or Option B (Manual)
2. Start all required services
3. Refresh your browser on http://localhost:3000
4. Try sending a message in the workspace chat

The improved error messages will now guide you if any service is still not running.
