"""
Slack API Async Wrapper

Provides async functions for searching messages and reading channel history.
Uses Slack Web API.
"""

import httpx
from typing import List, Dict, Any, Optional


BASE_URL = "https://slack.com/api"
TIMEOUT = 30.0


async def search_messages(
    query: str,
    bot_token: str,
    team_id: Optional[str] = None,
    count: int = 20,
    sort: str = "score",
    sort_dir: str = "desc",
):
    """Search Slack messages across channels.

    Args:
        query: Slack search query string
        bot_token: Slack bot/user OAuth token
        team_id: Optional team ID for filtering
        count: Number of results to return
        sort: Sort by 'score' or 'timestamp'
        sort_dir: 'asc' or 'desc'

    Returns:
        List of message result dicts with title, content, author, channel, date, url
    """
    headers = {"Authorization": f"Bearer {bot_token}"}

    params = {
        "query": query,
        "count": min(count, 100),
        "sort": sort,
        "sort_dir": sort_dir,
    }

    if team_id:
        params["team_id"] = team_id

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get(
            f"{BASE_URL}/search.messages",
            headers=headers,
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()

    if not data.get("ok"):
        error = data.get("error", "Unknown Slack API error")
        raise RuntimeError(f"Slack API error: {error}")

    messages = data.get("messages", {}).get("matches", [])
    results = []

    for msg in messages:
        channel_info = msg.get("channel", {})
        channel_name = channel_info.get("name", "") if isinstance(channel_info, dict) else ""

        result = {
            "title": f"Message in #{channel_name}" if channel_name else "Slack Message",
            "content": msg.get("text", ""),
            "author": msg.get("username", msg.get("user", "")),
            "channel": channel_name,
            "date": msg.get("ts", ""),
            "url": msg.get("permalink", ""),
        }
        results.append(result)

    # Get list of available channels
    channels = await list_channels(bot_token=bot_token, limit=100)
    
    # Extract unique channel IDs from search results and get their history
    channel_ids = set()
    for msg in messages:
        channel_info = msg.get("channel", {})
        if isinstance(channel_info, dict) and channel_info.get("id"):
            channel_ids.add(channel_info.get("id"))
    
    # Fetch history for relevant channels (limit to top 5)
    for channel_id in list(channel_ids)[:5]:
        try:
            history = await get_channel_history(channel_id=channel_id, bot_token=bot_token, limit=10)
            # Attach channel history metadata to results
            for i, msg in enumerate(results):
                if msg.get("channel"):
                    # Find matching channel and attach its history
                    matching_channel = next((ch for ch in channels if ch.get("name") == msg.get("channel")), None)
                    if matching_channel:
                        results[i]["channel_info"] = matching_channel
                        results[i]["recent_history_count"] = len(history)
        except Exception:
            # Continue if history fetch fails for a channel
            pass

    return results


async def get_channel_history(
    channel_id: str,
    bot_token: str,
    limit: int = 50,
):
    """Get recent messages from a Slack channel.

    Args:
        channel_id: The Slack channel ID
        bot_token: Slack bot/user OAuth token
        limit: Maximum number of messages to return

    Returns:
        List of message dicts with content, author, date
    """
    headers = {"Authorization": f"Bearer {bot_token}"}

    params = {
        "channel": channel_id,
        "limit": min(limit, 200),
    }

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get(
            f"{BASE_URL}/conversations.history",
            headers=headers,
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()

    if not data.get("ok"):
        error = data.get("error", "Unknown Slack API error")
        raise RuntimeError(f"Slack API error: {error}")

    messages = data.get("messages", [])
    results = []

    for msg in messages:
        result = {
            "content": msg.get("text", ""),
            "author": msg.get("user", ""),
            "date": msg.get("ts", ""),
            "type": msg.get("type", "message"),
        }
        results.append(result)

    return results


async def list_channels(
    bot_token: str,
    limit: int = 100,
):
    """List available Slack channels.

    Args:
        bot_token: Slack bot/user OAuth token
        limit: Maximum number of channels to return

    Returns:
        List of channel dicts with id, name, topic, member_count
    """
    headers = {"Authorization": f"Bearer {bot_token}"}

    params = {
        "limit": min(limit, 200),
        "types": "public_channel,private_channel",
    }

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get(
            f"{BASE_URL}/conversations.list",
            headers=headers,
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()

    if not data.get("ok"):
        error = data.get("error", "Unknown Slack API error")
        raise RuntimeError(f"Slack API error: {error}")

    channels = data.get("channels", [])
    return [
        {
            "id": ch.get("id"),
            "name": ch.get("name"),
            "topic": ch.get("topic", {}).get("value", ""),
            "member_count": ch.get("num_members", 0),
        }
        for ch in channels
    ]
