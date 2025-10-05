import asyncio
import httpx
import subprocess

BASE_URL = "http://localhost:8000"

async def call_ingest_file(file_path: str):
    """Ingest a file into the MCP server for document-aware queries."""
    async with httpx.AsyncClient() as client:
        with open(file_path, "rb") as f:
            files = {"file": (file_path, f, "application/octet-stream")}
            response = await client.post(f"{BASE_URL}/mcp/ingest", files=files)
        print("ingest_file result:", response.json())

async def call_answer_query(query: str):
    """Query the MCP server. It will search documents first, then fallback to Ollama."""
    async with httpx.AsyncClient() as client:
        response = await client.post(f"{BASE_URL}/mcp/query", data={"query": query})
        print("answer_query result:", response.json())



async def main():
    """Demo CLI showing how to use the client functions."""
    print("=== FastMCP Client Demo ===\n")
    
    # Example 1: Query via MCP server (searches documents first, then uses Ollama)
    print("1. Querying via MCP server...")
    await call_answer_query("What is machine learning?")
    
    print("\n" + "="*50 + "\n")
    
    # Example 2: File ingestion (commented out - uncomment and provide a file path to test)
    print("2. File ingestion example (commented out):")
    print("   # await call_ingest_file('path/to/your/document.txt')")
    
    print("\nDemo completed!")

if __name__ == "__main__":
    asyncio.run(main())