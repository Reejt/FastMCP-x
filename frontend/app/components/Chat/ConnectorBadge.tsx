'use client'

import { ConnectorIcon } from './ConnectorMention'

interface ConnectorBadgeProps {
  source: string
  sourceName?: string
}

/**
 * Source attribution badge shown on assistant messages
 * that used connector context (e.g., "via Google Drive")
 */
export default function ConnectorBadge({ source, sourceName }: ConnectorBadgeProps) {
  const displayName = sourceName || source

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs mt-2"
      style={{
        backgroundColor: 'var(--bg-hover)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <ConnectorIcon type={source} size={12} />
      <span>via {displayName}</span>
    </span>
  )
}
