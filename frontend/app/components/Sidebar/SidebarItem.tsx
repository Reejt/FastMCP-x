'use client'

import { ReactNode } from 'react'
import { motion } from 'framer-motion'

// Light theme colors
const theme = {
  bg: '#ffffff',
  cardBg: '#f5f5f5',
  border: '#e5e5e5',
  text: '#1a1a1a',
  textSecondary: '#666666',
  textMuted: '#999999',
  hoverBg: 'rgba(0,0,0,0.05)',
  activeBg: '#f0f0f0',
}

interface SidebarItemProps {
  icon: ReactNode
  label: React.ReactNode
  isActive?: boolean
  isCollapsed: boolean
  onClick?: (e: React.MouseEvent) => void
  badge?: number
  className?: string
}

export default function SidebarItem({
  icon,
  label,
  isActive = false,
  isCollapsed,
  onClick,
  badge,
  className = '',
}: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full group relative flex items-center transition-all duration-300 ease-in-out
        px-3 py-3 rounded-lg
        ${className}
      `}
      style={{
        backgroundColor: isActive ? theme.activeBg : 'transparent',
        color: isActive ? theme.text : theme.textSecondary,
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = theme.hoverBg
          e.currentTarget.style.color = theme.text
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'transparent'
          e.currentTarget.style.color = theme.textSecondary
        }
      }}
      aria-label={typeof label === 'string' ? label : undefined}
      aria-current={isActive ? 'page' : undefined}
      role="button"
      tabIndex={0}
    >
      {/* Icon Container - Fixed position */}
      <div className="flex-shrink-0 w-5 h-5">
        <div className="w-5 h-5">
          {icon}
        </div>
      </div>

      {/* Label with smooth fade animation - always starts 12px from icon */}
      <motion.span
        initial={false}
        animate={{
          opacity: isCollapsed ? 0 : 1,
          width: isCollapsed ? 0 : 'auto',
        }}
        transition={{
          duration: 0.3,
          ease: 'easeInOut',
        }}
        className={`
          font-medium whitespace-nowrap overflow-hidden ml-3
        `}
      >
        {label}
      </motion.span>

      {/* Badge */}
      {badge && !isCollapsed && (
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#16a34a' }}
        >
          {badge}
        </motion.span>
      )}

      {/* Tooltip for collapsed state */}
      {isCollapsed && (
        <div 
          className="absolute left-full ml-2 px-2 py-1 text-sm rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none shadow-lg"
          style={{ backgroundColor: theme.cardBg, color: theme.text, border: `1px solid ${theme.border}` }}
        >
          {label}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent" style={{ borderRightColor: theme.cardBg }} />
        </div>
      )}
    </button>
  )
}
