'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { User } from '@/app/types'
import Sidebar from '@/app/components/Sidebar/Sidebar'
import { useWorkspacesStore } from '@/app/contexts/WorkspacesContext'

export default function CreateWorkspacePage() {
  const router = useRouter()
  const supabase = createClient()
  const addWorkspace = useWorkspacesStore((state) => state.addWorkspace)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // 1. Create workspace with name and description
      const workspaceResponse = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || 'New Workspace',
          description: description.trim()
        })
      })

      const workspaceData = await workspaceResponse.json()

      if (!workspaceData.success || !workspaceData.workspace) {
        console.error('Failed to create workspace:', workspaceData.error)
        alert('Failed to create workspace: ' + (workspaceData.error || 'Unknown error'))
        setIsSubmitting(false)
        return
      }

      // Add the new workspace to context - this will update all components
      addWorkspace(workspaceData.workspace)

      // 2. Create instruction if provided
      if (instructions.trim()) {
        const instructionResponse = await fetch('/api/instructions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: workspaceData.workspace.id,
            title: 'Default Instructions',
            instructions: instructions.trim(),
            isActive: true
          })
        })

        const instructionData = await instructionResponse.json()

        if (!instructionData.success) {
          console.warn('Failed to create instructions:', instructionData.error)
          // Don't fail - workspace was created successfully
        }
      }

      // 3. Navigate to the workspace chat page
      router.push(`/workspaces/${workspaceData.workspace.id}`)
    } catch (error) {
      console.error('Error creating workspace:', error)
      alert('Failed to create workspace: ' + (error instanceof Error ? error.message : 'Unknown error'))
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    router.push('/workspaces')
  }

  if (loading) {
    return (
      <div className="flex h-screen" style={{ backgroundColor: 'var(--bg-app)' }}>
        <div className="flex-1 flex items-center justify-center">
          <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen" style={{ backgroundColor: 'var(--bg-app)' }}>
      {user && (
        <Sidebar
          user={user}
          onSignOutAction={handleSignOut}
        />
      )}

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          {/* Page Title */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'Chirp, sans-serif', color: 'var(--text-primary)' }}>
              Create a new workspace
            </h1>
          </div>


          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Workspace Name */}
            <div>
              <label className="block text-base font-medium mb-2" style={{ fontFamily: 'Chirp, sans-serif', color: 'var(--text-primary)' }}>
                What are you working on?
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name your workspace"
                className="w-full px-4 py-3 text-base border rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-elevated)', fontFamily: 'Chirp, sans-serif' }}
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-base font-medium mb-2" style={{ fontFamily: 'Chirp, sans-serif', color: 'var(--text-primary)' }}>
                What are you trying to achieve?
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your workspace, goals, subject, etc..."
                rows={2}
                className="w-full px-4 py-3 text-base border rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent resize-none"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-elevated)', fontFamily: 'Chirp, sans-serif' }}
              />
            </div>

            {/* Workspace Instructions */}
            <div>
              <label className="block text-base font-medium mb-2" style={{ fontFamily: 'Chirp, sans-serif', color: 'var(--text-primary)' }}>
                Workspace Instructions
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Add instructions about the tone, style, and persona you want your workspace to adopt. E.g., 'Use a professional tone', 'Focus on technical accuracy', 'Be creative and conversational'..."
                rows={3}
                className="w-full px-4 py-3 text-base border rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent resize-none"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-elevated)', fontFamily: 'Chirp, sans-serif' }}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSubmitting}
                className="px-7 py-2.5 text-base font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ fontFamily: 'Chirp, sans-serif', color: 'var(--text-primary)', backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}
                onMouseEnter={(e) => !isSubmitting && (e.currentTarget.style.backgroundColor = 'var(--bg-surface)')}
                onMouseLeave={(e) => !isSubmitting && (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-7 py-2.5 text-base font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ fontFamily: 'Chirp, sans-serif', backgroundColor: 'var(--accent-primary)', color: 'var(--text-inverse)' }}
                onMouseEnter={(e) => !isSubmitting && (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={(e) => !isSubmitting && (e.currentTarget.style.opacity = '1')}
              >
                {isSubmitting ? 'Creating...' : 'Create workspace'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
