'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Project } from '@/app/types'
import SidebarItem from './SidebarItem'

interface SidebarProps {
  user: User
  onSignOutAction: () => void
}

export default function Sidebar({
  user,
  onSignOutAction,
}: SidebarProps) {
  const [activeSection, setActiveSection] = useState<'chat' | 'vault' | 'projects' | 'instructions'>('chat')
  const [projects] = useState<Project[]>([])
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Load collapse state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved !== null) {
      setIsCollapsed(saved === 'true')
    }
  }, [])

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
        className={`bg-gray-50 h-screen flex flex-col shadow-md relative ${isCollapsed ? 'cursor-pointer' : ''}`}
        role="navigation"
        aria-label="Main navigation"
        aria-expanded={!isCollapsed}
      >
        {/* Header */}
        <div className={`border-b border-gray-200 transition-all duration-300 ${isCollapsed ? 'p-3' : 'p-4'}`}>
          <div className="flex items-center justify-between">
            <motion.h1
              initial={false}
              animate={{
                opacity: isCollapsed ? 0 : 1,
                width: isCollapsed ? 0 : 'auto',
              }}
              transition={{ duration: 0.3 }}
              className="text-xl font-bold text-gray-900 tracking-wider whitespace-nowrap overflow-hidden"
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
              }}
            />

            {/* Projects Section */}
            <SidebarItem
              icon={
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              }
              label="Projects"
              isActive={activeSection === 'projects'}
              isCollapsed={isCollapsed}
              onClick={(e) => {
                e.stopPropagation() // Prevent triggering sidebar click
                setActiveSection('projects')
              }}
              badge={projects.length > 0 ? projects.length : undefined}
            />

            {/* Sub-items for Projects when expanded and active */}
            <AnimatePresence>
              {activeSection === 'projects' && !isCollapsed && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="ml-4 space-y-1 overflow-hidden"
                >
                  {projects.length === 0 ? (
                    <p className="text-sm text-gray-400 px-4 py-2">No projects yet</p>
                  ) : (
                    projects.map((project) => (
                      <button
                        key={project.id}
                        className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        {project.name}
                      </button>
                    ))
                  )}
                  <button className="w-full text-left px-4 py-2 text-sm text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors">
                    + New Project
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
              }}
            />
          </div>
        </div>

        {/* User Profile Section */}
        <div className="p-3 border-t border-gray-200">
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
                  <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
                  <p className="text-xs text-gray-500 capitalize">{user.role}</p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onSignOutAction()
                }}
                className="w-full px-4 py-2 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors text-left flex items-center space-x-2"
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
