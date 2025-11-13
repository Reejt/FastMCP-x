'use client'

import { useState } from 'react'
import { Workspace, ChatSession } from '@/app/types'

interface WorkspaceSidebarProps {
  workspace: Workspace | null
  chatSessions: ChatSession[]
  currentChatId?: string
  onChatSelect?: (chatId: string) => void
  onNewChat?: () => void
  onToggleSidebar?: (isCollapsed: boolean) => void
}

export default function WorkspaceSidebar({
  workspace,
  chatSessions,
  currentChatId,
  onChatSelect,
  onNewChat,
  onToggleSidebar
}: WorkspaceSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  const handleToggleCollapse = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    onToggleSidebar?.(newState)
  }

  if (!workspace) {
    return null
  }

  if (isCollapsed) {
    return null
  }

  return (
    <div className="border-r border-gray-200 flex flex-col w-64" style={{ backgroundColor: '#fcfcfc' }}>
      {/* Workspace Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></div>
            <h2 className="text-sm font-medium truncate" style={{ color: '#060606' }}>{workspace.name}</h2>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              aria-label="More options"
            >
              <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
              </svg>
            </button>
            <button
              onClick={handleToggleCollapse}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              aria-label="Collapse sidebar"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Instructions Section */}
        <div className="mb-3">
          <button className="w-full flex items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left">
            <svg className="w-4 h-4 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium" style={{ color: '#060606' }}>Instructions</div>
              <div className="text-xs text-gray-500 truncate">
                {workspace.description || 'Set up instructions for Varys in this project'}
              </div>
            </div>
          </button>
        </div>

        {/* Vault Section */}
        <div>
          <button className="w-full flex items-center gap-2 p-3 hover:bg-gray-100 rounded-lg transition-colors text-left">
            <svg className="w-4 h-4 flex-shrink-0" style={{ color: '#060606' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span className="text-xs font-medium" style={{ color: '#060606' }}>Vault</span>
          </button>
        </div>
      </div>

      {/* Chats Section */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-600 uppercase">Chats</h3>
            <button
              onClick={onNewChat}
              className="p-1 hover:bg-gray-200 rounded transition-colors"
              aria-label="New chat"
              style={{ color: '#262118' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {chatSessions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-xs mb-2" style={{ color: '#060606' }}>No chats yet.</p>
              <p className="text-xs text-gray-400">
                Start a conversation or set project instructions.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {chatSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => onChatSelect?.(session.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${currentChatId === session.id
                    ? 'bg-white shadow-sm'
                    : 'hover:bg-gray-100'
                    }`}
                  style={{ color: '#060606' }}
                >
                  <div className="text-xs font-medium truncate">
                    {session.messages[0]?.content.substring(0, 30) || 'New Chat'}
                    {session.messages[0]?.content.length > 30 && '...'}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {new Date(session.updatedAt).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

