# Diagram-Only Response Design

## Overview
When users ask diagrammatic queries, the system should **only generate and return diagrams** without providing text-based query responses. This creates a focused, visual-first experience for diagram-related requests.

## Current Behavior
```
User: "Create a flowchart for user authentication"
    ↓
Frontend: isDiagramQuery() = true
    ↓
Backend: /api/chat/query → LLM generates text response
    ↓
Frontend: Shows text response + detects mermaid blocks
    ↓
Frontend: /api/diagram → Generates diagram from text
    ↓
Result: Both text answer AND diagram shown
```

## Desired Behavior
```
User: "Create a flowchart for user authentication"
    ↓
Frontend: isDiagramQuery() = true
    ↓
Frontend: Skip text response, directly call /api/diagram
    ↓
Backend: Generates diagram from query intent
    ↓
Result: Only diagram shown (no text response)
```

## Implementation Components

### 1. Frontend Changes (dashboard/page.tsx)

#### A. Modify handleSendMessage()
```typescript
const handleSendMessage = async (content: string, selected_file_ids?: string[]) => {
  // Check if this is a diagram query
  if (hasDiagramQuery) {
    // Skip normal chat flow - go directly to diagram generation
    await generateDiagramDirectly(content, assistantMessageId)
    return
  }
  
  // Normal chat flow (existing code)
  // ...
}
```

#### B. New Function: generateDiagramDirectly()
```typescript
const generateDiagramDirectly = async (query: string, messageId: string) => {
  // Add user message
  const userMessage: Message = {
    id: Date.now().toString(),
    content: query,
    role: 'user',
    timestamp: new Date()
  }
  setMessages(prev => [...prev, userMessage])

  try {
    // Call /api/diagram directly with user query
    const response = await fetch('/api/diagram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query,
        diagram_type: detectDiagramType(query),
        workspace_id: workspaceId
      })
    })

    const result = await response.json()
    
    if (result.success) {
      // Add diagram to detected diagrams
      addDynamicDiagram({
        id: messageId,
        type: result.diagram_type,
        title: `Generated ${result.diagram_type}`,
        mermaidCode: extractMermaidCode(result.diagram),
        createdAt: new Date()
      })
      
      // Show diagram panel
      showDiagram(messageId)
      
      // Optional: Add system message indicating diagram was generated
      const systemMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: `📊 Generated ${result.diagram_type} diagram`,
        role: 'system',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, systemMsg])
    }
  } catch (error) {
    // Handle error - show error message instead
  }
}
```

### 2. Backend Changes (bridge_server.py)

#### A. Modify /api/diagram Endpoint
Current signature:
```python
@app.post("/api/diagram")
async def generate_diagram(request: DiagramRequest):
    # request.query_result - already formatted result
```

New signature:
```python
@app.post("/api/diagram")
async def generate_diagram(request: DiagramRequest):
    # Support both:
    # 1. query_result - existing formatted content
    # 2. query - direct user question (NEW)
    
    if request.query:
        # Direct diagram generation from query
        diagram = generate_diagram_from_query(
            query=request.query,
            diagram_type=request.diagram_type
        )
    else:
        # Existing flow - format already-generated content
        diagram = generate_diagram_from_content(
            content=request.query_result,
            diagram_type=request.diagram_type
        )
```

#### B. New Endpoint Handler
```python
async def generate_diagram_from_query(query: str, diagram_type: str = 'auto'):
    """
    Generate diagram directly from user query without intermediate text response
    
    Flow:
    1. Detect diagram type from query
    2. Build LLM prompt for diagram generation
    3. Call LLM to generate mermaid code
    4. Validate mermaid syntax
    5. Return diagram
    """
    
    # Prompt engineering for direct diagram generation
    system_prompt = """You are a diagram generation expert. 
    Generate ONLY valid mermaid diagram code based on the user's request.
    Return ONLY the mermaid code block, nothing else.
    Wrap in ```mermaid tags."""
    
    response = llm_call(
        system_prompt=system_prompt,
        user_prompt=query
    )
    
    return parse_diagram(response)
```

### 3. Frontend Diagram Detection

#### Enhance isDiagramQuery()
```typescript
export function isDiagramQuery(query: string): boolean {
  // Existing patterns...
  // Should return true ONLY for requests that are PRIMARILY about diagrams
  
  // Current patterns work, but consider filtering:
  // - "Show me" + diagram keyword ✅
  // - "Create" + diagram keyword ✅
  // - "Draw" + diagram keyword ✅
  // - "Visualize" + data ✅
  // - "What is" + general question ❌ (text answer better)
  // - "Explain" + concept ❌ (text answer better)
}
```

#### Add detectDiagramType()
```typescript
export function detectDiagramType(query: string): string {
  // Already exists - use this to hint backend
  const queryLower = query.toLowerCase()
  
  if (/\bpie\b|pie\s+chart/.test(queryLower)) return 'pie'
  if (/\bflowchart\b|\bflow\b/.test(queryLower)) return 'flowchart'
  if (/\bgantt\b/.test(queryLower)) return 'gantt'
  if (/\bsequence\b/.test(queryLower)) return 'sequence'
  if (/\bclass\s+diagram|\bclass\b/.test(queryLower)) return 'class'
  if (/\bbar\b|bar\s+chart|bar\s+graph/.test(queryLower)) return 'bar'
  if (/\bmindmap\b|\bmind\s+map/.test(queryLower)) return 'mindmap'
  
  return 'auto'
}
```

### 4. API Request/Response Updates

#### DiagramRequest (frontend diagram-client.ts)
```typescript
export interface DiagramRequest {
  query_result?: string        // Existing: formatted content
  query?: string              // NEW: direct user query
  diagram_type?: string
  workspace_id?: string
}
```

#### DiagramResponse
```typescript
export interface DiagramResponse {
  success: boolean
  diagram: string
  diagram_type: string
  raw_response?: string
  error?: string
  markdown?: string
  done?: boolean
  source: 'query' | 'content'  // Indicate source
}
```

## Flow Comparison

### Text Query (existing)
```
User Query
  ↓
chat/query endpoint
  ↓
LLM generates text response
  ↓
Add to chat (text shown)
  ↓
Detect mermaid blocks
  ↓
diagram endpoint (optional)
  ↓
Show diagram panel (alongside text)
```

### Diagram Query (new)
```
User Query
  ↓
isDiagramQuery() check
  ↓
diagram endpoint directly
  ↓
LLM generates mermaid code
  ↓
Add to diagram panel (diagram shown)
  ↓
Optional: system message only
  ↓
No text response in chat
```

## Edge Cases & Considerations

### 1. Ambiguous Queries
```
"Show me a pie chart of sales by region and explain the trends"
- Currently: Would be detected as diagram query
- Solution: Check if query has explanatory keywords → use text + diagram
- Decision: Keep simple - if diagram keyword present, diagram-only
```

### 2. User Corrections
```
"That diagram is wrong, adjust the flow"
- Currently: diagram-only mode
- Solution: Allow follow-up queries in diagram context
- Decision: Treat as new diagram query or context-aware diagram refinement
```

### 3. Fallback Behavior
```
If diagram generation fails:
- Option A: Show error message only
- Option B: Fall back to text explanation
- Decision: Option A - error message + user can retry
```

### 4. Database Storage
```
For diagram-only responses:
- Save to chat history as: role='assistant', content='[DIAGRAM ONLY]'
- Store actual diagram in separate diagrams table
- Decision: TBD - depends on chat history requirements
```

## Implementation Phases

### Phase 1: Frontend Detection Only
- Modify `handleSendMessage()` to detect diagram queries
- Route diagram queries to `generateDiagramDirectly()`
- Test with mock responses

### Phase 2: Backend Endpoint
- Update `/api/diagram` to accept `query` parameter
- Implement `generate_diagram_from_query()`
- Add LLM prompt engineering for diagram generation

### Phase 3: Enhancement
- Add diagram refinement (follow-up queries in diagram context)
- Implement diagram-only chat session type
- Add diagram analytics/tracking

### Phase 4: Optimization
- Cache generated diagrams
- Implement diagram history/variants
- Add diagram export options

## Testing Scenarios

1. **Basic Diagram Query**
   - Input: "Create a flowchart for a user login process"
   - Expected: Only diagram shown, no text response

2. **Ambiguous Query**
   - Input: "Create a pie chart and explain it"
   - Expected: Diagram-only (per current design)

3. **Non-Diagram Query**
   - Input: "What is REST API?"
   - Expected: Normal text response, no diagram attempt

4. **Invalid Diagram Query**
   - Input: "Create an impossible diagram type"
   - Expected: Error message, user can clarify

5. **Diagram with Context**
   - Previous: "Create a flowchart..."
   - Follow-up: "Add error handling to the flow"
   - Expected: Refined diagram

## Questions for Implementation

1. Should diagram-only mode apply to workspace chats or all chats?
2. Should system messages appear for diagram-only responses?
3. How to handle diagram refinement queries?
4. Should failed diagrams fall back to text responses?
5. How to store diagram-only responses in chat history?
