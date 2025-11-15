"""
FastAPI Bridge Server
Connects Next.js frontend to FastMCP backend via MCP Client
"""
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import uvicorn
import sys
import os
import base64
import tempfile
import json

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import MCP client functions (client connection handled internally)
from client.fast_mcp_client import (
    answer_query as mcp_answer_query,
    ingest_file as mcp_ingest_file,
    query_excel_with_llm as mcp_query_excel,
    web_search as mcp_web_search,
    answer_link_query as mcp_answer_link_query,
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
    conversation_history: Optional[list] = []

class IngestRequest(BaseModel):
    file_name: str
    file_content: str  # base64 encoded
    file_type: str
    file_size: int
    user_id: str = None  # Optional user ID for Supabase storage

class ExcelQueryRequest(BaseModel):
    file_path: str
    query: str
    sheet_name: Optional[str] = None

class WebSearchRequest(BaseModel):
    query: str


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
    Supports conversation history for contextual follow-up questions
    Returns Server-Sent Events (SSE) stream for real-time responses
    """
    try:
        print(f"📥 Received query: {request.query}")
        if request.conversation_history:
            print(f"📜 With conversation history: {len(request.conversation_history)} messages")
        
        # Detect if query contains a URL - route to link query handler
        import re
        
        # Check if query contains a URL (http/https)
        url_pattern = r'https?://[^\s]+'
        url_match = re.search(url_pattern, request.query)
        
        if url_match:
            detected_url = url_match.group(0)
            print(f"🔗 Detected URL in query: {detected_url}")
            
            # Check if it's a supported social media or web link
            if detected_url.startswith("http"):
                if "youtube.com" in detected_url or "youtu.be" in detected_url:
                    print("📺 YouTube link detected")
                elif "twitter.com" in detected_url or "x.com" in detected_url:
                    print("🐦 Twitter/X link detected")
                elif "instagram.com" in detected_url:
                    print("📷 Instagram link detected")
                else:
                    print("🌐 Web link detected")
                
                # Extract the question part (everything except the URL)
                question = re.sub(url_pattern, '', request.query).strip()
                if not question:
                    question = "Summarize the content of this link"
                
                print(f"❓ Question: {question}")
                
                # Call link query handler
                response = await mcp_answer_link_query(detected_url, question)
                
                def event_generator():
                    yield f"data: {json.dumps({'chunk': response})}\n\n"
                    yield f"data: {json.dumps({'done': True})}\n\n"
                
                return StreamingResponse(
                    event_generator(),
                    media_type="text/event-stream",
                    headers={
                        "Cache-Control": "no-cache",
                        "Connection": "keep-alive",
                        "X-Accel-Buffering": "no"
                    }
                )
        
        # Detect if query requires real-time/current information from web search
        query_lower = request.query.lower()
        
        # Check for year mentions after 2023
        year_match = re.search(r"\b(202[4-9]|20[3-9][0-9])\b", request.query)
        
        # Expanded real-time/current information patterns (case-insensitive)
        realtime_patterns = [
            # Version and release information - more flexible patterns
            r"\b(latest|current|newest|recent|new|updated?)\b.*\b(version|release|update)",
            r"\bversion\b.*\b(latest|current|newest|recent|new)",
            r"what.{0,20}(version|release)",
            r"which\b.*\bversion",
            r"how to (update|upgrade)",
            r"(update|upgrade).{0,30}(to|from)",
            
            # Security vulnerabilities - semantic patterns
            r"\bcve[-\s]?\d",
            r"\b(vulnerability|vulnerabilities|security)\b",
            r"\b(patch|patched|patching|fix|fixed)\b",
            r"\b(zero[- ]?day|0[- ]?day)\b",
            r"\b(exploit|exploited|exploitation)\b",
            r"\b(security\s+(advisory|alert|issue|flaw|hole))",
            r"\b(breach|breached|compromised)\b",
            r"\b(malware|ransomware|trojan|virus)\b",
            
            # Migration and deprecation - semantic intent
            r"\b(breaking\s+change|breaking\s+update)",
            r"\b(migration|migrate|migrating)\b",
            r"\b(upgrade|upgrading)\b.*\b(guide|how|from|to)",
            r"\b(deprecated|deprecation)\b",
            r"\b(end\s+of\s+life|eol|sunset|sunsetted)\b",
            r"\b(changelog|change\s+log|release\s+notes)\b",
            
            # API documentation and status
            r"\bapi\b.{0,20}\b(documentation|docs|reference|spec)",
            r"\b(endpoint|endpoints|route|routes)\b",
            r"\bapi\b.{0,20}\b(status|health|availability)",
            r"\b(rate\s+limit|throttl)",
            r"\bapi\b.{0,20}\b(change|update|deprecat)",
            
            # Service status - operational queries
            r"\b(is|are)\b.{0,30}\b(down|working|available|up|online|offline)",
            r"\b(outage|incident|downtime)\b",
            r"\b(service\s+status|status\s+page)",
            r"\b(uptime|availability)\b",
            r"\b(degraded|slow|performance\s+issue)",
            r"\b(aws|azure|gcp|google\s+cloud).{0,20}status",
            
            # Comparisons - especially with versions
            r"\bvs\.?\b|\bversus\b",
            r"\bcompare[ds]?\s+(to|with|against)",
            r"\bbenchmark[s]?\b",
            r"\b(performance\s+comparison|compare\s+performance)",
            r"\bwhich\s+(is\s+)?(better|faster|best)",
            r"\b(difference|differences)\s+between",
            r"\b(pros?\s+and\s+cons?|advantages?\s+and\s+disadvantages?)",
            
            # Issues and bugs - problem reports
            r"\b(known\s+issue|known\s+bug|known\s+problem)",
            r"\bbug\b.{0,20}\b(in|with|on)",
            r"\b(error|issue|problem)\s+(with|in|on)",
            r"\b(not\s+working|doesn't\s+work|does\s+not\s+work)",
            r"\b(broken|failing|failed)\b.{0,20}\b(in|with|version)",
            
            # Compatibility - integration queries
            r"\b(compatible|compatibility)\s+(with|check)",
            r"\b(works?\s+with|working\s+with)",
            r"\b(support|supports|supported)\b",
            r"\b(available\s+for|runs?\s+on)",
            r"\bcan\s+i\s+use\b.{0,30}\bwith\b",
            r"\b(require|requires|requirement)",
            
            # Licensing and pricing - business changes
            r"\b(license|licensing)\b.{0,20}\b(change|update|new)",
            r"\b(commercial\s+use|enterprise\s+license)",
            r"\b(open\s+source\s+license|oss\s+license)",
            r"\b(terms\s+of\s+service|tos|terms\s+and\s+conditions)",
            r"\b(pricing|price|cost).{0,20}\b(change|update|new)",
            
            # General temporal indicators
            r"\b(now|today|currently|recent|recently|new)\b",
            r"\b(this\s+(year|month|week))",
            r"\bas\s+of\s+(now|today|\d{4})",
        ]
        
        # Check if query matches any real-time patterns
        pattern_match = any(re.search(pattern, query_lower) for pattern in realtime_patterns)
        
        if year_match or pattern_match:
            print("🔎 Detected query about post-cutoff event, routing to web_search_tool")
            response = await mcp_web_search(request.query)
            def event_generator():
                yield f"data: {json.dumps({'chunk': response})}\n\n"
                yield f"data: {json.dumps({'done': True})}\n\n"
            return StreamingResponse(
                event_generator(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no"
                }
            )
        
        # Call the streaming query handler for other queries
        async def event_generator():
            try:
                # Import streaming handler
                from server.query_handler import answer_query
                
                # Get streaming response
                response_generator = answer_query(
                    request.query, 
                    conversation_history=request.conversation_history,
                    stream=True
                )
                
                # Stream chunks as Server-Sent Events
                for chunk in response_generator:
                    if isinstance(chunk, dict) and 'response' in chunk:
                        chunk_text = chunk['response']
                        # Format as SSE
                        yield f"data: {json.dumps({'chunk': chunk_text})}\n\n"
                
                # Send completion signal
                yield f"data: {json.dumps({'done': True})}\n\n"
                print(f"✅ Query streaming completed")
                
            except Exception as e:
                print(f"❌ Streaming error: {type(e).__name__}: {str(e)}")
                import traceback
                traceback.print_exc()
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
        
        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"  # Disable nginx buffering
            }
        )
        
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
            response = await mcp_ingest_file(temp_file_path, user_id=request.user_id)
                
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
                "query": "/api/query (supports URLs, web search, and document queries)",
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
