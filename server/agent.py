"""
Agent Loop for FastMCP - ReAct Pattern
Reason → Act (call tool) → Observe (tool result) → Repeat until done
"""
import json
import re
import asyncio
from typing import Optional

from server.query_handler import query_model, answer_query
from server.enhanced_web_search import enhanced_web_search
from server.csv_excel_processor import process_csv_excel_query
from server.mermaid_converter import convert_query_to_mermaid_markdown

MAX_STEPS = 3  # Safety cap on reasoning iterations (3b model has ~8K context, 5 steps would overflow)


def _resolve_file_ids(workspace_id: Optional[str], file_name: str = "", extensions: list = None) -> list:
    """
    Look up file IDs from Supabase for the given workspace.
    Optionally filters by file_name (fuzzy) and file extensions.
    Returns a list of file IDs.
    """
    import os
    try:
        from supabase import create_client
    except ImportError:
        return []

    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not supabase_key:
        return []

    try:
        client = create_client(supabase_url, supabase_key)
        query_builder = client.table('file_upload').select('id, file_name').is_('deleted_at', None)
        if workspace_id:
            query_builder = query_builder.eq('workspace_id', workspace_id)
        result = query_builder.execute()
        files = result.data or []

        # Filter by extension
        if extensions:
            files = [f for f in files if any(f['file_name'].lower().endswith(ext) for ext in extensions)]

        # If caller named a specific file, prefer the closest match
        if file_name:
            name_lower = file_name.lower()
            matched = [
                f for f in files
                if name_lower in f['file_name'].lower() or f['file_name'].lower() in name_lower
            ]
            if matched:
                files = matched

        return [f['id'] for f in files]
    except Exception as e:
        print(f"❌ Error resolving file IDs: {e}")
        return []


async def _csv_adapter(q, ws, h, file_name="", **_):
    file_ids = _resolve_file_ids(ws, file_name, extensions=['.csv'])
    if not file_ids:
        return "No CSV files found in this workspace. Please upload a CSV file first."
    return await process_csv_excel_query(query=q, conversation_history=h, selected_file_ids=file_ids)


async def _excel_adapter(q, ws, h, file_name="", **_):
    file_ids = _resolve_file_ids(ws, file_name, extensions=['.xlsx', '.xls'])
    if not file_ids:
        return "No Excel files found in this workspace. Please upload an Excel file first."
    return await process_csv_excel_query(query=q, conversation_history=h, selected_file_ids=file_ids)


async def _diagram_adapter(q, ws, h, **_):
    result = await convert_query_to_mermaid_markdown(include_diagram=True, diagram_type="auto", query=q)
    return json.dumps(result)


TOOL_REGISTRY = {
    "search_documents": {
        "description": "Semantic search over ingested workspace documents. Use when user asks about uploaded files or internal knowledge.",
        "fn": lambda q, ws, h, **_: answer_query(q, conversation_history=h, workspace_id=ws),
    },
    "web_search": {
        "description": "Search the web for real-time or external information. Use when question is about current events or topics not in documents.",
        "fn": lambda q, ws, h, **_: enhanced_web_search(query=q, conversation_history=h),
        "is_async": True,
    },
    "query_csv": {
        "description": "Query a CSV file using natural language. Use when user asks about tabular CSV data. Set file_name to the filename mentioned by the user, or leave empty to search all CSV files in the workspace.",
        "fn": _csv_adapter,
        "is_async": True,
    },
    "query_excel": {
        "description": "Query an Excel file using natural language. Use when user asks about spreadsheet data. Set file_name to the filename mentioned by the user, or leave empty to search all Excel files in the workspace.",
        "fn": _excel_adapter,
        "is_async": True,
    },
    "generate_diagram": {
        "description": "Generate a Mermaid diagram from text or data. Use when user requests a visual chart, flowchart, or timeline.",
        "fn": _diagram_adapter,
        "is_async": True,
    },
}


def _build_system_prompt():
    tool_descriptions = "\n".join(
        f"- {name}: {meta['description']}" for name, meta in TOOL_REGISTRY.items()
    )
    return f"""You are an intelligent agent with access to the following tools:

{tool_descriptions}

Respond ONLY in this JSON format at each step:
{{
  "thought": "Your reasoning about what to do next",
  "action": "tool_name",
  "action_input": "query to pass to the tool",
  "file_name": ""
}}

When you have a final answer, use:
{{
  "thought": "I now have all the information needed",
  "action": "finish",
  "action_input": "Your complete final answer here"
}}

Rules:
- Use at most {MAX_STEPS} steps
- Do not repeat the same tool with the same input
- If a tool returns an error or empty result, try a different approach or finish with what you have
- Always include a "thought" field explaining your reasoning
- For query_csv and query_excel: set file_name to the filename the user mentioned, or leave it empty to automatically search all matching files in the workspace
"""


async def _call_agent_llm(prompt: str) -> str:
    """
    Call llama.cpp with OpenAI-compatible API.
    Uses requests in a thread executor to stay non-blocking inside the async agent loop.
    """
    import os
    import requests as _requests
    llamacpp_url = os.environ.get('LLAMACPP_BASE_URL', 'http://localhost:8001')
    payload = {
        "model": "llama3.2:3b",
        "messages": [
            {"role": "system", "content": "You are a helpful AI assistant that responds in valid JSON format."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.7,
        "max_tokens": 2000,
        "stream": False,
    }

    def _do_request():
        resp = _requests.post(f"{llamacpp_url}/v1/chat/completions", json=payload, timeout=120)
        resp.raise_for_status()
        response_data = resp.json()
        if 'choices' in response_data and len(response_data['choices']) > 0:
            return response_data['choices'][0]['message']['content']
        return ""

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _do_request)
    except Exception as e:
        print(f"❌ _call_agent_llm error: {e}")
        # Fallback to existing query_model
        result = query_model(prompt, model_name="llama3.2:3b")
        if asyncio.iscoroutine(result):
            result = await result
        return result


def _parse_json(text: str):
    """Extract JSON object from LLM output, tolerant of surrounding text and common LLM errors."""
    if not text:
        return None

    print(f"🔍 Agent LLM raw (first 500): {text[:500]}")

    # Strip markdown code fences
    cleaned = re.sub(r'```(?:json)?\s*', '', text)
    cleaned = re.sub(r'```', '', cleaned)

    # Extract the first complete JSON object using brace-depth matching
    candidate = None
    depth = 0
    start = None
    for i, ch in enumerate(cleaned):
        if ch == '{':
            if depth == 0:
                start = i
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0 and start is not None:
                candidate = cleaned[start:i + 1]
                break

    if not candidate:
        return None

    # Attempt 1: parse as-is
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass

    # Attempt 2: fix common LLM errors (single quotes, trailing commas)
    fixed = candidate
    fixed = re.sub(r"(?<![\w])'([^'\n]*)'\s*:", r'"\1":', fixed)   # 'key':
    fixed = re.sub(r":\s*'([^'\n]*)'", r': "\1"', fixed)           # : 'value'
    fixed = re.sub(r',\s*([}\]])', r'\1', fixed)                    # trailing commas
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    print(f"⚠️  Agent: JSON extraction failed on candidate: {candidate[:300]}")
    return None


async def stream_agent(query: str, workspace_id: Optional[str], conversation_history: list = None):
    """
    Async generator version of run_agent.
    Yields each step's formatted markdown string immediately as it completes,
    then yields the final answer as the last item.
    """
    history = conversation_history or []
    system_prompt = _build_system_prompt()
    observations = []
    seen_actions: set = set()

    yield "**🤖 Agent Reasoning**\n\n"

    current_prompt = f"{system_prompt}\n\nUser Query: {query}\n"

    for step in range(MAX_STEPS):
        if observations:
            obs_text = "\n".join(f"Observation {i+1}: {o}" for i, o in enumerate(observations))
            current_prompt += f"\n\nPrevious Steps:\n{obs_text}\n\nWhat do you do next?"

        llm_response = await _call_agent_llm(current_prompt)

        action_json = _parse_json(llm_response)
        if not action_json:
            print(f"⚠️  Agent: LLM did not return valid JSON at step {step + 1}")
            yield f"**Step {step + 1}** — ⚠️ Could not parse LLM response\n\n"
            break

        action = action_json.get("action", "finish")
        action_input = action_json.get("action_input", "")
        file_name = action_json.get("file_name", "")

        print(f"🤖 Agent step {step + 1}: {action} | {action_input[:80]}")

        if action == "finish":
            yield f"---\n\n{action_input}"
            return

        # Guard against repeated identical tool calls
        action_key = f"{action}::{action_input}"
        if action_key in seen_actions:
            print(f"⚠️  Agent: skipping duplicate action '{action_key}'")
            observations.append("Duplicate action skipped. Try a different approach.")
            continue
        seen_actions.add(action_key)

        if action not in TOOL_REGISTRY:
            observations.append(f"Unknown tool: {action}")
            continue

        # Emit minimal step line — just the tool name and input
        yield f"**Step {step + 1}** — 🔧 `{action}`: {action_input}\n\n"

        try:
            tool_meta = TOOL_REGISTRY[action]
            result = tool_meta["fn"](action_input, workspace_id, history, file_name=file_name)
            if asyncio.iscoroutine(result):
                result = await result
            observation = str(result)
            observations.append(observation)
        except Exception as e:
            print(f"❌ Agent tool error ({action}): {e}")
            err_msg = str(e)
            observations.append(f"Tool error: {err_msg}")

    # Exhausted steps — synthesize without truncation
    if observations:
        synthesis_prompt = (
            f"Based on these research results, answer the user's question: '{query}'\n\n"
            + "\n\n".join(observations)
        )
        final = await query_model(synthesis_prompt, model_name="llama3.2:3b")
        yield f"---\n\n{final}"
    else:
        yield "---\n\nI was unable to find a satisfactory answer. Please try rephrasing your query."


async def run_agent(query: str, workspace_id: Optional[str], conversation_history: list = None):
    """
    Run the ReAct agent loop for a given query.
    Returns the full response as a single string (collects all streamed chunks).
    Used by the MCP tool in main.py.
    """
    chunks = []
    async for chunk in stream_agent(query, workspace_id, conversation_history):
        chunks.append(chunk)
    return "".join(str(c) if c is not None else "" for c in chunks)



