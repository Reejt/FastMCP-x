'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'

interface ChatInputProps {
  onSendMessage: (message: string) => void
  disabled?: boolean
  hasMessages?: boolean
}

export default function ChatInput({ onSendMessage, disabled = false, hasMessages = false }: ChatInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim() && !disabled) {
      onSendMessage(input.trim())
      setInput('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleFileUpload = () => {
    fileInputRef.current?.click()
  }

  const handleContainerClick = () => {
    // Focus the textarea when clicking anywhere in the container
    textareaRef.current?.focus()
  }

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [input])

  return (
    <div className={`bg-white border-t border-gray-200 transition-all duration-300 ${!hasMessages ? 'pt-2 pb-6 px-6' : 'p-6'}`}>
      <motion.form
        onSubmit={handleSubmit}
        className="max-w-4xl mx-auto"
        initial={false}
        animate={{
          scale: !hasMessages ? 1 : 1,
        }}
        transition={{ duration: 0.3 }}
      >
        <div
          onClick={handleContainerClick}
          className={`relative flex items-center bg-white ${!hasMessages ? 'rounded-3xl' : 'rounded-full'} border border-gray-300 hover:border-gray-400 transition-all cursor-text ${!hasMessages ? 'px-8 py-6' : 'px-5 py-3'
            }`}
        >
          {/* Plus Icon - Left */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation() // Prevent triggering container click
              handleFileUpload()
            }}
            className="text-gray-600 hover:text-gray-800 transition-colors mr-4 flex-shrink-0 cursor-pointer"
            disabled={disabled}
            aria-label="Attach file"
          >
            <svg className={`${!hasMessages ? 'w-6 h-6' : 'w-5 h-5'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              // Handle file upload logic here
              console.log('File selected:', e.target.files?.[0])
            }}
          />

          {/* Text Input */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything"
            disabled={disabled}
            rows={1}
            className={`flex-1 bg-transparent text-gray-800 placeholder-gray-400 resize-none focus:outline-none max-h-32 overflow-y-auto ${!hasMessages ? 'text-base' : 'text-sm'
              }`}
            style={{ minHeight: !hasMessages ? '32px' : '24px' }}
          />

          {/* Send Arrow Icon - Right */}
          <button
            type="submit"
            onClick={(e) => e.stopPropagation()} // Prevent triggering container click
            disabled={disabled || !input.trim()}
            className="text-gray-600 hover:text-gray-800 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors ml-4 flex-shrink-0"
            aria-label="Send message"
          >
            <svg className={`${!hasMessages ? 'w-6 h-6' : 'w-5 h-5'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        </div>
      </motion.form>
    </div>
  )
}
