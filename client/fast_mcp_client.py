# client/fast_mcp_client.py
import asyncio
import os
from fastmcp import Client

# MCP Server URL - defaults to localhost for local development
MCP_SERVER_URL = os.environ.get("MCP_SERVER_URL", "http://localhost:8000/sse")

FASTMCP_SERVER_URL = MCP_SERVER_URL
print(f"MCP Server URL: {FASTMCP_SERVER_URL}")

async def answer_query(query: str, conversation_history: list = None, workspace_id: str = None, selected_file_ids: list = None):
    """
    Answer a query using semantic search and LLM with document context
    
    Args:
        query: The current user query
        conversation_history: List of previous messages [{"role": "user"/"assistant", "content": "..."}]
        workspace_id: Optional workspace ID for workspace-specific context
    """
    import json
    
    async with Client(FASTMCP_SERVER_URL) as client:
        # Prepare tool parameters
        tool_params = {"query": query}
        
        # Add conversation history if provided
        if conversation_history:
            tool_params["conversation_history"] = json.dumps(conversation_history)
        else:
            tool_params["conversation_history"] = "[]"
        
        # Add workspace_id if provided
        if workspace_id:
            tool_params["workspace_id"] = workspace_id

        # Add selected_file_ids if provided
        if selected_file_ids:
            tool_params["selected_file_ids"] = json.dumps(selected_file_ids)
        else:
            tool_params["selected_file_ids"] = "[]"
        
        result = await client.call_tool("answer_query_tool", tool_params)
        
        # Extract response from MCP result
        if hasattr(result, 'content') and result.content:
            response = result.content[0].text
        elif hasattr(result, 'data') and result.data:
            response = result.data
        else:
            response = str(result)
        
        return response

        
async def ingest_file(file_path: str, user_id: str, workspace_id: str = None, base64_content: str = None, file_name: str = None):
    """
    Ingest a document into the system
    
    Args:
        file_path: Path to the file to ingest (used if base64_content not provided)
        user_id: Required user ID for Supabase storage
        workspace_id: Optional workspace ID for file organization in Supabase
        base64_content: Optional base64 encoded file content (takes precedence over file_path)
        file_name: Optional file name when using base64_content
    """
    async with Client(FASTMCP_SERVER_URL) as client:
        tool_params = {
            "file_path": file_path,
            "user_id": user_id,
            "workspace_id": workspace_id,
            "base64_content": base64_content,
            "file_name": file_name
        }
            
        result = await client.call_tool("ingest_file_tool", tool_params)
                        
        # Extract response from MCP result
        if hasattr(result, 'content') and result.content:
            response = result.content[0].text
        elif hasattr(result, 'data') and result.data:
            response = result.data
        else:
            response = str(result)
                        
        return response
               
                    
async def web_search(search_query: str, conversation_history: list = None, workspace_id: str = None):
    """Perform web search using integrated web search tool"""
    import json
    async with Client(FASTMCP_SERVER_URL) as client:
        tool_params = {
            "query": search_query
        }
        
        # Add conversation history if provided
        if conversation_history:
            tool_params["conversation_history"] = json.dumps(conversation_history)
        else:
            tool_params["conversation_history"] = "[]"
        
        # Add workspace_id if provided
        if workspace_id:
            tool_params["workspace_id"] = workspace_id
        
        result = await client.call_tool("web_search_tool", tool_params)
                        
        # Extract response from MCP result
        if hasattr(result, 'content') and result.content:
            response = result.content[0].text
        elif hasattr(result, 'data') and result.data:
            response = result.data
        else:
            response = str(result)
                        
        return response
    

async def answer_link_query(url: str, question: str, conversation_history: list = None, workspace_id: str = None):
    """
    Answer a question based on the content of a provided link URL.
    
    Args:
        url: The URL of the link to analyze
        question: The question to answer based on the link content
        conversation_history: List of previous messages for context (optional)
        workspace_id: Workspace identifier (optional)
    """
    import json
    async with Client(FASTMCP_SERVER_URL) as client:
        tool_params = {
            "url": url,
            "query": question
        }
        
        # Add conversation history if provided
        if conversation_history:
            tool_params["conversation_history"] = json.dumps(conversation_history)
        else:
            tool_params["conversation_history"] = "[]"
        
        # Add workspace_id if provided
        if workspace_id:
            tool_params["workspace_id"] = workspace_id
        
        result = await client.call_tool("answer_link_query_tool", tool_params)
                        
        # Extract response from MCP result
        if hasattr(result, 'content') and result.content:
            response = result.content[0].text
        elif hasattr(result, 'data') and result.data:
            response = result.data
        else:
            response = str(result)
                        
        return response


async def get_active_instruction(workspace_id: str):
    """
    Get the active instruction for a workspace
    
    Args:
        workspace_id: The workspace ID to fetch instructions for
    
    Returns:
        JSON string with instruction details or error message
    """
    async with Client(FASTMCP_SERVER_URL) as client:
        result = await client.call_tool("get_active_instruction_tool", {
            "workspace_id": workspace_id
        })
        
        # Extract response from MCP result
        if hasattr(result, 'content') and result.content:
            response = result.content[0].text
        elif hasattr(result, 'data') and result.data:
            response = result.data
        else:
            response = str(result)
        
        return response


async def get_instruction_preview(workspace_id: str):
    """
    Get a preview of the active instruction for display purposes
    
    Args:
        workspace_id: The workspace ID
    
    Returns:
        String preview of active instruction
    """
    async with Client(FASTMCP_SERVER_URL) as client:
        result = await client.call_tool("get_instruction_preview_tool", {
            "workspace_id": workspace_id
        })
        
        # Extract response from MCP result
        if hasattr(result, 'content') and result.content:
            response = result.content[0].text
        elif hasattr(result, 'data') and result.data:
            response = result.data
        else:
            response = str(result)
        
        return response


async def clear_instruction_cache(workspace_id: str = None):
    """
    Clear cached instructions to force reload from database
    
    Args:
        workspace_id: Optional workspace ID to clear specific cache, or None to clear all
    
    Returns:
        Success message
    """
    async with Client(FASTMCP_SERVER_URL) as client:
        tool_params = {}
        if workspace_id:
            tool_params["workspace_id"] = workspace_id
            
        result = await client.call_tool("clear_instruction_cache_tool", tool_params)
        
        # Extract response from MCP result
        if hasattr(result, 'content') and result.content:
            response = result.content[0].text
        elif hasattr(result, 'data') and result.data:
            response = result.data
        else:
            response = str(result)
        
        return response


async def query_csv_with_context(query: str, file_name: str, file_path: str = None, conversation_history: list = None, workspace_id: str = None, selected_file_ids: list = None):
    """
    Query CSV data using keyword filtering and LLM reasoning with conversation context
    
    Args:
        query: The natural language query about the CSV data
        file_name: Name of the CSV file
        file_path: Path to the CSV file (local or Supabase storage reference)
        conversation_history: List of previous messages for context (optional)
        workspace_id: Optional workspace ID filter
        selected_file_ids: List of selected file IDs for context (optional)
    
    Returns:
        LLM-generated answer based on the CSV data with relevant rows
    """
    import json
    async with Client(FASTMCP_SERVER_URL) as client:
        tool_params = {
            "query": query,
            "file_name": file_name
        }
        
        # Add file_path if provided
        if file_path:
            tool_params["file_path"] = file_path
        
        # Add conversation history if provided
        if conversation_history:
            tool_params["conversation_history"] = json.dumps(conversation_history)
        else:
            tool_params["conversation_history"] = "[]"
        
        # Add workspace_id if provided
        if workspace_id:
            tool_params["workspace_id"] = workspace_id
        
        # Add selected_file_ids if provided
        if selected_file_ids:
            tool_params["selected_file_ids"] = json.dumps(selected_file_ids)
        else:
            tool_params["selected_file_ids"] = "[]"
        
        result = await client.call_tool("query_csv_with_context_tool", tool_params)
        
        # Extract response from MCP result
        if hasattr(result, 'content') and result.content:
            response = result.content[0].text
        elif hasattr(result, 'data') and result.data:
            response = result.data
        else:
            response = str(result)
        
        return response


async def query_excel_with_context(query: str, file_name: str, file_path: str = None, conversation_history: list = None, workspace_id: str = None, selected_file_ids: list = None):
    """
    Query Excel data using keyword filtering and LLM reasoning with conversation context
    
    Args:
        query: The natural language query about the Excel data
        file_name: Name of the Excel file
        file_path: Path to the Excel file (local or Supabase storage reference)
        conversation_history: List of previous messages for context (optional)
        workspace_id: Optional workspace ID filter
        selected_file_ids: List of selected file IDs for context (optional)
    
    Returns:
        LLM-generated answer based on the Excel data with relevant rows
    """
    import json
    async with Client(FASTMCP_SERVER_URL) as client:
        tool_params = {
            "query": query,
            "file_name": file_name
        }
        
        # Add file_path if provided
        if file_path:
            tool_params["file_path"] = file_path
        
        # Add conversation history if provided
        if conversation_history:
            tool_params["conversation_history"] = json.dumps(conversation_history)
        else:
            tool_params["conversation_history"] = "[]"
        
        # Add workspace_id if provided
        if workspace_id:
            tool_params["workspace_id"] = workspace_id
        
        # Add selected_file_ids if provided
        if selected_file_ids:
            tool_params["selected_file_ids"] = json.dumps(selected_file_ids)
        else:
            tool_params["selected_file_ids"] = "[]"
        
        result = await client.call_tool("query_excel_with_context_tool", tool_params)
        
        # Extract response from MCP result
        if hasattr(result, 'content') and result.content:
            response = result.content[0].text
        elif hasattr(result, 'data') and result.data:
            response = result.data
        else:
            response = str(result)
        
        return response





