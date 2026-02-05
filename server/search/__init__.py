"""
Search module for transparent web search integration.

Simplified components:
- decision: Search decision engine (when to search)
- url_fetcher: Fetches and extracts content from URLs (explicit URLs)

Note: Query optimization and result ranking delegated to Tavily API.
Citation formatting handled by response_formatter module.
"""

from .decision import SearchDecisionEngine
from .url_fetcher import URLFetcher

__all__ = [
    'SearchDecisionEngine',
    'URLFetcher'
]
