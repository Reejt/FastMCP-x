/**
 * Tests for ChatInput component
 * 
 * Tests the chat input functionality including:
 * - Text input handling
 * - Form submission
 * - Keyboard shortcuts (Enter to send)
 * - Disabled state
 * - File attachment button
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import ChatInput from './ChatInput'

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    form: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <form {...props}>{children}</form>
    ),
  },
}))

describe('ChatInput', () => {
  const mockOnSendMessage = jest.fn()

  beforeEach(() => {
    mockOnSendMessage.mockClear()
  })

  describe('Rendering', () => {
    it('renders input field', () => {
      render(<ChatInput onSendMessage={mockOnSendMessage} />)
      
      const input = screen.getByRole('textbox')
      expect(input).toBeInTheDocument()
    })

    it('renders send button', () => {
      render(<ChatInput onSendMessage={mockOnSendMessage} />)
      
      const sendButton = screen.getByRole('button', { name: /send/i })
      expect(sendButton).toBeInTheDocument()
    })

    it('renders attachment button', () => {
      render(<ChatInput onSendMessage={mockOnSendMessage} />)
      
      const attachButton = screen.getByRole('button', { name: /attach/i })
      expect(attachButton).toBeInTheDocument()
    })

    it('shows default placeholder', () => {
      render(<ChatInput onSendMessage={mockOnSendMessage} />)
      
      const input = screen.getByPlaceholderText('Ask anything')
      expect(input).toBeInTheDocument()
    })

    it('shows workspace-specific placeholder when workspaceName provided', () => {
      render(<ChatInput onSendMessage={mockOnSendMessage} workspaceName="My Project" />)
      
      const input = screen.getByPlaceholderText('Ask anything about this workspace')
      expect(input).toBeInTheDocument()
    })
  })

  describe('Message Submission', () => {
    it('calls onSendMessage with input value on form submit', async () => {
      const user = userEvent.setup()
      render(<ChatInput onSendMessage={mockOnSendMessage} />)
      
      const input = screen.getByRole('textbox')
      await user.type(input, 'Hello world')
      
      const sendButton = screen.getByRole('button', { name: /send/i })
      await user.click(sendButton)
      
      expect(mockOnSendMessage).toHaveBeenCalledWith('Hello world', undefined)
    })

    it('clears input after submission', async () => {
      const user = userEvent.setup()
      render(<ChatInput onSendMessage={mockOnSendMessage} />)
      
      const input = screen.getByRole('textbox') as HTMLTextAreaElement
      await user.type(input, 'Test message')
      
      const sendButton = screen.getByRole('button', { name: /send/i })
      await user.click(sendButton)
      
      expect(input.value).toBe('')
    })

    it('does not submit empty messages', async () => {
      const user = userEvent.setup()
      render(<ChatInput onSendMessage={mockOnSendMessage} />)
      
      const sendButton = screen.getByRole('button', { name: /send/i })
      await user.click(sendButton)
      
      expect(mockOnSendMessage).not.toHaveBeenCalled()
    })

    it('does not submit whitespace-only messages', async () => {
      const user = userEvent.setup()
      render(<ChatInput onSendMessage={mockOnSendMessage} />)
      
      const input = screen.getByRole('textbox')
      await user.type(input, '   ')
      
      const sendButton = screen.getByRole('button', { name: /send/i })
      await user.click(sendButton)
      
      expect(mockOnSendMessage).not.toHaveBeenCalled()
    })
  })

  describe('Keyboard Shortcuts', () => {
    it('submits on Enter key press', async () => {
      const user = userEvent.setup()
      render(<ChatInput onSendMessage={mockOnSendMessage} />)
      
      const input = screen.getByRole('textbox')
      await user.type(input, 'Enter key test')
      await user.keyboard('{Enter}')
      
      expect(mockOnSendMessage).toHaveBeenCalledWith('Enter key test', undefined)
    })

    it('does not submit on Shift+Enter (allows newline)', async () => {
      const user = userEvent.setup()
      render(<ChatInput onSendMessage={mockOnSendMessage} />)
      
      const input = screen.getByRole('textbox')
      await user.type(input, 'Line 1')
      await user.keyboard('{Shift>}{Enter}{/Shift}')
      
      // Should not have submitted yet
      expect(mockOnSendMessage).not.toHaveBeenCalled()
    })
  })

  describe('Disabled State', () => {
    it('does not submit when disabled', async () => {
      const user = userEvent.setup()
      render(<ChatInput onSendMessage={mockOnSendMessage} disabled={true} />)
      
      const input = screen.getByRole('textbox')
      await user.type(input, 'Disabled test')
      
      const sendButton = screen.getByRole('button', { name: /send/i })
      await user.click(sendButton)
      
      expect(mockOnSendMessage).not.toHaveBeenCalled()
    })
  })

  describe('Accessibility', () => {
    it('has accessible attachment button', () => {
      render(<ChatInput onSendMessage={mockOnSendMessage} />)
      
      const attachButton = screen.getByLabelText('Attach file')
      expect(attachButton).toBeInTheDocument()
    })

    it('has accessible send button', () => {
      render(<ChatInput onSendMessage={mockOnSendMessage} />)
      
      const sendButton = screen.getByLabelText('Send message')
      expect(sendButton).toBeInTheDocument()
    })
  })
})
