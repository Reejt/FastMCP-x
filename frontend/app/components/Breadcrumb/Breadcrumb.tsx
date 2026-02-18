'use client'

import { useRouter } from 'next/navigation'

interface BreadcrumbItem {
  label: string
  href?: string
  isExpandButton?: boolean
  onExpand?: () => void
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  const router = useRouter()

  return (
    <nav className="flex items-center gap-2 px-8 py-4 text-sm" style={{ backgroundColor: 'var(--bg-elevated)' }}>
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          {item.isExpandButton ? (
            <button
              onClick={() => item.onExpand?.()}
              className="transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
            >
              {item.label}
            </button>
          ) : item.href ? (
            <button
              onClick={() => router.push(item.href!)}
              className="transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
            >
              {item.label}
            </button>
          ) : (
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{item.label}</span>
          )}
          {index < items.length - 1 && (
            <svg className="w-4 h-4" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </div>
      ))}
    </nav>
  )
}
