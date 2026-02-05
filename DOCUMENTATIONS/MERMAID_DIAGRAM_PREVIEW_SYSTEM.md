# Mermaid Diagram Preview System with Pop-in Display

## Overview

This document outlines a design for integrating mermaid diagram previews, downloads, and exports into FastMCP, inspired by Codigram's clean, minimal interface. The diagram viewer displays as a pop-in panel on the right side of the screen with full preview, editing, and export capabilities.

---

## Architecture

### User Flow

```
User Input (Text/Prompt)
    ↓
Parse Mermaid Syntax
    ↓
Validate Diagram
    ↓
Trigger Right Panel Pop-in
    ↓
Display Preview + Controls
    ↓
User Actions: Preview | Download | Export | Edit
```

### Component Structure

```
MainChatInterface
├── ChatContainer (Left 60-70%)
│   ├── MessageList
│   ├── InputArea
│   └── MermaidDetector
│
└── DiagramPreviewPanel (Right 30-40%, Pop-in)
    ├── DiagramHeader
    │   ├── Title
    │   └── CloseButton
    ├── DiagramCanvas
    │   └── MermaidRenderer
    ├── ControlsBar
    │   ├── PreviewToggle
    │   ├── ExportOptions
    │   ├── DownloadButton
    │   └── EditButton
    └── MetadataFooter
        ├── DiagramType
        ├── Timestamp
        └── DiagramSize
```

---

## Key Features

### 1. **Automatic Detection**
   - Detects mermaid code blocks in chat responses
   - Pattern: ` ```mermaid ... ``` `
   - Automatically triggers pop-in panel

### 2. **Preview Modes**
   - **Live Preview**: Real-time rendering as user edits
   - **SVG Preview**: Vector format for clarity
   - **Code View**: Show/hide raw mermaid syntax
   - **Full-Screen**: Expand diagram to full viewport

### 3. **Export Options**
   - **PNG**: Raster export with configurable DPI (72/150/300)
   - **SVG**: Vector export with full scalability
   - **PDF**: Vector PDF for documents
   - **Copy as SVG**: Direct clipboard copy
   - **Share Link**: Generate shareable diagram link

### 4. **Download Functionality**
   - One-click download with sensible naming: `diagram_flowchart_20260202.png`
   - Batch download multiple diagrams as ZIP
   - Save history to local storage

### 5. **Diagram Types Supported**
   All mermaid diagram types are supported, including but not limited to:
   - Flowchart
   - Pie Chart
   - Gantt Chart
   - Sequence Diagram
   - Class Diagram
   - State Diagram
   - ER Diagram
   - Mind Map
   - User Journey
   - Git Graph
   - Timeline
   - Quadrant Chart
   - Requirement Diagram
   - Bar Charts
   - Line Charts
   - Sankey Diagrams
   - XY Charts
   - Any other mermaid-supported chart types

---

## UI/UX Design

### Pop-in Panel Layout

```
┌─────────────────────────────────────────┐
│ Mermaid Diagram Preview          [×]    │  ← Header with Close
├─────────────────────────────────────────┤
│                                         │
│                                         │
│          SVG DIAGRAM RENDER             │  ← Canvas (Centered, Scrollable)
│                                         │
│                                         │
├─────────────────────────────────────────┤
│ [Preview] [Code] [Fullscreen] [Reset]   │  ← View Toggles
├─────────────────────────────────────────┤
│ [PNG ↓] [SVG ↓] [PDF ↓] [Copy] [Share] │  ← Export Controls
├─────────────────────────────────────────┤
│ Type: Flowchart | Size: 45KB | UTC Time │  ← Metadata
└─────────────────────────────────────────┘
```

### Animations
- **Slide-in**: Panel slides in from right with fade (300ms)
- **Hover States**: Button feedback, icon color changes
- **Loading**: Spinner while rendering large diagrams
- **Success Toast**: "Copied to clipboard", "Downloaded successfully"

---

## Technical Implementation Details

### Frontend Components (Next.js/React)

#### 1. MermaidDetector Component
```typescript
Props:
  - messageContent: string
  - onDiagramDetected: (diagram: DiagramData) => void

Functionality:
  - Parse message for mermaid code blocks
  - Extract diagram type and syntax
  - Validate syntax with mermaid parser
  - Trigger panel open
```

#### 2. DiagramPreviewPanel Component
```typescript
Props:
  - isOpen: boolean
  - diagram: DiagramData
  - onClose: () => void
  - onExport: (format: ExportFormat) => void

State:
  - viewMode: 'preview' | 'code' | 'fullscreen'
  - isRendering: boolean
  - errorMessage?: string
  - selectedExportFormat?: ExportFormat

Events:
  - downloadPNG()
  - downloadSVG()
  - downloadPDF()
  - copyToClipboard()
  - generateShareLink()
  - editDiagram()
```

#### 3. DiagramCanvas Component
```typescript
Props:
  - mermaidCode: string
  - diagramType: DiagramType
  - theme: 'light' | 'dark'

Responsibilities:
  - Display rendered SVG diagram from Mermaid
  - Handle canvas interactions (zoom, pan)
  - Error boundary for invalid syntax
  - Performance optimization for large diagrams
```

### Export Engine (Backend)

```python
# server/diagram_export.py

Functions:
  - render_to_png(svg_string: str, dpi: int = 150) -> bytes  # Convert existing SVG to PNG
  - render_to_pdf(svg_string: str) -> bytes                  # Convert existing SVG to PDF
  - generate_share_link(diagram: DiagramData) -> str         # Create shareable URLs
  - compress_diagram(svg: str) -> str                        # Optimize SVG size

# Note: SVG rendering is handled client-side by Mermaid.js
# Backend receives pre-rendered SVG for export conversions
```

---

## Data Model

### DiagramData TypeScript Interface
```typescript
interface DiagramData {
  id: string;                    // UUID
  type: DiagramType;             // flowchart, sequence, etc.
  title: string;                 // Auto-generated from content
  mermaidCode: string;           // Raw mermaid syntax
  svgRendered: string;           // Cached SVG output
  createdAt: Date;               // Timestamp
  createdBy: string;             // User ID
  isPublic: boolean;             // Shareability flag
  theme: 'light' | 'dark';       // Render theme
  version: number;               // Version tracking
  metadata: {
    lines: number;
    complexity: 'simple' | 'medium' | 'complex';
    estimatedRenderTime: number;
  };
}
```

### Export Request Type
```typescript
interface ExportRequest {
  diagramId: string;
  format: 'png' | 'svg' | 'pdf';
  options?: {
    dpi?: number;                // For PNG
    scale?: number;              // For SVG
    includeMetadata?: boolean;   // For PDF
  };
}
```

---

## State Management

### Local State (React Hooks)
- Panel open/close status
- Current view mode (preview/code/fullscreen)
- Rendering status
- Selected export format

### Context State (WorkspaceContext)
- Diagram history for session
- User export preferences
- Theme selection
- Diagram settings

### Database State (Supabase)
- Saved diagrams (optional archival)
- Share links
- Download history
- User settings

---

## Integration Points

### 1. Chat Message Processing
```
ChatMessage received
  ↓
Check for mermaid code blocks
  ↓
Extract & validate syntax
  ↓
Emit DiagramDetected event
  ↓
DiagramPreviewPanel.onOpen(diagram)
```

### 2. Export Flow
```
User clicks Export
  ↓
Select format (PNG/SVG/PDF)
  ↓
Send export request to backend
  ↓
Backend: render_to_format()
  ↓
Receive file blob
  ↓
Trigger browser download
  ↓
Show success toast
```

### 3. Share Flow
```
User clicks Share
  ↓
Generate unique ID
  ↓
Store diagram in database
  ↓
Generate shareable URL
  ↓
Copy to clipboard
  ↓
Show share link modal
```

---

## Error Handling

### Validation Errors
- **Invalid Syntax**: Display red error message in code view
- **Unsupported Type**: Graceful fallback to text display
- **Render Timeout**: Show "Diagram too complex" message

### Export Errors
- **Export Failed**: Retry button with exponential backoff
- **Network Error**: Queue export for retry
- **File Size Exceeded**: Suggest simplifying diagram

### Recovery Strategies
- Fallback to PNG if SVG fails
- Display raw code if rendering fails
- Cache SVG for offline availability

---

## Performance Considerations

### Optimization Strategies
1. **Lazy Loading**: Load mermaid.js only when needed
2. **Caching**: Store rendered SVG to avoid re-rendering
3. **Debouncing**: Debounce edit events during live preview (300ms)
4. **Virtual Scrolling**: For large chat histories with multiple diagrams
5. **Web Workers**: Offload rendering to worker thread for large diagrams

### Metrics to Track
- Diagram render time (target: <500ms)
- Export generation time (target: <2s for PNG)
- Memory usage during rendering
- Cache hit ratio

---

## Accessibility & Internationalization

### Accessibility
- ARIA labels on all buttons
- Keyboard navigation (Tab, Enter, Esc)
- High contrast mode support
- Screen reader descriptions for diagrams
- Alt text fallback for diagrams

### Internationalization
- Multi-language button labels
- Localized file names: `diagramme_organigramme_20260202.png`
- RTL support for languages like Arabic/Hebrew

---

## Future Enhancements

### Phase 2
- **Collaborative Editing**: Multiple users edit diagram simultaneously
- **Comments & Annotations**: Add notes to diagram sections
- **Version History**: Side-by-side view of diagram versions
- **Templates**: Pre-built diagram templates

### Phase 3
- **AI Enhancement**: Auto-suggest diagram improvements
- **OCR**: Convert whiteboard photos to diagrams
- **Voice Input**: Generate diagrams from voice description
- **Real-time Collaboration**: Sync across team members

---

## File Structure

```
frontend/
├── app/
│   ├── components/
│   │   ├── DiagramPreviewPanel.tsx
│   │   ├── DiagramCanvas.tsx
│   │   ├── DiagramControls.tsx
│   │   ├── ExportMenu.tsx
│   │   └── ShareModal.tsx
│   ├── hooks/
│   │   ├── useMermaidDetector.ts
│   │   ├── useDiagramExport.ts
│   │   └── useDiagramShare.ts
│   └── styles/
│       └── diagram-preview.css
│
server/
├── diagram_export.py        # Export engine
├── diagram_storage.py       # Database operations
└── diagram_utils.py         # Helper functions

public/
└── fonts/                   # Custom fonts for diagrams
```

---

## Configuration

### Feature Flags
```typescript
DIAGRAM_FEATURES = {
  enablePreview: true,
  enableExport: true,
  enableShare: true,
  enableFullscreen: true,
  maxDiagramSize: 50, // KB
  supportedFormats: ['png', 'svg', 'pdf'],
  enableCache: true,
};
```

### Theme Configuration
```typescript
DIAGRAM_THEMES = {
  light: {
    primaryColor: '#333',
    backgroundColor: '#fff',
    borderColor: '#ddd',
  },
  dark: {
    primaryColor: '#fff',
    backgroundColor: '#1e1e1e',
    borderColor: '#444',
  },
};
```

---

## Testing Strategy

### Unit Tests
- Mermaid detection regex patterns
- Export format validation
- Error handling edge cases

### Integration Tests
- End-to-end export workflow
- Chat message → Diagram → Download flow
- Share link generation & access

### E2E Tests
- User opens chat, diagram appears, exports PNG
- Multiple diagrams displayed simultaneously
- Fullscreen mode interactions

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Diagram Detection Accuracy | 98% | % of valid mermaid blocks detected |
| Render Time (< 1000px) | <500ms | P95 latency |
| Export Success Rate | 99% | % of exports completed |
| User Satisfaction | 4.5/5 | NPS score |
| Feature Adoption | 40% | % of users who export ≥1 diagram |

---

## Deployment Considerations

### Frontend
- Bundle mermaid.js with code-splitting
- Serve SVG from CDN
- Enable service worker for offline export caching

### Backend
- Scale export service horizontally
- Use message queue for async export jobs
- Implement rate limiting (100 exports/hour/user)

---

## References

- [Mermaid.js Documentation](https://mermaid.js.org/)
- [Codigram App](https://codigram.app/)
- SVG/PNG Export Libraries: librsvg, Pillow, ReportLab
- Diagram Caching Best Practices

