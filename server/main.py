from fastmcp import FastMCP
import server.document_ingestion
import server.query_handler

# Create MCP server and register tools from other modules
mcp = FastMCP("FastMCP Document-Aware Query Assistant")


if __name__ == "__main__":
    server.document_ingestion.load_existing_documents()
    print("Starting FastMCP server...")
    mcp.run(host="0.0.0.0", port=8000, reload=True)


