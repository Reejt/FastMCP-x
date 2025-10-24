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

async def main():
    # Connect to MCP server via stdio using file path
    async with Client("server/main.py") as client:
        
        # List available tools
        tools = await client.list_tools()
        print(f"Available tools: {[t.name for t in tools]}")
        
        # Simple CLI loop for ingest and query
        while True:
            print("\nFastMCP CLI Options:")
            print("1. Ingest a document")
            print("2. Answer a query")
            print("3. Web search")
            print("4. Exit")
            choice = input("Select an option (1/2/3/4): ").strip()
            
            if choice == "1":
                file_path = input("Enter file path to ingest: ").strip()
                # Remove "ingest" prefix if user accidentally included it
                if not file_path:
                    print("No file path provided.")
                    continue
                    
                try:
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
                    
                    print(f"Ingestion result: {response}")
                except Exception as e:
                    print(f"Error during ingestion: {e}")
                    import traceback
                    traceback.print_exc()
                    
            elif choice == "2":
                query = input("Enter your query: ").strip()
                # Remove "query" prefix if user accidentally included it
                if not query:
                    print("No query provided.")
                    continue
                    
                try:
                    # Check if query is for Excel or CSV documents
                    query_lower = query.lower()
                    is_excel_query = any(keyword in query_lower for keyword in ['excel', '.xlsx', '.xls', 'spreadsheet'])
                    is_csv_query = '.csv' in query_lower and not is_excel_query
                    
                    if is_excel_query:
                        # Parse Excel file path from query
                        import re
                        import json
                        
                        # Extract file path (look for .xlsx or .xls files)
                        file_match = re.search(r'([^\s]+\.xlsx?)', query, re.IGNORECASE)
                        if not file_match:
                            print("Error: Could not find Excel file path in query (must end with .xlsx or .xls)")
                            continue
                        
                        file_path = file_match.group(1)
                        
                        # Use LLM-based Excel query tool for natural language queries
                        tool_params = {
                            "file_path": file_path,
                            "query": query
                        }
                        
                        result = await client.call_tool("query_excel_with_llm_tool", tool_params)
                        
                    elif is_csv_query:
                        # Parse CSV file path from query
                        import re
                        import json
                        
                        # Extract file path (look for .csv files)
                        file_match = re.search(r'([^\s]+\.csv)', query, re.IGNORECASE)
                        if not file_match:
                            print("Error: Could not find CSV file path in query (must end with .csv)")
                            continue
                        
                        file_path = file_match.group(1)
                        
                        # Use LLM-based CSV query tool for natural language queries
                        tool_params = {
                            "file_path": file_path,
                            "query": query
                        }
                        
                        result = await client.call_tool("query_csv_with_llm_tool", tool_params)
                        
                    else:
                        # Default to regular query tool
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
                    
                    # For Excel/CSV queries with LLM, response is already formatted by LLM
                    print(f"Query result: {response}")
                except Exception as e:
                    print(f"Error during query: {e}")
                    import traceback
                    traceback.print_exc()
            elif choice == "3":
                search_query = input("Enter your web search query: ").strip()
                if not search_query:
                    print("No search query provided.")
                    continue
                    
                try:
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
                    
                    print(f"Search result: {response}")
                except Exception as e:
                    print(f"Error during web search: {e}")
                    import traceback
                    traceback.print_exc()
            elif choice == "4":
                print("Exiting FastMCP CLI.")
                break
            else:
                print("Invalid option. Please select 1, 2, 3, or 4.")

if __name__ == "__main__":
    asyncio.run(main())