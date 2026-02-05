"""
Search Decision Engine

Determines whether web search is needed for a given query using:
1. LLM-based decision (primary method)
2. Heuristic fallback (backup method)
"""

import json
import re
from datetime import datetime
from typing import Dict, List, Optional
import requests
import os
from server.query_handler import query_model


class SearchDecisionEngine:
    """Decides when to trigger web search based on query analysis."""

    # Temporal indicators for heuristic fallback
    TEMPORAL_PATTERNS = [
        r'\b(current|currently|latest|recent|recently|now|today|tonight|tomorrow)\b',
        r'\b(202[4-9]|203[0-9])\b',  # Years 2024-2039
        r'\b(this\s+(?:year|month|week|season))\b',
        r'\b(who\s+is\s+the\s+current|who\s+is\s+still|what\s+is\s+the\s+latest)\b',
        r'\b(breaking\s+news|news\s+about|report\s+on|update\s+on)\b'
    ]

    # Real-time data patterns
    REALTIME_PATTERNS = [
        r'\b(stock\s+price|cryptocurrency|bitcoin|ethereum|weather|temperature|exchange\s+rate|sports\s+score|game\s+result)\b',
        r'\b(happening\s+now|breaking\s+news|live\s+updates|right\s+now|this\s+moment)\b',
        r'\b(current\s+(?:price|rate|status|condition))\b'
    ]

    # Position/role queries
    POSITION_PATTERNS = [
        r'\b(who\s+is\s+the|current\s+\w+\s+of)\b',
        r'\b(CEO|president|leader|director|minister|senator|governor|mayor)\s+of\b',
        r'\b(won|won\s+the|became\s+the|elected\s+as)\b'
    ]

    # Explicit search request keywords
    SEARCH_REQUEST_PATTERNS = [
        r'\b(search\s+for|search\s+about|find\s+online|look\s+up|find\s+information\s+about)\b',
        r'\b(tell\s+me\s+about|what\s+is|who\s+is|where\s+is|when\s+did)\s+\w+\s+\w+',  # Multi-word queries often need search
        r'\b(how\s+to|how\s+can\s+i|help\s+me)\b',
        r'\b(research|investigate|fact-?check|verify)\b'
    ]

    # Event/trend patterns
    EVENT_PATTERNS = [
        r'\b(election|protest|incident|event|conference|summit|festival|tournament|championship)\b',
        r'\b(launch|release|announcement|statement|press\s+release)\b',
        r'\b(scandal|controversy|investigation|crisis)\b',
    ]

    # News/media keywords that indicate desire for current info
    MEDIA_PATTERNS = [
        r'\b(news|article|report|story|interview|documentary|podcast)\b',
        r'\b(trending|viral|popular|famous|celebrity|public\s+figure)\b',
    ]

    def __init__(self, ollama_base_url: str = None, knowledge_cutoff: str = "December 2023"):
        """
        Initialize the search decision engine.

        Args:
            ollama_base_url: Base URL for Ollama API (default: from env or localhost)
            knowledge_cutoff: Model's knowledge cutoff date (default: December 2023)
        """
        self.ollama_base_url = ollama_base_url or os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
        self.knowledge_cutoff = knowledge_cutoff
        self.current_date = datetime.now().strftime("%B %d, %Y")

    async def should_search(
        self,
        user_query: str,
        conversation_history: Optional[List[Dict]] = None
    ):
        """
        Determine if web search is needed for the query.

        Args:
            user_query: The user's question/message
            conversation_history: Optional conversation context

        Returns:
            Dict with:
                - needs_search (bool): Whether to trigger web search
                - reasoning (str): Explanation for the decision
                - confidence (float): Confidence in the decision (0-1)
                - method (str): 'llm' or 'heuristic'
        """
        # Try LLM-based decision first (with better error tolerance)
        try:
            llm_decision = await self._llm_decision(user_query, conversation_history)
            if llm_decision:
                print(f"✅ LLM decision: {llm_decision['needs_search']} (confidence: {llm_decision['confidence']:.2f})")
                return llm_decision
            else:
                print(f"⚠️  LLM decision returned None, using heuristic fallback")
        except Exception as e:
            print(f"⚠️  LLM decision failed ({type(e).__name__}), falling back to heuristic")

        # Fallback to heuristic method (which is now more aggressive)
        heuristic_decision = self._heuristic_decision(user_query)
        print(f"📋 Heuristic decision: {heuristic_decision['needs_search']} (confidence: {heuristic_decision['confidence']:.2f})")
        return heuristic_decision

    async def _llm_decision(
        self,
        user_query: str,
        conversation_history: Optional[List[Dict]] = None
    ):
        """
        Use LLM to decide if web search is needed.

        Returns:
            Decision dict or None if LLM call fails
        """
        prompt = f"""You are a search decision system. Decide if this query needs current web information.

Current date: {self.current_date}
Knowledge cutoff: {self.knowledge_cutoff}

User query: "{user_query}"

Criteria for web search (be INCLUSIVE - prefer web search for any query that might benefit from current information):

✓ SEARCH FOR (these definitely need web search):
- Current events, news, breaking news
- Recently released products, movies, music, books
- Current positions/roles (who is the current CEO, president, etc)
- Real-time data (stocks, weather, sports scores, cryptocurrency)
- Events happening now or recently
- Trending topics, viral content, popular figures
- Technical/product information that changes frequently
- Company information, funding news, mergers
- Research papers, studies, statistics from recent years
- Any query with temporal keywords: current, latest, recent, now, today, 2024+
- Explicit search requests: "search for", "find out about", "tell me about X"
- Complex multi-word queries asking "what is", "who is", "when did", "where is"

✗ DON'T SEARCH FOR (these are safe to answer without search):
- Timeless concepts (math, physics, philosophy, definitions)
- Historical facts (events before 2020)
- General knowledge about established topics
- How-to guides, tutorials, explanations
- Creative writing, brainstorming
- Personal identity questions

When in doubt, PREFER SEARCH - it's better to search unnecessarily than to miss current information.

Respond ONLY with valid JSON (no markdown, no extra text):
{{
  "needs_search": true or false,
  "reasoning": "Brief explanation (1 sentence)",
  "confidence": 0.0 to 1.0
}}"""

        try:
            # Use query_model() instead of direct requests.post
            llm_output = await query_model(
                user_prompt=prompt,
                model_name='llama3.2:3b',
                stream=False,
                timeout=30  # Increased timeout for decision making
            )

            if not llm_output:
                return None

            # Parse JSON response
            # Remove markdown code blocks if present
            llm_output = re.sub(r'```json\s*|\s*```', '', llm_output)
            decision_data = json.loads(llm_output)

            # Validate structure
            if not all(k in decision_data for k in ['needs_search', 'reasoning', 'confidence']):
                return None

            return {
                'needs_search': bool(decision_data['needs_search']),
                'reasoning': decision_data['reasoning'],
                'confidence': float(decision_data['confidence']),
                'method': 'llm'
            }

        except Exception as e:
            print(f"Error in LLM decision: {e}")
            return None

    def _heuristic_decision(self, user_query: str) -> Dict:
        """
        Use regex heuristics to decide if web search is needed.

        Returns:
            Decision dict with heuristic-based decision
        """
        query_lower = user_query.lower()

        # Check temporal patterns
        temporal_match = any(
            re.search(pattern, query_lower, re.IGNORECASE)
            for pattern in self.TEMPORAL_PATTERNS
        )

        # Check real-time data patterns
        realtime_match = any(
            re.search(pattern, query_lower, re.IGNORECASE)
            for pattern in self.REALTIME_PATTERNS
        )

        # Check position/role patterns
        position_match = any(
            re.search(pattern, query_lower, re.IGNORECASE)
            for pattern in self.POSITION_PATTERNS
        )

        # Check explicit search request keywords
        search_request_match = any(
            re.search(pattern, query_lower, re.IGNORECASE)
            for pattern in self.SEARCH_REQUEST_PATTERNS
        )

        # Check event/trend patterns
        event_match = any(
            re.search(pattern, query_lower, re.IGNORECASE)
            for pattern in self.EVENT_PATTERNS
        )

        # Check news/media keywords
        media_match = any(
            re.search(pattern, query_lower, re.IGNORECASE)
            for pattern in self.MEDIA_PATTERNS
        )

        # Calculate confidence based on number of matching patterns
        pattern_matches = sum([
            temporal_match,
            realtime_match,
            position_match,
            search_request_match,
            event_match,
            media_match
        ])

        # Decide: search if any strong indicators are present
        # ✅ More aggressive: require only 1 match for general web search
        needs_search = (
            temporal_match or 
            realtime_match or 
            position_match or 
            search_request_match or 
            event_match or 
            media_match or
            # Additional heuristic: longer queries (10+ words) suggesting explanatory intent
            len(user_query.split()) >= 10
        )

        # Build reasoning message
        reasons = []
        if temporal_match:
            reasons.append("temporal indicators detected")
        if realtime_match:
            reasons.append("real-time data query")
        if position_match:
            reasons.append("position/role query")
        if search_request_match:
            reasons.append("explicit search request")
        if event_match:
            reasons.append("event/trend query")
        if media_match:
            reasons.append("news/media content")
        if not reasons and len(user_query.split()) >= 10:
            reasons.append("complex multi-word query")

        reasoning = ", ".join(reasons) if reasons else "no search criteria matched"

        # ✅ Higher confidence when multiple patterns match
        # Single strong pattern = 0.8, multiple patterns = 0.9+
        if pattern_matches >= 2:
            confidence = 0.9
        elif needs_search:
            confidence = 0.85
        else:
            confidence = 0.4  # Lower confidence when heuristics say no search

        return {
            'needs_search': needs_search,
            'reasoning': reasoning,
            'confidence': confidence,
            'method': 'heuristic'
        }
