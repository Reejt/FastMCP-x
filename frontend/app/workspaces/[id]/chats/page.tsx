'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { User, Workspace, ChatSession, Chat } from '@/app/types'
import Sidebar from '@/app/components/Sidebar/Sidebar'
import WorkspaceSidebar from '@/app/components/WorkspaceSidebar'
import Breadcrumb from '@/app/components/Breadcrumb'

interface ChatFile {
  name: string
  size: number
  uploadedAt: string
  documentId: string
  filePath: string
  fileType: string
}

export default function WorkspaceChatPage() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  const workspaceId = params.id as string

  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')
  const [uploadedFiles, setUploadedFiles] = useState<ChatFile[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [shouldCollapseMainSidebar, setShouldCollapseMainSidebar] = useState(false)
  const [isWorkspaceSidebarCollapsed, setIsWorkspaceSidebarCollapsed] = useState(false)
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
  const [workspaceChatSessions, setWorkspaceChatSessions] = useState<ChatSession[]>([])
  const [currentChatId, setCurrentChatId] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Load workspace sidebar collapse state from localStorage
    const saved = localStorage.getItem('workspace-sidebar-collapsed')
    if (saved !== null) {
      const collapsed = saved === 'true'
      setIsWorkspaceSidebarCollapsed(collapsed)
      setShouldCollapseMainSidebar(!collapsed)
    } else {
      // Default: workspace sidebar expanded, main sidebar collapsed
      setIsWorkspaceSidebarCollapsed(false)
      setShouldCollapseMainSidebar(true)
    }
  }, [])

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

      // Load workspace data - try API first, then localStorage
      try {
        const response = await fetch(`/api/workspaces?workspaceId=${workspaceId}`)
        const data = await response.json()

        if (data.success && data.workspace) {
          setCurrentWorkspace({
            ...data.workspace,
            created_at: data.workspace.created_at,
            updated_at: data.workspace.updated_at
          })
        } else {
          // Fallback to localStorage
          const storedWorkspaces = localStorage.getItem('myWorkspaces')
          if (storedWorkspaces) {
            const workspaces = JSON.parse(storedWorkspaces)
            const workspace = workspaces.find((w: any) => w.id === workspaceId)
            if (workspace) {
              setCurrentWorkspace({
                ...workspace,
                created_at: workspace.createdAt || workspace.created_at,
                updated_at: workspace.updatedAt || workspace.updated_at
              })
            }
          }
        }
      } catch (error) {
        console.error('Error loading workspace:', error)
      }

      // Load chat sessions from Supabase via API
      try {
        const response = await fetch(`/api/chats?workspaceId=${workspaceId}`)
        if (response.ok) {
          const result = await response.json()
          const chats = result.chats || []
          
          // Convert Chat records to ChatSession format
          const chatSession: ChatSession = {
            id: `${workspaceId}_main`,
            workspaceId,
            messages: chats.map((chat: Chat) => ({
              id: chat.id,
              content: chat.message,
              role: chat.role,
              timestamp: new Date(chat.created_at)
            })),
            createdAt: new Date(),
            updatedAt: new Date()
          }
          
          if (chatSession.messages.length > 0) {
            setWorkspaceChatSessions([chatSession])
            setCurrentChatId(chatSession.id)
          }
        }
      } catch (error) {
        console.error('Error loading chat sessions:', error)
      }
      await loadDocuments()
      setLoading(false)
    }

    checkUser()
  }, [router, supabase, workspaceId])

  const loadDocuments = async () => {
    try {
      const response = await fetch('/api/vault/upload')
      if (!response.ok) {
        throw new Error('Failed to load documents')
      }

      const result = await response.json()
      if (result.success && result.documents) {
        // Filter documents by workspace ID and transform
        const transformedDocs = result.documents
          .filter((doc: any) => doc.workspace_id === workspaceId)
          .map((doc: any) => ({
            name: doc.file_name,
            size: doc.file_size,
            uploadedAt: doc.upload_timestamp,
            documentId: doc.document_id,
            filePath: doc.file_path,
            fileType: doc.file_type
          }))
        setUploadedFiles(transformedDocs)
      }
    } catch (error) {
      console.error('Error loading documents:', error)
    }
  }

  const handleWorkspaceSidebarToggle = (isCollapsed: boolean) => {
    setIsWorkspaceSidebarCollapsed(isCollapsed)
    // Only collapse main sidebar when workspace sidebar is expanded (not collapsed)
    // When workspace sidebar is collapsed, don't force main sidebar (let it use its own state)
    setShouldCollapseMainSidebar(!isCollapsed)
  }

  const handleExpandWorkspaceSidebar = () => {
    setIsWorkspaceSidebarCollapsed(false)
    localStorage.setItem('workspace-sidebar-collapsed', 'false')
    setShouldCollapseMainSidebar(true)
  }

  const handleChatSelect = (chatId: string) => {
    // Navigate back to workspace chat with selected chat
    router.push(`/workspaces/${workspaceId}`)
  }

  const handleNewChat = () => {
    // Navigate back to workspace chat with new chat
    router.push(`/workspaces/${workspaceId}`)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadProgress('Uploading...')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/vault/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (result.success) {
        setUploadProgress('Upload successful!')
        await loadDocuments()
      } else {
        setUploadProgress(`Upload failed: ${result.error}`)
      }
    } catch (error) {
      console.error('Upload error:', error)
      setUploadProgress('Upload failed. Please try again.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      setTimeout(() => setUploadProgress(''), 3000)
    }
  }

  const handleDeleteFile = async (documentId: string, fileName: string) => {
    if (!confirm(`Are you sure you want to delete "${fileName}"? This action cannot be undone.`)) {
      return
    }

    setDeletingId(documentId)

    try {
      const response = await fetch('/api/vault/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })

      if (!response.ok) {
        throw new Error('Failed to delete document')
      }

      setUploadedFiles(prev => prev.filter(file => file.documentId !== documentId))
    } catch (error) {
      console.error('Delete error:', error)
      alert('Failed to delete file. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  const triggerFileSelect = () => {
    fileInputRef.current?.click()
  }

  const getFileFormat = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toUpperCase()
    return ext || 'FILE'
  }

  const filteredFiles = uploadedFiles.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileUpload}
        accept=".txt,.md,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.jpg,.jpeg,.png,.gif,.webp"
        className="hidden"
        disabled={uploading}
      />

      <Sidebar
        user={user}
        onSignOutAction={handleSignOut}
        forceCollapse={shouldCollapseMainSidebar}
      />

      {/* Workspace Sidebar */}
      {currentWorkspace && (
        <WorkspaceSidebar
          workspace={currentWorkspace}
          chatSessions={workspaceChatSessions}
          currentChatId={currentChatId}
          onChatSelect={handleChatSelect}
          onNewChat={handleNewChat}
          onToggleSidebar={handleWorkspaceSidebarToggle}
        />
      )}

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Breadcrumb Navigation with Expand Button */}
        <div className="flex items-center gap-3 px-8 py-4 bg-gray-50">
          {isWorkspaceSidebarCollapsed && (
            <button
              onClick={handleExpandWorkspaceSidebar}
              className="p-2 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
              aria-label="Expand sidebar"
            >
              <svg className="w-5 h-5 text-gray-600" viewBox="0 0 16 16" fill="currentColor">
                <path d="M14 2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h12zM2 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2H2z" />
                <path d="M3 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4z" />
              </svg>
            </button>
          )}
          <nav className="flex items-center gap-2 text-sm text-gray-600">
            <button
              onClick={() => router.push('/workspaces')}
              className="hover:text-gray-900 transition-colors"
            >
              Workspaces
            </button>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <button
              onClick={() => router.push(`/workspaces/${workspaceId}`)}
              className="hover:text-gray-900 transition-colors"
            >
              {currentWorkspace?.name || 'Workspace'}
            </button>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-gray-900 font-medium">Chats</span>
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-8 pb-8">
          <div className="mb-8 flex items-center justify-between pt-8">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Chats</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 w-64 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={triggerFileSelect}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload files
              </button>
            </div>
          </div>

          {uploadProgress && (
            <div className="mb-6 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
              {uploadProgress}
            </div>
          )}
          {filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 mb-4 text-gray-400">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No files uploaded</h3>
              <p className="text-gray-500 mb-4">Upload your first file to get started</p>
              <button
                onClick={triggerFileSelect}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Upload files
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      File Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Format
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredFiles.map((file) => (
                    <tr key={file.documentId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          <span className="text-sm text-gray-900 font-medium">{file.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700 uppercase">
                          {getFileFormat(file.name)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-500">
                          Uploaded on {new Date(file.uploadedAt).toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDeleteFile(file.documentId, file.name)}
                          disabled={deletingId === file.documentId}
                          className="text-sm text-gray-600 hover:text-red-600 disabled:opacity-50 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
