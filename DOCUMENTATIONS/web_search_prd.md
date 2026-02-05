# PRD: Transparent Web Search Integration for LLM Chat Interface

## Document Information
**Version:** 1.0  
**Last Updated:** February 2025  
**Owner:** Engineering Team  
**Status:** Ready for Implementation

---

## 1. Executive Summary

### Problem Statement
Our current web search implementation has reliability issues with result relevance. Users receive search results that don't adequately answer their questions, leading to poor user experience. The system needs to work like Claude or ChatGPT, where search happens transparently and intelligently in the background.

### Solution Overview
Implement a multi-layer search pipeline that:
1. Automatically decides when to search (without user intervention)
2. Optimizes search queries for better results
3. Scores and filters results for relevance
4. Handles explicit URL requests separately
5. Generates responses with natural source citations

### Success Metrics
- **Result Relevance:** >80% of search-triggered responses should use at least 2 sources
- **Search Precision:** <15% unnecessary search triggers
- **Response Quality:** User satisfaction score >4.2/5 for search-enhanced responses
- **Latency:** <5s end-to-end response time including search
- **Source Diversity:** >60% of responses cite multiple different domains

---

## 2. Background & Context

### Current State
- Web search integration exists but produces irrelevant results
- Search triggering logic works (intent classification functional)
- Issues stem from:
  - Poor search query formation (using raw user queries)
  - No result quality filtering
  - No relevance scoring
  - All results passed to LLM without curation

### User Impact
- Users get responses with citations that don't answer their question
- Loss of trust in system's ability to find current information
- Frustration when outdated or irrelevant sources are cited

### Competitive Analysis
- **Claude:** Seamless search integration, high-quality source selection, natural citations
- **ChatGPT:** Real-time browsing, good relevance filtering, multi-query search
- **Perplexity:** Excellent source diversity, inline citations, query decomposition

---

## 3. Goals & Non-Goals

### Goals
✅ Improve search result relevance by 70%+  
✅ Make web search completely transparent to users  
✅ Handle explicit URL requests (user provides a link)  
✅ Generate natural, conversational citations  
✅ Ensure source diversity (avoid single-source responses)  
✅ Maintain conversation context when searching  

### Non-Goals
❌ Build a custom search engine (use existing APIs: Bing/Brave)  
❌ Change the LLM model itself  
❌ Implement user-controlled "search mode"  
❌ Support image search (text-only for v1)  
❌ Real-time streaming search results (batch processing is fine)  

---

## 4. User Stories

### Story 1: Automatic Search for Current Events
**As a** user asking about recent news  
**I want** the system to automatically search the web  
**So that** I get accurate, up-to-date information without having to ask for it

**Acceptance Criteria:**
- User asks: "Who is the current CEO of Microsoft?"
- System automatically searches without user prompting
- Response cites recent, authoritative sources
- User doesn't know search happened unless they see citations

---

### Story 2: Relevant Results Only
**As a** user asking a factual question  
**I want** to receive only relevant search results  
**So that** citations actually support the answer

**Acceptance Criteria:**
- User asks: "What are the latest AI regulations in the EU?"
- System filters out irrelevant results (ads, spam, off-topic)
- Response uses only high-quality, relevant sources
- At least 2-3 different authoritative sources cited

---

### Story 3: URL Content Analysis
**As a** user sharing a URL  
**I want** the system to fetch and analyze that specific page  
**So that** I can discuss its contents

**Acceptance Criteria:**
- User says: "Summarize this article: https://example.com/article"
- System fetches the exact URL (not a web search)
- System extracts main content (removes ads, nav, footer)
- Response summarizes the actual page content

---

### Story 4: No Unnecessary Searches
**As a** user asking about timeless knowledge  
**I want** the system to answer from its training  
**So that** I get faster responses without unnecessary web searches

**Acceptance Criteria:**
- User asks: "Explain how photosynthesis works"
- System recognizes this doesn't need web search
- Response is generated from model knowledge
- No search API calls made (saves latency and cost)

---

## 5. Technical Architecture

### 5.1 System Flow Diagram
```
┌─────────────────────────────────────────────────────────────────┐
│                        User Sends Message                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────────┐
                    │  Extract URLs?     │
                    └────────┬───────────┘
                             │
                   ┌─────────┴─────────┐
                   │                   │
                YES│                   │NO
                   ▼                   ▼
          ┌─────────────────┐   ┌──────────────────────┐
          │  URL Fetcher    │   │ Search Decision      │
          │  - Fetch content│   │ (LLM-based)          │
          │  - Parse HTML   │   │ - Temporal queries?  │
          │  - Extract text │   │ - Knowledge cutoff?  │
          └────────┬────────┘   │ - Verifiable facts?  │
                   │            └──────────┬───────────┘
                   │                       │
                   │              ┌────────┴────────┐
                   │              │                 │
                   │          SEARCH            NO SEARCH
                   │              │                 │
                   │              ▼                 ▼
                   │     ┌─────────────────┐  ┌──────────────┐
                   │     │ Query Generator │  │   Generate   │
                   │     │ - Extract terms │  │   Response   │
                   │     │ - Add context   │  │ (from model) │
                   │     │ - 1-3 queries   │  └──────────────┘
                   │     └────────┬────────┘
                   │              │
                   │              ▼
                   │     ┌─────────────────┐
                   │     │  Execute Search │
                   │     │  - Parallel calls│
                   │     │  - Deduplicate  │
                   │     └────────┬────────┘
                   │              │
                   │              ▼
                   │     ┌─────────────────┐
                   │     │ Relevance Score │
                   │     │ - Semantic sim  │
                   │     │ - Source trust  │
                   │     │ - Freshness     │
                   │     │ - Quality check │
                   │     └────────┬────────┘
                   │              │
                   │              ▼
                   │     ┌─────────────────┐
                   │     │ Filter & Rank   │
                   │     │ - Top 5 results │
                   │     │ - Score > 0.35  │
                   │     │ - Diversify     │
                   │     └────────┬────────┘
                   │              │
                   └──────────────┼──────────────┐
                                  │              │
                                  ▼              ▼
                          ┌──────────────────────────┐
                          │   Generate Response      │
                          │   with Context           │
                          │   - Natural citations    │
                          │   - Synthesize sources   │
                          └──────────┬───────────────┘
                                     │
                                     ▼
                            ┌─────────────────┐
                            │ Return Response │
                            └─────────────────┘
```

### 5.2 Component Specifications

#### Component 1: Search Decision Engine

**Purpose:** Determine if web search is needed for a given query

**Inputs:**
- `user_query` (string): The user's message
- `conversation_history` (optional): Previous messages for context

**Outputs:**
- `needs_search` (boolean): Whether to trigger search
- `search_queries` (list): 1-3 optimized search queries
- `reasoning` (string): Why search was/wasn't triggered (for debugging)

**Logic:**
```python
Decision Criteria:
1. Temporal indicators present? ("current", "latest", "today", "2025", "recent")
2. Query about positions/roles? ("who is the CEO", "current president")
3. Real-time data? ("stock price", "weather", "score")
4. After knowledge cutoff? (anything post-January 2025)
5. Verifiable facts that change? (laws, policies, company status)

If ANY criteria met → needs_search = true
Otherwise → needs_search = false
```

**Implementation Options:**

**Option A: LLM-Based Decision (Recommended)**
```python
Prompt Template:
"""
You are deciding whether to use web search.
Current date: {today}
Knowledge cutoff: January 2025

User query: "{query}"

Criteria:
- Search if: after Jan 2025, current events, real-time data, 
  verifiable facts that may have changed
- Don't search if: timeless concepts, historical facts, 
  general knowledge, creative tasks

Output JSON:
{
  "needs_search": true/false,
  "reasoning": "brief explanation",
  "search_queries": ["query1", "query2"]
}
"""

Temperature: 0.2 (low for consistency)
Max tokens: 200
```

**Option B: Heuristic Fallback**
```python
Regex patterns:
- temporal: r'(current|latest|today|now|recent|2025|2026)'
- positions: r'(who is the|current \w+ of|still the)'
- realtime: r'(stock price|weather|exchange rate)'

If match → needs_search = true
```

**Error Handling:**
- If LLM decision fails, fallback to heuristics
- Log all decision failures for monitoring
- Default to NO SEARCH on ambiguous cases (prefer speed)

---

#### Component 2: Search Query Generator

**Purpose:** Convert user's conversational query into optimized search terms

**Inputs:**
- `user_query` (string): Raw user message
- `conversation_context` (optional): Recent conversation for pronoun resolution

**Outputs:**
- `search_queries` (list): 1-3 optimized search strings (2-6 words each)

**Transformation Rules:**

| User Query | Bad Search Query | Good Search Query |
|------------|------------------|-------------------|
| "Can you tell me about the latest AI developments?" | "Can you tell me about the latest AI developments" | "AI developments 2025" |
| "Who is the current CEO of Apple?" | "Who is the current CEO of Apple" | "Apple CEO 2025" |
| "What happened with OpenAI's leadership recently?" | "What happened with OpenAI's leadership recently" | "OpenAI leadership changes 2024" |
| "Is Sam Altman still running OpenAI?" | "Is Sam Altman still running OpenAI" | "Sam Altman OpenAI CEO" |

**Implementation:**
```python
Step 1: Remove conversational fluff
  - Strip: "can you", "please", "tell me", "what is", "how does"
  - Remove: question marks, excessive punctuation

Step 2: Extract key entities and concepts
  - Named entities (people, companies, places)
  - Core nouns and verbs
  - Keep: numbers, dates, specific terms

Step 3: Add temporal context
  - If temporal indicator → add "2025" or "2024"
  - If asking "current/latest" → add year

Step 4: Generate 1-3 variations (for complex queries)
  - Main query: core concept
  - Alternative: different angle or aspect
  - Specific: if asking multiple things

Max length per query: 6 words
Min length per query: 2 words
```

**Example Code:**
```python
def generate_search_queries(user_query: str) -> List[str]:
    # Option A: Use LLM (better quality)
    prompt = f"""Extract 1-3 concise search queries from this question.

User: "{user_query}"

Rules:
- 2-6 words per query
- Remove conversational words
- Add year if temporal (2025/2024)
- Focus on key entities and concepts

Output (one per line):
"""
    
    response = llm.generate(prompt, max_tokens=50, temperature=0.3)
    queries = parse_queries(response)
    
    # Option B: Fallback heuristic
    if not queries:
        queries = [heuristic_extract(user_query)]
    
    return queries[:3]  # Max 3 queries
```

---

#### Component 3: Relevance Scorer

**Purpose:** Score and filter search results for relevance to user query

**Inputs:**
- `user_query` (string): Original user question
- `search_results` (list): Raw results from search API
- `top_k` (int): Number of results to return (default: 5)

**Outputs:**
- `scored_results` (list): Top K results with relevance scores

**Scoring Formula:**
```
final_score = (semantic_similarity × 0.50) + 
              (source_trust × 0.25) + 
              (freshness × 0.15) + 
              (content_quality × 0.10)

Threshold for inclusion: final_score > 0.35
```

**Scoring Components:**

**A. Semantic Similarity (0-1, weight: 0.50)**
```python
Method: Sentence embeddings + cosine similarity

Model: sentence-transformers/all-MiniLM-L6-v2
  - Fast inference (~20ms per encoding)
  - Good quality for semantic matching
  - 384-dimensional embeddings

Process:
1. Embed user query once
2. For each result: embed (title + snippet)
3. Calculate cosine_similarity(query_emb, result_emb)
4. Score = similarity value (0.0 to 1.0)

Example scores:
- Highly relevant: 0.7-0.9
- Somewhat relevant: 0.4-0.6
- Not relevant: 0.0-0.3
```

**B. Source Trust (0-1, weight: 0.25)**
```python
Domain Trust Scores:

Tier 1 (0.90-0.95): Authoritative
- .gov (0.95)
- .edu (0.90)
- arxiv.org (0.95)
- nature.com (0.95)
- science.org (0.95)

Tier 2 (0.80-0.89): Reputable News
- reuters.com (0.90)
- apnews.com (0.90)
- bbc.com (0.85)
- nytimes.com (0.85)
- wsj.com (0.85)

Tier 3 (0.70-0.79): Mainstream Media
- forbes.com (0.75)
- bloomberg.com (0.80)
- techcrunch.com (0.75)
- theverge.com (0.75)

Tier 4 (0.60-0.69): User Content
- medium.com (0.60)
- substack.com (0.65)
- wikipedia.org (0.80)

Tier 5 (0.30-0.50): Low Quality
- forums, social media, aggregators

Unknown domains: 0.50 (neutral)

Blocklist (score = 0.0):
- pinterest.com
- spam/SEO farms
```

**C. Freshness (0-1, weight: 0.15)**
```python
Based on publication date:

< 7 days old:     1.0
< 30 days old:    0.9
< 90 days old:    0.8
< 180 days old:   0.7
< 365 days old:   0.6
> 365 days old:   0.3
No date/unknown:  0.5

Note: For temporal queries, increase weight to 0.25
```

**D. Content Quality (0-1, weight: 0.10)**
```python
Heuristic signals:

Positive indicators (+0.1 each):
- Snippet length > 100 chars (substantial content)
- Contains: "study", "research", "analysis", "report"
- Title lacks spam words ("buy", "sale", "discount")
- Proper capitalization and grammar

Negative indicators (-0.2 each):
- Contains: "click here", "subscribe now", "buy now"
- Excessive ellipsis (snippet.count('...') > 3)
- ALL CAPS TITLE
- Suspicious patterns (excessive emojis, etc.)

Base score: 0.5
Final: clamp to [0.0, 1.0]
```

**Post-Processing:**

1. **Deduplication**
```python
# Remove duplicate URLs (same domain + path)
unique_urls = {result['url']: result for result in results}.values()
```

2. **Diversity Enforcement**
```python
# Max 2 results per domain
domain_counts = {}
for result in sorted_results:
    domain = extract_domain(result['url'])
    if domain_counts.get(domain, 0) < 2:
        final_results.append(result)
        domain_counts[domain] += 1
```

3. **Quality Filtering**
```python
# Only include results above threshold
final_results = [r for r in results if r['relevance_score'] > 0.35]
```

---

#### Component 4: URL Fetcher

**Purpose:** Fetch and extract content when user provides explicit URLs

**Inputs:**
- `url` (string): The URL to fetch
- `timeout` (int): Max wait time in seconds (default: 10)

**Outputs:**
- `url_content` (dict):
  - `url`: Original URL
  - `title`: Page title
  - `text`: Extracted main content (cleaned)
  - `method`: How it was fetched ('http' or 'browser')
  - `success`: Boolean

**Fetching Strategy:**

**Method 1: HTTP Request (Fast, 80% of cases)**
```python
Use: aiohttp for async HTTP requests
Process:
1. GET request to URL
2. Parse HTML with BeautifulSoup
3. Remove: <script>, <style>, <nav>, <footer>, <aside>
4. Extract text from <body>
5. Get <title> for metadata

Timeout: 10 seconds
User-Agent: "Mozilla/5.0 (compatible; YourBot/1.0)"

Success rate: ~80% for static pages
Speed: ~500ms average
```

**Method 2: Headless Browser (Slower, 20% of cases)**
```python
Use: Playwright/Puppeteer for JS-heavy sites
When: HTTP method fails or returns minimal content
Process:
1. Launch headless Chromium
2. Navigate to URL
3. Wait for 'networkidle' or 'domcontentloaded'
4. Execute JS to remove unwanted elements
5. Extract innerText from body
6. Close browser

Timeout: 15 seconds
Success rate: ~95% for dynamic pages
Speed: ~2-4 seconds average
```

**Content Extraction Rules:**
```python
Keep:
- Main content area (<article>, <main>, or largest <div>)
- Headings (h1-h6)
- Paragraphs (<p>)
- Lists (<ul>, <ol>)
- Tables (<table>)

Remove:
- Navigation (<nav>)
- Footer (<footer>)
- Sidebar (<aside>)
- Ads (class/id contains: ad, advertisement, promo)
- Social media widgets
- Comments sections
- Cookie banners

Text Limits:
- Max 5,000 characters for LLM context
- Truncate from middle if longer (keep start + end)
- Preserve paragraph boundaries
```

**Error Handling:**
```python
Common errors:
1. 404 Not Found → Return error message to user
2. 403 Forbidden → Try with different User-Agent, then fail gracefully
3. Timeout → Explain page took too long to load
4. SSL errors → Allow insecure connections with warning
5. Redirect chains → Follow up to 5 redirects
6. No text content → Return "Unable to extract readable content"

Always return a response (never crash):
{
  "url": url,
  "success": false,
  "error": "Human-readable error message"
}
```

**URL Detection:**
```python
Regex pattern:
r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+'

Extract all URLs from user message
Process up to 3 URLs per request (prevent abuse)
```

---

#### Component 5: Response Generator

**Purpose:** Generate final response with search context and natural citations

**Inputs:**
- `user_query` (string): Original question
- `search_results` (list): Filtered, scored results (or empty if no search)
- `url_content` (dict): Fetched URL content (if applicable)
- `conversation_history` (list): Previous messages

**Outputs:**
- `response` (string): Generated response with natural citations

**System Prompt:**
```markdown
You are a helpful AI assistant with access to web search.

Current date: {current_date}
Your knowledge cutoff: January 2025

When search results are provided in <search_results> tags:
1. Use them to give accurate, up-to-date answers
2. Cite sources naturally in your response:
   - "According to {source_name}, ..."
   - "Based on recent reports from {source}, ..."
   - "{source_name} reports that ..."
3. Synthesize information from multiple sources when relevant
4. If sources conflict, mention both perspectives
5. Prioritize recent, authoritative sources
6. NEVER quote more than 10-15 words verbatim
7. Always paraphrase in your own words

When URL content is provided in <url_content> tags:
1. Analyze the specific page content provided
2. Reference the URL explicitly: "In the article from {url}, ..."
3. Summarize key points clearly
4. Quote sparingly (max 15 words per quote)

If no search results are provided, answer from your training knowledge.

Guidelines:
- Be conversational and natural
- Don't say "according to the search results" (too robotic)
- Integrate citations smoothly into your response
- Don't list sources separately at the end (weave them in)
- If you're unsure, say so
```

**Context Formatting:**

**For Search Results:**
```xml
<search_results>
<result index="0">
<source>{url}</source>
<title>{title}</title>
<date>{publish_date}</date>
<snippet>{snippet_text}</snippet>
</result>
<result index="1">
...
</result>
</search_results>

User question: {user_query}
```

**For URL Content:**
```xml
<url_content>
<url>
<source>{url}</source>
<title>{page_title}</title>
<content>
{extracted_text}
</content>
</url>
</url_content>

User request: {user_query}
```

**Citation Style Examples:**

✅ **Good (Natural):**
- "According to a recent report from Reuters, the new policy will take effect in March 2025."
- "The BBC reports that the event attracted over 10,000 attendees."
- "Research published in Nature suggests this approach could improve efficiency by 40%."

❌ **Bad (Robotic):**
- "Based on the search results, [result index 0 states that]..."
- "According to source 1, ..."
- "[Sources: Reuters.com, BBC.com, Nature.com]"

---

### 5.3 Data Flow

**Request Flow:**
```
1. User message arrives
2. Extract URLs (if any)
   └─→ If URLs found → URLFetcher → Generate response
   └─→ If no URLs → Continue
3. Search decision
   └─→ needs_search = false → Generate from knowledge
   └─→ needs_search = true → Continue
4. Generate search queries (1-3)
5. Execute searches in parallel
6. Deduplicate results
7. Score results (semantic + trust + freshness + quality)
8. Filter (score > 0.35)
9. Diversify (max 2 per domain)
10. Format as context
11. Generate response with context
12. Return to user
```

**Data Structures:**
```python
# Search Result
{
  "url": "https://example.com/article",
  "title": "Article Title",
  "snippet": "Snippet text...",
  "date": "2024-12-15T10:00:00Z",
  "domain": "example.com",
  "relevance_score": 0.78,
  "score_breakdown": {
    "semantic": 0.85,
    "trust": 0.80,
    "freshness": 0.90,
    "quality": 0.60
  }
}

# URL Content
{
  "url": "https://example.com/page",
  "title": "Page Title",
  "text": "Extracted content...",
  "method": "http",  // or "browser"
  "success": true,
  "error": null
}

# Conversation Message
{
  "role": "user" | "assistant",
  "content": "Message text"
}
```

---

## 6. API Specifications

### 6.1 Search APIs

**Bing Web Search API** (Recommended)
```
Endpoint: https://api.bing.microsoft.com/v7.0/search
Method: GET
Auth: Header "Ocp-Apim-Subscription-Key"

Parameters:
- q: search query
- count: number of results (default: 10, max: 50)
- mkt: market (en-US)
- safeSearch: Moderate

Response fields used:
- webPages.value[].name (title)
- webPages.value[].url
- webPages.value[].snippet
- webPages.value[].datePublished

Cost: ~$7 per 1,000 queries
Rate limit: 3 calls/second
```

**Brave Search API** (Alternative)
```
Endpoint: https://api.search.brave.com/res/v1/web/search
Method: GET
Auth: Header "X-Subscription-Token"

Parameters:
- q: search query
- count: number of results (default: 10, max: 20)
- safesearch: moderate

Response fields:
- web.results[].title
- web.results[].url
- web.results[].description
- web.results[].age (relative date)

Cost: $5 per 1,000 queries (cheaper than Bing)
Rate limit: 1 call/second (free tier)
Privacy: Better (less data sharing)
```

### 6.2 Embedding API

**Sentence Transformers (Local)**
```python
Model: sentence-transformers/all-MiniLM-L6-v2
Dimensions: 384
Inference: ~20ms per encoding (CPU)
Memory: ~120MB model size

Usage:
from sentence_transformers import SentenceTransformer
model = SentenceTransformer('all-MiniLM-L6-v2')
embedding = model.encode("text to embed")

Alternative: voyage-02 API (better quality, but costs money)
```

---

## 7. Implementation Plan

### Phase 1: Core Search Pipeline (Week 1)
**Goal:** Fix search query generation and basic relevance filtering

**Tasks:**
- [ ] Implement `generate_search_queries()` function
  - Use LLM to extract optimized search terms
  - Add heuristic fallback
  - Test on 50 example queries
- [ ] Add basic relevance scoring
  - Implement semantic similarity (sentence-transformers)
  - Add domain trust scores
  - Filter results with score > 0.35
- [ ] Update search decision logic
  - Keep existing intent classifier
  - Add LLM-based decision as enhancement
  - Ensure it triggers for temporal queries
- [ ] Testing
  - Create test suite with 100 queries
  - Measure: relevance improvement, search trigger accuracy
  - Fix edge cases

**Deliverables:**
- Working search query optimizer
- Basic relevance scorer
- Test results showing improvement

**Success Criteria:**
- Search queries average 3-5 words (down from 10+)
- Relevance score > 0.5 for top 3 results
- <10% bad search triggers

---

### Phase 2: URL Fetching (Week 2)
**Goal:** Add ability to fetch and analyze explicit URLs

**Tasks:**
- [ ] Implement URL detection
  - Regex to extract URLs from user messages
  - Handle multiple URLs (limit to 3)
- [ ] Build URL fetcher
  - HTTP method with aiohttp + BeautifulSoup
  - Headless browser fallback (Playwright)
  - Content extraction and cleaning
- [ ] Create separate handling path
  - If URLs detected → fetch content
  - Generate response with URL context
  - Skip web search for URL requests
- [ ] Error handling
  - Handle 404, 403, timeouts gracefully
  - Return helpful error messages
  - Test with various URL types

**Deliverables:**
- URLFetcher class
- Integration with main flow
- Error handling for common issues

**Success Criteria:**
- 90% of URLs fetch successfully
- Content extracted cleanly (no nav/footer)
- Average fetch time <3 seconds

---

### Phase 3: Enhanced Scoring (Week 3)
**Goal:** Add freshness, quality, and diversity scoring

**Tasks:**
- [ ] Implement freshness scoring
  - Parse date from search results
  - Calculate age-based score
  - Increase weight for temporal queries
- [ ] Add content quality heuristics
  - Positive signals (length, keywords)
  - Negative signals (spam patterns)
  - Quality threshold
- [ ] Implement result diversification
  - Track domain counts
  - Limit to 2 results per domain
  - Ensure source diversity
- [ ] Combine all scoring factors
  - Weighted sum of all scores
  - Tune weights based on testing
  - A/B test different weight configurations

**Deliverables:**
- Complete RelevanceScorer class
- Source diversity enforcement
- Tuned scoring weights

**Success Criteria:**
- >60% responses cite multiple domains
- Quality score correlates with user satisfaction
- No single domain dominates results

---

### Phase 4: Response Generation (Week 4)
**Goal:** Improve citation quality and response naturalness

**Tasks:**
- [ ] Update system prompt
  - Add natural citation examples
  - Emphasize paraphrasing over quoting
  - Include date context
- [ ] Context formatting
  - Structure search results for LLM
  - Add metadata (dates, sources)
  - Limit total context size
- [ ] Citation post-processing
  - Validate citations match sources
  - Ensure source attribution
  - Track citation patterns
- [ ] Conversation history
  - Pass previous messages for context
  - Handle follow-up questions
  - Maintain search state across turns

**Deliverables:**
- Updated prompts
- Citation validation
- Conversation-aware search

**Success Criteria:**
- 80% of citations are natural (not robotic)
- <5% invalid citations
- Follow-up questions work correctly

---

### Phase 5: Optimization & Monitoring (Week 5)
**Goal:** Improve performance and add observability

**Tasks:**
- [ ] Add caching
  - Cache search results (Redis)
  - TTL: 1 hour for most queries
  - Cache embeddings for common queries
- [ ] Parallel execution
  - Search queries in parallel
  - Async URL fetching
  - Non-blocking LLM calls
- [ ] Monitoring & logging
  - Log all search decisions
  - Track relevance scores
  - Monitor API costs
  - User feedback collection
- [ ] Performance optimization
  - Target: <5s total latency
  - Optimize embedding batch size
  - Reduce unnecessary API calls

**Deliverables:**
- Redis caching layer
- Async pipeline
- Monitoring dashboard

**Success Criteria:**
- 95th percentile latency <5s
- 80% cache hit rate for popular queries
- Full observability of search pipeline

---

## 8. Testing Strategy

### 8.1 Test Categories

**Unit Tests:**
```python
test_search_query_generation()
  - Input: "Who is the current CEO of Apple?"
  - Expected: ["Apple CEO 2025"]
  
test_url_extraction()
  - Input: "Summarize https://example.com/article for me"
  - Expected: ["https://example.com/article"]
  
test_relevance_scoring()
  - Input: Query + results
  - Expected: Scores in descending order, top result > 0.5
  
test_domain_trust()
  - Input: "reuters.com"
  - Expected: 0.90
  
test_freshness_calculation()
  - Input: date from 7 days ago
  - Expected: 1.0
```

**Integration Tests:**
```python
test_end_to_end_search()
  - User query → Search decision → Query gen → API call → Scoring → Response
  - Verify: Response cites sources, search triggered correctly
  
test_url_fetching_flow()
  - User message with URL → Extract → Fetch → Parse → Response
  - Verify: Actual page content used, not web search
  
test_no_search_path()
  - Timeless query → No search triggered → Response from knowledge
  - Verify: No API calls made
```

**Regression Tests:**
```python
# Test with 100 real user queries (anonymized)
queries = [
    "Who is the current president of France?",  # Should search
    "Explain quantum computing",                 # Should not search
    "Stock price of NVDA",                       # Should search
    "How to reverse a linked list",              # Should not search
    ...
]

for query in queries:
    result = run_pipeline(query)
    assert result.matches_expected_behavior()
```

### 8.2 Quality Metrics

**Search Trigger Accuracy:**
```
Precision = True Positives / (True Positives + False Positives)
  - True Positive: Should search AND did search
  - False Positive: Should NOT search BUT did search

Recall = True Positives / (True Positives + False Negatives)
  - False Negative: Should search BUT did NOT search

Target: Precision >85%, Recall >80%
```

**Result Relevance:**
```
Manual evaluation of 100 search-triggered responses:
- Rate each result 1-5 for relevance
- Average rating should be >4.0
- <10% of results rated 1-2 (irrelevant)
```

**Citation Quality:**
```
Automated checks:
- % responses with citations (target: >90% for search responses)
- % citations that match a provided source (target: >95%)
- Average quote length (target: <15 words)

Manual checks (50 responses):
- Citation naturalness (conversational vs robotic)
- Source diversity (multiple domains cited)
```

### 8.3 Performance Benchmarks
```
Latency Targets:
- Search decision: <200ms
- Query generation: <300ms
- Search API calls: <1500ms (parallel)
- Relevance scoring: <500ms
- Response generation: <2000ms
Total: <5000ms (5 seconds) p95

Cost Targets:
- Average cost per search: <$0.01
- Daily API budget: $50 (5000 searches/day)

Throughput:
- Support 10 concurrent users
- Handle 100 requests/minute
```

---

## 9. Edge Cases & Error Handling

### 9.1 Edge Cases

**Empty Search Results:**
```
Scenario: Search API returns 0 results
Handling:
1. Log the query for analysis
2. Fall back to knowledge-based response
3. Inform user: "I couldn't find recent information on this topic, 
   but based on my training..."
```

**All Results Below Threshold:**
```
Scenario: All results score <0.35 (irrelevant)
Handling:
1. Don't show low-quality results to LLM
2. Try one more search with modified query
3. If still no good results → respond from knowledge
```

**Search API Rate Limit:**
```
Scenario: Hit API rate limit (3/sec for Bing)
Handling:
1. Queue requests with exponential backoff
2. Return cached result if available
3. If urgent: respond from knowledge with disclaimer
```

**Ambiguous Temporal Context:**
```
Scenario: "Who won the election?" (which election? which year?)
Handling:
1. Use conversation history for context
2. Default to most recent (2024 US election)
3. Add clarifying context in response
```

**URL Behind Paywall:**
```
Scenario: User provides URL that requires subscription
Handling:
1. Fetch fails or returns minimal content
2. Explain: "This article appears to be behind a paywall"
3. Offer to search for related free content
```

**Contradictory Sources:**
```
Scenario: Source A says X, Source B says Y
Handling:
1. Present both perspectives
2. Note the disagreement explicitly
3. Prioritize more authoritative/recent source
4. Example: "While Reuters reports X, Bloomberg suggests Y..."
```

### 9.2 Error Messages

**User-Facing Errors:**
```
Search API down:
"I'm having trouble accessing web search right now. 
Let me answer based on my training instead..."

URL fetch failed:
"I wasn't able to access that page. It might be down or 
restricted. Can you paste the relevant text instead?"

Timeout:
"The search is taking longer than expected. Let me provide 
what I know while still looking for current information..."

No relevant results:
"I couldn't find recent, reliable information on this topic. 
Based on my knowledge from [training date]..."
```

**Internal Logging:**
```python
# Log all errors with context
logger.error(
    "Search API call failed",
    extra={
        "query": search_query,
        "error": str(error),
        "api": "bing",
        "user_id": user_id,
        "timestamp": datetime.now()
    }
)
```

---

## 10. Monitoring & Analytics

### 10.1 Key Metrics

**Search Usage:**
- Total searches per day/week
- Search trigger rate (% of messages that trigger search)
- Average queries per search (1-3)
- Cache hit rate

**Quality Metrics:**
- Average relevance score of used results
- % responses citing multiple sources
- % responses with citations
- Citation validation pass rate

**Performance:**
- p50, p95, p99 latency by component
- Search API response time
- URL fetch success rate
- LLM generation time

**Cost:**
- Daily/monthly API spend
- Cost per search
- Cost per message

**User Satisfaction:**
- Thumbs up/down rate for search responses
- Retry rate (user asks same question again)
- Session abandonment after search response

### 10.2 Dashboards

**Real-Time Dashboard:**
```
┌────────────────────────────────────────┐
│   Search Performance (Last 24h)        │
├────────────────────────────────────────┤
│ Total Searches:        1,247           │
│ Avg Relevance Score:   0.68            │
│ P95 Latency:          4.2s             │
│ API Cost:             $8.73            │
│ Cache Hit Rate:       76%              │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│   Quality Metrics                      │
├────────────────────────────────────────┤
│ Multi-source responses:  68%           │
│ Citation validation:     94%           │
│ User satisfaction:       4.3/5         │
└────────────────────────────────────────┘
```

**Weekly Report:**
- Top 20 search queries
- Queries with low relevance scores (for debugging)
- Most cited domains
- Error rate trends
- Cost analysis

### 10.3 Alerting

**Critical Alerts (Page On-Call):**
- Search API down for >5 minutes
- Error rate >10% for >15 minutes
- Latency p95 >10s for >10 minutes

**Warning Alerts (Email):**
- Daily API cost >$100
- Cache hit rate <50%
- Relevance score drops >20% week-over-week

---

## 11. Security & Privacy

### 11.1 User Privacy

**Search Queries:**
- Do NOT log personally identifiable information
- Anonymize user IDs in logs
- Do NOT send user IDs to search APIs
- Retention: 30 days max for debugging

**URL Content:**
- Do NOT cache fetched URL content
- Do NOT share URL content with search APIs
- Delete fetched content after response generation

**Conversation History:**
- Only send last 5 messages for context
- Strip PII before including in search context

### 11.2 API Security

**API Keys:**
- Store in environment variables / secret manager
- Rotate keys every 90 days
- Use separate keys for dev/staging/prod
- Monitor for unusual usage patterns

**Rate Limiting:**
- Implement per-user rate limits (100 searches/day)
- Detect and block abuse patterns
- Add CAPTCHA for suspected bots

### 11.3 Content Safety

**URL Fetching:**
- Block known malicious domains
- Validate SSL certificates
- Timeout after 15 seconds (prevent hangs)
- Limit fetched content size (max 1MB)

**Search Results:**
- Filter adult content (use safe search)
- Block known misinformation domains
- Flag results that might contain harmful content

---

## 12. Future Enhancements (Post-MVP)

### P1 (Next Quarter)
- [ ] Multi-modal search (image search)
- [ ] PDF document fetching and parsing
- [ ] Real-time data sources (stock APIs, weather APIs)
- [ ] User feedback loop (learn from thumbs up/down)
- [ ] Personalized source preferences

### P2 (6 Months)
- [ ] Advanced query understanding (entity linking)
- [ ] Temporal query decomposition ("what happened last week")
- [ ] Multi-language search support
- [ ] Local/regional search bias
- [ ] Collaborative filtering for source quality

### P3 (Nice to Have)
- [ ] Custom search engine integration (Elasticsearch)
- [ ] Fact-checking pipeline
- [ ] Automatic source credibility scoring with ML
- [ ] Search result explanation ("why I chose this source")

---

## 13. Success Criteria

### Launch Criteria (Must Have)
✅ Search trigger accuracy >80%  
✅ Result relevance score avg >0.6  
✅ P95 latency <6 seconds  
✅ Citation validation >90%  
✅ URL fetching success rate >85%  
✅ Zero critical bugs in production  

### Post-Launch (30 Days)
✅ User satisfaction >4.0/5 for search responses  
✅ Multi-source citation rate >60%  
✅ Search cost <$100/day  
✅ Cache hit rate >70%  
✅ <5% error rate  

### Long-Term (90 Days)
✅ 20% increase in user engagement with search feature  
✅ 50% reduction in "I don't know" responses  
✅ Organic usage of URL analysis >100 times/day  
✅ Positive feedback from beta users  

---

## 14. Appendix

### A. Example Queries & Expected Behavior
```
Query: "Who is the current CEO of Apple?"
Expected:
✓ Trigger search: YES
✓ Search query: "Apple CEO 2025"
✓ Use results: YES
✓ Response includes: Current CEO name + source citation
✓ Sources: reuters.com, apple.com, etc.

Query: "Explain how photosynthesis works"
Expected:
✓ Trigger search: NO
✓ Response from: Training knowledge
✓ No citations needed

Query: "What's the stock price of NVDA?"
Expected:
✓ Trigger search: YES
✓ Search query: "NVIDIA stock price"
✓ Prioritize: Recent results (<1 day old)
✓ Include: Current price + change

Query: "Summarize this: https://example.com/article"
Expected:
✓ Trigger search: NO
✓ Trigger URL fetch: YES
✓ Fetch: Exact URL content
✓ Response: Summary of that specific page
```

### B. Code Structure
```
/src
  /search
    decision.py          # Search decision logic
    query_generator.py   # Optimize search queries
    relevance_scorer.py  # Score & filter results
    search_api.py        # API wrappers (Bing/Brave)
  /url_fetcher
    fetcher.py          # HTTP + browser methods
    parser.py           # Content extraction
  /llm
    generator.py        # Response generation
    prompts.py          # System prompts
  /utils
    cache.py            # Redis caching
    monitoring.py       # Metrics & logging
  /tests
    test_search.py
    test_url_fetcher.py
    test_integration.py
```

### C. Configuration
```yaml
# config.yaml
search:
  api: "bing"  # or "brave"
  max_results: 10
  parallel_queries: 3
  cache_ttl: 3600  # 1 hour
  
relevance:
  threshold: 0.35
  weights:
    semantic: 0.50
    trust: 0.25
    freshness: 0.15
    quality: 0.10
  
url_fetcher:
  timeout: 10
  max_urls: 3
  max_content_size: 5000
  
performance:
  max_latency: 5000  # ms
  cache_enabled: true
  
monitoring:
  log_level: "INFO"
  metrics_enabled: true
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Feb 2025 | Engineering | Initial PRD |

**Next Review:** After Phase 1 completion (Week 1)

---

## Questions & Clarifications

**Q: Should we support video search results?**  
A: Not in v1. Focus on text-based web pages only.

**Q: What if the LLM hallucinates a source?**  
A: Implement citation validation post-processing. Flag or remove citations that don't match any provided source.

**Q: How do we handle paywalled content?**  
A: Best effort - fetch what we can. If fetch fails, explain to user and offer to search for alternative free sources.

**Q: Should search be opt-in or automatic?**  
A: Automatic. Like Claude/ChatGPT, it should happen transparently when needed.

---

**End of PRD**