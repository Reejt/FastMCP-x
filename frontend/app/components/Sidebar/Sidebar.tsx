'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter, usePathname } from 'next/navigation'
import { User, Workspace } from '@/app/types'
import SidebarItem from './SidebarItem'

interface SidebarProps {
  user: User
  onSignOutAction: () => void
}

export default function Sidebar({
  user,
  onSignOutAction,
}: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [activeSection, setActiveSection] = useState<'chat' | 'vault' | 'workspaces' | 'instructions'>('chat')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null)
  const [isWorkspacesDropdownOpen, setIsWorkspacesDropdownOpen] = useState(true)

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
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved !== null) {
      setIsCollapsed(saved === 'true')
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

  // Note: forceCollapse is kept for future use but doesn't restrict manual toggling
  // Users can always expand/collapse the main sidebar regardless of workspace sidebar state

  // Toggle collapse state and save to localStorage
  const toggleCollapse = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    localStorage.setItem('sidebar-collapsed', String(newState))
  }

  return (
    <>
      {/* Sidebar Container */}
      <motion.aside
        initial={false}
        animate={{
          width: isCollapsed ? 64 : 256,
        }}
        transition={{
          duration: 0.3,
          ease: 'easeInOut',
        }}
        onClick={isCollapsed ? toggleCollapse : undefined}
        className={`h-screen flex flex-col shadow-md relative ${isCollapsed ? 'cursor-pointer' : ''}`}
        style={{ backgroundColor: '#fcfcfc' }}
        role="navigation"
        aria-label="Main navigation"
      >
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
              style={{ color: '#060606' }}
            >
              VARYS AI
            </motion.h1>

            {/* Collapse/Expand Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation() // Prevent triggering sidebar click
                toggleCollapse()
              }}
              className="p-2 rounded-lg hover:bg-gray-200 transition-colors text-gray-600 hover:text-gray-900 flex-shrink-0"
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setIsWorkspacesDropdownOpen(!isWorkspacesDropdownOpen)
                        }}
                        className="hidden group-hover:inline-flex p-1 rounded hover:bg-gray-200 transition-colors"
                        aria-label="Toggle workspaces dropdown"
                      >
                        <svg className={`w-4 h-4 text-gray-600 transition-transform ${isWorkspacesDropdownOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
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
                    router.push('/workspaces')
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded transition-colors"
                  aria-label="Create new workspace"
                >
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <p className="text-sm text-gray-400 px-4 py-2">No workspaces yet</p>
                  ) : (
                    <>
                      {workspaces.slice(0, 5).map((workspace) => (
                        <button
                          key={workspace.id}
                          onClick={() => router.push(`/workspaces/${workspace.id}`)}
                          className={`w-full text-left px-4 py-2 text-sm rounded-lg transition-colors ${currentWorkspaceId === workspace.id
                            ? 'bg-gray-200'
                            : 'hover:bg-gray-100'
                            }`}
                          style={{ color: '#060606' }}
                        >
                          {workspace.name}
                        </button>
                      ))}
                      {workspaces.length > 5 && (
                        <button
                          onClick={() => router.push('/workspaces')}
                          className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          See all ({workspaces.length})
                        </button>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => router.push('/workspaces')}
                    className="w-full text-left px-4 py-2 text-sm text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
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
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-indigo-700 font-medium text-sm">
                    {user.email.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <p className="text-sm font-medium truncate" style={{ color: '#060606' }}>{user.email}</p>
                  <p className="text-xs text-gray-500 capitalize">{user.role}</p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onSignOutAction()
                }}
                className="w-full px-4 py-2 text-sm hover:bg-gray-100 rounded-lg transition-colors text-left flex items-center space-x-2"
                style={{ color: '#060606' }}
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
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center group relative">
                <span className="text-indigo-700 font-medium text-sm">
                  {user.email.charAt(0).toUpperCase()}
                </span>
                {/* Tooltip */}
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none">
                  {user.email}
                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
                </div>
              </div>
              {/* Collapsed sign out button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onSignOutAction()
                }}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors group relative"
                aria-label="Sign out"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                {/* Tooltip */}
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none">
                  Sign Out
                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
                </div>
              </button>
            </div>
          )}
        </div>
      </motion.aside>
    </>
  )
}
