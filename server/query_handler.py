
# Handles query answering from documents and general model
import numpy as np
import requests
from typing import List, Tuple
from server.document_ingestion import documents

# Try to import semantic search dependencies
try:
    from sklearn.metrics.pairwise import cosine_similarity
    from sentence_transformers import SentenceTransformer
    SEMANTIC_SEARCH_AVAILABLE = True
except ImportError:
    print("Warning: Semantic search dependencies not available. Install sentence-transformers and scikit-learn for enhanced search.")
    SEMANTIC_SEARCH_AVAILABLE = False

# Global semantic search model - loaded once and reused
_semantic_model = None

def get_semantic_model():
    """Lazy load the semantic model to avoid startup delays"""
    global _semantic_model
    if not SEMANTIC_SEARCH_AVAILABLE:
        return None
        
    if _semantic_model is None:
        try:
            # Use a lightweight but effective model
            _semantic_model = SentenceTransformer('all-MiniLM-L6-v2')
        except Exception as e:
            print(f"Warning: Could not load semantic model: {e}")
            _semantic_model = False  # Mark as failed to avoid retrying
    return _semantic_model if _semantic_model is not False else None

def chunk_text(text: str, chunk_size: int = 600, overlap: int = 50) -> List[str]:
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

def semantic_search(query: str, top_k: int = 2, min_similarity: float = 0.18) -> List[Tuple[str, float, str]]:
    """
    Perform semantic search on ingested documents
    Returns list of (content, similarity_score, filename) tuples
    """
    if not SEMANTIC_SEARCH_AVAILABLE:
        return []
        
    model = get_semantic_model()
    if not model or not documents:
        return []
    
    try:
        # Prepare document chunks with metadata
        all_chunks = []
        chunk_metadata = []
        
        for doc in documents:
            # Handle both dict and string document formats
            if isinstance(doc, dict):
                content = doc["content"]
                filename = doc.get("filename", "unknown")
            else:
                content = doc
                filename = "legacy_document"
                
            for chunk in chunk_text(content):
                if chunk.strip():
                    all_chunks.append(chunk.strip())
                    chunk_metadata.append(filename)
        
        if not all_chunks:
            return []
        
        # Encode and calculate similarities
        query_embedding = model.encode([query])
        chunk_embeddings = model.encode(all_chunks)
        similarities = cosine_similarity(query_embedding, chunk_embeddings)[0]
        
        # Get top k results above threshold
        top_indices = np.argsort(similarities)[::-1][:top_k]
        results = [
            (all_chunks[idx], float(similarities[idx]), chunk_metadata[idx])
            for idx in top_indices
            if similarities[idx] > min_similarity
        ]
        
        return results
    
    except Exception as e:
        print(f"Error in semantic search: {e}")
        return []




def query_model(query: str, model_name: str = 'llama3.2:3b') -> str:
    """Query the Ollama model via HTTP API"""
    try:
        response = requests.post(
            'http://localhost:11434/api/generate',
            json={
                'model': model_name,
                'prompt': query,
                'stream': False
            },
            timeout=120  # Increased timeout for large content summarization
        )
        response.raise_for_status()
        return response.json().get('response', '')
    except requests.RequestException as e:
        raise Exception(f"Ollama API failed: {e}")
            
   

def answer_query(query: str):
    """
    Answer queries using semantic search on ingested documents
    Falls back to general model if no documents or no relevant context found
    """
    if not documents:
        llm_response = query_model(query)
        return llm_response
    
    try:
        semantic_results = semantic_search(query, top_k=2)
        
        if not semantic_results:
            llm_response = query_model(query)
            return llm_response
        
        return query_with_context(query, max_chunks=2)
        
    except Exception as e:
        return f"Error processing query: {str(e)}"




def query_with_context(query: str, max_chunks: int = 2, include_context_preview: bool = True):
    """
    Query the LLM with relevant document chunks as context
    
    Args:
        query: The question to ask
        max_chunks: Maximum number of document chunks to include (default: 2)
        include_context_preview: Whether to show source documents (default: True)
    """
    # Get relevant chunks using semantic search
    semantic_results = semantic_search(query, top_k=max_chunks)
    
    if not semantic_results:
        return query_model(query)
    
    # Check if the best match has good similarity (threshold: 0.3)
    best_score = semantic_results[0][1]
    
    # If similarity is too low, treat as general query without document context
    if best_score < 0.3:
        return query_model(query)
    
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
    llm_response = query_model(enhanced_query)
    
    # Format the response with source attribution
    if include_context_preview and semantic_results:
        _, _, filename = semantic_results[0]
        return f"{llm_response}\n\n---\n**Source:** {filename}"
    
    return llm_response 
       
    



