'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import { useState, useCallback, useEffect, ComponentPropsWithoutRef } from 'react'
import dynamic from 'next/dynamic'
import { useMermaidDetector } from '../../hooks/useMermaidDetector'
import DiagramPreviewPanel from './DiagramPreviewPanel'

// Dynamically import MermaidDiagram to avoid SSR issues
const MermaidDiagram = dynamic(() => import('./MermaidDiagram'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-8 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-2 text-gray-500">
        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Loading diagram...</span>
      </div>
    </div>
  ),
})

interface MarkdownRendererProps {
  content: string
  className?: string
  style?: React.CSSProperties
}

// Custom light theme inspired by ChatGPT
const customCodeTheme = {
  ...oneLight,
  'pre[class*="language-"]': {
    ...oneLight['pre[class*="language-"]'],
    background: '#f7f7f8',
    margin: 0,
    padding: '1rem',
    fontSize: '0.875rem',
    lineHeight: '1.5',
  },
  'code[class*="language-"]': {
    ...oneLight['code[class*="language-"]'],
    background: 'transparent',
    fontSize: '0.875rem',
    lineHeight: '1.5',
  },
}

export default function MarkdownRenderer({ content, className = '', style }: MarkdownRendererProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  // Create a fake message for diagram detection
  const messages = [{ content, role: 'assistant' as const, id: 'markdown-content' }]
  
  // Use the mermaid detector hook
  const { detectedDiagrams, currentDiagram, showDiagram, closeDiagram, hasDiagrams } = useMermaidDetector(messages, true)

  // Debug logging
  useEffect(() => {
    if (content.includes('```mermaid')) {
      console.log('🔍 MarkdownRenderer: Mermaid code block found in content')
      console.log('📊 Detected diagrams:', detectedDiagrams?.length ?? 0)
      console.log('🎯 Has diagrams:', hasDiagrams)
      if (detectedDiagrams && detectedDiagrams.length > 0) {
        console.log('✅ First diagram:', detectedDiagrams[0])
      }
    }
  }, [content, detectedDiagrams, hasDiagrams])

  const copyToClipboard = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [])

  return (
    <div className={`markdown-body ${className}`} style={style}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings with proper spacing and typography
          h1: ({ children }) => (
            <h1 className="text-3xl font-bold mt-8 mb-4 leading-tight first:mt-0" style={{ color: 'var(--markdown-heading)' }}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-2xl font-bold mt-6 mb-3 leading-tight" style={{ color: 'var(--markdown-heading)' }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xl font-semibold mt-5 mb-2 leading-snug" style={{ color: 'var(--markdown-heading)' }}>
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-lg font-semibold mt-4 mb-2" style={{ color: 'var(--markdown-heading)' }}>
              {children}
            </h4>
          ),
          h5: ({ children }) => (
            <h5 className="text-base font-semibold mt-4 mb-2" style={{ color: 'var(--markdown-heading)' }}>
              {children}
            </h5>
          ),
          h6: ({ children }) => (
            <h6 className="text-sm font-semibold mt-4 mb-2" style={{ color: 'var(--markdown-heading)' }}>
              {children}
            </h6>
          ),

          // Paragraphs with comfortable line height
          p: ({ children }) => (
            <p className="mb-4 leading-7 last:mb-0" style={{ color: 'var(--markdown-text)' }}>
              {children}
            </p>
          ),

          // Strong and emphasis
          strong: ({ children }) => (
            <strong className="font-semibold" style={{ color: 'var(--markdown-text)' }}>{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic">{children}</em>
          ),

          // Lists with proper indentation
          ul: ({ children }) => (
            <ul className="mb-4 ml-6 list-disc space-y-2" style={{ color: 'var(--markdown-text)' }}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-4 ml-6 list-decimal space-y-2" style={{ color: 'var(--markdown-text)' }}>
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-7 pl-1">
              {children}
            </li>
          ),

          // Links
          a: ({ children, href }) => (
            <a 
              href={href} 
              className="underline underline-offset-2"
              style={{ color: 'var(--markdown-link)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--markdown-link-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--markdown-link)'}
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),

          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="pl-4 my-4 italic" style={{ borderLeft: '4px solid var(--markdown-border)', color: 'var(--text-secondary)' }}>
              {children}
            </blockquote>
          ),

          // Horizontal rule
          hr: () => (
            <hr className="my-6" style={{ borderTop: '1px solid var(--markdown-border)' }} />
          ),

          // Code blocks with syntax highlighting and copy button
          pre: ({ children }) => {
            return (
              <div className="relative group my-4">
                {children}
              </div>
            )
          },
          code: ({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) => {
            const match = /language-(\w+)/.exec(className || '')
            const codeString = String(children).replace(/\n$/, '')
            const isInline = !match && !className?.includes('language-')
            
            // Check if this is inline code (no language and no newlines)
            if (isInline && !codeString.includes('\n')) {
              return (
                <code 
                  className="px-1.5 py-0.5 text-sm font-mono rounded"
                  style={{ backgroundColor: 'var(--markdown-inline-code-bg)', color: 'var(--markdown-text)' }}
                  {...props}
                >
                  {children}
                </code>
              )
            }

            // Code block with syntax highlighting
            const language = match ? match[1] : 'text'
            
            // Handle Mermaid diagrams - render inline directly
            if (language === 'mermaid') {
              return (
                <div className="my-4">
                  {/* Render the diagram inline */}
                  <MermaidDiagram chart={codeString} className="border border-gray-200 rounded-lg p-4 bg-white" />
                  
                  {/* Also show a button to open in preview panel */}
                  {detectedDiagrams && detectedDiagrams.length > 0 && (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => {
                          const diagram = detectedDiagrams.find(d => d.mermaidCode.trim() === codeString.trim())
                          if (diagram) showDiagram(diagram.id)
                        }}
                        className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                      >
                        Open in Preview Panel
                      </button>
                    </div>
                  )}
                </div>
              )
            }
            
            return (
              <div className="relative group">
                {/* Language label and copy button */}
                <div className="flex items-center justify-between bg-gray-200 px-4 py-2 text-xs text-gray-700 rounded-t-lg">
                  <span className="font-medium uppercase">{language}</span>
                  <button
                    onClick={() => copyToClipboard(codeString)}
                    className="flex items-center gap-1 transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                    aria-label="Copy code"
                  >
                    {copiedCode === codeString ? (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span>Copy code</span>
                      </>
                    )}
                  </button>
                </div>
                <SyntaxHighlighter
                  style={customCodeTheme}
                  language={language}
                  PreTag="div"
                  className="!mt-0 !rounded-t-none !rounded-b-lg text-sm"
                  customStyle={{
                    margin: 0,
                    borderTopLeftRadius: 0,
                    borderTopRightRadius: 0,
                    borderBottomLeftRadius: '0.5rem',
                    borderBottomRightRadius: '0.5rem',
                  }}
                >
                  {codeString}
                </SyntaxHighlighter>
              </div>
            )
          },

          // Tables with proper styling
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border border-gray-200 text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gray-50">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-gray-200">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-gray-50 transition-colors">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b border-gray-200">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3 text-gray-700 border-b border-gray-100">
              {children}
            </td>
          ),

          // Images
          img: ({ src, alt }) => (
            <img 
              src={src} 
              alt={alt || ''} 
              className="max-w-full h-auto rounded-lg my-4"
            />
          ),

          // Task lists (GFM)
          input: ({ type, checked, ...props }) => {
            if (type === 'checkbox') {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600"
                  {...props}
                />
              )
            }
            return <input type={type} {...props} />
          },
        }}
      >
        {content}
      </ReactMarkdown>

      {/* Diagram Preview Panel */}
      <DiagramPreviewPanel
        isOpen={!!currentDiagram}
        diagram={currentDiagram}
        onClose={closeDiagram}
      />
    </div>
  )
}
