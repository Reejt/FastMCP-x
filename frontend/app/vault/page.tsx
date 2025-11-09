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
      setLoading(false)
    }

    checkUser()
  }, [router, supabase])

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
      setUploadedFiles(prev => [...prev, {
        name: file.name,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        ...result
      }])

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
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Uploaded Files</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {uploadedFiles.map((file, index) => (
                    <div key={index} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-sm font-medium text-gray-900 truncate">{file.name}</h3>
                          <p className="text-xs text-gray-500 mt-1">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            Uploaded {new Date(file.uploadedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="ml-2">
                          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  ))}
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
