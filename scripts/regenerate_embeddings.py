#!/usr/bin/env python3
"""
Regenerate embeddings for files that don't have them.
Run this script to fix files that were uploaded but failed embedding generation.

Usage:
    python scripts/regenerate_embeddings.py [--workspace-id <uuid>] [--file-id <uuid>]
    
Options:
    --workspace-id  Process only files in this workspace
    --file-id       Process only this specific file
    
Without arguments, processes all files without embeddings.
"""

import os
import sys
import argparse

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

# Supabase configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Error: SUPABASE_URL and SUPABASE_KEY environment variables are required")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_files_without_embeddings(workspace_id=None, file_id=None):
    """Get files that don't have embeddings"""
    
    # Get all files
    query = supabase.table('file_upload').select('id, file_name, workspace_id, user_id, file_path').is_('deleted_at', None)
    
    if workspace_id:
        query = query.eq('workspace_id', workspace_id)
    if file_id:
        query = query.eq('id', file_id)
    
    files_result = query.execute()
    files = files_result.data if files_result.data else []
    
    # Get file IDs that have embeddings
    emb_result = supabase.table('document_embeddings').select('file_id').execute()
    files_with_embeddings = set(row['file_id'] for row in (emb_result.data or []))
    
    # Filter to files without embeddings
    files_without = [f for f in files if f['id'] not in files_with_embeddings]
    
    return files_without

def regenerate_embeddings_for_file(file_info):
    """Regenerate embeddings for a single file"""
    file_id = file_info['id']
    file_name = file_info['file_name']
    user_id = file_info['user_id']
    file_path = file_info['file_path']
    
    print(f"\n📄 Processing: {file_name}")
    print(f"   File ID: {file_id}")
    
    try:
        # Get document content
        content_result = supabase.table('document_content').select('content').eq('file_id', file_id).execute()
        
        if not content_result.data:
            print(f"   ⚠️  No content found for file. Trying to extract from storage...")
            
            # Try to download and extract content
            from utils.file_parser import extract_and_store_file_content
            import tempfile
            
            # Download file from Supabase storage
            try:
                file_data = supabase.storage.from_('vault_files').download(file_path)
                
                # Write to temp file
                with tempfile.NamedTemporaryFile(delete=False, suffix=f"_{file_name}") as temp_file:
                    temp_file.write(file_data)
                    temp_path = temp_file.name
                
                # Extract and store content
                content, stored = extract_and_store_file_content(temp_path, file_id, user_id, file_name)
                
                # Clean up
                os.unlink(temp_path)
                
                if not content:
                    print(f"   ❌ Failed to extract content from file")
                    return False
                    
            except Exception as e:
                print(f"   ❌ Failed to download file: {e}")
                return False
        else:
            content = content_result.data[0]['content']
        
        if not content or not content.strip():
            print(f"   ⚠️  Empty content, skipping")
            return False
        
        # Generate embeddings
        print(f"   🧠 Generating embeddings...")
        
        from sentence_transformers import SentenceTransformer
        from server.query_handler import chunk_text
        
        model = SentenceTransformer('all-MiniLM-L6-v2')
        
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
                    'embedding': embedding.tolist(),
                    'metadata': {'file_name': file_name}
                })
                chunk_index += 1
        
        if embeddings_to_store:
            # Store embeddings
            supabase.table('document_embeddings').insert(embeddings_to_store).execute()
            print(f"   ✅ Generated and stored {len(embeddings_to_store)} embeddings")
            return True
        else:
            print(f"   ⚠️  No chunks to embed")
            return False
            
    except Exception as e:
        print(f"   ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    parser = argparse.ArgumentParser(description='Regenerate embeddings for files without them')
    parser.add_argument('--workspace-id', help='Process only files in this workspace')
    parser.add_argument('--file-id', help='Process only this specific file')
    args = parser.parse_args()
    
    print("🔍 Finding files without embeddings...")
    files = get_files_without_embeddings(args.workspace_id, args.file_id)
    
    if not files:
        print("✅ All files have embeddings!")
        return
    
    print(f"📋 Found {len(files)} file(s) without embeddings:")
    for f in files:
        print(f"   - {f['file_name']} ({f['id']})")
    
    print("\n" + "="*50)
    print("Starting embedding regeneration...")
    print("="*50)
    
    success_count = 0
    fail_count = 0
    
    for file_info in files:
        if regenerate_embeddings_for_file(file_info):
            success_count += 1
        else:
            fail_count += 1
    
    print("\n" + "="*50)
    print(f"✅ Successfully processed: {success_count}")
    print(f"❌ Failed: {fail_count}")
    print("="*50)

if __name__ == "__main__":
    main()
