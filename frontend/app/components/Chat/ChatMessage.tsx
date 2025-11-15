'use client'

import { Message } from '@/app/types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ChatMessageProps {
  message: Message
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-6`}>
      <div className={`max-w-3xl ${isUser ? 'ml-12' : 'mr-12'}`}>
        {isUser ? (
          // User message - Right-aligned white bubble with shadow
          <div className="bg-white rounded-2xl px-5 py-3 shadow-md">
            <p className="text-sm whitespace-pre-wrap" style={{ color: '#060606' }}>{message.content}</p>
          </div>
        ) : (
          // AI message - Left-aligned plain text (no bubble) with markdown support
          <div className="py-2 prose prose-sm max-w-none text-sm leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-2 text-[#060606]">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold text-[#060606]">{children}</strong>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-2 text-[#060606]">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside mb-2 text-[#060606]">{children}</ol>,
                li: ({ children }) => <li className="mb-1 text-[#060606]">{children}</li>,
                h1: ({ children }) => <h1 className="text-xl font-bold mb-2 text-[#060606]">{children}</h1>,
                h2: ({ children }) => <h2 className="text-lg font-bold mb-2 text-[#060606]">{children}</h2>,
                h3: ({ children }) => <h3 className="text-base font-semibold mb-2 text-[#060606]">{children}</h3>,
                code: ({ children }) => <code className="bg-gray-100 px-1 py-0.5 rounded text-[#060606]">{children}</code>,
                pre: ({ children }) => <pre className="bg-gray-100 p-2 rounded mb-2 overflow-x-auto text-[#060606]">{children}</pre>,
              }}
            >
              {message.content}
            </ReactMarkdown>
            {message.isStreaming && (
              <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1"></span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
