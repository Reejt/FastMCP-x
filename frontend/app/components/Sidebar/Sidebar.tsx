'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter, usePathname } from 'next/navigation'
import { User, Workspace } from '@/app/types'
import SidebarItem from './SidebarItem'


interface SidebarProps {
  user: User
  onSignOutAction: () => void
}

const MIN_WIDTH = 200
const MAX_WIDTH = 350
const DEFAULT_WIDTH = 256

export default function Sidebar({
  user,
  onSignOutAction,
}: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [activeSection, setActiveSection] = useState<'chat' | 'vault' | 'workspaces' | 'instructions'>('chat')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null)
  const [isWorkspacesDropdownOpen, setIsWorkspacesDropdownOpen] = useState(true)
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
  }

  // Update active section based on current pathname and extract workspace ID
  useEffect(() => {
    if (pathname.startsWith('/workspaces')) {
      setActiveSection('workspaces')
      // Extract workspace ID from pathname if viewing specific workspace
      const match = pathname.match(/\/workspaces\/([^\/]+)/)
      if (match) {
        setCurrentWorkspaceId(match[1])
      }
    } else if (pathname.startsWith('/vault')) {
      setActiveSection('vault')
    } else if (pathname.startsWith('/instructions')) {
      setActiveSection('instructions')
    } else if (pathname.startsWith('/dashboard')) {
      setActiveSection('chat')
      // Extract workspace ID from URL query parameters
      const urlParams = new URLSearchParams(window.location.search)
      const workspaceId = urlParams.get('workspace')
      setCurrentWorkspaceId(workspaceId)
    }
  }, [pathname]) // React to pathname changes only

  // Load collapse state and workspaces on mount
  useEffect(() => {
    const savedCollapsed = localStorage.getItem('sidebar-collapsed')
    const savedWidth = localStorage.getItem('main-sidebar-width')
    
    if (savedCollapsed !== null) {
      setIsCollapsed(savedCollapsed === 'true')
    }

    if (savedWidth !== null) {
      const width = parseInt(savedWidth, 10)
      if (width >= MIN_WIDTH && width <= MAX_WIDTH) {
        setSidebarWidth(width)
      }
    }

    // Load workspaces from API
    const loadWorkspaces = async () => {
      try {
        const response = await fetch('/api/workspaces')
        const data = await response.json()

        if (data.success && data.workspaces) {
          setWorkspaces(data.workspaces)
        }
      } catch (error) {
        console.error('Error loading workspaces:', error)
      }
    }

    loadWorkspaces()
  }, [])

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
      localStorage.setItem('main-sidebar-width', String(sidebarWidth))
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

  // Note: forceCollapse is kept for future use but doesn't restrict manual toggling
  // Users can always expand/collapse the main sidebar regardless of workspace sidebar state

  // Toggle collapse state and save to localStorage
  const toggleCollapse = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    localStorage.setItem('sidebar-collapsed', String(newState))
  }

  const handleResizeStart = (e: React.MouseEvent) => {
    if (isCollapsed) return
    e.preventDefault()
    setIsResizing(true)
  }

  return (
    <>
      {/* Sidebar Container */}
      <motion.aside
        ref={sidebarRef}
        initial={false}
        animate={{
          width: isCollapsed ? 64 : sidebarWidth,
        }}
        transition={{
          duration: isResizing ? 0 : 0.3,
          ease: 'easeInOut',
        }}
        onClick={isCollapsed ? toggleCollapse : undefined}
        className={`h-screen flex flex-col shadow-sm relative border-r ${isCollapsed ? 'cursor-pointer' : ''}`}
        style={{ backgroundColor: theme.bg, borderColor: theme.border }}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Resize Handle */}
        {!isCollapsed && (
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors z-10"
            onMouseDown={handleResizeStart}
            style={{ backgroundColor: isResizing ? 'rgba(59, 130, 246, 0.5)' : 'transparent' }}
          />
        )}
        {/* Header */}
        <div className="transition-all duration-300 py-3 px-4">
          <div className="flex items-center justify-between">
            <motion.h1
              initial={false}
              animate={{
                opacity: isCollapsed ? 0 : 1,
                width: isCollapsed ? 0 : 'auto',
              }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="text-base font-medium tracking-wide whitespace-nowrap overflow-hidden"
              style={{ color: theme.text }}
            >
              VARYS AI
            </motion.h1>

            {/* Collapse/Expand Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation() // Prevent triggering sidebar click
                toggleCollapse()
              }}
              className="p-2 rounded-lg transition-colors flex-shrink-0 hover:opacity-70"
              style={{ color: theme.textSecondary }}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-controls="sidebar-nav"
            >
              <svg
                className="w-5 h-5 transition-transform duration-300"
                style={{ transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden" id="sidebar-nav">
          <div className="p-3 space-y-1">
            {/* Chat Section */}
            <SidebarItem
              icon={
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              }
              label="Chat"
              isActive={activeSection === 'chat'}
              isCollapsed={isCollapsed}
              onClick={(e) => {
                e.stopPropagation() // Prevent triggering sidebar click
                setActiveSection('chat')
                router.push('/dashboard')
              }}
            />

            {/* Workspaces Section */}
            <div className="relative group">
              <SidebarItem
                icon={
                  <>
                    {/* Folder icon - visible by default, hidden on hover */}
                    <svg className="group-hover:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>

                    {/* Chevron - appears in place of the icon on hover and toggles dropdown */}
                    {!isCollapsed && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          setIsWorkspacesDropdownOpen(!isWorkspacesDropdownOpen)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            e.stopPropagation()
                            setIsWorkspacesDropdownOpen(!isWorkspacesDropdownOpen)
                          }
                        }}
                        className="hidden group-hover:inline-flex p-1 rounded transition-colors cursor-pointer hover:opacity-70"
                        role="button"
                        tabIndex={0}
                        aria-label="Toggle workspaces dropdown"
                      >
                        <svg className={`w-4 h-4 transition-transform ${isWorkspacesDropdownOpen ? 'rotate-90' : ''}`} style={{ color: theme.textSecondary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    )}
                  </>
                }
                label="Workspaces"
                isActive={activeSection === 'workspaces'}
                isCollapsed={isCollapsed}
                onClick={(e) => {
                  e.stopPropagation() // Prevent triggering sidebar click
                  // Navigate to workspaces page when clicking the main item
                  setActiveSection('workspaces')
                  router.push('/workspaces')
                }}
              />

              {/* Plus icon on the right (create new workspace) */}
              {!isCollapsed && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    router.push('/workspaces/create')
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded transition-colors hover:opacity-70"
                  style={{ color: theme.textSecondary }}
                  aria-label="Create new workspace"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
            </div>

            {/* Sub-items for Workspaces - visible when dropdown is open and sidebar is expanded */}
            <AnimatePresence>
              {!isCollapsed && isWorkspacesDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="ml-4 space-y-1 overflow-hidden"
                >
                  {workspaces.length === 0 ? (
                    <p className="text-sm px-4 py-2" style={{ color: theme.textSecondary }}>No workspaces yet</p>
                  ) : (
                    <>
                      {workspaces.slice(0, 5).map((workspace) => (
                        <button
                          key={workspace.id}
                          onClick={() => router.push(`/workspaces/${workspace.id}`)}
                          className="w-full text-left px-4 py-2 text-sm rounded-lg transition-colors"
                          style={{
                            backgroundColor: currentWorkspaceId === workspace.id ? theme.activeBg : 'transparent',
                            color: currentWorkspaceId === workspace.id ? theme.text : theme.textSecondary,
                          }}
                          onMouseEnter={(e) => {
                            if (currentWorkspaceId !== workspace.id) {
                              e.currentTarget.style.backgroundColor = theme.hoverBg
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (currentWorkspaceId !== workspace.id) {
                              e.currentTarget.style.backgroundColor = 'transparent'
                            }
                          }}
                        >
                          {workspace.name}
                        </button>
                      ))}
                      {workspaces.length > 5 && (
                        <button
                          onClick={() => router.push('/workspaces')}
                          className="w-full text-left px-4 py-2 text-sm rounded-lg transition-colors"
                          style={{ color: theme.textSecondary }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = theme.hoverBg
                            e.currentTarget.style.color = theme.text
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                            e.currentTarget.style.color = theme.textSecondary
                          }}
                        >
                          See all ({workspaces.length})
                        </button>
                      )}
                    </>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push('/workspaces/create')
                    }}
                    className="w-full text-left px-4 py-2 text-sm rounded-lg transition-colors"
                    style={{ color: '#22c55e' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = theme.hoverBg
                      e.currentTarget.style.color = '#16a34a'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.color = '#22c55e'
                    }}
                  >
                    + New Workspace
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Vault Section */}
            <SidebarItem
              icon={
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              }
              label="Vault"
              isActive={activeSection === 'vault'}
              isCollapsed={isCollapsed}
              onClick={(e) => {
                e.stopPropagation() // Prevent triggering sidebar click
                setActiveSection('vault')
                router.push('/vault')
              }}
            />

            {/* Instructions Section */}
            <SidebarItem
              icon={
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              label="Instructions"
              isActive={activeSection === 'instructions'}
              isCollapsed={isCollapsed}
              onClick={(e) => {
                e.stopPropagation() // Prevent triggering sidebar click
                setActiveSection('instructions')
                router.push('/instructions')
              }}
            />
          </div>
        </div>

        {/* User Profile Section */}
        <div className="p-3">
          {!isCollapsed ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center space-x-3 mb-3 px-2">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
                  <span className="font-medium text-sm" style={{ color: '#16a34a' }}>
                    {user.email.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <p className="text-sm font-medium truncate" style={{ color: theme.text }}>{user.email}</p>
                  <p className="text-xs capitalize" style={{ color: theme.textSecondary }}>{user.role}</p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onSignOutAction()
                }}
                className="w-full px-4 py-2 text-sm rounded-lg transition-colors text-left flex items-center space-x-2"
                style={{ color: theme.textSecondary }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = theme.hoverBg
                  e.currentTarget.style.color = theme.text
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = theme.textSecondary
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Sign Out</span>
              </button>
            </motion.div>
          ) : (
            <div className="flex flex-col items-center space-y-2">
              {/* Collapsed user avatar */}
              <div className="w-10 h-10 rounded-full flex items-center justify-center group relative" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
                <span className="font-medium text-sm" style={{ color: '#16a34a' }}>
                  {user.email.charAt(0).toUpperCase()}
                </span>
                {/* Tooltip */}
                <div className="absolute left-full ml-2 px-2 py-1 text-sm rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none shadow-lg" style={{ backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}` }}>
                  {user.email}
                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent" style={{ borderRightColor: theme.bg }} />
                </div>
              </div>
              {/* Collapsed sign out button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onSignOutAction()
                }}
                className="p-2 rounded-lg transition-colors group relative"
                style={{ color: theme.textSecondary }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = theme.hoverBg
                  e.currentTarget.style.color = theme.text
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = theme.textSecondary
                }}
                aria-label="Sign out"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                {/* Tooltip */}
                <div className="absolute left-full ml-2 px-2 py-1 text-sm rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none shadow-lg" style={{ backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}` }}>
                  Sign Out
                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent" style={{ borderRightColor: theme.bg }} />
                </div>
              </button>
            </div>
          )}
        </div>
      </motion.aside>
    </>
  )
}
