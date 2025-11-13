'use client'

import { Message } from '@/app/types'

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
          // AI message - Left-aligned plain text (no bubble)
          <div className="py-2">
            <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: '#060606' }}>
              {message.content}
            </p>
            {message.isStreaming && (
              <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1"></span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
