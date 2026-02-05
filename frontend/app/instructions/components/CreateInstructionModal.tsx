'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface CreateInstructionModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (title: string, content: string, isActive: boolean) => void
}

export default function CreateInstructionModal({ isOpen, onClose, onCreate }: CreateInstructionModalProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isActive, setIsActive] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!title.trim() || !content.trim()) {
      alert('Title and content are required')
      return
    }

    onCreate(title.trim(), content.trim(), isActive)
    
    // Reset form
    setTitle('')
    setContent('')
    setIsActive(false)
  }

  const handleClose = () => {
    setTitle('')
    setContent('')
    setIsActive(false)
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Create New Instruction</h2>
                </div>
                <button
                  onClick={handleClose}
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
                    className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-elevated)' }}
                    required
                  />
                </div>

                {/* Content Textarea */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                    Instructions <span style={{ color: 'var(--accent-danger)' }}>*</span>
                  </label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Add instructions about the tone, style, coding standards, and persona you want the AI to adopt when working in this workspace..."
                    rows={10}
                    className="w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent resize-none text-sm"
                    style={{ border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)' }}
                    required
                  />
                  <p className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    These instructions will guide the AI&apos;s responses in this workspace
                  </p>
                </div>

                {/* Active Checkbox */}
                <div className="mb-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      Set as active instruction
                    </span>
                  </label>
                  <p className="ml-6 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Only one instruction can be active per workspace
                  </p>
                </div>

                {/* Buttons */}
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
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
                    Create Instruction
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
