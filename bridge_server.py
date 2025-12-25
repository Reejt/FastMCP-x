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
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables from root .env file
load_dotenv()

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import MCP client functions (client connection handled internally)
from client.fast_mcp_client import (
    answer_query as mcp_answer_query,
    ingest_file as mcp_ingest_file,
    query_excel_with_llm as mcp_query_excel,
    web_search as mcp_web_search,
    answer_link_query as mcp_answer_link_query,
    generate_presentation as mcp_generate_presentation,
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
        "http://frontend:3000",  # Docker service name (container-to-container)
        "http://localhost:3000",  # Browser access (for development)
        "http://127.0.0.1:3000"   # Localhost IP fallback
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
    workspace_id: Optional[str] = None  # For workspace-specific instructions

class IngestRequest(BaseModel):
    file_name: str
    file_content: str  # base64 encoded
    file_type: str
    file_size: int
    user_id: str  # Required user ID for Supabase storage
    workspace_id: Optional[str] = None  # Optional workspace ID for file organization

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
        
        # Detect if query is a presentation generation request
        import re
        presentation_pattern = r'\b(create|generate|make|build)\s+(a\s+)?(presentation|powerpoint|slide|deck)\b'
        is_presentation_request = re.search(presentation_pattern, request.query, re.IGNORECASE)
        
        if is_presentation_request:
            print(f"🎨 Presentation generation detected: {request.query}")
            
            # Extract topic (everything except the presentation request keywords)
            topic = re.sub(presentation_pattern, '', request.query, flags=re.IGNORECASE).strip()
            if not topic:
                topic = "General Topic"
            
            # Extract number of slides if mentioned (e.g., "10 slides", "with 10 slides")
            slides_pattern = r'(\d+)\s*(slides?)?'
            slides_match = re.search(slides_pattern, request.query, re.IGNORECASE)
            num_slides = int(slides_match.group(1)) if slides_match else 10
            num_slides = max(5, min(num_slides, 50))  # Clamp between 5-50
            
            # Extract style if mentioned (professional, educational, creative)
            style = "professional"
            if re.search(r'\beducational\b', request.query, re.IGNORECASE):
                style = "educational"
            elif re.search(r'\bcreative\b', request.query, re.IGNORECASE):
                style = "creative"
            
            print(f"   Topic: {topic}, Slides: {num_slides}, Style: {style}")
            
            try:
                response = await mcp_generate_presentation(
                    topic=topic,
                    num_slides=num_slides,
                    style=style
                )
                
                # Parse response if it's a string
                if isinstance(response, str):
                    try:
                        response = json.loads(response)
                    except json.JSONDecodeError:
                        response = {"success": False, "error": response}
                
                def event_generator():
                    yield f"data: {json.dumps(response)}\n\n"
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
            except Exception as e:
                print(f"❌ Presentation generation error: {str(e)}")
                
                def event_generator():
                    yield f"data: {json.dumps({'success': False, 'error': str(e)})}\n\n"
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
        
        # Detect if query contains a URL - route to link query handler
        import re
        
        # Check if query contains a URL (http/https)
        url_pattern = r'https?://[^\s]+'
        url_match = re.search(url_pattern, request.query)
        
        if url_match:
            detected_url = url_match.group(0)
            print(f"🔗 Detected URL in query: {detected_url}")
            
            # Check if it's a supported web link
            if detected_url.startswith("http"):
                print("🔗 Web link detected")
                
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
        # Try regular query first, only route to web search if model indicates knowledge cutoff
        
        # Check for explicit knowledge cutoff indicators
        knowledge_cutoff_patterns = [
            r"\b(knowledge cutoff|training data cutoff|cutoff date)\b",
            r"\b(don't know|don't have|no information|no data)\b.*\b(about|on|regarding)\b",
            r"\b(unable to|can't|cannot)\b.*\b(access|find|provide)\b",
            r"\b(beyond.*knowledge|outside.*knowledge)\b",
        ]
        
        # Call the streaming query handler first
        async def event_generator():
            try:
                # Import streaming handler and instructions handler
                from server.query_handler import answer_query
                from server.instructions import query_with_instructions_stream
                
                # If workspace_id is provided, use instructions-aware query
                if request.workspace_id:
                    print(f"🎯 Using workspace instructions for workspace: {request.workspace_id}")
                    response_generator = query_with_instructions_stream(
                        query=request.query,
                        workspace_id=request.workspace_id,
                        conversation_history=request.conversation_history
                    )
                else:
                    # Get streaming response without workspace instructions
                    response_generator = answer_query(
                        request.query, 
                        conversation_history=request.conversation_history,
                        stream=True
                    )
                
                # Collect response chunks
                full_response = ""
                for chunk in response_generator:
                    if isinstance(chunk, dict) and 'response' in chunk:
                        chunk_text = chunk['response']
                        full_response += chunk_text
                        # Format as SSE
                        yield f"data: {json.dumps({'chunk': chunk_text})}\n\n"
                
                # Check if response indicates knowledge cutoff or is too short
                is_cutoff_response = any(
                    re.search(pattern, full_response, re.IGNORECASE) 
                    for pattern in knowledge_cutoff_patterns
                )
                
                # If response is empty, very short (< 20 chars), or indicates cutoff, try web search
                if not full_response.strip() or len(full_response.strip()) < 20 or is_cutoff_response:
                    print(f"⚠️ Inadequate response detected, routing to web_search for better results")
                    print(f"   Response length: {len(full_response.strip())} chars, Cutoff indicator: {is_cutoff_response}")
                    
                    # Yield separator and web search response
                    web_search_message = "\n\n🔍 Searching the web for more current information...\n\n"
                    yield f"data: {json.dumps({'chunk': web_search_message})}\n\n"
                    
                    web_response = await mcp_web_search(request.query)
                    yield f"data: {json.dumps({'chunk': web_response})}\n\n"
                
                # Send completion signal
                yield f"data: {json.dumps({'done': True})}\n\n"
                print(f"✅ Query completed")
                
            except Exception as e:
                print(f"❌ Error: {type(e).__name__}: {str(e)}")
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
        
        # Call fast_mcp_client function with base64_content directly
        # This avoids cross-container filesystem issues
        response = await mcp_ingest_file(
            file_path=request.file_name,  # Pass filename as fallback
            user_id=request.user_id,
            workspace_id=request.workspace_id,
            base64_content=request.file_content,  # Pass base64 content directly
            file_name=request.file_name
        )
                
        return {
            "success": True,
            "message": response,
            "file_name": request.file_name
        }
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

@app.post("/api/clear-instruction-cache")
async def clear_instruction_cache_endpoint(workspace_id: Optional[str] = None):
    """
    Clear cached instructions for a workspace or all workspaces
    
    Args:
        workspace_id: Optional workspace ID to clear. If not provided, clears all.
    
    Returns:
        Success message
    """
    try:
        from server.instructions import clear_instruction_cache
        
        print(f"📥 Cache clearing request received")
        print(f"   workspace_id: {workspace_id}")
        
        if workspace_id:
            print(f"🧹 Clearing instruction cache for workspace: {workspace_id}")
            clear_instruction_cache(workspace_id)
            print(f"✅ Cache cleared for workspace: {workspace_id}")
        else:
            print(f"🧹 Clearing all instruction caches")
            clear_instruction_cache()
            print(f"✅ All instruction caches cleared")
        
        return {
            "success": True,
            "message": f"Cache cleared" + (f" for workspace {workspace_id}" if workspace_id else " for all workspaces")
        }
    except Exception as e:
        print(f"❌ Cache clearing error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Cache clearing failed: {str(e)}")

if __name__ == "__main__":
    print("=" * 60)
    print("FastMCP Bridge Server")
    print("=" * 60)
    print("Bridge Server URL: http://bridge:3001 (Docker) / http://localhost:3001 (Local)")
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
