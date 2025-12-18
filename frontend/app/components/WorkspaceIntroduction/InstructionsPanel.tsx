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

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm text-gray-900" style={{ fontFamily: 'var(--font-chirp)' }}>Instructions</h3>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowAddModal(true)
          }}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          aria-label="Edit instruction"
        >
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="mt-2">
        {existingInstructions ? (
          <p className="text-sm text-gray-600 leading-relaxed">{existingInstructions}</p>
        ) : (
          <p className="text-sm text-gray-400">No instructions added yet</p>
        )}
      </div>

      {/* Add Instruction Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Instruction</h3>
            <textarea
              value={newInstruction}
              onChange={(e) => setNewInstruction(e.target.value)}
              placeholder="Enter your instruction..."
              disabled={isLoading}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg resize-none focus:border-[#d4a574] focus:ring-1 focus:ring-[#d4a574] focus:outline-none disabled:bg-gray-50"
              rows={4}
            />
            {error && (
              <p className="text-sm text-red-600 mt-2">❌ {error}</p>
            )}
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setError(null)
                }}
                disabled={isLoading}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddInstruction}
                disabled={!newInstruction.trim() || isLoading}
                className="px-4 py-2 bg-[#d4a574] text-white hover:bg-[#c99a6a] disabled:bg-gray-200 disabled:cursor-not-allowed rounded-lg transition-colors text-sm"
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
