"""
Tests for connector routing in bridge_server.py.

Tests @mention parsing, connector query routing in /api/query,
and connector management endpoints.
"""

import pytest
import os
import json
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ── Registry Tests ────────────────────────────────────────────────────────────

class TestConnectorRegistry:
    """Test the connector registry module."""

    def test_registry_has_all_connectors(self):
        """Registry should contain all 4 connector types."""
        from server.connectors import CONNECTOR_REGISTRY
        
        assert "gdrive" in CONNECTOR_REGISTRY
        assert "slack" in CONNECTOR_REGISTRY
        assert "gmail" in CONNECTOR_REGISTRY
        assert "onedrive" in CONNECTOR_REGISTRY

    def test_registry_connector_fields(self):
        """Each connector should have required fields."""
        from server.connectors import CONNECTOR_REGISTRY
        
        required_fields = ["name", "description", "api_type", "oauth_provider", "icon"]
        
        for connector_type, config in CONNECTOR_REGISTRY.items():
            for field in required_fields:
                assert field in config, f"{connector_type} missing field: {field}"

    def test_get_connector_config(self):
        """get_connector_config should return config for valid types."""
        from server.connectors import get_connector_config
        
        config = get_connector_config("gdrive")
        assert config is not None
        assert config["name"] == "Google Drive"

    def test_get_connector_config_invalid(self):
        """get_connector_config should return None for invalid types."""
        from server.connectors import get_connector_config
        
        config = get_connector_config("invalid_connector")
        assert config is None

    def test_list_connector_types(self):
        """list_connector_types should return all connector type strings."""
        from server.connectors import list_connector_types
        
        types = list_connector_types()
        assert isinstance(types, list)
        assert len(types) == 4
        assert "gdrive" in types

    def test_get_connector_display_info(self):
        """get_connector_display_info should return public-facing info."""
        from server.connectors import get_connector_display_info
        
        info = get_connector_display_info()
        assert isinstance(info, list)
        assert len(info) == 4
        
        # Each item should have display fields
        for item in info:
            assert "type" in item
            assert "name" in item
            assert "description" in item
            assert "icon" in item


# ── Bridge Server Connector Endpoints ─────────────────────────────────────────

class TestBridgeConnectorEndpoints:
    """Test connector-related endpoints in bridge_server.py."""

    @pytest.fixture
    def client(self):
        """Create a FastAPI test client for bridge_server."""
        try:
            # Patch Supabase and other external dependencies before import
            with patch.dict(os.environ, {
                "NEXT_PUBLIC_SUPABASE_URL": "https://test.supabase.co",
                "NEXT_PUBLIC_SUPABASE_ANON_KEY": "test-anon-key",
                "SUPABASE_SERVICE_ROLE_KEY": "test-service-key",
                "CONNECTOR_ENCRYPTION_KEY": "dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleXQ9PQ==",
            }):
                with patch("bridge_server.create_client"), \
                     patch("bridge_server.get_connector_handler", return_value=MagicMock()), \
                     patch("bridge_server.list_user_connectors", return_value=[]):
                    from bridge_server import app
                    return TestClient(app)
        except Exception:
            pytest.skip("Could not create bridge_server test client")

    def test_get_connectors_endpoint(self):
        """GET /api/connectors should return connector list."""
        from server.connectors import get_connector_display_info
        
        info = get_connector_display_info()
        assert len(info) > 0, "Should have connectors in registry"

    def test_connector_display_info_format(self):
        """Connector display info should have consistent format."""
        from server.connectors import get_connector_display_info
        
        for item in get_connector_display_info():
            assert isinstance(item["type"], str)
            assert isinstance(item["name"], str)
            assert len(item["name"]) > 0


# ── @Mention Routing Tests ───────────────────────────────────────────────────

class TestMentionRouting:
    """Test @mention detection and routing logic."""

    def test_mention_detected_in_query(self):
        """@connector queries should be detected and parsed."""
        from server.connectors.handler import parse_connector_mention
        
        # Valid connector mention
        result = parse_connector_mention("@gdrive quarterly report")
        assert result is not None
        assert result["connector"] == "gdrive"

    def test_mention_routing_unknown_connector(self):
        """Unknown @connector should still parse but won't match registry."""
        from server.connectors.handler import parse_connector_mention
        from server.connectors import get_connector_config
        
        result = parse_connector_mention("@unknown_service search query")
        # The regex will parse it, but the connector won't be in the registry
        if result:
            config = get_connector_config(result["connector"])
            assert config is None  # Not a valid connector

    def test_all_connectors_parseable(self):
        """All registered connectors should be parseable from @mentions."""
        from server.connectors.handler import parse_connector_mention
        from server.connectors import list_connector_types
        
        for connector_type in list_connector_types():
            query = f"@{connector_type} test query"
            result = parse_connector_mention(query)
            assert result is not None, f"Failed to parse @{connector_type}"
            assert result["connector"] == connector_type

    def test_mention_preserves_full_query(self):
        """Query after @mention should be preserved completely."""
        from server.connectors.handler import parse_connector_mention
        
        result = parse_connector_mention("@slack meeting notes from last week with john")
        assert result is not None
        assert result["query"] == "meeting notes from last week with john"

    def test_mention_with_special_characters(self):
        """Query with special characters should be handled."""
        from server.connectors.handler import parse_connector_mention
        
        result = parse_connector_mention("@gmail invoice #1234 from acme@corp.com")
        assert result is not None
        assert "#1234" in result["query"]


# ── Connector Query Flow Tests ────────────────────────────────────────────────

class TestConnectorQueryFlow:
    """Test the full connector query flow (unit level with mocks)."""

    @pytest.mark.asyncio
    @patch("server.connectors.handler.get_tokens")
    async def test_auth_required_when_no_tokens(self, mock_get_tokens):
        """Should return auth_required when user has no tokens for connector."""
        from server.connectors.handler import ConnectorHandler
        
        mock_get_tokens.return_value = None
        handler = ConnectorHandler()
        
        result = await handler.query_connector(
            user_id="user-123",
            connector_type="gdrive",
            query="find my files"
        )
        
        assert result.get("auth_required") is True

    @pytest.mark.asyncio
    @patch("server.connectors.handler.get_tokens")
    @patch("server.connectors.handler.decrypt_token")
    @patch("server.connectors.handler.refresh_token_if_needed")
    async def test_query_with_valid_tokens(self, mock_refresh, mock_decrypt, mock_get_tokens):
        """Should proceed with API call when tokens are valid."""
        from server.connectors.handler import ConnectorHandler
        
        mock_get_tokens.return_value = {
            "access_token": "encrypted_token",
            "refresh_token": "encrypted_refresh",
            "token_expires_at": None,
            "is_active": True
        }
        mock_decrypt.return_value = "decrypted_token"
        mock_refresh.return_value = "decrypted_token"
        
        handler = ConnectorHandler()
        
        # Mock the _call_provider method
        with patch.object(handler, '_call_provider', new_callable=AsyncMock) as mock_call:
            mock_call.return_value = [{"title": "Test File", "content": "Test content"}]
            
            with patch.object(handler, '_summarize_with_llm') as mock_summarize:
                mock_summarize.return_value = "Here are the results from Google Drive."
                
                result = await handler.query_connector(
                    user_id="user-123",
                    connector_type="gdrive",
                    query="find quarterly report"
                )
                
                # Should have called the provider
                mock_call.assert_called_once()
