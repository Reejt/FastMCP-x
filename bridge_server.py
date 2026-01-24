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

# Import extract_document_name for robust file name detection
from server.query_handler import extract_document_name

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
        if request.workspace_id:
            print(f"🏢 Workspace ID: {request.workspace_id}")
        
        import re
        
        # Check if query is for agentic task execution
        if "agent" in request.query.lower():
            print(f"🤖 Agentic task detected in query")
            
            async def agent_event_generator():
                try:
                    # Call agentic task tool
                    response = await mcp_agentic_task(
                        goal=request.query,
                        context=f"Workspace: {request.workspace_id}" if request.workspace_id else "",
                        max_iterations=10
                    )
                    
                    # Parse response and extract final result
                    try:
                        response_data = json.loads(response) if isinstance(response, str) else response
                        # Only display the final result
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
        
        # Helper function to route file queries (reduces redundancy)
        async def route_file_query(file_info, source_label="file"):
            """Route query to appropriate file handler (CSV/Excel)"""
            print(f"🎯 Routing to {file_info['file_type'].upper()} handler ({source_label})")
            
            async def file_event_generator():
                try:
                    # If selected_file_ids provided, don't pass file_path to enable multi-file handling
                    use_file_path = None if request.selected_file_ids else file_info.get('file_path')
                    
                    # Only use actual file_name when it exists, otherwise pass empty string for multi-file
                    use_file_name = file_info.get('file_name', '')
                    
                    if file_info['file_type'] == 'csv':
                        if request.selected_file_ids:
                            print(f"📄 Querying CSV with {len(request.selected_file_ids)} selected files")
                        else:
                            print(f"📄 Querying CSV: {use_file_name}")
                        response = await mcp_query_csv_with_context(
                            query=request.query,
                            file_name=use_file_name,
                            file_path=use_file_path,
                            conversation_history=request.conversation_history,
                            workspace_id=request.workspace_id,
                            selected_file_ids=request.selected_file_ids
                        )
                    else:  # xlsx or xls
                        if request.selected_file_ids:
                            print(f"📊 Querying Excel with {len(request.selected_file_ids)} selected files")
                        else:
                            print(f"📊 Querying Excel: {use_file_name}")
                        response = await mcp_query_excel_with_context(
                            query=request.query,
                            file_name=use_file_name,
                            file_path=use_file_path,
                            conversation_history=request.conversation_history,
                            workspace_id=request.workspace_id,
                            selected_file_ids=request.selected_file_ids
                        )
                    
                    yield f"data: {json.dumps({'chunk': response})}\n\n"
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    print(f"✅ Query completed")
                    
                except Exception as e:
                    print(f"❌ Query error: {str(e)}")
                    import traceback
                    traceback.print_exc()
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"
            
            return StreamingResponse(
                file_event_generator(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no"
                }
            )
        
        # Helper function to determine file type from extension
        def get_file_type(filename):
            """Determine file type from extension"""
            file_ext = filename.lower()
            if file_ext.endswith('.csv'):
                return 'csv'
            elif file_ext.endswith(('.xlsx', '.xls')):
                return 'xlsx' if file_ext.endswith('.xlsx') else 'xls'
            return None
        
        # Check for explicitly selected files first (highest priority)
        # If user has selected specific files, route directly to file handler
        selected_file_info = None
        if request.selected_file_ids and request.workspace_id and supabase_client:
            try:
                print(f"📋 Checking {len(request.selected_file_ids)} selected files")
                # Look up the selected files in Supabase
                file_records = supabase_client.table('file_upload').select('*').in_(
                    'id', request.selected_file_ids
                ).eq('workspace_id', request.workspace_id).execute()
                
                if file_records.data:
                    # Check if ANY selected files are CSV/Excel types
                    csv_excel_files = [f for f in file_records.data if get_file_type(f['file_name']) in ['csv', 'xlsx', 'xls']]
                    
                    if csv_excel_files:
                        # Found CSV/Excel files - determine routing based on all files
                        file_types_in_selection = set(get_file_type(f['file_name']) for f in csv_excel_files)
                        has_mixed = len(file_types_in_selection) > 1
                        
                        # Route to CSV handler if ANY file is CSV, otherwise use Excel
                        route_type = 'csv' if any(get_file_type(f['file_name']) == 'csv' for f in csv_excel_files) else 'xlsx'
                        
                        selected_file_info = {
                            'file_type': route_type,
                            'has_mixed': has_mixed
                        }
                        
                        print(f"✅ Found {len(csv_excel_files)} CSV/Excel file(s) in selection")
                        print(f"   File types: {file_types_in_selection}, Mixed: {has_mixed}")
                        print(f"   Will process ALL {len(request.selected_file_ids)} selected files combined")
                    else:
                        # No CSV/Excel files in selection, will fall through to query detection
                        print(f"⚠️  No CSV/Excel files in selection")
                        
            except Exception as db_error:
                print(f"⚠️  Failed to load selected files: {str(db_error)}")
        
        # If selected file available, route to appropriate handler immediately
        if selected_file_info and selected_file_info.get('file_type'):
            return await route_file_query(selected_file_info, "selected file")
        
        # Detect file references in query using extract_document_name() for robust matching
        # This handles various patterns like "in sales.csv", "from data.xlsx", "query data.csv", etc.
        cleaned_query, detected_file_name = extract_document_name(request.query, request.workspace_id)
        
        if detected_file_name and request.workspace_id:
            print(f"📊 File reference detected in query: {detected_file_name}")
            
            # Determine file type from detected filename
            file_type = get_file_type(detected_file_name)
            
            # Query Supabase for actual files in this workspace to find the match
            file_path = None
            if supabase_client and file_type:
                try:
                    print(f"🔍 Searching Supabase for files in workspace: {request.workspace_id}")
                    # Get all files in this workspace
                    file_records = supabase_client.table('file_upload').select('*').eq(
                        'workspace_id', request.workspace_id
                    ).execute()
                    
                    if file_records.data:
                        print(f"📂 Found {len(file_records.data)} files in workspace")
                        
                        # Find the exact matching file
                        for record in file_records.data:
                            actual_filename = record['file_name']
                            # Check for exact match or close match
                            if actual_filename.lower() == detected_file_name.lower() or \
                               detected_file_name.lower() in actual_filename.lower():
                                file_path = record['file_path']
                                print(f"✅ Matched file: {actual_filename} -> {file_path}")
                                detected_file_name = actual_filename  # Use actual filename
                                break
                        
                        if not file_path:
                            print(f"⚠️  No matching file found for: {detected_file_name}")
                            print(f"   Available files: {[r['file_name'] for r in file_records.data]}")
                    else:
                        print(f"⚠️  No files found in workspace")
                        
                except Exception as db_error:
                    print(f"⚠️  Database lookup failed: {str(db_error)}")
            
            # If file_path found, route to CSV/Excel handler
            if file_path and file_type:
                detected_file_info = {
                    'file_name': detected_file_name,
                    'file_path': file_path,
                    'file_type': file_type
                }
                return await route_file_query(detected_file_info, "detected file")
            else:
                print(f"⚠️  File path not found in Supabase or unsupported file type. Proceeding with regular query.")
        
        # Detect if query contains a URL - route to link query handler
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
                response = await mcp_answer_link_query(detected_url, question, conversation_history=request.conversation_history, workspace_id=request.workspace_id)
                
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
            r"\b(couldn't find|could not find|i couldn't find)\b.*\b(information)\b",
            r"\b(there is some confusion|some confusion)\b",
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
                        conversation_history=request.conversation_history,
                        selected_file_ids=request.selected_file_ids
                    )
                else:
                    # Get streaming response without workspace instructions
                    response_generator = answer_query(
                        request.query, 
                        conversation_history=request.conversation_history,
                        stream=True,
                        workspace_id=request.workspace_id,
                        selected_file_ids=request.selected_file_ids
                    )
                
                # Check if generator is async-aware
                is_async_gen = inspect.isasyncgen(response_generator)
                
                # Collect response chunks
                full_response = ""
                try:
                    if is_async_gen:
                        async for chunk in response_generator:
                            if isinstance(chunk, dict) and 'response' in chunk:
                                chunk_text = chunk['response']
                                full_response += chunk_text
                                # Format as SSE
                                yield f"data: {json.dumps({'chunk': chunk_text})}\n\n"
                    else:
                        # Regular synchronous generator
                        for chunk in response_generator:
                            if isinstance(chunk, dict) and 'response' in chunk:
                                chunk_text = chunk['response']
                                full_response += chunk_text
                                # Format as SSE
                                yield f"data: {json.dumps({'chunk': chunk_text})}\n\n"
                except Exception as chunk_error:
                    print(f"❌ Chunk processing error: {type(chunk_error).__name__}: {str(chunk_error)}")
                    yield f"data: {json.dumps({'error': str(chunk_error)})}\n\n"
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    return
                
                # Check if response indicates knowledge cutoff or is too short
                is_cutoff_response = any(
                    re.search(pattern, full_response, re.IGNORECASE) 
                    for pattern in knowledge_cutoff_patterns
                )
                
                # If response is empty, very short (< 20 chars), or indicates cutoff, try web search
                if is_cutoff_response:
                    print(f"⚠️ Inadequate response detected, routing to web_search for better results")
                    print(f"   Response length: {len(full_response.strip())} chars, Cutoff indicator: {is_cutoff_response}")
                    
                    # Yield separator and web search response with timeout protection
                    web_search_message = "\n\n🔍 Searching the web for more current information...\n\n"
                    yield f"data: {json.dumps({'chunk': web_search_message})}\n\n"
                    
                    try:
                        # Wrap web search with timeout to prevent hanging
                        web_response = await asyncio.wait_for(
                            mcp_web_search(
                                request.query,
                                conversation_history=request.conversation_history,
                                workspace_id=request.workspace_id
                            ),
                            timeout=15.0
                        )
                        yield f"data: {json.dumps({'chunk': web_response})}\n\n"
                    except asyncio.TimeoutError:
                        print(f"⏱️ Web search timed out after 15s")
                        yield f"data: {json.dumps({'error': 'Web search timed out'})}\n\n"
                        yield f"data: {json.dumps({'done': True})}\n\n"
                        return
                    except Exception as web_error:
                        print(f"❌ Web search error: {type(web_error).__name__}: {str(web_error)}")
                        yield f"data: {json.dumps({'error': f'Web search failed: {str(web_error)}'})} \n\n"
                        yield f"data: {json.dumps({'done': True})}\n\n"
                        return
                
                # Send completion signal
                yield f"data: {json.dumps({'done': True})}\n\n"
                print(f"✅ Query completed")
                
            except Exception as e:
                # Never raise in generator - always yield error
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
                "X-Accel-Buffering": "no"  # Disable nginx buffering
            }
        )
        
    except Exception as e:
        # This catch-all should rarely execute since errors are handled in generator
        # But if it does, return SSE stream error
        print(f"❌ Query failed with error: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        
        async def error_stream():
            yield f"data: {json.dumps({'error': str(e), 'type': type(e).__name__})}\n\n"
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

