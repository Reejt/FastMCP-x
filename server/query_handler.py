
# Handles query answering from documents and general model
from fastmcp import FastMCP
import subprocess
import numpy as np
from server.document_ingestion import documents
import re
from typing import List, Tuple

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

def chunk_text(text: str, chunk_size: int = 300, overlap: int = 30) -> List[str]:
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

def semantic_search(query: str, top_k: int = 2) -> List[Tuple[str, float, str]]:
    """
    Perform semantic search on ingested documents
    Returns list of (content, similarity_score, filename) tuples
    """
    if not SEMANTIC_SEARCH_AVAILABLE:
        print("Warning: Semantic search not available, falling back to keyword search")
        return []
        
    model = get_semantic_model()
    if not model or not documents:
        print(f"Semantic search failed: model={model is not None}, documents={len(documents) if documents else 0}")
        return []
    
    try:
        # Prepare document chunks with metadata
        all_chunks = []
        chunk_metadata = []
        
        print(f"Preparing semantic search for query: '{query}' across {len(documents)} documents")
        
        for doc in documents:
            # Handle both old format (strings) and new format (dicts)
            if isinstance(doc, dict):
                content = doc["content"]
                filename = doc.get("filename", "unknown")
            else:
                content = doc
                filename = "legacy_document"
                
            chunks = chunk_text(content)
            
            for chunk in chunks:
                if chunk.strip():  # Only add non-empty chunks
                    all_chunks.append(chunk.strip())
                    chunk_metadata.append(filename)
        
        if not all_chunks:
            print("No chunks available for semantic search")
            return []
        
        print(f"Generated {len(all_chunks)} chunks for semantic search")
        
        # Encode query and chunks
        query_embedding = model.encode([query])
        chunk_embeddings = model.encode(all_chunks)
        
        # Calculate similarities
        similarities = cosine_similarity(query_embedding, chunk_embeddings)[0]
        
        print(f"Similarities calculated - max: {max(similarities):.3f}, mean: {sum(similarities)/len(similarities):.3f}")
        
        # Get top k results
        top_indices = np.argsort(similarities)[::-1][:top_k]
        
        results = []
        for idx in top_indices:
            if similarities[idx] > 0.15:  # Further lowered similarity threshold from 0.2 to 0.15 for better recall
                results.append((
                    all_chunks[idx],
                    float(similarities[idx]),
                    chunk_metadata[idx]
                ))
                print(f"Found relevant chunk: score={similarities[idx]:.3f}, file={chunk_metadata[idx]}")
        
        print(f"Semantic search returning {len(results)} results")
        return results
    
    except Exception as e:
        print(f"Error in semantic search: {e}")
        return []

def simple_keyword_search(query: str) -> List[Tuple[str, str]]:
    """
    Fallback keyword search for when semantic search fails
    Returns list of (content, filename) tuples
    """
    results = []
    query_lower = query.lower()
    
    for doc in documents:
        # Handle both old format (strings) and new format (dicts)
        if isinstance(doc, dict):
            content = doc["content"]
            filename = doc.get("filename", "unknown")
        else:
            content = doc
            filename = "legacy_document"
        
        if query_lower in content.lower():
            results.append((content, filename))
    
    return results


def query_model(query: str) -> str:
    """Query the Gemma:2b model with the provided query for faster processing."""
    try:
        # Try HTTP API first (more reliable)
        import requests
        import json
        
        print(f"Querying Ollama via HTTP API...")
        
        response = requests.post(
            'http://localhost:11434/api/generate',
            json={
                'model': 'gemma:2b',
                'prompt': query,
                'stream': False
            },
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            llm_response = result.get('response', '')
            print(f"LLM response received via HTTP: {len(llm_response)} characters")
            return llm_response
        else:
            print(f"HTTP API failed with status {response.status_code}, trying CLI...")
            # Fallback to CLI
            raise Exception("HTTP API failed")
            
    except Exception as http_error:
        print(f"HTTP API failed: {http_error}, trying CLI...")
        
        # Fallback to CLI approach
        try:
            # Call Ollama for Gemma:2b model (optimized for RTX 3050)
            print(f"Querying Ollama with CLI...")
            
            # Use shell=True on Windows to properly handle the command
            import os
            
            # Create a proper environment
            env = os.environ.copy()
            
            # Try with shell=True for Windows compatibility
            result = subprocess.run(
                ["ollama", "run", "gemma:2b", query],
                capture_output=True,
                text=True,
                check=True,
                timeout=20,  # Reduced timeout for faster response
                encoding='utf-8',
                errors='ignore',  # Ignore problematic characters
                shell=True,  # Use shell=True for Windows
                env=env
            )
            response = result.stdout.strip()
            print(f"LLM response received via CLI: {len(response)} characters")
            return response
        except subprocess.TimeoutExpired:
            print("Gemma query timed out - trying fallback response")
            return f"I'm sorry, but the AI model took too long to respond. This might be because Ollama is busy or the query is complex. Please try a simpler question or try again later."
        except subprocess.CalledProcessError as e:
            error_msg = f"Ollama CLI error: {e.stderr.strip() if e.stderr else str(e)}"
            print(error_msg)
            return f"There was an issue with the AI model. Error: {error_msg}"
        except FileNotFoundError:
            error_msg = f"Ollama CLI not found. Please ensure Ollama is installed and in PATH."
            print(error_msg)
            return error_msg
        except Exception as e:
            error_msg = f"Error querying Gemma: {str(e)}"
            print(error_msg)
            return f"An unexpected error occurred: {error_msg}"


def answer_query(query: str) -> str:
    """
    Answer queries using semantic search on ingested documents
    Sends found content to LLM for processing and returns AI-generated response
    If no documents are available, provides general model response
    """
    print(f"Processing query: '{query}'")
    print(f"Documents loaded: {len(documents)}")
    
    if not documents:
        # No documents available, provide general model response
        print("No documents loaded, querying general model...")
        llm_response = query_model(query)
        return f"**Note:** No documents have been ingested yet. Providing general AI response:\n\n{llm_response}\n\n**Tip:** Ingest some documents first for context-aware responses using the ingest_file tool."
    
    try:
        # First try to find relevant document context
        print("Searching for relevant document context...")
        semantic_results = semantic_search(query, top_k=2)
        
        if not semantic_results:
            # No relevant context found, provide general model response
            print("No relevant context found in documents, querying general model...")
            llm_response = query_model(query)
            return f"**Note:** No relevant context found in the ingested documents for '{query}'. Providing general AI response:\n\n{llm_response}\n\n**Tip:** Try rephrasing your query or ingest more relevant documents."
        
        # Use semantic search for document-aware query with more chunks
        print("Using semantic search with context...")
        semantic_result = query_with_context(query, max_chunks=2)  # Increased from 1 to 2 chunks
        
        print(f"Returning semantic result: {len(semantic_result)} characters")
        return semantic_result
        
    except Exception as e:
        error_msg = f"Error processing query '{query}': {str(e)}"
        print(error_msg)
        return error_msg




def query_with_context(query: str, max_chunks: int = 1, include_context_preview: bool = True) -> str:
    """
    Query the LLM with relevant document chunks as context
    Combines semantic search with LLM reasoning for better answers
    
    Args:
        query: The question to ask
        max_chunks: Maximum number of document chunks to include as context (default: 1)
        include_context_preview: Whether to show which document sections were used (default: True)
    """
    if not documents:
        return "No documents have been ingested yet. Please ingest some documents first."
    
    # Get relevant chunks using semantic search
    semantic_results = semantic_search(query, top_k=max_chunks)
    
    if not semantic_results:
        # Fallback to simple keyword search
        print("Semantic search found no results, trying keyword search...")
        keyword_results = simple_keyword_search(query)
        if not keyword_results:
            # No relevant context found, query LLM directly but inform user
            llm_response = query_model(query)
            return f"**Note:** No relevant context found in ingested documents. Providing general response:\n\n{llm_response}"
        else:
            # Convert keyword results to semantic results format
            semantic_results = [(content, 0.5, filename) for content, filename in keyword_results[:max_chunks]]
    
    # Build context from search results
    context_parts = []
    for content, score, filename in semantic_results:
        # Provide much more substantial context to the LLM (increased from 1500 to 4000 chars)
        # This ensures the LLM has enough information to provide detailed answers
        truncated_content = content[:4000] + "..." if len(content) > 4000 else content
        context_parts.append(f"Document: {filename}\nContent: {truncated_content}")
    
    context = "\n\n---\n\n".join(context_parts)
    
    # Create simplified but effective prompt for better LLM responses
    enhanced_query = f"""Based on the following document content, please answer this question: {query}

DOCUMENT CONTENT:
{context}

Please provide a detailed and comprehensive answer based on the information above. If the documents contain relevant information, explain it thoroughly. If the question cannot be fully answered from the provided content, clearly state what information is missing."""
    
    # Query the LLM with context
    llm_response = query_model(enhanced_query)
    
    # Format the response
    if include_context_preview:
        response_parts = [
            llm_response,
            f"\n\n---\n**Context Sources ({len(semantic_results)} document sections, semantic search):**"
        ]
        
        for i, (content, score, filename) in enumerate(semantic_results, 1):
            response_parts.append(f"\n{i}. {filename} (relevance: {score:.3f})")
            preview = content[:150] + "..." if len(content) > 150 else content
            response_parts.append(f"   Preview: {preview}")
        
        return "\n".join(response_parts)
    else:
        return llm_response
    



