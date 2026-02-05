"""
Enhanced tests for web search with new PRD-compliant features.

Tests cover:
1. Search decision engine (automatic triggering)
2. Query optimization
3. Relevance scoring
4. URL fetching
5. Response generation with natural citations
6. Integration with bridge server
"""

import pytest
import os
import sys
from unittest.mock import patch, MagicMock, Mock
from datetime import datetime, timedelta

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestSearchDecisionEngine:
    """Tests for automatic search decision logic."""

    def test_temporal_query_triggers_search(self):
        """Test that queries with temporal indicators trigger search."""
        from server.search.decision import SearchDecisionEngine

        engine = SearchDecisionEngine()

        temporal_queries = [
            "Who is the current CEO of Apple?",
            "What are the latest AI developments in 2025?",
            "Recent news about SpaceX",
            "What happened today in the stock market?"
        ]

        for query in temporal_queries:
            # Use heuristic decision (no LLM dependency)
            decision = engine._heuristic_decision(query)
            assert decision['needs_search'] is True, f"Should trigger search for: {query}"
            assert 'temporal' in decision['reasoning'] or 'realtime' in decision['reasoning']

    def test_timeless_query_no_search(self):
        """Test that timeless queries don't trigger search."""
        from server.search.decision import SearchDecisionEngine

        engine = SearchDecisionEngine()

        timeless_queries = [
            "Explain how photosynthesis works",
            "What is the capital of France?",
            "How do I reverse a linked list?",
            "Write a poem about the ocean"
        ]

        for query in timeless_queries:
            decision = engine._heuristic_decision(query)
            assert decision['needs_search'] is False, f"Should NOT trigger search for: {query}"


class TestSearchQueryGenerator:
    """Tests for query optimization."""

    def test_query_optimization_removes_fluff(self):
        """Test that conversational words are removed."""
        from server.search.query_generator import SearchQueryGenerator

        generator = SearchQueryGenerator()

        test_cases = [
            ("Can you tell me about the latest AI developments?", "AI developments"),
            ("What is the current CEO of Apple?", "current CEO Apple"),
            ("Please show me recent news about Tesla", "recent news Tesla")
        ]

        for input_query, expected_keywords in test_cases:
            optimized = generator._heuristic_extract(input_query)
            # Check that key terms are present
            for keyword in expected_keywords.lower().split():
                assert keyword in optimized.lower(), f"Expected '{keyword}' in optimized query: {optimized}"

    def test_temporal_context_addition(self):
        """Test that temporal context (year) is added when needed."""
        from server.search.query_generator import SearchQueryGenerator

        generator = SearchQueryGenerator()
        current_year = datetime.now().year

        query = "Who is the current CEO of Microsoft"
        optimized = generator._heuristic_extract(query)

        assert str(current_year) in optimized, f"Expected year {current_year} in: {optimized}"

    def test_query_length_limits(self):
        """Test that queries are limited to 6 words."""
        from server.search.query_generator import SearchQueryGenerator

        generator = SearchQueryGenerator()

        long_query = "Can you please tell me all about the very latest developments in artificial intelligence research"
        optimized = generator._heuristic_extract(long_query)

        word_count = len(optimized.split())
        assert word_count <= 8, f"Query too long: {word_count} words - {optimized}"


class TestRelevanceScorer:
    """Tests for result scoring and filtering."""

    def test_semantic_similarity_keyword_fallback(self):
        """Test keyword overlap as fallback for semantic similarity."""
        from server.search.relevance_scorer import RelevanceScorer

        scorer = RelevanceScorer()

        query = "artificial intelligence machine learning"
        title = "Introduction to Machine Learning and AI"
        snippet = "This article covers machine learning basics and artificial intelligence applications"

        score = scorer._keyword_overlap(query, title, snippet)

        assert score > 0.3, f"Expected reasonable overlap score, got: {score}"

    def test_domain_trust_scores(self):
        """Test domain trust scoring."""
        from server.search.relevance_scorer import RelevanceScorer

        scorer = RelevanceScorer()

        test_cases = [
            ("https://www.reuters.com/article", 0.90),
            ("https://nature.com/paper", 0.95),
            ("https://example.edu/research", 0.90),
            ("https://example.gov/data", 0.95),
            ("https://medium.com/blog", 0.60),
            ("https://pinterest.com/pin", 0.0)  # Blocklisted
        ]

        for url, expected_score in test_cases:
            trust_score = scorer._source_trust(url)
            assert abs(trust_score - expected_score) < 0.1, f"Expected {expected_score} for {url}, got {trust_score}"

    def test_freshness_scoring(self):
        """Test freshness score based on publication date."""
        from server.search.relevance_scorer import RelevanceScorer

        scorer = RelevanceScorer()

        now = datetime.now()

        test_cases = [
            ((now - timedelta(days=3)).strftime('%Y-%m-%d'), 1.0),  # 3 days old
            ((now - timedelta(days=20)).strftime('%Y-%m-%d'), 0.9),  # 20 days old
            ((now - timedelta(days=60)).strftime('%Y-%m-%d'), 0.8),  # 60 days old
            ((now - timedelta(days=400)).strftime('%Y-%m-%d'), 0.3),  # > 1 year old
        ]

        for date_str, expected_score in test_cases:
            freshness = scorer._freshness(date_str)
            assert abs(freshness - expected_score) < 0.15, f"Expected {expected_score} for {date_str}, got {freshness}"

    def test_content_quality_heuristics(self):
        """Test content quality scoring."""
        from server.search.relevance_scorer import RelevanceScorer

        scorer = RelevanceScorer()

        # High quality
        high_quality_title = "Research Study on Climate Change"
        high_quality_snippet = "This comprehensive research study analyzes climate data from peer-reviewed sources. " * 5
        high_quality_url = "https://nature.com/research"

        high_score = scorer._content_quality(high_quality_title, high_quality_snippet, high_quality_url)

        # Low quality (spam)
        low_quality_title = "CLICK HERE BUY NOW AMAZING DEAL!!!"
        low_quality_snippet = "Buy now! Subscribe now! Click here! Amazing discount! ..."
        low_quality_url = "https://spam-site.com"

        low_score = scorer._content_quality(low_quality_title, low_quality_snippet, low_quality_url)

        assert high_score > low_score, f"High quality ({high_score}) should score higher than low quality ({low_score})"
        assert high_score > 0.6, f"High quality content should score > 0.6, got: {high_score}"
        assert low_score < 0.5, f"Low quality content should score < 0.5, got: {low_score}"

    def test_result_diversification(self):
        """Test that results are diversified (max 2 per domain)."""
        from server.search.relevance_scorer import RelevanceScorer

        scorer = RelevanceScorer()

        results = [
            {'url': 'https://example.com/page1', 'title': 'Page 1', 'relevance_score': 0.9},
            {'url': 'https://example.com/page2', 'title': 'Page 2', 'relevance_score': 0.8},
            {'url': 'https://example.com/page3', 'title': 'Page 3', 'relevance_score': 0.7},
            {'url': 'https://other.com/page1', 'title': 'Other Page', 'relevance_score': 0.6},
        ]

        diversified = scorer._diversify_results(results)

        # Count example.com results
        example_count = sum(1 for r in diversified if 'example.com' in r['url'])

        assert example_count <= 2, f"Should have max 2 results from example.com, got: {example_count}"


class TestURLFetcher:
    """Tests for URL fetching and content extraction."""

    def test_url_validation(self):
        """Test URL validation."""
        from server.search.url_fetcher import URLFetcher

        fetcher = URLFetcher()

        valid_urls = [
            "https://example.com/page",
            "http://test.org/article?id=123",
            "https://subdomain.example.com/path"
        ]

        invalid_urls = [
            "not-a-url",
            "ftp://invalid-scheme.com",
            "javascript:alert('xss')"
        ]

        for url in valid_urls:
            assert fetcher.validate_url(url) is True, f"Should validate: {url}"

        for url in invalid_urls:
            assert fetcher.validate_url(url) is False, f"Should NOT validate: {url}"

    def test_url_extraction(self):
        """Test URL extraction from text."""
        from server.search.url_fetcher import URLFetcher

        fetcher = URLFetcher()

        text = "Check out this article: https://example.com/article and also http://test.org/page"
        urls = fetcher.extract_urls(text)

        assert len(urls) == 2
        assert "https://example.com/article" in urls
        assert "http://test.org/page" in urls

    def test_url_safety_checks(self):
        """Test basic URL safety checks."""
        from server.search.url_fetcher import URLFetcher

        fetcher = URLFetcher()

        safe_urls = [
            "https://example.com/article",
            "https://reuters.com/news"
        ]

        unsafe_urls = [
            "javascript:alert(1)",
            "https://pinterest.com/pin",
            "data:text/html,<script>alert(1)</script>"
        ]

        for url in safe_urls:
            is_safe, reason = fetcher.is_url_safe(url)
            assert is_safe is True, f"Should be safe: {url} - {reason}"

        for url in unsafe_urls:
            is_safe, reason = fetcher.is_url_safe(url)
            assert is_safe is False, f"Should NOT be safe: {url}"

    def test_content_truncation(self):
        """Test that long content is truncated properly."""
        from server.search.url_fetcher import URLFetcher

        fetcher = URLFetcher()

        long_text = "A" * 10000
        truncated = fetcher._truncate_middle(long_text, 1000)

        assert len(truncated) <= 1100  # Some buffer for ellipsis
        assert "truncated" in truncated.lower()


class TestResponseGenerator:
    """Tests for response generation and citation validation."""

    def test_search_results_formatting(self):
        """Test XML formatting of search results."""
        from server.search.response_generator import ResponseGenerator

        generator = ResponseGenerator()

        results = [
            {
                'url': 'https://example.com/article',
                'title': 'Test Article',
                'content': 'This is a test snippet',
                'date': '2025-02-05'
            }
        ]

        formatted = generator.format_search_results(results)

        assert '<search_results>' in formatted
        assert '<source>' in formatted
        assert 'example.com' in formatted
        assert 'Test Article' in formatted

    def test_citation_extraction(self):
        """Test extraction of citations from response text."""
        from server.search.response_generator import ResponseGenerator

        generator = ResponseGenerator()

        response = """According to Reuters, the market rose today.
        Research from Nature shows promising results.
        BBC reports that temperatures are increasing."""

        citations = generator.extract_citations(response)

        assert 'Reuters' in citations
        assert 'Nature' in citations
        assert 'BBC' in citations

    def test_citation_validation(self):
        """Test citation validation against provided sources."""
        from server.search.response_generator import ResponseGenerator

        generator = ResponseGenerator()

        response = "According to Reuters, the market rose. BBC reports temperatures increased."

        search_results = [
            {'url': 'https://reuters.com/article', 'title': 'Market News'},
            {'url': 'https://bbc.com/news', 'title': 'Weather Update'}
        ]

        validation = generator.validate_citations(response, search_results=search_results)

        assert validation['validation_rate'] > 0.8  # Should be high (both citations valid)
        assert len(validation['invalid_citations']) == 0


class TestEnhancedWebSearch:
    """Integration tests for the full search pipeline."""

    @patch('server.enhanced_web_search.requests.post')
    @patch('server.enhanced_web_search.query_model')
    def test_full_search_pipeline(self, mock_query, mock_post):
        """Test the complete search pipeline from query to response."""
        from server.enhanced_web_search import EnhancedWebSearch

        # Mock Tavily API response
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "results": [
                {
                    "title": "Test Result",
                    "url": "https://reuters.com/test",
                    "content": "This is relevant test content about the current CEO",
                    "published_date": "2025-02-01"
                }
            ]
        }

        # Mock LLM response
        mock_query.return_value = "According to Reuters, the current CEO is John Doe."

        # Run search
        search = EnhancedWebSearch()
        result = search.search_and_answer("Who is the current CEO of TechCorp?")

        # Assertions
        assert result['search_triggered'] is True
        assert result['method'] == 'web_search'
        assert result['response'] is not None
        assert len(result['sources']) > 0

    def test_explicit_url_handling(self):
        """Test that explicit URLs bypass search decision."""
        from server.enhanced_web_search import EnhancedWebSearch

        search = EnhancedWebSearch()

        # Query with URL should be detected
        query = "Summarize this article: https://example.com/article"
        urls = search.url_fetcher.extract_urls(query)

        assert len(urls) > 0
        assert urls[0] == "https://example.com/article"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
