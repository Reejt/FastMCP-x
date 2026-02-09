"""
OneDrive / Microsoft Graph API Async Wrapper

Provides async functions for searching files and reading document content.
Uses Microsoft Graph API v1.0.
"""

import httpx
from typing import List, Dict, Any, Optional


BASE_URL = "https://graph.microsoft.com/v1.0"
TIMEOUT = 30.0


async def search_files(
    query: str,
    access_token: str,
    max_results: int = 10,
):
    """Search OneDrive files matching a query.

    Uses the Microsoft Graph search API for keyword search across
    file names and content.

    Args:
        query: Search query string
        access_token: OAuth2 access token
        max_results: Maximum number of results to return

    Returns:
        List of file result dicts with title, url, date, file_type, content
    """
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    # Use Microsoft Graph search API
    search_body = {
        "requests": [
            {
                "entityTypes": ["driveItem"],
                "query": {
                    "queryString": query,
                },
                "from": 0,
                "size": min(max_results, 25),
            }
        ]
    }

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.post(
            f"{BASE_URL}/search/query",
            headers=headers,
            json=search_body,
        )
        resp.raise_for_status()
        data = resp.json()

    results = []
    hits_containers = data.get("value", [])

    for container in hits_containers:
        hits = container.get("hitsContainers", [{}])
        for hit_container in hits:
            for hit in hit_container.get("hits", []):
                resource = hit.get("resource", {})
                result = _parse_drive_item(resource)
                if result:
                    results.append(result)

    # Optionally fetch content for top results
    if results and len(results) <= 5:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            for result in results[:3]:
                try:
                    content = await _get_file_content_internal(
                        client, result.get("item_id"), access_token
                    )
                    if content:
                        result["content"] = content[:500]
                except Exception:
                    pass  # Content fetch is best-effort

    return results


async def get_file_content(
    file_id: str,
    access_token: str,
):
    """Read the text content of a OneDrive file.

    Args:
        file_id: The OneDrive item ID
        access_token: OAuth2 access token

    Returns:
        File content as text, or None on failure
    """
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        return await _get_file_content_internal(client, file_id, access_token)


async def _get_file_content_internal(
    client: httpx.AsyncClient,
    file_id: str,
    access_token: str,
):
    """Internal helper to download file content.

    Args:
        client: httpx AsyncClient instance
        file_id: The OneDrive item ID
        access_token: OAuth2 access token

    Returns:
        File content as text, or None
    """
    if not file_id:
        return None

    headers = {"Authorization": f"Bearer {access_token}"}

    # Get download URL
    resp = await client.get(
        f"{BASE_URL}/me/drive/items/{file_id}/content",
        headers=headers,
        follow_redirects=True,
    )

    if resp.status_code == 200:
        # Try to decode as text
        try:
            return resp.text[:10000]
        except Exception:
            return None

    return None


async def list_recent_files(
    access_token: str,
    max_results: int = 20,
):
    """List recently modified files in OneDrive.

    Args:
        access_token: OAuth2 access token
        max_results: Maximum number of results

    Returns:
        List of file result dicts
    """
    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get(
            f"{BASE_URL}/me/drive/recent",
            headers=headers,
            params={"$top": min(max_results, 50)},
        )
        resp.raise_for_status()
        data = resp.json()

    results = []
    for item in data.get("value", []):
        result = _parse_drive_item(item)
        if result:
            results.append(result)

    return results


def _parse_drive_item(item: Dict[str, Any]):
    """Parse a Microsoft Graph driveItem into a standardized result dict.

    Args:
        item: Raw driveItem from Microsoft Graph API

    Returns:
        Standardized result dict or None
    """
    if not item:
        return None

    name = item.get("name", "Untitled")
    web_url = item.get("webUrl", "")
    last_modified = item.get("lastModifiedDateTime", "")
    size = item.get("size")

    # Get file type from name extension
    file_type = ""
    if "." in name:
        file_type = name.rsplit(".", 1)[-1].upper()

    # Get author
    author = ""
    last_modified_by = item.get("lastModifiedBy", {})
    if last_modified_by:
        user = last_modified_by.get("user", {})
        author = user.get("displayName", "")

    # Get summary/description
    content = item.get("summary", item.get("description", ""))

    return {
        "title": name,
        "url": web_url,
        "date": last_modified,
        "file_type": file_type,
        "author": author,
        "content": content,
        "size": size,
        "item_id": item.get("id"),
    }
