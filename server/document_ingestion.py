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

def ingest_file(file_path: str, user_id: str = None, workspace_id: str = None):
    """
    Implementation function for file ingestion
    
    Args:
        file_path: Path to the file to ingest
        user_id: User ID for Supabase storage (required when using Supabase)
        workspace_id: Workspace ID to organize files (required for database insert)
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
                    
                # Insert metadata into file_upload table
                file_id = str(uuid.uuid4())
                
                # Handle workspace_id - get or create default workspace if needed
                final_workspace_id = workspace_id
                if not final_workspace_id and supabase and user_id:
                    # Try to get the user's default workspace
                    try:
                        workspace_response = supabase.table('workspaces').select('id').eq('user_id', user_id).order('created_at').limit(1).execute()
                        if workspace_response.data and len(workspace_response.data) > 0:
                            final_workspace_id = workspace_response.data[0]['id']
                        else:
                            # Create a default workspace for the user
                            create_response = supabase.table('workspaces').insert({
                                'name': 'Personal Workspace',
                                'user_id': user_id
                            }).select('id').execute()
                            if create_response.data and len(create_response.data) > 0:
                                final_workspace_id = create_response.data[0]['id']
                                print(f"✅ Created default workspace: {final_workspace_id}")
                    except Exception as e:
                        print(f"⚠️  Warning: Could not get or create default workspace: {str(e)}")
                        return f"Error: Could not get or create workspace for file ingestion: {str(e)}"
                
                if not final_workspace_id:
                    return "Error: workspace_id is required for file upload"
                
                db_response = supabase.table('file_upload').insert({
                    'id': file_id,
                    'workspace_id': final_workspace_id,
                    'file_name': filename,
                    'file_path': storage_path,
                    'size_bytes': file_size,
                    'file_type': file_type,
                    'status': 'uploaded',
                    'user_id': user_id
                }).execute()
                    
                print(f"✅ File metadata saved to Supabase database")
                    
                # Extract text and store in document_content table
                print(f"📄 Extracting and storing text content...")
                content, stored = extract_and_store_file_content(
                    file_path=file_path,
                    file_id=file_id,
                    user_id=user_id,
                    file_name=filename
                )
                
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


