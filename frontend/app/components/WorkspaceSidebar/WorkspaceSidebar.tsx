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
  onSessionRename?: (sessionId: string, newTitle: string) => void
  onSessionDelete?: (sessionId: string) => void
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
  onToggleSidebar,
  onSessionRename,
  onSessionDelete
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
  const [contextMenuSessionId, setContextMenuSessionId] = useState<string | null>(null)
  const [renameModalSessionId, setRenameModalSessionId] = useState<string | null>(null)
  const [renameFormValue, setRenameFormValue] = useState('')
  const [isRenamingSession, setIsRenamingSession] = useState(false)
  const [deleteConfirmSessionId, setDeleteConfirmSessionId] = useState<string | null>(null)
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState('')
  const [isDeletingSession, setIsDeletingSession] = useState(false)

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

  // Format relative time (1 hour ago, 2 days ago, etc.)
  const formatRelativeTime = useCallback((dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    // Less than 10 seconds - show "Now"
    if (diffInSeconds < 10) {
      return 'Now'
    }

    // Less than 60 seconds
    if (diffInSeconds < 60) {
      return `${diffInSeconds} sec ago`
    }

    // Less than 60 minutes
    const diffInMinutes = Math.floor(diffInSeconds / 60)
    if (diffInMinutes < 60) {
      return diffInMinutes === 1 ? '1 min ago' : `${diffInMinutes} mins ago`
    }

    // Less than 24 hours
    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) {
      return diffInHours === 1 ? '1 hour ago' : `${diffInHours} hours ago`
    }

    // Less than 7 days
    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays < 7) {
      return diffInDays === 1 ? '1 day ago' : `${diffInDays} days ago`
    }

    // Less than 30 days
    if (diffInDays < 30) {
      const diffInWeeks = Math.floor(diffInDays / 7)
      return diffInWeeks === 1 ? '1 week ago' : `${diffInWeeks} weeks ago`
    }

    // Less than 365 days
    if (diffInDays < 365) {
      const diffInMonths = Math.floor(diffInDays / 30)
      return diffInMonths === 1 ? '1 month ago' : `${diffInMonths} months ago`
    }

    // Over a year
    const diffInYears = Math.floor(diffInDays / 365)
    return diffInYears === 1 ? '1 year ago' : `${diffInYears} years ago`
  }, [])

  // Group sessions by date
  const groupSessionsByDate = useCallback((sessions: ChatSession[]) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    const lastWeek = new Date(today)
    lastWeek.setDate(lastWeek.getDate() - 7)

    const groups: Record<string, ChatSession[]> = {
      'Today': [],
      'Yesterday': [],
      'Last 7 Days': [],
      'Older': []
    }

    sessions.forEach(session => {
      const sessionDate = new Date(session.updated_at)
      sessionDate.setHours(0, 0, 0, 0)

      if (sessionDate.getTime() === today.getTime()) {
        groups['Today'].push(session)
      } else if (sessionDate.getTime() === yesterday.getTime()) {
        groups['Yesterday'].push(session)
      } else if (sessionDate >= lastWeek) {
        groups['Last 7 Days'].push(session)
      } else {
        groups['Older'].push(session)
      }
    })

    return groups
  }, [])

  const sessionGroups = groupSessionsByDate(chatSessions)

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

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuSessionId && !(e.target as Element).closest('.context-menu-trigger')) {
        setContextMenuSessionId(null)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [contextMenuSessionId])

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

  // Handle rename session
  const handleOpenRenameModal = (sessionId: string, currentTitle: string) => {
    setRenameModalSessionId(sessionId)
    setRenameFormValue(currentTitle)
    setContextMenuSessionId(null)
  }

  const handleCloseRenameModal = () => {
    setRenameModalSessionId(null)
    setRenameFormValue('')
    setIsRenamingSession(false)
  }

  const handleSaveRename = async () => {
    if (!renameModalSessionId || !renameFormValue.trim()) return

    try {
      setIsRenamingSession(true)
      const newTitle = renameFormValue.trim()

      const response = await fetch('/api/chats/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: renameModalSessionId,
          title: newTitle
        })
      })

      if (response.ok) {
        // Update parent component's state immediately via callback
        if (onSessionRename) {
          onSessionRename(renameModalSessionId, newTitle)
        }
        
        handleCloseRenameModal()
        
        // Refresh as backup to sync with database
        router.refresh()
      }
    } catch (error) {
      console.error('Error renaming session:', error)
    } finally {
      setIsRenamingSession(false)
    }
  }

  const handleOpenDeleteConfirm = (sessionId: string, sessionTitle: string) => {
    setDeleteConfirmSessionId(sessionId)
    setDeleteConfirmTitle(sessionTitle)
    setContextMenuSessionId(null)
  }

  const handleCloseDeleteConfirm = () => {
    setDeleteConfirmSessionId(null)
    setDeleteConfirmTitle('')
    setIsDeletingSession(false)
  }

  const handleConfirmDelete = async () => {
    if (!deleteConfirmSessionId) return

    try {
      setIsDeletingSession(true)

      const response = await fetch(`/api/chats/session?sessionId=${deleteConfirmSessionId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      })

      if (response.ok) {
        // Notify parent component immediately (instant UI update)
        const deletedSessionId = deleteConfirmSessionId
        if (onSessionDelete) {
          onSessionDelete(deletedSessionId)
        }
        
        // Close modal and reset state
        handleCloseDeleteConfirm()
      }
    } catch (error) {
      console.error('Error deleting session:', error)
    } finally {
      setIsDeletingSession(false)
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

    {/* Delete Session Confirmation Modal */}
    <AnimatePresence>
      {deleteConfirmSessionId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={handleCloseDeleteConfirm}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-md mx-4 p-6 rounded-lg shadow-xl"
            style={{ backgroundColor: theme.bg }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold" style={{ color: theme.text }}>
                Delete Chat Session
              </h3>
              <button
                onClick={handleCloseDeleteConfirm}
                className="p-2 rounded transition-colors hover:opacity-70"
                style={{ color: theme.textSecondary }}
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="mb-6">
              <p className="text-sm mb-3" style={{ color: theme.text }}>
                Are you sure you want to delete this chat session?
              </p>
              <div className="p-3 rounded-lg" style={{ backgroundColor: theme.cardBg }}>
                <p className="text-sm font-medium truncate" style={{ color: theme.text }}>
                  {deleteConfirmTitle || 'New Chat'}
                </p>
              </div>
              <p className="text-xs mt-3" style={{ color: theme.textMuted }}>
                This action cannot be undone. All messages in this session will be permanently deleted.
              </p>
            </div>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCloseDeleteConfirm}
                disabled={isDeletingSession}
                className="px-5 py-2.5 rounded-lg font-medium transition-colors"
                style={{ 
                  backgroundColor: theme.hoverBg,
                  color: theme.text
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeletingSession}
                className="px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  backgroundColor: '#ef4444',
                  color: '#ffffff'
                }}
              >
                {isDeletingSession ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Rename Session Modal */}
    <AnimatePresence>
      {renameModalSessionId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={handleCloseRenameModal}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-md mx-4 p-6 rounded-lg shadow-xl"
            style={{ backgroundColor: theme.bg }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold" style={{ color: theme.text }}>
                Rename Chat Session
              </h3>
              <button
                onClick={handleCloseRenameModal}
                className="p-2 rounded transition-colors hover:opacity-70"
                style={{ color: theme.textSecondary }}
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="mb-6">
              <input
                type="text"
                value={renameFormValue}
                onChange={(e) => setRenameFormValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveRename()
                  if (e.key === 'Escape') handleCloseRenameModal()
                }}
                placeholder="Enter new chat title..."
                autoFocus
                className="w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                style={{ 
                  backgroundColor: theme.bg, 
                  borderColor: theme.border,
                  color: theme.text
                }}
              />
            </div>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCloseRenameModal}
                disabled={isRenamingSession}
                className="px-5 py-2.5 rounded-lg font-medium transition-colors"
                style={{ 
                  backgroundColor: theme.hoverBg,
                  color: theme.text
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRename}
                disabled={isRenamingSession || !renameFormValue.trim()}
                className="px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  backgroundColor: '#000000ff',
                  color: '#ffffff'
                }}
              >
                {isRenamingSession ? 'Saving...' : 'Save'}
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
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold uppercase" style={{ color: theme.textMuted }}>Chats</h3>
                    {chatSessions.length > 0 && (
                      <span 
                        className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: theme.cardBg, color: theme.textSecondary }}
                      >
                        {chatSessions.length}
                      </span>
                    )}
                  </div>
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
                    className="space-y-4"
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
                    {Object.entries(sessionGroups).map(([groupName, sessions]) => (
                      sessions.length > 0 ? (
                        <div key={groupName}>
                          <h4 className="text-xs font-semibold uppercase px-2 mb-2" style={{ color: theme.textMuted }}>
                            {groupName}
                          </h4>
                          <div className="space-y-1">
                            {sessions.map((session) => (
                              <motion.div
                                key={session.id}
                                variants={{
                                  hidden: { opacity: 0, y: -10 },
                                  visible: { opacity: 1, y: 0 }
                                }}
                                className="relative group"
                              >
                                <button
                                  onClick={() => onChatSelect?.(session.id)}
                                  className="w-full text-left px-3 py-2 rounded-lg transition-all"
                                  style={{
                                    backgroundColor: currentChatId === session.id ? theme.activeBg : 'transparent',
                                  }}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium truncate" style={{ color: theme.text }}>
                                        {session.title || 'New Chat'}
                                      </div>
                                      <div className="text-sm mt-0.5" style={{ color: theme.textMuted }}>
                                        {formatRelativeTime(session.updated_at)}
                                      </div>
                                    </div>
                                    <div
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setContextMenuSessionId(contextMenuSessionId === session.id ? null : session.id)
                                      }}
                                      className="context-menu-trigger opacity-0 group-hover:opacity-100 p-1 rounded transition-all hover:bg-black/10 cursor-pointer"
                                      style={{ color: theme.textSecondary }}
                                      role="button"
                                      aria-label="Options"
                                      tabIndex={0}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          setContextMenuSessionId(contextMenuSessionId === session.id ? null : session.id)
                                        }
                                      }}
                                    >
                                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                                      </svg>
                                    </div>
                                  </div>
                                </button>

                                {/* Context Menu */}
                                <AnimatePresence>
                                  {contextMenuSessionId === session.id && (
                                    <motion.div
                                      initial={{ opacity: 0, scale: 0.95 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0, scale: 0.95 }}
                                      transition={{ duration: 0.1 }}
                                      className="absolute right-0 top-full mt-1 z-10 min-w-[160px] rounded-lg shadow-lg border"
                                      style={{
                                        backgroundColor: theme.bg,
                                        borderColor: theme.border
                                      }}
                                    >
                                      <button
                                        onClick={() => handleOpenRenameModal(session.id, session.title || 'New Chat')}
                                        className="w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-2"
                                        style={{
                                          color: theme.text,
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.backgroundColor = theme.hoverBg
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.backgroundColor = 'transparent'
                                        }}
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                        Rename
                                      </button>
                                      <div className="border-t" style={{ borderColor: theme.border }} />
                                      <button
                                        onClick={() => handleOpenDeleteConfirm(session.id, session.title || 'New Chat')}
                                        className="w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-2"
                                        style={{
                                          color: '#ef4444',
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.backgroundColor = theme.hoverBg
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.backgroundColor = 'transparent'
                                        }}
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Delete
                                      </button>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      ) : null
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

