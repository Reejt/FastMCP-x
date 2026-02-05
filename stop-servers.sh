#!/bin/bash

# FastMCP-x Stop Script
# This script stops both backend and frontend servers

echo "🛑 Stopping FastMCP-x servers..."
echo ""

# Read PIDs
if [ -f /tmp/fastmcp-backend.pid ]; then
    BACKEND_PID=$(cat /tmp/fastmcp-backend.pid)
    if ps -p $BACKEND_PID > /dev/null 2>&1; then
        kill $BACKEND_PID
        echo "✅ Backend server stopped (PID: $BACKEND_PID)"
    else
        echo "⚠️  Backend server was not running"
    fi
    rm /tmp/fastmcp-backend.pid
else
    echo "⚠️  No backend PID found"
fi

if [ -f /tmp/fastmcp-frontend.pid ]; then
    FRONTEND_PID=$(cat /tmp/fastmcp-frontend.pid)
    if ps -p $FRONTEND_PID > /dev/null 2>&1; then
        kill $FRONTEND_PID
        echo "✅ Frontend server stopped (PID: $FRONTEND_PID)"
    else
        echo "⚠️  Frontend server was not running"
    fi
    rm /tmp/fastmcp-frontend.pid
else
    echo "⚠️  No frontend PID found"
fi

# Also kill any remaining python/node processes for this project
pkill -f "python3.11 server/main.py"
pkill -f "next dev"

echo ""
echo "All servers stopped."
