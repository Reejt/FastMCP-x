'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Message, User, ChatSession, Workspace, WorkspaceInstruction, Chat } from '@/app/types'
import Sidebar from '@/app/components/Sidebar/Sidebar'
import WorkspaceSidebar from '@/app/components/WorkspaceSidebar'
import ChatContainer from '@/app/components/Chat/ChatContainer'
import ChatInput from '@/app/components/Chat/ChatInput'
import Breadcrumb from '@/app/components/Breadcrumb'

export default function DashboardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const workspaceId = searchParams.get('workspace')
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [chatSessions, setChatSessions] = useState<Record<string, ChatSession>>({})
  const [currentWorkspaceName, setCurrentWorkspaceName] = useState<string>('')
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
  const [workspaceChatSessions, setWorkspaceChatSessions] = useState<ChatSession[]>([])
  const [currentChatId, setCurrentChatId] = useState<string>('')
  const [isWorkspaceSidebarCollapsed, setIsWorkspaceSidebarCollapsed] = useState(false)
  const [shouldCollapseMainSidebar, setShouldCollapseMainSidebar] = useState(false)
  const [activeInstruction, setActiveInstruction] = useState<WorkspaceInstruction | null>(null)
  const [showInstructionBanner, setShowInstructionBanner] = useState(false)
  const [isGeneralChat, setIsGeneralChat] = useState(!workspaceId)

  // Load workspace sidebar collapse state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('workspace-sidebar-collapsed')
    if (saved !== null) {
      const collapsed = saved === 'true'
      setIsWorkspaceSidebarCollapsed(collapsed)
      setShouldCollapseMainSidebar(!collapsed)
    }
  }, [])

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user: authUser }, error } = await supabase.auth.getUser()

      if (error || !authUser) {
        router.push('/login')
        return
      }

      // Get user role from user metadata or default to 'user'
      const userRole = authUser.user_metadata?.role || 'user'

      setUser({
        id: authUser.id,
        email: authUser.email || 'Unknown',
        role: userRole
      })
      setLoading(false)
    }

    checkUser()
  }, [router, supabase])

  // Fetch active instruction for workspace
  useEffect(() => {
    if (!workspaceId) {
      setActiveInstruction(null)
      setShowInstructionBanner(false)
      return
    }

    const fetchActiveInstruction = async () => {
      try {
        const response = await fetch(`/api/instructions?workspaceId=${workspaceId}&activeOnly=true`)
        const data = await response.json()

        if (data.success && data.instructions && data.instructions.length > 0) {
          const instruction = data.instructions[0]
          setActiveInstruction(instruction)
          setShowInstructionBanner(true)
        } else {
          setActiveInstruction(null)
          setShowInstructionBanner(false)
        }
      } catch (error) {
        console.error('Error fetching active instruction:', error)
        setActiveInstruction(null)
        setShowInstructionBanner(false)
      }
    }

    fetchActiveInstruction()
  }, [workspaceId])

  // Load chat history - workspace chat or general chat
  useEffect(() => {
    if (workspaceId) {
      loadWorkspaceChat()
    } else if (user) {
      loadGeneralChat()
    }
  }, [workspaceId, user])

  const loadGeneralChat = async () => {
    // General chat is ephemeral - start with empty messages, no persistence
    const newSession: ChatSession = {
      id: 'general_chat',
      workspaceId: undefined,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
    setMessages([])
    setCurrentChatId(newSession.id)
    setChatSessions(prev => ({ ...prev, [newSession.id]: newSession }))
    setIsGeneralChat(true)
    setCurrentWorkspaceName('General Chat')
    setCurrentWorkspace(null)
    setWorkspaceChatSessions([])
    setActiveInstruction(null)
    setShowInstructionBanner(false)
  }

  const loadWorkspaceChat = async () => {
    if (!workspaceId || !user) {
      setMessages([])
      setCurrentWorkspaceName('')
      setCurrentWorkspace(null)
      setWorkspaceChatSessions([])
      return
    }

    try {
      // Load workspace from localStorage (for workspace metadata)
      const storedWorkspaces = localStorage.getItem('myWorkspaces')
      if (storedWorkspaces) {
        try {
          const workspaces = JSON.parse(storedWorkspaces)
          const workspace = workspaces.find((w: any) => w.id === workspaceId)
          if (workspace) {
            setCurrentWorkspaceName(workspace.name)
            setCurrentWorkspace({
              ...workspace,
              createdAt: new Date(workspace.createdAt),
              updatedAt: new Date(workspace.updatedAt)
            })
          }
        } catch (error) {
          console.error('Error loading workspace:', error)
        }
      }

      // Load chat messages from API
      const response = await fetch(`/api/chats?workspaceId=${workspaceId}`)
      if (!response.ok) {
        throw new Error('Failed to load chats')
      }

      const result = await response.json()
      const chats = result.chats || []
      
      // Convert Chat records to Message format
      const messages: Message[] = chats.map((chat: Chat) => ({
        id: chat.id,
        content: chat.message,
        role: chat.role,
        timestamp: new Date(chat.created_at)
      }))
      
      setMessages(messages)
      setIsGeneralChat(false)
      
      // Create a single session containing all messages for this workspace
      const sessionId = `${workspaceId}_main`
      setCurrentChatId(sessionId)
      setChatSessions(prev => ({
        ...prev,
        [sessionId]: {
          id: sessionId,
          workspaceId,
          messages,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }))
      
      // For sidebar, we'll show just this one session if it has messages
      if (messages.length > 0) {
        setWorkspaceChatSessions([{
          id: sessionId,
          workspaceId,
          messages,
          createdAt: new Date(),
          updatedAt: new Date()
        }])
      }
    } catch (error) {
      console.error('Error loading workspace data:', error)
      setMessages([])
    }
  }

  // Save chat messages
  useEffect(() => {
    const saveMessages = async () => {
      if (!user) return

      // General chat messages are not stored (ephemeral)
      // Workspace chats are saved to DB via API in handleSendMessage
    }

    saveMessages()
  }, [messages, isGeneralChat, user])

  const handleChatSelect = (chatId: string) => {
    const session = chatSessions[chatId]
    if (session) {
      setMessages(session.messages)
      setCurrentChatId(chatId)
    }
  }

  const handleNewChat = () => {
    if (!workspaceId) return

    // Clear messages - new chat starts empty
    // Chats are only persisted once the user sends a message
    setMessages([])
    const newSessionId = `${workspaceId}_main`
    setCurrentChatId(newSessionId)
  }

  const handleWorkspaceSidebarToggle = (isCollapsed: boolean) => {
    setIsWorkspaceSidebarCollapsed(isCollapsed)
    // Only collapse main sidebar when workspace sidebar is expanded (not collapsed)
    // When workspace sidebar is collapsed, don't force main sidebar (let it use its own state)
    setShouldCollapseMainSidebar(!isCollapsed)
  }

  const handleExpandWorkspaceSidebar = () => {
    setIsWorkspaceSidebarCollapsed(false)
    localStorage.setItem('workspace-sidebar-collapsed', 'false')
    setShouldCollapseMainSidebar(true)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isProcessing) return

    // Add user message to state
    const userMessage: Message = {
      id: Date.now().toString(),
      content,
      role: 'user',
      timestamp: new Date()
    }

    setMessages((prev) => [...prev, userMessage])
    setIsProcessing(true)

    // Save user message to database (only for workspace chats)
    if (workspaceId) {
      try {
        await fetch('/api/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            role: 'user',
            message: content
          })
        })
      } catch (error) {
        console.error('Error saving user message:', error)
      }
    }

    // Create a placeholder assistant message for streaming
    const assistantMessageId = (Date.now() + 1).toString()
    const assistantMessage: Message = {
      id: assistantMessageId,
      content: '',
      role: 'assistant',
      timestamp: new Date(),
      isStreaming: true
    }

    setMessages((prev) => [...prev, assistantMessage])

    try {
      // Prepare conversation history from existing messages (limit to last 2 messages for context)
      const conversation_history = messages.slice(-2).map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      // Call Next.js API route with streaming support
      const response = await fetch('/api/chat/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: content,
          conversation_history,
          workspace_id: workspaceId  // Pass workspace ID for instruction application
        }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`)
      }

      // Check if response is streaming (SSE)
      const contentType = response.headers.get('content-type')
      if (contentType?.includes('text/event-stream')) {
        // Handle streaming response
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let accumulatedContent = ''

        if (reader) {
          while (true) {
            const { done, value } = await reader.read()

            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split('\n')

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6))

                  if (data.chunk) {
                    // Append chunk to accumulated content
                    accumulatedContent += data.chunk

                    // Update the assistant message with new content
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? { ...msg, content: accumulatedContent, isStreaming: true }
                          : msg
                      )
                    )
                  } else if (data.done) {
                    // Streaming complete - save assistant response to database via API
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? { ...msg, isStreaming: false }
                          : msg
                      )
                    )
                    
                    // Save assistant message to database (only for workspace chats)
                    if (workspaceId) {
                      try {
                        await fetch('/api/chats', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            workspaceId,
                            role: 'assistant',
                            message: accumulatedContent
                          })
                        })
                      } catch (error) {
                        console.error('Error saving assistant message:', error)
                      }
                    }
                  } else if (data.error) {
                    throw new Error(data.error)
                  }
                } catch (parseError) {
                  console.error('Error parsing SSE data:', parseError)
                }
              }
            }
          }
        }
      } else {
        // Fallback for non-streaming responses
        const data = await response.json()

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: data.response, isStreaming: false }
              : msg
          )
        )
      }
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage: Message = {
        id: assistantMessageId,
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        role: 'assistant',
        timestamp: new Date(),
        isStreaming: false
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId ? errorMessage : msg
        )
      )
    } finally {
      setIsProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Main Sidebar */}
      <Sidebar
        user={user}
        onSignOutAction={handleSignOut}
        forceCollapse={shouldCollapseMainSidebar}
      />

      {/* Workspace Sidebar */}
      {workspaceId && currentWorkspace && (
        <WorkspaceSidebar
          workspace={currentWorkspace}
          chatSessions={workspaceChatSessions}
          currentChatId={currentChatId}
          onChatSelect={handleChatSelect}
          onNewChat={handleNewChat}
          onToggleSidebar={handleWorkspaceSidebarToggle}
        />
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Breadcrumb Navigation with Expand Button */}
        {workspaceId && currentWorkspace && (
          <div className="flex items-center gap-3 px-8 py-4 bg-gray-50">
            {isWorkspaceSidebarCollapsed && (
              <button
                onClick={handleExpandWorkspaceSidebar}
                className="p-2 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
                aria-label="Expand sidebar"
              >
                <svg className="w-5 h-5 text-gray-600" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M14 2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h12zM2 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2H2z" />
                  <path d="M3 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4z" />
                </svg>
              </button>
            )}
            <nav className="flex items-center gap-2 text-sm text-gray-600">
              <button
                onClick={() => router.push('/workspaces')}
                className="hover:text-gray-900 transition-colors"
              >
                Workspaces
              </button>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-gray-900 font-medium">{currentWorkspace.name || 'Workspace'}</span>
            </nav>
          </div>
        )}

        {/* Active Instruction Banner */}
        {showInstructionBanner && activeInstruction && (
          <div className="mx-8 mt-2 mb-0 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 flex-1">
                <svg className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-indigo-900 mb-1">
                    Active Instruction: {activeInstruction.title}
                  </h4>
                  <p className="text-xs text-indigo-700 line-clamp-2">
                    {activeInstruction.instructions}
                  </p>
                  <button
                    onClick={() => router.push(`/instructions?workspaceId=${workspaceId}`)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium mt-1 inline-flex items-center gap-1"
                  >
                    View/Edit Instructions
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
              <button
                onClick={() => setShowInstructionBanner(false)}
                className="text-indigo-400 hover:text-indigo-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Chat Messages */}
        <ChatContainer messages={messages} workspaceName={currentWorkspaceName} activeInstruction={activeInstruction} />

        {/* Chat Input */}
        <ChatInput
          onSendMessage={handleSendMessage}
          disabled={isProcessing}
          hasMessages={messages.length > 0}
          workspaceName={currentWorkspaceName}
        />
      </div>
    </div>
  )
}
