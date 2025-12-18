'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Workspace } from '@/app/types'

interface VaultPanelProps {
  workspace: Workspace
}

interface VaultFile {
  id: string
  name: string
  extension?: string
  size: number
  uploadedAt: string
  filePath: string
  status: string
  fileType?: string
}

export default function VaultPanel({ workspace }: VaultPanelProps) {
  const router = useRouter()
  const [files, setFiles] = useState<VaultFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load files for this workspace
  useEffect(() => {
    loadWorkspaceFiles()
  }, [workspace.id])

  const transformFileData = (file: any) => {
    let displayName = file.file_name
    if (displayName.startsWith('tmp')) {
      const parts = displayName.split('_')
      if (parts.length > 2) {
        displayName = parts.slice(2).join('_')
      } else if (parts.length === 2) {
        displayName = parts[1]
      }
    }

    // Extract file extension
    const lastDotIndex = displayName.lastIndexOf('.')
    const extension = lastDotIndex > -1 ? displayName.substring(lastDotIndex + 1).toLowerCase() : ''
    const nameWithoutExtension = lastDotIndex > -1 ? displayName.substring(0, lastDotIndex) : displayName
    const fileType = getFileType(extension)

    return {
      id: file.id,
      name: nameWithoutExtension,
      extension: extension,
      size: file.size_bytes || 0,
      uploadedAt: file.uploaded_at,
      filePath: file.file_path,
      status: file.status,
      fileType
    }
  }

  const loadWorkspaceFiles = async () => {
    try {
      // Fetch workspace files from route.ts GET endpoint
      const response = await fetch(`/api/vault/upload?workspaceId=${workspace.id}`)
      
      if (!response.ok) {
        const errorData = await response.json()
        console.error('Failed to load files:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData.error,
          details: errorData.details
        })
        return
      }

      const result = await response.json()
      if (result.success && result.files) {
        const transformedFiles = result.files.map(transformFileData)
        setFiles(transformedFiles)
        console.log(`Loaded ${transformedFiles.length} files for workspace ${workspace.id}`)
      }
    } catch (error) {
      console.error('Error loading workspace files from /api/vault/upload:', error)
    }
  }

  const getFileType = (extension: string): string => {
    const typeMap: Record<string, string> = {
      pdf: 'PDF',
      doc: 'DOC',
      docx: 'DOCX',
      txt: 'TXT',
      md: 'MD',
      csv: 'CSV',
      xlsx: 'XLSX',
      xls: 'XLS',
      ppt: 'PPT',
      pptx: 'PPTX',
      jpg: 'JPG',
      jpeg: 'JPEG',
      png: 'PNG',
      gif: 'GIF',
      json: 'JSON',
      xml: 'XML',
      html: 'HTML',
      css: 'CSS',
      js: 'JS',
      ts: 'TS'
    }
    return typeMap[extension] || 'FILE'
  }

  const formatLineCount = (size: number): string => {
    // Rough estimate: ~50 bytes per line for text files
    const lines = Math.max(1, Math.round(size / 50))
    return `${lines} lines`
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadProgress('Uploading...')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('workspaceId', workspace.id)

      const response = await fetch('/api/vault/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      setUploadProgress('File processed successfully!')

      // Reload workspace files from Supabase to get the latest list
      await loadWorkspaceFiles()

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

  const handleViewAllFiles = () => {
    router.push(`/workspaces/${workspace.id}/vault`)
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm text-gray-900" style={{ fontFamily: 'var(--font-chirp)' }}>Files</h3>
        <button
          onClick={(e) => {
            e.stopPropagation()
            fileInputRef.current?.click()
          }}
          disabled={uploading}
          className="p-1 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
          aria-label="Add file"
        >
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Upload Progress */}
      {uploadProgress && (
        <div className="mb-3 p-2 rounded-lg bg-blue-50 border border-blue-200">
          <p className="text-xs text-blue-700">{uploadProgress}</p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileUpload}
        className="hidden"
        accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.ppt,.pptx,.json,.xml,.html"
      />

      {/* Content */}
      <div className="space-y-2">
        {files.length === 0 && !uploading ? (
          <div className="p-4">
            <p className="text-sm text-gray-400">No files uploaded yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {uploading && (
              <div className="text-sm text-gray-500 text-center py-2 rounded-lg bg-blue-50">
                Uploading...
              </div>
            )}
            {files.slice(0, 4).map((file) => (
              <div
                key={file.id}
                className="p-3 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="text-sm font-medium text-gray-900 truncate flex-1">
                    {file.name}{file.extension ? `.${file.extension}` : ''}
                  </h4>
                  {file.fileType && (
                    <span className="inline-block px-1.5 py-0.5 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded flex-shrink-0">
                      {file.fileType}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  {formatLineCount(file.size)}
                </p>
              </div>
            ))}

            {files.length > 4 && (
              <button
                onClick={handleViewAllFiles}
                className="w-full py-2 text-sm text-[#d4a574] hover:text-[#c99a6a] font-medium transition-colors"
              >
                View all {files.length} files →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
