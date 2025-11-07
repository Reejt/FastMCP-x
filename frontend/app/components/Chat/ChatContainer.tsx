'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Message } from '@/app/types'
import ChatMessage from './ChatMessage'

interface ChatContainerProps {
  messages: Message[]
  workspaceName?: string
}

export default function ChatContainer({ messages, workspaceName }: ChatContainerProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const hasMessages = messages.length > 0

  return (
    <div className="flex-1 overflow-y-auto bg-white px-4">
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
              <p className="text-gray-500 text-sm mb-2">No chats yet.</p>
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
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <ChatMessage message={message} />
                </motion.div>
              ))}
              <div ref={messagesEndRef} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
