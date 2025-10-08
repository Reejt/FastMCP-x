
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

mcp = FastMCP("My MCP Server")

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

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
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

def semantic_search(query: str, top_k: int = 3) -> List[Tuple[str, float, str]]:
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
            return []
        
        # Encode query and chunks
        query_embedding = model.encode([query])
        chunk_embeddings = model.encode(all_chunks)
        
        # Calculate similarities
        similarities = cosine_similarity(query_embedding, chunk_embeddings)[0]
        
        # Get top k results
        top_indices = np.argsort(similarities)[::-1][:top_k]
        
        results = []
        for idx in top_indices:
            if similarities[idx] > 0.1:  # Minimum similarity threshold
                results.append((
                    all_chunks[idx],
                    float(similarities[idx]),
                    chunk_metadata[idx]
                ))
        
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
    """Query the Llama 3.2:3b model with the provided query."""
    try:
        # Call Ollama for Llama 3.2:3b model
        result = subprocess.run(
            ["ollama", "run", "llama3.2:3b", query],
            capture_output=True,
            text=True,
            check=True,
            timeout=120,  # 120 second timeout for Llama
            encoding='utf-8',
            errors='ignore'  # Ignore problematic characters
        )
        return result.stdout.strip()
    except subprocess.TimeoutExpired:
        return f"Llama query timed out after 120 seconds"
    except subprocess.CalledProcessError as e:
        return f"Ollama CLI error: {e.stderr.strip() if e.stderr else str(e)}"
    except FileNotFoundError:
        return f"Ollama CLI not found. Please ensure Ollama is installed and in PATH."
    except Exception as e:
        return f"Error querying Llama: {str(e)}"



def answer_query_impl(query: str) -> str:
    """
    Answer queries using semantic search on ingested documents with LLM reasoning
    Always includes relevant context chunks when querying the model
    """
    print(f"Documents loaded: {len(documents)}")
    
    if not documents:
        return "No documents have been ingested yet. Please ingest some documents first using the ingest_file tool."
    
    # Use the context-aware query function for better results
    return query_with_context_impl(query, max_chunks=3)

@mcp.tool
def answer_query(file_path: str) -> str:
    """MCP tool wrapper for answering query"""
    return answer_query_impl(file_path)



def semantic_search_tool_impl(query: str, top_k: int = 5) -> str:
    """
    Dedicated semantic search tool for finding relevant document sections
    Returns formatted results with similarity scores
    """
    if not documents:
        return "No documents have been ingested yet. Please ingest some documents first."
    
    results = semantic_search(query, top_k=top_k)
    
    if not results:
        return f"No semantically similar content found for query: '{query}'"
    
    response_parts = [f"Semantic search results for: '{query}'\n"]
    
    for i, (content, score, filename) in enumerate(results, 1):
        response_parts.append(f"**Match {i}** (Similarity: {score:.3f}) - {filename}")
        response_parts.append("-" * 50)
        # Show first 600 characters of the matching content
        display_content = content[:600] + "..." if len(content) > 600 else content
        response_parts.append(display_content)
        response_parts.append("")  # Empty line
    
    return "\n".join(response_parts)

@mcp.tool
def semantic_search_tool(file_path: str) -> str:
    """MCP tool wrapper for semantic search"""
    return semantic_search_tool_impl(file_path)



def query_with_context_impl(query: str, max_chunks: int = 3, include_context_preview: bool = True) -> str:
    """
    Query the LLM with relevant document chunks as context
    Combines semantic search with LLM reasoning for better answers
    
    Args:
        query: The question to ask
        max_chunks: Maximum number of document chunks to include as context (default: 3)
        include_context_preview: Whether to show which document sections were used (default: True)
    """
    if not documents:
        return "No documents have been ingested yet. Please ingest some documents first."
    
    # Get relevant chunks using semantic search
    semantic_results = semantic_search(query, top_k=max_chunks)
    context_source = "semantic"
    
    if not semantic_results:
        # Fallback to keyword search
        keyword_results = simple_keyword_search(query)
        if keyword_results:
            # Convert keyword results to semantic format for consistency
            semantic_results = [(content, 0.0, filename) for content, filename in keyword_results[:max_chunks]]
            context_source = "keyword"
        else:
            # No relevant context found, query LLM directly but inform user
            llm_response = query_model(query)
            return f"**Note:** No relevant context found in ingested documents. Providing general response:\n\n{llm_response}"
    
    # Build context from search results
    context_parts = []
    for content, score, filename in semantic_results:
        # Limit context size to prevent token overflow
        truncated_content = content[:1500] + "..." if len(content) > 1500 else content
        if context_source == "semantic":
            context_parts.append(f"Document: {filename} (relevance: {score:.3f})\nContent: {truncated_content}")
        else:
            context_parts.append(f"Document: {filename}\nContent: {truncated_content}")
    
    context = "\n\n---\n\n".join(context_parts)
    
    # Create enhanced prompt with context
    enhanced_query = f"""You are an AI assistant helping to answer questions based on document content. Use the provided document excerpts to answer the user's question as accurately and comprehensively as possible.

DOCUMENT CONTEXT:
{context}

USER QUESTION: {query}

INSTRUCTIONS:
1. Base your answer primarily on the provided document context
2. If the documents don't contain enough information to fully answer the question, clearly state what information is missing
3. Be specific and cite which documents you're referencing when possible
4. Provide a clear, well-structured response

ANSWER:"""
    
    # Query the LLM with context
    llm_response = query_model(enhanced_query)
    
    # Format the response
    if include_context_preview:
        response_parts = [
            llm_response,
            f"\n\n---\n**Context Sources ({len(semantic_results)} document sections, {context_source} search):**"
        ]
        
        for i, (content, score, filename) in enumerate(semantic_results, 1):
            score_info = f" (relevance: {score:.3f})" if context_source == "semantic" and score > 0 else ""
            response_parts.append(f"\n{i}. {filename}{score_info}")
            preview = content[:150] + "..." if len(content) > 150 else content
            response_parts.append(f"   Preview: {preview}")
        
        return "\n".join(response_parts)
    else:
        return llm_response
    
@mcp.tool
def query_with_context(file_path: str) -> str:
    """MCP tool wrapper for querying with context"""
    return query_with_context_impl(file_path)


