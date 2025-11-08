# client/direct_mcp_client.py
import asyncio
from fastmcp import Client

async def semantic_search(client, query: str, top_k: int = 5):
    """Perform semantic search on ingested documents"""
    result = await client.call_tool("semantic_search_tool", {
        "query": query,
        "top_k": top_k
    })
    return result.data

async def query_with_context(client, query: str, max_chunks: int = 3, include_context_preview: bool = True):
    """Query with document context for enhanced LLM responses"""
    result = await client.call_tool("query_with_context_tool", {
        "query": query,
        "max_chunks": max_chunks,
        "include_context_preview": include_context_preview
    })
    return result.data

async def answer_query(client, query: str):
    """Answer a query using semantic search and LLM with document context"""
    result = await client.call_tool("answer_query_tool", {
        "query": query
    })
    
    # Extract response from MCP result
    if hasattr(result, 'content') and result.content:
        response = result.content[0].text
    elif hasattr(result, 'data') and result.data:
        response = result.data
    else:
        response = str(result)
    
    return response

        
async def ingest_file(client, file_path: str):
    """Ingest a document into the system"""
    result = await client.call_tool("ingest_file_tool", {
        "file_path": file_path
    })
                    
    # Extract response from MCP result
    if hasattr(result, 'content') and result.content:
        response = result.content[0].text
    elif hasattr(result, 'data') and result.data:
        response = result.data
    else:
        response = str(result)
                    
    return response
               
                    

async def query_excel_with_llm(client, file_path: str, query: str, sheet_name: str = None):
    """Query Excel or CSV document using LLM-based tool"""
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
                
                
                    
async def web_search(client, search_query: str):
    """Perform web search using integrated web search tool"""
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
                
               
