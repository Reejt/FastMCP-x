"""
OAuth Token Manager

Handles encrypted token storage and provider-specific refresh logic.
- Encryption: AES/Fernet using CONNECTOR_ENCRYPTION_KEY env var
- Token CRUD: get_tokens(), save_tokens(), delete_tokens()
- Token refresh: Provider-specific refresh endpoints
- Revocation: Optionally revoke tokens at the provider before deleting locally
"""

import os
import json
import base64
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Tuple

import httpx
from cryptography.fernet import Fernet
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env.local')
load_dotenv(dotenv_path=env_path)

# Try to import Supabase client
try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False

from server.connectors import get_connector_config


# ---------------------------------------------------------------------------
# Encryption helpers
# ---------------------------------------------------------------------------

def _get_fernet() -> Fernet:
    """Retrieve the Fernet instance using CONNECTOR_ENCRYPTION_KEY."""
    key = os.environ.get("CONNECTOR_ENCRYPTION_KEY")
    if not key:
        raise RuntimeError(
            "CONNECTOR_ENCRYPTION_KEY environment variable is not set. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_token(plaintext: str) -> str:
    """Encrypt a token string using Fernet symmetric encryption."""
    f = _get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a token string using Fernet symmetric encryption."""
    f = _get_fernet()
    return f.decrypt(ciphertext.encode()).decode()


# ---------------------------------------------------------------------------
# Supabase client
# ---------------------------------------------------------------------------

def _get_supabase() -> "Client":
    """Return a Supabase client for user_connectors operations."""
    if not SUPABASE_AVAILABLE:
        raise RuntimeError("supabase package is not installed")
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not key:
        raise RuntimeError("Supabase URL and key must be set in environment")
    return create_client(url, key)


# ---------------------------------------------------------------------------
# Token CRUD
# ---------------------------------------------------------------------------

def get_tokens(user_id: str, connector_type: str) -> Optional[Dict[str, Any]]:
    """Fetch and decrypt tokens for a user/connector pair.

    Returns:
        Dict with 'access_token', 'refresh_token', 'token_expires_at', 'scopes',
        'metadata', 'is_active', 'id' — or None if not found.
    """
    sb = _get_supabase()
    
    # First, let's debug what we're querying
    print(f"🔍 Querying tokens: user_id={user_id}, connector_type={connector_type}")
    
    resp = (
        sb.table("user_connectors")
        .select("*")
        .eq("user_id", user_id)
        .eq("connector_type", connector_type)
        .eq("is_active", True)
        .execute()
    )

    if not resp.data:
        print(f"📭 No active connection found in DB for {user_id}/{connector_type}")
        print(f"   Response data: {resp.data}")
        
        # Try without is_active filter to debug
        resp_all = (
            sb.table("user_connectors")
            .select("*")
            .eq("user_id", user_id)
            .eq("connector_type", connector_type)
            .execute()
        )
        if resp_all.data:
            print(f"   ⚠️  Found records WITHOUT is_active filter: {[{'is_active': r.get('is_active'), 'created_at': r.get('created_at')} for r in resp_all.data]}")
        return None

    print(f"📬 Found connection in DB for {user_id}/{connector_type}")
    row = resp.data[0]
    result: Dict[str, Any] = {
        "id": row["id"],
        "connector_type": row["connector_type"],
        "display_name": row["display_name"],
        "is_active": row["is_active"],
        "scopes": row.get("scopes"),
        "metadata": row.get("metadata", {}),
        "token_expires_at": row.get("token_expires_at"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }

    # Decrypt tokens
    if row.get("access_token"):
        try:
            result["access_token"] = decrypt_token(row["access_token"])
            print(f"✅ Successfully decrypted access token for {user_id}/{connector_type}")
        except Exception:
            print(f"❌ Failed to decrypt access token for {user_id}/{connector_type}")
            result["access_token"] = None

    if row.get("refresh_token"):
        try:
            result["refresh_token"] = decrypt_token(row["refresh_token"])
        except Exception:
            result["refresh_token"] = None

    return result


def save_tokens(
    user_id: str,
    connector_type: str,
    access_token: str,
    refresh_token: Optional[str] = None,
    token_expires_at: Optional[str] = None,
    scopes: Optional[list] = None,
    metadata: Optional[dict] = None,
):
    """Encrypt and upsert tokens for a user/connector pair.

    Uses the unique constraint (user_id, connector_type) for conflict resolution.
    """
    sb = _get_supabase()
    config = get_connector_config(connector_type)

    row = {
        "user_id": user_id,
        "connector_type": connector_type,
        "display_name": config["name"],
        "access_token": encrypt_token(access_token),
        "is_active": True,
    }

    if refresh_token:
        row["refresh_token"] = encrypt_token(refresh_token)
    if token_expires_at:
        row["token_expires_at"] = token_expires_at
    if scopes is not None:
        row["scopes"] = scopes
    if metadata is not None:
        row["metadata"] = metadata

    # Upsert (insert or update on conflict)
    print(f"💾 Saving tokens for {user_id}/{connector_type} (is_active=True)")
    resp = (
        sb.table("user_connectors")
        .upsert(row, on_conflict="user_id,connector_type")
        .execute()
    )
    
    if resp.data:
        print(f"✅ Tokens saved successfully for {user_id}/{connector_type}")
    else:
        print(f"⚠️  Upsert response empty for {user_id}/{connector_type}")

    return resp.data[0] if resp.data else row


def delete_tokens(user_id: str, connector_type: str):
    """Delete (deactivate) a connector for a user.

    Sets is_active = false and clears tokens rather than hard deleting,
    preserving audit trail.
    """
    sb = _get_supabase()
    resp = (
        sb.table("user_connectors")
        .update({
            "is_active": False,
            "access_token": None,
            "refresh_token": None,
            "token_expires_at": None,
        })
        .eq("user_id", user_id)
        .eq("connector_type", connector_type)
        .execute()
    )
    return bool(resp.data)


def list_user_connectors(user_id: str):
    """List all connectors for a user (active and inactive)."""
    sb = _get_supabase()
    resp = (
        sb.table("user_connectors")
        .select("id, connector_type, display_name, is_active, scopes, metadata, token_expires_at, created_at, updated_at")
        .eq("user_id", user_id)
        .execute()
    )
    return resp.data or []


# ---------------------------------------------------------------------------
# Token refresh
# ---------------------------------------------------------------------------

def is_token_expired(token_data):
    """Check if the access token has expired (with 5-minute buffer)."""
    expires_at = token_data.get("token_expires_at")
    if not expires_at:
        return False  # Tokens without expiry (e.g. Slack bot tokens) don't expire

    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))

    buffer = timedelta(minutes=5)
    return datetime.now(timezone.utc) >= (expires_at - buffer)


async def refresh_token_if_needed(user_id: str, connector_type: str):
    """Auto-refresh the access token if it is expired.

    Returns:
        The (possibly refreshed) access token, or None on failure.
    """
    print(f"🔄 refresh_token_if_needed called: user_id={user_id}, connector_type={connector_type}")
    token_data = get_tokens(user_id, connector_type)
    if not token_data:
        print(f"❌ get_tokens() returned None for {user_id}/{connector_type}")
        print(f"   This likely means no is_active=True record exists in user_connectors table")
        return None

    print(f"✅ get_tokens() returned data for {user_id}/{connector_type}")
    access_token = token_data.get("access_token")
    
    if not access_token:
        print(f"⚠️  Token data exists but access_token is missing!")
        return None

    if not is_token_expired(token_data):
        print(f"✅ Token still valid (not expired) for {user_id}/{connector_type}")
        return access_token

    print(f"⏰ Token expired for {user_id}/{connector_type}, attempting refresh")
    refresh_token = token_data.get("refresh_token")
    if not refresh_token:
        print(f"⚠️  Token expired for {connector_type} but no refresh token available")
        return None

    config = get_connector_config(connector_type)
    provider = config["oauth_provider"]

    try:
        if provider == "google":
            new_tokens = await _refresh_google_token(refresh_token)
        elif provider == "microsoft":
            new_tokens = await _refresh_microsoft_token(refresh_token, connector_type)
        elif provider == "slack":
            # Slack bot tokens don't expire
            return access_token
        else:
            print(f"⚠️  Unknown OAuth provider: {provider}")
            return None

        if new_tokens:
            expires_at = None
            if new_tokens.get("expires_in"):
                expires_at = (
                    datetime.now(timezone.utc)
                    + timedelta(seconds=new_tokens["expires_in"])
                ).isoformat()

            save_tokens(
                user_id=user_id,
                connector_type=connector_type,
                access_token=new_tokens["access_token"],
                refresh_token=new_tokens.get("refresh_token", refresh_token),
                token_expires_at=expires_at,
            )
            print(f"✅ Token refreshed for {connector_type}")
            return new_tokens["access_token"]

    except Exception as e:
        print(f"❌ Token refresh failed for {connector_type}: {str(e)}")

    return None


async def _refresh_google_token(refresh_token: str):
    """Refresh a Google OAuth2 token."""
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")

    if not client_id or not client_secret:
        raise RuntimeError("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        resp.raise_for_status()
        return resp.json()


async def _refresh_microsoft_token(
    refresh_token: str, connector_type: str
):
    """Refresh a Microsoft OAuth2 token."""
    client_id = os.environ.get("MICROSOFT_CLIENT_ID")
    client_secret = os.environ.get("MICROSOFT_CLIENT_SECRET")
    tenant_id = os.environ.get("MICROSOFT_TENANT_ID", "common")

    if not client_id or not client_secret:
        raise RuntimeError("MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET must be set")

    config = get_connector_config(connector_type)
    scopes = " ".join(config["oauth_scopes"])

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
                "scope": scopes,
            },
        )
        resp.raise_for_status()
        return resp.json()


# ---------------------------------------------------------------------------
# Token revocation
# ---------------------------------------------------------------------------

async def revoke_token(user_id: str, connector_type: str):
    """Revoke tokens at the provider and delete locally.

    Returns True if successful (or revocation not supported).
    """
    token_data = get_tokens(user_id, connector_type)
    if not token_data:
        return True  # Nothing to revoke

    config = get_connector_config(connector_type)
    revoke_url = config.get("revoke_url")

    if revoke_url and token_data.get("access_token"):
        try:
            async with httpx.AsyncClient() as client:
                if config["oauth_provider"] == "google":
                    await client.post(
                        revoke_url,
                        params={"token": token_data["access_token"]},
                    )
                elif config["oauth_provider"] == "slack":
                    await client.post(
                        revoke_url,
                        headers={"Authorization": f"Bearer {token_data['access_token']}"},
                    )
                print(f"✅ Token revoked at provider for {connector_type}")
        except Exception as e:
            print(f"⚠️  Provider revocation failed for {connector_type}: {str(e)}")
            # Continue with local deletion anyway

    # Delete locally
    delete_tokens(user_id, connector_type)
    return True
