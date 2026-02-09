'use client'

import { ConnectorIcon } from '../Chat/ConnectorMention'

interface ConnectorStatusProps {
  isConnected: boolean
  size?: 'sm' | 'md'
}

/**
 * Connection status indicator dot
 */
export default function ConnectorStatus({ isConnected, size = 'sm' }: ConnectorStatusProps) {
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5'

  return (
    <span
      className={`inline-block rounded-full ${dotSize}`}
      style={{
        backgroundColor: isConnected ? '#34C759' : 'var(--text-muted)',
      }}
      title={isConnected ? 'Connected' : 'Not connected'}
    />
  )
}

export { ConnectorIcon }
