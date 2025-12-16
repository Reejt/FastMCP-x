'use client'

import { useState } from 'react'

interface CreateWorkspaceFormProps {
  onCancelAction: () => void
  onCreateAction: (name: string, instructions: string) => void
}

export default function CreateWorkspaceForm({ onCancelAction, onCreateAction }: CreateWorkspaceFormProps) {
  const [name, setName] = useState('')
  const [instructions, setInstructions] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Use "New Workspace" as default if name is empty
    const workspaceName = name.trim() || 'New Workspace'
    onCreateAction(workspaceName, instructions)
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <h2 className="text-sm font-medium text-gray-900 text-left w-full">Create your workspace</h2>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="px-6 py-4">
          <div className="mb-4">
            <label htmlFor="workspace-name" className="block text-sm font-medium text-gray-700 mb-2">
              Workspace name
            </label>
            <input
              id="workspace-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter workspace name"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent text-sm text-gray-900 placeholder-gray-400"
            />
          </div>

          <div>
            <label htmlFor="workspace-instructions" className="block text-sm font-medium text-gray-700 mb-2">
              Workspace Instructions
            </label>
            <textarea
              id="workspace-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Add instructions about the tone, style, and persona you want your workspace to adopt."
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent resize-none text-sm text-gray-600 placeholder-gray-400"
            />
          </div>
        </div>

        {/* Footer with buttons */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancelAction}
            className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 text-sm font-medium text-white bg-gray-800 rounded-lg hover:bg-gray-900 transition-colors"
          >
            Create workspace
          </button>
        </div>
      </form>
    </div>
  )
}
