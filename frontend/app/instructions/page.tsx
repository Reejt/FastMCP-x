'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { User, Workspace, WorkspaceInstruction } from '@/app/types'
import Sidebar from '@/app/components/Sidebar/Sidebar'
import CreateInstructionModal from './components/CreateInstructionModal'
import EditInstructionModal from './components/EditInstructionModal'
import InstructionCard from './components/InstructionCard'

export default function InstructionsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [instructions, setInstructions] = useState<WorkspaceInstruction[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingInstruction, setEditingInstruction] = useState<WorkspaceInstruction | null>(null)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user: authUser }, error } = await supabase.auth.getUser()

      if (error || !authUser) {
        router.push('/login')
        return
      }

      const userRole = authUser.user_metadata?.role || 'user'

      setUser({
        id: authUser.id,
        email: authUser.email || 'Unknown',
        role: userRole
      })
      setLoading(false)
    }

    checkUser()
  }, [router, supabase])

  // Load workspaces
  useEffect(() => {
    if (!user) return
    loadWorkspaces()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Load instructions when workspace is selected
  useEffect(() => {
    if (selectedWorkspaceId) {
      loadInstructions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspaceId])

  const loadWorkspaces = async () => {
    try {
      const response = await fetch('/api/workspaces')
      const data = await response.json()

      if (data.success) {
        setWorkspaces(data.workspaces)

        // Auto-select first workspace or from query param
        const workspaceIdParam = searchParams.get('workspaceId')
        if (workspaceIdParam) {
          setSelectedWorkspaceId(workspaceIdParam)
        } else if (data.workspaces.length > 0) {
          setSelectedWorkspaceId(data.workspaces[0].id)
        }
      }
    } catch (error) {
      console.error('Error loading workspaces:', error)
    }
  }

  const loadInstructions = async () => {
    if (!selectedWorkspaceId) return

    try {
      const response = await fetch(`/api/instructions?workspaceId=${selectedWorkspaceId}`)
      const data = await response.json()

      if (data.success) {
        setInstructions(data.instructions)
      }
    } catch (error) {
      console.error('Error loading instructions:', error)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const handleCreateInstruction = async (title: string, instructions: string, isActive: boolean) => {
    if (!selectedWorkspaceId) {
      alert('Please select a workspace first')
      return
    }

    try {
      const response = await fetch('/api/instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          title,
          instructions,
          isActive
        })
      })

      const data = await response.json()

      if (data.success) {
        setIsCreateModalOpen(false)
        await loadInstructions()
      } else {
        alert('Failed to create instruction: ' + data.error)
      }
    } catch (error) {
      console.error('Error creating instruction:', error)
      alert('Failed to create instruction')
    }
  }

  const handleUpdateInstruction = async (instructionId: string, title: string, content: string) => {
    try {
      const response = await fetch('/api/instructions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructionId,
          title,
          instructions: content
        })
      })

      const data = await response.json()

      if (data.success) {
        setEditingInstruction(null)
        await loadInstructions()
      } else {
        alert('Failed to update instruction: ' + data.error)
      }
    } catch (error) {
      console.error('Error updating instruction:', error)
      alert('Failed to update instruction')
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

  const handleDeactivateInstruction = async (instructionId: string) => {
    try {
      const response = await fetch('/api/instructions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructionId,
          deactivate: true
        })
      })

      const data = await response.json()

      if (data.success) {
        await loadInstructions()
      } else {
        alert('Failed to deactivate instruction: ' + data.error)
      }
    } catch (error) {
      console.error('Error deactivating instruction:', error)
      alert('Failed to deactivate instruction')
    }
  }

  const handleDeleteInstruction = async (instructionId: string) => {
    if (!confirm('Are you sure you want to delete this instruction?')) {
      return
    }

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-app)' }}>
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const selectedWorkspace = workspaces.find(w => w.id === selectedWorkspaceId)

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar user={user} onSignOutAction={handleSignOut} />

      <div className="flex-1 overflow-auto">
        <div className="min-h-screen bg-white">
          {/* Header */}
          <div className="border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-6 py-6">
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-3xl font-semibold" style={{ color: 'var(--text-primary)' }}>Instructions</h1>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  disabled={!selectedWorkspaceId}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Instruction
                </button>
              </div>

              {/* Workspace Selector */}
              {workspaces.length > 0 && (
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">Workspace:</label>
                  <select
                    value={selectedWorkspaceId}
                    onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  >
                    {workspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="max-w-7xl mx-auto px-6 py-8">
            {workspaces.length === 0 ? (
              <div className="text-center py-12">
                <div className="mb-4" style={{ color: 'var(--text-muted)' }}>
                  <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>
                <p className="text-lg mb-2" style={{ color: 'var(--text-primary)' }}>No Workspaces Found</p>
                <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                  Create a workspace first to add instructions
                </p>
                <button
                  onClick={() => router.push('/workspaces')}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                  style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--text-inverse)' }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                  Go to Workspaces
                </button>
              </div>
            ) : instructions.length === 0 ? (
              <div className="text-center py-12">
                <div className="mb-4" style={{ color: 'var(--text-muted)' }}>
                  <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-lg mb-2" style={{ color: 'var(--text-primary)' }}>No Custom Instructions</p>
                <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                  Create custom instructions to guide how the AI responds to your questions in <strong>{selectedWorkspace?.name}</strong>
                </p>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                  style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--text-inverse)' }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create First Instruction
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {instructions.map((instruction) => (
                  <InstructionCard
                    key={instruction.id}
                    instruction={instruction}
                    onEdit={() => setEditingInstruction(instruction)}
                    onDelete={() => handleDeleteInstruction(instruction.id)}
                    onActivate={() => handleActivateInstruction(instruction.id)}
                    onDeactivate={() => handleDeactivateInstruction(instruction.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Modals */}
          <CreateInstructionModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onCreate={handleCreateInstruction}
          />

          {editingInstruction && (
            <EditInstructionModal
              instruction={editingInstruction}
              onClose={() => setEditingInstruction(null)}
              onUpdate={handleUpdateInstruction}
            />
          )}
        </div>
      </div>
    </div>
  )
}
