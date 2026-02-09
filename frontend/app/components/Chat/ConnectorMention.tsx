'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// Connector type definition
export interface ConnectorInfo {
  type: string
  name: string
  description: string
  icon: string
  is_connected: boolean
  connected_at: string | null
  scopes: string[] | null
}

interface ConnectorMentionProps {
  onSelect: (connectorType: string) => void
  onClose: () => void
  filter: string
  visible: boolean
  userId?: string
}

// Icon components for each connector
const ConnectorIcon = ({ type, size = 16 }: { type: string; size?: number }) => {
  const iconStyle = { width: size, height: size }

  switch (type) {
    case 'gdrive':
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="none">
          <path d="M8 2L2 12L5 17H11L17 7L11 2H8Z" fill="#4285F4" />
          <path d="M17 7L11 17H19L22 12L17 7Z" fill="#FBBC04" />
          <path d="M2 12L5 17H11L8 12L5 7L2 12Z" fill="#34A853" />
        </svg>
      )
    case 'slack':
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="none">
          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
          <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
          <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
          <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E"/>
        </svg>
      )
    case 'gmail':
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="none">
          <path d="M22 6L12 13L2 6V4L12 11L22 4V6Z" fill="#EA4335" />
          <path d="M2 6V18H22V6L12 13L2 6Z" fill="#FBBC04" opacity="0.8" />
          <rect x="2" y="4" width="20" height="16" rx="2" stroke="#EA4335" strokeWidth="1.5" fill="none" />
        </svg>
      )
    case 'onedrive':
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="none">
          <path d="M10.5 7C8.5 7 6.8 8.3 6.2 10.1C4.4 10.5 3 12.1 3 14C3 16.2 4.8 18 7 18H18C20.2 18 22 16.2 22 14C22 12.1 20.6 10.5 18.8 10.1C18.2 8.3 16.5 7 14.5 7C13.7 7 13 7.2 12.3 7.6C11.8 7.2 11.2 7 10.5 7Z" fill="#0078D4" />
        </svg>
      )
    default:
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      )
  }
}

export default function ConnectorMention({ onSelect, onClose, filter, visible, userId }: ConnectorMentionProps) {
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch connectors when dropdown becomes visible
  const refreshConnectors = useCallback(async () => {
    setLoading(true)
    try {
      if (userId) {
        const resp = await fetch('/api/connectors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId }),
        })
        const data = await resp.json()
        setConnectors(data.connectors || [])
      } else {
        const resp = await fetch('/api/connectors')
        const data = await resp.json()
        // Map to ConnectorInfo format without connection status
        setConnectors(
          (data.connectors || []).map((c: { type: string; name: string; description: string; icon: string }) => ({
            ...c,
            is_connected: false,
            connected_at: null,
            scopes: null,
          }))
        )
      }
    } catch (err) {
      console.error('Failed to fetch connectors:', err)
      setConnectors([])
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!visible) return
    refreshConnectors()
  }, [visible, refreshConnectors])

  // Handle postMessage from oauth popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'connector_authenticated') {
        console.log('Connector authenticated:', event.data)
        if (event.data.success) {
          // Refresh connectors list after successful auth
          setTimeout(() => {
            refreshConnectors()
          }, 500)
        } else {
          console.error('Authentication failed:', event.data.error)
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [refreshConnectors])

  // Filter connectors based on user input
  const filtered = connectors.filter((c) => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return (
      c.type.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q)
    )
  })

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [filter])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex].type)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [visible, filtered, selectedIndex, onSelect, onClose]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    if (visible) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [visible, onClose])

  if (!visible) return null

  return (
    <div
      ref={dropdownRef}
      className="absolute bottom-full left-6 mb-2 w-72 rounded-xl shadow-xl z-50 overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div className="px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
        Connect an app
      </div>

      {loading ? (
        <div className="px-3 py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Loading connectors...
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-3 py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
          No matching connectors
        </div>
      ) : (
        <div className="max-h-60 overflow-y-auto py-1">
          {filtered.map((connector, index) => (
            <button
              key={connector.type}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
              style={{
                backgroundColor: index === selectedIndex ? 'var(--bg-hover)' : 'transparent',
                color: 'var(--text-primary)',
              }}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={async () => {
                // Always call onSelect to clear the @ mention from input
                onSelect(connector.type)
                
                // If not connected, also open OAuth popup
                if (!connector.is_connected) {
                  // Check if token already exists before opening authorize endpoint
                  try {
                    const tokenCheckResponse = await fetch(`/api/connectors/${connector.type}/check-token`, {
                      method: 'GET',
                      headers: { 'Content-Type': 'application/json' },
                    })
                    
                    const tokenData = await tokenCheckResponse.json()
                    
                    // Skip authorize endpoint if token already exists
                    if (tokenData.has_token) {
                      console.log(`✅ Token already exists for ${connector.type}, skipping authorize endpoint`)
                      return
                    }
                  } catch (err) {
                    console.warn(`Failed to check token status for ${connector.type}:`, err)
                    // Continue with authorize flow on error
                  }
                  
                  window.open(
                    `/api/connectors/${connector.type}/authorize`,
                    `connect_${connector.type}`,
                    'width=600,height=700,popup=yes'
                  )
                }
              }}
            >
              <ConnectorIcon type={connector.type} size={20} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{connector.name}</div>
                <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                  @{connector.type}
                </div>
              </div>
              {connector.is_connected ? (
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(52, 199, 89, 0.15)', color: '#34C759' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  Connected
                </span>
              ) : (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Click to connect
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export { ConnectorIcon }
