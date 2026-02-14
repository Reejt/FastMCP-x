'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import type { File } from '@/app/types'
import ConnectorMention from './ConnectorMention'

interface ChatInputProps {
  onSendMessage: (message: string, selectedFileIds?: string[]) => void
  onCancel?: () => void
  disabled?: boolean
  isStreaming?: boolean
  hasMessages?: boolean
  workspaceName?: string
  workspaceId?: string
  userId?: string
  variant?: 'hero' | 'dock'
}

export default function ChatInput({ onSendMessage, disabled = false, workspaceName, workspaceId, userId, onCancel, isStreaming = false, variant = 'dock' }: ChatInputProps) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [cancelDisabled, setCancelDisabled] = useState(false)
  const isHero = variant === 'hero'

  // @mention connector state
  const [showConnectorMention, setShowConnectorMention] = useState(false)
  const [connectorFilter, setConnectorFilter] = useState('')
  const [activeConnector, setActiveConnector] = useState<string | null>(null)

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
      // If there's an active connector, prepend @connector to the message
      const message = activeConnector ? `@${activeConnector} ${input.trim()}` : input.trim()
      onSendMessage(message, selectedFileIds.length > 0 ? selectedFileIds : undefined)
      setInput('')
      setActiveConnector(null)
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

    let isCancelled = false

    const loadFiles = async () => {
      setFilesLoading(true)
      setFilesError(null)
      try {
        // If workspaceId is provided, fetch workspace-specific files
        // If not provided, fetch all files from main vault (no workspaceId param)
        const url = workspaceId 
          ? `/api/vault/upload?workspaceId=${workspaceId}`
          : '/api/vault/upload'
        
        const response = await fetch(url)
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
    setFilesLoading(true)
    setFilesError(null)
    try {
      // If workspaceId is provided, fetch workspace-specific files
      // If not provided, fetch all files from main vault (no workspaceId param)
      const url = workspaceId 
        ? `/api/vault/upload?workspaceId=${workspaceId}`
        : '/api/vault/upload'
      
      const response = await fetch(url)
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
        className="rounded-xl p-6 w-full max-w-2xl shadow-xl"
        style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
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
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Choose files you want to use as reference to answer your query
          </h3>
          <button
            type="button"
            onClick={() => {
              referenceFileInputRef.current?.click()
            }}
            disabled={referenceUploading}
            className="px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--text-inverse)' }}
            onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => !e.currentTarget.disabled && (e.currentTarget.style.opacity = '1')}
          >
            Add
          </button>
        </div>

        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
          {filesLoading ? (
            <div className="p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Loading files...</div>
          ) : filesError ? (
            <div className="p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>{filesError}</div>
          ) : workspaceFiles.length === 0 ? (
            <div className="p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>{workspaceId ? 'No files uploaded in this workspace.' : 'No files uploaded in your vault.'}</div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              {workspaceFiles.map((file) => {
                const checked = draftSelectedFileIds.includes(file.id)
                return (
                  <label key={file.id} className="flex items-center gap-4 p-4 cursor-pointer" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
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
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {file.file_name}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatFileTypeLabel(file)}</div>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button onClick={cancelReferenceSelection} className="px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-hover)' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-surface)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
          >
            Cancel
          </button>
          <button
            onClick={saveReferenceSelection}
            className="px-4 py-2 rounded-lg text-sm transition-colors cursor-pointer"
            style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--text-inverse)' }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  ) : null

  return (
    <>
      <div
        className={isHero ? 'px-6' : 'p-6'}
        style={{ backgroundColor: isHero ? 'transparent' : 'var(--bg-app)' }}
      >
        <motion.form
          onSubmit={handleSubmit}
          className="mx-auto w-full"
          data-variant={variant}
          style={{ maxWidth: isHero ? '920px' : '860px' }}
          initial={false}
          animate={{
            scale: 1,
          }}
          transition={{ duration: 0.3 }}
        >
          <div
            onClick={handleContainerClick}
            className={`relative flex items-center transition-all cursor-text ${isHero ? 'rounded-xl px-7 py-4' : 'rounded-xl px-6 py-3.5'}`}
            style={{ 
              backgroundColor: '#303030',
              boxShadow: isHero ? '0 12px 30px rgba(0, 0, 0, 0.14)' : '0 6px 16px rgba(0, 0, 0, 0.08)'
            }}
          >
          {/* Attachment Icon - Left */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              openReferenceModal()
            }}
            className="hover:opacity-70 transition-opacity mr-4 flex-shrink-0 cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
            disabled={disabled}
            aria-label="Attach file"
          >
            {isHero ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m-7-7h14" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            )}
          </button>

          {selectedFileIds.length > 0 && (
            <span className="text-xs mr-4 select-none" style={{ color: 'var(--text-muted)' }}>
              {selectedFileIds.length} files selected
            </span>
          )}

          {/* Text Input */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              const val = e.target.value
              setInput(val)

              // Detect @mention for connector autocomplete
              const atMatch = val.match(/^@(\w*)$/)
              if (atMatch) {
                setShowConnectorMention(true)
                setConnectorFilter(atMatch[1])
              } else if (showConnectorMention && !val.startsWith('@')) {
                setShowConnectorMention(false)
                setConnectorFilter('')
              } else if (showConnectorMention && val.startsWith('@')) {
                const filter = val.slice(1).split(' ')[0]
                if (!val.includes(' ')) {
                  setConnectorFilter(filter)
                } else {
                  setShowConnectorMention(false)
                  setConnectorFilter('')
                }
              }
            }}
            onKeyDown={(e) => {
              if (showConnectorMention) {
                // Let ConnectorMention handle navigation keys
                if (['ArrowDown', 'ArrowUp', 'Tab'].includes(e.key)) {
                  return // ConnectorMention handles these
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setShowConnectorMention(false)
                  return
                }
              }
              handleKeyDown(e)
            }}
            placeholder={activeConnector ? `Ask @${activeConnector} anything...` : placeholder}
            disabled={disabled || isStreaming}
            rows={1}
            className={`flex-1 bg-transparent resize-none focus:outline-none max-h-32 overflow-y-auto ${isHero ? 'text-base' : 'text-sm'}`}
            style={{ 
              color: 'var(--text-primary)', 
              minHeight: isHero ? '30px' : '26px',
              caretColor: 'var(--accent-primary)'
            }}
          />

          {/* Active connector chip */}
          {activeConnector && (
            <button
              type="button"
              onClick={() => {
                setActiveConnector(null)
                setInput(input.replace(new RegExp(`^@${activeConnector}\\s*`), ''))
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs mr-2 cursor-pointer transition-opacity hover:opacity-80"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--text-inverse)',
              }}
            >
              @{activeConnector}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Connector @mention dropdown */}
          <ConnectorMention
            visible={showConnectorMention}
            filter={connectorFilter}
            userId={userId}
            onSelect={(connectorType) => {
              setActiveConnector(connectorType)
              setInput('')
              setShowConnectorMention(false)
              setConnectorFilter('')
              textareaRef.current?.focus()
            }}
            onClose={() => {
              setShowConnectorMention(false)
              setConnectorFilter('')
            }}
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
              className="hover:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity ml-4 flex-shrink-0"
              style={{ color: 'var(--accent-danger)' }}
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
              className="hover:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity ml-4 flex-shrink-0"
              style={{ color: !disabled && input.trim() ? 'var(--accent-primary)' : 'var(--text-muted)' }}
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
