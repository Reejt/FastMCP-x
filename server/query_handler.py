""" 
Query Handler for FastMCP - pgvector Enterprise Edition

Database Schema (8 tables):
- auth.users: Supabase authentication (id, email, role, created_at, updated_at)
- workspaces: User workspaces (id, user_id, name, created_at, updated_at)
- file_upload: File metadata (id, workspace_id, user_id, file_name, file_type, file_path, size_bytes, status, uploaded_at, created_at, updated_at, deleted_at)
- document_content: Extracted text (id, file_id, user_id, content, file_name, extracted_at, created_at, updated_at)
- document_embeddings: Vector embeddings (id, user_id, file_id, chunk_index, chunk_text, embedding[vector], metadata[jsonb], created_at, updated_at)
- workspace_instructions: Custom instructions (id, workspace_id, title, instructions, is_active, created_at, updated_at)
- chat_sessions: Chat sessions (id, workspace_id, user_id, title, created_at, updated_at, deleted_at)
- chats: Chat messages (id, workspace_id, user_id, session_id, role, message, created_at)

Session Management:
- Each chat session has a unique id and belongs to a workspace
- Messages are linked to sessions via session_id foreign key
- Conversation history is scoped to current session to prevent context leakage

Similarity Search: Performed at DATABASE LEVEL using pgvector <=> operator
No application-level cosine similarity calculations
"""

# Handles query answering from documents using pgvector similarity search
import numpy as np
import requests
import os
import pandas as pd
import tempfile
import asyncio
import json
from typing import List, Tuple, Dict, Any, Optional
from server.document_ingestion import documents
from server.csv_excel_processor import process_csv_excel_query



# Try to import embedding model
try:
    from sentence_transformers import SentenceTransformer
    EMBEDDING_AVAILABLE = True
except ImportError:
    print("Warning: sentence-transformers not available. Install sentence-transformers for embeddings.")
    EMBEDDING_AVAILABLE = False

# Try to import Supabase client
try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    print("Warning: Supabase client not available. Install supabase for pgvector similarity search.")
    SUPABASE_AVAILABLE = False
    
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Supabase client for pgvector queries
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

# Initialize Ollama configuration for local development and Docker
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
print(f"🦙 Ollama configured at: {OLLAMA_BASE_URL}")

supabase_client: Client = None
if SUPABASE_AVAILABLE and SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Supabase pgvector client initialized for enterprise semantic search")
    except Exception as e:
        print(f"⚠️  Failed to initialize Supabase client: {str(e)}")
        supabase_client = None

# Global embedding model (only for generating query embeddings)
_semantic_model = None


def get_semantic_model():
    """Load the embedding model for generating query embeddings"""
    global _semantic_model
    if not EMBEDDING_AVAILABLE:
        return None
        
    if _semantic_model is None:
        try:
            # Use same model as stored embeddings: all-MiniLM-L6-v2 (384 dimensions)
            _semantic_model = SentenceTransformer('all-MiniLM-L6-v2')
            print("✅ Embedding model loaded for query encoding")
        except Exception as e:
            print(f"Warning: Could not load embedding model: {e}")
            _semantic_model = False
    return _semantic_model if _semantic_model is not False else None


def semantic_search_with_metadata(query: str, top_k: int = 5, min_similarity: float = 0.2, workspace_id: str = None, selected_file_ids: list = None):
    """
    ENHANCED: Semantic search with rich metadata for intelligent routing.
    
    Performs pgvector similarity search AND returns metadata (file_type, workspace_id, uploaded_at, etc.)
    automatically populates detected_files for ALL selected files, even if no semantic matches exist.
    
    Args:
        query: The search query text
        top_k: Number of top results to return (default: 5)
        min_similarity: Minimum similarity threshold (0.0-1.0, default: 0.2)
        workspace_id: Optional workspace filter for search results
        selected_file_ids: Optional list of file IDs to filter search
    
    Returns:
        Dict with:
        - 'results': List of (content, similarity, filename, file_path, uploaded_at) tuples
        - 'detected_files': Dict mapping file_id -> {file_name, file_type, file_path, workspace_id, uploaded_at}
          (includes metadata for ALL selected files, not just semantic matches)
        - 'file_types': List of detected file types ('csv', 'xlsx', 'txt', etc.)
    """
    if not supabase_client or not EMBEDDING_AVAILABLE:
        print("⚠️  pgvector search not available")
        return {'results': [], 'detected_files': {}, 'file_types': []}
    
    model = get_semantic_model()
    if not model:
        return {'results': [], 'detected_files': {}, 'file_types': []}
    
    # Generate embedding directly from query
    query_embedding = model.encode([query])[0].tolist()
    
    print(f"🔍 Metadata-aware search (top_k={top_k}, min_similarity={min_similarity})")
    
    try:
        # RPC call with metadata enrichment
        rpc_params = {
            'query_embedding': query_embedding,
            'match_threshold': min_similarity,
            'match_count': top_k,
            'file_ids': selected_file_ids
        }
        
        response = supabase_client.rpc('search_embeddings', rpc_params).execute()
        
        results = []
        detected_files = {}
        file_types_found = set()
        
        if hasattr(response, 'data') and response.data:
            for row in response.data:
                results.append((
                    row['chunk_text'],
                    float(row['similarity_score']),
                    row['file_name'],
                    row.get('file_path'),
                    row.get('uploaded_at')  # Include timestamp for time-based queries
                ))
                
                # Extract metadata
                file_id = row.get('file_id')
                file_name = row['file_name']
                
                # Determine file type from extension
                if file_name:
                    ext = file_name.lower().split('.')[-1] if '.' in file_name else None
                    file_type = 'csv' if ext == 'csv' else ('xlsx' if ext in ['xlsx', 'xls'] else 'txt')
                    file_types_found.add(file_type)
                    
                    if file_id not in detected_files:
                        detected_files[file_id] = {
                            'file_name': file_name,
                            'file_type': file_type,
                            'file_path': row.get('file_path'),
                            'workspace_id': row.get('workspace_id'),
                            'uploaded_at': row.get('uploaded_at')  # Include timestamp metadata
                        }
            
            print(f"✅ Found {len(results)} chunks from {len(detected_files)} file(s)")
            print(f"   File types: {file_types_found}")
        else:
            print("⚠️  No semantic matches found")
        
        # Populate detected_files for ALL selected files (even if no semantic matches)
        if selected_file_ids:
            try:
                # Fetch metadata for all selected files
                file_records = supabase_client.table('file_upload').select(
                    'id, file_name, file_type, file_path, workspace_id, uploaded_at'
                ).in_('id', selected_file_ids).execute()
                
                if hasattr(file_records, 'data') and file_records.data:
                    for file_record in file_records.data:
                        file_id = file_record['id']
                        if file_id not in detected_files:
                            file_name = file_record.get('file_name', '')
                            ext = file_name.lower().split('.')[-1] if '.' in file_name else None
                            file_type = file_record.get('file_type', 'txt')
                            if ext:
                                file_type = 'csv' if ext == 'csv' else ('xlsx' if ext in ['xlsx', 'xls'] else file_type)
                            
                            detected_files[file_id] = {
                                'file_name': file_name,
                                'file_type': file_type,
                                'file_path': file_record.get('file_path'),
                                'workspace_id': file_record.get('workspace_id'),
                                'uploaded_at': file_record.get('uploaded_at')
                            }
                            
                            if file_type not in file_types_found:
                                file_types_found.add(file_type)
            except Exception as e:
                print(f"⚠️  Could not fetch metadata for selected files: {e}")
        
        return {
            'results': results,
            'detected_files': detected_files,
            'file_types': list(file_types_found)
        }
        
    except Exception as rpc_error:
        print(f"⚠️  RPC error: {rpc_error}")
        return {'results': [], 'detected_files': {}, 'file_types': []}


def chunk_text(text: str, chunk_size: int = 600, overlap: int = 50):
    """Split text into overlapping chunks for better semantic search"""
    if len(text) <= chunk_size:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        if end >= len(text):
            chunks.append(text[start:])
            break
        
        # Try to break at sentence or word boundary
        chunk = text[start:end]
        last_sentence = chunk.rfind('.')
        last_word = chunk.rfind(' ')
        
        if last_sentence > start + chunk_size * 0.7:
            end = start + last_sentence + 1
        elif last_word > start + chunk_size * 0.7:
            end = start + last_word
            
        chunks.append(text[start:end])
        start = end - overlap
    
    return chunks


def query_csv_with_context(query: str, file_name: str, file_path: str = None, df: pd.DataFrame = None, conversation_history: list = None, selected_file_ids: list = None, **filters):
    """
    Query CSV data using sophisticated programmatic reasoning pipeline:
    
    1️⃣ Parse CSV into DataFrame
    2️⃣ Convert question into structured intent (filter, aggregate, group, order)
    3️⃣ Generate executable pandas code (silently)
    4️⃣ Execute code safely on DataFrame (actual computation, no hallucination)
    5️⃣ Format results in natural language
    
    This approach ensures accurate, non-hallucinated results by performing
    actual computations instead of relying on LLM text generation alone.
    
    Args:
        query: The natural language query
        file_name: Name of the CSV file
        file_path: Path to the CSV file (local or Supabase storage reference)
        df: DataFrame to query (if None, will load from file_path)
        conversation_history: List of previous messages for conversation context
        selected_file_ids: List of selected file IDs for context (optional)
        **filters: Optional keyword arguments for column-based filtering
    
    Returns:
        Natural language answer with actual computed results
    """
    try:
        path_to_load = file_path or file_name
        
        # If DataFrame provided, save to temporary file for processing
        if df is not None and not df.empty:
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as tmp:
                df.to_csv(tmp.name, index=False)
                path_to_load = tmp.name
        
        # Use new sophisticated pipeline
        result = process_csv_excel_query(
            query=query,
            conversation_history=conversation_history,
            selected_file_ids=selected_file_ids
        )
        
        return result
        
    except Exception as e:
        print(f"Error querying CSV: {e}")
        error_msg = f"Error processing CSV query: {str(e)}"
        return query_model(error_msg, conversation_history=conversation_history)




def query_excel_with_context(query: str, file_name: str, file_path: str = None, df: pd.DataFrame = None, conversation_history: list = None, selected_file_ids: list = None, **filters):
    """
    Query Excel data using sophisticated programmatic reasoning pipeline:
    
    1️⃣ Parse Excel into DataFrame
    2️⃣ Convert question into structured intent (filter, aggregate, group, order)
    3️⃣ Generate executable pandas code (silently)
    4️⃣ Execute code safely on DataFrame (actual computation, no hallucination)
    5️⃣ Format results in natural language
    
    This approach ensures accurate, non-hallucinated results by performing
    actual computations instead of relying on LLM text generation alone.
    
    Args:
        query: The natural language query
        file_name: Name of the Excel file
        file_path: Path to the Excel file (local or Supabase storage reference)
        df: DataFrame to query (if None, will load from file_path)
        conversation_history: List of previous messages for conversation context
        selected_file_ids: List of selected file IDs for context (optional)
        **filters: Optional keyword arguments for column-based filtering
    
    Returns:
        Natural language answer with actual computed results
    """
    try:
        path_to_load = file_path or file_name
        
        # If DataFrame provided, save to temporary file for processing
        if df is not None and not df.empty:
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', suffix='.xlsx', delete=False) as tmp:
                df.to_excel(tmp.name, index=False)
                path_to_load = tmp.name
        
        # Use new sophisticated pipeline
        result = process_csv_excel_query(
            query=query,
            conversation_history=conversation_history,
            selected_file_ids=selected_file_ids
        )
        
        return result
        
    except Exception as e:
        print(f"Error querying Excel: {e}")
        error_msg = f"Error processing Excel query: {str(e)}"
        return query_model(error_msg, conversation_history=conversation_history)



async def query_model(query: str = None, model_name: str = 'llama3:8b', stream: bool = False, conversation_history: list = None, abort_event=None, system_prompt: str = None, user_prompt: str = None, timeout: int = 120):
    """
    Query the Ollama model via HTTP API with optional conversation history and system prompt (async version)
    
    Args:
        query: The current user query (alternative to user_prompt)
        model_name: Name of the Ollama model to use (default: llama3:8b)
        conversation_history: List of previous messages [{"role": "user"/"assistant", "content": "..."}]
        stream: Whether to stream the response (default: False)
        abort_event: threading.Event to signal cancellation (optional)
        system_prompt: Optional system prompt for the LLM
        user_prompt: Optional explicit user prompt (takes precedence over query)
        timeout: Request timeout in seconds (default: 120)
    """
    try:
        # Use user_prompt if provided, otherwise use query
        actual_query = user_prompt if user_prompt else query
        if not actual_query:
            raise ValueError("Either 'query', 'user_prompt', or 'user_prompt' must be provided")
        
        # Build full prompt with system prompt if provided
        full_prompt = actual_query
        if system_prompt:
            full_prompt = f"{system_prompt}\n\n{actual_query}"
        
        # Append conversation history if provided
        if conversation_history and len(conversation_history) > 0:
            # Filter out system metadata messages (like link caches) - only include real chat messages
            chat_messages = [
                msg for msg in conversation_history 
                if isinstance(msg, dict) and msg.get('role') not in ['system'] and msg.get('content')
            ]
            if chat_messages:
                # Format conversation history with roles for clarity
                history_parts = []
                for msg in chat_messages[-5:]:  # Last 5 messages for context
                    role = msg.get('role', 'user')
                    content = msg.get('content', '').strip()
                    if content:
                        role_label = 'Assistant' if role == 'assistant' else 'User'
                        history_parts.append(f"{role_label}: {content}")
                
                if history_parts:
                    history_text = "\n\n".join(history_parts)
                    full_prompt = f"Previous conversation:\n{history_text}\n\nCurrent query: {full_prompt}"
        
        # Query the LLM with streaming enabled when requested
        response = requests.post(
            f'{OLLAMA_BASE_URL}/api/generate',
            json={
                'model': model_name,
                'prompt': full_prompt,
                'stream': stream  # ✅ FIXED: Use actual stream parameter
            },
            timeout=timeout,
            stream=stream  # Enable streaming at requests level
        )
        response.raise_for_status()
        
        if stream:
            # Return async generator that yields JSON chunks with abort support
            async def generate():
                import json
                loop = asyncio.get_event_loop()
                line_iterator = iter(response.iter_lines())
                
                try:
                    while True:
                        # Check abort signal before processing each line
                        if abort_event and abort_event.is_set():
                            response.close()  # Close connection to stop Ollama
                            break
                        
                        # Run blocking iter_lines() call in thread pool to avoid blocking event loop
                        try:
                            line = await loop.run_in_executor(None, next, line_iterator)
                        except StopIteration:
                            break
                        
                        if line:
                            try:
                                chunk = json.loads(line)
                                if 'response' in chunk:
                                    # Strip "ASSISTANT:" prefix if present at the beginning
                                    response_text = chunk['response']
                                    if response_text.startswith('ASSISTANT:'):
                                        response_text = response_text[10:].lstrip()
                                        chunk['response'] = response_text
                                    yield chunk
                                # Stop when Ollama signals completion
                                if chunk.get('done', False):
                                    break
                            except json.JSONDecodeError:
                                continue
                finally:
                    # Ensure connection is closed
                    response.close()
            return generate()
        else:
            # Return full response as before
            response_text = response.json().get('response', '')
            # Strip "ASSISTANT:" prefix if present at the beginning
            if response_text.startswith('ASSISTANT:'):
                response_text = response_text[10:].lstrip()
            return response_text
    except requests.RequestException as e:
        raise Exception(f"Ollama API failed: {e}")
            
   

async def answer_query(query: str, conversation_history: list = None, stream: bool = False, workspace_id: str = None, selected_file_ids: list = None, abort_event=None):
    """
    Answer queries using pgvector database-side semantic search (async version)
    Database performs similarity matching - no application-level computation
    
    Args:
        query: The current user query
        conversation_history: List of previous messages [{"role": "user"/"assistant", "content": "..."}]
        stream: Whether to stream the response (default: False)
        workspace_id: Optional workspace filter for search results
        selected_file_ids: Optional list of file IDs to filter search results
        abort_event: threading.Event to signal cancellation (optional)
    """
    try:
        # Use document context for enhanced response
        return await query_with_context(query, max_chunks=5, conversation_history=conversation_history, stream=stream, workspace_id=workspace_id, selected_file_ids=selected_file_ids, abort_event=abort_event)
        
    except Exception as e:
        error_message = f"Error processing query: {str(e)}"
        if stream:
            async def error_generator():
                yield {"response": error_message}
            return error_generator()
        return error_message




def fetch_full_document_by_file_id(file_id: str):
    """
    Fetch all document chunks for a specific file from the database
    Used as fallback when semantic search yields weak similarity scores
    
    Args:
        file_id: The file ID to fetch content for
        
    Returns:
        String of all concatenated chunks from the file, or empty string if not found
    """
    if not supabase_client:
        return ""
    
    try:
        # Query all document content for this file, ordered by chunk_index
        response = supabase_client.table('document_embeddings').select(
            'chunk_text, chunk_index'
        ).eq('file_id', file_id).order('chunk_index', desc=False).execute()
        
        if hasattr(response, 'data') and response.data:
            # Sort by chunk_index to maintain proper document order
            sorted_chunks = sorted(
                [row for row in response.data if row.get('chunk_text')],
                key=lambda x: x.get('chunk_index', 0)
            )
            # Concatenate all chunks in order
            all_chunks = [row['chunk_text'] for row in sorted_chunks]
            return "\n\n".join(all_chunks)
        return ""
    except Exception as e:
        print(f"⚠️  Error fetching full document {file_id}: {e}")
        return ""


async def query_with_context(query: str, max_chunks: int = 5, include_context_preview: bool = True, conversation_history: list = None, stream: bool = False, workspace_id: str = None, selected_file_ids: list = None, abort_event=None):
    """
    Query the LLM with relevant document chunks as context using pgvector semantic search (async version)
    Text documents only - CSV/Excel files are handled separately via their dedicated functions
    
    FALLBACK MECHANISM:
    - If file(s) exist but all scores are low (< 0.25), includes ALL embeddings from those files
    - Ensures comprehensive context even when semantic matching yields weak similarity scores
    - Handles both single and multiple selected files
    
    Args:
        query: The question to ask
        max_chunks: Maximum number of document chunks to include (default: 5)
        include_context_preview: Whether to show source documents (default: True)
        conversation_history: List of previous messages for conversation context
        stream: Whether to stream the response (default: False)
        workspace_id: Optional workspace filter for search results
        selected_file_ids: Optional list of file IDs to filter search results
        abort_event: threading.Event to signal cancellation (optional)
    """
    # Get relevant chunks using pgvector database-side search with metadata
    search_result = semantic_search_with_metadata(query, top_k=max_chunks, min_similarity=0.2, workspace_id=workspace_id, selected_file_ids=selected_file_ids)
    semantic_results = search_result.get('results', [])
    detected_files = search_result.get('detected_files', {})
    
    # Check if semantic results have weak similarity scores
    has_weak_matches = any(score < 0.25 for _, score, _, _, _ in semantic_results)
    
    # FALLBACK: If selected files exist but semantic search yields weak results, fetch full content
    context_parts = []
    
    if semantic_results and not has_weak_matches:
        # Build context from strong semantic search results (max 2000 chars per chunk)
        context_parts = [
            f"Document: {filename}\nScore:{score:.2f}\nContent: {content[:2000]}{'...' if len(content) > 2000 else ''}"
            for content, score, filename, file_path, uploaded_at in semantic_results
        ]
    
    # Fallback: If weak matches OR no results but files are selected, fetch full document content
    if (not semantic_results or has_weak_matches) and selected_file_ids:
        print(f"📌 Activating fallback: Fetching full content from {len(selected_file_ids)} selected file(s)")
        
        for file_id in selected_file_ids:
            # Get file metadata from detected_files (now guaranteed to exist via semantic_search_with_metadata)
            file_info = detected_files.get(file_id)
            if not file_info:
                print(f"   ⚠️  Could not find metadata for file {file_id}")
                continue
            
            # Fetch full document content
            full_content = fetch_full_document_by_file_id(file_id)
            
            if full_content:
                # Truncate to reasonable length (5000 chars per file for fallback)
                truncated = full_content[:5000]
                context_parts.append(
                    f"📄 Document: {file_info.get('file_name', 'Unknown')}\nContent (Full Context):\n{truncated}{'...' if len(full_content) > 5000 else ''}"
                )
                print(f"   ✅ Loaded {len(full_content)} chars from {file_info.get('file_name', 'Unknown')}")
            else:
                print(f"   ⚠️  No content found for file {file_info.get('file_name', file_id)}")
    
    # If still no context, return plain query
    if not context_parts:
        print("⚠️  No document context available, querying without context")
        return await query_model(query, conversation_history=conversation_history, stream=stream, abort_event=abort_event)
    
    context = "\n\n---\n\n".join(context_parts)
    
    # Build enhanced query - if context is empty, use query directly
    if not context.strip():
        enhanced_query = query
    else:
        enhanced_query = f"""Answer this question using the document content provided below: {query}

DOCUMENT CONTENT:
{context}
"""
    
    # Query the LLM with context and conversation history (async)
    # ✅ Pass abort_event for cancellation support
    return await query_model(enhanced_query, conversation_history=conversation_history, stream=stream, abort_event=abort_event)




def generate_chat_title(first_message: str, model_name: str = 'llama3:8b'):
    """
    Generate a concise, descriptive title for a chat session based on the first message.
    
    Args:
        first_message: The first user message in the chat session
        model_name: Name of the Ollama model to use (default: llama3:8b)
        
    Returns:
        A short, descriptive title (max 6 words)
    """
    try:
        # Create a prompt that instructs the LLM to generate a brief title
        prompt = f"""You are a title generator. Create a concise title (3-6 words maximum) that captures the main topic of this message.

Message: "{first_message}"

IMPORTANT RULES:
1. Return ONLY the title - no explanations, no quotes, no extra text
2. Maximum 6 words (3-4 is ideal)
3. Use title case (capitalize major words)
4. Be specific and descriptive
5. Focus on the main topic or action

Examples:
- Message: "How do I deploy a Next.js app to Vercel?" → Title: Deploy Next.js to Vercel
- Message: "Explain Python list comprehensions with examples" → Title: Python List Comprehensions Guide
- Message: "What are the best practices for React hooks?" → Title: React Hooks Best Practices

Now generate the title:"""

        # Query the LLM with a shorter timeout since this is a simple task
        response = requests.post(
            f'{OLLAMA_BASE_URL}/api/generate',
            json={
                'model': model_name,
                'prompt': prompt,
                'stream': False
            },
            timeout=30
        )
        response.raise_for_status()
        
        # Extract and clean the title
        title = response.json().get('response', '').strip()
        
        # Remove any quotation marks that might have been added
        title = title.replace('"', '').replace("'", '').strip()
        
        # Ensure title isn't too long (fallback to truncation)
        words = title.split()
        if len(words) > 6:
            title = ' '.join(words[:6])
        
        # If title is still empty or too short, return a default
        if not title or len(title) < 3:
            # Create a fallback title from first few words of message
            words = first_message.split()[:4]
            title = ' '.join(words) if words else 'New Chat'
            if len(title) > 50:
                title = title[:47] + '...'
        
        return title
        
    except requests.RequestException as e:
        # Fallback: use first few words of the message
        words = first_message.split()[:4]
        fallback_title = ' '.join(words) if words else 'New Chat'
        if len(fallback_title) > 50:
            fallback_title = fallback_title[:47] + '...'
        return fallback_title

    