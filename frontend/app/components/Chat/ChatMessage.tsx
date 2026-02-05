'use client'

import { Message } from '@/app/types'
import MarkdownRenderer from '@/app/components/UI/MarkdownRenderer'

interface ChatMessageProps {
  message: Message
  onShowDiagram?: (diagramId: string) => void
}

export default function ChatMessage({ message, onShowDiagram }: ChatMessageProps) {
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

    return diagrams
  }

  const diagrams = detectMermaidDiagrams(message.content)

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-6`}>
      <div className={`max-w-3xl ${isUser ? 'ml-12' : 'mr-12'}`}>
        {isUser ? (
          // User message - Right-aligned white bubble with shadow
          <div className="bg-white rounded-2xl px-5 py-3 shadow-md">
            <p className="text-[15px] whitespace-pre-wrap text-[#0d0d0d]">{message.content}</p>
          </div>
        ) : isSystem ? (
          // System message - Light grey, centered, no background
          <div className="py-2">
            <p className="text-[14px] text-gray-400 italic">{message.content}</p>
          </div>
        ) : (
          // AI message - Left-aligned with ChatGPT-style markdown rendering
          <div className="py-2">
            {message.isStreaming ? (
              // Assistant message - Inline text, no bubble
              <div style={{ color: '#1a1a1a' }}>
                <div className="text-[15px]">
                  <MarkdownRenderer content={message.content || ''} />
                  {message.isStreaming && !message.content && (
                    <span style={{ color: '#666666' }}>Thinking...</span>
                  )}
                  {message.isStreaming && message.content && (
                    <span className="inline-block w-2 h-5 animate-pulse ml-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}></span>
                  )}
                </div>
              </div>
            ) : (
              // Markdown rendering after streaming completes
              <div>
                <MarkdownRenderer content={message.content} className="text-[15px]" />
                
                {/* Diagram preview buttons */}
                {diagrams.length > 0 && onShowDiagram && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {diagrams.map((diagram, index) => (
                      <button
                        key={diagram.id}
                        onClick={() => onShowDiagram(diagram.id)}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        View Diagram {diagrams.length > 1 ? `#${index + 1}` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
