'use client'

import { useEffect, useRef } from 'react'
import { Message } from '@/app/types'
import ChatMessage from './ChatMessage'

interface ChatContainerProps {
  messages: Message[]
}

export default function ChatContainer({ messages }: ChatContainerProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-6">
      <div className="max-w-4xl mx-auto">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[400px]">
            <div className="text-center">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Welcome to Varys AI
              </h2>
              <p className="text-gray-600 mb-6">
                Start a conversation by typing a message below
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto">
                <div className="bg-white border border-gray-200 rounded-lg p-4 text-left hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer">
                  <p className="text-sm text-gray-700">💡 Ask about your documents</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4 text-left hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer">
                  <p className="text-sm text-gray-700">📊 Analyze data from files</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4 text-left hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer">
                  <p className="text-sm text-gray-700">🔍 Search through your vault</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4 text-left hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer">
                  <p className="text-sm text-gray-700">✨ Get general knowledge answers</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
    </div>
  )
}
