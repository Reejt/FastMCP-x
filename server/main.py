import json
from fastmcp import FastMCP
import sys
import os
from dotenv import load_dotenv

# Load environment variables from server/.env.local
env_path = os.path.join(os.path.dirname(__file__), '.env.local')
load_dotenv(dotenv_path=env_path)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.document_ingestion import ingest_file
from server.query_handler import answer_query, query_model
from server.web_search_file import tavily_web_search
from server.query_handler import answer_link_query

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
from server.instructions import (
    query_with_instructions,
    query_with_instructions_stream,
    get_active_instruction,
    get_instruction_preview,
    clear_instruction_cache
) 

mcp = FastMCP("FastMCP Document-Aware Query Assistant")

@mcp.tool
def ingest_file_tool(file_path: str, user_id: str = None, workspace_id: str = None) -> str:
    """
    Ingest a file into the system
    
    Args:
        file_path: Path to the file to ingest
        user_id: User ID for Supabase storage and database insert (required for multi-user)
        workspace_id: Workspace ID to organize files (optional - auto-creates default if not provided)
    """
    try:
        result = ingest_file(file_path, user_id=user_id, workspace_id=workspace_id)
        print(f"Ingest result: {result}")
        return result
    except Exception as e:
        error_msg = f"Error in ingest_file_tool: {str(e)}"
        print(error_msg)
        return error_msg

@mcp.tool
def answer_query_tool(query: str, conversation_history: str = "[]") -> str:
    """
    Answer queries with conversation history support
    
    Args:
        query: The current user query
        conversation_history: JSON string of previous messages (default: "[]")
    """
    try:
        # Parse conversation history from JSON string
        history = json.loads(conversation_history) if conversation_history else []
        result = answer_query(query, conversation_history=history)
        print(f"Query result: {result}")
        return result
    except Exception as e:
        error_msg = f"Error in answer_query_tool: {str(e)}"
        print(error_msg)
        return error_msg


@mcp.tool
def query_excel_with_llm_tool(file_path: str, query: str, sheet_name: str = None, user_id: str = None, conversation_history: str = "[]") -> str:
    """Query Excel file using natural language - retrieves data from Supabase and lets LLM answer the question
    
    Args:
        file_path: Supabase storage path (e.g., 'user_id/timestamp_filename.xlsx') or file_id
        query: The natural language query
        sheet_name: Optional sheet name in Excel file
        user_id: User ID for Supabase access
    """
    try:
        history = json.loads(conversation_history) if conversation_history else []
        result = query_excel_with_llm(file_path, query, sheet_name=sheet_name, user_id=user_id, conversation_history=history)
        print(f"Excel query result: {result}")
        return result
    except Exception as e:
        error_msg = f"Error in query_excel_with_llm_tool: {str(e)}"
        print(error_msg)
        return error_msg

@mcp.tool
def query_csv_with_llm_tool(file_path: str, query: str, user_id: str = None, conversation_history: str = "[]") -> str:
    """Query CSV file using natural language - retrieves data from Supabase and lets LLM answer the question
    
    Args:
        file_path: Supabase storage path (e.g., 'user_id/timestamp_filename.csv') or file_id
        query: The natural language query
        user_id: User ID for Supabase access
    """
    try:
        history = json.loads(conversation_history) if conversation_history else []
        result = query_csv_with_llm(file_path, query, user_id=user_id, conversation_history=history)
        print(f"CSV query result: {result}")
        return result
    except Exception as e:
        error_msg = f"Error in query_csv_with_llm_tool: {str(e)}"
        print(error_msg)
        return error_msg

@mcp.tool
def web_search_tool(query: str, conversation_history: str = "[]") -> str:
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
        top_result_content = tavily_web_search(query=query, conversation_history=history)
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


if __name__ == "__main__":
    print("Starting FastMCP server in HTTP mode on port 8000...")
    # Run FastMCP server using SSE transport
    mcp.run(transport="sse")


