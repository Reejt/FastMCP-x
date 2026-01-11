'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Workspace, Message } from '@/app/types'
import InstructionsPanel from '@/app/components/WorkspaceIntroduction/InstructionsPanel'
import VaultPanel from '@/app/components/WorkspaceIntroduction/VaultPanel'

interface WorkspaceIntroductionProps {
  workspace: Workspace
  messages: Message[]
  isProcessing: boolean
  onSendMessage: (message: string) => void
  isWorkspaceSidebarCollapsed?: boolean
  onExpandWorkspaceSidebar?: () => void
}

export default function WorkspaceIntroduction({ workspace, messages, isProcessing, onSendMessage, isWorkspaceSidebarCollapsed, onExpandWorkspaceSidebar }: WorkspaceIntroductionProps) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const chatHistoryRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight
    }
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && !isProcessing) {
      onSendMessage(message.trim())
      setMessage('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="flex h-full w-full" style={{ backgroundColor: '#f5f3ef' }}>
      {/* Left Side - Chat Area (50% width) */}
      <div className="flex-1 flex flex-col px-6 pt-4 pb-8 overflow-auto" style={{ flexBasis: '50%' }}>
        {/* Breadcrumb Navigation with Expand Button */}
        <nav className="flex items-center gap-3 text-sm text-gray-500 mb-6" aria-label="Breadcrumb">
          {/* Expand Button - Shows when workspace sidebar is collapsed */}
          {isWorkspaceSidebarCollapsed && onExpandWorkspaceSidebar && (
            <button
              onClick={onExpandWorkspaceSidebar}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 shadow-sm rounded-lg hover:bg-gray-50 transition-all"
              aria-label="Expand workspace sidebar"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          <button
            onClick={() => router.push('/workspaces')}
            className="hover:text-gray-700 transition-colors"
          >
            Workspaces
          </button>
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-gray-900 font-medium">{workspace.name}</span>
        </nav>

        {/* Main Content Container */}
        <div className="flex-1 flex flex-col w-full">

          {/* Workspace Title and Chat */}
          <div style={{ marginTop: '60px' }}>
            {/* Workspace Title */}
            <div className="mb-8">
              <h1 className="text-2xl font-semibold text-gray-900">{workspace.name}</h1>
            </div>

            {/* Chat Input Box with Actions */}
            <div className="relative">
              {/* Action Buttons - Positioned inline with chatbox */}
              <div className="absolute -right-2 top-0 flex items-center gap-2" style={{ transform: 'translateX(100%)' }}>
                <div className="flex items-center gap-2 ml-3">
                  <button
                    className="p-1.5 hover:bg-black/5 rounded-md transition-colors"
                    aria-label="More options"
                  >
                    <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                    </svg>
                  </button>
                  <button
                    className="p-1.5 hover:bg-black/5 rounded-md transition-colors"
                    aria-label="Add to favorites"
                  >
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Chat Input Form */}
              <form onSubmit={handleSubmit}>
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden" style={{ maxWidth: '99%' }}>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Start a new conversation in this workspace..."
                    disabled={isProcessing}
                    className="w-full px-5 pt-3 pb-2 text-[15px] text-gray-900 placeholder-gray-400 resize-none focus:outline-none disabled:bg-gray-50 disabled:cursor-not-allowed"
                    rows={1}
                    style={{ fontFamily: 'inherit' }}
                  />

                  {/* Bottom Bar with Actions */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-1">
                      {/* Plus Button */}
                      <button
                        type="button"
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        aria-label="Add attachment"
                        disabled={isProcessing}
                      >
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={!message.trim() || isProcessing}
                      className="p-2.5 bg-[#d4a574] hover:bg-[#c99a6a] disabled:bg-gray-200 disabled:cursor-not-allowed rounded-full transition-all"
                      aria-label="Send message"
                    >
                      {isProcessing ? (
                        <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Chat History - Shows when messages exist */}
            {messages.length > 0 && (
              <div
                ref={chatHistoryRef}
                className="space-y-4 flex-1 overflow-y-auto mt-8"
              >
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-2xl px-5 py-3 ${msg.role === 'user'
                        ? 'bg-[#d4a574] text-white'
                        : 'bg-white text-gray-900 border border-gray-200'
                        }`}
                    >
                      <div className="text-sm font-medium mb-1 opacity-80">
                        {msg.role === 'user' ? 'You' : 'Assistant'}
                      </div>
                      <div className="text-[15px] leading-relaxed whitespace-pre-wrap">
                        {msg.content || (msg.isStreaming ? 'Thinking...' : '')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Side - Instructions and Files Column (50% width) */}
      <div className="flex-shrink-0 overflow-y-auto px-6 py-8" style={{ flexBasis: '50%' }}>
        <div style={{ marginTop: '60px', maxWidth: '500px' }}>
          {/* Combined Card for Instructions and Files */}
          <div className="border border-gray-200 rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: '#f5f3ef' }}>
            {/* Instructions Section */}
            <div className="p-5 border-b border-gray-200">
              <InstructionsPanel
                workspace={workspace}
              />
            </div>

            {/* Files Section */}
            <div className="p-5">
              <VaultPanel
                workspace={workspace}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
