"""
FastAPI Bridge Server
Connects Next.js frontend to FastMCP backend via MCP Client
"""
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn
import sys
import os
import base64
import tempfile

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import MCP client functions (client connection handled internally)
from client.fast_mcp_client import (
    answer_query as mcp_answer_query,
    ingest_file as mcp_ingest_file,
    query_excel_with_llm as mcp_query_excel,
    web_search as mcp_web_search,
    semantic_search as mcp_semantic_search
)

# Initialize FastAPI app
app = FastAPI(
    title="FastMCP Bridge Server",
    description="Bridge between Next.js frontend and FastMCP backend using fast_mcp_client",
    version="1.0.0"
)

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for request validation
class QueryRequest(BaseModel):
    query: str
    max_chunks: Optional[int] = 3
    include_context_preview: Optional[bool] = True

class IngestRequest(BaseModel):
    file_name: str
    file_content: str  # base64 encoded
    file_type: str
    file_size: int

class ExcelQueryRequest(BaseModel):
    file_path: str
    query: str
    sheet_name: Optional[str] = None

class WebSearchRequest(BaseModel):
    query: str

class SemanticSearchRequest(BaseModel):
    query: str
    top_k: Optional[int] = 5

# Helper function to extract text from MCP result
def extract_response(result) -> str:
    """Extract text response from MCP result object"""
    if hasattr(result, 'content') and result.content:
        return result.content[0].text
    elif hasattr(result, 'data') and result.data:
        return result.data
    else:
        return str(result)

# API Routes
@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "service": "FastMCP Bridge Server",
        "mode": "routes_to_fast_mcp_client"
    }

@app.post("/api/query")
async def query_endpoint(request: QueryRequest):
    """
    Main query endpoint - answers questions using document context via MCP
    """
    try:
        print(f"📥 Received query: {request.query}")
        
        # Call fast_mcp_client function (handles MCP connection internally)
        response = await mcp_answer_query(request.query)
        print(f"✅ Query successful, response length: {len(str(response))}")
            
        return {
            "success": True,
            "response": response,
            "query": request.query
        }
    except Exception as e:
        print(f"❌ Query failed with error: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@app.post("/api/ingest")
async def ingest_endpoint(request: IngestRequest):
    """
    Ingest a document into the system via MCP
    """
    try:
        # Check file size limit
        max_size = 50 * 1024 * 1024  # 50MB
        if request.file_size > max_size:
            raise HTTPException(status_code=400, detail="File size too large (max 50MB)")
        
        # Decode base64 content
        file_content = base64.b64decode(request.file_content)
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=f"_{request.file_name}") as temp_file:
            temp_file.write(file_content)
            temp_file_path = temp_file.name
        
        try:
            # Call fast_mcp_client function (handles MCP connection internally)
            response = await mcp_ingest_file(temp_file_path)
                
            return {
                "success": True,
                "message": response,
                "file_name": request.file_name
            }
        finally:
            # Clean up temporary file
            os.unlink(temp_file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")

@app.post("/api/query-excel")
async def query_excel_endpoint(request: ExcelQueryRequest):
    """
    Query Excel/CSV files using natural language via MCP
    """
    try:
        # Call fast_mcp_client function (handles MCP connection internally)
        # This function handles both Excel and CSV files
        response = await mcp_query_excel(
            request.file_path, 
            request.query, 
            request.sheet_name
        )
        
        return {
            "success": True,
            "response": response,
            "query": request.query,
            "file_path": request.file_path
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Excel query failed: {str(e)}")

@app.post("/api/web-search")
async def web_search_endpoint(request: WebSearchRequest):
    """
    Perform web search and get summarized results via MCP
    """
    try:
        # Call fast_mcp_client function (handles MCP connection internally)
        response = await mcp_web_search(request.query)
        
        # Check if the search was successful
        if response.startswith("Error") or response.startswith("No search results"):
            return {"success": False, "response": response, "query": request.query}
        
        return {
            "success": True,
            "response": response,
            "query": request.query
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Web search failed: {str(e)}")

@app.get("/api/health")
async def health_check():
    """
    Detailed health check - tests connection through fast_mcp_client
    """
    try:
        # Try a simple query to test the connection
        test_response = await mcp_answer_query("test")
        
        return {
            "status": "healthy",
            "mode": "routes_to_fast_mcp_client",
            "mcp_connection": "connected",
            "endpoints": {
                "query": "/api/query",
                "ingest": "/api/ingest",
                "query_excel": "/api/query-excel",
                "web_search": "/api/web-search"
            }
        }
    except Exception as e:
        return {
            "status": "degraded",
            "mode": "routes_to_fast_mcp_client",
            "mcp_connection": "failed",
            "error": str(e)
        }

if __name__ == "__main__":
    print("=" * 60)
    print("FastMCP Bridge Server")
    print("=" * 60)
    print("Bridge Server URL: http://localhost:3001")
    print("Routes requests to: client/fast_mcp_client.py")
    print("=" * 60)
    print("ℹ️  PREREQUISITE: FastMCP server must be running")
    print("   If not started yet, run in another terminal:")
    print("   python server/main.py")
    print("=" * 60)
    print("Starting Bridge Server...")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=3001,
        log_level="info"
    )
