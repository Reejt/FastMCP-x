import json
from fastmcp import FastMCP
import sys
import os
from dotenv import load_dotenv
import requests
import time

# Load environment variables from server/.env.local
env_path = os.path.join(os.path.dirname(__file__), '.env.local')
load_dotenv(dotenv_path=env_path)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.document_ingestion import ingest_file
from server.query_handler import (
    answer_query, 
    query_model, 
    get_semantic_model,
    answer_link_query,
    query_csv_with_context,
    query_excel_with_context
)
from server.web_search_file import tavily_web_search
from server.mermaid_converter import convert_query_to_mermaid_markdown



# pgvector Enterprise Mode Active
# - Embeddings stored in Supabase document_embeddings table (chunk_text, embedding[vector], metadata[jsonb])
# - Similarity search performed at DATABASE LEVEL using <=> operator
# - Workspace instructions stored in workspace_instructions table (is_active boolean)
# - Chat history stored in chats table (id, workspace_id, user_id, role, message)
# - Document content extracted and stored in document_content table
# - No in-memory embedding cache required
print("🚀 FastMCP Server - pgvector Enterprise Edition")
print("✅ Database-side similarity search enabled")
print("✅ Multi-workspace support enabled")
print("✅ Workspace instructions enabled")
print("✅ Chat history enabled")
 

mcp = FastMCP("FastMCP Document-Aware Query Assistant")

# Eagerly load embedding model at startup to avoid delay on first query
print("⏳ Preloading embedding model...")
get_semantic_model()

# Skip Ollama warmup - lets queries start immediately
# First query will load the model naturally
print("✅ FastMCP Server initialized")



@mcp.tool
def ingest_file_tool(file_path: str, user_id: str, workspace_id: str = None, base64_content: str = None, file_name: str = None) -> str:
    """
    Ingest a file into the system
    
    Args:
        file_path: Path to the file to ingest (used if base64_content not provided)
        user_id: Required user ID for Supabase storage and database insert
        workspace_id: Optional workspace ID to organize files (null for global vault)
        base64_content: Optional base64 encoded file content (takes precedence over file_path)
        file_name: Optional file name when using base64_content
    """
    try:
        result = ingest_file(file_path, user_id=user_id, workspace_id=workspace_id, base64_content=base64_content, file_name=file_name)
        print(f"Ingest result: {result}")
        return result
    except Exception as e:
        error_msg = f"Error in ingest_file_tool: {str(e)}"
        print(error_msg)
        return error_msg

@mcp.tool
def answer_query_tool(query: str, conversation_history: str = "[]", workspace_id: str = None, selected_file_ids: str = None):
    """
    Answer queries with conversation history support and file filtering
    
    Args:
        query: The current user query
        conversation_history: JSON string of previous messages (default: "[]")
        workspace_id: Optional workspace ID for filtering
        selected_file_ids: JSON string of file IDs to filter search (default: None)
    """
    try:
        # Parse conversation history from JSON string
        history = json.loads(conversation_history) if conversation_history else []
        # Parse selected_file_ids from JSON string
        file_ids = json.loads(selected_file_ids) if selected_file_ids else None
        result = answer_query(query, conversation_history=history, workspace_id=workspace_id, selected_file_ids=file_ids)
        print(f"Query result: {result}")
        return result
    except Exception as e:
        error_msg = f"Error in answer_query_tool: {str(e)}"
        print(error_msg)
        return error_msg


@mcp.tool
def web_search_tool(query: str, conversation_history: str = "[]", workspace_id: str = None) -> str:
    """
    Perform a web search using Tavily API and get LLM-generated answer based on top result content
    
    Args:
        query: The search query
    
    Returns:
        LLM-generated answer based on the extracted content from top search result
    """
    try:
        history = json.loads(conversation_history) if conversation_history else []
        # Perform web search and get extracted content from top result
        top_result_content = tavily_web_search(query=query, conversation_history=history, workspace_id=workspace_id)
        print(f"Query result: {top_result_content}")
        return top_result_content
    except Exception as e:
        error_msg = f"Error in web_search_tool: {str(e)}"
        print(error_msg)
        return error_msg
    
@mcp.tool
def answer_link_query_tool(url: str, query: str, conversation_history: str = "[]") -> str:
    """
    Answer a query based on the content of a specific URL
    
    Args:
        url: The URL to extract content from
        query: The user's question related to the URL content
    
    Returns:
        LLM-generated answer based on the extracted content from the URL
    """
    try:
        history = json.loads(conversation_history) if conversation_history else []
        result = answer_link_query(url, query, conversation_history=history)
        print(f"Link query result: {result}")
        return result
    except Exception as e:
        error_msg = f"Error in answer_link_query_tool: {str(e)}"
        print(error_msg)
        return error_msg


@mcp.tool
def query_csv_with_context_tool(query: str, file_name: str, file_path: str = None, conversation_history: str = "[]", workspace_id: str = None, selected_file_ids: str = None) -> str:
    """
    Query CSV data using keyword filtering and LLM reasoning with conversation context
    
    Args:
        query: The natural language query about the CSV data
        file_name: Name of the CSV file
        file_path: Path to the CSV file (local or Supabase storage reference)
        conversation_history: JSON string of previous messages for context (default: "[]")
        workspace_id: Optional workspace ID filter
        selected_file_ids: JSON string of selected file IDs for context (default: None)
    
    Returns:
        LLM-generated answer based on the CSV data with relevant rows
    """
    try:
        history = json.loads(conversation_history) if conversation_history else []
        file_ids = json.loads(selected_file_ids) if selected_file_ids else None
        result = query_csv_with_context(
            query=query,
            file_name=file_name,
            file_path=file_path,
            conversation_history=history,
            selected_file_ids=file_ids
        )
        print(f"CSV query result: {result}")
        return result
    except Exception as e:
        error_msg = f"Error in query_csv_with_context_tool: {str(e)}"
        print(error_msg)
        return error_msg


@mcp.tool
def query_excel_with_context_tool(query: str, file_name: str, file_path: str = None, conversation_history: str = "[]", workspace_id: str = None, selected_file_ids: str = None)-> str:
    """
    Query Excel data using keyword filtering and LLM reasoning with conversation context
    
    Args:
        query: The natural language query about the Excel data
        file_name: Name of the Excel file
        file_path: Path to the Excel file (local or Supabase storage reference)
        conversation_history: JSON string of previous messages for context (default: "[]")
        workspace_id: Optional workspace ID filter
        selected_file_ids: JSON string of selected file IDs for context (default: None)
    
    Returns:
        LLM-generated answer based on the Excel data with relevant rows
    """
    try:
        history = json.loads(conversation_history) if conversation_history else []
        file_ids = json.loads(selected_file_ids) if selected_file_ids else None
        result = query_excel_with_context(
            query=query,
            file_name=file_name,
            file_path=file_path,
            conversation_history=history,
            selected_file_ids=file_ids
        )
        print(f"Excel query result: {result}")
        return result
    except Exception as e:
        error_msg = f"Error in query_excel_with_context_tool: {str(e)}"
        print(error_msg)
        return error_msg


@mcp.tool
async def generate_diagram_tool(query: str, diagram_type: str = "auto") -> str:
    """
    Generate a Mermaid diagram from user query
    
    Args:
        query: The user query to visualize (text)
        diagram_type: Type of diagram - 'auto', 'flowchart', 'pie', 'gantt', 'sequence', 'class'
    
    Returns:
        JSON string with diagram markdown and metadata
    """
    try:
        import json as json_lib
        
        # Validate input
        if not query or (isinstance(query, str) and not query.strip()):
            return json.dumps({
                "success": False,
                "error": "query is required and cannot be empty",
                "diagram": "",
                "diagram_type": "error"
            })
        
        print(f"📊 Generating Mermaid diagram (type: {diagram_type})")
        
        # Call async convert_query_to_mermaid_markdown
        diagram_output = await convert_query_to_mermaid_markdown(
            include_diagram=True,
            diagram_type=diagram_type,
            query=query
        )
        
        print(f"✅ Diagram generated successfully (type: {diagram_output.get('diagram_type')})")
        
        # Return as JSON string
        return json_lib.dumps(diagram_output)
    except Exception as e:
        error_msg = f"Error in generate_diagram_tool: {str(e)}"
        print(error_msg)
        import json as json_lib
        return json_lib.dumps({
            "success": False,
            "error": error_msg,
            "diagram": "",
            "diagram_type": "error"
        })



if __name__ == "__main__":
    print("Starting FastMCP server in HTTP mode on port 8000...")
    # Run FastMCP server using SSE transport
    # Bind to 0.0.0.0 so it's accessible from other Docker containers
    mcp.run(transport="sse", host="0.0.0.0", port=8000)


