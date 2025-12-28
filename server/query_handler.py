""" 
Query Handler for FastMCP - pgvector Enterprise Edition

Database Schema (7 tables):
- auth.users: Supabase authentication (id, email, role, created_at, updated_at)
- workspaces: User workspaces (id, user_id, name, created_at, updated_at)
- file_upload: File metadata (id, workspace_id, user_id, file_name, file_type, file_path, size_bytes, status, uploaded_at, created_at, updated_at, deleted_at)
- document_content: Extracted text (id, file_id, user_id, content, file_name, extracted_at, created_at, updated_at)
- document_embeddings: Vector embeddings (id, user_id, file_id, chunk_index, chunk_text, embedding[vector], metadata[jsonb], created_at, updated_at)
- workspace_instructions: Custom instructions (id, workspace_id, title, instructions, is_active, created_at, updated_at)
- chats: Chat messages (id, workspace_id, user_id, role, message, created_at)

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
        workspace_id: Optional workspace filter for search results (default: None)
    
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


def query_model(query: str, model_name: str = 'llama3.2:1b', stream: bool = False, conversation_history: list = None):
    """
    Query the Ollama model via HTTP API with optional conversation history
    
    Args:
        query: The current user query
        model_name: Name of the Ollama model to use
        conversation_history: List of previous messages [{"role": "user"/"assistant", "content": "..."}]
        stream: Whether to stream the response (default: False)
    """
    try:
        # Build full prompt with conversation history if provided
        full_prompt = query
        if conversation_history and len(conversation_history) > 0:
            history_text = "\n\n".join([f"{msg['role'].upper()}: {msg['content']}" for msg in conversation_history[-5:]])  # Last 5 messages for context
            full_prompt = f"Conversation History:\n{history_text}\n\nCurrent Query: {query}"
        
        # Query the LLM
        response = requests.post(
            'http://host.docker.internal:11434/api/generate',
            json={
                'model': model_name,
                'prompt': full_prompt,
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
        # Use document context for enhanced response
        return query_with_context(query, max_chunks=2, conversation_history=conversation_history, stream=stream, workspace_id=workspace_id)
        
    except Exception as e:
        error_message = f"Error processing query: {str(e)}"
        if stream:
            def error_generator():
                yield {"response": error_message}
            return error_generator()
        return error_message




def query_with_context(query: str, max_chunks: int = 5, include_context_preview: bool = True, conversation_history: list = None, stream: bool = False, workspace_id: str = None):
    """
    Query the LLM with relevant document chunks as context
    Uses pgvector database-side similarity search
    Conversation history is handled by query_model()
    
    Args:
        query: The question to ask
        max_chunks: Maximum number of document chunks to include (default: 5)
        include_context_preview: Whether to show source documents (default: True)
        conversation_history: List of previous messages for conversation context
        stream: Whether to stream the response (default: False)
        workspace_id: Optional workspace filter for search results
    """
    # Get relevant chunks using pgvector database-side search
    semantic_results = semantic_search_pgvector(query, top_k=max_chunks, min_similarity=0.2, workspace_id=workspace_id)
    
    if not semantic_results:
        return query_model(query, conversation_history=conversation_history, stream=stream)
    
    # Check if the best match has good similarity
    best_score = semantic_results[0][1]
    
    # If similarity is too low, treat as general query without document context
    if best_score < 0.3:
        return query_model(query, conversation_history=conversation_history, stream=stream)
    
    # Build context from search results (max 2000 chars per chunk)
    context_parts = [
        f"Document: {filename}\nScore:{score:.2f}\nContent: {content[:2000]}{'...' if len(content) > 2000 else ''}"
        for content, score, filename in semantic_results
    ]
    
    context = "\n\n---\n\n".join(context_parts)
    
    enhanced_query = f"""Answer this question using the document content provided below: {query}

DOCUMENT CONTENT:
{context}
"""
    
    # Query the LLM with context and conversation history
    llm_response = query_model(enhanced_query, conversation_history=conversation_history, stream=stream)
    
    # Handle streaming response
    if stream:
        sources = list(set(filename for _, _, filename in semantic_results)) if (include_context_preview and semantic_results and best_score >= 0.3) else None
        
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
    if include_context_preview and semantic_results and best_score >= 0.3:
        sources = list(set(filename for _, _, filename in semantic_results))
        source_text = ", ".join(sources)
        return f"{llm_response}\n\n---\n**Sources:** {source_text}"
    
    return llm_response



def answer_link_query(link, question, conversation_history: list = None):
    """
    Answer a question based on the content of a given link (web or social media)
    Works with any URL by extracting available content through multiple strategies
    
    Args:
        link: The URL to fetch and analyze
        question: The question to answer based on the link content
        conversation_history: List of previous messages for conversation context
    """
    try:
        import requests
        from bs4 import BeautifulSoup
        
        if not link.startswith("http"):
            return "Unsupported link type. Please provide a valid HTTP/HTTPS URL."
        
        # Fetch the web page
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        resp = requests.get(link, timeout=30, headers=headers)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        
        # Multi-strategy content extraction - works for any platform
        content = ""
        
        # Strategy 1: Extract Open Graph metadata (title, description, image alt text)
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            content += f"Title: {og_title['content']}\n\n"
        
        og_description = soup.find("meta", property="og:description")
        if og_description and og_description.get("content"):
            content += f"Description: {og_description['content']}\n\n"
        
        # Strategy 2: Extract from article tags (good for articles, social media posts)
        articles = soup.find_all("article")
        if articles:
            for article in articles[:2]:  # Limit to first 2 articles
                article_text = article.get_text(separator="\n", strip=True)
                if article_text:
                    content += f"Article Content:\n{article_text[:1500]}\n\n"
                    break
        
        # Strategy 3: Extract from main content area
        if not content.strip() or len(content) < 100:
            main_content = soup.find("main")
            if main_content:
                main_text = main_content.get_text(separator="\n", strip=True)
                if main_text:
                    content += main_text[:2000]
        
        # Strategy 4: Extract markdown body (GitHub, wikis, etc.)
        if not content.strip() or len(content) < 100:
            markdown_body = soup.find("div", {"class": "markdown-body"})
            if markdown_body:
                md_text = markdown_body.get_text(separator="\n", strip=True)
                if md_text:
                    content += md_text[:2000]
        
        # Strategy 5: Fallback to all visible text
        if not content.strip() or len(content) < 100:
            content = soup.get_text(separator="\n", strip=True)[:3000]
        
        # Clean up excessive whitespace
        content = "\n".join(line.strip() for line in content.split("\n") if line.strip())
        
        # Build prompt for LLM
        prompt = f"Answer this question using the content below:\nQuestion: {question}\n\nContent:\n{content[:4000]}"
        
        return query_model(prompt, conversation_history=conversation_history)
    except Exception as e:
        return f"Error: {str(e)}"
       
    


