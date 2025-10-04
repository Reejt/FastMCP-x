
from fastapi import FastAPI, UploadFile, File, Form
from fastmcp import FastMCP
from server.document_ingestion import ingest_file
from server.query_handler import answer_query  
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




if __name__ == "__main__":
    import uvicorn
    print("Starting FastMCP FastAPI server...")
    uvicorn.run("server.main:app", host="0.0.0.0", port=8000, reload=True)


