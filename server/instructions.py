"""
Workspace Instructions Handler
Handles custom instructions for workspaces from the workspace_instructions table

Database table schema:
- id: UUID primary key
- workspace_id: UUID foreign key to workspaces table
- title: Text instruction title
- instructions: Text instruction content
- is_active: Boolean (only one can be active per workspace)
- created_at: Timestamp with time zone
- updated_at: Timestamp with time zone (auto-updated)
"""

import os
import requests
from typing import Optional, Dict, Any
from dotenv import load_dotenv

# Load environment variables from server/.env.local
env_path = os.path.join(os.path.dirname(__file__), '.env.local')
load_dotenv(dotenv_path=env_path)

# WARNING: This module references a non-existent table
# Supabase configuration
# Try both NEXT_PUBLIC_ prefix (from frontend .env.local) and regular prefix
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY")

# Global variable to cache active instruction
_active_instruction_cache: Dict[str, Optional[Dict[str, Any]]] = {}


def get_active_instruction(workspace_id: str, force_refresh: bool = False):
    """
    Fetch the active instruction for a workspace from Supabase
    
    Args:
        workspace_id: The workspace ID to fetch instructions for
        force_refresh: If True, bypass cache and fetch fresh data
    
    Returns:
        Dictionary containing instruction data (id, title, content, etc.) or None if no active instruction
    """
    global _active_instruction_cache
    
    # Return cached instruction if available and not forcing refresh
    if not force_refresh and workspace_id in _active_instruction_cache:
        return _active_instruction_cache[workspace_id]
    
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        print("Warning: Supabase credentials not configured. Cannot fetch instructions.")
        return None
    
    try:
        # Query Supabase for active instruction
        url = f"{SUPABASE_URL}/rest/v1/workspace_instructions"
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json"
        }
        params = {
            "workspace_id": f"eq.{workspace_id}",
            "is_active": "eq.true",
            "select": "*"
        }
        
        response = requests.get(url, headers=headers, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        # Supabase returns an array, get first item if exists
        if data and len(data) > 0:
            instruction = data[0]
            _active_instruction_cache[workspace_id] = instruction
            return instruction
        else:
            _active_instruction_cache[workspace_id] = None
            return None
            
    except requests.RequestException as e:
        print(f"Error fetching active instruction from Supabase: {e}")
        return None
    except Exception as e:
        print(f"Unexpected error fetching instruction: {e}")
        return None


def clear_instruction_cache(workspace_id: Optional[str] = None):
    """
    Clear cached instructions
    
    Args:
        workspace_id: If provided, clear only this workspace's cache. If None, clear all.
    """
    global _active_instruction_cache
    
    if workspace_id:
        _active_instruction_cache.pop(workspace_id, None)
    else:
        _active_instruction_cache.clear()


def build_system_prompt(workspace_id: str, base_prompt: str = ""):
    """
    Build system prompt by combining base prompt with active workspace instruction
    
    Args:
        workspace_id: The workspace ID to fetch instructions for
        base_prompt: Optional base system prompt to prepend
    
    Returns:
        Complete system prompt string
    """
    instruction = get_active_instruction(workspace_id)
    
    if not instruction:
        return base_prompt
    
    instruction_content = instruction.get("content", "")
    instruction_title = instruction.get("title", "Custom Instruction")
    
    if not instruction_content:
        return base_prompt
    
    # Build combined prompt
    combined_prompt = base_prompt
    
    if combined_prompt:
        combined_prompt += "\n\n"
    
    combined_prompt += f"=== {instruction_title} ===\n{instruction_content}\n=== End of Custom Instructions ===\n\n"
    combined_prompt += "Please follow the custom instructions above when responding to queries."
    
    return combined_prompt


def query_with_instructions(
    query: str,
    workspace_id: str,
    model_name: str = "llama3.2:1b",
    base_system_prompt: str = "",
    conversation_history: list = None
) -> str:
    """
    Query Ollama with workspace-specific instructions applied
    
    Args:
        query: The user's query
        workspace_id: The workspace ID to fetch instructions for
        model_name: Ollama model to use
        base_system_prompt: Optional base system prompt
        conversation_history: Optional conversation history
    
    Returns:
        LLM response following workspace instructions
    """
    try:
        # Build system prompt with instructions
        system_prompt = build_system_prompt(workspace_id, base_system_prompt)
        
        # Construct full prompt
        if system_prompt:
            full_prompt = f"{system_prompt}\n\nUser Query: {query}"
        else:
            full_prompt = query
        
        # Add conversation history if provided
        if conversation_history:
            # Format conversation history
            history_text = "\n\nPrevious Conversation:\n"
            for msg in conversation_history[-5:]:  # Include last 5 messages for context
                role = msg.get("role", "unknown")
                content = msg.get("content", "")
                history_text += f"{role.capitalize()}: {content}\n"
            
            full_prompt = f"{system_prompt}\n{history_text}\n\nCurrent Query: {query}"
        
        # Query Ollama
        response = requests.post(
            'http://localhost:11434/api/generate',
            json={
                'model': model_name,
                'prompt': full_prompt,
                'stream': False
            },
            timeout=120
        )
        response.raise_for_status()
        
        return response.json().get('response', '')
        
    except requests.RequestException as e:
        return f"Error querying Ollama with instructions: {str(e)}"
    except Exception as e:
        return f"Unexpected error: {str(e)}"


def query_with_instructions_stream(
    query: str,
    workspace_id: str,
    model_name: str = "llama3.2:1b",
    base_system_prompt: str = "",
    conversation_history: list = None
):
    """
    Query Ollama with workspace-specific instructions (streaming version)
    
    Args:
        query: The user's query
        workspace_id: The workspace ID to fetch instructions for
        model_name: Ollama model to use
        base_system_prompt: Optional base system prompt
        conversation_history: Optional conversation history
    
    Returns:
        Generator yielding response chunks
    """
    try:
        # Build system prompt with instructions
        system_prompt = build_system_prompt(workspace_id, base_system_prompt)
        
        # Construct full prompt
        if system_prompt:
            full_prompt = f"{system_prompt}\n\nUser Query: {query}"
        else:
            full_prompt = query
        
        # Add conversation history if provided
        if conversation_history:
            history_text = "\n\nPrevious Conversation:\n"
            for msg in conversation_history[-5:]:
                role = msg.get("role", "unknown")
                content = msg.get("content", "")
                history_text += f"{role.capitalize()}: {content}\n"
            
            full_prompt = f"{system_prompt}\n{history_text}\n\nCurrent Query: {query}"
        
        # Query Ollama with streaming
        response = requests.post(
            'http://localhost:11434/api/generate',
            json={
                'model': model_name,
                'prompt': full_prompt,
                'stream': True
            },
            timeout=120,
            stream=True
        )
        response.raise_for_status()
        
        # Stream response chunks
        import json
        for line in response.iter_lines():
            if line:
                try:
                    chunk = json.loads(line)
                    if 'response' in chunk:
                        yield chunk
                except json.JSONDecodeError:
                    continue
                    
    except requests.RequestException as e:
        yield {"response": f"Error querying Ollama: {str(e)}"}
    except Exception as e:
        yield {"response": f"Unexpected error: {str(e)}"}


def get_instruction_preview(workspace_id: str) -> str:
    """
    Get a preview of the active instruction for display purposes
    
    Args:
        workspace_id: The workspace ID
    
    Returns:
        String preview of active instruction or message if none active
    """
    instruction = get_active_instruction(workspace_id)
    
    if not instruction:
        return "No active instruction set for this workspace"
    
    title = instruction.get("title", "Untitled")
    content = instruction.get("content", "")
    
    # Truncate content for preview
    preview_length = 200
    if len(content) > preview_length:
        content_preview = content[:preview_length] + "..."
    else:
        content_preview = content
    
    return f"Active Instruction: {title}\n{content_preview}"


# Example usage
if __name__ == "__main__":
    # Test fetching instructions
    test_workspace_id = "test-workspace-123"
    
    print("Testing instruction system...")
    print("-" * 50)
    
    # Get active instruction
    instruction = get_active_instruction(test_workspace_id)
    if instruction:
        print(f"Found active instruction:")
        print(f"  Title: {instruction.get('title')}")
        print(f"  Content: {instruction.get('content')[:100]}...")
    else:
        print("No active instruction found")
    
    print("-" * 50)
    
    # Test system prompt building
    system_prompt = build_system_prompt(test_workspace_id, "You are a helpful assistant.")
    print(f"Generated system prompt:\n{system_prompt}")
    
    print("-" * 50)
    
    # Test query with instructions
    test_query = "What is Python?"
    response = query_with_instructions(test_query, test_workspace_id)
    print(f"Query: {test_query}")
    print(f"Response: {response[:200]}...")
