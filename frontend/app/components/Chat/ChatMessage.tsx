'use client'

import { Message } from '@/app/types'
import MarkdownRenderer from '@/app/components/UI/MarkdownRenderer'
import ConnectorBadge from './ConnectorBadge'
import ConnectorAuthPrompt from './ConnectorAuthPrompt'

interface ChatMessageProps {
  message: Message
  onShowDiagram?: (diagramId: string) => void
  onRetryQuery?: (query: string) => void  // Callback to retry query after connector auth
}

export default function ChatMessage({ message, onShowDiagram, onRetryQuery }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  // Detect Mermaid diagrams in the message content
  const detectMermaidDiagrams = (content: string) => {
    const diagrams = []
    const mermaidRegex = /```mermaid\s*\n([\s\S]*?)\n```/g
    let match
    let index = 0

    while ((match = mermaidRegex.exec(content)) !== null) {
      const mermaidCode = match[1].trim()
      if (mermaidCode) {
        diagrams.push({
          id: `msg_${message.id}_diagram_${index}`,
          code: mermaidCode,
          startIndex: match.index,
          endIndex: match.index + match[0].length
        })
        index++
      }
    }

    // Debug logging
    if (content.includes('```mermaid')) {
      console.log('🔍 Mermaid code block found in message:', message.id)
      console.log('📊 Detected diagrams:', diagrams.length)
      if (diagrams.length === 0) {
        console.log('⚠️ Regex did not match. Content preview:', content.substring(content.indexOf('```mermaid'), content.indexOf('```mermaid') + 100))
      }
    }

    return diagrams
  }

  const diagrams = detectMermaidDiagrams(message.content)

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-3xl ${isUser ? '' : 'mr-12'}`}>
        {isUser ? (
          // User message - Right-aligned bubble with theme-aware styling
          <div className="rounded-2xl px-5 py-3" style={{ backgroundColor: 'var(--bg-user-bubble)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' }}>
            <p className="text-[15px] whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
              {/* Render @connector mentions as styled chips */}
              {message.content.match(/^@(\w+)\s/) ? (
                <>
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium mr-1"
                    style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--text-inverse)' }}
                  >
                    @{message.content.match(/^@(\w+)/)?.[1]}
                  </span>
                  {message.content.replace(/^@\w+\s/, '')}
                </>
              ) : (
                message.content
              )}
            </p>
          </div>
        ) : isSystem ? (
          // System message - Light grey, centered, no background
          <div className="py-2">
            <p className="text-[14px] italic" style={{ color: 'var(--text-muted)' }}>{message.content}</p>
          </div>
        ) : (
          // AI message - Left-aligned with ChatGPT-style markdown rendering
          <div className="py-2">
            {message.isStreaming ? (
              // Assistant message - Inline text, no bubble
              <div style={{ color: 'var(--text-primary)' }}>
                <div className="text-[15px]" style={{ lineHeight: '1.7' }}>
                  <MarkdownRenderer content={message.content || ''} />
                  {message.isStreaming && !message.content && (
                    <span style={{ color: 'var(--text-secondary)' }}>Thinking...</span>
                  )}
                  {message.isStreaming && message.content && (
                    <span className="inline-block w-2 h-5 animate-pulse ml-0.5" style={{ backgroundColor: 'var(--text-secondary)' }}></span>
                  )}
                </div>
              </div>
            ) : (
              // Markdown rendering after streaming completes
              <div>
                <MarkdownRenderer content={message.content} className="text-[15px]" style={{ lineHeight: '1.7' }} />
                
                {/* Diagram preview buttons */}
                {diagrams.length > 0 && onShowDiagram && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {diagrams.map((diagram, index) => (
                      <button
                        key={diagram.id}
                        onClick={() => onShowDiagram(diagram.id)}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors"
                        style={{
                          backgroundColor: 'var(--bg-elevated)',
                          color: 'var(--accent-primary)',
                          borderColor: 'var(--border-subtle)'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'
                        }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        View Diagram {diagrams.length > 1 ? `#${index + 1}` : ''}
                      </button>
                    ))}
                  </div>
                )}

                {/* Connector source attribution badge */}
                {message.connectorSource && (
                  <div className="mt-1">
                    <ConnectorBadge
                      source={message.connectorSource}
                      sourceName={message.connectorSourceName}
                    />
                  </div>
                )}

                {/* Connector auth required prompt */}
                {message.connectorAuthRequired && (
                  <ConnectorAuthPrompt
                    connector={message.connectorAuthRequired.connector}
                    connectorName={message.connectorAuthRequired.name}
                    authUrl={message.connectorAuthRequired.authUrl}
                    query={message.connectorAuthRequired.query}
                    userId={message.connectorAuthRequired.userId}
                    onRetryQuery={onRetryQuery}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
