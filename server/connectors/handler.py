"""
ConnectorHandler — Singleton Orchestrator

Responsible for:
- Token retrieval and refresh
- Query routing to provider-specific API wrappers
- Rate limiting per (user_id, connector_type)
- Error handling with exponential backoff
- LLM summarization of connector results

Follows the get_enhanced_search() singleton pattern.
"""

import asyncio
import time
import json
import re
from typing import Dict, List, Optional, Any
from collections import defaultdict

from server.connectors import CONNECTOR_REGISTRY, get_connector_config
from server.connectors.oauth import (
    get_tokens,
    refresh_token_if_needed,
    list_user_connectors,
)
from server.connectors.decision import get_decision_engine
from server.query_handler import query_model


# ---------------------------------------------------------------------------
# Rate limiter (token bucket per user+connector)
# ---------------------------------------------------------------------------

class TokenBucketRateLimiter:
    """Simple token bucket rate limiter per (user_id, connector_type)."""

    def __init__(self, rate: float = 10.0, capacity: float = 30.0):
        """
        Args:
            rate: Tokens added per second
            capacity: Maximum tokens in bucket
        """
        self.rate = rate
        self.capacity = capacity
        self._buckets: Dict[str, Dict[str, float]] = {}

    def _get_bucket(self, key: str):
        if key not in self._buckets:
            self._buckets[key] = {
                "tokens": self.capacity,
                "last_refill": time.monotonic(),
            }
        return self._buckets[key]

    def allow(self, user_id: str, connector_type: str):
        """Check if a request is allowed and consume a token."""
        key = f"{user_id}:{connector_type}"
        bucket = self._get_bucket(key)

        now = time.monotonic()
        elapsed = now - bucket["last_refill"]
        bucket["tokens"] = min(self.capacity, bucket["tokens"] + elapsed * self.rate)
        bucket["last_refill"] = now

        if bucket["tokens"] >= 1.0:
            bucket["tokens"] -= 1.0
            return True
        return False


# ---------------------------------------------------------------------------
# ConnectorHandler
# ---------------------------------------------------------------------------

class ConnectorHandler:
    """Main handler for connector queries — singleton orchestrator."""

    def __init__(self):
        self.decision_engine = get_decision_engine()
        self.rate_limiter = TokenBucketRateLimiter(rate=10.0, capacity=30.0)

    async def query_connector(
        self,
        user_id: str,
        connector_type: str,
        natural_language_query: str,
        conversation_history: Optional[List[Dict]] = None,
    ):
        """Execute a connector query end-to-end.

        Flow:
        1. Validate connector type
        2. Check rate limit
        3. Retrieve & refresh tokens
        4. Translate query via decision engine
        5. Call provider-specific API wrapper
        6. Format results as XML context
        7. Summarize with LLM

        Args:
            user_id: The user's UUID
            connector_type: e.g. 'gdrive', 'slack', 'gmail', 'onedrive'
            natural_language_query: The user's natural language query
            conversation_history: Optional conversation history

        Returns:
            Dict with 'response', 'source', 'results_count'
        """
        # 1. Validate connector type
        if connector_type not in CONNECTOR_REGISTRY:
            return {
                "response": f"Unknown connector: {connector_type}. Supported: {list(CONNECTOR_REGISTRY.keys())}",
                "source": None,
                "results_count": 0,
                "error": True,
            }

        config = get_connector_config(connector_type)

        # 2. Rate limiting
        if not self.rate_limiter.allow(user_id, connector_type):
            return {
                "response": f"Rate limit exceeded for {config['name']}. Please wait a moment and try again.",
                "source": connector_type,
                "results_count": 0,
                "error": True,
            }

        # 3. Retrieve & refresh tokens
        print(f"🔑 Checking tokens for {user_id} / {connector_type}")
        access_token = await refresh_token_if_needed(user_id, connector_type)
        if not access_token:
            print(f"❌ No valid token found for {user_id} / {connector_type} - auth required")
            return {
                "response": None,
                "source": connector_type,
                "results_count": 0,
                "error": True,
                "auth_required": True,
            }
        print(f"✅ Valid token found for {user_id} / {connector_type} - proceeding with query")

        # 4. Translate query
        api_params = await self.decision_engine.translate_query(
            connector_type, natural_language_query, conversation_history
        )
        print(f"🔄 Connector {connector_type} API params: {json.dumps(api_params, default=str)}")

        # 5. Call provider-specific API wrapper
        try:
            results = await self._call_provider(
                connector_type, access_token, api_params, user_id
            )
            print(f"✅ Provider call succeeded for {connector_type}, got {len(results)} results")
        except Exception as e:
            print(f"❌ Connector API error ({connector_type}): {str(e)}")
            return {
                "response": f"Error querying {config['name']}: {str(e)}",
                "source": connector_type,
                "results_count": 0,
                "error": True,
            }

        # 6. Format results as XML context
        xml_context = self.decision_engine.format_results_as_context(
            connector_type,
            config["name"],
            results,
            natural_language_query,
        )

        # 7. Summarize with LLM
        llm_response = await self._summarize_with_llm(
            connector_type,
            config["name"],
            natural_language_query,
            xml_context,
            conversation_history,
        )

        final_result = {
            "response": llm_response,
            "source": connector_type,
            "source_name": config["name"],
            "results_count": len(results),
            "error": False,
        }
        print(f"✅ Handler returning result for {connector_type}: auth_required={final_result.get('auth_required')}, error={final_result.get('error')}")
        return final_result

    async def _call_provider(
        self,
        connector_type: str,
        access_token: str,
        api_params: Dict[str, Any],
        user_id: str,
    ):
        """Route to the appropriate provider API wrapper.

        Implements retry with exponential backoff on transient failures.
        """
        max_retries = 2
        backoff_base = 1.0

        for attempt in range(max_retries + 1):
            try:
                if connector_type == "gdrive":
                    from server.connectors.gdrive import search_drive, get_file_content
                    results = await search_drive(
                        query=api_params.get("search_query", ""),
                        access_token=access_token,
                        max_results=api_params.get("max_results", 10),
                        file_type=api_params.get("file_type"),
                    )
                    return results

                elif connector_type == "slack":
                    from server.connectors.slack import search_messages
                    token_data = get_tokens(user_id, connector_type)
                    team_id = token_data.get("metadata", {}).get("team_id") if token_data else None
                    access_token_preview = access_token[:10] + "..." if access_token else None
                    print(f"🔑 Slack API call:")
                    print(f"   Access token type: {access_token_preview}")
                    print(f"   Token scopes: {token_data.get('scopes') if token_data else 'NONE'}")
                    print(f"   Team ID: {team_id}")
                    results = await search_messages(
                        query=api_params.get("search_query", ""),
                        bot_token=access_token,
                        team_id=team_id,
                        count=api_params.get("count", 20),
                        sort=api_params.get("sort", "score"),
                        sort_dir=api_params.get("sort_dir", "desc"),
                    )
                    return results

                elif connector_type == "gmail":
                    from server.connectors.gmail import search_emails
                    results = await search_emails(
                        query=api_params.get("search_query", ""),
                        access_token=access_token,
                        max_results=api_params.get("max_results", 10),
                    )
                    return results

                elif connector_type == "onedrive":
                    from server.connectors.onedrive import search_files
                    results = await search_files(
                        query=api_params.get("search_query", ""),
                        access_token=access_token,
                        max_results=api_params.get("max_results", 10),
                    )
                    return results

                else:
                    return []

            except Exception as e:
                if attempt < max_retries:
                    wait_time = backoff_base * (2 ** attempt)
                    print(f"⚠️  Retry {attempt + 1}/{max_retries} for {connector_type} in {wait_time}s: {str(e)}")
                    await asyncio.sleep(wait_time)
                else:
                    raise

        return []

    async def _summarize_with_llm(
        self,
        connector_type: str,
        connector_name: str,
        query: str,
        xml_context: str,
        conversation_history: Optional[List[Dict]] = None,
    ):
        """Summarize connector results using the LLM.

        Follows the same pattern as EnhancedWebSearch LLM summarization.
        """
        history_text = ""
        if conversation_history:
            recent = conversation_history[-6:]
            lines = []
            for msg in recent:
                role = msg.get("role", "user")
                content = msg.get("content", "")[:300]
                lines.append(f"{role}: {content}")
            history_text = "\nConversation history:\n" + "\n".join(lines) + "\n"

        prompt = (
            f"You are a helpful assistant that answers questions using data from {connector_name}.\n"
            f"The user asked: \"{query}\"\n"
            f"{history_text}\n"
            f"Here are the results from {connector_name}:\n\n"
            f"{xml_context}\n\n"
            f"Instructions:\n"
            f"- Provide a clear, concise summary of the results\n"
            f"- Reference specific items (titles, authors, dates) when relevant\n"
            f"- If no results were found, say so clearly and suggest alternatives\n"
            f"- Do NOT mention XML tags or the technical format of the data\n"
            f"- Write in a helpful, conversational tone\n"
        )

        try:
            response = await query_model(prompt)
            return response or f"I found results from {connector_name} but couldn't generate a summary."
        except Exception as e:
            print(f"❌ LLM summarization error: {str(e)}")
            return f"I found results from {connector_name} but encountered an error generating the summary."


# ---------------------------------------------------------------------------
# @mention parsing
# ---------------------------------------------------------------------------

CONNECTOR_MENTION_PATTERN = re.compile(r"^@(\w+)\s+(.*)", re.DOTALL)


def parse_connector_mention(query: str):
    """Parse a @connector_type query string.

    Args:
        query: The full query string (e.g., '@gdrive quarterly report')

    Returns:
        Dict with 'connector_type' and 'query', or None if no mention found
    """
    match = CONNECTOR_MENTION_PATTERN.match(query.strip())
    if not match:
        return None

    connector_type = match.group(1).lower()
    remaining_query = match.group(2).strip()

    if connector_type in CONNECTOR_REGISTRY:
        return {
            "connector_type": connector_type,
            "query": remaining_query,
        }

    return None


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_handler: Optional[ConnectorHandler] = None


def get_connector_handler() -> ConnectorHandler:
    """Get or create the singleton ConnectorHandler."""
    global _handler
    if _handler is None:
        _handler = ConnectorHandler()
    return _handler
