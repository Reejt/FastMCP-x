# Agent Implementation Guide

## Overview

This document describes how to add agent (autonomous multi-step reasoning) functionality to FastMCP while keeping all existing tool endpoints intact. The agent layer sits **on top of** existing tools — nothing is removed or replaced.

---

## Architecture: Before vs After

### Current (Single-Tool Per Turn)
```
Frontend → Bridge Server → fast_mcp_client → single @mcp.tool → response
```

### With Agent Layer
```
Frontend
  ├─ Simple query  → Bridge Server → fast_mcp_client → single @mcp.tool → response  (unchanged)
  └─ Agent query   → Bridge Server → /api/agent/query
                                         └─ AgentLoop
                                               ├─ Reason: which tools are needed?
                                               ├─ Act:    call tool 1
                                               ├─ Observe: tool 1 result
                                               ├─ Act:    call tool 2 (if needed)
                                               ├─ Observe: tool 2 result
                                               └─ Synthesize final answer → response
```

---

## Available Tools (Agent Action Space)

These are the existing `@mcp.tool`-registered functions the agent can call:

| Tool | Function | When to Use |
|---|---|---|
| `answer_query_tool` | `query_handler.answer_query` | Semantic search over ingested documents |
| `web_search_tool` | `enhanced_web_search.enhanced_web_search` | Real-time web information |
| `query_csv_with_context_tool` | `query_handler.query_csv_with_context` | Natural language over CSV files |
| `query_excel_with_context_tool` | `query_handler.query_excel_with_context` | Natural language over Excel files |
| `convert_to_mermaid_tool` | `mermaid_converter.convert_query_to_mermaid_markdown` | Generate diagrams |
| `ingest_file_tool` | `document_ingestion.ingest_file` | Upload documents |

Connectors available via `server/connectors/`: `gdrive`, `gmail`, `slack`, `onedrive` — these can be exposed as additional agent tools.

---

## New Files to Create

### 1. `server/agent.py` — Core Agent Loop

This is the main agent reasoning engine. It uses a **ReAct (Reason + Act)** loop with the existing Ollama LLM.

```python
"""
Agent Loop for FastMCP - ReAct Pattern
Reason → Act (call tool) → Observe (tool result) → Repeat until done
"""
import json
import re
from typing import Optional
from server.query_handler import query_model
from server.query_handler import answer_query, query_csv_with_context, query_excel_with_context
from server.mermaid_converter import convert_query_to_mermaid_markdown
from server.enhanced_web_search import enhanced_web_search

MAX_STEPS = 5  # Safety cap on reasoning iterations

TOOL_REGISTRY = {
    "search_documents": {
        "description": "Semantic search over ingested workspace documents. Use when user asks about uploaded files or internal knowledge.",
        "fn": lambda query, workspace_id, history: answer_query(query, conversation_history=history, workspace_id=workspace_id),
    },
    "web_search": {
        "description": "Search the web for real-time or external information. Use when question is about current events or topics not in documents.",
        "fn": lambda query, workspace_id, history: enhanced_web_search(query=query, conversation_history=history),
    },
    "query_csv": {
        "description": "Query a CSV file using natural language. Use when user asks about tabular CSV data. Requires file_name.",
        "fn": lambda query, workspace_id, history, file_name="": query_csv_with_context(query=query, file_name=file_name, conversation_history=history),
    },
    "query_excel": {
        "description": "Query an Excel file using natural language. Use when user asks about spreadsheet data. Requires file_name.",
        "fn": lambda query, workspace_id, history, file_name="": query_excel_with_context(query=query, file_name=file_name, conversation_history=history),
    },
    "generate_diagram": {
        "description": "Generate a Mermaid diagram from text or data. Use when user requests a visual chart, flowchart, or timeline.",
        "fn": lambda query, workspace_id, history: convert_query_to_mermaid_markdown(query=query),
    },
}


def build_system_prompt() -> str:
    tool_descriptions = "\n".join(
        f"- {name}: {meta['description']}" for name, meta in TOOL_REGISTRY.items()
    )
    return f"""You are an intelligent agent with access to the following tools:

{tool_descriptions}

Respond ONLY in this JSON format at each step:
{{
  "thought": "Your reasoning about what to do next",
  "action": "tool_name",          // one of the tools above, or "finish"
  "action_input": "query to pass to the tool",
  "file_name": ""                 // only needed for query_csv or query_excel
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
"""


def run_agent(query: str, workspace_id: Optional[str], conversation_history: list = None) -> str:
    """
    Run the ReAct agent loop for a given query.
    Returns the final synthesized answer.
    """
    history = conversation_history or []
    system_prompt = build_system_prompt()
    steps_taken = []
    observations = []

    current_prompt = f"{system_prompt}\n\nUser Query: {query}\n"

    for step in range(MAX_STEPS):
        # Ask LLM what to do next
        if observations:
            obs_text = "\n".join(f"Observation {i+1}: {o}" for i, o in enumerate(observations))
            current_prompt += f"\n\nPrevious Steps:\n{obs_text}\n\nWhat do you do next?"

        llm_response = query_model(current_prompt, model="llama3.2:3b")

        # Parse JSON from LLM response
        action_json = _parse_json(llm_response)
        if not action_json:
            break  # LLM failed to follow format, stop

        thought = action_json.get("thought", "")
        action = action_json.get("action", "finish")
        action_input = action_json.get("action_input", "")
        file_name = action_json.get("file_name", "")

        steps_taken.append({"thought": thought, "action": action, "input": action_input})

        if action == "finish":
            return action_input  # Final answer

        # Execute chosen tool
        if action in TOOL_REGISTRY:
            try:
                tool_fn = TOOL_REGISTRY[action]["fn"]
                if action in ("query_csv", "query_excel"):
                    result = tool_fn(action_input, workspace_id, history, file_name)
                else:
                    result = tool_fn(action_input, workspace_id, history)
                # Handle coroutines (async tools like web_search)
                import asyncio
                if asyncio.iscoroutine(result):
                    result = asyncio.run(result)
                observations.append(str(result)[:2000])  # Cap observation length
            except Exception as e:
                observations.append(f"Tool error: {str(e)}")
        else:
            observations.append(f"Unknown tool: {action}")

    # If we exhaust steps without "finish", synthesize from observations
    if observations:
        synthesis_prompt = (
            f"Based on these research results, answer the user's question: '{query}'\n\n"
            + "\n\n".join(observations)
        )
        return query_model(synthesis_prompt, model="llama3.2:3b")

    return "I was unable to find a satisfactory answer. Please try rephrasing your query."


def _parse_json(text: str) -> Optional[dict]:
    """Extract JSON object from LLM output, tolerant of surrounding text."""
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None
```

---

## Bridge Server Changes (`bridge_server.py`)

Add one new endpoint alongside existing ones. **All existing endpoints remain unchanged.**

```python
# Add to imports at top of bridge_server.py
from server.agent import run_agent

# Add new Pydantic model
class AgentQueryRequest(BaseModel):
    query: str
    workspace_id: Optional[str] = None
    conversation_history: Optional[list] = []
    user_id: Optional[str] = None

# Add new endpoint (does NOT touch /api/query)
@app.post("/api/agent/query")
async def agent_query_endpoint(request: AgentQueryRequest):
    """
    Agent endpoint: autonomous multi-step reasoning over all available tools.
    Use when query requires combining documents, web search, or diagram generation.
    """
    try:
        result = run_agent(
            query=request.query,
            workspace_id=request.workspace_id,
            conversation_history=request.conversation_history or [],
        )
        return JSONResponse(content={"result": result, "mode": "agent"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

---

## Frontend Integration

Add an "Agent Mode" toggle button to the chat input area. When enabled, queries go to `/api/agent/query` instead of `/api/query`.

```typescript
// In your chat component
const endpoint = agentMode ? '/api/agent/query' : '/api/query';

const response = await fetch(`http://localhost:3001${endpoint}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: userMessage,
    workspace_id: currentWorkspace?.id,
    conversation_history: chatHistory,
  }),
});
```

---

## MCP Tool Registration (`server/main.py`)

Register the agent as an MCP tool so it is accessible from any MCP client:

```python
from server.agent import run_agent

@mcp.tool
def agent_query_tool(
    query: str,
    workspace_id: Optional[str] = None,
    conversation_history: str = "[]"
) -> str:
    """
    Autonomous agent that reasons over multiple tools to answer complex queries.
    Use for multi-step questions combining documents, web search, or diagram generation.
    """
    try:
        history = json.loads(conversation_history) if conversation_history else []
        return run_agent(query=query, workspace_id=workspace_id, conversation_history=history)
    except Exception as e:
        return f"Agent error: {str(e)}"
```

---

## Example Agent Runs

### Example 1: Compare internal docs with web
> *"Compare our Q3 sales data from uploaded files with current market trends"*

```
Thought: I need internal data and external web info
Action: search_documents
Input: "Q3 sales data"

Observation: [Internal doc chunks about Q3 performance...]

Thought: Now I need current market trends
Action: web_search
Input: "current market trends Q3 2025"

Observation: [Web search results about market trends...]

Thought: I have both. I can now compare them.
Action: finish
Input: "Our Q3 sales showed X... compared to the market trend of Y..."
```

### Example 2: Data visualization
> *"Show me a diagram of our product pipeline from the uploaded roadmap file"*

```
Thought: I need to find the roadmap content first
Action: search_documents
Input: "product pipeline roadmap"

Observation: [Roadmap document chunks...]

Thought: Now I can generate a diagram from this data
Action: generate_diagram
Input: "product pipeline: [extracted roadmap data]"

Observation: [Mermaid diagram syntax...]

Action: finish
Input: "```mermaid\n[diagram]```"
```

### Example 3: Single-tool query (bypasses agent)
> *"What is our refund policy?"*

- User has agent toggle **off**
- Routes directly to existing `/api/query` → `answer_query_tool`
- No agent overhead

---

## What Stays the Same

| Component | Status |
|---|---|
| All `@mcp.tool` registrations in `main.py` | **Unchanged** |
| `/api/query` endpoint in `bridge_server.py` | **Unchanged** |
| `/api/web-search`, `/api/diagram` endpoints | **Unchanged** |
| `query_handler.py`, `enhanced_web_search.py` | **Unchanged** |
| `fast_mcp_client.py` | **Unchanged** |
| All connector logic | **Unchanged** |
| Frontend chat UI | **Minimal change** (one toggle button added) |

---

## Limitations & Considerations

- **Latency**: Agent runs 2–5 LLM calls per query vs 1. Use only for complex queries.
- **LLM Format Compliance**: `llama3.2:3b` may not consistently output valid JSON. Consider upgrading to `llama3.2:8b` or adding retries in `_parse_json`.
- **Streaming**: The current agent returns a complete response. For streaming support, yield observations progressively via SSE (same pattern as existing streaming in `bridge_server.py`).
- **Max Steps**: `MAX_STEPS = 5` is a safeguard. Increase only if needed; each extra step adds latency.
- **Async Tools**: `web_search_tool` is async; `run_agent` wraps it with `asyncio.run()`. If `run_agent` itself runs inside an async context, use `await` instead.
