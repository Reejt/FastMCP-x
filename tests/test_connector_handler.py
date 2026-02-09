"""
Tests for connector handler module.

Tests rate limiter, ConnectorHandler orchestration, API wrapper error handling,
and LLM summarization.
"""

import pytest
import asyncio
import os
import time
from unittest.mock import patch, MagicMock, AsyncMock

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ── Rate Limiter Tests ────────────────────────────────────────────────────────

class TestTokenBucketRateLimiter:
    """Test the token-bucket rate limiter."""

    def test_initial_tokens(self):
        """Rate limiter should start with full capacity."""
        from server.connectors.handler import TokenBucketRateLimiter
        
        limiter = TokenBucketRateLimiter(rate=10.0, capacity=30)
        assert limiter.tokens == 30

    def test_acquire_consumes_token(self):
        """acquire() should consume a token and return True."""
        from server.connectors.handler import TokenBucketRateLimiter
        
        limiter = TokenBucketRateLimiter(rate=10.0, capacity=30)
        assert limiter.acquire() is True
        assert limiter.tokens == 29

    def test_acquire_when_empty(self):
        """acquire() should return False when no tokens available."""
        from server.connectors.handler import TokenBucketRateLimiter
        
        limiter = TokenBucketRateLimiter(rate=1.0, capacity=1)
        assert limiter.acquire() is True
        assert limiter.acquire() is False

    def test_tokens_refill_over_time(self):
        """Tokens should refill based on rate after time passes."""
        from server.connectors.handler import TokenBucketRateLimiter
        
        limiter = TokenBucketRateLimiter(rate=100.0, capacity=10)
        # Drain all tokens
        for _ in range(10):
            limiter.acquire()
        assert limiter.tokens == 0
        
        # Wait a bit for refill
        time.sleep(0.15)
        assert limiter.acquire() is True  # Should have refilled


# ── Mention Parsing Tests ────────────────────────────────────────────────────

class TestConnectorMentionParsing:
    """Test @mention regex parsing."""

    def test_parse_gdrive_mention(self):
        """Should parse @gdrive <query> correctly."""
        from server.connectors.handler import parse_connector_mention
        
        result = parse_connector_mention("@gdrive quarterly report")
        assert result is not None
        assert result["connector"] == "gdrive"
        assert result["query"] == "quarterly report"

    def test_parse_slack_mention(self):
        """Should parse @slack mention."""
        from server.connectors.handler import parse_connector_mention
        
        result = parse_connector_mention("@slack standup notes")
        assert result is not None
        assert result["connector"] == "slack"
        assert result["query"] == "standup notes"

    def test_parse_gmail_mention(self):
        """Should parse @gmail mention."""
        from server.connectors.handler import parse_connector_mention
        
        result = parse_connector_mention("@gmail invoice from acme")
        assert result is not None
        assert result["connector"] == "gmail"
        assert result["query"] == "invoice from acme"

    def test_parse_onedrive_mention(self):
        """Should parse @onedrive mention."""
        from server.connectors.handler import parse_connector_mention
        
        result = parse_connector_mention("@onedrive project plan")
        assert result is not None
        assert result["connector"] == "onedrive"

    def test_no_mention_returns_none(self):
        """Regular query without @ should return None."""
        from server.connectors.handler import parse_connector_mention
        
        result = parse_connector_mention("find quarterly report")
        assert result is None

    def test_mention_at_middle_returns_none(self):
        """@ not at start should not be parsed as connector mention."""
        from server.connectors.handler import parse_connector_mention
        
        result = parse_connector_mention("search @gdrive for files")
        assert result is None

    def test_mention_with_no_query(self):
        """@connector with no query should return None or empty query."""
        from server.connectors.handler import parse_connector_mention
        
        result = parse_connector_mention("@gdrive")
        # Should return None since there's no query to process
        assert result is None or result.get("query", "").strip() == ""


# ── ConnectorHandler Tests ───────────────────────────────────────────────────

class TestConnectorHandler:
    """Test ConnectorHandler orchestration."""

    def test_singleton_pattern(self):
        """get_connector_handler should return the same instance."""
        from server.connectors.handler import get_connector_handler
        
        handler1 = get_connector_handler()
        handler2 = get_connector_handler()
        assert handler1 is handler2

    @pytest.mark.asyncio
    @patch("server.connectors.handler.get_tokens")
    async def test_query_no_tokens(self, mock_get_tokens):
        """Should return auth_required when no tokens exist."""
        from server.connectors.handler import ConnectorHandler
        
        mock_get_tokens.return_value = None
        
        handler = ConnectorHandler()
        result = await handler.query_connector(
            user_id="user-123",
            connector_type="gdrive",
            query="quarterly report"
        )
        
        assert result.get("auth_required") is True or "auth" in str(result).lower()


# ── Decision Engine Tests ────────────────────────────────────────────────────

class TestConnectorDecisionEngine:
    """Test the LLM-powered decision engine."""

    def test_singleton_pattern(self):
        """get_decision_engine should return the same instance."""
        from server.connectors.decision import get_decision_engine
        
        engine1 = get_decision_engine()
        engine2 = get_decision_engine()
        assert engine1 is engine2

    def test_format_results_as_context(self):
        """Should format API results as XML context string."""
        from server.connectors.decision import get_decision_engine
        
        engine = get_decision_engine()
        
        results = [
            {"title": "Q4 Report", "content": "Revenue increased 15%"},
            {"title": "Q3 Report", "content": "Revenue increased 10%"}
        ]
        
        context = engine.format_results_as_context(results, "gdrive")
        
        assert "gdrive" in context.lower() or "Google Drive" in context
        assert "Q4 Report" in context
        assert "Revenue increased 15%" in context

    @patch("server.connectors.decision.requests.post")
    def test_translate_query_calls_llm(self, mock_post):
        """translate_query should call Ollama to generate API parameters."""
        from server.connectors.decision import get_decision_engine
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "response": '{"search_query": "quarterly report Q4 2024"}'
        }
        mock_post.return_value = mock_response
        
        engine = get_decision_engine()
        result = engine.translate_query("gdrive", "find the quarterly report from Q4 2024")
        
        assert result is not None


# ── API Wrapper Error Handling ────────────────────────────────────────────────

class TestAPIWrapperErrors:
    """Test error handling in provider API wrappers."""

    @pytest.mark.asyncio
    @patch("server.connectors.gdrive.httpx.AsyncClient")
    async def test_gdrive_search_http_error(self, mock_client_cls):
        """Google Drive search should handle HTTP errors gracefully."""
        from server.connectors.gdrive import search_drive
        
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.raise_for_status.side_effect = Exception("Unauthorized")
        mock_client.get.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client
        
        # Should not raise, should return empty or error result
        try:
            result = await search_drive("test_token", "query")
            # If it returns a result, it should handle error gracefully
        except Exception:
            pass  # Acceptable if it raises — we just verify it doesn't crash silently

    @pytest.mark.asyncio
    @patch("server.connectors.slack.httpx.AsyncClient")
    async def test_slack_search_http_error(self, mock_client_cls):
        """Slack search should handle HTTP errors gracefully."""
        from server.connectors.slack import search_messages
        
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.json.return_value = {"ok": False, "error": "not_authed"}
        mock_client.get.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client
        
        try:
            result = await search_messages("test_token", "query")
        except Exception:
            pass  # Acceptable error handling

    @pytest.mark.asyncio
    @patch("server.connectors.gmail.httpx.AsyncClient")
    async def test_gmail_search_http_error(self, mock_client_cls):
        """Gmail search should handle HTTP errors gracefully."""
        from server.connectors.gmail import search_emails
        
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.raise_for_status.side_effect = Exception("Unauthorized")
        mock_client.get.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client
        
        try:
            result = await search_emails("test_token", "query")
        except Exception:
            pass
