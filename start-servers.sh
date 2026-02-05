#!/bin/bash

# FastMCP-x Startup Script
# This script starts both backend and frontend servers

echo "🚀 Starting FastMCP-x..."
echo ""

# Add Homebrew to PATH
eval "$(/opt/homebrew/bin/brew shellenv zsh)"

# Check if Ollama is running
echo "Checking Ollama service..."
curl -s http://localhost:11434/api/version > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "⚠️  Ollama service is not running. Starting it..."
    brew services start ollama
    sleep 3
fi

# Start backend server in background
echo "Starting backend server..."
cd /Users/vanshchaudhari/FastMCP-x
python3.11 server/main.py > backend.log 2>&1 &
BACKEND_PID=$!
echo "✅ Backend server started (PID: $BACKEND_PID)"
echo "   Logs: backend.log"

# Wait a bit for backend to start
sleep 2

# Start frontend server in background
echo ""
echo "Starting frontend server..."
cd /Users/vanshchaudhari/FastMCP-x/frontend
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
echo "✅ Frontend server started (PID: $FRONTEND_PID)"
echo "   Logs: frontend.log"

echo ""
echo "======================================"
echo "FastMCP-x is running!"
echo "======================================"
echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo ""
echo "Backend PID:  $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "To stop the servers:"
echo "  kill $BACKEND_PID $FRONTEND_PID"
echo ""
echo "Or run:"
echo "  ./stop-servers.sh"
echo ""
echo "Press Ctrl+C to view this message again"
echo ""

# Save PIDs for stop script
echo $BACKEND_PID > /tmp/fastmcp-backend.pid
echo $FRONTEND_PID > /tmp/fastmcp-frontend.pid

# Wait for user interrupt
wait
