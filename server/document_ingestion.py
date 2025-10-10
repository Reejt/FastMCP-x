# Handles document ingestion and parsing
from fastmcp import FastMCP
import os
import shutil
from utils.file_parser import extract_text_from_file




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

 
def ingest_file(file_path: str) -> str:
    """Implementation function for file ingestion"""
    print(f"Starting ingestion of file: {file_path}")
    
    try:
        # Check if file exists
        if not os.path.exists(file_path):
            return f"Error: File not found at path '{file_path}'"
        
        # Create storage directory
        storage_dir = os.path.join(os.path.dirname(__file__), '..', 'storage')
        storage_dir = os.path.abspath(storage_dir)
        if not os.path.exists(storage_dir):
            os.makedirs(storage_dir)
            print(f"Created storage directory: {storage_dir}")
        
        # Get filename and destination path
        filename = os.path.basename(file_path)
        dest_path = os.path.join(storage_dir, filename)
        
        # Copy file to storage
        print(f"Copying file to: {dest_path}")
        shutil.copy2(file_path, dest_path)
        
        # Extract text content
        print(f"Extracting text from: {dest_path}")
        content = extract_text_from_file(dest_path)
        
        if not content or not content.strip():
            return f"Warning: No text content extracted from file '{filename}'. File may be empty or unsupported format."
        
        # Store document with metadata
        doc_info = {
            "content": content,
            "filename": filename,
            "filepath": dest_path
        }
        documents.append(doc_info)
        
        result_msg = f"Successfully ingested file '{filename}'. Extracted {len(content)} characters. Total documents: {len(documents)}"
        print(result_msg)
        return result_msg
        
    except Exception as e:
        error_msg = f"Error ingesting file '{file_path}': {str(e)}"
        print(error_msg)
        return error_msg


