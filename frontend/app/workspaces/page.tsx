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
  const [myWorkspaces, setMyWorkspaces] = useState<Workspace[]>([])
  const [sharedWorkspaces, setSharedWorkspaces] = useState<Workspace[]>([])
  const [exampleWorkspaces, setExampleWorkspaces] = useState<Workspace[]>([])

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

  // Load workspaces from localStorage on mount
  useEffect(() => {
    const storedWorkspaces = localStorage.getItem('myWorkspaces')
    if (storedWorkspaces) {
      try {
        const workspaces = JSON.parse(storedWorkspaces)
        setMyWorkspaces(workspaces.map((w: any) => ({
          ...w,
          createdAt: new Date(w.createdAt),
          updatedAt: new Date(w.updatedAt)
        })))
      } catch (error) {
        console.error('Error loading workspaces:', error)
      }
    }
  }, [])

  // Save workspaces to localStorage whenever they change
  useEffect(() => {
    if (myWorkspaces.length > 0) {
      localStorage.setItem('myWorkspaces', JSON.stringify(myWorkspaces))
    }
  }, [myWorkspaces])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const handleCreateWorkspace = (name: string, instructions: string) => {
    const newWorkspace: Workspace = {
      id: Date.now().toString(),
      name: name,
      description: instructions,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    setMyWorkspaces([...myWorkspaces, newWorkspace])
  }

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
          {/* Header - Centered Container */}
          <div className="max-w-5xl mx-auto px-12 py-8">
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-2xl font-semibold text-gray-900">Workspaces</h1>
              <button
                onClick={() => setIsCreateModalOpen(true)}
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
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-400 text-sm text-gray-500"
                />
              </div>
            </div>
          </div>

          {/* Workspace Grid - Centered Container */}
          <div className="max-w-5xl mx-auto px-12 pb-8">
            {workspaces.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-4">
                  <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>
                <p className="text-gray-600 text-lg mb-2">No workspaces yet</p>
                <p className="text-gray-500 text-sm mb-6">Create your first workspace to get started</p>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Workspace
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            onCreateAction={handleCreateWorkspace}
          />
        </div>
      </div>
    </div>
  )
}
