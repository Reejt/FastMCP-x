
from fastapi import FastAPI, UploadFile, File, Form
from fastmcp import FastMCP
from server.document_ingestion import ingest_file
from server.query_handler import answer_query  
from server.model_manager import switch_model
from fastapi import Request



# Create MCP server and register tools as before
mcp = FastMCP("FastMCP Document-Aware Query Assistant")
# ...tools are registered in other modules...

# Create MCP ASGI app
mcp_app = mcp.http_app(path="/api")

# Pass MCP app's lifespan to FastAPI
app = FastAPI(title="FastMCP Document-Aware Query Assistant", lifespan=mcp_app.lifespan)
app.mount("/mcp/api", mcp_app)

# Existing endpoints (optional, can be kept for direct access)
@app.post("/mcp/ingest")
async def ingest_endpoint(file: UploadFile = File(...)):
    content = await file.read()
    result = ingest_file(content, filename=file.filename)
    return {"result": result}

@app.post("/mcp/query")
async def query_endpoint(query: str = Form(...)):
    result = answer_query(query)
    return {"result": result}

@app.post("/mcp/switch-model")
async def switch_model_endpoint(model_name: str = Form(...)):
    result = switch_model(model_name)
    return {"result": result}





# Health check endpoint for Gemini CLI MCP server detection
@app.get("/mcp")
async def mcp_health():
    return {"status": "ok", "message": "FastMCP MCP server is running.", "protocolVersion": "2024-11-05"}

# Multiplexer endpoint for Gemini CLI MCP tool calls
@app.post("/mcp")
async def mcp_multiplexer(request: Request):
    payload = await request.json()
    tool_name = payload.get("tool_name")
    params = payload.get("params", {})
    id_value = payload.get("id")

    if not tool_name:
        # Discovery or health check request: respond with server info and required fields
        return {
            "jsonrpc": "2.0",
            "id": id_value,
            "result": {
                "status": "ok",
                "message": "FastMCP MCP server is available.",
                "capabilities": {},
                "protocolVersion": "2024-11-05",
                "serverInfo": {
                    "name": "FastMCP",
                    "version": "1.0.0"
                },
                "tools": [
                    {
                        "name": "query",
                        "description": "Answer queries from ingested documents and model.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "query": {"type": "string", "description": "The query to answer."}
                            },
                            "required": ["query"]
                        }
                    },
                    {
                        "name": "ingest",
                        "description": "Ingest a document for querying.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "file_content": {"type": "string", "description": "The content of the file."},
                                "filename": {"type": "string", "description": "The name of the file."}
                            },
                            "required": ["file_content", "filename"]
                        }
                    },
                    {
                        "name": "switch_model",
                        "description": "Switch the active model for queries.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "model_name": {"type": "string", "description": "The name of the model to switch to."}
                            },
                            "required": ["model_name"]
                        }
                    }
                ]
            }
        }
    if tool_name == "query":
        result = await answer_query.run({"query": params.get("query")})
        return {"jsonrpc": "2.0", "id": id_value, "content": [{"type": "text", "text": result}]}
    elif tool_name == "ingest":
        file_content = params.get("file_content")
        filename = params.get("filename")
        result = ingest_file(file_content, filename=filename)
        return {"jsonrpc": "2.0", "id": id_value, "content": [{"type": "text", "text": result}]}
    elif tool_name == "switch_model":
        model_name = params.get("model_name")
        result = switch_model(model_name)
        return {"jsonrpc": "2.0", "id": id_value, "content": [{"type": "text", "text": result}]}
    else:
        return {"jsonrpc": "2.0", "id": id_value, "error": {"code": 1001, "message": f"Unknown tool: {tool_name}"}}



if __name__ == "__main__":
    import uvicorn
    print("Starting FastMCP FastAPI server...")
    uvicorn.run("server.main:app", host="0.0.0.0", port=8000, reload=True)


