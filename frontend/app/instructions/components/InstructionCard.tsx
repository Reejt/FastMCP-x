'use client'

import { WorkspaceInstruction } from '@/app/types'
import { useState } from 'react'

interface InstructionCardProps {
  instruction: WorkspaceInstruction
  onEdit: () => void
  onDelete: () => void
  onActivate: () => void
  onDeactivate: () => void
}

export default function InstructionCard({
  instruction,
  onEdit,
  onDelete,
  onActivate,
  onDeactivate
}: InstructionCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const createdDate = new Date(instruction.created_at)
  const formattedDate = createdDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })

  const contentPreview = instruction.instructions.length > 150
    ? instruction.instructions.substring(0, 150) + '...'
    : instruction.instructions

  return (
    <div className="rounded-xl hover:shadow-md transition-all duration-200" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              {instruction.title}
            </h3>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formattedDate}</p>
          </div>
          
          {/* Status Badge & Menu */}
          <div className="flex items-center gap-2">
            {instruction.is_active && (
              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full" style={{ color: 'rgb(34, 197, 94)', backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Active
              </span>
            )}
            
            {/* Menu Button */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 rounded-lg transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 rounded-lg shadow-lg py-1 z-20" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                    <button
                      onClick={() => {
                        onEdit()
                        setShowMenu(false)
                      }}
                      className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>

                    {instruction.is_active ? (
                      <button
                        onClick={() => {
                          onDeactivate()
                          setShowMenu(false)
                        }}
                        className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors"
                        style={{ color: 'var(--text-primary)' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                        Deactivate
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          onActivate()
                          setShowMenu(false)
                        }}
                        className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors"
                        style={{ color: 'var(--text-primary)' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Activate
                      </button>
                    )}

                    <hr className="my-1" style={{ borderColor: 'var(--border-subtle)' }} />

                    <button
                      onClick={() => {
                        onDelete()
                        setShowMenu(false)
                      }}
                      className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors"
                      style={{ color: 'var(--accent-danger)' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <p className="whitespace-pre-wrap">
            {isExpanded ? instruction.instructions : contentPreview}
          </p>
          {instruction.instructions.length > 150 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 font-medium text-xs transition-colors"
              style={{ color: 'var(--accent-primary)' }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              {isExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 rounded-b-xl">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Updated {new Date(instruction.updated_at).toLocaleDateString()}</span>
          <div className="flex items-center gap-4">
            <button
              onClick={onEdit}
              className="text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Edit
            </button>
            {!instruction.is_active && (
              <button
                onClick={onActivate}
                className="text-green-600 hover:text-green-700 font-medium"
              >
                Activate
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
