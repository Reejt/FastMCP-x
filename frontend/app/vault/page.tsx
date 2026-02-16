'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { User } from '@/app/types'
import Sidebar from '@/app/components/Sidebar/Sidebar'

type VaultFile = {
  id: string
  name: string
  extension?: string
  size: number
  uploadedAt: string
  filePath: string
  status: string
}

type SortField = 'name' | 'uploadedAt' | 'size' | 'format'
type SortDirection = 'asc' | 'desc'
type ViewMode = 'list' | 'grid'

const FORMAT_MAP: Record<string, string> = {
  pdf: 'PDF Document',
  doc: 'Word Document',
  docx: 'Word Document',
  txt: 'Text File',
  md: 'Markdown File',
  csv: 'CSV Spreadsheet',
  xls: 'Excel Spreadsheet',
  xlsx: 'Excel Spreadsheet',
  ppt: 'PowerPoint',
  pptx: 'PowerPoint',
  jpg: 'JPEG Image',
  jpeg: 'JPEG Image',
  png: 'PNG Image',
  gif: 'GIF Image',
  webp: 'WebP Image',
  svg: 'SVG Image',
  py: 'Python File',
  ts: 'TypeScript File',
  tsx: 'TypeScript File',
  js: 'JavaScript File',
  jsx: 'JavaScript File',
  json: 'JSON File',
  html: 'HTML File',
  css: 'CSS File',
}

function getFileFormat(extension?: string): string {
  if (!extension) return 'File'
  return FORMAT_MAP[extension.toLowerCase()] || `${extension.toUpperCase()} File`
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: undefined }) +
    ', ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export default function VaultPage() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')
  const [uploadedFiles, setUploadedFiles] = useState<VaultFile[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('uploadedAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [showUploadMenu, setShowUploadMenu] = useState(false)
  const [defaultWorkspaceId, setDefaultWorkspaceId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const uploadMenuRef = useRef<HTMLDivElement>(null)

  const theme = {
    appBg: 'var(--bg-app)',
    surfaceBg: 'var(--bg-elevated)',
    cardBg: 'var(--bg-elevated)',
    hoverBg: 'var(--bg-hover)',
    border: 'var(--border-subtle)',
    borderStrong: 'var(--border-strong)',
    text: 'var(--text-primary)',
    textSecondary: 'var(--text-secondary)',
    textMuted: 'var(--text-muted)',
    accent: 'var(--accent-primary)',
    accentDanger: 'var(--accent-danger)',
    textInverse: 'var(--text-inverse)',
  }

  // Sort & filter logic
  const filteredAndSortedFiles = useMemo(() => {
    let result = [...uploadedFiles]

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(f => {
        const fullName = f.extension ? `${f.name}.${f.extension}` : f.name
        const format = getFileFormat(f.extension)
        return fullName.toLowerCase().includes(q) || format.toLowerCase().includes(q)
      })
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'uploadedAt':
          cmp = new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()
          break
        case 'size':
          cmp = a.size - b.size
          break
        case 'format':
          cmp = getFileFormat(a.extension).localeCompare(getFileFormat(b.extension))
          break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })

    return result
  }, [uploadedFiles, searchQuery, sortField, sortDirection])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

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

      // Fetch the user's default workspace
      const { data: workspaces } = await supabase
        .from('workspaces')
        .select('id')
        .eq('user_id', authUser.id)
        .limit(1)

      if (workspaces && workspaces.length > 0) {
        setDefaultWorkspaceId(workspaces[0].id)
      }

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
        const transformedDocs = result.files.map((file: { id: string; file_name: string; size_bytes: number; uploaded_at: string; file_path: string; status: string }) => {
          const displayName = file.file_name

          const lastDotIndex = displayName.lastIndexOf('.')
          const extension = lastDotIndex > -1 ? displayName.substring(lastDotIndex + 1).toLowerCase() : ''
          const nameWithoutExtension = lastDotIndex > -1 ? displayName.substring(0, lastDotIndex) : displayName

          return {
            id: file.id,
            name: nameWithoutExtension,
            extension: extension,
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
      if (defaultWorkspaceId) {
        formData.append('workspaceId', defaultWorkspaceId)
      }

      const response = await fetch('/api/vault/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      setUploadProgress('File processed successfully!')

      // Optimistically add the file to the list immediately
      if (result.file) {
        const displayName = result.file.file_name
        const lastDotIndex = displayName.lastIndexOf('.')
        const extension = lastDotIndex > -1 ? displayName.substring(lastDotIndex + 1).toLowerCase() : ''
        const nameWithoutExtension = lastDotIndex > -1 ? displayName.substring(0, lastDotIndex) : displayName

        const newFile: VaultFile = {
          id: result.file.id,
          name: nameWithoutExtension,
          extension: extension,
          size: result.file.size_bytes || 0,
          uploadedAt: result.file.uploaded_at || new Date().toISOString(),
          filePath: result.file.file_path,
          status: result.file.status
        }
        setUploadedFiles(prev => [newFile, ...prev])
      } else {
        // Fallback: reload all documents if the API doesn't return the file
        await loadDocuments()
      }

      setTimeout(() => setUploadProgress(''), 3000)
    } catch (error) {
      console.error('Upload error:', error)
      setUploadProgress(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setTimeout(() => setUploadProgress(''), 5000)
    } finally {
      setUploading(false)
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fileId }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete file')
      }

      setUploadedFiles(prev => prev.filter(file => file.id !== fileId))
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

  // Close upload menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (uploadMenuRef.current && !uploadMenuRef.current.contains(e.target as Node)) {
        setShowUploadMenu(false)
      }
    }
    if (showUploadMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUploadMenu])

  const triggerFileSelect = () => {
    setShowUploadMenu(false)
    fileInputRef.current?.click()
  }

  const triggerFolderSelect = () => {
    setShowUploadMenu(false)
    folderInputRef.current?.click()
  }

  const handleFolderUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    setUploadProgress(`Uploading ${files.length} file(s) from folder...`)

    let successCount = 0
    let failCount = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setUploadProgress(`Uploading ${i + 1} of ${files.length}: ${file.name}`)

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

        // Optimistically add the file to the list immediately
        if (result.file) {
          const displayName = result.file.file_name
          const lastDotIndex = displayName.lastIndexOf('.')
          const extension = lastDotIndex > -1 ? displayName.substring(lastDotIndex + 1).toLowerCase() : ''
          const nameWithoutExtension = lastDotIndex > -1 ? displayName.substring(0, lastDotIndex) : displayName

          const newFile: VaultFile = {
            id: result.file.id,
            name: nameWithoutExtension,
            extension: extension,
            size: result.file.size_bytes || 0,
            uploadedAt: result.file.uploaded_at || new Date().toISOString(),
            filePath: result.file.file_path,
            status: result.file.status
          }
          setUploadedFiles(prev => [newFile, ...prev])
        }

        successCount++
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error)
        failCount++
      }
    }

    const msg = failCount > 0
      ? `Uploaded ${successCount} file(s), ${failCount} failed.`
      : `Successfully uploaded ${successCount} file(s)!`
    setUploadProgress(msg)
    setTimeout(() => setUploadProgress(''), 4000)

    setUploading(false)
    if (folderInputRef.current) {
      folderInputRef.current.value = ''
    }
  }

  // Sort arrow indicator
  const SortArrow = ({ field }: { field: SortField }) => (
    <span style={{ marginLeft: 4, opacity: sortField === field ? 1 : 0.3, fontSize: 10 }}>
      {sortField === field && sortDirection === 'desc' ? '▼' : '▲'}
    </span>
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
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: theme.appBg }}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileUpload}
        accept=".txt,.md,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp"
        className="hidden"
        disabled={uploading}
      />
      {/* Hidden folder input */}
      <input
        ref={folderInputRef}
        type="file"
        onChange={handleFolderUpload}
        className="hidden"
        disabled={uploading}
        {...({ webkitdirectory: '', directory: '', multiple: true } as React.InputHTMLAttributes<HTMLInputElement>)}
      />

      {/* Sidebar */}
      <Sidebar user={user} onSignOutAction={handleSignOut} />

      {/* Main Vault Area */}
      <div className="flex-1 overflow-auto">
        <div className="min-h-screen" style={{ backgroundColor: theme.appBg }}>
          {/* Header */}
          <div className="max-w-7xl mx-auto px-8 pt-8 pb-2">
            <h1 className="text-3xl font-bold" style={{ color: theme.text }}>Vault</h1>
            <p className="text-sm mt-1" style={{ color: theme.textMuted }}>Manage and organize your files and documents</p>
          </div>

          {/* Toolbar: Search + Actions */}
          <div className="max-w-7xl mx-auto px-8 py-4">
            <div className="flex items-center gap-3">
              {/* Search */}
              <div
                className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg border"
                style={{ backgroundColor: theme.surfaceBg, borderColor: theme.border }}
              >
                <svg className="w-4 h-4 flex-shrink-0" style={{ color: theme.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by name or file type"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: theme.text }}
                />
              </div>

              {/* Upload Button with Dropdown */}
              <div className="relative" ref={uploadMenuRef}>
                <button
                  onClick={() => { if (!uploading) setShowUploadMenu(prev => !prev) }}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    color: theme.textSecondary,
                    backgroundColor: theme.cardBg,
                    borderColor: theme.border,
                    cursor: uploading ? 'default' : 'pointer',
                  }}
                  onMouseEnter={e => { if (!uploading) e.currentTarget.style.backgroundColor = theme.hoverBg }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = theme.cardBg }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  {uploading ? 'Uploading...' : 'Upload'}
                  <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {showUploadMenu && (
                  <div
                    className="absolute right-0 mt-1 w-48 rounded-lg border shadow-lg z-50 py-1"
                    style={{
                      backgroundColor: theme.cardBg,
                      borderColor: theme.border,
                    }}
                  >
                    <button
                      onClick={triggerFileSelect}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left"
                      style={{ color: theme.text, cursor: 'pointer' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = theme.hoverBg }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      <svg className="w-4 h-4 flex-shrink-0" style={{ color: theme.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      File Upload
                    </button>
                    <button
                      onClick={triggerFolderSelect}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left"
                      style={{ color: theme.text, cursor: 'pointer' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = theme.hoverBg }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      <svg className="w-4 h-4 flex-shrink-0" style={{ color: theme.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      Folder Upload
                    </button>
                  </div>
                )}
              </div>

              {/* Filter Button */}
              <button
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg"
                style={{
                  color: theme.textSecondary,
                  backgroundColor: theme.cardBg,
                  borderColor: theme.border,
                  cursor: 'pointer',
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = theme.hoverBg }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = theme.cardBg }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filter
              </button>

              {/* View Toggle */}
              <div
                className="flex items-center border rounded-lg overflow-hidden"
                style={{ borderColor: theme.border }}
              >
                {/* List View */}
                <button
                  onClick={() => setViewMode('list')}
                  className="p-2"
                  style={{
                    backgroundColor: viewMode === 'list' ? theme.hoverBg : theme.cardBg,
                    color: viewMode === 'list' ? theme.text : theme.textMuted,
                    cursor: 'pointer',
                  }}
                  title="List view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                {/* Grid View */}
                <button
                  onClick={() => setViewMode('grid')}
                  className="p-2"
                  style={{
                    backgroundColor: viewMode === 'grid' ? theme.hoverBg : theme.cardBg,
                    color: viewMode === 'grid' ? theme.text : theme.textMuted,
                    borderLeft: `1px solid ${theme.border}`,
                    cursor: 'pointer',
                  }}
                  title="Grid view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Upload Progress */}
            {uploadProgress && (
              <div className="mt-3 p-3 rounded-lg border" style={{ backgroundColor: theme.surfaceBg, borderColor: theme.border }}>
                <p className="text-sm" style={{ color: theme.textSecondary }}>{uploadProgress}</p>
              </div>
            )}
          </div>

          {/* "View all files" label */}
          <div className="max-w-7xl mx-auto px-8 pb-2">
            <p className="text-xs font-medium" style={{ color: theme.textMuted }}>
              View all files
            </p>
          </div>

          {/* Content */}
          <div className="max-w-7xl mx-auto px-8 pb-8">
            {uploadedFiles.length === 0 ? (
              /* Empty state */
              <div className="text-center py-16">
                <div className="mb-4" style={{ color: theme.textMuted }}>
                  <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                </div>
                <p className="text-lg mb-2" style={{ color: theme.text }}>Your Vault is Empty</p>
                <p className="text-sm mb-6" style={{ color: theme.textSecondary }}>
                  Upload documents, images, and other files to access them in your conversations
                </p>
                <button
                  onClick={triggerFileSelect}
                  disabled={uploading}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: theme.accent, color: theme.textInverse }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  {uploading ? 'Uploading...' : 'Upload Your First File'}
                </button>
              </div>
            ) : viewMode === 'list' ? (
              /* ========== LIST / TABLE VIEW ========== */
              <div className="w-full">
                {/* Table Header */}
                <div
                  className="grid items-center text-xs font-medium select-none border-b"
                  style={{
                    gridTemplateColumns: '2fr 1fr 1.2fr 0.8fr 1.2fr 48px',
                    color: theme.textMuted,
                    borderColor: theme.border,
                    padding: '8px 0',
                  }}
                >
                  <button className="flex items-center gap-1 text-left" onClick={() => handleSort('name')} style={{ color: theme.textMuted }}>
                    Name <SortArrow field="name" />
                  </button>
                  <span>Owner</span>
                  <button className="flex items-center gap-1 text-left" onClick={() => handleSort('uploadedAt')} style={{ color: theme.textMuted }}>
                    Modified <SortArrow field="uploadedAt" />
                  </button>
                  <button className="flex items-center gap-1 text-left" onClick={() => handleSort('size')} style={{ color: theme.textMuted }}>
                    Size <SortArrow field="size" />
                  </button>
                  <button className="flex items-center gap-1 text-left" onClick={() => handleSort('format')} style={{ color: theme.textMuted }}>
                    Format <SortArrow field="format" />
                  </button>
                  <span></span>
                </div>

                {/* Table Rows */}
                {filteredAndSortedFiles.length === 0 ? (
                  <div className="py-8 text-center text-sm" style={{ color: theme.textMuted }}>
                    No files match your search.
                  </div>
                ) : (
                  filteredAndSortedFiles.map(file => (
                    <div
                      key={file.id}
                      className="grid items-center text-sm border-b"
                      style={{
                        gridTemplateColumns: '2fr 1fr 1.2fr 0.8fr 1.2fr 48px',
                        borderColor: theme.border,
                        padding: '10px 0',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = theme.hoverBg }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      {/* Name */}
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <div className="flex-shrink-0 w-5 h-5" style={{ color: theme.textMuted }}>
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <span className="truncate" style={{ color: theme.text }}>
                          {file.name}{file.extension ? `.${file.extension}` : ''}
                        </span>
                      </div>

                      {/* Owner */}
                      <div className="flex items-center gap-2">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                          style={{ backgroundColor: theme.accent, color: theme.textInverse }}
                        >
                          M
                        </div>
                        <span style={{ color: theme.textSecondary }}>Me</span>
                      </div>

                      {/* Modified */}
                      <span style={{ color: theme.textSecondary }}>{formatDate(file.uploadedAt)}</span>

                      {/* Size */}
                      <span style={{ color: theme.textSecondary }}>{formatFileSize(file.size)}</span>

                      {/* Format */}
                      <span style={{ color: theme.textSecondary }}>{getFileFormat(file.extension)}</span>

                      {/* Delete action */}
                      <div className="flex justify-center">
                        <button
                          onClick={() => handleDeleteFile(file.id, file.name)}
                          disabled={deletingId === file.id}
                          className="p-1 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ color: theme.accentDanger }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = theme.hoverBg }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                          title="Delete file"
                        >
                          {deletingId === file.id ? (
                            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* ========== GRID VIEW ========== */
              <div>
                {filteredAndSortedFiles.length === 0 ? (
                  <div className="py-8 text-center text-sm" style={{ color: theme.textMuted }}>
                    No files match your search.
                  </div>
                ) : (
                  <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                    {filteredAndSortedFiles.map(file => (
                      <div
                        key={file.id}
                        className="group relative rounded-xl border p-4 flex flex-col items-center text-center"
                        style={{
                          backgroundColor: theme.cardBg,
                          borderColor: theme.border,
                          cursor: 'pointer',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = theme.borderStrong }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = theme.border }}
                      >
                        {/* Delete button (top-right) */}
                        <button
                          onClick={() => handleDeleteFile(file.id, file.name)}
                          disabled={deletingId === file.id}
                          className="absolute top-2 right-2 p-1 rounded-md opacity-0 group-hover:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ color: theme.accentDanger }}
                          title="Delete file"
                        >
                          {deletingId === file.id ? (
                            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>

                        {/* Large file icon */}
                        <div
                          className="w-16 h-16 rounded-xl flex items-center justify-center mb-3"
                          style={{ backgroundColor: theme.hoverBg }}
                        >
                          <svg className="w-8 h-8" style={{ color: theme.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>

                        {/* File name */}
                        <p className="text-sm font-medium truncate w-full mb-1" style={{ color: theme.text }}>
                          {file.name}{file.extension ? `.${file.extension}` : ''}
                        </p>

                        {/* Format + Size */}
                        <p className="text-xs" style={{ color: theme.textMuted }}>
                          {getFileFormat(file.extension)}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: theme.textMuted }}>
                          {formatFileSize(file.size)} · {formatDate(file.uploadedAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
