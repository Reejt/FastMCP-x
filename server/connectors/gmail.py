"""
Gmail API Async Wrapper

Provides async functions for searching and reading emails.
Uses Gmail REST API v1.
"""

import base64
import httpx
from typing import List, Dict, Any, Optional


BASE_URL = "https://gmail.googleapis.com/gmail/v1"
TIMEOUT = 30.0


async def search_emails(
    query: str,
    access_token: str,
    max_results: int = 10,
):
    """Search Gmail messages matching a query.

    Args:
        query: Gmail search query string (supports Gmail search operators)
        access_token: OAuth2 access token
        max_results: Maximum number of results to return

    Returns:
        List of email result dicts with title, content, author, date, url
    """
    headers = {"Authorization": f"Bearer {access_token}"}

    # Step 1: Search for message IDs
    params = {
        "q": query,
        "maxResults": min(max_results, 50),
    }

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get(
            f"{BASE_URL}/users/me/messages",
            headers=headers,
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()

    message_ids = [msg["id"] for msg in data.get("messages", [])]

    # If no results and no 'in:' operator was used, try inbox as fallback
    if not message_ids and "in:" not in query.lower():
        print(f"⚠️  No results for '{query}', trying inbox fallback")
        fallback_query = f"in:inbox {query}".strip()
        params["q"] = fallback_query
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(
                f"{BASE_URL}/users/me/messages",
                headers=headers,
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()
        message_ids = [msg["id"] for msg in data.get("messages", [])]

    if not message_ids:
        return []

    # Step 2: Fetch message details for each ID
    results = []
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for msg_id in message_ids[:max_results]:
            try:
                detail = await _get_message_detail(client, msg_id, access_token)
                if detail:
                    # Fetch full message data and extract body
                    resp = await client.get(
                        f"{BASE_URL}/users/me/messages/{msg_id}",
                        headers={"Authorization": f"Bearer {access_token}"},
                        params={"format": "full"},
                    )
                    resp.raise_for_status()
                    message_data = resp.json()
                    full_content = _extract_body(message_data)
                    detail["content"] = full_content if full_content else detail["content"]
                    results.append(detail)
            except Exception as e:
                print(f"⚠️  Error fetching Gmail message {msg_id}: {str(e)}")

    return results


async def get_email_content(
    email_id: str,
    access_token: str,
):
    """Read the full content of a Gmail message.

    Args:
        email_id: The Gmail message ID
        access_token: OAuth2 access token

    Returns:
        Email content as text, or None on failure
    """
    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get(
            f"{BASE_URL}/users/me/messages/{email_id}",
            headers=headers,
            params={"format": "full"},
        )
        resp.raise_for_status()
        data = resp.json()

    return _extract_body(data)


async def _get_message_detail(
    client: httpx.AsyncClient,
    msg_id: str,
    access_token: str,
):
    """Fetch and parse a single Gmail message.

    Args:
        client: httpx AsyncClient instance
        msg_id: Gmail message ID
        access_token: OAuth2 access token

    Returns:
        Parsed message dict or None
    """
    headers = {"Authorization": f"Bearer {access_token}"}

    resp = await client.get(
        f"{BASE_URL}/users/me/messages/{msg_id}",
        headers=headers,
        params={"format": "metadata", "metadataHeaders": ["Subject", "From", "Date", "To"]},
    )
    resp.raise_for_status()
    data = resp.json()

    # Extract headers
    headers_list = data.get("payload", {}).get("headers", [])
    header_map = {h["name"].lower(): h["value"] for h in headers_list}

    subject = header_map.get("subject", "(No Subject)")
    from_addr = header_map.get("from", "")
    date = header_map.get("date", "")
    to_addr = header_map.get("to", "")
    snippet = data.get("snippet", "")

    # Build Gmail web URL
    url = f"https://mail.google.com/mail/u/0/#inbox/{msg_id}"

    return {
        "title": subject,
        "content": snippet,
        "from": from_addr,
        "to": to_addr,
        "author": from_addr,
        "date": date,
        "url": url,
        "email_id": msg_id,
        "labels": data.get("labelIds", []),
    }


def _extract_body(message_data: Dict):
    """Extract the text body from a full Gmail message payload."""
    payload = message_data.get("payload", {})

    # Try to get plain text part
    if payload.get("mimeType") == "text/plain":
        body_data = payload.get("body", {}).get("data", "")
        if body_data:
            return base64.urlsafe_b64decode(body_data).decode("utf-8", errors="replace")

    # Check parts for multipart messages
    parts = payload.get("parts", [])
    for part in parts:
        if part.get("mimeType") == "text/plain":
            body_data = part.get("body", {}).get("data", "")
            if body_data:
                return base64.urlsafe_b64decode(body_data).decode("utf-8", errors="replace")

    # Fallback to snippet
    return message_data.get("snippet", "")
