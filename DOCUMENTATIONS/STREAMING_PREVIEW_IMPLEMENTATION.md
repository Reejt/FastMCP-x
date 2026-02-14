# Streaming Preview Implementation

## Overview

**Streaming Preview** enables real-time display of LLM-generated document content in the `DocumentPreviewPanel` as it streams from the backend. Instead of waiting for the full response to complete, users see the document being built live in the preview panel.

---

## Feature Behavior

```
User: "Write a marketing plan"
         ↓
LLM starts streaming response
         ↓
useDocumentDetector identifies document creation intent
         ↓
DocumentPreviewPanel opens on right (45% width)
         ↓
As LLM streams each chunk → preview panel updates in real-time
         ↓
Chat bubble fills simultaneously
         ↓
User sees document taking shape live in preview while chat captures full context
```

---

## Architecture

### Current Flow (Without Streaming)
1. User sends message
2. LLM generates full response
3. Assistant message appears in chat (complete)
4. `useDocumentDetector` detects document type in finished message
5. Preview panel opens with full content

### New Flow (With Streaming)
1. User sends message
2. LLM **starts streaming** → chunks arrive incrementally
3. Chat bubble updates chunk-by-chunk
4. `useDocumentDetector` **detects within first chunk** (detection starts early)
5. Preview panel opens **immediately** with initial chunk
6. As more chunks arrive → **preview content updates in real-time**
7. Finished message → preview locked with complete content

---

## Component Changes

### 1. `useDocumentDetector` Hook

**New Parameters:**
```typescript
interface UseDocumentDetectorOptions {
  minContentLength?: number  // Optional: minimum chars (default 150)
  enableStreamingPreview?: boolean  // NEW: enable real-time updates (default true)
  onStreamingDetected?: (documentData: DocumentData) => void  // NEW: callback when detection happens
}
```

**New Behavior:**
- Early detection: triggers when first assistant message arrives (even if streaming)
- Tracks `isStreaming` state from message
- Returns partial content as it accumulates
- Updates `currentDocument` ref on every content change

**Implementation Logic:**
```typescript
export const useDocumentDetector = (
  messages: Message[],
  options?: UseDocumentDetectorOptions
) => {
  const [currentDocument, setCurrentDocument] = useState<DocumentData | null>(null)
  const [isDocumentPanelOpen, setIsDocumentPanelOpen] = useState(false)
  const processedMessageIds = useRef<Set<string>>(new Set())
  const streamingMessageId = useRef<string | null>(null)
  
  useEffect(() => {
    if (!messages.length) return
    
    const lastMessage = messages[messages.length - 1]
    
    // For ASSISTANT messages (both streaming and finished)
    if (lastMessage.role === 'assistant') {
      const shouldProcess = 
        !processedMessageIds.current.has(lastMessage.id) &&
        (lastMessage.content || lastMessage.isStreaming)
      
      if (shouldProcess) {
        // Get previous user message (contains creation intent)
        const userMessage = messages[messages.length - 2]
        if (userMessage?.role === 'user') {
          const detectionResult = detectDocumentIntent(
            userMessage.content,
            lastMessage.content || ''
          )
          
          if (detectionResult) {
            const documentData = createDocumentData(
              lastMessage.id,
              detectionResult.type,
              userMessage.content,
              lastMessage.content || '', // can be partial if streaming
              lastMessage.isStreaming
            )
            
            setCurrentDocument(documentData)
            setIsDocumentPanelOpen(true)
            
            // Track this message
            if (!lastMessage.isStreaming) {
              processedMessageIds.current.add(lastMessage.id)
            } else {
              // For streaming: track when finished
              streamingMessageId.current = lastMessage.id
            }
            
            // Callback for parent awareness
            options?.onStreamingDetected?.(documentData)
          }
        }
      } else if (lastMessage.isStreaming && streamingMessageId.current === lastMessage.id) {
        // UPDATE existing document with new streaming content
        if (currentDocument) {
          setCurrentDocument(prev => prev ? {
            ...prev,
            content: lastMessage.content || prev.content,
            metadata: {
              wordCount: calculateWordCount(lastMessage.content || ''),
              estimatedReadTime: calculateReadTime(lastMessage.content || '')
            }
          } : null)
        }
      } else if (!lastMessage.isStreaming && streamingMessageId.current === lastMessage.id) {
        // Mark as finished processing
        processedMessageIds.current.add(lastMessage.id)
        streamingMessageId.current = null
      }
    }
  }, [messages, options?.enableStreamingPreview])
  
  const closeDocumentPanel = () => {
    setIsDocumentPanelOpen(false)
  }
  
  const openDocumentPanel = () => {
    setIsDocumentPanelOpen(true)
  }
  
  return {
    currentDocument,
    isDocumentPanelOpen,
    closeDocumentPanel,
    openDocumentPanel
  }
}
```

---

### 2. `DocumentPreviewPanel` Component

**New Props:**
```typescript
interface DocumentPreviewPanelProps {
  isOpen: boolean
  document: DocumentData | null
  onClose: () => void
  isStreaming?: boolean  // NEW: indicates active streaming
}
```

**Streaming UI Indicators:**
```tsx
export default function DocumentPreviewPanel({
  isOpen,
  document,
  onClose,
  isStreaming
}: DocumentPreviewPanelProps) {
  
  return (
    <div className="w-[45%] h-full flex flex-col border-l" style={{ borderColor: theme.border }}>
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: theme.border }}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Document icon + title */}
          <span className="text-lg">📄</span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold truncate">{document?.title}</h3>
            <div className="text-xs flex items-center gap-1" style={{ color: theme.textMuted }}>
              {document?.metadata?.wordCount} words
              {document?.metadata?.estimatedReadTime && (
                <>
                  <span>•</span>
                  <span>{document.metadata.estimatedReadTime} min read</span>
                </>
              )}
              {/* STREAMING INDICATOR */}
              {isStreaming && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></span>
                    Updating...
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        
        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <button onClick={handleCopy} title="Copy to clipboard">
            <svg className="w-4 h-4" />
          </button>
          <button onClick={handleDownload} title="Download">
            <svg className="w-4 h-4" />
          </button>
          <button onClick={onClose} title="Close">
            <svg className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {document ? (
          <>
            {/* Document type badge */}
            <span className="inline-block px-2 py-1 text-xs font-semibold rounded mb-3"
              style={{ backgroundColor: theme.cardBg, color: theme.textSecondary }}>
              {document.type.charAt(0).toUpperCase() + document.type.slice(1)}
            </span>
            
            {/* Markdown content */}
            <div className="prose prose-invert text-sm">
              <MarkdownRenderer content={document.content} />
              
              {/* Streaming placeholder while content builds */}
              {isStreaming && document.content.length > 0 && (
                <span className="inline-block w-2 h-5 animate-pulse ml-1" 
                  style={{ backgroundColor: 'var(--text-secondary)' }} />
              )}
            </div>
            
            {/* Empty state for early streaming */}
            {isStreaming && !document.content && (
              <div className="flex items-center justify-center h-32" style={{ color: theme.textMuted }}>
                <span className="text-sm animate-pulse">Generating document...</span>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full" style={{ color: theme.textMuted }}>
            <span className="text-sm">Select a document to preview</span>
          </div>
        )}
      </div>
    </div>
  )
}
```

---

### 3. `WorkspaceIntroduction` Component

**Key Changes:**
```tsx
// Pass streaming state to hook
const { currentDocument, isDocumentPanelOpen, closeDocumentPanel } = 
  useDocumentDetector(messages, {
    enableStreamingPreview: true
  })

// In chat mode JSX, update DocumentPreviewPanel prop:
{isDocumentPanelOpen && (
  <div className="w-[45%] h-full p-3 flex-shrink-0">
    <DocumentPreviewPanel 
      isOpen={isDocumentPanelOpen} 
      document={currentDocument} 
      onClose={closeDocumentPanel}
      isStreaming={messages[messages.length - 1]?.isStreaming} // NEW
    />
  </div>
)}
```

---

## Real-Time Content Updates

### Data Flow During Streaming

```
Backend (Ollama)
    ↓ streams chunks
Bridge Server (FastAPI)
    ↓ accumulates & sends to frontend
Frontend WebSocket/Fetch
    ↓ receives partial message
WorkspaceIntroduction
    ↓ updates messages array
useDocumentDetector
    ↓ (1) detects document intent on first chunk
    ↓ (2) updates currentDocument on each new chunk
DocumentPreviewPanel
    ↓ re-renders with latest content
User sees live preview
```

### Message State During Streaming

```typescript
// Message structure during streaming
{
  id: "msg_123",
  role: "assistant",
  content: "# Marketing Plan\n\n## Executive Summary\n\nThis...", // accumulates chunks
  isStreaming: true,  // flag indicates streaming active
  createdAt: Date,
  updatedAt: Date  // updates on each chunk
}
```

### Update Mechanism

1. **Chunk Arrives** → Message content appended
2. **Messages Array Updated** → triggers effects
3. **useDocumentDetector Re-runs** → detects if same message ID
4. **currentDocument State Updated** → new content + metadata
5. **DocumentPreviewPanel Re-renders** → displays latest content

---

## Word Count & Read Time

**Calculate on Every Update:**

```typescript
const calculateWordCount = (content: string): number => {
  return content.trim().split(/\s+/).length
}

const calculateReadTime = (content: string): number => {
  const wordCount = calculateWordCount(content)
  return Math.ceil(wordCount / 200) // ~200 words per minute
}
```

Updates in real-time as content streams.

---

## Streaming Indicators

### Visual Feedback
- **Pulsing dot** in metadata: `Updating...` with animated orange dot
- **Animated cursor** at end of content: blinking line while content generates
- **Loading state** if content hasn't started: "Generating document..."

### Disabled Operations During Streaming
- Download button disabled (until finished)
- Copy button works but mentions it's partial

---

## Edge Cases & Considerations

### 1. Non-Document Streams
If a user asks for code, explanation, etc. (no document intent):
- Hook doesn't detect as document
- Panel stays closed
- No preview appears
- Normal chat flow continues

### 2. Document + Diagram in Same Response
Unlikely but possible:
- `useDocumentDetector` runs first (alphabetically in code)
- Takes precedence
- Diagram detection skipped

### 3. Switching Between Streaming Messages
If user rapidly sends multiple messages:
- Previous streaming reference cleared
- New message becomes current
- Preview updates to new document

### 4. Canceling a Stream
When user clicks cancel button:
- `isStreaming` becomes false
- Message marked complete
- Preview locks with partial content
- Can be reopened manually

### 5. Very Long Documents
Preview panel scrolls independently:
- User can read while LLM still generating
- Scroll doesn't jump to bottom automatically (unlike chat)
- Up arrow appears to jump to top when scrolled down

---

## Implementation Checklist

- [ ] Modify `useDocumentDetector` hook with streaming detection logic
- [ ] Add `isStreaming` parameter to `DocumentPreviewPanel`
- [ ] Add visual streaming indicators (pulsing dot, cursor, loading state)
- [ ] Update `WorkspaceIntroduction` to pass `isStreaming` prop
- [ ] Implement real-time word count/read time calculation
- [ ] Test with various content lengths
- [ ] Test stream cancellation behavior
- [ ] Test non-document queries (no false positives)
- [ ] Verify scroll behavior in long documents
- [ ] Style consistency with existing theme system

---

## Testing Scenarios

| Scenario | Expected Behavior |
|----------|---|
| User requests document while LLM slow to respond | Panel opens with "Generating document..." placeholder |
| Streaming content arrives in chunks | Preview updates 1-3x per second |
| User cancels stream mid-generation | Preview locks with partial content |
| Content is < 150 chars | Panel may not open (or shows anyway if streaming) |
| User switches topics mid-stream | Previous preview closes, new one opens |
| Very long document (5000+ words) | Scrolls independently, no jank |
| Mobile/small screen | Panel may not appear (or adapts to stacked layout) |

---

## Performance Notes

- **No performance impact**: Uses existing Message updates (already streaming)
- **Minimal re-renders**: Only DocumentPreviewPanel re-renders on content change
- **Memory efficient**: Doesn't cache old documents (only current)
- **Smooth animations**: CSS transitions for panel slide-in and content updates

---

## Browser Compatibility

- Works with existing streaming implementation
- No new APIs required
- CSS animations fallback gracefully on older browsers

