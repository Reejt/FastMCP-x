'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import type { File } from '@/app/types'

interface ChatInputProps {
  onSendMessage: (message: string, selectedFileIds?: string[]) => void
  onCancel?: () => void
  disabled?: boolean
  isStreaming?: boolean
  hasMessages?: boolean
  workspaceName?: string
  workspaceId?: string
}

export default function ChatInput({ onSendMessage, disabled = false, workspaceName, workspaceId, onCancel, isStreaming = false }: ChatInputProps) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [cancelDisabled, setCancelDisabled] = useState(false)

  const referenceFileInputRef = useRef<HTMLInputElement>(null)
  const [referenceUploading, setReferenceUploading] = useState(false)

  const [isReferenceModalOpen, setIsReferenceModalOpen] = useState(false)
  const [workspaceFiles, setWorkspaceFiles] = useState<File[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesError, setFilesError] = useState<string | null>(null)

  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([])
  const [draftSelectedFileIds, setDraftSelectedFileIds] = useState<string[]>([])

  const placeholder = workspaceName
    ? `Ask anything about this workspace`
    : 'Ask anything'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim() && !disabled && !isStreaming) {
      onSendMessage(input.trim(), selectedFileIds.length > 0 ? selectedFileIds : undefined)
      setInput('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  const handleCancel = (e: React.FormEvent) => {
    e.preventDefault()
    if (isStreaming && !cancelDisabled) {
      setCancelDisabled(true)
      onCancel?.()
      // Re-enable cancel button after a short delay to prevent accidental double-clicks
      setTimeout(() => setCancelDisabled(false), 500)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const openReferenceModal = () => {
    setDraftSelectedFileIds(selectedFileIds)
    setIsReferenceModalOpen(true)
  }

  const closeReferenceModal = () => {
    setIsReferenceModalOpen(false)
  }

  const cancelReferenceSelection = () => {
    setDraftSelectedFileIds(selectedFileIds)
    closeReferenceModal()
  }

  const saveReferenceSelection = () => {
    setSelectedFileIds(draftSelectedFileIds)
    closeReferenceModal()
  }

  const toggleDraftSelection = (fileId: string) => {
    setDraftSelectedFileIds((prev) => {
      if (prev.includes(fileId)) return prev.filter((id) => id !== fileId)
      return [...prev, fileId]
    })
  }

  const formatFileTypeLabel = (file: File): string => {
    const name = file.file_name || ''
    const ext = name.includes('.') ? name.split('.').pop()?.toUpperCase() : undefined
    if (ext) return ext

    const t = (file.file_type || '').toLowerCase()
    if (t.includes('pdf')) return 'PDF'
    if (t.includes('csv')) return 'CSV'
    if (t.includes('spreadsheet') || t.includes('excel') || t.includes('xlsx') || t.includes('xls')) return 'XLSX'
    if (t.includes('presentation') || t.includes('ppt')) return 'PPTX'
    if (t.includes('word') || t.includes('doc')) return 'DOCX'
    if (t.includes('markdown')) return 'MD'
    if (t.includes('text')) return 'TXT'
    return 'FILE'
  }

  const handleContainerClick = () => {
    // Focus the textarea when clicking anywhere in the container
    textareaRef.current?.focus()
  }

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [input])

  useEffect(() => {
    if (!isReferenceModalOpen) return
    if (!workspaceId) {
      setWorkspaceFiles([])
      setFilesError(null)
      setFilesLoading(false)
      return
    }

    let isCancelled = false

    const loadFiles = async () => {
      setFilesLoading(true)
      setFilesError(null)
      try {
        const response = await fetch(`/api/vault/upload?workspaceId=${workspaceId}`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data?.error || 'Failed to fetch files')
        }

        if (!isCancelled) {
          setWorkspaceFiles(Array.isArray(data?.files) ? data.files : [])
        }
      } catch (err) {
        if (!isCancelled) {
          setWorkspaceFiles([])
          setFilesError(err instanceof Error ? err.message : 'Failed to fetch files')
        }
      } finally {
        if (!isCancelled) {
          setFilesLoading(false)
        }
      }
    }

    loadFiles()

    return () => {
      isCancelled = true
    }
  }, [isReferenceModalOpen, workspaceId])

  const refreshWorkspaceFiles = async () => {
    if (!workspaceId) return
    setFilesLoading(true)
    setFilesError(null)
    try {
      const response = await fetch(`/api/vault/upload?workspaceId=${workspaceId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to fetch files')
      }

      setWorkspaceFiles(Array.isArray(data?.files) ? data.files : [])
    } catch (err) {
      setWorkspaceFiles([])
      setFilesError(err instanceof Error ? err.message : 'Failed to fetch files')
    } finally {
      setFilesLoading(false)
    }
  }

  const handleReferenceFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setReferenceUploading(true)
    setFilesError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (workspaceId) {
        formData.append('workspaceId', workspaceId)
      }

      const response = await fetch('/api/vault/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result?.error || 'Upload failed')
      }

      await refreshWorkspaceFiles()
    } catch (err) {
      setFilesError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setReferenceUploading(false)
      if (referenceFileInputRef.current) {
        referenceFileInputRef.current.value = ''
      }
    }
  }

  const referenceModal = isReferenceModalOpen ? (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={cancelReferenceSelection}>
      <div
        className="rounded-xl p-6 w-full max-w-2xl shadow-xl border border-gray-200"
        style={{ backgroundColor: '#fcfcfc' }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={referenceFileInputRef}
          type="file"
          onChange={handleReferenceFileUpload}
          className="hidden"
          disabled={referenceUploading}
          accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.json,.yaml,.yml,.sql,.sh,.ts,.tsx,.js,.jsx,.py"
        />

        <div className="flex items-start justify-between gap-4 mb-4">
          <h3 className="text-base font-semibold" style={{ color: '#060606' }}>
            Choose files you want to use as reference to answer your query
          </h3>
          <button
            type="button"
            onClick={() => {
              referenceFileInputRef.current?.click()
            }}
            disabled={!workspaceId || referenceUploading}
            className="px-3 py-2 rounded-lg text-sm bg-gray-900 text-white hover:bg-gray-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden">
          {filesLoading ? (
            <div className="p-4 text-sm text-gray-500">Loading files...</div>
          ) : filesError ? (
            <div className="p-4 text-sm text-gray-500">{filesError}</div>
          ) : !workspaceId ? (
            <div className="p-4 text-sm text-gray-500">Select a workspace to use reference files.</div>
          ) : workspaceFiles.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No files uploaded in this workspace.</div>
          ) : (
            <div className="divide-y divide-gray-200 max-h-[360px] overflow-y-auto">
              {workspaceFiles.map((file) => {
                const checked = draftSelectedFileIds.includes(file.id)
                return (
                  <label key={file.id} className="flex items-center gap-4 p-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDraftSelection(file.id)}
                      className="h-4 w-4"
                    />

                    <div className="h-12 w-12 rounded-xl bg-red-500 flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>

                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: '#060606' }}>
                        {file.file_name}
                      </div>
                      <div className="text-xs text-gray-500">{formatFileTypeLabel(file)}</div>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button onClick={cancelReferenceSelection} className="px-4 py-2 rounded-lg text-sm text-gray-600 cursor-pointer">
            Cancel
          </button>
          <button
            onClick={saveReferenceSelection}
            className="px-4 py-2 rounded-lg text-sm bg-gray-900 text-white hover:bg-gray-700 transition-colors cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  ) : null

  return (
    <>
      <div className="p-6" style={{ backgroundColor: '#fcfcfc' }}>
        <motion.form
          onSubmit={handleSubmit}
          className="max-w-4xl mx-auto"
          initial={false}
          animate={{
            scale: 1,
          }}
          transition={{ duration: 0.3 }}
        >
          <div
            onClick={handleContainerClick}
            className="relative flex items-center rounded-full border border-gray-300 hover:border-gray-400 transition-all cursor-text px-5 py-3"
            style={{ backgroundColor: '#fcfcfc' }}
          >
          {/* Attachment Icon - Left */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              openReferenceModal()
            }}
            className="hover:text-gray-800 transition-colors mr-4 flex-shrink-0 cursor-pointer"
            style={{ color: '#060606' }}
            disabled={disabled}
            aria-label="Attach file"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>

          {selectedFileIds.length > 0 && (
            <span className="text-xs mr-4 text-gray-500 select-none">
              {selectedFileIds.length} files selected
            </span>
          )}

          {/* Text Input */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isStreaming}
            rows={1}
            className="flex-1 bg-transparent placeholder-gray-400 resize-none focus:outline-none max-h-32 overflow-y-auto text-sm"
            style={{ color: '#060606', minHeight: '24px' }}
          />

          {/* Send/Cancel Button - Right */}
          {isStreaming ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleCancel(e)
              }}
              disabled={cancelDisabled}
              className="hover:text-red-600 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors ml-4 flex-shrink-0"
              style={{ color: cancelDisabled ? undefined : '#dc2626' }}
              aria-label="Cancel streaming"
              title="Cancel response generation"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h12v12H6z" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              onClick={(e) => e.stopPropagation()}
              disabled={disabled || !input.trim()}
              className="hover:text-gray-800 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors ml-4 flex-shrink-0"
              style={{ color: !disabled && input.trim() ? '#060606' : undefined }}
              aria-label="Send message"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          )}
          </div>
        </motion.form>
      </div>
      {referenceModal}
    </>
  )
}
