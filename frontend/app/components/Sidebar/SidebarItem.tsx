'use client'

import { ReactNode } from 'react'
import { motion } from 'framer-motion'

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
        ${isActive
          ? 'bg-gray-200'
          : 'hover:bg-gray-100'
        }
        ${className}
      `}
      style={{ color: '#060606' }}
      aria-label={typeof label === 'string' ? label : undefined}
      aria-current={isActive ? 'page' : undefined}
      role="button"
      tabIndex={0}
    >
      {/* Icon Container - Fixed position */}
      <div className="flex-shrink-0 w-5 h-5">
        <div className={`w-5 h-5 group-hover:text-gray-900`} style={{ color: '#060606' }}>
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
          className="ml-auto bg-indigo-100 text-indigo-700 text-xs font-semibold px-2 py-0.5 rounded-full"
        >
          {badge}
        </motion.span>
      )}

      {/* Tooltip for collapsed state */}
      {isCollapsed && (
        <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none">
          {label}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
        </div>
      )}
    </button>
  )
}
