'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Workspace, User } from '@/app/types'
import Sidebar from '@/app/components/Sidebar/Sidebar'
import WorkspaceCard from './components/WorkspaceCard'
import CreateWorkspaceModal from './components/CreateWorkspaceModal'

export default function WorkspacesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'my' | 'shared' | 'examples'>('my')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

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

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Mock data - replace with real data from API
  const myWorkspaces: Workspace[] = [
    {
      id: '1',
      name: 'New Project',
      description: 'My first workspace',
      createdAt: new Date('2024-11-01'),
      updatedAt: new Date('2024-11-02'),
    },
    {
      id: '2',
      name: 'New Project (clone)',
      description: 'Cloned workspace',
      createdAt: new Date('2024-10-28'),
      updatedAt: new Date('2024-10-30'),
    },
    {
      id: '3',
      name: 'New Project',
      description: 'Another workspace',
      createdAt: new Date('2024-10-25'),
      updatedAt: new Date('2024-10-26'),
    },
    {
      id: '4',
      name: 'New Project',
      description: 'Test workspace',
      createdAt: new Date('2024-10-20'),
      updatedAt: new Date('2024-10-21'),
    },
    {
      id: '5',
      name: 'New Project',
      description: 'Demo workspace',
      createdAt: new Date('2024-10-15'),
      updatedAt: new Date('2024-10-16'),
    },
  ]

  const sharedWorkspaces: Workspace[] = []
  const exampleWorkspaces: Workspace[] = []

  const getWorkspaces = () => {
    switch (activeTab) {
      case 'my':
        return myWorkspaces
      case 'shared':
        return sharedWorkspaces
      case 'examples':
        return exampleWorkspaces
      default:
        return []
    }
  }

  const workspaces = getWorkspaces()

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
          {/* Header */}
          <div className="border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-6 py-6">
              <div className="flex items-center justify-between">
                <h1 className="text-3xl font-semibold text-gray-900">Workspaces</h1>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create workspace
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-6 mt-6">
                <button
                  onClick={() => setActiveTab('my')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'my'
                      ? 'border-gray-900 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  My Workspaces
                </button>
                <button
                  onClick={() => setActiveTab('shared')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'shared'
                      ? 'border-gray-900 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  Shared with me
                </button>
                <button
                  onClick={() => setActiveTab('examples')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'examples'
                      ? 'border-gray-900 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  Examples
                </button>
              </div>
            </div>
          </div>

          {/* Workspace Grid */}
          <div className="max-w-7xl mx-auto px-6 py-8">
            {workspaces.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-4">
                  <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>
                <p className="text-gray-600 text-lg mb-2">
                  {activeTab === 'my' && 'No workspaces yet'}
                  {activeTab === 'shared' && 'No workspaces shared with you'}
                  {activeTab === 'examples' && 'No example workspaces available'}
                </p>
                <p className="text-gray-500 text-sm mb-6">
                  {activeTab === 'my' && 'Create your first workspace to get started'}
                  {activeTab === 'shared' && 'Workspaces shared by others will appear here'}
                  {activeTab === 'examples' && 'Example workspaces will be available soon'}
                </p>
                {activeTab === 'my' && (
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create workspace
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workspaces.map((workspace) => (
                  <WorkspaceCard key={workspace.id} workspace={workspace} />
                ))}
              </div>
            )}
          </div>

          {/* Create Workspace Modal */}
          <CreateWorkspaceModal
            isOpen={isCreateModalOpen}
            onCloseAction={() => setIsCreateModalOpen(false)}
          />
        </div>
      </div>
    </div>
  )
}
