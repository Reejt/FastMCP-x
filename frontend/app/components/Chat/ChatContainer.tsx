'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Message, WorkspaceInstruction } from '@/app/types'
import ChatMessage from './ChatMessage'

interface ChatContainerProps {
  messages: Message[]
  workspaceName?: string
  activeInstruction?: WorkspaceInstruction | null
}

export default function ChatContainer({ messages }: ChatContainerProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    // ✅ Use instant scroll during streaming for better performance
    const isStreaming = messages.some(msg => msg.isStreaming)
    messagesEndRef.current?.scrollIntoView({ behavior: isStreaming ? 'instant' : 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const hasMessages = messages.length > 0

  return (
    <div className="flex-1 overflow-y-auto px-4" style={{ backgroundColor: '#fcfcfc' }}>
      <div className={`max-w-4xl mx-auto ${!hasMessages ? 'h-full flex flex-col justify-center' : ''}`}>
        <AnimatePresence mode="wait">
          {!hasMessages ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center text-center px-4"
            >
              <p className="text-sm mb-2" style={{ color: '#060606' }}>No chats yet.</p>
              <p className="text-gray-400 text-sm">
                Start a conversation or set project instructions.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="messages"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="py-6"
            >
              {messages.map((message, index) => (
                // ✅ No animation on streaming messages - allows instant updates
                message.isStreaming ? (
                  <div key={message.id}>
                    <ChatMessage message={message} />
                  </div>
                ) : (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.5) }}
                  >
                    <ChatMessage message={message} />
                  </motion.div>
                )
              ))}
              <div ref={messagesEndRef} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
