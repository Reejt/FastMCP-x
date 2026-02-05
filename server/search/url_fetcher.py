"""
URL Fetcher

Fetches and extracts content from explicit URLs provided by users.

Methods:
1. HTTP Request (fast, 80% of cases) - aiohttp + BeautifulSoup
2. Headless Browser (slower, 20% of cases) - Playwright (for JS-heavy sites)

Content extraction:
- Removes navigation, footer, ads, scripts
- Extracts main content area
- Limits to 5000 characters for LLM context
"""

import re
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse
from typing import Dict, List, Optional, Tuple


class URLFetcher:
    """Fetches and extracts content from URLs."""

    # URL detection pattern
    URL_PATTERN = r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+'

    # Content extraction limits
    MAX_CONTENT_LENGTH = 5000
    MAX_URLS_PER_REQUEST = 3

    def __init__(self, timeout: int = 10):
        """
        Initialize the URL fetcher.

        Args:
            timeout: Max wait time in seconds for HTTP requests (default: 10)
        """
        self.timeout = timeout
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive'
        }

    def extract_urls(self, text: str):
        """
        Extract URLs from text.

        Args:
            text: Input text potentially containing URLs

        Returns:
            List of URLs (max 3)
        """
        urls = re.findall(self.URL_PATTERN, text)
        return urls[:self.MAX_URLS_PER_REQUEST]

    def fetch_url(self, url: str):
        """
        Fetch and extract content from a single URL.

        Args:
            url: The URL to fetch

        Returns:
            Dict with:
                - url: Original URL
                - title: Page title
                - text: Extracted main content (cleaned)
                - method: 'http' or 'browser'
                - success: Boolean
                - error: Error message (if failed)
        """
        # Try HTTP method first (fast)
        success, content = self._fetch_http(url)

        if success:
            return {
                'url': url,
                'title': content.get('title', 'No title'),
                'text': content.get('text', ''),
                'method': 'http',
                'success': True,
                'error': None
            }

        # If HTTP failed, could try browser method here (not implemented in this phase)
        # For now, return error
        return {
            'url': url,
            'title': '',
            'text': '',
            'method': 'http',
            'success': False,
            'error': content if isinstance(content, str) else 'Failed to fetch content'
        }

    def fetch_multiple_urls(self, urls: List[str]):
        """
        Fetch content from multiple URLs.

        Args:
            urls: List of URLs to fetch

        Returns:
            List of result dicts
        """
        results = []
        for url in urls[:self.MAX_URLS_PER_REQUEST]:
            result = self.fetch_url(url)
            results.append(result)
        return results

    def _fetch_http(self, url: str):
        """
        Fetch URL content using HTTP request.

        Returns:
            Tuple: (success: bool, content_dict or error_message)
        """
        try:
            # Make GET request
            response = requests.get(
                url,
                headers=self.headers,
                timeout=self.timeout,
                allow_redirects=True
            )
            response.raise_for_status()

            # Parse HTML
            soup = BeautifulSoup(response.content, 'html.parser')

            # Extract title
            title_tag = soup.find('title')
            title = title_tag.get_text().strip() if title_tag else 'No title'

            # Extract main content
            text = self._extract_content(soup)

            # Check if we got substantial content
            if len(text) < 200:
                return (False, "Insufficient content from URL")

            return (True, {'title': title, 'text': text})

        except requests.exceptions.Timeout:
            return (False, "Request timeout - page took too long to load")
        except requests.exceptions.ConnectionError:
            return (False, "Connection failed - could not reach the server")
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                return (False, "Page not found (404)")
            elif e.response.status_code == 403:
                return (False, "Access forbidden (403) - may require authentication")
            else:
                return (False, f"HTTP error {e.response.status_code}")
        except Exception as e:
            return (False, f"Error fetching URL: {str(e)}")

    def _extract_content(self, soup: BeautifulSoup):
        """
        Extract clean main content from parsed HTML.

        Args:
            soup: BeautifulSoup parsed HTML

        Returns:
            Extracted text content (cleaned, limited to MAX_CONTENT_LENGTH)
        """
        # Remove unwanted elements
        for element in soup(['script', 'style', 'nav', 'footer', 'aside', 'header']):
            element.decompose()

        # Remove ads, promos, social media widgets
        for class_name in ['ad', 'advertisement', 'promo', 'social', 'cookie', 'banner', 'popup']:
            for element in soup.find_all(class_=re.compile(class_name, re.I)):
                element.decompose()
            for element in soup.find_all(id=re.compile(class_name, re.I)):
                element.decompose()

        # Try to find main content area (priority order)
        content_areas = [
            soup.find('article'),
            soup.find('main'),
            soup.find(class_=re.compile(r'content|article|post', re.I)),
            soup.find(id=re.compile(r'content|article|post', re.I)),
            soup.find('body')
        ]

        # Use first available content area
        content = None
        for area in content_areas:
            if area:
                content = area
                break

        if not content:
            content = soup

        # Extract text from desired tags
        text_elements = []

        # Headings
        for heading in content.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']):
            text = heading.get_text().strip()
            if text:
                text_elements.append(f"\n{text}\n")

        # Paragraphs
        for p in content.find_all('p'):
            text = p.get_text().strip()
            if text and len(text) > 20:  # Filter very short paragraphs
                text_elements.append(text)

        # Lists
        for ul in content.find_all(['ul', 'ol']):
            for li in ul.find_all('li'):
                text = li.get_text().strip()
                if text:
                    text_elements.append(f"- {text}")

        # Combine and clean
        combined_text = '\n'.join(text_elements)

        # Clean whitespace
        combined_text = re.sub(r'\n{3,}', '\n\n', combined_text)  # Max 2 newlines
        combined_text = re.sub(r' {2,}', ' ', combined_text)  # Single spaces
        combined_text = combined_text.strip()

        # Limit length (truncate from middle to preserve start and end)
        if len(combined_text) > self.MAX_CONTENT_LENGTH:
            combined_text = self._truncate_middle(combined_text, self.MAX_CONTENT_LENGTH)

        return combined_text

    def _truncate_middle(self, text: str, max_length: int):
        """
        Truncate text from the middle while preserving start and end.

        Args:
            text: Text to truncate
            max_length: Maximum length

        Returns:
            Truncated text with ellipsis in middle
        """
        if len(text) <= max_length:
            return text

        # Keep 40% from start, 40% from end, 20% for ellipsis and buffer
        start_len = int(max_length * 0.4)
        end_len = int(max_length * 0.4)

        # Try to break at paragraph boundaries
        start_part = text[:start_len]
        end_part = text[-end_len:]

        # Find last newline in start part
        last_newline_start = start_part.rfind('\n\n')
        if last_newline_start > start_len * 0.7:  # If within last 30%
            start_part = start_part[:last_newline_start]

        # Find first newline in end part
        first_newline_end = end_part.find('\n\n')
        if first_newline_end != -1 and first_newline_end < end_len * 0.3:  # If within first 30%
            end_part = end_part[first_newline_end:]

        return f"{start_part}\n\n[... content truncated ...]\n\n{end_part}"

    def validate_url(self, url: str):
        """
        Validate if URL is properly formatted.

        Args:
            url: URL to validate

        Returns:
            True if valid, False otherwise
        """
        try:
            result = urlparse(url)
            return all([result.scheme, result.netloc])
        except Exception:
            return False

    def is_url_safe(self, url: str):
        """
        Check if URL is safe to fetch (basic checks).

        Args:
            url: URL to check

        Returns:
            Tuple: (is_safe: bool, reason: str)
        """
        # Check for known malicious patterns
        suspicious_patterns = [
            r'malware',
            r'phishing',
            r'javascript:',
            r'data:',
            r'file:',
        ]

        url_lower = url.lower()
        for pattern in suspicious_patterns:
            if re.search(pattern, url_lower):
                return (False, f"URL contains suspicious pattern: {pattern}")

        # Check domain blocklist
        blocklist = ['pinterest.com']  # Can expand this list
        parsed = urlparse(url)
        domain = parsed.netloc.lower()

        for blocked in blocklist:
            if blocked in domain:
                return (False, f"Domain is blocked: {blocked}")

        return (True, "URL appears safe")
