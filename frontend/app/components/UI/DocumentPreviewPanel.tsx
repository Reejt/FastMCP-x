'use client'

import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import dynamic from 'next/dynamic'
import { DocumentData } from '@/app/types'

const MarkdownRenderer = dynamic(() => import('./MarkdownRenderer'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-8">
      <div className="text-sm text-gray-500">Loading content...</div>
    </div>
  ),
})

interface DocumentPreviewPanelProps {
  isOpen: boolean
  document: DocumentData | null
  onClose: () => void
  isStreaming?: boolean  // Indicates active streaming
}

export default function DocumentPreviewPanel({
  isOpen,
  document,
  onClose,
  isStreaming
}: DocumentPreviewPanelProps) {
  const [copyFeedback, setCopyFeedback] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Theme colors using CSS variables
  const theme = {
    bg: 'var(--bg-app)',
    cardBg: 'var(--bg-elevated)',
    border: 'var(--border-subtle)',
    text: 'var(--text-primary)',
    textSecondary: 'var(--text-secondary)',
    textMuted: 'var(--text-muted)',
    hoverBg: 'var(--bg-hover)',
  }

  const handleCopy = async () => {
    if (!document?.content) return

    try {
      await navigator.clipboard.writeText(document.content)
      setCopyFeedback(true)
      setTimeout(() => setCopyFeedback(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleDownload = () => {
    if (!document?.content) return

    const fileName = document.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100)

    const blob = new Blob([document.content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = globalThis.document.createElement('a')
    a.href = url
    a.download = `${fileName}.md`
    globalThis.document.body.appendChild(a)
    a.click()
    globalThis.document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const getDocumentIcon = (type: DocumentData['type']): string => {
    switch (type) {
      case 'plan':
        return '📋'
      case 'report':
        return '📊'
      case 'guide':
        return '📚'
      case 'proposal':
        return '💼'
      case 'analysis':
        return '🔍'
      case 'summary':
        return '📄'
      default:
        return '📄'
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.2 }}
          className="h-full w-full rounded-2xl shadow-sm flex flex-col overflow-hidden border"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
        >
          {/* Header */}
          <div
            className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0"
            style={{ borderColor: theme.border }}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Document icon */}
              <span className="text-2xl flex-shrink-0">
                {getDocumentIcon(document?.type || 'document')}
              </span>

              <div className="min-w-0 flex-1">
                {/* Title */}
                <h3
                  className="text-base font-semibold truncate"
                  style={{ color: theme.text }}
                >
                  {document?.title || 'Document'}
                </h3>

                {/* Metadata */}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs" style={{ color: theme.textMuted }}>
                    {document?.metadata?.wordCount ?? 0} words
                  </span>

                  {document?.metadata?.estimatedReadTime ? (
                    <>
                      <span style={{ color: theme.textMuted }}>•</span>
                      <span className="text-xs" style={{ color: theme.textMuted }}>
                        {document.metadata.estimatedReadTime} min read
                      </span>
                    </>
                  ) : null}

                  {/* Streaming Indicator */}
                  {isStreaming && (
                    <>
                      <span style={{ color: theme.textMuted }}>•</span>
                      <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--accent-orange)' }}>
                        <span className="inline-block w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></span>
                        Updating...
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 flex-shrink-0 ml-4">
              {/* Copy Button */}
              <button
                onClick={handleCopy}
                className="p-2 rounded-lg transition-colors"
                style={{ color: theme.textSecondary }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.hoverBg}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                title={copyFeedback ? 'Copied!' : 'Copy to clipboard'}
                disabled={isStreaming && !document?.content}
              >
                {copyFeedback ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                )}
              </button>

              {/* Download Button */}
              <button
                onClick={handleDownload}
                className="p-2 rounded-lg transition-colors"
                style={{ color: theme.textSecondary }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.hoverBg}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                title="Download"
                disabled={isStreaming && !document?.content}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </button>

              {/* Close Button */}
              <button
                onClick={onClose}
                className="p-2 rounded-lg transition-colors"
                style={{ color: theme.textSecondary }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.hoverBg}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {document ? (
              <>
                {/* Document type badge */}
                <span
                  className="inline-block px-3 py-1 text-xs font-semibold rounded-full mb-4"
                  style={{ backgroundColor: theme.hoverBg, color: theme.textSecondary }}
                >
                  {document.type.charAt(0).toUpperCase() + document.type.slice(1)}
                </span>

                {/* Markdown content */}
                <div className="prose prose-invert text-sm max-w-none" ref={contentRef}>
                  {document.content ? (
                    <>
                      <MarkdownRenderer content={document.content} />

                      {/* Streaming cursor animation */}
                      {isStreaming && document.content.length > 0 && (
                        <span
                          className="inline-block w-2 h-5 animate-pulse ml-1"
                          style={{ backgroundColor: theme.textSecondary }}
                        />
                      )}
                    </>
                  ) : null}
                </div>

                {/* Empty state for early streaming (no content yet) */}
                {isStreaming && !document.content && (
                  <div className="flex items-center justify-center h-32" style={{ color: theme.textMuted }}>
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                      </div>
                      <span className="text-sm">Generating document...</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full" style={{ color: theme.textMuted }}>
                <span className="text-sm">Select a document to preview</span>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
