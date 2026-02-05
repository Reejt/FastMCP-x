'use client'

import { useState, useEffect } from 'react'
import { Workspace } from '@/app/types'
import { motion, AnimatePresence } from 'framer-motion'

interface InstructionsPanelProps {
  workspace: Workspace
  onInstructionAdded?: () => void
}

export default function InstructionsPanel({ workspace, onInstructionAdded }: InstructionsPanelProps) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [newInstruction, setNewInstruction] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existingInstructions, setExistingInstructions] = useState<string>('')
  const [isFetching, setIsFetching] = useState(false)

  // Fetch existing instructions when workspace changes
  useEffect(() => {
    loadInstructions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id])

  const loadInstructions = async () => {
    if (!workspace.id) return

    setIsFetching(true)
    try {
      const response = await fetch(`/api/instructions?workspaceId=${workspace.id}`)
      const data = await response.json()

      if (response.ok && data.instructions && data.instructions.length > 0) {
        // Get the active instruction or the first one
        const activeInstruction = data.instructions.find((instr: any) => instr.is_active) || data.instructions[0]
        setExistingInstructions(activeInstruction.instructions || '')
      } else {
        setExistingInstructions('')
      }
    } catch (err) {
      console.error('Failed to fetch instructions:', err)
      setExistingInstructions('')
    } finally {
      setIsFetching(false)
    }
  }

  const handleAddInstruction = async () => {
    if (!newInstruction.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          title: 'Workspace Instruction',
          instructions: newInstruction.trim(),
          isActive: true
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add instruction')
      }

      console.log('✅ Instruction added successfully:', data.instruction)
      setNewInstruction('')
      setShowAddModal(false)
      
      // Reload instructions to display the newly added one
      await loadInstructions()
      
      // Callback to refresh parent component if needed
      if (onInstructionAdded) {
        onInstructionAdded()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      console.error('❌ Error adding instruction:', message)
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  // Light theme colors
  const theme = {
    text: 'var(--text-primary)',
    textSecondary: '#666666',
    textMuted: '#999999',
    cardBg: '#ffffff',
    inputBg: '#f5f5f5',
    border: '#e5e5e5',
    borderHover: '#d5d5d5',
    hoverBg: 'rgba(0,0,0,0.05)',
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm" style={{ fontFamily: 'var(--font-chirp)', color: theme.text }}>Instructions</h3>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowAddModal(true)
          }}
          className="p-1 rounded transition-colors hover:opacity-70"
          style={{ color: theme.textMuted }}
          aria-label="Edit instruction"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="mt-2">
        {existingInstructions ? (
          <p className="text-sm leading-relaxed" style={{ color: theme.textSecondary }}>{existingInstructions}</p>
        ) : (
          <p className="text-sm" style={{ color: theme.textMuted }}>No instructions added yet</p>
        )}
      </div>

      {/* Add Instruction Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
          <div 
            className="rounded-xl p-6 w-full max-w-md shadow-xl border"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4" style={{ color: theme.text }}>Add Instruction</h3>
            <textarea
              value={newInstruction}
              onChange={(e) => setNewInstruction(e.target.value)}
              placeholder="Enter your instruction..."
              disabled={isLoading}
              className="w-full px-4 py-3 border rounded-lg resize-none focus:outline-none disabled:cursor-not-allowed"
              style={{ 
                backgroundColor: theme.inputBg, 
                borderColor: theme.border, 
                color: theme.text 
              }}
              rows={4}
            />
            {error && (
              <p className="text-sm text-red-400 mt-2">❌ {error}</p>
            )}
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setError(null)
                }}
                disabled={isLoading}
                className="px-4 py-2 rounded-lg transition-colors text-sm disabled:opacity-50"
                style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}
                onMouseEnter={(e) => !isLoading && (e.currentTarget.style.backgroundColor = 'var(--bg-surface)')}
                onMouseLeave={(e) => !isLoading && (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
              >
                Cancel
              </button>
              <button
                onClick={handleAddInstruction}
                disabled={!newInstruction.trim() || isLoading}
                className="px-4 py-2 rounded-lg transition-colors text-sm disabled:cursor-not-allowed disabled:opacity-50"
                style={{ 
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--text-inverse)'
                }}
                onMouseEnter={(e) => !isLoading && newInstruction.trim() && (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={(e) => !isLoading && newInstruction.trim() && (e.currentTarget.style.opacity = '1')}
              >
                {isLoading ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
