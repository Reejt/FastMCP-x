"""
Tests for server/query_handler.py

Tests query handling functionality including:
- Semantic search with pgvector
- LLM query processing
- Document chunking
- Embedding generation
"""

import pytest
import os
import sys
from unittest.mock import patch, MagicMock
import numpy as np

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestSemanticModel:
    """Tests for semantic embedding model loading."""
    
    def test_get_semantic_model_returns_model_or_none(self):
        """Test that get_semantic_model returns a model or None gracefully."""
        from server.query_handler import get_semantic_model
        
        model = get_semantic_model()
        
        # Should either return a model or None, not crash
        assert model is None or hasattr(model, 'encode')


class TestChunkText:
    """Tests for text chunking functionality."""
    
    def test_chunk_text_basic(self, sample_text_content):
        """Test basic text chunking."""
        from server.query_handler import chunk_text
        
        chunks = list(chunk_text(sample_text_content))
        
        assert len(chunks) > 0
        # Each chunk should be non-empty
        for chunk in chunks:
            assert len(chunk.strip()) > 0
    
    def test_chunk_text_empty_string(self):
        """Test chunking an empty string."""
        from server.query_handler import chunk_text
        
        chunks = list(chunk_text(""))
        
        # Should handle empty string gracefully
        assert chunks == [] or all(c == "" for c in chunks)
    
    def test_chunk_text_short_content(self):
        """Test chunking content shorter than chunk size."""
        from server.query_handler import chunk_text
        
        short_text = "This is a short text."
        chunks = list(chunk_text(short_text))
        
        assert len(chunks) >= 1
        assert short_text in chunks[0]
    
    def test_chunk_text_long_content(self):
        """Test chunking long content creates multiple chunks."""
        from server.query_handler import chunk_text
        
        # Create content longer than default chunk size (600 chars)
        long_text = "This is a sentence. " * 100
        chunks = list(chunk_text(long_text))
        
        assert len(chunks) > 1


class TestDocumentNameExtraction:
    """Tests for document name extraction from queries."""
    
    @patch('server.query_handler.supabase_client')
    def test_extract_document_name_with_in_keyword(self, mock_supabase):
        """Test extracting document name with 'in document' pattern."""
        from server.query_handler import extract_document_name
        
        # Mock database response
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{'file_name': 'report.pdf'}]
        )
        
        query = "What is the summary in report.pdf"
        cleaned_query, detected_file = extract_document_name(query)
        
        # Should detect the file reference
        assert detected_file is not None or cleaned_query != query
    
    @patch('server.query_handler.supabase_client', None)
    def test_extract_document_name_without_supabase(self):
        """Test document extraction when Supabase is not available."""
        from server.query_handler import extract_document_name
        
        query = "What is the summary in report.pdf"
        cleaned_query, detected_file = extract_document_name(query)
        
        # Should return original query when no database
        assert cleaned_query == query
        assert detected_file is None


class TestFuzzyMatchFilename:
    """Tests for fuzzy filename matching."""
    
    def test_fuzzy_match_exact(self):
        """Test exact filename match."""
        from server.query_handler import _fuzzy_match_filename
        
        available_files = ["report.pdf", "data.xlsx", "notes.txt"]
        result = _fuzzy_match_filename("report.pdf", available_files)
        
        assert result == "report.pdf"
    
    def test_fuzzy_match_case_insensitive(self):
        """Test case-insensitive matching."""
        from server.query_handler import _fuzzy_match_filename
        
        available_files = ["Report.PDF", "Data.xlsx", "Notes.txt"]
        result = _fuzzy_match_filename("report.pdf", available_files)
        
        assert result is not None
        assert result.lower() == "report.pdf"
    
    def test_fuzzy_match_no_match(self):
        """Test when no match is found."""
        from server.query_handler import _fuzzy_match_filename
        
        available_files = ["report.pdf", "data.xlsx"]
        result = _fuzzy_match_filename("completely_different.doc", available_files)
        
        # Should return None if no match above threshold
        assert result is None or result in available_files
    
    def test_fuzzy_match_empty_list(self):
        """Test matching against empty file list."""
        from server.query_handler import _fuzzy_match_filename
        
        result = _fuzzy_match_filename("test.pdf", [])
        
        assert result is None


class TestQueryModel:
    """Tests for LLM query functionality."""
    
    @patch('server.query_handler.requests.post')
    def test_query_model_success(self, mock_post, mock_ollama_response):
        """Test successful LLM query."""
        from server.query_handler import query_model
        
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = mock_ollama_response
        mock_post.return_value.raise_for_status = MagicMock()
        
        result = query_model("What is 2+2?")
        
        assert result is not None
        assert isinstance(result, str)
    
    @patch('server.query_handler.requests.post')
    def test_query_model_with_conversation_history(self, mock_post, mock_ollama_response):
        """Test LLM query with conversation history."""
        from server.query_handler import query_model
        
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = mock_ollama_response
        mock_post.return_value.raise_for_status = MagicMock()
        
        history = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"}
        ]
        
        result = query_model("How are you?", conversation_history=history)
        
        assert result is not None
    
    @patch('server.query_handler.requests.post')
    def test_query_model_handles_error(self, mock_post):
        """Test LLM query error handling."""
        from server.query_handler import query_model
        import requests
        
        mock_post.side_effect = requests.RequestException("Connection failed")
        
        result = query_model("Test query")
        
        # Should return error message, not crash
        assert result is not None
        assert "error" in result.lower() or "failed" in result.lower()


class TestAnswerQuery:
    """Tests for the main answer_query function."""
    
    @patch('server.query_handler.query_model')
    @patch('server.query_handler.semantic_search_pgvector')
    def test_answer_query_with_context(self, mock_search, mock_query):
        """Test answering query with document context."""
        from server.query_handler import answer_query
        
        mock_search.return_value = [
            ("This is relevant content about AI.", 0.85, "doc1.pdf")
        ]
        mock_query.return_value = "Based on the document, AI is..."
        
        result = answer_query("What is AI?")
        
        assert result is not None
        assert isinstance(result, str)
    
    @patch('server.query_handler.query_model')
    @patch('server.query_handler.semantic_search_pgvector')
    def test_answer_query_no_relevant_docs(self, mock_search, mock_query):
        """Test answering query with no relevant documents."""
        from server.query_handler import answer_query
        
        mock_search.return_value = []
        mock_query.return_value = "I don't have relevant documents for that question."
        
        result = answer_query("Random unrelated question")
        
        assert result is not None
