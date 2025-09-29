# Handles model switching and querying
from fastmcp import FastMCP


mcp = FastMCP("My MCP Server")
current_model = "gemini"

@mcp.tool
def switch_model(model_name: str) -> str:
    global current_model
    current_model = model_name
    return f"Model switched to {model_name}"


def query_model(query: str) -> str:
    # Dummy implementation, replace with actual model query logic
    return f"Model '{current_model}' response to: {query}"
