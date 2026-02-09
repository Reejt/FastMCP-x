"""
External Connectors — Registry & Exports

Central configuration for all supported external connectors.
Each connector is a read-only integration with an external productivity tool
(Google Drive, Slack, Gmail, OneDrive) that users can query via @mention syntax.
"""

from typing import Dict, Any

CONNECTOR_REGISTRY: Dict[str, Dict[str, Any]] = {
    "gdrive": {
        "name": "Google Drive",
        "description": "Search and read files from Google Drive",
        "api_type": "google_drive",
        "oauth_provider": "google",
        "oauth_scopes": ["https://www.googleapis.com/auth/drive.readonly"],
        "icon": "gdrive",
        "base_url": "https://www.googleapis.com/drive/v3",
        "token_url": "https://oauth2.googleapis.com/token",
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "revoke_url": "https://oauth2.googleapis.com/revoke",
    },
    "slack": {
        "name": "Slack",
        "description": "Search messages and channels in Slack",
        "api_type": "slack",
        "oauth_provider": "slack",
        "oauth_scopes": [
            "channels:history",
            "channels:read",
            "users:read",
            "users.profile:read",
            "search:read",
        ],
        "icon": "slack",
        "base_url": "https://slack.com/api",
        "token_url": "https://slack.com/api/oauth.v2.access",
        "auth_url": "https://slack.com/oauth/v2/authorize",
        "revoke_url": "https://slack.com/api/auth.revoke",
    },
    "gmail": {
        "name": "Gmail",
        "description": "Search and read emails from Gmail",
        "api_type": "gmail",
        "oauth_provider": "google",
        "oauth_scopes": ["https://www.googleapis.com/auth/gmail.readonly"],
        "icon": "gmail",
        "base_url": "https://gmail.googleapis.com/gmail/v1",
        "token_url": "https://oauth2.googleapis.com/token",
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "revoke_url": "https://oauth2.googleapis.com/revoke",
    },
    "onedrive": {
        "name": "OneDrive",
        "description": "Search and read files from OneDrive",
        "api_type": "microsoft_graph",
        "oauth_provider": "microsoft",
        "oauth_scopes": ["Files.Read.All", "Sites.Read.All"],
        "icon": "onedrive",
        "base_url": "https://graph.microsoft.com/v1.0",
        "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "auth_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "revoke_url": None,  # Microsoft doesn't have a simple revoke endpoint
    },
}


def get_connector_config(connector_type: str):
    """Get configuration for a connector type.

    Args:
        connector_type: The connector identifier (e.g., 'gdrive', 'slack')

    Returns:
        Connector configuration dict

    Raises:
        ValueError: If connector_type is not in the registry
    """
    if connector_type not in CONNECTOR_REGISTRY:
        raise ValueError(
            f"Unknown connector type: {connector_type}. "
            f"Supported: {list(CONNECTOR_REGISTRY.keys())}"
        )
    return CONNECTOR_REGISTRY[connector_type]


def list_connector_types():
    """Return list of all supported connector type identifiers."""
    return list(CONNECTOR_REGISTRY.keys())


def get_connector_display_info():
    """Return display-ready info for all connectors (for UI listing)."""
    return [
        {
            "type": ctype,
            "name": cfg["name"],
            "description": cfg["description"],
            "icon": cfg["icon"],
        }
        for ctype, cfg in CONNECTOR_REGISTRY.items()
    ]
