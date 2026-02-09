'use client'

import { useState } from 'react'
import { ConnectorIcon } from '../Chat/ConnectorMention'
import ConnectorStatus from './ConnectorStatus'
import type { ConnectorInfo } from '../Chat/ConnectorMention'

interface ConnectorCardProps {
  connector: ConnectorInfo
  onConnect: (type: string) => void
  onDisconnect: (type: string) => void
  loading?: boolean
}

/**
 * Individual connector card with connect/disconnect toggle
 */
export default function ConnectorCard({
  connector,
  onConnect,
  onDisconnect,
  loading = false,
}: ConnectorCardProps) {
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState(false)

  const handleToggle = () => {
    if (connector.is_connected) {
      setShowConfirmDisconnect(true)
    } else {
      onConnect(connector.type)
    }
  }

  const handleConfirmDisconnect = () => {
    setShowConfirmDisconnect(false)
    onDisconnect(connector.type)
  }

  return (
    <div
      className="rounded-xl p-4 transition-colors"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <ConnectorIcon type={connector.type} size={28} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {connector.name}
            </h4>
            <ConnectorStatus isConnected={connector.is_connected} />
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {connector.description}
          </p>

          {connector.is_connected && connector.connected_at && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Connected {new Date(connector.connected_at).toLocaleDateString()}
            </p>
          )}
        </div>

        <div className="flex-shrink-0">
          {showConfirmDisconnect ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowConfirmDisconnect(false)}
                className="px-2 py-1 text-xs rounded-md transition-colors cursor-pointer"
                style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-hover)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDisconnect}
                disabled={loading}
                className="px-2 py-1 text-xs rounded-md transition-colors cursor-pointer disabled:opacity-50"
                style={{ color: '#FF3B30', backgroundColor: 'rgba(255, 59, 48, 0.1)' }}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={handleToggle}
              disabled={loading}
              className="px-3 py-1.5 text-xs rounded-lg font-medium transition-colors cursor-pointer disabled:opacity-50"
              style={
                connector.is_connected
                  ? { color: 'var(--text-secondary)', backgroundColor: 'var(--bg-hover)' }
                  : { color: 'var(--text-inverse)', backgroundColor: 'var(--accent-primary)' }
              }
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              {loading ? 'Loading...' : connector.is_connected ? 'Manage' : 'Connect'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
