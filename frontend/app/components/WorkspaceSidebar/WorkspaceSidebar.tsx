'use client'

/**
 * Workspace Sidebar Component
 * Displays chat sessions for a workspace
 * 
 * Chat Sessions Flow:
 * 1. Parent component (page.tsx) fetches chats via /api/chats
 * 2. /api/chats/route.ts processes the request
 * 3. route.ts calls getWorkspaceChats() from chats.ts service layer
 * 4. chats.ts queries Supabase for workspace chats
 * 5. Results passed to WorkspaceSidebar as chatSessions prop
 * 6. Component renders the chat list with select/create functionality
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Workspace, ChatSession } from '@/app/types'

interface WorkspaceSidebarProps {
  workspace: Workspace | null
  chatSessions: ChatSession[] // Fetched from /api/chats → chats.ts service layer
  currentChatId?: string
  onChatSelect?: (chatId: string) => void
  onNewChat?: () => void
  onToggleSidebar?: (isCollapsed: boolean) => void
}

const MIN_WIDTH = 200
const MAX_WIDTH = 400
const DEFAULT_WIDTH = 280

export default function WorkspaceSidebar({
  workspace,
  chatSessions,
  currentChatId,
  onChatSelect,
  onNewChat,
  onToggleSidebar
}: WorkspaceSidebarProps) {
  const router = useRouter()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  // Light theme colors
  const theme = {
    bg: '#ffffff',
    border: '#e5e5e5',
    text: '#1a1a1a',
    textSecondary: '#666666',
    textMuted: '#999999',
    hoverBg: 'rgba(0,0,0,0.05)',
    activeBg: '#f0f0f0',
    cardBg: '#f5f5f5',
  }

  // Load collapse state and width from localStorage on mount
  useEffect(() => {
    const savedCollapsed = localStorage.getItem('workspace-sidebar-collapsed')
    const savedWidth = localStorage.getItem('workspace-sidebar-width')
    
    if (savedCollapsed !== null) {
      const collapsed = savedCollapsed === 'true'
      setIsCollapsed(collapsed)
      onToggleSidebar?.(collapsed)
    } else {
      setIsCollapsed(false)
      onToggleSidebar?.(false)
    }

    if (savedWidth !== null) {
      const width = parseInt(savedWidth, 10)
      if (width >= MIN_WIDTH && width <= MAX_WIDTH) {
        setSidebarWidth(width)
      }
    }
  }, [onToggleSidebar])

  // Listen for localStorage changes (for when parent expands the sidebar)
  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem('workspace-sidebar-collapsed')
      if (saved !== null) {
        const collapsed = saved === 'true'
        setIsCollapsed(collapsed)
        onToggleSidebar?.(collapsed)
      }
    }

    const interval = setInterval(handleStorageChange, 100)
    return () => clearInterval(interval)
  }, [onToggleSidebar])

  // Handle mouse move for resizing
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return
    
    const newWidth = e.clientX
    if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
      setSidebarWidth(newWidth)
    }
  }, [isResizing])

  // Handle mouse up to stop resizing
  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      setIsResizing(false)
      localStorage.setItem('workspace-sidebar-width', String(sidebarWidth))
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, sidebarWidth])

  // Add/remove event listeners for resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  const handleToggleCollapse = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    localStorage.setItem('workspace-sidebar-collapsed', String(newState))
    onToggleSidebar?.(newState)
  }

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }

  console.log('WorkspaceSidebar render:', { workspace: workspace?.name, isCollapsed })

  if (!workspace) {
    console.log('WorkspaceSidebar: No workspace provided, returning null')
    return null
  }

  // AnimatePresence for smooth mount/unmount
  return (
    <AnimatePresence initial={false}>
      {!isCollapsed && (
        <motion.div
          ref={sidebarRef}
          key="sidebar"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: sidebarWidth, opacity: 1 }}
          exit={{ width: 0, opacity: 0, transition: { duration: 0.2, ease: 'easeInOut' } }}
          transition={{ width: { duration: isResizing ? 0 : 0.35, ease: 'easeInOut' }, opacity: { duration: 0.25 } }}
          className="relative flex flex-col shadow-sm border-r overflow-hidden"
          style={{ backgroundColor: theme.bg, borderColor: theme.border }}
        >
          {/* Resize Handle */}
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors z-10"
            onMouseDown={handleResizeStart}
            style={{ backgroundColor: isResizing ? 'rgba(59, 130, 246, 0.5)' : 'transparent' }}
          />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col h-full"
            style={{ height: '100%' }}
          >
            {/* Workspace Header */}
            <div className="border-b p-4" style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></div>
                  <h2 className="font-medium truncate" style={{ color: theme.text }}>{workspace.name}</h2>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    className="p-1 rounded transition-colors hover:opacity-70"
                    style={{ color: theme.textSecondary }}
                    aria-label="More options"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                    </svg>
                  </button>
                  <button
                    onClick={handleToggleCollapse}
                    className="p-1 rounded transition-colors hover:opacity-70"
                    style={{ color: theme.textSecondary }}
                    aria-label="Collapse sidebar"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M14 2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h12zM2 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2H2z" />
                      <path d="M3 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Instructions Section */}
              <div className="mb-3">
                <button 
                  className="w-full flex items-center gap-2 p-3 rounded-lg transition-colors text-left"
                  style={{ backgroundColor: theme.cardBg }}
                >
                  <svg className="w-5 h-5 flex-shrink-0" style={{ color: theme.textSecondary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium" style={{ color: theme.text }}>Instructions</div>
                    <div className="text-sm truncate" style={{ color: theme.textMuted }}>
                      {workspace.description || 'Set up instructions for Varys in this project'}
                    </div>
                  </div>
                </button>
              </div>

              {/* Files Section */}
              <div className="border-t mt-4 pt-4" style={{ borderColor: theme.border }}>
                <h3 className="text-xs font-semibold uppercase px-3 mb-2" style={{ color: theme.textMuted }}>
                  Files - {workspace.name}
                </h3>
                <button
                  onClick={() => router.push(`/workspaces/${workspace.id}/vault`)}
                  className="w-full flex items-center gap-2 p-3 rounded-lg transition-colors text-left hover:opacity-80"
                  style={{ backgroundColor: theme.hoverBg }}
                >
                  <svg className="w-5 h-5 flex-shrink-0" style={{ color: theme.textSecondary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="font-medium" style={{ color: theme.text }}>Vault</span>
                </button>
              </div>
            </div>

            {/* Chats Section */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold uppercase" style={{ color: theme.textMuted }}>Chats</h3>
                  <button
                    onClick={onNewChat}
                    className="p-1 rounded transition-colors hover:opacity-70"
                    style={{ color: theme.textSecondary }}
                    aria-label="New chat"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>

                {chatSessions.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm mb-2" style={{ color: theme.textSecondary }}>No chats yet.</p>
                    <p className="text-sm" style={{ color: theme.textMuted }}>
                      Start a conversation or set project instructions.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {chatSessions.map((session) => (
                      <button
                        key={session.id}
                        onClick={() => onChatSelect?.(session.id)}
                        className="w-full text-left px-3 py-2 rounded-lg transition-colors"
                        style={{
                          backgroundColor: currentChatId === session.id ? theme.activeBg : 'transparent',
                        }}
                      >
                        <div className="text-sm font-medium truncate" style={{ color: theme.text }}>
                          {session.messages[0]?.content.substring(0, 30) || 'New Chat'}
                          {session.messages[0]?.content.length > 30 && '...'}
                        </div>
                        <div className="text-sm mt-0.5" style={{ color: theme.textMuted }}>
                          {new Date(session.updatedAt).toLocaleDateString()}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

