'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Message, WorkspaceInstruction } from '@/app/types'
import ChatMessage from './ChatMessage'

interface ChatContainerProps {
  messages: Message[]
  workspaceName?: string
  activeInstruction?: WorkspaceInstruction | null
  onShowDiagram?: (diagramId: string) => void
  hideEmptyState?: boolean
}

export default function ChatContainer({ messages, onShowDiagram, hideEmptyState = false }: ChatContainerProps) {
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

  if (!hasMessages && hideEmptyState) {
    return (
      <div className="flex-1 overflow-y-auto px-4" style={{ backgroundColor: 'var(--bg-app)' }}>
        <div className="mx-auto h-full" style={{ maxWidth: '800px' }} />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4" style={{ backgroundColor: 'var(--bg-app)' }}>
      {/* Centered chat column with max width */}
      <div 
        className={`mx-auto ${!hasMessages ? 'h-full flex flex-col justify-center' : ''}`}
        style={{ maxWidth: '800px' }}
      >
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
              <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>No chats yet.</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
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
                  <div key={message.id} className="mb-5">
                    <ChatMessage message={message} onShowDiagram={onShowDiagram} />
                  </div>
                ) : (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.5) }}
                    className="mb-5"
                  >
                    <ChatMessage message={message} onShowDiagram={onShowDiagram} />
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
