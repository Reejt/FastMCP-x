'use client'

import { useState, useEffect, useCallback } from 'react'
import ConnectorCard from './ConnectorCard'
import type { ConnectorInfo } from '../Chat/ConnectorMention'

interface ConnectorGridProps {
  userId: string
}

/**
 * Grid layout of all connectors with connect/disconnect functionality.
 * Can be used in sidebar section or settings page.
 */
export default function ConnectorGrid({ userId }: ConnectorGridProps) {
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchConnectors = useCallback(async () => {
    try {
      const resp = await fetch('/api/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      const data = await resp.json()
      setConnectors(data.connectors || [])
    } catch (err) {
      console.error('Failed to fetch connectors:', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchConnectors()
  }, [fetchConnectors])

  // Listen for connector connection events from OAuth popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'connector_connected') {
        fetchConnectors()
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [fetchConnectors])

  const handleConnect = async (type: string) => {
    // Check if token already exists before opening authorize endpoint
    try {
      const tokenCheckResponse = await fetch(`/api/connectors/${type}/check-token`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })
      
      const tokenData = await tokenCheckResponse.json()
      
      // Skip authorize endpoint if token already exists
      if (tokenData.has_token) {
        console.log(`✅ Token already exists for ${type}, skipping authorize endpoint`)
        return
      }
    } catch (err) {
      console.warn(`Failed to check token status for ${type}:`, err)
      // Continue with authorize flow on error
    }
    
    const popup = window.open(
      `/api/connectors/${type}/authorize`,
      `connect_${type}`,
      'width=600,height=700,popup=yes'
    )

    // Poll for popup close then refresh
    const checkPopup = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkPopup)
        fetchConnectors()
      }
    }, 500)
  }

  const handleDisconnect = async (type: string) => {
    setActionLoading(type)
    try {
      const resp = await fetch(`/api/connectors/${type}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })

      if (resp.ok) {
        await fetchConnectors()
      }
    } catch (err) {
      console.error(`Failed to disconnect ${type}:`, err)
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
        Loading connectors...
      </div>
    )
  }

  if (connectors.length === 0) {
    return (
      <div className="p-4 text-sm" style={{ color: 'var(--text-muted)' }}>
        No connectors available.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <svg className="w-4 h-4" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Connections
        </h3>
        <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
          {connectors.filter((c) => c.is_connected).length}/{connectors.length}
        </span>
      </div>

      <div className="grid gap-2">
        {connectors.map((connector) => (
          <ConnectorCard
            key={connector.type}
            connector={connector}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            loading={actionLoading === connector.type}
          />
        ))}
      </div>
    </div>
  )
}
