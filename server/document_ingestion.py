# Handles document ingestion and parsing
from fastmcp import FastMCP
import os
import shutil
from utils.file_parser import extract_text_from_file

documents = []

mcp = FastMCP("My MCP Server")
documents = []

@mcp.tool
def ingest_file(file_path: str) -> str:
    try:
        storage_dir = os.path.join(os.path.dirname(__file__), '..', 'storage')
        storage_dir = os.path.abspath(storage_dir)
        if not os.path.exists(storage_dir):
            os.makedirs(storage_dir)
        filename = os.path.basename(file_path)
        dest_path = os.path.join(storage_dir, filename)
        shutil.copy2(file_path, dest_path)
        content = extract_text_from_file(dest_path)
        documents.append(content)
        return f"File '{file_path}' ingested and stored at '{dest_path}'."
    except Exception as e:
        return f"Error ingesting file: {str(e)}"
