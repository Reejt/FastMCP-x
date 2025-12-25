# client/fast_mcp_client.py
import asyncio
import os
from fastmcp import Client

# MCP Server URL - uses Docker service name
MCP_SERVER_URL = os.environ.get("MCP_SERVER_URL", "http://backend:8000/sse")

FASTMCP_SERVER_URL = MCP_SERVER_URL
print(f"MCP Server URL: {FASTMCP_SERVER_URL}")

async def answer_query(query: str, conversation_history: list = None):
    """
    Answer a query using semantic search and LLM with document context
    
    Args:
        query: The current user query
        conversation_history: List of previous messages [{"role": "user"/"assistant", "content": "..."}]
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
               
                    

async def query_excel_with_llm(file_path: str, query: str, sheet_name: str = None):
    """Query Excel or CSV document using LLM-based tool"""
    async with Client(FASTMCP_SERVER_URL) as client:
        # Determine file type from file_path
        if file_path.lower().endswith(('.xlsx', '.xls')):
            # Use LLM-based Excel query tool
            tool_params = {
                "file_path": file_path,
                "query": query
            }
            if sheet_name:
                tool_params["sheet_name"] = sheet_name
            
            result = await client.call_tool("query_excel_with_llm_tool", tool_params)
                            
        elif file_path.lower().endswith('.csv'):
            # Use LLM-based CSV query tool
            tool_params = {
                "file_path": file_path,
                "query": query
            }
            
            result = await client.call_tool("query_csv_with_llm_tool", tool_params)
        else:
            error_msg = f"Error: Unsupported file type. File must be .xlsx, .xls, or .csv"
            return error_msg
        
        # Extract response from MCP result
        if hasattr(result, 'content') and result.content:
            response = result.content[0].text
        elif hasattr(result, 'data') and result.data:
            response = result.data
        else:
            response = str(result)
                        
        return response
                
                
                    
async def web_search(search_query: str):
    """Perform web search using integrated web search tool"""
    async with Client(FASTMCP_SERVER_URL) as client:
        result = await client.call_tool("web_search_tool", {
            "query": search_query
        })
                        
        # Extract response from MCP result
        if hasattr(result, 'content') and result.content:
            response = result.content[0].text
        elif hasattr(result, 'data') and result.data:
            response = result.data
        else:
            response = str(result)
                        
        return response
    

async def answer_link_query(url: str, question: str):
    """
    Answer a question based on the content of a provided link URL.
    
    Args:
        url: The URL of the link to analyze
        question: The question to answer based on the link content
    """
    async with Client(FASTMCP_SERVER_URL) as client:
        tool_params = {
            "url": url,
            "query": question
        }
        
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


async def generate_presentation(topic: str, num_slides: int = 10, style: str = "professional"):
    """
    Generate a professional presentation on any topic
    
    Args:
        topic: The topic for the presentation
        num_slides: Number of slides to generate (5-50, default: 10)
        style: Presentation style - 'professional', 'educational', or 'creative'
    
    Returns:
        JSON response with file path and presentation metadata
    """
    import json
    
    async with Client(FASTMCP_SERVER_URL) as client:
        result = await client.call_tool("generate_presentation_tool", {
            "topic": topic,
            "num_slides": num_slides,
            "style": style
        })
        
        # Extract response from MCP result
        if hasattr(result, 'content') and result.content:
            response = result.content[0].text
        elif hasattr(result, 'data') and result.data:
            response = result.data
        else:
            response = str(result)
        
        # Parse JSON string response if needed
        try:
            if isinstance(response, str):
                return json.loads(response)
            return response
        except json.JSONDecodeError:
            return {"success": False, "error": str(response)}
