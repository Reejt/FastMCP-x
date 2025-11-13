
# Handles query answering from documents and general model
import numpy as np
import requests
import os
from typing import List, Tuple, Dict, Any
from server.document_ingestion import documents
import chromadb
from chromadb.config import Settings

# Try to import semantic search dependencies
try:
    from sklearn.metrics.pairwise import cosine_similarity
    from sentence_transformers import SentenceTransformer
    try:
        import torch
        TORCH_AVAILABLE = True
    except Exception:
        TORCH_AVAILABLE = False
    SEMANTIC_SEARCH_AVAILABLE = True
except ImportError:
    print("Warning: Semantic search dependencies not available. Install sentence-transformers and scikit-learn for enhanced search.")
    SEMANTIC_SEARCH_AVAILABLE = False

# Global variables for ChromaDB
_semantic_model = None
_chroma_client = None
_embedding_collection = None

# Initialize ChromaDB with persistent storage
CHROMA_DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'storage', 'chromadb')


def get_semantic_model():
    """Lazy load the semantic model to avoid startup delays"""
    global _semantic_model
    if not SEMANTIC_SEARCH_AVAILABLE:
        return None
        
    if _semantic_model is None:
        try:
            # Choose device: GPU if available and torch is present
            device = 'cuda' if (TORCH_AVAILABLE and torch.cuda.is_available()) else 'cpu'
            print(f"Loading SentenceTransformer on device: {device}")
            _semantic_model = SentenceTransformer('all-MiniLM-L6-v2', device=device)
        except Exception as e:
            print(f"Warning: Could not load semantic model: {e}")
            _semantic_model = False  # Mark as failed to avoid retrying
    return _semantic_model if _semantic_model is not False else None


def get_chroma_client():
    """Initialize ChromaDB client with persistent storage"""
    global _chroma_client, _embedding_collection
    
    if _chroma_client is None:
        try:
            # Ensure storage directory exists
            if not os.path.exists(CHROMA_DB_PATH):
                os.makedirs(CHROMA_DB_PATH)
            
            # Initialize ChromaDB with persistent storage
            _chroma_client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
            
            # Get or create collection
            try:
                _embedding_collection = _chroma_client.get_collection(name="fastmcp_embeddings")
                print(f"✅ Loaded existing ChromaDB collection with {_embedding_collection.count()} embeddings")
            except:
                _embedding_collection = _chroma_client.create_collection(
                    name="fastmcp_embeddings",
                    metadata={"hnsw:space": "cosine"}  # Use cosine similarity
                )
                print("✅ Created new ChromaDB collection")
                
        except Exception as e:
            print(f"Error initializing ChromaDB: {e}")
            _chroma_client = False
            _embedding_collection = None
    
    return _chroma_client if _chroma_client is not False else None


def build_embeddings():
    """Build embeddings for all documents and store in ChromaDB"""
    global _embedding_collection
    if not SEMANTIC_SEARCH_AVAILABLE or not documents:
        return
    
    model = get_semantic_model()
    client = get_chroma_client()
    
    if not model or not client or not _embedding_collection:
        return
    
    try:
        print("Building document embeddings...")
        
        # Clear existing collection
        _chroma_client.delete_collection(name="fastmcp_embeddings")
        _embedding_collection = _chroma_client.create_collection(
            name="fastmcp_embeddings",
            metadata={"hnsw:space": "cosine"}
        )
        
        # Prepare document chunks with metadata
        chunk_ids = []
        all_chunks = []
        chunk_metadata_list = []
        
        for doc in documents:
            # Handle both dict and string document formats
            if isinstance(doc, dict):
                content = doc["content"]
                filename = doc.get("filename", "unknown")
                document_id = doc.get("document_id", "unknown")
            else:
                content = doc
                filename = "legacy_document"
                document_id = "legacy"
                
            for idx, chunk in enumerate(chunk_text(content)):
                if chunk.strip():
                    chunk_id = f"{document_id}_{idx}"
                    chunk_ids.append(chunk_id)
                    all_chunks.append(chunk.strip())
                    chunk_metadata_list.append({"filename": filename, "document_id": document_id})
        
        if not all_chunks:
            return
        
        # Encode all chunks
        embeddings = model.encode(all_chunks).tolist()
        
        # Store in ChromaDB
        _embedding_collection.add(
            ids=chunk_ids,
            embeddings=embeddings,
            documents=all_chunks,
            metadatas=chunk_metadata_list
        )
        
        print(f"✅ Built and stored {len(all_chunks)} embeddings in ChromaDB")
        
    except Exception as e:
        print(f"Error building embeddings: {e}")
        import traceback
        traceback.print_exc()


def update_embeddings():
    """Update embeddings incrementally when new documents are added to ChromaDB"""
    if not SEMANTIC_SEARCH_AVAILABLE or not documents:
        return
    
    model = get_semantic_model()
    client = get_chroma_client()
    
    if not model or not client or not _embedding_collection:
        return
    
    try:
        # Get existing document IDs in ChromaDB
        existing_data = _embedding_collection.get()
        existing_doc_ids = set()
        if existing_data and existing_data['metadatas']:
            for metadata in existing_data['metadatas']:
                if metadata and 'document_id' in metadata:
                    existing_doc_ids.add(metadata['document_id'])
        
        # Find new documents that need embeddings
        chunk_ids = []
        new_chunks = []
        new_metadata_list = []
        
        for doc in documents:
            if isinstance(doc, dict):
                filename = doc.get("filename", "unknown")
                content = doc["content"]
                document_id = doc.get("document_id", "unknown")
            else:
                filename = "legacy_document"
                content = doc
                document_id = "legacy"
            
            # Only process if this document is not already in embeddings
            if document_id not in existing_doc_ids:
                for idx, chunk in enumerate(chunk_text(content)):
                    if chunk.strip():
                        chunk_id = f"{document_id}_{idx}"
                        chunk_ids.append(chunk_id)
                        new_chunks.append(chunk.strip())
                        new_metadata_list.append({"filename": filename, "document_id": document_id})
        
        if not new_chunks:
            print("No new documents to embed.")
            return
        
        print(f"Embedding {len(new_chunks)} new chunks from new documents...")
        
        # Encode new chunks
        embeddings = model.encode(new_chunks).tolist()
        
        # Add to ChromaDB
        _embedding_collection.add(
            ids=chunk_ids,
            embeddings=embeddings,
            documents=new_chunks,
            metadatas=new_metadata_list
        )
        
        total_count = _embedding_collection.count()
        print(f"✅ Added {len(new_chunks)} chunks. Total: {total_count} chunks in ChromaDB")
        
    except Exception as e:
        print(f"Error updating embeddings: {e}")
        # Fallback to rebuild if incremental update fails
        print("Falling back to full rebuild...")
        build_embeddings()


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
    Perform semantic search on ingested documents using ChromaDB
    Returns list of (content, similarity_score, filename) tuples
    """
    if not SEMANTIC_SEARCH_AVAILABLE:
        return []
        
    model = get_semantic_model()
    client = get_chroma_client()
    
    if not model or not documents or not client or not _embedding_collection:
        return []
    
    # Build embeddings if collection is empty
    if _embedding_collection.count() == 0:
        build_embeddings()
        
        # If still no embeddings, return empty
        if _embedding_collection.count() == 0:
            return []
    
    try:
        # Encode query
        query_embedding = model.encode([query]).tolist()
        
        # Query ChromaDB for similar embeddings
        results = _embedding_collection.query(
            query_embeddings=query_embedding,
            n_results=top_k
        )
        
        # Format results as (content, similarity_score, filename) tuples
        formatted_results = []
        if results and results['documents'] and len(results['documents']) > 0:
            for i, doc in enumerate(results['documents'][0]):
                # ChromaDB returns distance, convert to similarity (1 - distance for cosine)
                distance = results['distances'][0][i] if results['distances'] else 0
                similarity = 1 - distance  # Convert distance to similarity
                
                # Filter by minimum similarity
                if similarity > min_similarity:
                    filename = results['metadatas'][0][i].get('filename', 'unknown') if results['metadatas'] else 'unknown'
                    formatted_results.append((doc, float(similarity), filename))
        
        return formatted_results
    
    except Exception as e:
        print(f"Error in semantic search: {e}")
        import traceback
        traceback.print_exc()
        return []




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


def query_model(query: str, model_name: str = 'llama3.2:1b', conversation_history: list = None) -> str:
    """
    Query the Ollama model via HTTP API with optional conversation history
    
    Args:
        query: The current user query
        model_name: Name of the Ollama model to use
        conversation_history: List of previous messages [{"role": "user"/"assistant", "content": "..."}]
    """
    try:
        # Build the prompt with conversation history only if query is related to previous context
        if conversation_history and len(conversation_history) > 0 and is_query_related_to_history(query, conversation_history):
            # Format conversation history into the prompt
            context_parts = []
            for msg in conversation_history[-6:]:  # Last 6 messages (3 exchanges) for context
                role = "User" if msg.get("role") == "user" else "Assistant"
                context_parts.append(f"{role}: {msg.get('content', '')}")
            
            conversation_context = "\n".join(context_parts)
            enhanced_query = f"""Previous conversation:
{conversation_context}

Current question: {query}

Answer the current question, using the previous conversation for context if relevant (e.g., if the user uses pronouns like "it", "that", "they" or refers to previous topics)."""
            prompt = enhanced_query
        else:
            prompt = query
        
        response = requests.post(
            'http://localhost:11434/api/generate',
            json={
                'model': model_name,
                'prompt': prompt,
                'stream': False
            },
            timeout=120  # Increased timeout for large content summarization
        )
        response.raise_for_status()
        return response.json().get('response', '')
    except requests.RequestException as e:
        raise Exception(f"Ollama API failed: {e}")
            
   

def answer_query(query: str, conversation_history: list = None):
    """
    Answer queries using semantic search on ingested documents
    Falls back to general model if no documents or no relevant context found
    
    Args:
        query: The current user query
        conversation_history: List of previous messages [{"role": "user"/"assistant", "content": "..."}]
    """
    if not documents:
        llm_response = query_model(query, conversation_history=conversation_history)
        return llm_response
    
    try:
        semantic_results = semantic_search(query, top_k=2)
        
        if not semantic_results:
            llm_response = query_model(query, conversation_history=conversation_history)
            return llm_response
        
        return query_with_context(query, max_chunks=2, conversation_history=conversation_history)
        
    except Exception as e:
        return f"Error processing query: {str(e)}"




def query_with_context(query: str, max_chunks: int = 2, include_context_preview: bool = True, conversation_history: list = None):
    """
    Query the LLM with relevant document chunks as context
    
    Args:
        query: The question to ask
        max_chunks: Maximum number of document chunks to include (default: 2)
        include_context_preview: Whether to show source documents (default: True)
        conversation_history: List of previous messages for conversation context
    """
    # Get relevant chunks using semantic search
    semantic_results = semantic_search(query, top_k=max_chunks)
    
    if not semantic_results:
        return query_model(query, conversation_history=conversation_history)
    
    # Check if the best match has good similarity (threshold: 0.3)
    best_score = semantic_results[0][1]
    
    # If similarity is too low, treat as general query without document context
    if best_score < 0.4:
        return query_model(query, conversation_history=conversation_history)
    
    # Build context from search results (max 2000 chars per chunk)
    context_parts = [
        f"Document: {filename}\nContent: {content[:2000]}{'...' if len(content) > 2000 else ''}"
        for content, score, filename in semantic_results
    ]
    
    context = "\n\n---\n\n".join(context_parts)
    
    # Include conversation history in the enhanced query if provided
    if conversation_history and len(conversation_history) > 0 and is_query_related_to_history(query, conversation_history):
        history_parts = []
        for msg in conversation_history[-6:]:  # Last 6 message for context
            role = "User" if msg.get("role") == "user" else "Assistant"
            history_parts.append(f"{role}: {msg.get('content', '')}")
        conversation_context = "\n".join(history_parts)
        
        enhanced_query = f"""Previous conversation:
{conversation_context}

DOCUMENT CONTENT:
{context}

Current question: {query}

Instructions: Answer the current question using the document content provided above. Use the previous conversation for context if the user refers to previous topics or uses pronouns."""
    else:
        enhanced_query = f"""Answer this question using the document content provided below: {query}

DOCUMENT CONTENT:
{context}
"""
    
    # Query the LLM with context
    llm_response = query_model(enhanced_query)
    
    # Format the response with source attribution
    if include_context_preview and semantic_results and best_score >= 0.4:
        sources = list(set(filename for _, _, filename in semantic_results))
        source_text = ", ".join(sources)
        return f"{llm_response}\n\n---\n**Sources:** {source_text}"
    
    return llm_response 
       
    



