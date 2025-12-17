'use client'

import { useState } from 'react'
import { Workspace } from '@/app/types'
import { motion, AnimatePresence } from 'framer-motion'

interface InstructionsPanelProps {
  workspace: Workspace
}

export default function InstructionsPanel({ workspace }: InstructionsPanelProps) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [newInstruction, setNewInstruction] = useState('')

  const existingInstructions = workspace.description || ''

  const handleAddInstruction = () => {
    if (newInstruction.trim()) {
      // TODO: Implement API call to add instruction
      console.log('Adding instruction:', newInstruction)
      setNewInstruction('')
      setShowAddModal(false)
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
              className="w-full px-4 py-3 border border-gray-200 rounded-lg resize-none focus:border-[#d4a574] focus:ring-1 focus:ring-[#d4a574] focus:outline-none"
              rows={4}
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAddInstruction}
                disabled={!newInstruction.trim()}
                className="px-4 py-2 bg-[#d4a574] text-white hover:bg-[#c99a6a] disabled:bg-gray-200 disabled:cursor-not-allowed rounded-lg transition-colors text-sm"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
