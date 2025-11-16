'use client'

import { useState, useEffect } from 'react'
import { WorkspaceSummary, WorkspaceInstruction } from '@/app/types'

interface EditWorkspaceModalProps {
  workspace: WorkspaceSummary
  onCloseAction: () => void
  onUpdateAction: (workspaceId: string, name: string, description: string | null) => void
}

export default function EditWorkspaceModal({ workspace, onCloseAction, onUpdateAction }: EditWorkspaceModalProps) {
  const [name, setName] = useState(workspace.name)
  const [description, setDescription] = useState(workspace.description || '')
  const [instructions, setInstructions] = useState<WorkspaceInstruction[]>([])
  const [loadingInstructions, setLoadingInstructions] = useState(true)
  const [activeTab, setActiveTab] = useState<'details' | 'instructions'>('details')

  useEffect(() => {
    loadInstructions()
  }, [workspace.id])

  const loadInstructions = async () => {
    try {
      const response = await fetch(`/api/instructions?workspaceId=${workspace.id}`)
      const data = await response.json()

      if (data.success) {
        setInstructions(data.instructions)
      }
    } catch (error) {
      console.error('Error loading instructions:', error)
    } finally {
      setLoadingInstructions(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onUpdateAction(workspace.id, name, description || null)
  }

  const handleCreateInstruction = async () => {
    const title = prompt('Instruction Title:')
    if (!title) return

    const content = prompt('Instruction Content (boilerplate for now):')
    if (!content) return

    try {
      const response = await fetch('/api/instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          title,
          content,
          isActive: instructions.length === 0 // First instruction is active by default
        })
      })

      const data = await response.json()

      if (data.success) {
        await loadInstructions()
      } else {
        alert('Failed to create instruction: ' + data.error)
      }
    } catch (error) {
      console.error('Error creating instruction:', error)
      alert('Failed to create instruction')
    }
  }

  const handleActivateInstruction = async (instructionId: string) => {
    try {
      const response = await fetch('/api/instructions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructionId,
          activate: true
        })
      })

      const data = await response.json()

      if (data.success) {
        await loadInstructions()
      } else {
        alert('Failed to activate instruction: ' + data.error)
      }
    } catch (error) {
      console.error('Error activating instruction:', error)
      alert('Failed to activate instruction')
    }
  }

  const handleDeleteInstruction = async (instructionId: string) => {
    if (!confirm('Are you sure you want to delete this instruction?')) return

    try {
      const response = await fetch('/api/instructions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructionId })
      })

      const data = await response.json()

      if (data.success) {
        await loadInstructions()
      } else {
        alert('Failed to delete instruction: ' + data.error)
      }
    } catch (error) {
      console.error('Error deleting instruction:', error)
      alert('Failed to delete instruction')
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Edit Workspace</h2>
          <button
            onClick={onCloseAction}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab('details')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'details'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Details
            </button>
            <button
              onClick={() => setActiveTab('instructions')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'instructions'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Instructions ({instructions.length})
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-200px)]">
          {activeTab === 'details' ? (
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    Workspace Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                    Description (optional)
                  </label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Describe what this workspace is for..."
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={onCloseAction}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-700">AI Instructions</h3>
                <button
                  onClick={handleCreateInstruction}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Instruction
                </button>
              </div>

              {loadingInstructions ? (
                <div className="text-center py-8 text-gray-500">Loading instructions...</div>
              ) : instructions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No instructions yet. Add your first instruction to customize AI behavior for this workspace.
                </div>
              ) : (
                <div className="space-y-3">
                  {instructions.map((instruction) => (
                    <div
                      key={instruction.id}
                      className={`border rounded-lg p-4 ${instruction.is_active
                          ? 'border-indigo-300 bg-indigo-50'
                          : 'border-gray-200 bg-white'
                        }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-medium text-gray-900">{instruction.title}</h4>
                            {instruction.is_active && (
                              <span className="px-2 py-0.5 text-xs font-medium text-indigo-700 bg-indigo-100 rounded">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{instruction.content}</p>
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                          {!instruction.is_active && (
                            <button
                              onClick={() => handleActivateInstruction(instruction.id)}
                              className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                              title="Activate"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteInstruction(instruction.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
