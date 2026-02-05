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
from server.query_handler import answer_query

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
        Complete system prompt string, or None if no instructions exist
    """
    instruction = get_active_instruction(workspace_id)
    
    # Return None when there are no instructions to signal no modification needed
    if not instruction:
        return None
    
    # Use 'instructions' field (the actual database column name)
    instruction_content = instruction.get("instructions", "")
    instruction_title = instruction.get("title", "Custom Instruction")
    
    # Return None if instruction content is empty
    if not instruction_content:
        return None
    
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
    model_name: str = "llama3.2:3b",
    base_system_prompt: str = "",
    conversation_history: list = None
) -> str:
    """
    Query LLM with workspace-specific instructions applied
    
    Args:
        query: The user's query
        workspace_id: The workspace ID to fetch instructions for
        model_name: Ollama model to use (passed to answer_query)
        base_system_prompt: Optional base system prompt
        conversation_history: Optional conversation history
    
    Returns:
        LLM response following workspace instructions
    """
    try:
        # Build system prompt with instructions
        system_prompt = build_system_prompt(workspace_id, base_system_prompt)
        
        # Only modify query if custom instructions exist
        if system_prompt:
            full_query = f"{system_prompt}\n\nUser Query: {query}"
        else:
            # No instructions - pass query through unchanged
            full_query = query
        
        # Use answer_query from query_handler (handles semantic search + LLM)
        response = answer_query(
            full_query,
            conversation_history=conversation_history,
            stream=False,
            workspace_id=workspace_id
        )
        
        return response
        
    except Exception as e:
        return f"Error querying with instructions: {str(e)}"


async def query_with_instructions_stream(
    query: str,
    workspace_id: str,
    model_name: str = "llama3.2:3b",
    base_system_prompt: str = "",
    conversation_history: list = None,
    selected_file_ids: list = None,
    abort_event=None
):
    """
    Query LLM with workspace-specific instructions (async streaming version)
    
    Args:
        query: The user's query
        workspace_id: The workspace ID to fetch instructions for
        model_name: Ollama model to use (passed to answer_query)
        base_system_prompt: Optional base system prompt
        conversation_history: Optional conversation history
        selected_file_ids: Optional list of file IDs to filter search results
        abort_event: threading.Event to signal cancellation (optional)
    
    Returns:
        Async generator yielding response chunks
    """
    try:
        # Build system prompt with instructions
        system_prompt = build_system_prompt(workspace_id, base_system_prompt)
        
        # Only modify query if custom instructions exist
        if system_prompt:
            full_query = f"{system_prompt}\n\nUser Query: {query}"
        else:
            # No instructions - pass query through unchanged
            full_query = query
        
        # Use answer_query from query_handler with streaming enabled (async)
        # ✅ Pass abort_event for cancellation support
        response = await answer_query(
            full_query,
            conversation_history=conversation_history,
            stream=True,
            workspace_id=workspace_id,
            selected_file_ids=selected_file_ids,
            abort_event=abort_event
        )
        
        # ✅ FIX: Directly return the inner generator to avoid double-wrapping
        # This allows the bridge_server to iterate it directly with asyncio.to_thread
        if hasattr(response, '__aiter__'):
            return response
        else:
            # If not streaming, wrap as single-item async generator
            async def single_response():
                yield {"response": response}
            return single_response()
        
    except Exception as e:
        async def error_response():
            yield {"response": f"Error querying with instructions: {str(e)}"}
        return error_response()


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
    instructions = instruction.get("instructions", "")
    
    # Truncate content for preview
    preview_length = 200
    if len(instructions) > preview_length:
        content_preview = instructions[:preview_length] + "..."
    else:
        content_preview = instructions
    
    return f"Active Instruction: {title}\n{content_preview}"


