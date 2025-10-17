from fastmcp import FastMCP
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.document_ingestion import ingest_file
from server.query_handler import answer_query,semantic_search,query_with_context
from server.document_ingestion import load_existing_documents

mcp = FastMCP("FastMCP Document-Aware Query Assistant")

@mcp.tool
def ingest_file_tool(file_path: str) -> str:
    try:
        result = ingest_file(file_path)
        print(f"Ingest result: {result}")
        return result
    except Exception as e:
        error_msg = f"Error in ingest_file_tool: {str(e)}"
        print(error_msg)
        return error_msg

@mcp.tool
def answer_query_tool(query: str) -> str:
    try:
        result = answer_query(query)
        print(f"Query result: {result}")
        return result
    except Exception as e:
        error_msg = f"Error in answer_query_tool: {str(e)}"
        print(error_msg)
        return error_msg

@mcp.tool
def semantic_search_tool(query: str, top_k: int = 5) -> str:
    results = semantic_search(query, top_k)
    
    if not results:
        return f"No semantically similar content found for query: '{query}'"
    
    response_parts = [f"Semantic search results for: '{query}'\n"]
    
    for i, (content, score, filename) in enumerate(results, 1):
        response_parts.append(f"**Match {i}** (Similarity: {score:.3f}) - {filename}")
        response_parts.append("-" * 50)
        display_content = content[:250] + "..." if len(content) > 250 else content
        response_parts.append(display_content)
        response_parts.append("")
    
    return "\n".join(response_parts)

@mcp.tool
def query_with_context_tool(query: str, max_chunks: int = 3, include_context_preview: bool = True) -> str:
    return query_with_context(query, max_chunks, include_context_preview)

if __name__ == "__main__":
    print("Loading existing documents...")
    load_existing_documents()
    from server.document_ingestion import documents
    print(f"Documents loaded: {len(documents)}")
    if documents:
        for doc in documents:
            print(f"  - {doc['filename']} ({len(doc['content'])} characters)")
    print("Starting FastMCP server...")
    mcp.run()


