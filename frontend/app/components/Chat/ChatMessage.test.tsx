/**
 * Tests for ChatMessage component
 * 
 * Tests individual chat message rendering including:
 * - User vs assistant message styling
 * - Markdown content rendering
 * - Streaming indicator
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import ChatMessage from './ChatMessage'
import { Message } from '@/app/types'

// Mock ReactMarkdown to avoid complex rendering in tests
jest.mock('react-markdown', () => {
  return ({ children }: { children: string }) => <div>{children}</div>
})

jest.mock('remark-gfm', () => ({}))

describe('ChatMessage', () => {
  describe('User Messages', () => {
    const userMessage: Message = {
      id: '1',
      role: 'user',
      content: 'Hello, this is a user message',
      timestamp: new Date(),
    }

    it('renders user message content', () => {
      render(<ChatMessage message={userMessage} />)
      
      expect(screen.getByText('Hello, this is a user message')).toBeInTheDocument()
    })

    it('aligns user messages to the right', () => {
      const { container } = render(<ChatMessage message={userMessage} />)
      
      const messageWrapper = container.querySelector('.justify-end')
      expect(messageWrapper).toBeInTheDocument()
    })

    it('renders user messages with white background bubble', () => {
      const { container } = render(<ChatMessage message={userMessage} />)
      
      const bubble = container.querySelector('.bg-white')
      expect(bubble).toBeInTheDocument()
    })
  })

  describe('Assistant Messages', () => {
    const assistantMessage: Message = {
      id: '2',
      role: 'assistant',
      content: 'Hello, this is an assistant response',
      timestamp: new Date(),
    }

    it('renders assistant message content', () => {
      render(<ChatMessage message={assistantMessage} />)
      
      expect(screen.getByText('Hello, this is an assistant response')).toBeInTheDocument()
    })

    it('aligns assistant messages to the left', () => {
      const { container } = render(<ChatMessage message={assistantMessage} />)
      
      const messageWrapper = container.querySelector('.justify-start')
      expect(messageWrapper).toBeInTheDocument()
    })
  })

  describe('Markdown Rendering', () => {
    it('renders markdown content', () => {
      const markdownMessage: Message = {
        id: '3',
        role: 'assistant',
        content: 'This has **bold** text',
        timestamp: new Date(),
      }
      
      render(<ChatMessage message={markdownMessage} />)
      
      // With mocked ReactMarkdown, it just renders the raw content
      expect(screen.getByText('This has **bold** text')).toBeInTheDocument()
    })

    it('renders list content', () => {
      const listMessage: Message = {
        id: '4',
        role: 'assistant',
        content: '- Item 1\n- Item 2\n- Item 3',
        timestamp: new Date(),
      }
      
      render(<ChatMessage message={listMessage} />)
      
      // With mocked ReactMarkdown, raw content is rendered
      expect(screen.getByText('- Item 1\n- Item 2\n- Item 3')).toBeInTheDocument()
    })

    it('renders code content', () => {
      const codeMessage: Message = {
        id: '5',
        role: 'assistant',
        content: 'Here is some `inline code`',
        timestamp: new Date(),
      }
      
      render(<ChatMessage message={codeMessage} />)
      
      // With mocked ReactMarkdown, raw content is rendered
      expect(screen.getByText('Here is some `inline code`')).toBeInTheDocument()
    })
  })

  describe('Streaming Indicator', () => {
    it('shows streaming indicator when message is streaming', () => {
      const streamingMessage: Message = {
        id: '6',
        role: 'assistant',
        content: 'Generating response...',
        timestamp: new Date(),
        isStreaming: true,
      }
      
      const { container } = render(<ChatMessage message={streamingMessage} />)
      
      // Check for the pulsing indicator
      const pulseIndicator = container.querySelector('.animate-pulse')
      expect(pulseIndicator).toBeInTheDocument()
    })

    it('hides streaming indicator when message is complete', () => {
      const completeMessage: Message = {
        id: '7',
        role: 'assistant',
        content: 'Complete response',
        timestamp: new Date(),
        isStreaming: false,
      }
      
      const { container } = render(<ChatMessage message={completeMessage} />)
      
      const pulseIndicator = container.querySelector('.animate-pulse')
      expect(pulseIndicator).not.toBeInTheDocument()
    })
  })
})
