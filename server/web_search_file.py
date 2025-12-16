"""
Web Search Handler for FastMCP using Tavily API

Database Schema (4 tables):
- files: File metadata
- workspaces: User workspaces  
- chats: Chat messages
- document_content: Extracted text from files
"""

import requests
from bs4 import BeautifulSoup
import os
from dotenv import load_dotenv
from server.query_handler import semantic_similarity_to_last_message, query_model 

# Load environment variables from server/.env.local
env_path = os.path.join(os.path.dirname(__file__), '.env.local')
load_dotenv(dotenv_path=env_path)

# Load environment variables from root .env file
load_dotenv()

# Tavily API Configuration
TAVILY_API_BASE_URL = "https://api.tavily.com/search"
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "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")  # Store API key in environment variable

def tavily_web_search(query,conversation_history: list = None, **kwargs):
    """
    Perform a web search using Tavily API and return extracted content from top result
    
    Args:
        query (str): The search query (required)
        **kwargs: Additional Tavily API parameters
    
    Returns:
        str: Extracted full text content from the top search result URL
    """
    # Prepare request body
    body = {
        "query": query,
        "api_key": TAVILY_API_KEY,
        **kwargs  # Directly spread all kwargs into body
    }
    
    # Prepare headers
    headers = {
        "Content-Type": "application/json"
    }
    
    try:
        # Make API request (POST request with JSON body)
        response = requests.post(TAVILY_API_BASE_URL, json=body, headers=headers)
        response.raise_for_status()
        search_response = response.json()
        
        # Extract and return only the top result content
        top_content = extract_top_result_content(search_response)

        if top_content.startswith("Error") or top_content.startswith("HTTP error") or top_content.startswith("Request failed"):
            return f"Search error: {top_content}"
        
        if top_content in ["No URL found in top result", "No search results found", "No results in response"]:
            return f"No search results found for query: '{query}'"
    
        similarity_to_last = semantic_similarity_to_last_message(query,conversation_history)

         # Build enhanced prompt with conversation continuity
        conversation_context = ""
        if similarity_to_last >= 0.6:
            conversation_context = f"\n\nNote: This question is semantically similar (similarity: {similarity_to_last:.2f}) to the previous message, suggesting it's a continuation of the conversation. Maintain context and reference previous discussion when relevant."
        
        # Build prompt for LLM
        prompt = f"Answer this question using the content below:\nQuestion: {query}\n\nContent:\n{top_content[:4000]}{conversation_context}"
        
        llm_response = query_model(prompt)
        
        # Append semantic similarity metadata to response if available
        if similarity_to_last > 0.0:
            llm_response += f"\n\n---\n**Semantic Similarity to Last Message:** {similarity_to_last:.3f}"
        
        return llm_response
    
    except Exception as e:
        return f"Error: {str(e)}" 



def extract_top_result_content(search_response):
    """
    Extract and scrape content from the top search result, with fallback to Tavily's content snippets
    
    Args:
        search_response (dict): Response from tavily_web_search()
    
    Returns:
        str: Extracted text content from the top result URL or Tavily content snippets
    """
    try:
        # Extract top result URL from results
        if "results" in search_response:
            results = search_response["results"]
            if results and len(results) > 0:
                top_result = results[0]
                top_result_url = top_result.get("url")
                
                if top_result_url:
                    # Add headers to avoid 403 errors
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Accept-Encoding': 'gzip, deflate',
                        'Connection': 'keep-alive',
                    }
                    
                    try:
                        # Fetch the webpage with headers
                        page = requests.get(top_result_url, headers=headers, timeout=10)
                        page.raise_for_status()
                        
                        # Parse with BeautifulSoup
                        soup = BeautifulSoup(page.content, 'html.parser')
                        
                        # Extract main text
                        main_text = soup.get_text(separator='\n', strip=True)
                        
                        # If we got substantial content, return it
                        if len(main_text) > 200:
                            return main_text
                    except (requests.exceptions.RequestException, Exception) as scrape_error:
                        # Fallback to Tavily's content if scraping fails
                        print(f"Scraping failed: {scrape_error}. Using Tavily content snippets.")
                    
                    # Fallback: Use Tavily's content snippets from all results
                    combined_content = f"Source: {top_result.get('title', 'No title')}\nURL: {top_result_url}\n\n"
                    
                    for idx, result in enumerate(results[:5], 1):  # Use top 5 results
                        title = result.get('title', 'No title')
                        content = result.get('content', '')
                        url = result.get('url', '')
                        
                        if content:
                            combined_content += f"\n--- Result {idx}: {title} ---\n"
                            combined_content += f"URL: {url}\n"
                            combined_content += f"{content}\n"
                    
                    return combined_content if combined_content.strip() else "No content available from search results"
                else:
                    return "No URL found in top result"
            else:
                return "No search results found"
        else:
            return "No results in response"
    
    except Exception as e:
        return f"Error extracting content: {e}"



    
   