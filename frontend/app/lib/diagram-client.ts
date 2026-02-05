/**
 * Diagram API Client
 * Handles diagram generation requests to the bridge server /api/diagram endpoint
 */

export interface DiagramRequest {
  query?: string              // Direct user query
  diagram_type?: 'auto' | 'flowchart' | 'pie' | 'gantt' | 'sequence' | 'class' | 'bar' | 'mindmap'
  workspace_id?: string
}

export interface DiagramResponse {
  success: boolean
  diagram: string
  diagram_type: string
  raw_response?: string
  error?: string
  markdown?: string
  done?: boolean
  source?: 'query' | 'content'  // Indicate source
}

/**
 * Generate a diagram from a user query
 * Streams the response from the bridge server
 */
export async function generateDiagram(
  userQuery: string,
  diagramType: string = 'auto',
  onChunk?: (chunk: DiagramResponse) => void,
  abortSignal?: AbortSignal
): Promise<DiagramResponse> {
  const requestBody: DiagramRequest = {
    query: userQuery,
    diagram_type: diagramType as any
  }

  try {
    const response = await fetch('/api/diagram', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: abortSignal
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Diagram generation failed: ${response.statusText}`)
    }

    // Check if response is streaming (SSE)
    const contentType = response.headers.get('content-type')
    if (contentType?.includes('text/event-stream')) {
      // Handle streaming response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let lastChunk: DiagramResponse | null = null

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read()

            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split('\n')

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6)
                if (!jsonStr.trim()) continue

                try {
                  const data = JSON.parse(jsonStr) as DiagramResponse

                  if (data.success || data.error) {
                    lastChunk = data
                    onChunk?.(data)
                  }

                  if (data.done) {
                    return lastChunk || {
                      success: false,
                      error: 'No diagram data received',
                      diagram: '',
                      diagram_type: 'error'
                    }
                  }
                } catch (parseError) {
                  console.error('Failed to parse diagram SSE chunk:', parseError)
                }
              }
            }
          }
        } catch (readerError) {
          if (readerError instanceof Error && readerError.name === 'AbortError') {
            return {
              success: false,
              error: 'Diagram generation cancelled',
              diagram: '',
              diagram_type: 'error'
            }
          }
          throw readerError
        }
      }

      return lastChunk || {
        success: false,
        error: 'No diagram generated',
        diagram: '',
        diagram_type: 'error'
      }
    } else {
      // Handle non-streaming response
      const data = (await response.json()) as DiagramResponse
      return data
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: errorMessage,
      diagram: '',
      diagram_type: 'error'
    }
  }
}

/**
 * Generate a diagram directly from user query (diagram-only mode)
 * Bypasses text response generation - returns only diagram
 */
export async function generateDiagramFromQuery(
  query: string,
  diagramType: string = 'auto',
  workspaceId?: string,
  onChunk?: (chunk: DiagramResponse) => void,
  abortSignal?: AbortSignal
): Promise<DiagramResponse> {
  const requestBody: DiagramRequest = {
    query: query,
    diagram_type: diagramType as any,
    workspace_id: workspaceId
  }

  try {
    const response = await fetch('/api/diagram', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: abortSignal
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Diagram generation failed: ${response.statusText}`)
    }

    // Check if response is streaming (SSE)
    const contentType = response.headers.get('content-type')
    if (contentType?.includes('text/event-stream')) {
      // Handle streaming response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let lastChunk: DiagramResponse | null = null

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read()

            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split('\n')

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6)
                if (!jsonStr.trim()) continue

                try {
                  const data = JSON.parse(jsonStr) as DiagramResponse

                  if (data.success || data.error) {
                    lastChunk = data
                    onChunk?.(data)
                  }

                  if (data.done) {
                    return lastChunk || {
                      success: false,
                      error: 'No diagram data received',
                      diagram: '',
                      diagram_type: 'error'
                    }
                  }
                } catch (parseError) {
                  console.error('Failed to parse diagram SSE chunk:', parseError)
                }
              }
            }
          }
        } catch (readerError) {
          if (readerError instanceof Error && readerError.name === 'AbortError') {
            return {
              success: false,
              error: 'Diagram generation cancelled',
              diagram: '',
              diagram_type: 'error'
            }
          }
          throw readerError
        }
      }

      return lastChunk || {
        success: false,
        error: 'No diagram generated',
        diagram: '',
        diagram_type: 'error'
      }
    } else {
      // Handle non-streaming response
      const data = (await response.json()) as DiagramResponse
      return data
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: errorMessage,
      diagram: '',
      diagram_type: 'error'
    }
  }
}

/**
 * Extract mermaid code from diagram response
 */
export function extractMermaidCode(diagramMarkdown: string): string {
  const match = diagramMarkdown.match(/```mermaid\n([\s\S]*?)\n```/)
  return match ? match[1] : diagramMarkdown
}

/**
 * Check if query contains diagram request keywords
 */
export function isDiagramQuery(query: string): boolean {
  // Validate input
  if (!query || typeof query !== 'string') {
    return false
  }

  const queryLower = query.toLowerCase()
  
  // Use word boundary patterns for more accurate matching
  const diagramPatterns = [
    /\bdiagram\b/,
    /\bchart\b/,
    /\bvisuali[sz]e|visualization/,
    /\bgraph\b/,
    /\bflowchart\b/,
    /\bpie\s+chart|pie\b/,
    /\bgantt\b/,
    /\bsequence\b/,
    /\bclass\s+diagram/,
    /\bdraw\b/,
    /\bplot\b/,
    /\bmermaid\b/,
    /\bmindmap|mind\s+map/,
    /\bbar\s+chart|bar\s+graph/
  ]
  
  return diagramPatterns.some(pattern => pattern.test(queryLower))
}

/**
 * Detect diagram type from query
 */
export function detectDiagramType(query: string): string {
  // Validate input
  if (!query || typeof query !== 'string') {
    return 'auto'
  }

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
