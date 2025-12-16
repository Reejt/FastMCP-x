'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Workspace, User } from '@/app/types'
import Sidebar from '@/app/components/Sidebar/Sidebar'
import WorkspaceCard from './components/WorkspaceCard'
import EditWorkspaceModal from './components/EditWorkspaceModal'

export default function WorkspacesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user: authUser }, error } = await supabase.auth.getUser()

      if (error || !authUser) {
        router.push('/login')
        return
      }

      // Get user role from user metadata or default to 'user'
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

  // Load workspaces from database
  useEffect(() => {
    if (!user) return

    loadWorkspaces()
  }, [user])

  const loadWorkspaces = async () => {
    try {
      const response = await fetch('/api/workspaces')
      const data = await response.json()

      if (data.success && data.workspaces) {
        setWorkspaces(data.workspaces)
      } else {
        console.error('Failed to load workspaces:', data)
      }
    } catch (error) {
      console.error('Error loading workspaces:', error)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }



  const handleDeleteWorkspace = async (workspaceId: string) => {
    if (!confirm('Are you sure you want to delete this workspace? This will also delete all documents and instructions.')) {
      return
    }

    try {
      const response = await fetch('/api/workspaces', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId })
      })

      const data = await response.json()

      if (data.success) {
        await loadWorkspaces()
      } else {
        console.error('Failed to delete workspace:', data.error)
        alert('Failed to delete workspace: ' + data.error)
      }
    } catch (error) {
      console.error('Error deleting workspace:', error)
      alert('Failed to delete workspace')
    }
  }

  const handleEditWorkspace = (workspace: Workspace) => {
    setEditingWorkspace(workspace)
  }

  const handleUpdateWorkspace = async (workspaceId: string, name: string, description: string | null) => {
    try {
      const response = await fetch('/api/workspaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, name, description })
      })

      const data = await response.json()

      if (data.success) {
        setEditingWorkspace(null)
        await loadWorkspaces()
      } else {
        console.error('Failed to update workspace:', data.error)
        alert('Failed to update workspace: ' + data.error)
      }
    } catch (error) {
      console.error('Error updating workspace:', error)
      alert('Failed to update workspace')
    }
  }

  // Filter workspaces by search query
  const filteredWorkspaces = workspaces.filter(workspace =>
    workspace.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    workspace.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <Sidebar user={user} onSignOutAction={handleSignOut} />

      {/* Main Workspaces Area */}
      <div className="flex-1 overflow-auto">
        <div className="min-h-screen bg-white">
          {/* Header - Centered Container */}
          <div className="max-w-5xl mx-auto px-12 py-8">
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-2xl font-semibold text-gray-900">Workspaces</h1>
              <button
                onClick={() => router.push('/workspaces/create')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Workspace
              </button>
            </div>

            {/* Search Bar */}
            <div className="mb-8">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search for workspace"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-400 text-sm text-gray-500"
                />
              </div>
            </div>
          </div>

          {/* Workspace Grid - Centered Container */}
          <div className="max-w-5xl mx-auto px-12 pb-8">
            {filteredWorkspaces.length === 0 && workspaces.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-4">
                  <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>
                <p className="text-gray-600 text-lg mb-2">No workspaces yet</p>
                <p className="text-gray-500 text-sm mb-6">Create your first workspace to get started</p>
                <button
                  onClick={() => router.push('/workspaces/create')}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Workspace
                </button>
              </div>
            ) : filteredWorkspaces.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600">No workspaces match your search</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {filteredWorkspaces.map((workspace) => (
                  <WorkspaceCard
                    key={workspace.id}
                    workspace={workspace}
                    onEditAction={() => handleEditWorkspace(workspace)}
                    onDeleteAction={() => handleDeleteWorkspace(workspace.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Edit Workspace Modal */}
          {editingWorkspace && (
            <EditWorkspaceModal
              workspace={editingWorkspace}
              onCloseAction={() => setEditingWorkspace(null)}
              onUpdateAction={handleUpdateWorkspace}
            />
          )}
        </div>
      </div>
    </div>
  )
}
