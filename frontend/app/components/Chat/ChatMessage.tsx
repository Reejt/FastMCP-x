'use client'

import { Message } from '@/app/types'
import MarkdownRenderer from '@/app/components/UI/MarkdownRenderer'

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
            <p className="text-[15px] whitespace-pre-wrap text-[#0d0d0d]">{message.content}</p>
          </div>
        ) : (
          // AI message - Left-aligned with ChatGPT-style markdown rendering
          <div className="py-2">
            <MarkdownRenderer content={message.content} className="text-[15px]" />
            {message.isStreaming && (
              <span className="inline-block w-2 h-5 bg-gray-400 animate-pulse ml-0.5"></span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
