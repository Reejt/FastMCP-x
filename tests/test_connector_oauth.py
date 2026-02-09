"""
Tests for connector OAuth token management.

Tests token encryption/decryption roundtrip, token CRUD operations,
provider-specific refresh logic (mocked HTTP), and Fernet key validation.
"""

import pytest
import os
import json
from unittest.mock import patch, MagicMock, AsyncMock
from datetime import datetime, timezone, timedelta

# Add project root to path
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ── Encryption Tests ──────────────────────────────────────────────────────────

class TestTokenEncryption:
    """Test Fernet encryption/decryption roundtrip."""

    def test_encrypt_decrypt_roundtrip(self):
        """Encrypting then decrypting should return the original token."""
        # Set a test encryption key
        from cryptography.fernet import Fernet
        test_key = Fernet.generate_key().decode()
        
        with patch.dict(os.environ, {"CONNECTOR_ENCRYPTION_KEY": test_key}):
            # Re-import to pick up the new key
            from server.connectors.oauth import encrypt_token, decrypt_token
            
            original = "ya29.a0AfH6SMB_test_access_token_1234567890"
            encrypted = encrypt_token(original)
            
            assert encrypted != original, "Encrypted token should differ from original"
            assert decrypt_token(encrypted) == original, "Decrypted token should match original"

    def test_encrypt_produces_different_ciphertexts(self):
        """Each encryption should produce a different ciphertext (Fernet uses random IV)."""
        from cryptography.fernet import Fernet
        test_key = Fernet.generate_key().decode()
        
        with patch.dict(os.environ, {"CONNECTOR_ENCRYPTION_KEY": test_key}):
            from server.connectors.oauth import encrypt_token
            
            token = "test_token_value"
            encrypted1 = encrypt_token(token)
            encrypted2 = encrypt_token(token)
            
            # Fernet uses random IV, so ciphertexts should differ
            assert encrypted1 != encrypted2

    def test_encrypt_empty_string(self):
        """Should handle empty string encryption."""
        from cryptography.fernet import Fernet
        test_key = Fernet.generate_key().decode()
        
        with patch.dict(os.environ, {"CONNECTOR_ENCRYPTION_KEY": test_key}):
            from server.connectors.oauth import encrypt_token, decrypt_token
            
            encrypted = encrypt_token("")
            assert decrypt_token(encrypted) == ""

    def test_encrypt_none_returns_none(self):
        """Should handle None gracefully."""
        from server.connectors.oauth import encrypt_token, decrypt_token
        
        assert encrypt_token(None) is None
        assert decrypt_token(None) is None


# ── Token Expiry Tests ────────────────────────────────────────────────────────

class TestTokenExpiry:
    """Test token expiration detection."""

    def test_token_expired(self):
        """Token with past expiry should be detected as expired."""
        from server.connectors.oauth import is_token_expired
        
        past = datetime.now(timezone.utc) - timedelta(hours=1)
        assert is_token_expired(past.isoformat()) is True

    def test_token_not_expired(self):
        """Token with future expiry should not be expired."""
        from server.connectors.oauth import is_token_expired
        
        future = datetime.now(timezone.utc) + timedelta(hours=1)
        assert is_token_expired(future.isoformat()) is False

    def test_token_expiring_within_buffer(self):
        """Token expiring within 5-minute buffer should be considered expired."""
        from server.connectors.oauth import is_token_expired
        
        # 3 minutes from now — within the default 5-min buffer
        almost_expired = datetime.now(timezone.utc) + timedelta(minutes=3)
        assert is_token_expired(almost_expired.isoformat()) is True

    def test_none_expiry_not_expired(self):
        """None expiry (e.g., Slack bot tokens) should never be expired."""
        from server.connectors.oauth import is_token_expired
        
        assert is_token_expired(None) is False


# ── Token CRUD Tests ─────────────────────────────────────────────────────────

class TestTokenCRUD:
    """Test save/get/delete token operations with mocked Supabase."""

    @patch("server.connectors.oauth.supabase")
    def test_save_tokens(self, mock_supabase):
        """Should upsert tokens into user_connectors table."""
        from server.connectors.oauth import save_tokens
        
        mock_supabase.table.return_value.upsert.return_value.execute.return_value = MagicMock()
        
        save_tokens(
            user_id="user-123",
            connector_type="gdrive",
            display_name="Google Drive",
            access_token="access_tok",
            refresh_token="refresh_tok",
            expires_at="2025-01-01T00:00:00Z",
            scopes=["drive.readonly"]
        )
        
        mock_supabase.table.assert_called_with("user_connectors")
        call_args = mock_supabase.table.return_value.upsert.call_args
        data = call_args[0][0] if call_args[0] else call_args[1].get("data", call_args[1])
        
        assert data["user_id"] == "user-123"
        assert data["connector_type"] == "gdrive"

    @patch("server.connectors.oauth.supabase")
    def test_get_tokens(self, mock_supabase):
        """Should fetch tokens for a user+connector pair."""
        from server.connectors.oauth import get_tokens
        
        mock_result = MagicMock()
        mock_result.data = [{
            "access_token": "encrypted_access",
            "refresh_token": "encrypted_refresh",
            "token_expires_at": "2025-01-01T00:00:00Z",
            "is_active": True
        }]
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = mock_result
        
        result = get_tokens("user-123", "gdrive")
        assert result is not None

    @patch("server.connectors.oauth.supabase")
    def test_get_tokens_not_found(self, mock_supabase):
        """Should return None when no tokens exist."""
        from server.connectors.oauth import get_tokens
        
        mock_result = MagicMock()
        mock_result.data = []
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = mock_result
        
        result = get_tokens("user-123", "nonexistent")
        assert result is None

    @patch("server.connectors.oauth.supabase")
    def test_delete_tokens(self, mock_supabase):
        """Should delete tokens from user_connectors."""
        from server.connectors.oauth import delete_tokens
        
        mock_supabase.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock()
        
        delete_tokens("user-123", "slack")
        mock_supabase.table.assert_called_with("user_connectors")

    @patch("server.connectors.oauth.supabase")
    def test_list_user_connectors(self, mock_supabase):
        """Should list all connectors for a user."""
        from server.connectors.oauth import list_user_connectors
        
        mock_result = MagicMock()
        mock_result.data = [
            {"connector_type": "gdrive", "display_name": "Google Drive", "is_active": True},
            {"connector_type": "slack", "display_name": "Slack", "is_active": True}
        ]
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_result
        
        result = list_user_connectors("user-123")
        assert len(result) == 2
        assert result[0]["connector_type"] == "gdrive"


# ── Token Refresh Tests ──────────────────────────────────────────────────────

class TestTokenRefresh:
    """Test provider-specific token refresh logic with mocked HTTP."""

    @pytest.mark.asyncio
    @patch("server.connectors.oauth.httpx.AsyncClient")
    @patch("server.connectors.oauth.save_tokens")
    @patch("server.connectors.oauth.decrypt_token")
    async def test_refresh_google_token(self, mock_decrypt, mock_save, mock_client_cls):
        """Should refresh a Google OAuth token using refresh_token grant."""
        from server.connectors.oauth import _refresh_google_token
        
        mock_decrypt.return_value = "real_refresh_token"
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "access_token": "new_access_token",
            "expires_in": 3600
        }
        
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client
        
        token_data = {
            "refresh_token": "encrypted_refresh",
            "connector_type": "gdrive"
        }
        
        result = await _refresh_google_token("user-123", token_data)
        assert result is not None

    @pytest.mark.asyncio
    @patch("server.connectors.oauth.httpx.AsyncClient")
    @patch("server.connectors.oauth.decrypt_token")
    async def test_refresh_microsoft_token(self, mock_decrypt, mock_client_cls):
        """Should refresh a Microsoft OAuth token."""
        from server.connectors.oauth import _refresh_microsoft_token
        
        mock_decrypt.return_value = "real_refresh_token"
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "access_token": "new_ms_access_token",
            "refresh_token": "new_ms_refresh_token",
            "expires_in": 3600
        }
        
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client
        
        token_data = {
            "refresh_token": "encrypted_refresh",
            "connector_type": "onedrive"
        }
        
        result = await _refresh_microsoft_token("user-123", token_data)
        assert result is not None
