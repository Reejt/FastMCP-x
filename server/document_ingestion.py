# Handles document ingestion and parsing
from fastmcp import FastMCP
import os
import shutil
from utils.file_parser import extract_text_from_file



mcp = FastMCP("My MCP Server")
# Store documents with metadata for better semantic search
documents = []  # List of {"content": str, "filename": str, "filepath": str}

def load_existing_documents():
    """Load existing documents from storage directory on startup"""
    storage_dir = os.path.join(os.path.dirname(__file__), '..', 'storage')
    storage_dir = os.path.abspath(storage_dir)
    
    if not os.path.exists(storage_dir):
        return
    
    loaded_count = 0
    for filename in os.listdir(storage_dir):
        file_path = os.path.join(storage_dir, filename)
        if os.path.isfile(file_path):
            try:
                content = extract_text_from_file(file_path)
                doc_info = {
                    "content": content,
                    "filename": filename,
                    "filepath": file_path
                }
                documents.append(doc_info)
                loaded_count += 1
            except Exception as e:
                print(f"Error loading existing document {filename}: {str(e)}")
    
    print(f"Documents loaded: {loaded_count}")

def ingest_file_impl(file_path: str) -> str:
    """Implementation function for file ingestion"""
    try:
        storage_dir = os.path.join(os.path.dirname(__file__), '..', 'storage')
        storage_dir = os.path.abspath(storage_dir)
        if not os.path.exists(storage_dir):
            os.makedirs(storage_dir)
        filename = os.path.basename(file_path)
        dest_path = os.path.join(storage_dir, filename)
        shutil.copy2(file_path, dest_path)
        content = extract_text_from_file(dest_path)
        
        # Store document with metadata
        doc_info = {
            "content": content,
            "filename": filename,
            "filepath": dest_path
        }
        documents.append(doc_info)
        
        return f"File '{file_path}' ingested and stored at '{dest_path}'."
    except Exception as e:
        return f"Error ingesting file: {str(e)}"

@mcp.tool
def ingest_file(file_path: str) -> str:
    """MCP tool wrapper for file ingestion"""
    return ingest_file_impl(file_path)

# Load existing documents on module import
load_existing_documents()
