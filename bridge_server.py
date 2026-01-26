"""
FastAPI Bridge Server
Connects Next.js frontend to FastMCP backend via MCP Client
"""
import asyncio
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, List
import uvicorn
import sys
import os
import base64
import tempfile
import json
from datetime import datetime
from dotenv import load_dotenv
import inspect

# Load environment variables from root .env file
load_dotenv()

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import MCP client functions (client connection handled internally)
from client.fast_mcp_client import (
    answer_query as mcp_answer_query,
    ingest_file as mcp_ingest_file,
    web_search as mcp_web_search,
    answer_link_query as mcp_answer_link_query,
    query_csv_with_context as mcp_query_csv_with_context,
    query_excel_with_context as mcp_query_excel_with_context,
    agentic_task as mcp_agentic_task,
)

# Import semantic search with metadata
from server.query_handler import semantic_search_with_metadata

# Import Supabase client for file metadata lookup
try:
    from supabase import create_client, Client
    SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    supabase_client = None
    if SUPABASE_URL and SUPABASE_KEY:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Supabase client initialized for file lookup")
except ImportError:
    print("⚠️  Supabase client not available")
    supabase_client = None

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
        "http://localhost:3000",  # Local development (npm run dev)
        "http://127.0.0.1:3000",  # Localhost IP fallback
        "http://localhost:*",     # Allow any localhost port
        "http://127.0.0.1:*",     # Allow any 127.0.0.1 port
        "http://frontend:3000",  # Docker service name (if using Docker)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# Global exception handler - prevents HTML error responses on API routes
@app.exception_handler(Exception)
async def api_exception_handler(request: Request, exc: Exception):
    """Ensure all API errors return JSON/SSE format, never HTML"""
    if request.url.path.startswith("/api"):
        print(f"🛑 API Exception caught: {type(exc).__name__}: {str(exc)}")
        import traceback
        traceback.print_exc()
        # Return SSE-formatted error stream
        async def error_stream():
            yield f"data: {json.dumps({'error': str(exc), 'type': type(exc).__name__})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        return StreamingResponse(
            error_stream(),
            media_type="text/event-stream",
            status_code=500,
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }
        )
    # Let non-API routes use default handler
    raise exc

# Pydantic models for request validation
class QueryRequest(BaseModel):
    query: str
    max_chunks: Optional[int] = 3
    include_context_preview: Optional[bool] = True
    conversation_history: Optional[list] = []
    workspace_id: Optional[str] = None  # For workspace-specific instructions
    selected_file_ids: Optional[List[str]] = None  # For filtering search to specific files

class IngestRequest(BaseModel):
    file_name: str
    file_content: str  # base64 encoded
    file_type: str
    file_size: int
    user_id: str  # Required user ID for Supabase storage
    workspace_id: Optional[str] = None  # Optional workspace ID for file organization

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
async def query_endpoint(query_request: QueryRequest, request: Request):
    """
    Main query endpoint with intelligent routing using metadata-aware semantic search.
    
    Metadata-aware search automatically detects:
    - CSV/Excel files (routes to specialized handlers)
    - URLs (routes to link handler)
    - Regular documents (routes to LLM query)
    
    This eliminates ~200 lines of file detection/routing code.
    """
    try:
        print(f"📥 Received query: {query_request.query}")
        if query_request.conversation_history:
            print(f"📜 With conversation history: {len(query_request.conversation_history)} messages")
        if query_request.workspace_id:
            print(f"🏢 Workspace ID: {query_request.workspace_id}")
        
        import re
        
        # Check if query is for agentic task execution
        if "agent" in query_request.query.lower():
            print(f"🤖 Agentic task detected in query")
            
            async def agent_event_generator():
                try:
                    response = await mcp_agentic_task(
                        goal=query_request.query,
                        context=f"Workspace: {query_request.workspace_id}" if query_request.workspace_id else "",
                        max_iterations=10
                    )
                    
                    try:
                        response_data = json.loads(response) if isinstance(response, str) else response
                        final_result = response_data.get('final_result', 'No result')
                        yield f"data: {json.dumps({'chunk': final_result})}\n\n"
                    except json.JSONDecodeError:
                        yield f"data: {json.dumps({'chunk': response})}\n\n"
                    
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    print(f"✅ Agent task completed")
                    
                except Exception as e:
                    print(f"❌ Agent task error: {str(e)}")
                    import traceback
                    traceback.print_exc()
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"
            
            return StreamingResponse(
                agent_event_generator(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no"
                }
            )
        
        # Detect if query contains a URL - route to link query handler
        url_pattern = r'https?://[^\s]+'
        url_match = re.search(url_pattern, query_request.query)
        
        if url_match:
            detected_url = url_match.group(0)
            print(f"🔗 Detected URL in query: {detected_url}")
            
            if detected_url.startswith("http"):
                print("🔗 Web link detected")
                
                # Extract the question part (everything except the URL)
                question = re.sub(url_pattern, '', query_request.query).strip()
                if not question:
                    question = "Summarize the content of this link"
                
                print(f"❓ Question: {question}")
                
                # Call link query handler
                response = await mcp_answer_link_query(detected_url, question, conversation_history=query_request.conversation_history, workspace_id=query_request.workspace_id)
                
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
        
        # ============================================
        # METADATA-AWARE INTELLIGENT ROUTING
        # ============================================
        # This replaces ~200 lines of file detection/routing code
        
        async def event_generator():
            try:
                csv_file_ids = []
                excel_file_ids = []
                if query_request.selected_file_ids:
                    # Fetch file types from Supabase for selected files
                    if supabase_client:
                        try:
                            print(f"🔍 Fetching file metadata from Supabase for {len(query_request.selected_file_ids)} files")
                            
                            # Query file_upload table for file types and names
                            response = supabase_client.table('file_upload').select(
                                'id, file_name, file_type'
                            ).in_('id', query_request.selected_file_ids).execute()
                            
                            file_metadata = response.data if response.data else []
                            print(f"📊 Retrieved metadata for {len(file_metadata)} files")
                            
                            # Filter CSV and Excel files by type
                            csv_types = {'csv', 'text/csv'}
                            excel_types = {'xlsx', 'xls', 'excel', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}
                            
                            for file_info in file_metadata:
                                file_type = (file_info.get('file_type') or '').lower()
                                file_id = file_info.get('id')
                                file_name = file_info.get('file_name')
                                
                                # Determine file type from extension or MIME type
                                if file_type in excel_types or file_name.lower().endswith(('.xlsx', '.xls')):
                                    excel_file_ids.append(file_id)
                                    print(f"   ✓ {file_name} ({file_type}) - Excel detected")
                                elif file_type in csv_types or file_name.lower().endswith('.csv'):
                                    csv_file_ids.append(file_id)
                                    print(f"   ✓ {file_name} ({file_type}) - CSV detected")
                                else:
                                    print(f"   • {file_name} ({file_type}) - Regular document")
                            
                            print(f"📊 Identified {len(csv_file_ids)} CSV files and {len(excel_file_ids)} Excel files for specialized processing")
                        
                        except Exception as e:
                            print(f"⚠️  Error fetching file metadata from Supabase: {str(e)}")
                            # Fallback: assume CSV if fetch fails
                            csv_file_ids = query_request.selected_file_ids
                    else:
                        print(f"⚠️  Supabase client not available, cannot fetch file metadata")
                        csv_file_ids = query_request.selected_file_ids
                
                # Route 1: CSV file query (direct selection)
                if csv_file_ids:
                    print(f"📊 Routing to CSV handler (files explicitly selected)")
                    
                    response = await mcp_query_csv_with_context(
                        query=query_request.query,
                        file_name='',
                        file_path=None,
                        conversation_history=query_request.conversation_history,
                        workspace_id=query_request.workspace_id,
                        selected_file_ids=csv_file_ids
                    )
                    yield f"data: {json.dumps({'chunk': response})}\n\n"
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    print(f"✅ CSV query completed")
                    return
                
                # Route 1b: Excel file query (direct selection)
                if excel_file_ids:
                    print(f"📊 Routing to Excel handler (files explicitly selected)")
                    
                    response = await mcp_query_excel_with_context(
                        query=query_request.query,
                        file_name='',
                        file_path=None,
                        conversation_history=query_request.conversation_history,
                        workspace_id=query_request.workspace_id,
                        selected_file_ids=excel_file_ids
                    )
                    yield f"data: {json.dumps({'chunk': response})}\n\n"
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    print(f"✅ Excel query completed")
                    return
                
                # Route 2: Regular document/LLM query with semantic search
                print(f"💬 Routing to regular document query with semantic search")
                
                from server.query_handler import answer_query
                from server.instructions import query_with_instructions_stream
                
                # ✅ CREATE ABORT EVENT for cancellation support
                import threading
                abort_event = threading.Event()
                
                if query_request.workspace_id:
                    print(f"🎯 Using workspace instructions for workspace: {query_request.workspace_id}")
                    response_generator = await query_with_instructions_stream(
                        query=query_request.query,
                        workspace_id=query_request.workspace_id,
                        conversation_history=query_request.conversation_history,
                        selected_file_ids=query_request.selected_file_ids,
                        abort_event=abort_event  # ✅ Pass abort event
                    )
                else:
                    response_generator = await answer_query(
                        query_request.query,
                        conversation_history=query_request.conversation_history,
                        stream=True,
                        workspace_id=query_request.workspace_id,
                        selected_file_ids=query_request.selected_file_ids,
                        abort_event=abort_event  # ✅ Pass abort event
                    )
                
                # Check if generator is async
                is_async_gen = inspect.isasyncgen(response_generator)
                print(f"📡 Generator type: {'async' if is_async_gen else 'sync'}")  # Debug log
                
                full_response = ""
                chunk_count = 0
                try:
                    if is_async_gen:
                        async for chunk in response_generator:
                            # ✅ CHECK FOR CLIENT DISCONNECT
                            if await request.is_disconnected():
                                print("🛑 Client disconnected - aborting Ollama request")
                                abort_event.set()  # Signal abort to query_model
                                break
                            
                            if isinstance(chunk, dict) and 'response' in chunk:
                                chunk_text = chunk['response']
                                full_response += chunk_text
                                yield f"data: {json.dumps({'chunk': chunk_text})}\n\n"
                    else:
                        for chunk in response_generator:
                            if isinstance(chunk, dict) and 'response' in chunk:
                                chunk_text = chunk['response']
                                full_response += chunk_text
                                yield f"data: {json.dumps({'chunk': chunk_text})}\n\n"
                except Exception as chunk_error:
                    print(f"❌ Chunk processing error: {type(chunk_error).__name__}: {str(chunk_error)}")
                    yield f"data: {json.dumps({'error': str(chunk_error)})}\n\n"
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    return
                
                # Check for knowledge cutoff and route to web search if needed
                knowledge_cutoff_patterns = [
                    r"\b(knowledge cutoff|training data cutoff|cutoff date)\b",
                    r"\b(don't know|don't have|no information|no data)\b.*\b(about|on|regarding)\b",
                    r"\b(unable to|can't|cannot)\b.*\b(access|find|provide)\b",
                ]
                
                is_cutoff_response = any(
                    re.search(pattern, full_response, re.IGNORECASE)
                    for pattern in knowledge_cutoff_patterns
                )
                
                if is_cutoff_response:
                    print(f"⚠️  Knowledge cutoff detected, routing to web search")
                    web_search_message = "\n\n🔍 Searching the web for more current information...\n\n"
                    yield f"data: {json.dumps({'chunk': web_search_message})}\n\n"
                    
                    try:
                        web_response = await asyncio.wait_for(
                            mcp_web_search(
                                query_request.query,
                                conversation_history=query_request.conversation_history,
                                workspace_id=query_request.workspace_id
                            ),
                            timeout=15.0
                        )
                        yield f"data: {json.dumps({'chunk': web_response})}\n\n"
                    except asyncio.TimeoutError:
                        print(f"⏱️ Web search timed out")
                        yield f"data: {json.dumps({'error': 'Web search timed out'})}\n\n"
                    except Exception as web_error:
                        print(f"❌ Web search error: {str(web_error)}")
                
                yield f"data: {json.dumps({'done': True})}\n\n"
                print(f"✅ Query completed")
                
            except Exception as e:
                print(f"❌ Error: {type(e).__name__}: {str(e)}")
                import traceback
                traceback.print_exc()
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
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
        print(f"❌ Query failed: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        
        async def error_stream():
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        
        return StreamingResponse(
            error_stream(),
            media_type="text/event-stream",
            status_code=500
        )


@app.post("/api/ingest")
async def ingest_endpoint(request: IngestRequest):
    """
    Ingest a document into the system via MCP
    """
    try:
        # Check file size limit
        max_size = 30 * 1024 * 1024  # 30MB
        if request.file_size > max_size:
            raise HTTPException(status_code=400, detail="File size too large (max 30MB)")
        
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


# ============================================
# Title Generation Endpoint
# ============================================

class TitleGenerationRequest(BaseModel):
    """Request model for chat title generation"""
    message: str

@app.post("/generate-title")
async def generate_title(request: TitleGenerationRequest):
    """
    Generate a descriptive title for a chat session based on the first message.
    Uses Ollama LLM to create concise, meaningful titles.
    
    Args:
        request: Contains the first message from the chat
    
    Returns:
        Generated title (max 6 words)
    """
    try:
        from server.query_handler import generate_chat_title
        
        print(f"📝 Title generation request received")
        print(f"   message preview: {request.message[:100]}...")
        
        # Generate title using LLM
        title = generate_chat_title(request.message)
        
        print(f"✅ Generated title: {title}")
        
        return {
            "success": True,
            "title": title
        }
    except Exception as e:
        print(f"❌ Title generation error: {str(e)}")
        # Return fallback title instead of error to ensure graceful degradation
        words = request.message.split()[:5]
        fallback_title = ' '.join(words) if words else 'New Chat'
        if len(fallback_title) > 50:
            fallback_title = fallback_title[:47] + '...'
        
        return {
            "success": True,
            "title": fallback_title
        }


if __name__ == "__main__":
    print("=" * 60)
    print("FastMCP Bridge Server")
    print("=" * 60)
    print("Bridge Server URL: http://localhost:3001 (Local Dev)")
    print("Docker URL: http://bridge:3001 (if using Docker)")
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

