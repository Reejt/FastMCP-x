'use client'

import { ConnectorIcon } from './ConnectorMention'

interface ConnectorAuthPromptProps {
  connector: string
  connectorName: string
  authUrl: string
  query?: string                         // Original query to retry after auth
  userId?: string                        // User ID for retrying query
  onConnected?: () => void               // Callback when auth completes successfully
  onRetryQuery?: (query: string) => void // Callback to retry the original query
}

/**
 * Inline prompt shown in chat when user tries to query a connector
 * they haven't connected yet. Shows a "Connect Now" button that
 * opens the OAuth popup flow.
 * 
 * After successful auth, optionally retries the original query.
 */
export default function ConnectorAuthPrompt({
  connector,
  connectorName,
  authUrl,
  query,
  userId,
  onConnected,
  onRetryQuery,
}: ConnectorAuthPromptProps) {
  const handleConnect = () => {
    const popup = window.open(
      authUrl,
      `connect_${connector}`,
      'width=600,height=700,popup=yes'
    )

    // Poll for popup close
    const checkPopup = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkPopup)
        console.log(`✅ Auth popup closed for ${connector}`)
        
        // Wait a moment for token to be saved, then retry query if available
        setTimeout(() => {
          if (query && onRetryQuery) {
            console.log(`🔄 Retrying query after successful ${connector} auth`)
            onRetryQuery(query)
          } else {
            onConnected?.()
          }
        }, 1000)
      }
    }, 500)
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl my-2"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <ConnectorIcon type={connector} size={24} />
      <div className="flex-1">
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
          You&apos;re not connected to {connectorName}.
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Connect to search and query your {connectorName} data.
        </p>
      </div>
      <button
        onClick={handleConnect}
        className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
        style={{
          backgroundColor: 'var(--accent-primary)',
          color: 'var(--text-inverse)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
      >
        Connect Now
      </button>
    </div>
  )
}
