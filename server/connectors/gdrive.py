"""
Google Drive API Async Wrapper

Provides async functions for searching Drive files and reading document content.
Uses Google Drive REST API v3.
"""

import httpx
from typing import List, Dict, Any, Optional


# MIME type mapping for Google Workspace files
GOOGLE_WORKSPACE_MIME_TYPES = {
    "document": "application/vnd.google-apps.document",
    "spreadsheet": "application/vnd.google-apps.spreadsheet",
    "presentation": "application/vnd.google-apps.presentation",
    "pdf": "application/pdf",
}

# Export formats for Google Workspace files
EXPORT_MIME_TYPES = {
    "application/vnd.google-apps.document": "text/plain",
    "application/vnd.google-apps.spreadsheet": "text/csv",
    "application/vnd.google-apps.presentation": "text/plain",
}

BASE_URL = "https://www.googleapis.com/drive/v3"
TIMEOUT = 30.0


async def search_drive(
    query: str,
    access_token: str,
    max_results: int = 10,
    file_type: Optional[str] = None,
):
    """Search Google Drive for files matching a query.

    Args:
        query: Search query (Google Drive query syntax or natural text)
        access_token: OAuth2 access token
        max_results: Maximum number of results to return
        file_type: Optional filter (document, spreadsheet, presentation, pdf)

    Returns:
        List of file result dicts with title, snippet, url, date, file_type
    """
    headers = {"Authorization": f"Bearer {access_token}"}

    # Build Drive API query string
    drive_query_parts = []

    # If query looks like Drive query syntax, use it directly
    if any(op in query for op in ["name contains", "fullText contains", "mimeType ="]):
        drive_query = query
    else:
        # Convert natural language to Drive query
        drive_query_parts.append(f"fullText contains '{_escape_query(query)}'")

    # Apply file type filter
    if file_type and file_type in GOOGLE_WORKSPACE_MIME_TYPES:
        drive_query_parts.append(f"mimeType = '{GOOGLE_WORKSPACE_MIME_TYPES[file_type]}'")

    # Exclude trashed files
    drive_query_parts.append("trashed = false")

    drive_query = " and ".join(drive_query_parts) if drive_query_parts else query

    params = {
        "q": drive_query,
        "pageSize": min(max_results, 50),
        "fields": "files(id,name,mimeType,modifiedTime,webViewLink,description,size,owners)",
        "orderBy": "relevance",
    }

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get(
            f"{BASE_URL}/files",
            headers=headers,
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()

    files = data.get("files", [])
    results = []

    for f in files:
        owner = ""
        if f.get("owners"):
            owner = f["owners"][0].get("displayName", "")

        result = {
            "title": f.get("name", "Untitled"),
            "url": f.get("webViewLink", ""),
            "date": f.get("modifiedTime", ""),
            "content": f.get("description", ""),
            "file_type": _friendly_mime_type(f.get("mimeType", "")),
            "author": owner,
            "file_id": f.get("id"),
            "size": f.get("size"),
        }
        results.append(result)

    # Optionally fetch content snippets for top results
    if results and len(results) <= 5:
        for result in results[:3]:  # Read content of top 3 files
            try:
                content = await get_file_content(
                    result["file_id"], access_token, result.get("file_type")
                )
                if content:
                    result["content"] = content[:500]  # Truncate for context
            except Exception:
                pass  # Content fetch is best-effort

    return results


async def get_file_content(
    file_id: str, access_token: str, mime_type: Optional[str] = None
):
    """Read the text content of a Google Drive file.

    For Google Workspace files (Docs, Sheets, Slides), exports as plain text.
    For other files, downloads the raw content.

    Args:
        file_id: The Google Drive file ID
        access_token: OAuth2 access token
        mime_type: Optional MIME type hint

    Returns:
        File content as text, or None on failure
    """
    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        # First, get file metadata to determine type
        if not mime_type:
            meta_resp = await client.get(
                f"{BASE_URL}/files/{file_id}",
                headers=headers,
                params={"fields": "mimeType"},
            )
            meta_resp.raise_for_status()
            mime_type = meta_resp.json().get("mimeType", "")

        # Google Workspace files need to be exported
        if mime_type in EXPORT_MIME_TYPES:
            export_mime = EXPORT_MIME_TYPES[mime_type]
            resp = await client.get(
                f"{BASE_URL}/files/{file_id}/export",
                headers=headers,
                params={"mimeType": export_mime},
            )
        else:
            # Regular files - download content
            resp = await client.get(
                f"{BASE_URL}/files/{file_id}",
                headers=headers,
                params={"alt": "media"},
            )

        if resp.status_code == 200:
            return resp.text[:10000]  # Limit content size
        return None


def _escape_query(query: str) -> str:
    """Escape single quotes for Google Drive query syntax."""
    return query.replace("'", "\\'")


def _friendly_mime_type(mime_type: str) -> str:
    """Convert MIME type to a user-friendly label."""
    mapping = {
        "application/vnd.google-apps.document": "Google Doc",
        "application/vnd.google-apps.spreadsheet": "Google Sheet",
        "application/vnd.google-apps.presentation": "Google Slides",
        "application/pdf": "PDF",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
        "text/plain": "Text",
        "image/png": "Image (PNG)",
        "image/jpeg": "Image (JPEG)",
    }
    return mapping.get(mime_type, mime_type.split("/")[-1] if "/" in mime_type else mime_type)
