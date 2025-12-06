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
from server.excel_csv import ExcelQueryEngine, CSVQueryEngine
from server.web_search_file import tavily_web_search
from server.query_handler import answer_link_query

# pgvector Enterprise Mode Active
# - Embeddings stored in Supabase document_embeddings table
# - Similarity search performed at DATABASE LEVEL using <=> operator
# - No in-memory embedding cache required
print("🚀 FastMCP Server - pgvector Enterprise Edition")
print("✅ Database-side similarity search enabled")

# DISABLED: Instructions module references non-existent workspace_instructions table
# Database schema: files, workspaces, chats, document_content, document_embeddings
# from server.instructions import (
#     query_with_instructions,
#     query_with_instructions_stream,
#     get_active_instruction,
#     get_instruction_preview,
#     clear_instruction_cache
# ) 

mcp = FastMCP("FastMCP Document-Aware Query Assistant")

@mcp.tool
def ingest_file_tool(file_path: str, user_id: str = None) -> str:
    """
    Ingest a file into the system
    
    Args:
        file_path: Path to the file to ingest
        user_id: Optional user ID for Supabase storage (if not provided, uses local storage)
    """
    try:
        result = ingest_file(file_path, user_id=user_id)
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
        import json
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
def query_excel_with_llm_tool(file_path: str, query: str, sheet_name: str = None) -> str:
    """Query Excel file using natural language - retrieves data and lets LLM answer the question"""
    try:
        import json
        
        # If file_path is just a filename, prepend storage directory
        if not os.path.isabs(file_path) and not os.path.exists(file_path):
            storage_dir = os.path.join(os.path.dirname(__file__), '..', 'storage')
            storage_dir = os.path.abspath(storage_dir)
            full_path = os.path.join(storage_dir, file_path)
        else:
            full_path = file_path
        
        engine = ExcelQueryEngine(full_path)
        result_df = engine.query(sheet_name=sheet_name)
        
        # Convert to a readable format for the LLM
        data_summary = f"Excel file: {file_path}\n"
        data_summary += f"Total rows: {len(result_df)}\n"
        data_summary += f"Columns: {', '.join(result_df.columns)}\n\n"
        data_summary += "Data:\n"
        data_summary += result_df.to_string(index=False)
        
        # Ask the LLM to answer the query based on the data
        llm_prompt = f"""You are a data analyst. Below is data from an Excel file. Answer the user's question by analyzing this data and providing the specific information requested.

{data_summary}

User Question: {query}

Instructions: 
- Answer directly with the requested data
- If filtering is needed, show only the relevant rows
- Format your answer clearly and concisely
- Do NOT provide instructions on how to filter - just provide the answer

Answer:"""
        
        return query_model(llm_prompt)
        
    except Exception as e:
        return f"Error querying Excel file: {str(e)}"

@mcp.tool
def query_csv_with_llm_tool(file_path: str, query: str) -> str:
    """Query CSV file using natural language - retrieves data and lets LLM answer the question"""
    try:
        import json
        
        # If file_path is just a filename, prepend storage directory
        if not os.path.isabs(file_path) and not os.path.exists(file_path):
            storage_dir = os.path.join(os.path.dirname(__file__), '..', 'storage')
            storage_dir = os.path.abspath(storage_dir)
            full_path = os.path.join(storage_dir, file_path)
        else:
            full_path = file_path
        
        engine = CSVQueryEngine(full_path)
        result_df = engine.query()
        
        # Convert to a readable format for the LLM
        data_summary = f"CSV file: {file_path}\n"
        data_summary += f"Total rows: {len(result_df)}\n"
        data_summary += f"Columns: {', '.join(result_df.columns)}\n\n"
        data_summary += "Data:\n"
        data_summary += result_df.to_string(index=False)
        
        # Ask the LLM to answer the query based on the data
        llm_prompt = f"""You are a data analyst. Below is data from a CSV file. Answer the user's question by analyzing this data and providing the specific information requested.

{data_summary}

User Question: {query}

Instructions: 
- Answer directly with the requested data
- If filtering is needed, show only the relevant rows
- Format your answer clearly and concisely
- Do NOT provide instructions on how to filter - just provide the answer

Answer:"""
        
        return query_model(llm_prompt)
        
    except Exception as e:
        return f"Error querying CSV file: {str(e)}"

@mcp.tool
def web_search_tool(query: str) -> str:
    """
    Perform a web search using Tavily API and get LLM-generated answer based on top result content
    
    Args:
        query: The search query
    
    Returns:
        LLM-generated answer based on the extracted content from top search result
    """
    try:
        # Perform web search and get extracted content from top result
        top_result_content = tavily_web_search(query=query)
        
        # Check for errors
        if top_result_content.startswith("Error") or top_result_content.startswith("HTTP error") or top_result_content.startswith("Request failed"):
            return f"Search error: {top_result_content}"
        
        if top_result_content in ["No URL found in top result", "No search results found", "No results in response"]:
            return f"No search results found for query: '{query}'"
        
        # Send extracted content to LLM for summarization
        llm_prompt = f"""You are a helpful research assistant. Below is content extracted from the top web search result for the user's query. Your task is to summarize this content in a clear, concise manner that directly addresses the user's query.

Web Search Query: {query}

Extracted Content from Top Result:
{top_result_content}

Instructions:
- Summarize the content focusing on information relevant to the user's query
"""
        
        return query_model(llm_prompt)
        
    except Exception as e:
        return f"Error in web search tool: {str(e)}"
    
@mcp.tool
def answer_link_query_tool(url: str, query: str) -> str:
    """
    Answer a query based on the content of a specific URL
    
    Args:
        url: The URL to extract content from
        query: The user's question related to the URL content
    
    Returns:
        LLM-generated answer based on the extracted content from the URL
    """
    try:
        result = answer_link_query(url, query)
        print(f"Link query result: {result}")
        return result
    except Exception as e:
        error_msg = f"Error in answer_link_query_tool: {str(e)}"
        print(error_msg)
        return error_msg


# DISABLED: Instruction tools require non-existent workspace_instructions table
# @mcp.tool
# def get_active_instruction_tool(workspace_id: str) -> str:
#     return "Instructions feature not available - workspace_instructions table does not exist"

# @mcp.tool
# def get_instruction_preview_tool(workspace_id: str) -> str:
#     return "Instructions feature not available - workspace_instructions table does not exist"

# @mcp.tool
# def clear_instruction_cache_tool(workspace_id: str = None) -> str:
#     return "Instructions feature not available - workspace_instructions table does not exist"



if __name__ == "__main__":
    print("Starting FastMCP server in HTTP mode on port 8000...")
    # Run FastMCP server using SSE transport
    mcp.run(transport="sse")


