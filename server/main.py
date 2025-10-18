from fastmcp import FastMCP
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.document_ingestion import ingest_file
from server.query_handler import answer_query,semantic_search,query_with_context,query_model
from server.document_ingestion import load_existing_documents
from server.excel_csv import ExcelQueryEngine, CSVQueryEngine

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


