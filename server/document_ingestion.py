# Handles document ingestion and parsing
from fastmcp import FastMCP
import os
import shutil
from utils.file_parser import extract_text_from_file
from supabase import create_client, Client
from datetime import datetime
import uuid

# Store documents with metadata for better semantic search
documents = []  # List of {"content": str, "filename": str, "filepath": str, "document_id": str, "user_id": str}

# Initialize Supabase client
# Get from environment variables, with fallback to hardcoded values
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://fmlanqjduftxlktygpwe.supabase.co")
# Use service role key for backend operations (bypasses RLS)
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", os.environ.get("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtbGFucWpkdWZ0eGxrdHlncHdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0MDkzNTcsImV4cCI6MjA3NDk4NTM1N30.FT6c6BNfkJJFKliI1qv9uzBJj0UWMIaykRJrwKQKIfs"))

supabase: Client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Supabase client initialized successfully")
    except Exception as e:
        print(f"⚠️  Failed to initialize Supabase client: {str(e)}")
        supabase = None

# Import will be done after query_handler is fully loaded to avoid circular import


def _import_build_embeddings():
    """Lazy import to avoid circular dependency"""
    try:
        from server.query_handler import build_embeddings
        return build_embeddings
    except ImportError:
        return None

  

 
def ingest_file(file_path: str, user_id: str = None):
    """
    Implementation function for file ingestion
    
    Args:
        file_path: Path to the file to ingest
        user_id: Optional user ID for Supabase storage (required when using Supabase)
    """
    print(f"Starting ingestion of file: {file_path}")
    
    try:
        # Check if file exists
        if not os.path.exists(file_path):
            return f"Error: File not found at path '{file_path}'"
        
        # Get filename and file stats
        filename = os.path.basename(file_path)
        file_size = os.path.getsize(file_path)
        
        # Determine file type
        file_extension = os.path.splitext(filename)[1].lower()
        file_type_map = {
            '.txt': 'text/plain',
            '.md': 'text/markdown',
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.ppt': 'application/vnd.ms-powerpoint',
            '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        }
        file_type = file_type_map.get(file_extension, 'application/octet-stream')
        
        # Extract text content first
        print(f"Extracting text from: {file_path}")
        content = extract_text_from_file(file_path)
        
        if not content or not content.strip():
            return f"Warning: No text content extracted from file '{filename}'. File may be empty or unsupported format."
        
        # Try to store in Supabase first
        if supabase and user_id:
            print(f"☁️  Uploading file to Supabase Storage...")
            try:
                # Read file content
                with open(file_path, 'rb') as f:
                    file_content = f.read()
                    
                # Generate unique file path in Supabase Storage
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                storage_path = f"{user_id}/{timestamp}_{filename}"
                    
                # Upload to Supabase Storage
                supabase.storage.from_('vault_files').upload(
                    storage_path,
                    file_content,
                    file_options={"content-type": file_type}
                )
                    
                print(f"✅ File uploaded to Supabase: {storage_path}")
                    
                # Insert metadata into vault_documents table
                document_id = str(uuid.uuid4())
                db_response = supabase.table('vault_documents').insert({
                    'document_id': document_id,
                    'user_id': user_id,
                    'file_name': filename,
                    'file_path': storage_path,
                    'file_size': file_size,
                    'file_type': file_type,
                    'metadata': {
                        'original_name': filename,
                        'processed': True,
                        'character_count': len(content)
                    }
                }).execute()
                    
                print(f"✅ Document metadata saved to Supabase database")
                    
                # Store document with metadata in memory
                doc_info = {
                    "content": content,
                    "filename": filename,
                    "filepath": storage_path,  # Store Supabase path
                    "document_id": document_id,
                    "user_id": user_id
                }
                documents.append(doc_info)
                    
                result_msg = f"Successfully ingested file '{filename}' to Supabase. Extracted {len(content)} characters. Total documents: {len(documents)}"
                print(result_msg)
                    
                # Rebuild embeddings to ensure all documents are properly embedded
                build_embeddings_func = _import_build_embeddings()
                if build_embeddings_func:
                    print("🔄 Rebuilding embeddings for all documents...")
                    build_embeddings_func()
                    print("✅ Embeddings rebuild complete")
                    
                return result_msg
            except Exception as supabase_error:
                error_msg = f"Supabase storage error: {str(supabase_error)}"
                print(f"⚠️  {error_msg}")
                return error_msg
        else:
            # No Supabase or user_id provided
            error_msg = f"Error: Supabase client not initialized or user_id not provided. Cannot ingest file."
            print(f"⚠️  {error_msg}")
            return error_msg
                
        
        
        
    except Exception as e:
        error_msg = f"Error ingesting file '{file_path}': {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        return error_msg


