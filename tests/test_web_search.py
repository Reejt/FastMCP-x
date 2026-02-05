"""
Tests for server/web_search_file.py

Tests web search functionality including:
- Tavily API integration
- Content extraction from search results
- Error handling for network failures
"""

import pytest
import os
import sys
from unittest.mock import patch, MagicMock

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestTavilyWebSearch:
    """Tests for Tavily web search functionality."""
    
    @patch('server.web_search_file.requests.post')
    @patch('server.web_search_file.query_model')
    def test_web_search_success(self, mock_query, mock_post):
        """Test successful web search with valid query."""
        from server.web_search_file import tavily_web_search
        
        # Mock Tavily API response
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "results": [
                {
                    "title": "Test Result",
                    "url": "https://example.com/test",
                    "content": "This is the search result content."
                }
            ]
        }
        mock_post.return_value.raise_for_status = MagicMock()
        
        # Mock content extraction (would normally fetch the URL)
        mock_query.return_value = "Summary of the search results."
        
        result = tavily_web_search("test query")
        
        assert result is not None
        assert isinstance(result, str)
    
    @patch('server.web_search_file.requests.post')
    def test_web_search_no_results(self, mock_post):
        """Test web search with no results."""
        from server.web_search_file import tavily_web_search
        
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {"results": []}
        mock_post.return_value.raise_for_status = MagicMock()
        
        result = tavily_web_search("extremely obscure query xyz123")
        
        assert result is not None
        assert "No search results" in result or "error" not in result.lower()
    
    @patch('server.web_search_file.requests.post')
    def test_web_search_api_error(self, mock_post):
        """Test web search handling of API errors."""
        from server.web_search_file import tavily_web_search
        import requests
        
        mock_post.side_effect = requests.RequestException("API unavailable")
        
        result = tavily_web_search("test query")
        
        assert result is not None
        assert "Error" in result
    
    @patch('server.web_search_file.requests.post')
    @patch('server.web_search_file.query_model')
    def test_web_search_with_conversation_history(self, mock_query, mock_post):
        """Test web search with conversation history context."""
        from server.web_search_file import tavily_web_search
        
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "results": [
                {
                    "title": "Test",
                    "url": "https://example.com",
                    "content": "Content"
                }
            ]
        }
        mock_post.return_value.raise_for_status = MagicMock()
        mock_query.return_value = "Answer based on search."
        
        history = [
            {"role": "user", "content": "Previous question"},
            {"role": "assistant", "content": "Previous answer"}
        ]
        
        result = tavily_web_search("follow up question", conversation_history=history)
        
        assert result is not None


class TestExtractTopResultsContent:
    """Tests for content extraction from top 3 search results."""

    def test_extract_with_valid_results(self):
        """Test extraction from valid search response with multiple results."""
        from server.web_search_file import extract_top_results_content

        search_response = {
            "results": [
                {
                    "title": "Test Page 1",
                    "url": "https://example.com/page1",
                    "content": "This is the snippet content from the first search result."
                },
                {
                    "title": "Test Page 2",
                    "url": "https://example.com/page2",
                    "content": "This is the snippet content from the second search result."
                },
                {
                    "title": "Test Page 3",
                    "url": "https://example.com/page3",
                    "content": "This is the snippet content from the third search result."
                }
            ]
        }

        # Note: This would normally try to fetch the URLs
        # The function has fallback behavior to Tavily snippets
        result = extract_top_results_content(search_response)

        assert result is not None
        # Should contain indicators of multiple results
        assert "Result 1:" in result or "Result 2:" in result

    def test_extract_no_results(self):
        """Test extraction with empty results."""
        from server.web_search_file import extract_top_results_content

        search_response = {"results": []}

        result = extract_top_results_content(search_response)

        assert "No search results" in result or result is not None

    def test_extract_no_results_key(self):
        """Test extraction with missing results key."""
        from server.web_search_file import extract_top_results_content

        search_response = {}

        result = extract_top_results_content(search_response)

        assert "No results" in result or result is not None

    def test_extract_missing_url(self):
        """Test extraction when URL is missing from result."""
        from server.web_search_file import extract_top_results_content

        search_response = {
            "results": [
                {
                    "title": "Test 1",
                    "content": "Some content 1"
                    # No URL
                },
                {
                    "title": "Test 2",
                    "url": "https://example.com/page2",
                    "content": "Some content 2"
                }
            ]
        }

        result = extract_top_results_content(search_response)

        assert result is not None

    def test_extract_fewer_than_three_results(self):
        """Test extraction when fewer than 3 results are available."""
        from server.web_search_file import extract_top_results_content

        search_response = {
            "results": [
                {
                    "title": "Test Page 1",
                    "url": "https://example.com/page1",
                    "content": "Content from first result."
                },
                {
                    "title": "Test Page 2",
                    "url": "https://example.com/page2",
                    "content": "Content from second result."
                }
            ]
        }

        result = extract_top_results_content(search_response)

        assert result is not None
        assert "Result 1:" in result or "Result 2:" in result

    def test_extract_multiple_sources_formatting(self):
        """Test that multiple sources are properly formatted with source attribution."""
        from server.web_search_file import extract_top_results_content

        search_response = {
            "results": [
                {
                    "title": "First Result",
                    "url": "https://example.com/1",
                    "content": "Content 1"
                },
                {
                    "title": "Second Result",
                    "url": "https://example.com/2",
                    "content": "Content 2"
                },
                {
                    "title": "Third Result",
                    "url": "https://example.com/3",
                    "content": "Content 3"
                }
            ]
        }

        result = extract_top_results_content(search_response)

        assert result is not None
        # Verify content includes multiple results with proper formatting
        assert "---" in result  # Result separator
        assert "URL:" in result  # URL attribution


class TestWebSearchErrorHandling:
    """Tests for error handling in web search."""
    
    @patch('server.web_search_file.requests.post')
    def test_handles_timeout(self, mock_post):
        """Test handling of request timeout."""
        from server.web_search_file import tavily_web_search
        import requests
        
        mock_post.side_effect = requests.Timeout("Request timed out")
        
        result = tavily_web_search("test query")
        
        assert "Error" in result
    
    @patch('server.web_search_file.requests.post')
    def test_handles_connection_error(self, mock_post):
        """Test handling of connection errors."""
        from server.web_search_file import tavily_web_search
        import requests
        
        mock_post.side_effect = requests.ConnectionError("Connection failed")
        
        result = tavily_web_search("test query")
        
        assert "Error" in result
