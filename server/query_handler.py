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
import pandas as pd
import tempfile
from typing import List, Tuple, Dict, Any
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


def extract_document_name(query: str, workspace_id: str = None):
    """
    Extract document name from query if user mentions a specific file.
    
    Patterns detected:
    - "in document_name" / "in file document_name"
    - "from document_name"
    - "search document_name"
    - Exact filename mentions (case-insensitive matching)
    
    Args:
        query: The user's query
        workspace_id: Optional workspace to search for matching files
    
    Returns:
        Tuple of (cleaned_query, detected_filename) where filename is None if not found
    """
    import re
    
    if not supabase_client:
        return query, None
    
    try:
        # Get list of available files in workspace
        files_query = supabase_client.table('file_upload').select('file_name')
        
        if workspace_id:
            files_query = files_query.eq('workspace_id', workspace_id)
        
        files_result = files_query.execute()
        available_files = [f['file_name'] for f in files_result.data] if files_result.data else []
        
        if not available_files:
            return query, None
        
        # Check for explicit document references
        query_lower = query.lower()
        detected_file = None
        
        # Pattern 1: "in [document_name]" or "in file [document_name]"
        match = re.search(r'(?:in\s+(?:file|document)?\s*)([a-zA-Z0-9\-_.]+(?:\.\w+)?)', query_lower)
        if match:
            potential_file = match.group(1)
            # Fuzzy match against available files
            detected_file = _fuzzy_match_filename(potential_file, available_files)
        
        # Pattern 2: "from [document_name]"
        if not detected_file:
            match = re.search(r'(?:from\s+)([a-zA-Z0-9\-_.]+(?:\.\w+)?)', query_lower)
            if match:
                potential_file = match.group(1)
                detected_file = _fuzzy_match_filename(potential_file, available_files)
        
        # Pattern 3: Fuzzy match on direct filename mentions (fallback with strict threshold)
        if not detected_file:
            # Extract potential filenames from query (word by word)
            query_words = query_lower.split()
            for word in query_words:
                # Fuzzy match each word against available files with strict 85% threshold
                # Avoids false positives from casual word mentions
                match = _fuzzy_match_filename(word, available_files, threshold=0.85)
                if match:
                    detected_file = match
                    break
        
        if detected_file:
            # Remove the detected file reference from query for cleaner semantic search
            cleaned_query = re.sub(
                rf'(?:in\s+(?:file|document)?\s*)?{re.escape(detected_file)}',
                '',
                query,
                flags=re.IGNORECASE
            ).strip()
            cleaned_query = re.sub(r'from\s+', '', cleaned_query, flags=re.IGNORECASE).strip()
            
            print(f"📄 Document detected in query: {detected_file}")
            print(f"   Cleaned query: {cleaned_query}")
            
            return cleaned_query, detected_file
        
        return query, None
        
    except Exception as e:
        print(f"⚠️  Error extracting document name: {e}")
        return query, None


def _fuzzy_match_filename(potential: str, available_files: list, threshold: float = 0.7) -> str:
    """
    Fuzzy match a potential filename against available files using similarity.
    
    Args:
        potential: The potential filename to match
        available_files: List of actual filenames in the system
        threshold: Similarity threshold (0.0-1.0)
    
    Returns:
        Best matching filename or None if no match found
    """
    from difflib import SequenceMatcher
    
    if not available_files:
        return None
    
    best_match = None
    best_ratio = 0
    
    for file_name in available_files:
        # Compare filenames (case-insensitive)
        ratio = SequenceMatcher(None, potential.lower(), file_name.lower()).ratio()
        
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = file_name
    
    return best_match if best_ratio >= threshold else None


def get_all_file_embeddings(file_name: str, workspace_id: str = None) -> List[Tuple[str, float, str, str]]:
    """
    Retrieve ALL embeddings for a specific file (fallback when similarity is too low)
    
    Args:
        file_name: The name of the file to fetch all embeddings for
        workspace_id: Optional workspace filter
    
    Returns:
        List of (chunk_text, dummy_similarity, file_name, file_path) tuples
    """
    if not supabase_client:
        print("⚠️  Supabase not configured - cannot fetch file embeddings")
        return []
    
    try:
        query_builder = supabase_client.table('document_embeddings').select(
            'chunk_text, file_name, file_path'
        ).eq('file_name', file_name)
        
        # Filter by workspace if provided
        if workspace_id:
            # Join with file_upload table to filter by workspace
            query_builder = query_builder.eq('workspace_id', workspace_id)
        
        response = query_builder.order('chunk_index', desc=False).execute()
        
        if hasattr(response, 'data') and response.data:
            results = []
            for row in response.data:
                # Use 0.0 as dummy similarity since we're returning all chunks
                results.append((
                    row['chunk_text'],
                    0.0,  # Placeholder - all chunks from file
                    row['file_name'],
                    row.get('file_path')
                ))
            
            print(f"✅ Retrieved {len(results)} chunks from file '{file_name}' as fallback")
            return results
        else:
            print(f"⚠️  No embeddings found for file '{file_name}'")
            return []
            
    except Exception as e:
        print(f"⚠️  Error fetching file embeddings: {e}")
        return []


def semantic_search_pgvector(query: str, top_k: int = 5, min_similarity: float = 0.2, workspace_id: str = None, file_name: str = None):
    """
    Perform semantic search using pgvector database-side similarity search
    
    Uses PostgreSQL pgvector extension with cosine distance operator (<=>)
    Similarity calculated at DATABASE LEVEL - no application-level computation
    
    Features:
    - Detects and filters by document name if mentioned in query
    - Searches document embeddings using semantic similarity
    - Returns results sorted by similarity score
    - FALLBACK: If file_name exists but similarity is too low, returns ALL embeddings from that file
    
    Args:
        query: The search query text
        top_k: Number of top results to return (default: 5)
        min_similarity: Minimum similarity threshold (0.0-1.0, default: 0.2)
        workspace_id: Optional workspace filter for search results (default: None)
        file_name: Optional specific document to search in (extracted if not provided)
    
    Returns:
        List of (content, similarity_score, filename, file_path) tuples
    """
    if not supabase_client or not EMBEDDING_AVAILABLE:
        print("⚠️  pgvector search not available - Supabase or embeddings not configured")
        return []
    
    model = get_semantic_model()
    if not model:
        print("⚠️  Embedding model not available")
        return []
    
    # Extract document name from query if not explicitly provided
    if not file_name:
        cleaned_query, extracted_file = extract_document_name(query, workspace_id)
        file_name = extracted_file
        query = cleaned_query  # Use cleaned query for embedding
    
    # Generate embedding for the query using same model as stored embeddings
    query_embedding = model.encode([query])[0]
    query_embedding_list = query_embedding.tolist()
    
    search_context = f"top_k={top_k}, min_similarity={min_similarity}"
    if file_name:
        search_context += f", document={file_name}"
    
    print(f"🔍 Searching with pgvector ({search_context})")
        
    # Use RPC function for database-side similarity search
    # This is the proper way to do pgvector queries without SQL injection
    try:
        # Always pass all parameters to avoid PostgreSQL function overloading ambiguity
        # Use None for optional parameters that aren't needed
        rpc_params = {
            'query_embedding': query_embedding_list,
            'match_threshold': min_similarity,
            'match_count': top_k,
            'file_filter': file_name  # None if not filtering, string if filtering by filename
        }
        
        response = supabase_client.rpc('search_embeddings', rpc_params).execute()
            
        if hasattr(response, 'data') and response.data:
            results = []
            for row in response.data:
                results.append((
                    row['chunk_text'],
                    float(row['similarity_score']),
                    row['file_name'],
                    row.get('file_path')
                ))
            
            result_count = len(results)
            doc_context = f" in {file_name}" if file_name else ""
            print(f"✅ Found {result_count} similar chunks{doc_context} via pgvector RPC")
            return results
        else:
            # FALLBACK: If file_name exists and no results from semantic search, fetch all embeddings from that file
            if file_name:
                print(f"📋 Semantic search returned no results for '{file_name}' - falling back to all embeddings")
                return get_all_file_embeddings(file_name, workspace_id)
            print("⚠️  RPC returned no data - may not be configured correctly")
            
    except Exception as rpc_error:
        print(f"⚠️  RPC call failed: {rpc_error}")
        # FALLBACK: If file_name exists and RPC fails, try to fetch all embeddings
        if file_name:
            print(f"🔄 RPC failed - attempting fallback to all embeddings from '{file_name}'")
            return get_all_file_embeddings(file_name, workspace_id)
        


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


def query_csv_with_context(query: str, file_name: str, file_path: str = None, df: pd.DataFrame = None, conversation_history: list = None, **filters):
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
            file_path=path_to_load,
            is_excel=False,
            conversation_history=conversation_history
        )
        
        return result
        
    except Exception as e:
        print(f"Error querying CSV: {e}")
        error_msg = f"Error processing CSV query: {str(e)}"
        return query_model(error_msg, conversation_history=conversation_history)




def query_excel_with_context(query: str, file_name: str, file_path: str = None, df: pd.DataFrame = None, conversation_history: list = None, **filters):
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
            file_path=path_to_load,
            is_excel=True,
            conversation_history=conversation_history
        )
        
        return result
        
    except Exception as e:
        print(f"Error querying Excel: {e}")
        error_msg = f"Error processing Excel query: {str(e)}"
        return query_model(error_msg, conversation_history=conversation_history)


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
            f'{OLLAMA_BASE_URL}/api/generate',
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
        return query_with_context(query, max_chunks=5, conversation_history=conversation_history, stream=stream, workspace_id=workspace_id)
        
    except Exception as e:
        error_message = f"Error processing query: {str(e)}"
        if stream:
            def error_generator():
                yield {"response": error_message}
            return error_generator()
        return error_message




def query_with_context(query: str, max_chunks: int = 5, include_context_preview: bool = True, conversation_history: list = None, stream: bool = False, workspace_id: str = None):
    """
    Query the LLM with relevant document chunks as context using pgvector semantic search
    Text documents only - CSV/Excel files are handled separately via their dedicated functions
    
    FALLBACK MECHANISM:
    - If file_name exists in results but all scores are low (< 0.25), includes ALL embeddings from that file
    - Ensures comprehensive context even when semantic matching yields weak similarity scores
    
    Args:
        query: The question to ask
        max_chunks: Maximum number of document chunks to include (default: 5)
        include_context_preview: Whether to show source documents (default: True)
        conversation_history: List of previous messages for conversation context
        stream: Whether to stream the response (default: False)
        workspace_id: Optional workspace filter for search results
    """
    # Get relevant chunks using pgvector database-side search
    semantic_results = semantic_search_pgvector(query, top_k=max_chunks, min_similarity=0.18, workspace_id=workspace_id)
    
    if not semantic_results:
        return query_model(query, conversation_history=conversation_history, stream=stream)
    
    # Check if the best match has good similarity
    best_score = semantic_results[0][1]
    file_name = semantic_results[0][2] if len(semantic_results) > 0 else None
    
    # FALLBACK: If similarity is too low but file_name exists, include all embeddings from that file
    if best_score < 0.25:
        if file_name:
            print(f"⚠️  Low similarity score ({best_score:.2f}) detected - triggering fallback to all embeddings from '{file_name}'")
            fallback_results = get_all_file_embeddings(file_name, workspace_id)
            if fallback_results:
                print(f"📚 Using comprehensive context from {len(fallback_results)} chunks from '{file_name}'")
                semantic_results = fallback_results
            else:
                # Fallback failed, proceed without context
                return query_model(query, conversation_history=conversation_history, stream=stream)
        else:
            # No file_name available and low similarity, treat as general query
            return query_model(query, conversation_history=conversation_history, stream=stream)
    
    # Build context from search results (max 2000 chars per chunk)
    context_parts = [
        f"Document: {filename}\nScore:{score:.2f}\nContent: {content[:2000]}{'...' if len(content) > 2000 else ''}"
        for content, score, filename, file_path in semantic_results
    ]
    
    context = "\n\n---\n\n".join(context_parts)
    
    enhanced_query = f"""Answer this question using the document content provided below: {query}

DOCUMENT CONTENT:
{context}
"""
    
    # Query the LLM with context and conversation history
    return query_model(enhanced_query, conversation_history=conversation_history, stream=stream)



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
       
    


