#!/bin/bash

# FastMCP-x Setup Verification Script

echo "======================================"
echo "FastMCP-x Setup Verification"
echo "======================================"
echo ""

# Add Homebrew to PATH
eval "$(/opt/homebrew/bin/brew shellenv zsh)"

# Check Python installation
echo "1. Checking Python installation..."
python3.11 --version
if [ $? -eq 0 ]; then
    echo "   ✅ Python 3.11 is installed"
else
    echo "   ❌ Python 3.11 is not installed"
    exit 1
fi
echo ""

# Check Node.js installation
echo "2. Checking Node.js installation..."
node --version
if [ $? -eq 0 ]; then
    echo "   ✅ Node.js is installed"
else
    echo "   ❌ Node.js is not installed"
    exit 1
fi
echo ""

# Check Ollama installation
echo "3. Checking Ollama installation..."
ollama --version
if [ $? -eq 0 ]; then
    echo "   ✅ Ollama is installed"
else
    echo "   ❌ Ollama is not installed"
    exit 1
fi
echo ""

# Check if Ollama is running
echo "4. Checking Ollama service..."
curl -s http://localhost:11434/api/version > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ Ollama service is running"
else
    echo "   ⚠️  Ollama service may not be running"
    echo "   Run: brew services start ollama"
fi
echo ""

# Check Python dependencies
echo "5. Checking Python dependencies..."
python3.11 -c "import fastmcp; import fastapi; import pandas; import sentence_transformers; import supabase" 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ All Python dependencies are installed"
else
    echo "   ❌ Some Python dependencies are missing"
fi
echo ""

# Check Node.js dependencies
echo "6. Checking Node.js dependencies..."
if [ -d "frontend/node_modules" ]; then
    echo "   ✅ Node.js dependencies are installed"
else
    echo "   ❌ Node.js dependencies are missing"
    echo "   Run: cd frontend && npm install"
fi
echo ""

# Check environment configuration
echo "7. Checking environment configuration..."
if [ -f "frontend/.env.local" ]; then
    echo "   ✅ Frontend .env.local exists"
    if grep -q "your-project-id" frontend/.env.local; then
        echo "   ⚠️  You need to configure Supabase credentials in frontend/.env.local"
    else
        echo "   ✅ Supabase credentials appear to be configured"
    fi
else
    echo "   ❌ Frontend .env.local is missing"
fi
echo ""

echo "======================================"
echo "Setup Summary"
echo "======================================"
echo ""
echo "Your FastMCP-x project is ready!"
echo ""
echo "To start the backend server:"
echo "  cd /Users/vanshchaudhari/FastMCP-x"
echo "  python3.11 server/main.py"
echo ""
echo "To start the frontend (in a new terminal):"
echo "  cd /Users/vanshchaudhari/FastMCP-x/frontend"
echo "  npm run dev"
echo ""
echo "Then open http://localhost:3000 in your browser"
echo ""
echo "⚠️  Remember to configure Supabase credentials in frontend/.env.local"
echo "   See: https://app.supabase.com/project/_/settings/api"
echo ""
