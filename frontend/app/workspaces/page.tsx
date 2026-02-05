'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Workspace, User } from '@/app/types'
import Sidebar from '@/app/components/Sidebar/Sidebar'
import EditWorkspaceModal from './components/EditWorkspaceModal'
import ConfirmationModal from '@/app/components/UI/ConfirmationModal'
import { useWorkspacesStore } from '@/app/contexts/WorkspacesContext'

export default function WorkspacesPage() {
  const router = useRouter()
  const supabase = createClient()
  const workspaces = useWorkspacesStore((state) => state.workspaces)
  const updateWorkspace = useWorkspacesStore((state) => state.updateWorkspace)
  const removeWorkspace = useWorkspacesStore((state) => state.removeWorkspace)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null)

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (openMenuId !== null) {
        setOpenMenuId(null)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [openMenuId])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }



  const handleDeleteWorkspace = async (workspaceId: string) => {
    try {
      const response = await fetch('/api/workspaces', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId })
      })

      const data = await response.json()

      if (data.success) {
        // Update context state - this will update all components
        removeWorkspace(workspaceId)
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
        // Update context state - this will update all components
        updateWorkspace(workspaceId, { name, description: description ?? undefined })
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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-app)' }}>
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-app)' }}>
      {/* Sidebar */}
      <Sidebar user={user} onSignOutAction={handleSignOut} />

      {/* Main Workspaces Area */}
      <div className="flex-1 overflow-auto">
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-app)' }}>
          {/* Header - Centered Container */}
          <div className="max-w-5xl mx-auto px-12 py-8">
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>Workspaces</h1>
              <button
                onClick={() => router.push('/workspaces/create')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                style={{ 
                  color: 'var(--text-primary)', 
                  backgroundColor: 'var(--bg-elevated)', 
                  border: '1px solid var(--border-subtle)' 
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'}
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
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search for workspace"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent text-sm"
                  style={{ 
                    border: '1px solid var(--border-subtle)', 
                    backgroundColor: 'var(--bg-elevated)', 
                    color: 'var(--text-primary)' 
                  }}
                />
              </div>
            </div>
          </div>

          {/* Workspace Grid - Centered Container */}
          <div className="max-w-5xl mx-auto px-12 pb-8">
            {filteredWorkspaces.length === 0 && workspaces.length === 0 ? (
              <div className="text-center py-12">
                <div className="mb-4" style={{ color: 'var(--text-muted)' }}>
                  <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>
                <p className="text-lg mb-2" style={{ color: 'var(--text-primary)' }}>No workspaces yet</p>
                <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>Create your first workspace to get started</p>
                <button
                  onClick={() => router.push('/workspaces/create')}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                  style={{ color: 'var(--text-inverse)', backgroundColor: 'var(--accent-primary)' }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Workspace
                </button>
              </div>
            ) : filteredWorkspaces.length === 0 ? (
              <div className="text-center py-12">
                <p style={{ color: 'var(--text-primary)' }}>No workspaces match your search</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {filteredWorkspaces.map((workspace) => (
                  <div
                    key={workspace.id}
                    className="group relative rounded-lg p-6 transition-all cursor-pointer"
                    style={{ 
                      backgroundColor: 'var(--bg-elevated)', 
                      border: '1px solid var(--border-subtle)' 
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-strong)'
                      e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-subtle)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                    onClick={() => router.push(`/workspaces/${workspace.id}`)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 pr-8">
                        <h3 className="text-base font-semibold truncate mb-2" style={{ color: 'var(--text-primary)' }}>
                          {workspace.name}
                        </h3>

                        {workspace.description && (
                          <p className="text-sm line-clamp-2 mb-3" style={{ color: 'var(--text-secondary)' }}>
                            {workspace.description}
                          </p>
                        )}
                      </div>

                      {/* Menu Button */}
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenMenuId(openMenuId === workspace.id ? null : workspace.id)
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded transition-opacity"
                          style={{ color: 'var(--text-secondary)' }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                          </svg>
                        </button>

                        {/* Dropdown Menu */}
                        {openMenuId === workspace.id && (
                          <div className="absolute right-0 mt-1 w-48 rounded-lg shadow-lg py-1 z-20" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEditWorkspace(workspace)
                                setOpenMenuId(null)
                              }}
                              className="w-full text-left px-4 py-2 text-sm flex items-center gap-2"
                              style={{ color: 'var(--text-primary)' }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </button>
                          <div className="my-1" style={{ borderTop: '1px solid var(--border-subtle)' }} />
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setWorkspaceToDelete(workspace)
                              setDeleteModalOpen(true)
                              setOpenMenuId(null)
                            }}
                            className="w-full text-left px-4 py-2 text-sm flex items-center gap-2"
                            style={{ color: 'var(--accent-danger)' }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                            }}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete
                          </button>
                        </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Edit Workspace Modal */}
          {editingWorkspace && (
            <EditWorkspaceModal
              workspaceId={editingWorkspace.id}
              workspaceName={editingWorkspace.name}
              workspaceDescription={editingWorkspace.description ?? null}
              onCloseAction={() => setEditingWorkspace(null)}
              onUpdateAction={handleUpdateWorkspace}
            />
          )}

          {/* Delete Confirmation Modal */}
          <ConfirmationModal
            isOpen={deleteModalOpen}
            onClose={() => {
              setDeleteModalOpen(false)
              setWorkspaceToDelete(null)
            }}
            onConfirm={() => {
              if (workspaceToDelete) {
                handleDeleteWorkspace(workspaceToDelete.id)
              }
            }}
            title="Delete Workspace"
            message={`Are you sure you want to delete "${workspaceToDelete?.name}"? This action cannot be undone and will permanently delete all documents and data in this workspace.`}
            confirmText="Delete"
            cancelText="Cancel"
            isDestructive={true}
          />
        </div>
      </div>
    </div>
  )
}
