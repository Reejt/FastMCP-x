'use client'

import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { Message, User, ChatSession, Workspace } from '@/app/types'
import Sidebar from '@/app/components/Sidebar/Sidebar'

// Dynamic imports for heavy components
const WorkspaceSidebar = dynamic(() => import('@/app/components/WorkspaceSidebar'), {
  loading: () => <div className="w-64 h-screen bg-gray-50 animate-pulse" />,
  ssr: false
})
const ChatContainer = dynamic(() => import('@/app/components/Chat/ChatContainer'), {
  loading: () => <div className="flex-1 bg-white" />,
  ssr: false
})
const ChatInput = dynamic(() => import('@/app/components/Chat/ChatInput'), {
  loading: () => <div className="h-16 bg-white border-t" />,
  ssr: false
})

export default function WorkspacePage() {
  const router = useRouter()
  const params = useParams()
  const workspaceId = params?.id as string
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [chatSessions, setChatSessions] = useState<Record<string, ChatSession>>({})
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
  const [workspaceChatSessions, setWorkspaceChatSessions] = useState<ChatSession[]>([])
  const [currentChatId, setCurrentChatId] = useState<string>('')
  const [isWorkspaceSidebarCollapsed, setIsWorkspaceSidebarCollapsed] = useState(false)
  const [shouldCollapseMainSidebar, setShouldCollapseMainSidebar] = useState(false)

  // Load workspace sidebar collapse state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('workspace-sidebar-collapsed')
    if (saved !== null) {
      const collapsed = saved === 'true'
      setIsWorkspaceSidebarCollapsed(collapsed)
      setShouldCollapseMainSidebar(!collapsed)
    } else {
      // Default: workspace sidebar expanded, main sidebar collapsed
      setIsWorkspaceSidebarCollapsed(false)
      setShouldCollapseMainSidebar(true)
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

  // Load workspace and chat sessions
  useEffect(() => {
    if (!workspaceId) {
      console.log('No workspaceId provided')
      return
    }

    console.log('Loading workspace with ID:', workspaceId)

    const loadWorkspace = async () => {
      try {
        // Try to fetch from API first
        console.log('Fetching workspace from API...')
        const response = await fetch(`/api/workspaces?workspaceId=${workspaceId}`)
        const data = await response.json()

        console.log('API response:', data)

        if (data.success && data.workspace) {
          console.log('Workspace loaded from API:', data.workspace)
          setCurrentWorkspace({
            ...data.workspace,
            created_at: data.workspace.created_at,
            updated_at: data.workspace.updated_at
          })
        } else {
          // Fallback to localStorage
          console.log('API failed, trying localStorage fallback...')
          const storedWorkspaces = localStorage.getItem('myWorkspaces')
          if (storedWorkspaces) {
            const workspaces = JSON.parse(storedWorkspaces)
            console.log('All workspaces from localStorage:', workspaces)
            const workspace = workspaces.find((w: Workspace) => w.id === workspaceId)
            if (workspace) {
              console.log('Workspace found in localStorage:', workspace)
              setCurrentWorkspace({
                ...workspace,
                created_at: workspace.createdAt || workspace.created_at,
                updated_at: workspace.updatedAt || workspace.updated_at
              })
            } else {
              console.error('Workspace not found in localStorage')
            }
          } else {
            console.error('No workspaces in localStorage')
          }
        }
      } catch (error) {
        console.error('Error loading workspace:', error)
      }
    }

    loadWorkspace()

    // Load all chat sessions for this workspace
    const allSessions: ChatSession[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(`chat_session_${workspaceId}_`)) {
        try {
          const session = JSON.parse(localStorage.getItem(key) || '')
          allSessions.push({
            ...session,
            createdAt: new Date(session.createdAt),
            updatedAt: new Date(session.updatedAt)
          })
        } catch (error) {
          console.error('Error loading session:', error)
        }
      }
    }
    setWorkspaceChatSessions(allSessions.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    ))

    // Load or create default chat session for this workspace
    const sessionKey = `chat_session_${workspaceId}_default`
    const storedSession = localStorage.getItem(sessionKey)

    if (storedSession) {
      try {
        const session: ChatSession = JSON.parse(storedSession)
        // Convert timestamp strings back to Date objects
        const messagesWithDates = session.messages.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
        setMessages(messagesWithDates)
        setCurrentChatId(session.id)
        setChatSessions(prev => ({
          ...prev,
          [session.id]: {
            ...session,
            messages: messagesWithDates
          }
        }))
      } catch (error) {
        console.error('Error loading chat session:', error)
        setMessages([])
      }
    } else {
      // Create new session
      const newSession: ChatSession = {
        id: `${workspaceId}_${Date.now()}`,
        workspaceId,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date()
      }
      setMessages([])
      setCurrentChatId(newSession.id)
      setChatSessions(prev => ({ ...prev, [newSession.id]: newSession }))
    }
  }, [workspaceId])

  // Save chat session whenever messages change
  useEffect(() => {
    if (workspaceId && currentChatId && messages.length > 0) {
      const sessionKey = `chat_session_${workspaceId}_${currentChatId.split('_').pop()}`
      const session: ChatSession = {
        id: currentChatId,
        workspaceId,
        messages,
        createdAt: chatSessions[currentChatId]?.createdAt || new Date(),
        updatedAt: new Date()
      }
      localStorage.setItem(sessionKey, JSON.stringify(session))
      setChatSessions(prev => ({ ...prev, [currentChatId]: session }))

      // Update workspace chat sessions list
      setWorkspaceChatSessions(prev => {
        const filtered = prev.filter(s => s.id !== currentChatId)
        return [session, ...filtered].sort((a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, workspaceId, currentChatId])

  const handleChatSelect = (chatId: string) => {
    const session = chatSessions[chatId]
    if (session) {
      setMessages(session.messages)
      setCurrentChatId(chatId)
    }
  }

  const handleNewChat = () => {
    if (!workspaceId) return

    const newSession: ChatSession = {
      id: `${workspaceId}_${Date.now()}`,
      workspaceId,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
    setMessages([])
    setCurrentChatId(newSession.id)
    setChatSessions(prev => ({ ...prev, [newSession.id]: newSession }))
  }

  const handleWorkspaceSidebarToggle = (isCollapsed: boolean) => {
    setIsWorkspaceSidebarCollapsed(isCollapsed)
    // Only collapse main sidebar when workspace sidebar is expanded (not collapsed)
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

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      content,
      role: 'user',
      timestamp: new Date()
    }

    setMessages((prev) => [...prev, userMessage])
    setIsProcessing(true)

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
      // Prepare conversation history from existing messages (limit to last 10 messages for context)
      const conversation_history = messages.slice(-10).map(msg => ({
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
          conversation_history
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
                    // Streaming complete
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? { ...msg, isStreaming: false }
                          : msg
                      )
                    )
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
      />

      {/* Workspace Sidebar */}
      {currentWorkspace && (
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
        {currentWorkspace && (
          <div className="flex items-center gap-3 px-8 py-4 bg-gray-50 border-b border-gray-200">
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
              <span className="text-gray-600">{currentWorkspace.name}</span>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-gray-900 font-medium">
                {chatSessions[currentChatId]?.messages[0]?.content
                  ? chatSessions[currentChatId].messages[0].content.slice(0, 30) + (chatSessions[currentChatId].messages[0].content.length > 30 ? '...' : '')
                  : 'New Chat'}
              </span>
            </nav>
          </div>
        )}

        {/* Chat Messages */}
        <ChatContainer
          messages={messages}
          workspaceName={currentWorkspace?.name || ''}
        />

        {/* Chat Input */}
        <ChatInput
          onSendMessage={handleSendMessage}
          disabled={isProcessing}
          hasMessages={messages.length > 0}
          workspaceName={currentWorkspace?.name || ''}
        />
      </div>
    </div>
  )
}
