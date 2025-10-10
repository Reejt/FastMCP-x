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
            print("3. Exit")
            choice = input("Select an option (1/2/3): ").strip()
            
            if choice == "1":
                file_path = input("Enter file path to ingest: ").strip()
                # Remove "ingest" prefix if user accidentally included it
                if file_path.lower().startswith("ingest "):
                    file_path = file_path[7:].strip()
                
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
                if query.lower().startswith("query "):
                    query = query[6:].strip()
                
                if not query:
                    print("No query provided.")
                    continue
                    
                try:
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
                    
                    print(f"Query result: {response}")
                except Exception as e:
                    print(f"Error during query: {e}")
                    import traceback
                    traceback.print_exc()
            elif choice == "3":
                print("Exiting FastMCP CLI.")
                break
            else:
                print("Invalid option. Please select 1, 2, or 3.")

if __name__ == "__main__":
    asyncio.run(main())