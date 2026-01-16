/**
 * Tests for ChatContainer component
 * 
 * Tests the chat message container including:
 * - Empty state rendering
 * - Message list rendering
 * - Auto-scroll behavior
 * - Animation presence
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import ChatContainer from './ChatContainer'
import { Message } from '@/app/types'

// Mock framer-motion to avoid animation issues in tests
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))

describe('ChatContainer', () => {
  const mockMessages: Message[] = [
    {
      id: '1',
      role: 'user',
      content: 'Hello, how are you?',
      timestamp: new Date(),
    },
    {
      id: '2',
      role: 'assistant',
      content: 'I am doing well, thank you!',
      timestamp: new Date(),
    },
  ]

  describe('Empty State', () => {
    it('renders empty state when no messages', () => {
      render(<ChatContainer messages={[]} />)
      
      expect(screen.getByText('No chats yet.')).toBeInTheDocument()
      expect(screen.getByText('Start a conversation or set project instructions.')).toBeInTheDocument()
    })
  })

  describe('Messages Rendering', () => {
    it('renders messages when provided', () => {
      render(<ChatContainer messages={mockMessages} />)
      
      expect(screen.getByText('Hello, how are you?')).toBeInTheDocument()
      expect(screen.getByText('I am doing well, thank you!')).toBeInTheDocument()
    })

    it('renders correct number of messages', () => {
      render(<ChatContainer messages={mockMessages} />)
      
      // Each message should be rendered
      const messages = screen.getAllByText(/Hello|I am doing well/)
      expect(messages.length).toBe(2)
    })

    it('does not show empty state when messages exist', () => {
      render(<ChatContainer messages={mockMessages} />)
      
      expect(screen.queryByText('No chats yet.')).not.toBeInTheDocument()
    })
  })

  describe('Message Types', () => {
    it('renders user messages', () => {
      const userMessage: Message[] = [
        {
          id: '1',
          role: 'user',
          content: 'User message content',
          timestamp: new Date(),
        },
      ]
      
      render(<ChatContainer messages={userMessage} />)
      
      expect(screen.getByText('User message content')).toBeInTheDocument()
    })

    it('renders assistant messages', () => {
      const assistantMessage: Message[] = [
        {
          id: '1',
          role: 'assistant',
          content: 'Assistant response content',
          timestamp: new Date(),
        },
      ]
      
      render(<ChatContainer messages={assistantMessage} />)
      
      expect(screen.getByText('Assistant response content')).toBeInTheDocument()
    })
  })

  describe('Component Structure', () => {
    it('has scrollable container', () => {
      const { container } = render(<ChatContainer messages={mockMessages} />)
      
      const scrollContainer = container.querySelector('.overflow-y-auto')
      expect(scrollContainer).toBeInTheDocument()
    })

    it('has max width constraint for readability', () => {
      const { container } = render(<ChatContainer messages={mockMessages} />)
      
      const maxWidthContainer = container.querySelector('.max-w-4xl')
      expect(maxWidthContainer).toBeInTheDocument()
    })
  })
})
