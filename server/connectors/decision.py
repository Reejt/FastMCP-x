"""
Connector Decision Engine

LLM-powered routing that translates natural language queries into
provider-specific API call parameters.

Follows the same pattern as SearchDecisionEngine in server/search/decision.py.
"""

import json
from typing import Dict, List, Optional, Any
from server.query_handler import query_model


class ConnectorDecisionEngine:
    """Translates natural language to provider-specific API calls using LLM."""

    # Provider-specific system prompts for query translation
    PROVIDER_PROMPTS: Dict[str, str] = {
        "gdrive": (
            "You are an API query translator for Google Drive. "
            "Given a natural language query, output a JSON object with:\n"
            "- search_query: Google Drive search query string (using Drive query syntax)\n"
            "- max_results: number of results to return (default 10)\n"
            "- file_type: optional filter (document, spreadsheet, presentation, pdf, or null)\n\n"
            "Google Drive query syntax tips:\n"
            "- name contains 'term' for filename search\n"
            "- fullText contains 'term' for content search\n"
            "- mimeType = 'application/vnd.google-apps.document' for Google Docs\n"
            "- modifiedTime > '2024-01-01' for date filtering\n\n"
            "Respond with ONLY valid JSON, no other text."
        ),
        "slack": (
            "You are an API query translator for Slack. "
            "Given a natural language query, output a JSON object with:\n"
            "- search_query: Slack search query string\n"
            "- count: number of results to return (default 20)\n"
            "- sort: 'timestamp' or 'score' (default 'score')\n"
            "- sort_dir: 'asc' or 'desc' (default 'desc')\n\n"
            "Slack search syntax tips:\n"
            "- in:#channel to search in specific channel\n"
            "- from:@user to search messages from user\n"
            "- has:link for messages with links\n"
            "- before:2024-01-01 or after:2024-01-01 for date filtering\n\n"
            "Respond with ONLY valid JSON, no other text."
        ),
        "gmail": (
            "You are an API query translator for Gmail. "
            "Given a natural language query, output a JSON object with:\n"
            "- search_query: Gmail search query string (using Gmail search operators)\n"
            "- max_results: number of results to return (default 10, max 50)\n\n"
            "Gmail search syntax rules:\n"
            "- from:person@email.com OR from:person for sender filtering\n"
            "- to:person@email.com for recipient filtering\n"
            "- subject:keyword for subject search\n"
            "- is:unread for unread emails\n"
            "- is:starred for starred emails\n"
            "- has:attachment for emails with attachments\n"
            "- in:inbox OR in:sent OR in:draft for label filtering\n"
            "- newer_than:1d or older_than:1m for date filtering (use: 1d, 1w, 1m, 1y)\n"
            "- 'text query' for keyword search\n\n"
            "EXAMPLES:\n"
            "- 'emails from john' -> from:john\n"
            "- 'unread emails' -> in:inbox is:unread\n"
            "- 'emails today' -> in:inbox newer_than:1d\n"
            "- 'mails from slice' -> from:slice\n"
            "- 'inbox summary' -> in:inbox\n"
            "- 'emails with attachment' -> has:attachment\n\n"
            "DEFAULT: If no specific operator fits, search the inbox: in:inbox\n\n"
            "Respond with ONLY valid JSON, no other text."
        ),
        "onedrive": (
            "You are an API query translator for Microsoft OneDrive. "
            "Given a natural language query, output a JSON object with:\n"
            "- search_query: OneDrive search query string\n"
            "- max_results: number of results to return (default 10)\n"
            "- file_type: optional filter (docx, xlsx, pptx, pdf, or null)\n\n"
            "OneDrive uses the Microsoft Graph search API which supports "
            "keyword search across file names and content.\n\n"
            "Respond with ONLY valid JSON, no other text."
        ),
    }

    async def translate_query(
        self,
        connector_type: str,
        natural_language_query: str,
        conversation_history: Optional[List[Dict]] = None,
    ):
        """Translate a natural language query to provider-specific API parameters.

        Args:
            connector_type: The connector identifier (e.g., 'gdrive')
            natural_language_query: The user's natural language query
            conversation_history: Optional conversation history for context

        Returns:
            Dict with provider-specific API parameters
        """
        system_prompt = self.PROVIDER_PROMPTS.get(connector_type)
        if not system_prompt:
            # Fallback: return the query as-is
            return {"search_query": natural_language_query, "max_results": 10}

        # Build prompt with conversation context
        prompt_parts = [system_prompt, "\n\nUser query: " + natural_language_query]

        if conversation_history:
            recent = conversation_history[-4:]  # Last 4 messages for context
            context_lines = []
            for msg in recent:
                role = msg.get("role", "user")
                content = msg.get("content", "")[:200]
                context_lines.append(f"{role}: {content}")
            prompt_parts.insert(1, "\n\nRecent conversation context:\n" + "\n".join(context_lines))

        full_prompt = "".join(prompt_parts)

        try:
            response = await query_model(full_prompt)
            if not response:
                print(f"⚠️  Decision engine empty response for {connector_type}")
                return {"search_query": natural_language_query, "max_results": 10}

            # Parse JSON from LLM response
            # Strip markdown code fences if present
            cleaned = response.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()

            params = json.loads(cleaned)
            print(f"✅ {connector_type} query translated: {params.get('search_query', '')}")
            return params

        except (json.JSONDecodeError, ValueError) as e:
            print(f"⚠️  Decision engine JSON parse error for {connector_type}: {str(e)}")
            print(f"   Raw response: {response[:200] if response else 'None'}")
            # Fallback to raw query
            return {"search_query": natural_language_query, "max_results": 10}
        except Exception as e:
            print(f"❌ Decision engine error for {connector_type}: {str(e)}")
            return {"search_query": natural_language_query, "max_results": 10}

    def format_results_as_context(
        self,
        connector_type: str,
        connector_name: str,
        results: List[Dict[str, Any]],
        query: str,
    ):
        """Format connector results as XML context for LLM summarization.

        Follows the same pattern as EnhancedWebSearch XML context formatting.

        Args:
            connector_type: The connector identifier
            connector_name: The display name of the connector
            results: List of result dicts from the connector API wrapper
            query: The original user query

        Returns:
            XML-formatted context string for LLM prompt
        """
        if not results:
            return f'<connector_results source="{connector_name}">No results found for "{query}"</connector_results>'

        items = []
        for i, result in enumerate(results[:10], 1):  # Limit to 10 results
            item_parts = [f"  <result rank=\"{i}\">"]

            # Common fields across connectors
            if result.get("title"):
                item_parts.append(f"    <title>{result['title']}</title>")
            if result.get("snippet") or result.get("content"):
                content = result.get("snippet") or result.get("content", "")
                # Truncate long content
                if len(content) > 500:
                    content = content[:500] + "..."
                item_parts.append(f"    <content>{content}</content>")
            if result.get("url") or result.get("link"):
                item_parts.append(f"    <url>{result.get('url') or result.get('link')}</url>")
            if result.get("date") or result.get("timestamp"):
                item_parts.append(f"    <date>{result.get('date') or result.get('timestamp')}</date>")
            if result.get("author") or result.get("from"):
                item_parts.append(f"    <author>{result.get('author') or result.get('from')}</author>")
            if result.get("channel"):
                item_parts.append(f"    <channel>{result['channel']}</channel>")

            item_parts.append("  </result>")
            items.append("\n".join(item_parts))

        results_xml = "\n".join(items)
        return (
            f'<connector_results source="{connector_name}" count="{len(results)}">\n'
            f"{results_xml}\n"
            f"</connector_results>"
        )


# Singleton instance
_decision_engine: Optional[ConnectorDecisionEngine] = None


def get_decision_engine() -> ConnectorDecisionEngine:
    """Get or create the singleton ConnectorDecisionEngine."""
    global _decision_engine
    if _decision_engine is None:
        _decision_engine = ConnectorDecisionEngine()
    return _decision_engine
