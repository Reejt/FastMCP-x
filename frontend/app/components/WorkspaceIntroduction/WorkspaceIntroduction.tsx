'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Workspace, Message, ChatSession, File } from '@/app/types'
import InstructionsPanel from '@/app/components/WorkspaceIntroduction/InstructionsPanel'
import VaultPanel from '@/app/components/WorkspaceIntroduction/VaultPanel'
import MarkdownRenderer from '@/app/components/UI/MarkdownRenderer'
import ConnectorAuthPrompt from '@/app/components/Chat/ConnectorAuthPrompt'

interface WorkspaceIntroductionProps {
  workspace: Workspace
  messages: Message[]
  isProcessing: boolean
  isStreaming?: boolean
  onSendMessage: (message: string, selectedFileIds?: string[]) => void
  onCancel?: () => void
  isWorkspaceSidebarCollapsed?: boolean
  onExpandWorkspaceSidebar?: () => void
  chatSessions?: ChatSession[]
  onChatSelect?: (chatId: string) => void
  currentChatId?: string
}

export default function WorkspaceIntroduction({ workspace, messages, isProcessing, isStreaming, onSendMessage, onCancel, isWorkspaceSidebarCollapsed, onExpandWorkspaceSidebar, chatSessions = [], onChatSelect, currentChatId }: WorkspaceIntroductionProps) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const chatHistoryRef = useRef<HTMLDivElement>(null)

  const [isReferenceModalOpen, setIsReferenceModalOpen] = useState(false)
  const [workspaceFiles, setWorkspaceFiles] = useState<File[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesError, setFilesError] = useState<string | null>(null)

  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([])
  const [draftSelectedFileIds, setDraftSelectedFileIds] = useState<string[]>([])
  const referenceFileInputRef = useRef<HTMLInputElement>(null)
  const [referenceUploading, setReferenceUploading] = useState(false)

  // Check if we're in chat mode (has messages)
  const isInChatMode = messages.length > 0

  // Theme colors using CSS variables
  const theme = {
    bg: 'var(--bg-app)',
    cardBg: 'var(--bg-elevated)',
    inputBg: '#303030',
    border: 'var(--border-subtle)',
    borderHover: 'var(--border-strong)',
    text: 'var(--text-primary)',
    textSecondary: 'var(--text-secondary)',
    textMuted: 'var(--text-muted)',
    userBubble: 'var(--bg-user-bubble)',
    hoverBg: 'var(--bg-hover)',
  }

  // Helper function to get relative time string
  const getRelativeTimeString = (date: Date): string => {
    const now = new Date()
    const diffMs = now.getTime() - new Date(date).getTime()
    const diffSeconds = Math.floor(diffMs / 1000)
    const diffMinutes = Math.floor(diffSeconds / 60)
    const diffHours = Math.floor(diffMinutes / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffSeconds < 60) {
      return `${diffSeconds} second${diffSeconds !== 1 ? 's' : ''} ago`
    } else if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
    } else {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
    }
  }

  // Get chat title from session (first user message or default)
  const getChatTitle = (session: ChatSession): string => {
    const firstUserMessage = session.messages?.find(m => m.role === 'user')
    if (firstUserMessage) {
      const title = firstUserMessage.content.slice(0, 30)
      return title.length < firstUserMessage.content.length ? `${title}...` : title
    }
    return 'New conversation'
  }

  const currentChatSession = currentChatId
    ? chatSessions.find(s => s.id === currentChatId)
    : undefined

  const getMessageDerivedChatLabel = (): string | undefined => {
    if (messages.length === 0) return undefined
    const firstUserMessage = messages.find(m => m.role === 'user')
    const source = firstUserMessage?.content || messages[0]?.content
    if (!source) return undefined
    const trimmed = source.slice(0, 30)
    return trimmed.length < source.length ? `${trimmed}...` : trimmed
  }

  const currentChatLabel = isInChatMode
    ? (currentChatSession ? getChatTitle(currentChatSession) : (getMessageDerivedChatLabel() || 'New conversation'))
    : undefined

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight
    }
  }, [messages])

  // Fetch workspace files when modal opens
  useEffect(() => {
    if (!isReferenceModalOpen) return
    if (!workspace?.id) return

    let isCancelled = false

    const loadFiles = async () => {
      setFilesLoading(true)
      setFilesError(null)
      try {
        const response = await fetch(`/api/vault/upload?workspaceId=${workspace.id}`)
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
  }, [isReferenceModalOpen, workspace?.id])

  const refreshWorkspaceFiles = async () => {
    if (!workspace?.id) return
    setFilesLoading(true)
    setFilesError(null)
    try {
      const response = await fetch(`/api/vault/upload?workspaceId=${workspace.id}`)
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
      formData.append('workspaceId', workspace.id)

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

  const referenceModal = isReferenceModalOpen ? (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={cancelReferenceSelection}
    >
      <div
        className="rounded-xl p-6 w-full max-w-2xl shadow-xl border"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={referenceFileInputRef}
          type="file"
          onChange={handleReferenceFileUpload}
          className="hidden"
          disabled={referenceUploading}
          accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.ppt,.pptx,.json,.xml,.html,.jpg,.jpeg,.png,.gif,.webp"
        />

        <div className="flex items-start justify-between gap-4 mb-4">
          <h3 className="text-base font-semibold" style={{ color: theme.text }}>
            Choose files you want to use as reference to answer your query
          </h3>
          <button
            type="button"
            onClick={() => {
              referenceFileInputRef.current?.click()
            }}
            disabled={referenceUploading}
            className="px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-app)' }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            Add
          </button>
        </div>

        <div className="border rounded-xl overflow-hidden" style={{ borderColor: theme.border }}>
          {filesLoading ? (
            <div className="p-4 text-sm" style={{ color: theme.textMuted }}>
              Loading files...
            </div>
          ) : filesError ? (
            <div className="p-4 text-sm" style={{ color: theme.textMuted }}>
              {filesError}
            </div>
          ) : workspaceFiles.length === 0 ? (
            <div className="p-4 text-sm" style={{ color: theme.textMuted }}>
              No files uploaded in this workspace.
            </div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto">
              {workspaceFiles.map((file, idx) => {
                const checked = draftSelectedFileIds.includes(file.id)
                return (
                  <label
                    key={file.id}
                    className="relative flex items-center gap-4 p-4 cursor-pointer"
                    style={{ backgroundColor: theme.cardBg }}
                  >
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
                      <div className="text-sm font-semibold truncate" style={{ color: theme.text }}>
                        {file.file_name}
                      </div>
                      <div className="text-xs" style={{ color: theme.textMuted }}>
                        {formatFileTypeLabel(file)}
                      </div>
                    </div>

                    {/* Row divider */}
                    {idx !== workspaceFiles.length - 1 && (
                      <div
                        className="absolute left-0 right-0 bottom-0 pointer-events-none"
                        style={{ height: 1, backgroundColor: theme.border }}
                      />
                    )}
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button
            onClick={cancelReferenceSelection}
            className="px-4 py-2 rounded-lg transition-colors text-sm cursor-pointer"
            style={{ color: theme.textSecondary }}
          >
            Cancel
          </button>
          <button
            onClick={saveReferenceSelection}
            className="px-4 py-2 rounded-lg transition-colors text-sm cursor-pointer"
            style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-app)' }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  ) : null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && !isProcessing) {
      onSendMessage(message.trim(), selectedFileIds.length > 0 ? selectedFileIds : undefined)
      setMessage('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  // ============================================
  // CHAT MODE VIEW - Grok-style full screen chat
  // ============================================
  if (isInChatMode) {
    return (
      <>
        <div className="flex flex-col h-full w-full" style={{ backgroundColor: theme.bg }}>
        {/* Top Navigation Bar */}
        <div className="px-6 pt-4 pb-2" style={{ backgroundColor: theme.bg }}>
          <div className="flex items-center justify-between">
            {/* Left side - Breadcrumb with Expand Button */}
            <nav className="flex items-center gap-3 text-sm" style={{ color: theme.textSecondary }} aria-label="Breadcrumb">
              {/* Expand Button - Shows when workspace sidebar is collapsed */}
              {isWorkspaceSidebarCollapsed && onExpandWorkspaceSidebar && (
                <button
                  onClick={onExpandWorkspaceSidebar}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 border shadow-sm rounded-lg transition-all"
                  style={{ 
                    backgroundColor: theme.cardBg, 
                    borderColor: theme.border,
                  }}
                  aria-label="Expand workspace sidebar"
                >
                  <svg className="w-4 h-4" style={{ color: theme.textSecondary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => router.push('/workspaces')}
                className="hover:opacity-80 transition-opacity"
              >
                Workspaces
              </button>
              <svg className="w-4 h-4" style={{ color: theme.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span style={{ color: theme.text }} className="font-medium">{workspace.name}</span>
            </nav>

          </div>
        </div>

        {/* Chat Messages Area - Scrollable */}
        <div 
          ref={chatHistoryRef}
          className="flex-1 overflow-y-auto px-6 py-6"
        >
          <div className="max-w-3xl mx-auto">
            {messages.map((msg) => (
              <div key={msg.id} className="mb-8">
                {msg.role === 'user' ? (
                  // User message - Right aligned, simple text
                  <div className="flex justify-end mb-2">
                    <div className="rounded-2xl px-5 py-3 max-w-[85%]" style={{ backgroundColor: theme.userBubble }}>
                      <p className="text-[15px] whitespace-pre-wrap" style={{ color: theme.text }}>{msg.content}</p>
                    </div>
                  </div>
                ) : (
                  // Assistant message - Inline text, no bubble
                  <div style={{ color: theme.text }}>
                    <div className="text-[15px]">
                      <MarkdownRenderer content={msg.content || ''} />
                      {msg.isStreaming && !msg.content && (
                        <span style={{ color: theme.textMuted }}>Thinking...</span>
                      )}
                      {msg.isStreaming && msg.content && (
                        <span className="inline-block w-2 h-5 animate-pulse ml-0.5" style={{ backgroundColor: 'var(--text-secondary)' }}></span>
                      )}
                    </div>
                    
                    {/* Action buttons row - Grok style */}
                    {!msg.isStreaming && msg.content && (
                      <div className="flex items-center gap-1 mt-4" style={{ color: theme.textMuted }}>
                        {/* Regenerate */}
                        <button className="p-2 rounded-lg transition-colors hover:opacity-70" title="Regenerate">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                        {/* Read aloud */}
                        <button className="p-2 rounded-lg transition-colors hover:opacity-70" title="Read aloud">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                          </svg>
                        </button>
                        {/* Copy */}
                        <button className="p-2 rounded-lg transition-colors hover:opacity-70" title="Copy">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                        {/* Share */}
                        <button className="p-2 rounded-lg transition-colors hover:opacity-70" title="Share">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                        </button>
                        {/* Thumbs up */}
                        <button className="p-2 rounded-lg transition-colors hover:opacity-70" title="Good response">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                          </svg>
                        </button>
                        {/* Thumbs down */}
                        <button className="p-2 rounded-lg transition-colors hover:opacity-70" title="Bad response">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v5a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                          </svg>
                        </button>
                        {/* More options */}
                        <button className="p-2 rounded-lg transition-colors hover:opacity-70" title="More options">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                          </svg>
                        </button>
                      </div>
                    )}
                    
                    {/* Connector auth required prompt */}
                    {msg.connectorAuthRequired && (
                      <div className="mt-4">
                        <ConnectorAuthPrompt
                          connector={msg.connectorAuthRequired.connector}
                          connectorName={msg.connectorAuthRequired.name}
                          authUrl={msg.connectorAuthRequired.authUrl}
                          query={msg.connectorAuthRequired.query}
                          userId={msg.connectorAuthRequired.userId}
                          onRetryQuery={(query) => onSendMessage(query)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Chat Input - Fixed at bottom */}
        <div className="px-6 py-4" style={{ backgroundColor: theme.bg, borderTop: `1px solid ${theme.border}` }}>
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSubmit}>
              <div className="relative flex items-center rounded-full transition-all px-5 py-3" style={{ backgroundColor: theme.inputBg }}>
                {/* Attachment Button */}
                <button
                  type="button"
                  className="p-1 rounded-lg transition-colors mr-3 flex-shrink-0 hover:opacity-70"
                  aria-label="Add attachment"
                  disabled={isProcessing}
                  onClick={(e) => {
                    e.preventDefault()
                    openReferenceModal()
                  }}
                >
                  <svg className="w-5 h-5" style={{ color: theme.textSecondary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>

                {selectedFileIds.length > 0 && (
                  <span className="text-xs mr-3" style={{ color: theme.textMuted }}>
                    {selectedFileIds.length} files selected
                  </span>
                )}

                {/* Text Input */}
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSubmit(e)
                    }
                  }}
                  placeholder="How can Varys help?"
                  disabled={isProcessing}
                  className="flex-1 bg-transparent text-[15px] focus:outline-none disabled:cursor-not-allowed"
                  style={{ color: theme.text }}
                />

                {/* Mode Selector */}
                <div className="flex items-center gap-2 ml-3">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors hover:opacity-80"
                    style={{ color: theme.textSecondary }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Auto</span>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Send/Cancel Button */}
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={onCancel}
                      className="p-2 rounded-full transition-all"
                      style={{
                        backgroundColor: 'var(--accent-danger)',
                        color: 'var(--text-inverse)',
                        cursor: 'pointer'
                      }}
                      aria-label="Cancel message"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h12v2H6z" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!message.trim() || isProcessing}
                      className="p-2 rounded-full transition-all"
                      style={{
                        backgroundColor: message.trim() && !isProcessing ? 'var(--text-primary)' : theme.hoverBg,
                        color: message.trim() && !isProcessing ? 'var(--bg-app)' : theme.textMuted,
                        cursor: !message.trim() || isProcessing ? 'not-allowed' : 'pointer'
                      }}
                      aria-label="Send message"
                    >
                      {isProcessing ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
        </div>
        {referenceModal}
      </>
    )
  }

  // ============================================
  // INTRODUCTION MODE VIEW - Original design
  // ============================================
  return (
    <>
      <div className="flex h-full w-full" style={{ backgroundColor: theme.bg }}>
      {/* Left Side - Chat Area (50% width) */}
      <div className="flex-1 flex flex-col px-6 pt-4 pb-8 overflow-auto" style={{ flexBasis: '50%' }}>
        {/* Header with Breadcrumb and Theme Toggle */}
        <div className="flex items-center justify-between mb-6">
          {/* Breadcrumb Navigation with Expand Button */}
          <nav className="flex items-center gap-3 text-sm" style={{ color: theme.textSecondary }} aria-label="Breadcrumb">
            {/* Expand Button - Shows when workspace sidebar is collapsed */}
            {isWorkspaceSidebarCollapsed && onExpandWorkspaceSidebar && (
              <button
                onClick={onExpandWorkspaceSidebar}
                className="flex items-center gap-1.5 px-2.5 py-1.5 border shadow-sm rounded-lg transition-all"
                style={{ 
                  backgroundColor: theme.cardBg, 
                  borderColor: theme.border,
                }}
                aria-label="Expand workspace sidebar"
              >
                <svg className="w-4 h-4" style={{ color: theme.textSecondary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            <button
              onClick={() => router.push('/workspaces')}
              className="hover:opacity-80 transition-opacity"
            >
              Workspaces
            </button>
            <svg className="w-4 h-4" style={{ color: theme.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span style={{ color: theme.text }} className="font-medium">{workspace.name}</span>
            {currentChatLabel && (
              <>
                <svg className="w-4 h-4" style={{ color: theme.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span style={{ color: theme.text }} className="font-medium">{currentChatLabel}</span>
              </>
            )}
            {currentChatLabel && (
              <>
                <svg className="w-4 h-4" style={{ color: theme.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span style={{ color: theme.text }} className="font-medium">{currentChatLabel}</span>
              </>
            )}
          </nav>
        </div>

        {/* Main Content Container */}
        <div className="flex-1 flex flex-col w-full">

          {/* Workspace Title and Chat */}
          <div style={{ marginTop: '60px' }}>
            {/* Workspace Title */}
            <div className="mb-8">
              <h1 className="text-2xl font-semibold" style={{ color: theme.text }}>{workspace.name}</h1>
            </div>

            {/* Chat Input Box with Actions */}
            <div className="relative">
              {/* Action Buttons - Positioned inline with chatbox */}
              <div className="absolute -right-2 top-0 flex items-center gap-2" style={{ transform: 'translateX(100%)' }}>
                <div className="flex items-center gap-2 ml-3">
                  <button
                    className="p-1.5 rounded-md transition-colors hover:opacity-70"
                    style={{ color: theme.textMuted }}
                    aria-label="More options"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                    </svg>
                  </button>
                  <button
                    className="p-1.5 rounded-md transition-colors hover:opacity-70"
                    style={{ color: theme.textMuted }}
                    aria-label="Add to favorites"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Chat Input Form */}
              <form onSubmit={handleSubmit}>
                <div className="rounded-2xl shadow-sm overflow-hidden" style={{ maxWidth: '99%', backgroundColor: theme.inputBg }}>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Start a new conversation in this workspace..."
                    disabled={isProcessing}
                    className="w-full px-5 pt-3 pb-2 text-[15px] bg-transparent resize-none focus:outline-none disabled:cursor-not-allowed"
                    style={{ color: theme.text, fontFamily: 'inherit' }}
                    rows={1}
                  />

                  {/* Bottom Bar with Actions */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-1">
                      {/* Plus Button */}
                      <button
                        type="button"
                        className="p-2 rounded-lg transition-colors hover:opacity-70"
                        aria-label="Add attachment"
                        disabled={isProcessing}
                        onClick={(e) => {
                          e.preventDefault()
                          openReferenceModal()
                        }}
                      >
                        <svg className="w-5 h-5" style={{ color: theme.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>

                      {selectedFileIds.length > 0 && (
                        <span className="text-xs" style={{ color: theme.textMuted }}>
                          {selectedFileIds.length} files selected
                        </span>
                      )}
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={!message.trim() || isProcessing}
                      className="p-2.5 rounded-full transition-all"
                      style={{
                        backgroundColor: message.trim() && !isProcessing ? 'var(--text-primary)' : theme.hoverBg,
                        color: message.trim() && !isProcessing ? 'var(--bg-app)' : theme.textMuted,
                        cursor: !message.trim() || isProcessing ? 'not-allowed' : 'pointer'
                      }}
                      aria-label="Send message"
                    >
                      {isProcessing ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Chat Sessions List - Shows when no messages and there are previous chat sessions */}
            {messages.length === 0 && chatSessions.length > 0 && (
              <div className="mt-8">
                <div className="space-y-1">
                  {chatSessions
                    .filter(session => (session.messages?.length ?? 0) > 0)
                    .map((session) => (
                      <button
                        key={session.id}
                        onClick={() => onChatSelect?.(session.id)}
                        className="w-full text-left py-4 transition-colors group"
                        style={{ borderBottom: `1px solid ${theme.border}` }}
                      >
                        <div className="font-medium text-[15px]" style={{ color: theme.text }}>
                          {getChatTitle(session)}
                        </div>
                        <div className="text-sm mt-1" style={{ color: theme.textMuted }}>
                          Last message {getRelativeTimeString(new Date(session.updated_at))}
                        </div>
                      </button>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Side - Instructions and Files Column (50% width) */}
      <div className="flex-shrink-0 overflow-y-auto px-6 py-8" style={{ flexBasis: '50%' }}>
        <div style={{ marginTop: '60px', maxWidth: '500px' }}>
          {/* Combined Card for Instructions and Files */}
          <div className="border rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
            {/* Instructions Section */}
            <div className="p-5" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <InstructionsPanel
                workspace={workspace}
              />
            </div>

            {/* Files Section */}
            <div className="p-5">
              <VaultPanel
                workspace={workspace}
              />
            </div>
          </div>
        </div>
      </div>
      </div>
      {referenceModal}
    </>
  )
}
