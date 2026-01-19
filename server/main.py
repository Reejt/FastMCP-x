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
from server.agent import FastMCPAgent


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
def answer_query_tool(query: str, conversation_history: str = "[]", workspace_id: str = None) -> str:
    """
    Answer queries with conversation history support
    
    Args:
        query: The current user query
        conversation_history: JSON string of previous messages (default: "[]")
    """
    try:
        # Parse conversation history from JSON string
        history = json.loads(conversation_history) if conversation_history else []
        result = answer_query(query, conversation_history=history, workspace_id=workspace_id)
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
def answer_link_query_tool(url: str, query: str, conversation_history: str = "[]", workspace_id: str = None) -> str:
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
        result = answer_link_query(url, query, conversation_history=history, workspace_id=workspace_id)
        print(f"Link query result: {result}")
        return result
    except Exception as e:
        error_msg = f"Error in answer_link_query_tool: {str(e)}"
        print(error_msg)
        return error_msg


@mcp.tool
def query_csv_with_context_tool(query: str, file_name: str, file_path: str = None, conversation_history: str = "[]", workspace_id: str = None) -> str:
    """
    Query CSV data using keyword filtering and LLM reasoning with conversation context
    
    Args:
        query: The natural language query about the CSV data
        file_name: Name of the CSV file
        file_path: Path to the CSV file (local or Supabase storage reference)
        conversation_history: JSON string of previous messages for context (default: "[]")
        workspace_id: Optional workspace ID filter
    
    Returns:
        LLM-generated answer based on the CSV data with relevant rows
    """
    try:
        history = json.loads(conversation_history) if conversation_history else []
        result = query_csv_with_context(
            query=query,
            file_name=file_name,
            file_path=file_path,
            conversation_history=history
        )
        print(f"CSV query result: {result}")
        return result
    except Exception as e:
        error_msg = f"Error in query_csv_with_context_tool: {str(e)}"
        print(error_msg)
        return error_msg


@mcp.tool
def query_excel_with_context_tool(query: str, file_name: str, file_path: str = None, conversation_history: str = "[]", workspace_id: str = None) -> str:
    """
    Query Excel data using keyword filtering and LLM reasoning with conversation context
    
    Args:
        query: The natural language query about the Excel data
        file_name: Name of the Excel file
        file_path: Path to the Excel file (local or Supabase storage reference)
        conversation_history: JSON string of previous messages for context (default: "[]")
        workspace_id: Optional workspace ID filter
    
    Returns:
        LLM-generated answer based on the Excel data with relevant rows
    """
    try:
        history = json.loads(conversation_history) if conversation_history else []
        result = query_excel_with_context(
            query=query,
            file_name=file_name,
            file_path=file_path,
            conversation_history=history
        )
        print(f"Excel query result: {result}")
        return result
    except Exception as e:
        error_msg = f"Error in query_excel_with_context_tool: {str(e)}"
        print(error_msg)
        return error_msg


@mcp.tool
def agentic_task_tool(goal: str, context: str = "", max_iterations: int = 10) -> str:
    """
    Execute a complex task using autonomous agentic reasoning
    
    The agent will:
    1. Analyze the goal and plan a sequence of tool calls
    2. Execute tools autonomously based on reasoning
    3. Evaluate results and iterate if needed
    4. Return final outcome and execution history
    
    Args:
        goal: The objective or task to accomplish (e.g., "Find Q3 sales by region from our data and compare with Q2")
        context: Optional background information or constraints
        max_iterations: Maximum number of tool calls (default: 10, prevents infinite loops)
    
    Returns:
        JSON string containing:
        - success: Whether the goal was achieved
        - final_result: The final output
        - iterations: Number of tool calls made
        - history: Detailed execution log of all actions taken
    """
    try:
        print(f"🤖 Agentic Task Execution: {goal}")
        agent = FastMCPAgent()
        result = agent.run(goal=goal, context=context, max_iterations=max_iterations)
        
        # Return as JSON string for compatibility
        return json.dumps(result, indent=2, default=str)
    except Exception as e:
        error_msg = f"Error in agentic_task_tool: {str(e)}"
        print(error_msg)
        return json.dumps({
            "success": False,
            "error": error_msg,
            "history": []
        })


if __name__ == "__main__":
    print("Starting FastMCP server in HTTP mode on port 8000...")
    # Run FastMCP server using SSE transport
    # Bind to 0.0.0.0 so it's accessible from other Docker containers
    mcp.run(transport="sse", host="0.0.0.0", port=8000)


