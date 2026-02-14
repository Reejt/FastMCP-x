'use client'

import { useState, useEffect, useRef } from 'react'
import { Message, DocumentData } from '@/app/types'

interface UseDocumentDetectorOptions {
  minContentLength?: number  // Optional: minimum chars (default 150)
  enableStreamingPreview?: boolean  // Enable real-time updates (default true)
  onStreamingDetected?: (documentData: DocumentData) => void  // Callback when detection happens
}

/**
 * Detects document creation intent in messages and tracks streaming updates
 * Enables real-time preview of documents as they're generated
 */
export function useDocumentDetector(
  messages: Message[],
  options?: UseDocumentDetectorOptions
) {
  const [currentDocument, setCurrentDocument] = useState<DocumentData | null>(null)
  const [isDocumentPanelOpen, setIsDocumentPanelOpen] = useState(false)
  const processedMessageIds = useRef<Set<string>>(new Set())
  const streamingMessageId = useRef<string | null>(null)

  const minContentLength = options?.minContentLength ?? 150
  const enableStreaming = options?.enableStreamingPreview ?? true

  /**
   * Detect if a user message indicates document creation intent
   */
  const detectDocumentIntent = (userQuery: string): string | null => {
    const query = userQuery.toLowerCase()
    
    const documentKeywords = [
      'write', 'create', 'generate', 'draft', 'prepare', 'compose',
      'marketing plan', 'business plan', 'proposal', 'report', 'document',
      'guide', 'analysis', 'summary', 'outline', 'brief', 'memo',
      'article', 'essay', 'specification', 'requirements', 'design',
      'whitepaper', 'slide', 'presentation', 'email', 'letter'
    ]

    if (documentKeywords.some(kw => query.includes(kw))) {
      // Determine document type based on keywords
      if (query.includes('marketing') || query.includes('campaign')) return 'document'
      if (query.includes('business plan') || query.includes('strategic')) return 'plan'
      if (query.includes('report') || query.includes('analysis')) return 'report'
      if (query.includes('guide') || query.includes('how-to') || query.includes('tutorial')) return 'guide'
      if (query.includes('proposal') || query.includes('pitch')) return 'proposal'
      if (query.includes('summary') || query.includes('summarize') || query.includes('tldr')) return 'summary'
      if (query.includes('analysis')) return 'analysis'
      return 'document'
    }

    return null
  }

  /**
   * Calculate word count from content
   */
  const calculateWordCount = (content: string): number => {
    return content.trim().split(/\s+/).filter(word => word.length > 0).length
  }

  /**
   * Calculate estimated read time
   */
  const calculateReadTime = (content: string): number => {
    const wordCount = calculateWordCount(content)
    return Math.ceil(wordCount / 200) // ~200 words per minute
  }

  /**
   * Calculate character count
   */
  const calculateCharCount = (content: string): number => {
    return content.length
  }

  /**
   * Count headings in markdown content
   */
  const countHeadings = (content: string): number => {
    const headingRegex = /^#+\s/gm
    const matches = content.match(headingRegex)
    return matches ? matches.length : 0
  }

  /**
   * Extract title from content (first heading or first line)
   */
  const extractTitle = (content: string, userQuery: string): string => {
    // Try to extract from first heading
    const headingMatch = content.match(/^#+\s+(.+?)$/m)
    if (headingMatch) {
      return headingMatch[1].substring(0, 60)
    }

    // Try to extract from first line
    const firstLine = content.split('\n')[0]?.trim()
    if (firstLine && firstLine.length > 10) {
      return firstLine.substring(0, 60)
    }

    // Fall back to user query
    return userQuery.substring(0, 60)
  }

  useEffect(() => {
    if (!enableStreaming || messages.length === 0) return

    const lastMessage = messages[messages.length - 1]

    // Detect document intent from USER message immediately (before assistant responds)
    if (lastMessage?.role === 'user') {
      const documentType = detectDocumentIntent(lastMessage.content)

      if (documentType && !processedMessageIds.current.has(lastMessage.id)) {
        // Open panel immediately on user query with document intent
        const documentData: DocumentData = {
          id: lastMessage.id,
          type: documentType as DocumentData['type'],
          title: 'Generating document...',
          content: '',
          userQuery: lastMessage.content,
          createdAt: new Date(),
          isStreaming: true,
          metadata: {
            wordCount: 0,
            estimatedReadTime: 0,
            charCount: 0,
            headingCount: 0
          }
        }

        setCurrentDocument(documentData)
        setIsDocumentPanelOpen(true)
        streamingMessageId.current = null
        
        // Mark user message as processed
        processedMessageIds.current.add(lastMessage.id)
        options?.onStreamingDetected?.(documentData)
      }
    }
    // Process assistant messages (streaming and finished)
    else if (lastMessage?.role === 'assistant') {
      const userMessage = messages[messages.length - 2]
      if (!userMessage || userMessage.role !== 'user') return

      const documentType = detectDocumentIntent(userMessage.content)
      if (!documentType) return

      // Update document with assistant content while streaming
      if (lastMessage.isStreaming && streamingMessageId.current === lastMessage.id && currentDocument) {
        const content = lastMessage.content || currentDocument.content
        const wordCount = calculateWordCount(content)

        setCurrentDocument(prev =>
          prev
            ? {
                ...prev,
                content,
                isStreaming: true,
                metadata: {
                  ...prev.metadata!,
                  wordCount,
                  estimatedReadTime: calculateReadTime(content),
                  charCount: calculateCharCount(content),
                  headingCount: countHeadings(content)
                }
              }
            : null
        )
      } else if (lastMessage.isStreaming && !processedMessageIds.current.has(lastMessage.id)) {
        // First chunk of assistant response
        const content = lastMessage.content || ''
        const title = extractTitle(content, userMessage.content)
        const wordCount = calculateWordCount(content)

        const documentData: DocumentData = {
          id: lastMessage.id,
          type: documentType as DocumentData['type'],
          title: title || 'Generating document...',
          content,
          userQuery: userMessage.content,
          createdAt: new Date(),
          isStreaming: true,
          metadata: {
            wordCount,
            estimatedReadTime: calculateReadTime(content),
            charCount: calculateCharCount(content),
            headingCount: countHeadings(content)
          }
        }

        setCurrentDocument(documentData)
        streamingMessageId.current = lastMessage.id
      } else if (!lastMessage.isStreaming && streamingMessageId.current === lastMessage.id) {
        // Streaming finished
        processedMessageIds.current.add(lastMessage.id)
        streamingMessageId.current = null

        setCurrentDocument(prev =>
          prev
            ? {
                ...prev,
                isStreaming: false
              }
            : null
        )
      }
    }
  }, [messages, enableStreaming])

  const closeDocumentPanel = () => {
    setIsDocumentPanelOpen(false)
  }

  const openDocumentPanel = () => {
    setIsDocumentPanelOpen(true)
  }

  return {
    currentDocument,
    isDocumentPanelOpen,
    closeDocumentPanel,
    openDocumentPanel
  }
}
