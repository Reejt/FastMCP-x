"""
Slack API Async Wrapper

Provides async functions for searching messages and reading channel history.
Uses Slack Web API.
"""

import json
import httpx
from typing import List, Dict, Any, Optional
from server.query_handler import query_model


BASE_URL = "https://slack.com/api"
TIMEOUT = 30.0


async def refine_search_query(query: str):
    """Use LLM to extract key search terms from a natural language query.
    
    Converts "What did John say about the project?" into 
    ["john", "project", "say"] for better keyword matching.
    
    Args:
        query: Natural language search query
        
    Returns:
        List of key search terms
    """
    prompt = (
        "Extract 3-5 key search terms from this query. "
        "Return ONLY a JSON list of lowercase terms, no other text.\n\n"
        f"Query: \"{query}\"\n\n"
        "Example: [\"john\", \"project\", \"update\"]\n\n"
        "Return ONLY the JSON array:"
    )
    
    try:
        response = await query_model(prompt)
        if not response:
            # Fallback: split query into words
            return query.lower().split()
        
        # Parse JSON from LLM response
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
        
        terms = json.loads(cleaned)
        print(f"🔍 Slack query refined to terms: {terms}")
        return terms
        
    except Exception as e:
        print(f"⚠️  Query refinement error: {str(e)}, falling back to word split")
        # Fallback: split into words
        return [w.lower() for w in query.split() if len(w) > 2]


async def search_messages(
    query: str,
    bot_token: str,
    team_id: Optional[str] = None,
    count: int = 20,
    sort: str = "score",
    sort_dir: str = "desc",
):
    """Search Slack messages by listing recent messages from channels.

    Uses conversations.history instead of search.messages API because:
    - More reliable (doesn't depend on workspace search permissions)
    - Doesn't require search:read.public scope
    - Works even if workspace blocks the search API

    Args:
        query: Search query string (used to filter results locally)
        bot_token: Slack bot OAuth token (xoxb-*)
        team_id: Optional team ID for filtering
        count: Number of results to return
        sort: Sort by 'score' or 'timestamp'
        sort_dir: 'asc' or 'desc'

    Returns:
        List of message result dicts with title, content, author, channel, date, url
    """
    # Debug: check token type
    token_type = "BOT" if bot_token.startswith("xoxb-") else "USER" if bot_token.startswith("xoxp-") else "UNKNOWN"
    print(f"🔐 Slack search_messages called with {token_type} token: {bot_token[:15]}...")
    print(f"🔍 Searching for: '{query}'")
    
    if token_type == "USER":
        print(f"❌ ERROR: Using USER token (xoxp-*) instead of BOT token (xoxb-*)")
        raise RuntimeError("Bot token (xoxb-*) is required for Slack API calls")
    
    # Step 0: Refine query using LLM to extract key search terms
    print(f"🧠 Refining query with LLM...")
    search_terms = await refine_search_query(query)
    print(f"📌 Extracted search terms: {search_terms}")
    
    # Step 1: List all channels the bot can access
    print(f"📋 Fetching channel list for search...")
    channels = await list_channels(bot_token=bot_token, limit=50)
    print(f"✅ Found {len(channels)} channels: {[ch.get('name') for ch in channels]}")
    
    # Step 2: Get recent messages from each channel and filter locally
    all_results = []
    total_messages_scanned = 0
    
    for channel in channels:
        channel_id = channel.get("id")
        channel_name = channel.get("name", "unknown")
        
        try:
            # Get recent messages from this channel
            messages = await get_channel_history(
                channel_id=channel_id,
                bot_token=bot_token,
                limit=100  # Get more messages to search
            )
            
            print(f"  📨 Channel #{channel_name}: {len(messages)} messages retrieved")
            total_messages_scanned += len(messages)
            
            # Filter messages using LLM-refined search terms
            for msg in messages:
                content = msg.get("content", "").lower()
                author = msg.get("author", "").lower()
                
                # Skip empty messages
                if not content.strip():
                    continue
                
                # Match using multiple strategies:
                # 1. At least one search term in content
                # 2. Search term in author
                is_match = (any(term in content for term in search_terms) or
                           any(term in author for term in search_terms))
                
                if is_match:
                    # Calculate match score (how many terms matched)
                    term_matches = sum(1 for term in search_terms if term in content)
                    author_matches = sum(1 for term in search_terms if term in author)
                    score = term_matches + (author_matches * 0.5)
                    
                    result = {
                        "title": f"Message in #{channel_name}",
                        "content": msg.get("content", ""),
                        "author": author,
                        "channel": channel_name,
                        "date": msg.get("date", ""),
                        "type": "message",
                        "score": score,  # For sorting
                    }
                    all_results.append(result)
                    print(f"    ✓ Match found: {content[:60]}... (score: {score:.1f})")
                    
        except Exception as e:
            print(f"⚠️  Failed to get history from #{channel_name}: {str(e)}")
            continue
    
    # Sort results by score (most relevant first)
    all_results.sort(key=lambda x: x.get("score", 0), reverse=True)
    
    # Remove score from results before returning
    for result in all_results:
        del result["score"]
    
    # Return top results
    print(f"✅ Scanned {total_messages_scanned} total messages across {len(channels)} channels")
    print(f"✅ Found {len(all_results)} matching messages")
    
    if len(all_results) == 0:
        print(f"ℹ️  No messages matched. Please try different keywords.")
    
    return all_results[:count]


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
        # Extract message text - try multiple fields for compatibility
        text = msg.get("text", "")
        
        # Handle threaded messages
        if not text and "thread_ts" in msg:
            text = "[Thread message - text not available]"
        
        # Handle bot messages
        if not text and msg.get("type") == "message" and "bot_id" in msg:
            text = msg.get("attachments", [{}])[0].get("text", "[Bot message]")
        
        # Skip empty messages
        if text and text.strip():
            result = {
                "content": text,
                "author": msg.get("user", msg.get("bot_id", "unknown")),
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
