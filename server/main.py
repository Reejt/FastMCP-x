
from fastapi import FastAPI, UploadFile, File, Form
from fastmcp import FastMCP
from server.document_ingestion import ingest_file_impl, documents
from server.query_handler import query_model
from server.query_handler import answer_query_impl
from server.query_handler import semantic_search_tool_impl
from server.query_handler import query_with_context_impl
from fastapi import Request
import tempfile
import os

# Import modules to register their MCP tools
import server.document_ingestion
import server.query_handler



# Create MCP server and register tools from other modules
mcp = FastMCP("FastMCP Document-Aware Query Assistant")

# Register tools from document_ingestion module
mcp.add_tool(server.document_ingestion.ingest_file)

# Register tools from query_handler module  
mcp.add_tool(server.query_handler.answer_query)
mcp.add_tool(server.query_handler.semantic_search_tool)
mcp.add_tool(server.query_handler.query_with_context)

# Create MCP ASGI app
mcp_app = mcp.http_app(path="/api")

# Pass MCP app's lifespan to FastAPI
app = FastAPI(title="FastMCP Document-Aware Query Assistant", lifespan=mcp_app.lifespan)
app.mount("/mcp/api", mcp_app)

# MCP health check endpoint
@app.get("/mcp")
async def mcp_health_check():
    return {"status": "ok", "protocolVersion": "2024-11-05"}

# Existing endpoints (optional, can be kept for direct access)
@app.post("/mcp/ingest")
async def ingest_endpoint(file: UploadFile = File(...)):
    content = await file.read()
    # Save the uploaded file temporarily and then process it
    with tempfile.NamedTemporaryFile(delete=False, suffix=f"_{file.filename}") as temp_file:
        temp_file.write(content)
        temp_file_path = temp_file.name
    
    result = ingest_file_impl(temp_file_path)
    
    # Clean up temp file
    os.unlink(temp_file_path)
    
    return {"result": result}

@app.post("/mcp/query")
async def query_endpoint(query: str = Form(...)):
    # Use the enhanced answer_query function that includes semantic search
    from server.query_handler import answer_query
    result = answer_query_impl(query)
    return {"result": result}

@app.post("/mcp/semantic-search")
async def semantic_search_endpoint(query: str = Form(...), top_k: int = Form(default=5)):
    # Direct semantic search endpoint
    from server.query_handler import semantic_search_tool
    result = semantic_search_tool_impl(query, top_k)
    return {"result": result}

@app.post("/mcp/query-with-context")
async def query_with_context_endpoint(query: str = Form(...), max_chunks: int = Form(default=3)):
    # Query with document context endpoint
    from server.query_handler import query_with_context
    result = query_with_context_impl(query, max_chunks)
    return {"result": result}




@app.get("/mcp/status")
async def status_endpoint():
    """Get status of ingested documents and available tools"""
    from server.query_handler import SEMANTIC_SEARCH_AVAILABLE
    
    doc_count = len(documents)
    doc_info = []
    
    for i, doc in enumerate(documents):
        if isinstance(doc, dict):
            doc_info.append({
                "index": i,
                "filename": doc.get("filename", "unknown"),
                "content_length": len(doc.get("content", ""))
            })
        else:
            doc_info.append({
                "index": i,
                "filename": f"legacy_document_{i}",
                "content_length": len(doc)
            })
    
    return {
        "documents_ingested": doc_count,
        "semantic_search_available": SEMANTIC_SEARCH_AVAILABLE,
        "documents": doc_info,
        "available_endpoints": [
            "/mcp/ingest - Upload and ingest documents",
            "/mcp/query - Enhanced query with semantic search fallback",
            "/mcp/semantic-search - Direct semantic search",
            "/mcp/query-with-context - Query LLM with relevant document context",
            "/mcp/status - This status endpoint"
        ]
    }


if __name__ == "__main__":
    import uvicorn
    print("Starting FastMCP FastAPI server...")
    uvicorn.run("server.main:app", host="0.0.0.0", port=8000, reload=True)


