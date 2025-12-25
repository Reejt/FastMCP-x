# Handles document ingestion and parsing
from fastmcp import FastMCP
import os
import shutil
from utils.file_parser import extract_and_store_file_content
from supabase import create_client, Client
from datetime import datetime
import uuid
from dotenv import load_dotenv

# Load environment variables from server/.env.local
# This ensures we pick up the service role key from the backend config
env_path = os.path.join(os.path.dirname(__file__), '.env.local')
load_dotenv(dotenv_path=env_path)

# Store documents with metadata for better semantic search
documents = []  # List of {"content": str, "filename": str, "filepath": str, "document_id": str, "user_id": str}

# Initialize Supabase client
# Try both NEXT_PUBLIC_ prefix (from frontend .env.local) and regular prefix
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "https://fmlanqjduftxlktygpwe.supabase.co")
# IMPORTANT: Use SERVICE ROLE KEY for backend operations (bypasses RLS policies)
# The anon key will fail RLS checks when uploading from backend
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_KEY:
    print("⚠️  WARNING: SUPABASE_SERVICE_ROLE_KEY not found in environment!")
    print("⚠️  File uploads will fail with RLS policy violation errors.")
    print("⚠️  Please set SUPABASE_SERVICE_ROLE_KEY in your .env file.")
    print("⚠️  You can find it in Supabase Dashboard → Settings → API → Service Role Key")

supabase: Client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Supabase client initialized successfully")
    except Exception as e:
        print(f"⚠️  Failed to initialize Supabase client: {str(e)}")
        supabase = None

# Import will be done after query_handler is fully loaded to avoid circular import

def ingest_file(file_path: str, user_id: str, workspace_id: str = None, base64_content: str = None, file_name: str = None):
    """
    Implementation function for file ingestion
    
    Args:
        file_path: Path to the file to ingest (used if base64_content not provided)
        user_id: Required user ID for Supabase storage and database insert
        workspace_id: Optional workspace ID to organize files (null for global vault)
        base64_content: Optional base64 encoded file content (takes precedence over file_path)
        file_name: Optional file name when using base64_content
    """
    print(f"Starting ingestion of file: {file_path}")
    
    try:
        # Store original filename FIRST (before any temp files are created)
        # This ensures the correct name is used in the database
        original_filename = file_name or os.path.basename(file_path)
        
        # Handle base64 content if provided (for Docker cross-container compatibility)
        if base64_content:
            import base64
            print(f"📦 Using base64-encoded file content")
            file_content_bytes = base64.b64decode(base64_content)
            filename = original_filename
            file_size = len(file_content_bytes)
        else:
            # Check if file exists
            if not os.path.exists(file_path):
                return f"Error: File not found at path '{file_path}'"
            
            # Get filename and file stats
            filename = original_filename
            file_size = os.path.getsize(file_path)
            file_content_bytes = None
        
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
        
        # Try to store in Supabase first
        if supabase and user_id:
            print(f"☁️  Uploading file to Supabase Storage...")
            try:
                # Read file content if not already provided as base64
                if file_content_bytes is None:
                    with open(file_path, 'rb') as f:
                        file_content = f.read()
                else:
                    file_content = file_content_bytes
                    
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
                    
                # Insert metadata into file_upload table
                file_id = str(uuid.uuid4())
                
                # Use provided workspace_id (can be null for global vault)
                final_workspace_id = workspace_id  # Keep as None/null if not provided
                
                print(f"📊 Inserting file metadata - workspace_id: {final_workspace_id}")
                
                try:
                    db_response = supabase.table('file_upload').insert({
                        'id': file_id,
                        'workspace_id': final_workspace_id,  # Will be null if not provided
                        'file_name': filename,
                        'file_path': storage_path,
                        'size_bytes': file_size,
                        'file_type': file_type,
                        'status': 'uploaded',
                        'user_id': user_id
                    }).execute()
                    
                    # Check if insert was successful
                    if db_response and db_response.data:
                        print(f"✅ File metadata saved to Supabase database")
                        print(f"   Inserted record: {db_response.data}")
                    else:
                        print(f"⚠️  Warning: Insert returned no data. Response: {db_response}")
                        
                except Exception as db_error:
                    error_msg = f"❌ Database insert error: {str(db_error)}"
                    print(f"{error_msg}")
                    return error_msg
                    
                # Extract text and store in document_content table
                print(f"📄 Extracting and storing text content...")
                
                # If we have base64_content, we need a temporary file for text extraction
                extraction_file_path = file_path
                temp_extraction_file = None
                if base64_content and not os.path.exists(file_path):
                    import tempfile
                    with tempfile.NamedTemporaryFile(delete=False, suffix=f"_{filename}") as temp_file:
                        temp_file.write(file_content)
                        temp_extraction_file = temp_file.name
                        extraction_file_path = temp_extraction_file
                    print(f"📦 Using temporary file for text extraction: {temp_extraction_file}")
                
                try:
                    content, stored = extract_and_store_file_content(
                        file_path=extraction_file_path,
                        file_id=file_id,
                        user_id=user_id,
                        file_name=filename
                    )
                finally:
                    # Clean up temporary extraction file if created
                    if temp_extraction_file and os.path.exists(temp_extraction_file):
                        os.unlink(temp_extraction_file)
                
                if not content or not content.strip():
                    print(f"⚠️  Warning: No text content extracted from file '{filename}'")
                elif not stored:
                    print(f"⚠️  Warning: Failed to store extracted content in database")
                else:
                    print(f"✅ Extracted and stored {len(content)} characters")
                    
                    # Generate and store embeddings with pgvector
                    print(f"🧠 Generating embeddings with pgvector...")
                    try:
                        from server.query_handler import get_semantic_model, chunk_text
                        model = get_semantic_model()
                        if model:
                            embeddings_to_store = []
                            chunk_index = 0
                            
                            for chunk in chunk_text(content):
                                if chunk.strip():
                                    embedding = model.encode([chunk.strip()])[0]
                                    embeddings_to_store.append({
                                        'file_id': file_id,
                                        'user_id': user_id,
                                        'chunk_index': chunk_index,
                                        'chunk_text': chunk.strip(),
                                        'embedding': embedding.tolist(),  # pgvector expects float array
                                        'metadata': {'file_name': filename}  # Store as JSONB metadata
                                    })
                                    chunk_index += 1
                            
                            # Store in database
                            if embeddings_to_store:
                                supabase.table('document_embeddings').insert(embeddings_to_store).execute()
                                print(f"✅ Generated and stored {len(embeddings_to_store)} embeddings in pgvector")
                        else:
                            print(f"⚠️  Embedding model not available")
                    except Exception as e:
                        print(f"⚠️  Warning: Could not generate embeddings: {e}")
                    
                # Store document with metadata in memory
                doc_info = {
                    "content": content,
                    "filename": filename,
                    "filepath": storage_path,  # Store Supabase path
                    "document_id": file_id,
                    "user_id": user_id
                }
                documents.append(doc_info)
                    
                result_msg = f"Successfully ingested file '{filename}' to Supabase with pgvector embeddings. Extracted {len(content)} characters. Total documents: {len(documents)}"
                print(result_msg)
                    
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


