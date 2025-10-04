
# Handles query answering from documents and general model
from fastmcp import FastMCP
import subprocess
from server.document_ingestion import documents

mcp = FastMCP("My MCP Server")


def query_model(query: str) -> str:
    """Query the Llama 3.2:3b model with the provided query."""
    try:
        # Call Ollama for Llama 3.2:3b model
        result = subprocess.run(
            ["ollama", "run", "llama3.2:3b", query],
            capture_output=True,
            text=True,
            check=True,
            timeout=60  # 60 second timeout for Llama
        )
        return result.stdout.strip()
    except subprocess.TimeoutExpired:
        return f"Llama query timed out after 60 seconds"
    except subprocess.CalledProcessError as e:
        return f"Ollama CLI error: {e.stderr.strip() if e.stderr else str(e)}"
    except FileNotFoundError:
        return f"Ollama CLI not found. Please ensure Ollama is installed and in PATH."
    except Exception as e:
        return f"Error querying Llama: {str(e)}"


@mcp.tool
def answer_query(query: str) -> str:
    # Simple keyword search in ingested documents
    for doc in documents:
        if query.lower() in doc.lower():
            return f"Found in document: {doc}"
    # Fallback to model
    return query_model(query)
