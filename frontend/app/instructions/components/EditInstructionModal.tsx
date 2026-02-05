'use client'

import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { WorkspaceInstruction } from '@/app/types'

interface EditInstructionModalProps {
  instruction: WorkspaceInstruction
  onClose: () => void
  onUpdate: (instructionId: string, title: string, content: string) => void
}

export default function EditInstructionModal({ instruction, onClose, onUpdate }: EditInstructionModalProps) {
  const [title, setTitle] = useState(instruction.title)
  const [content, setContent] = useState(instruction.instructions)

  useEffect(() => {
    setTitle(instruction.title)
    setContent(instruction.instructions)
  }, [instruction])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!title.trim() || !content.trim()) {
      alert('Title and content are required')
      return
    }

    onUpdate(instruction.id, title.trim(), content.trim())
  }

  return (
    <AnimatePresence>
      <>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 z-40"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div className="rounded-2xl shadow-xl max-w-3xl w-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(91, 140, 255, 0.1)' }}>
                  <svg className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Edit Instruction</h2>
              </div>
              <button
                onClick={onClose}
                className="transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6">
              {/* Title Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  Title <span style={{ color: 'var(--accent-danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Coding Standards, Documentation Style"
                  className="w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent text-sm"
                  style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-app)' }}
                  required
                />
              </div>

              {/* Content Textarea */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  Instructions <span style={{ color: 'var(--accent-danger)' }}>*</span>
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Add instructions about the tone, style, coding standards, and persona you want the AI to adopt..."
                  rows={10}
                  className="w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent resize-none text-sm"
                  style={{ border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)' }}
                  required
                />
              </div>

              {/* Active Status Info */}
              {instruction.is_active && (
                <div className="mb-6 p-3 rounded-lg" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5" style={{ color: 'rgb(34, 197, 94)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium" style={{ color: 'rgb(34, 197, 94)' }}>
                      This is the active instruction for this workspace
                    </span>
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 text-sm font-medium rounded-lg transition-colors"
                  style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-surface)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 text-sm font-medium rounded-lg transition-colors"
                  style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--text-inverse)' }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  )
}
