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
import { Workspace, ChatSession, WorkspaceInstruction } from '@/app/types'

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
  const [activeInstruction, setActiveInstruction] = useState<WorkspaceInstruction | null>(null)
  const [isLoadingInstruction, setIsLoadingInstruction] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editFormData, setEditFormData] = useState({ instructions: '' })

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
    hoverGrey: '#f5f5f5',
  }

  // Load collapse state and width from localStorage on mount
  useEffect(() => {
    const savedCollapsed = localStorage.getItem('workspace-sidebar-collapsed')
    const savedWidth = localStorage.getItem('workspaceSidebarWidth')
    
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
      localStorage.setItem('workspaceSidebarWidth', String(sidebarWidth))
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

  // Fetch active instruction for workspace
  useEffect(() => {
    if (!workspace?.id) return

    const fetchActiveInstruction = async () => {
      setIsLoadingInstruction(true)
      try {
        const response = await fetch(`/api/instructions?workspaceId=${workspace.id}`)
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.instructions) {
            // Find active instruction
            const active = data.instructions.find((inst: WorkspaceInstruction) => inst.is_active)
            setActiveInstruction(active || null)
          }
        }
      } catch (error) {
        console.error('Error fetching active instruction:', error)
      } finally {
        setIsLoadingInstruction(false)
      }
    }

    fetchActiveInstruction()
  }, [workspace?.id])

  // Handle edit instruction
  const handleEditInstruction = () => {
    if (activeInstruction) {
      setEditFormData({
        instructions: activeInstruction.instructions
      })
    } else {
      setEditFormData({ instructions: '' })
    }
    setIsEditModalOpen(true)
  }

  // Handle save instruction
  const handleSaveInstruction = async () => {
    if (!workspace?.id) {
      return
    }

    try {
      if (activeInstruction) {
        // If instructions are cleared, delete the instruction
        if (!editFormData.instructions.trim()) {
          const response = await fetch('/api/instructions', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instructionId: activeInstruction.id
            })
          })

          if (response.ok) {
            setActiveInstruction(null)
            setIsEditModalOpen(false)
          }
          return
        } else {
          // Update existing instruction
          const response = await fetch('/api/instructions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instructionId: activeInstruction.id,
              title: 'Project Instructions',
              instructions: editFormData.instructions,
              activate: true
            })
          })

          if (response.ok) {
            const data = await response.json()
            if (data.success && data.instruction) {
              setActiveInstruction(data.instruction)
              setIsEditModalOpen(false)
            }
          }
          return
        }
      } else {
        // Create new instruction
        if (!editFormData.instructions.trim()) {
          // Nothing to save if there's no content
          setIsEditModalOpen(false)
          return
        }

        const response = await fetch('/api/instructions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: workspace.id,
            title: 'Project Instructions',
            instructions: editFormData.instructions,
            isActive: true
          })
        })

        if (response.ok) {
          const data = await response.json()
          if (data.success && data.instruction) {
            setActiveInstruction(data.instruction)
            setIsEditModalOpen(false)
          }
        }
        return
      }
    } catch (error) {
      // Silently handle errors
    }
  }

  if (!workspace) {
    return null
  }

  // AnimatePresence for smooth mount/unmount
  return (
    <>
      {/* Instructions Edit Modal */}
      <AnimatePresence>
        {isEditModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setIsEditModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-2xl mx-4 p-6 rounded-lg shadow-xl"
              style={{ backgroundColor: theme.bg }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold" style={{ color: theme.text }}>
                  {activeInstruction ? 'Edit Instructions' : 'Set Project Instructions'}
                </h3>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="p-2 rounded transition-colors hover:opacity-70"
                  style={{ color: theme.textSecondary }}
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="mb-4">
                <textarea
                  value={editFormData.instructions}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, instructions: e.target.value }))}
                  placeholder="Provide relevant instructions and information for chats within this workspace..."
                  rows={12}
                  className="w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow resize-none"
                  style={{ 
                    backgroundColor: theme.bg, 
                    borderColor: theme.border,
                    color: theme.text
                  }}
                />
              </div>
              
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-5 py-2.5 rounded-lg font-medium transition-colors"
                  style={{ 
                    color: theme.textSecondary,
                    backgroundColor: theme.hoverBg
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleSaveInstruction()
                  }}
                  disabled={!activeInstruction && !editFormData.instructions.trim()}
                  className="px-5 py-2.5 rounded-lg font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ 
                    backgroundColor: '#1a1a1a'
                  }}
                >
                  {activeInstruction 
                    ? (editFormData.instructions.trim() ? 'Update Instructions' : 'Clear Instruction')
                    : 'Save Instructions'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    <AnimatePresence initial={false}>
      {!isCollapsed && (
        <motion.div
          ref={sidebarRef}
          key="sidebar"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: sidebarWidth, opacity: 1 }}
          exit={{ width: 0, opacity: 0, transition: { duration: 0.3, ease: 'easeInOut' } }}
          transition={{ 
            width: { 
              duration: isResizing ? 0 : 0.4, 
              type: isResizing ? 'tween' : 'spring',
              stiffness: 300,
              damping: 30
            }, 
            opacity: { duration: 0.3 } 
          }}
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
            transition={{ duration: 0.3 }}
            className="flex flex-col h-full"
            style={{ height: '100%' }}
          >
            {/* Workspace Header */}
            <div className="border-b p-4" style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
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
                  onClick={handleEditInstruction}
                  className="w-full flex items-center gap-2 p-3 rounded-lg transition-all text-left"
                  style={{ backgroundColor: 'transparent' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.hoverGrey}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <svg className="w-5 h-5 flex-shrink-0" style={{ color: theme.textSecondary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium" style={{ color: theme.text }}>Instructions</span>
                    </div>
                    <div className="text-sm truncate" style={{ color: theme.textMuted }}>
                      {isLoadingInstruction ? (
                        'Loading...'
                      ) : activeInstruction ? (
                        <>
                          {activeInstruction.instructions.substring(0, 30)}
                          {activeInstruction.instructions.length > 30 && '...'}
                        </>
                      ) : (
                        'Set up instructions for Varys in this project'
                      )}
                    </div>
                  </div>
                  <svg className="w-4 h-4 flex-shrink-0 ml-auto" style={{ color: theme.textSecondary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </div>

              {/* Files Section */}
              <div className="pt-3">
                <h3 className="text-xs font-semibold uppercase px-3 mb-2" style={{ color: theme.textMuted }}>
                  Files - {workspace.name}
                </h3>
                <button
                  onClick={() => router.push(`/workspaces/${workspace.id}/vault`)}
                  className="w-full flex items-center gap-2 p-3 rounded-lg transition-all text-left"
                  style={{ backgroundColor: 'transparent' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.hoverGrey}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
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
                  <motion.div 
                    className="space-y-1"
                    initial="hidden"
                    animate="visible"
                    variants={{
                      visible: {
                        transition: {
                          staggerChildren: 0.05
                        }
                      }
                    }}
                  >
                    {chatSessions.map((session, index) => (
                      <motion.button
                        key={session.id}
                        onClick={() => onChatSelect?.(session.id)}
                        variants={{
                          hidden: { opacity: 0, y: -10 },
                          visible: { opacity: 1, y: 0 }
                        }}
                        whileHover={{ scale: 1.01 }}
                        transition={{ duration: 0.2 }}
                        className="w-full text-left px-3 py-2 rounded-lg transition-all"
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
                      </motion.button>
                    ))}
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  )
}

