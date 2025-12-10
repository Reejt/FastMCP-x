'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { User } from '@/app/types'
import Sidebar from '@/app/components/Sidebar/Sidebar'

export default function VaultPage() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

      // Load existing documents from Supabase
      await loadDocuments()

      setLoading(false)
    }

    checkUser()
  }, [router, supabase])

  const loadDocuments = async () => {
    try {
      const response = await fetch('/api/vault/upload')
      if (!response.ok) {
        throw new Error('Failed to load documents')
      }

      const result = await response.json()
      if (result.success && result.files) {
        // Transform Supabase files to match the UI format
        const transformedDocs = result.files.map((file: any) => {
          // Remove temporary file prefix (tmpXXXX_XXXX_) if present
          let displayName = file.file_name
          if (displayName.startsWith('tmp')) {
            // Remove everything up to and including the last underscore before the actual filename
            const parts = displayName.split('_')
            if (parts.length > 2) {
              displayName = parts.slice(2).join('_')
            } else if (parts.length === 2) {
              displayName = parts[1]
            }
          }
          return {
            id: file.id,
            name: displayName,
            size: file.size_bytes || 0,
            uploadedAt: file.uploaded_at,
            filePath: file.file_path,
            status: file.status
          }
        })
        setUploadedFiles(transformedDocs)
      }
    } catch (error) {
      console.error('Error loading documents:', error)
    }
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

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      setUploadProgress('File processed successfully!')

      // Reload documents from Supabase to get the latest list
      await loadDocuments()

      // Clear progress message after 3 seconds
      setTimeout(() => setUploadProgress(''), 3000)

    } catch (error) {
      console.error('Upload error:', error)
      setUploadProgress(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setTimeout(() => setUploadProgress(''), 5000)
    } finally {
      setUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    if (!confirm(`Are you sure you want to delete "${fileName}"? This action cannot be undone.`)) {
      return
    }

    setDeletingId(fileId)

    try {
      const response = await fetch('/api/vault/upload', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: fileId }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete file')
      }

      // Remove file from local state
      setUploadedFiles(prev => prev.filter(file => file.id !== fileId))

      // Show success message
      setUploadProgress('File deleted successfully!')
      setTimeout(() => setUploadProgress(''), 3000)
    } catch (error) {
      console.error('Delete error:', error)
      setUploadProgress(`Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setTimeout(() => setUploadProgress(''), 5000)
    } finally {
      setDeletingId(null)
    }
  }

  const triggerFileSelect = () => {
    fileInputRef.current?.click()
  }

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
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileUpload}
        accept=".txt,.md,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp"
        className="hidden"
        disabled={uploading}
      />

      {/* Sidebar */}
      <Sidebar user={user} onSignOutAction={handleSignOut} />

      {/* Main Vault Area */}
      <div className="flex-1 overflow-auto">
        <div className="min-h-screen bg-white">
          {/* Header */}
          <div className="border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-6 py-6">
              <div className="flex items-center justify-between">
                <h1 className="text-3xl font-semibold text-gray-900">Vault</h1>
                <button
                  onClick={triggerFileSelect}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  {uploading ? 'Uploading...' : 'Upload File'}
                </button>
              </div>
              {/* Upload Progress */}
              {uploadProgress && (
                <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <p className="text-sm text-blue-700">{uploadProgress}</p>
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="max-w-7xl mx-auto px-6 py-8">
            {uploadedFiles.length > 0 ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Uploaded Files ({uploadedFiles.length})</h2>
                  <div className="space-y-3">
                    {uploadedFiles.map((file) => (
                      <div key={file.id} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          {/* File Icon */}
                          <div className="flex-shrink-0">
                            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
                          </div>
                          
                          {/* File Info */}
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-medium text-gray-900 truncate">{file.name}</h3>
                            <div className="flex items-center gap-3 mt-1">
                              <p className="text-xs text-gray-500">
                                {file.size > 0 ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Unknown size'}
                              </p>
                              <span className="text-gray-300">•</span>
                              <p className="text-xs text-gray-500">
                                {new Date(file.uploadedAt).toLocaleDateString()} {new Date(file.uploadedAt).toLocaleTimeString()}
                              </p>
                              {file.status && (
                                <>
                                  <span className="text-gray-300">•</span>
                                  <span className="inline-block px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                                    {file.status}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3 ml-4">
                          <button
                            onClick={() => handleDeleteFile(file.id, file.name)}
                            disabled={deletingId === file.id}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete file"
                          >
                            {deletingId === file.id ? (
                              <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-4">
                  <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                </div>
                <p className="text-gray-600 text-lg mb-2">Your Vault is Empty</p>
                <p className="text-gray-500 text-sm mb-6">
                  Upload documents, images, and other files to access them in your conversations
                </p>
                <button
                  onClick={triggerFileSelect}
                  disabled={uploading}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  {uploading ? 'Uploading...' : 'Upload Your First File'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
