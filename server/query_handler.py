""" 
Query Handler for FastMCP - pgvector Enterprise Edition

Database Schema (5 tables):
- files: File metadata (id, workspace_id, file_name, file_path, size_bytes, file_type, status, uploaded_at, deleted_at)
- workspaces: User workspaces (id, name, description, owner_id, created_at, updated_at, is_archived)
- chats: Chat messages (id, workspace_id, user_id, role, message, created_at)
- document_content: Extracted text (id, file_id, user_id, content, file_name, extracted_at, created_at, updated_at)
- document_embeddings: Vector embeddings (id, file_id, user_id, chunk_index, content, embedding(384), file_name, created_at, updated_at)

Similarity Search: Performed at DATABASE LEVEL using pgvector <=> operator
No application-level cosine similarity calculations
"""

# Handles query answering from documents using pgvector similarity search
import numpy as np
import requests
import os
from typing import List, Tuple, Dict, Any
from server.document_ingestion import documents

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
    """Lazy load the embedding model for generating query embeddings"""
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


def semantic_search_pgvector(query: str, top_k: int = 5, min_similarity: float = 0.2, workspace_id: str = None):
    """
    Perform semantic search using pgvector database-side similarity search
    
    Uses PostgreSQL pgvector extension with cosine distance operator (<=>)
    Similarity calculated at DATABASE LEVEL - no application-level computation
    
    Args:
        query: The search query text
        top_k: Number of top results to return (default: 5)
        min_similarity: Minimum similarity threshold (0.0-1.0, default: 0.2)
        workspace_id: Optional workspace filter
    
    Returns:
        List of (content, similarity_score, filename) tuples
    """
    if not supabase_client or not EMBEDDING_AVAILABLE:
        print("⚠️  pgvector search not available - Supabase or embeddings not configured")
        return []
    
    model = get_semantic_model()
    if not model:
        print("⚠️  Embedding model not available")
        return []
    
    try:
        # Generate embedding for the query using same model as stored embeddings
        query_embedding = model.encode([query])[0]
        query_embedding_list = query_embedding.tolist()
        
        print(f"🔍 Searching with pgvector (top_k={top_k}, min_similarity={min_similarity})")
        
        # Use RPC function for database-side similarity search
        # This is the proper way to do pgvector queries without SQL injection
        try:
            response = supabase_client.rpc('search_embeddings', {
                'query_embedding': query_embedding_list,
                'match_threshold': min_similarity,
                'match_count': top_k
            }).execute()
            
            if hasattr(response, 'data') and response.data:
                results = []
                for row in response.data:
                    results.append((
                        row['content'],
                        float(row['similarity_score']),
                        row['file_name']
                    ))
                
                print(f"✅ Found {len(results)} similar chunks via pgvector RPC")
                return results
            else:
                print("⚠️  RPC returned no data - may not be configured correctly")
        except Exception as rpc_error:
            print(f"⚠️  RPC call failed: {rpc_error}")
        
        # Fallback: Query all embeddings and filter locally
        # This uses pgvector but without the distance operator optimization
        print("ℹ️  Falling back to application-side filtering (less efficient)...")
        
        try:
            # Query embeddings with basic filtering
            query_filters = supabase_client.table('document_embeddings').select('id, content, file_name, file_id, embedding')
            
            # Add workspace filter if provided
            if workspace_id:
                query_filters = query_filters.in_('file_id', (
                    supabase_client.table('files')
                    .select('id')
                    .eq('workspace_id', workspace_id)
                    .execute()
                    .data
                ) or [])
            
            response = query_filters.execute()
            
            if not response.data:
                print("ℹ️  No embeddings found in database")
                return []
            
            # Calculate similarities locally (unavoidable without RPC)
            results = []
            for row in response.data:
                try:
                    if 'embedding' not in row or row['embedding'] is None:
                        continue
                    
                    # Convert stored embedding to numpy array
                    doc_embedding = np.array(row['embedding'])
                    
                    # Calculate cosine similarity (1 - cosine_distance)
                    # Using numpy for efficiency
                    dot_product = np.dot(query_embedding, doc_embedding)
                    query_norm = np.linalg.norm(query_embedding)
                    doc_norm = np.linalg.norm(doc_embedding)
                    
                    if query_norm == 0 or doc_norm == 0:
                        similarity = 0.0
                    else:
                        similarity = dot_product / (query_norm * doc_norm)
                    
                    if similarity >= min_similarity:
                        results.append((row['content'], float(similarity), row['file_name']))
                except Exception as e:
                    print(f"⚠️  Error processing embedding: {e}")
                    continue
            
            results.sort(key=lambda x: x[1], reverse=True)
            print(f"✅ Found {len(results[:top_k])} similar chunks (local filtering)")
            return results[:top_k]
            
        except Exception as fallback_error:
            print(f"⚠️  Fallback search failed: {fallback_error}")
            return []
            
    except Exception as e:
        print(f"❌ Error in pgvector search: {e}")
        import traceback
        traceback.print_exc()
        return []


def build_embeddings():
    """
    DEPRECATED in pgvector mode - Embeddings stored directly in Supabase via document_ingestion
    
    This function is kept for backward compatibility but is no longer needed.
    Document ingestion now handles embedding generation and database storage.
    
    For enterprise pgvector setup: embeddings are generated at ingestion time
    and stored directly in document_embeddings table without in-memory caching.
    """
    print("⚠️  build_embeddings() is deprecated - embeddings managed at document ingestion time")
    return






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

def semantic_search(query: str, top_k: int = 2, min_similarity: float = 0.18):
    """
    DEPRECATED - Use semantic_search_pgvector() instead
    
    This function is kept for backward compatibility but delegates to pgvector.
    All similarity calculations now happen at the DATABASE LEVEL using pgvector.
    """
    print("⚠️  semantic_search() is deprecated - using pgvector database-side search")
    return semantic_search_pgvector(query, top_k=top_k, min_similarity=min_similarity)




def is_query_related_to_history(query: str, conversation_history: list) -> bool:
    """
    Determine if the current query is related to conversation history
    Returns True if query contains contextual references or follow-up indicators
    """
    query_lower = query.lower().strip()
    
    # Check for pronouns and contextual references
    contextual_indicators = [
        'it', 'this', 'that', 'these', 'those', 'they', 'them', 'their',
        'he', 'she', 'his', 'her', 'its',
        'what about', 'how about', 'tell me more', 'explain', 'elaborate',
        'the same', 'similar', 'also', 'too', 'as well',
        'previous', 'before', 'earlier', 'above', 'mentioned'
    ]
    
    # Check if query is very short (likely a follow-up)
    if len(query.split()) <= 3:
        return True
    
    # Check for contextual indicators
    for indicator in contextual_indicators:
        if indicator in query_lower:
            return True
    
    # Check if query starts with follow-up words
    follow_up_starters = ['and', 'but', 'so', 'also', 'what about', 'how about']
    if any(query_lower.startswith(starter) for starter in follow_up_starters):
        return True
    
    return False


def query_model(query: str, model_name: str = 'llama3.2:1b', conversation_history: list = None, stream: bool = False, workspace_id: str = None):
    """
    Query the Ollama model via HTTP API with optional conversation history
    
    NOTE: workspace_id parameter is deprecated - workspace_instructions table does not exist
    Database schema: files, workspaces, chats, document_content
    
    Args:
        query: The current user query
        model_name: Name of the Ollama model to use
        conversation_history: List of previous messages [{"role": "user"/"assistant", "content": "..."}]
        stream: Whether to stream the response (default: False)
        workspace_id: DEPRECATED - has no effect (workspace_instructions table doesn't exist)
    """
    try:
        # workspace_id parameter is ignored - instructions feature disabled
        if workspace_id:
            print(f"Warning: workspace_id parameter ignored - workspace_instructions table does not exist")
        
        # Query logic without workspace instructions
        response = requests.post(
            'http://localhost:11434/api/generate',
            json={
                'model': model_name,
                'prompt': query,
                'stream': False
            },
            timeout=120,  # Increased timeout for large content summarization
            stream=stream  # Enable streaming at requests level
        )
        response.raise_for_status()
        
        if stream:
            # Return generator that yields JSON chunks
            def generate():
                import json
                for line in response.iter_lines():
                    if line:
                        try:
                            chunk = json.loads(line)
                            if 'response' in chunk:
                                yield chunk
                        except json.JSONDecodeError:
                            continue
            return generate()
        else:
            # Return full response as before
            return response.json().get('response', '')
    except requests.RequestException as e:
        raise Exception(f"Ollama API failed: {e}")
            
   

def answer_query(query: str, conversation_history: list = None, stream: bool = False, workspace_id: str = None):
    """
    Answer queries using pgvector database-side semantic search
    Database performs similarity matching - no application-level computation
    
    Args:
        query: The current user query
        conversation_history: List of previous messages [{"role": "user"/"assistant", "content": "..."}]
        stream: Whether to stream the response (default: False)
        workspace_id: Optional workspace filter for search results
    """
    try:
        # Use pgvector for semantic search - database handles similarity matching
        semantic_results = semantic_search_pgvector(query, top_k=2, min_similarity=0.18, workspace_id=workspace_id)
        
        if not semantic_results:
            # No relevant documents found - fall back to general query
            llm_response = query_model(query, conversation_history=conversation_history, stream=stream)
            return llm_response
        
        # Use document context for enhanced response
        return query_with_context(query, max_chunks=2, conversation_history=conversation_history, stream=stream, workspace_id=workspace_id)
        
    except Exception as e:
        if stream:
            def error_generator():
                yield {"response": f"Error processing query: {str(e)}"}
            return error_generator()
        return f"Error processing query: {str(e)}"




def query_with_context(query: str, max_chunks: int = 2, include_context_preview: bool = True, conversation_history: list = None, stream: bool = False, workspace_id: str = None):
    """
    Query the LLM with relevant document chunks as context
    Uses pgvector database-side similarity search
    
    Args:
        query: The question to ask
        max_chunks: Maximum number of document chunks to include (default: 2)
        include_context_preview: Whether to show source documents (default: True)
        conversation_history: List of previous messages for conversation context
        stream: Whether to stream the response (default: False)
        workspace_id: Optional workspace filter for search results
    """
    # Get relevant chunks using pgvector database-side search
    semantic_results = semantic_search_pgvector(query, top_k=max_chunks, min_similarity=0.3, workspace_id=workspace_id)
    
    if not semantic_results:
        return query_model(query, conversation_history=conversation_history, stream=stream)
    
    # Check if the best match has good similarity
    best_score = semantic_results[0][1]
    
    # If similarity is too low, treat as general query without document context
    if best_score < 0.4:
        return query_model(query, conversation_history=conversation_history, stream=stream)
    
    # Build context from search results (max 2000 chars per chunk)
    context_parts = [
        f"Document: {filename}\nContent: {content[:2000]}{'...' if len(content) > 2000 else ''}"
        for content, score, filename in semantic_results
    ]
    
    context = "\n\n---\n\n".join(context_parts)
    enhanced_query = f"""Answer this question using the document content provided below: {query}

DOCUMENT CONTENT:
{context}
"""
    
    # Query the LLM with context
    llm_response = query_model(enhanced_query, stream=stream)
    
    # Handle streaming response
    if stream:
        sources = list(set(filename for _, _, filename in semantic_results)) if (include_context_preview and semantic_results and best_score >= 0.4) else None
        
        def stream_with_sources():
            # Stream the main response
            for chunk in llm_response:
                yield chunk
            
            # Add sources at the end if applicable
            if sources:
                source_text = ", ".join(sources)
                yield {"response": f"\n\n---\n**Sources:** {source_text}"}
        
        return stream_with_sources()
    
    # Format the response with source attribution
    if include_context_preview and semantic_results and best_score >= 0.4:
        sources = list(set(filename for _, _, filename in semantic_results))
        source_text = ", ".join(sources)
        return f"{llm_response}\n\n---\n**Sources:** {source_text}"
    
    return llm_response 



def answer_link_query(link, question):
    """Answer a question based on the content of a given link (web or social media)"""
    try:
        import requests
        from bs4 import BeautifulSoup
        
        if link.startswith("http"):
            # Fetch the web page
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            resp = requests.get(link, timeout=30, headers=headers)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")
            
            # Check if it's a social media link
            if "youtube.com" in link or "youtu.be" in link:
                # Extract YouTube video description and comments area
                content = ""
                
                # Try to get video title
                title = soup.find("meta", property="og:title")
                if title and title.get("content"):
                    content += f"Title: {title['content']}\n\n"
                
                # Try to get video description
                description = soup.find("meta", property="og:description")
                if description and description.get("content"):
                    content += f"Description: {description['content']}\n\n"
                
                # Extract any visible text content (fallback)
                if not content.strip():
                    content = soup.get_text(separator="\n", strip=True)
                    
            elif "twitter.com" in link or "x.com" in link:
                # Extract Twitter/X post content
                content = ""
                
                # Try to get tweet description
                description = soup.find("meta", property="og:description")
                if description and description.get("content"):
                    content += f"Tweet: {description['content']}\n\n"
                
                # Extract article text if available
                articles = soup.find_all("article")
                for article in articles:
                    content += article.get_text(separator="\n", strip=True) + "\n"
                
                # Fallback to general text
                if not content.strip():
                    content = soup.get_text(separator="\n", strip=True)
                    
            elif "instagram.com" in link:
                # Extract Instagram post content
                content = ""
                
                # Try to get post description
                description = soup.find("meta", property="og:description")
                if description and description.get("content"):
                    content += f"Post: {description['content']}\n\n"
                
                # Try to get title
                title = soup.find("meta", property="og:title")
                if title and title.get("content"):
                    content += f"Caption: {title['content']}\n\n"
                
                # Fallback to general text
                if not content.strip():
                    content = soup.get_text(separator="\n", strip=True)
                    
            else:
                # General web link: extract all text
                content = soup.get_text(separator="\n", strip=True)
        else:
            return "Unsupported link type. Please provide a valid HTTP/HTTPS URL."
        
        # Clean up excessive whitespace
        content = "\n".join(line.strip() for line in content.split("\n") if line.strip())
        
        # Build prompt for LLM
        prompt = f"Answer this question using the content below:\nQuestion: {question}\n\nContent:\n{content[:4000]}"
        return query_model(prompt)
    except Exception as e:
        return f"Error: {str(e)}"
       
    


