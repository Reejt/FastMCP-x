'use client'

import { useState } from 'react'
import { User, Project } from '@/app/types'

interface SidebarProps {
  user: User
  onSignOutAction: () => void
}

export default function Sidebar({ user, onSignOutAction }: SidebarProps) {
  const [activeSection, setActiveSection] = useState<'chat' | 'vault' | 'projects' | 'instructions'>('chat')
  const [projects] = useState<Project[]>([])

  return (
    <div className="w-64 bg-white h-screen flex flex-col border-r border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900 tracking-wider">VARYS AI</h1>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Chat Section */}
        <div className="p-3">
          <button
            onClick={() => setActiveSection('chat')}
            className={`w-full text-left px-4 py-2.5 rounded-lg transition-colors ${activeSection === 'chat'
              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              : 'text-gray-700 hover:bg-gray-50'
              }`}
          >
            <div className="flex items-center space-x-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="font-medium">Chat</span>
            </div>
          </button>
        </div>

        {/* Projects Section */}
        <div className="px-3 py-2">
          <button
            onClick={() => setActiveSection('projects')}
            className={`w-full text-left px-4 py-2.5 rounded-lg transition-colors ${activeSection === 'projects'
              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              : 'text-gray-700 hover:bg-gray-50'
              }`}
          >
            <div className="flex items-center space-x-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span className="font-medium">Projects</span>
            </div>
          </button>

          {activeSection === 'projects' && (
            <div className="mt-2 ml-4 space-y-1">
              {projects.length === 0 ? (
                <p className="text-sm text-gray-400 px-4 py-2">No projects yet</p>
              ) : (
                projects.map((project) => (
                  <button
                    key={project.id}
                    className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    {project.name}
                  </button>
                ))
              )}
              <button className="w-full text-left px-4 py-2 text-sm text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors">
                + New Project
              </button>
            </div>
          )}
        </div>

        {/* Vault Section */}
        <div className="px-3 py-2">
          <button
            onClick={() => setActiveSection('vault')}
            className={`w-full text-left px-4 py-2.5 rounded-lg transition-colors ${activeSection === 'vault'
              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              : 'text-gray-700 hover:bg-gray-50'
              }`}
          >
            <div className="flex items-center space-x-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <span className="font-medium">Vault</span>
            </div>
          </button>
        </div>

        {/* Instructions Section */}
        <div className="px-3 py-2">
          <button
            onClick={() => setActiveSection('instructions')}
            className={`w-full text-left px-4 py-2.5 rounded-lg transition-colors ${activeSection === 'instructions'
              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              : 'text-gray-700 hover:bg-gray-50'
              }`}
          >
            <div className="flex items-center space-x-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="font-medium">Instructions</span>
            </div>
          </button>
        </div>
      </div>

      {/* User Profile Section */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
            <span className="text-indigo-700 font-medium text-sm">
              {user.email.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
            <p className="text-xs text-gray-500 capitalize">{user.role}</p>
          </div>
        </div>
        <button
          onClick={onSignOutAction}
          className="w-full px-4 py-2 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors text-left"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}
