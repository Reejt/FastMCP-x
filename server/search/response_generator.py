"""
Response Formatting Helpers

Simple helpers for formatting search results with citations for LLM responses.
"""

from typing import List, Dict, Optional
from datetime import datetime


def build_system_prompt(knowledge_cutoff: str = "January 2025"):
    """
    Build system prompt for response generation with search results.

    Returns:
        System prompt string
    """
    current_date = datetime.now().strftime("%B %d, %Y")
    
    return f"""You are a helpful AI assistant with access to web search.

Current date: {current_date}
Your knowledge cutoff: {knowledge_cutoff}

When search results are provided in <search_results> tags:
1. Use them to give accurate, up-to-date answers
2. Cite sources naturally in your response:
   - "According to {{source_name}}, ..."
   - "Based on recent reports from {{source}}, ..."
   - "{{source_name}} reports that ..."
   - "Research from {{source}} shows that ..."
3. Synthesize information from multiple sources when relevant
4. If sources conflict, mention both perspectives
5. Prioritize recent, authoritative sources
6. NEVER quote more than 10-15 words verbatim
7. Always paraphrase in your own words

When URL content is provided in <url_content> tags:
1. Analyze the specific page content provided
2. Reference the URL explicitly: "In the article from {{url}}, ..."
3. Summarize key points clearly
4. Quote sparingly (max 15 words per quote)

If no search results are provided, answer from your training knowledge.

Guidelines:
- Be conversational and natural
- Don't say "according to the search results" (too robotic)
- Integrate citations smoothly into your response
- Don't list sources separately at the end (weave them in)
- If you're unsure, say so
- After answering, you may provide inline source links at the end in parentheses"""


def format_search_results(search_results: List[Dict]):
    """
    Format search results as XML for LLM context.

    Args:
        search_results: List of search results

    Returns:
        Formatted XML string
    """
    if not search_results:
        return ""

    xml_parts = ["<search_results>"]

    for idx, result in enumerate(search_results):
        url = result.get('url', '')
        title = result.get('title', 'No title')
        snippet = result.get('content', result.get('snippet', ''))
        date = result.get('published_date', result.get('date', 'Unknown date'))

        # Extract domain name for citation
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            domain = parsed.netloc.replace('www.', '')
        except Exception:
            domain = url

        xml_parts.append(f"""
<result index="{idx}">
<source>{domain}</source>
<url>{url}</url>
<title>{title}</title>
<date>{date}</date>
<snippet>{snippet}</snippet>
</result>""")

    xml_parts.append("</search_results>")

    return "\n".join(xml_parts)


def format_url_content(url_results: List[Dict]):
    """
    Format fetched URL content as XML for LLM context.

    Args:
        url_results: List of fetched URL content dicts

    Returns:
        Formatted XML string
    """
    if not url_results:
        return ""

    xml_parts = ["<url_content>"]

    for result in url_results:
        if not result.get('success'):
            continue

        url = result.get('url', '')
        title = result.get('title', 'No title')
        text = result.get('text', '')

        # Limit content length
        max_length = 3000
        if len(text) > max_length:
            text = text[:max_length] + "...(truncated)"

        xml_parts.append(f"""
<url>
<location>{url}</location>
<title>{title}</title>
<content>
{text}
</content>
</url>""")

    xml_parts.append("</url_content>")

    return "\n".join(xml_parts)


def build_prompt(
    user_query: str,
    search_results: Optional[List[Dict]] = None,
    url_content: Optional[List[Dict]] = None,
    include_both: bool = False
):
    """
    Build complete prompt for LLM with search context.

    Args:
        user_query: User's question
        search_results: List of search results (optional)
        url_content: List of fetched URL content (optional)
        include_both: If True, include both search and URL content

    Returns:
        Complete prompt string
    """
    prompt_parts = []

    # Add search results context
    if search_results:
        search_context = format_search_results(search_results)
        prompt_parts.append(search_context)

    # Add URL content context
    if url_content and (include_both or not search_results):
        url_context = format_url_content(url_content)
        prompt_parts.append(url_context)

    # Add user question
    prompt_parts.append(f"\nUser question: {user_query}")

    return "\n\n".join(prompt_parts)
