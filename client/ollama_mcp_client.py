import requests
import json
import os
from typing import Dict, Any

class FastMCPDocumentClient:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url.rstrip('/')

    def health_check(self) -> Dict[str, Any]:
        """Check MCP server health and protocol version"""
        try:
            response = requests.get(f"{self.base_url}/mcp")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": f"Health check failed: {str(e)}"}

    def get_status(self) -> Dict[str, Any]:
        """Get status of ingested documents and available tools"""
        try:
            response = requests.get(f"{self.base_url}/mcp/status")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": f"Status check failed: {str(e)}"}

    def ingest_file(self, file_path: str) -> str:
        """Ingest a document file into the MCP server"""
        try:
            if not os.path.exists(file_path):
                return f"Error: File not found: {file_path}"
            
            filename = os.path.basename(file_path)
            with open(file_path, 'rb') as file:
                files = {'file': (filename, file, 'application/octet-stream')}
                response = requests.post(f"{self.base_url}/mcp/ingest", files=files)
                response.raise_for_status()
                return response.json().get("result", str(response.json()))
        except Exception as e:
            return f"Error ingesting file: {str(e)}"

    def query(self, query: str) -> str:
        """Enhanced query with semantic search fallback"""
        try:
            data = {'query': query}
            response = requests.post(f"{self.base_url}/mcp/query", data=data)
            response.raise_for_status()
            result = response.json()
            return result.get("result", str(result))
        except Exception as e:
            return f"Error querying: {str(e)}"

    def semantic_search(self, query: str, top_k: int = 5) -> str:
        """Direct semantic search in ingested documents"""
        try:
            data = {'query': query, 'top_k': top_k}
            response = requests.post(f"{self.base_url}/mcp/semantic-search", data=data)
            response.raise_for_status()
            result = response.json()
            return result.get("result", str(result))
        except Exception as e:
            return f"Error in semantic search: {str(e)}"

    def query_with_context(self, query: str, max_chunks: int = 3) -> str:
        """Query LLM with relevant document context"""
        try:
            data = {'query': query, 'max_chunks': max_chunks}
            response = requests.post(f"{self.base_url}/mcp/query-with-context", data=data)
            response.raise_for_status()
            result = response.json()
            return result.get("result", str(result))
        except Exception as e:
            return f"Error in context query: {str(e)}"


if __name__ == "__main__":
    client = FastMCPDocumentClient("http://localhost:8000")
    print("FastMCP Client Command Area")
    print("Commands: ingest <file_path>, query <your question>, exit")
    
    while True:
        try:
            cmd = input(">>> ").strip()
            if not cmd:
                continue
                
            if cmd.lower() == "exit":
                break
            elif cmd.startswith("ingest "):
                file_path = cmd[len("ingest "):].strip()
                if not file_path:
                    print("Please provide a file path")
                    continue
                result = client.ingest_file(file_path)
                print(result)
            elif cmd.startswith("query "):
                query_text = cmd[len("query "):].strip()
                if not query_text:
                    print("Please provide a query")
                    continue
                result = client.query(query_text)
                print(result)
            else:
                print("Unknown command. Use: ingest <file_path>, query <your question>, exit")
        except KeyboardInterrupt:
            print("\nGoodbye!")
            break
        except Exception as e:
            print(f"Error: {str(e)}")

    
