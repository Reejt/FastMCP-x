'use client'

import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { Message, User, ChatSession, Workspace } from '@/app/types'
import Sidebar from '@/app/components/Sidebar/Sidebar'

// Dynamic imports for heavy components
const WorkspaceSidebar = dynamic(() => import('@/app/components/WorkspaceSidebar'), {
  loading: () => <div className="w-64 h-screen bg-[#0d0d0d] animate-pulse" />,
  ssr: false
})
const ChatContainer = dynamic(() => import('@/app/components/Chat/ChatContainer'), {
  loading: () => <div className="flex-1 bg-[#1a1a1a]" />,
  ssr: false
})
const ChatInput = dynamic(() => import('@/app/components/Chat/ChatInput'), {
  loading: () => <div className="h-16 bg-[#1a1a1a] border-t border-[#2a2a2a]" />,
  ssr: false
})
const WorkspaceIntroduction = dynamic(() => import('@/app/components/WorkspaceIntroduction/WorkspaceIntroduction'), {
  loading: () => <div className="flex-1 bg-[#1a1a1a]" />,
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
        console.log('Fetching workspace from API...')
        const response = await fetch(`/api/workspaces?workspaceId=${workspaceId}`)

        if (!response.ok) {
          throw new Error(`Failed to fetch workspace: ${response.statusText}`)
        }

        const data = await response.json()
        console.log('API response:', data)

        if (data.success && data.workspace) {
          console.log('Workspace loaded successfully:', data.workspace)
          setCurrentWorkspace(data.workspace)
        } else {
          console.error('Failed to load workspace:', data.error || 'Unknown error')
          // Optionally redirect to workspaces list if workspace not found
          router.push('/workspaces')
        }
      } catch (error) {
        console.error('Error loading workspace:', error)
        // Optionally redirect to workspaces list on error
        router.push('/workspaces')
      }
    }

    const loadChatsFromSupabase = async () => {
      try {
        console.log('Fetching chats from Supabase...')
        const response = await fetch(`/api/chats?workspaceId=${workspaceId}`)
        
        if (!response.ok) {
          throw new Error(`Failed to fetch chats: ${response.statusText}`)
        }
        
        const data = await response.json()
        
        if (data.success && data.chats) {
          // Convert Supabase Chat objects to Message objects
          const loadedMessages: Message[] = data.chats.map((chat: { id: string; role: string; message: string; created_at: string }) => ({
            id: chat.id,
            content: chat.message,
            role: chat.role as 'user' | 'assistant',
            timestamp: new Date(chat.created_at),
            isStreaming: false
          }))
          
          // Create a session for this workspace's chat history (but don't load messages yet)
          if (loadedMessages.length > 0) {
            const session: ChatSession = {
              id: `${workspaceId}_main`,
              workspaceId,
              messages: loadedMessages,
              createdAt: new Date(data.chats[0].created_at),
              updatedAt: new Date(data.chats[data.chats.length - 1].created_at)
            }
            // Store the session but DON'T set messages - user must click to view
            setChatSessions({ [session.id]: session })
            setWorkspaceChatSessions([session])
            // Keep messages empty initially - show only chat list
            setMessages([])
            setCurrentChatId('')
          } else {
            // No existing chats
            setMessages([])
            setCurrentChatId('')
            setChatSessions({})
            setWorkspaceChatSessions([])
          }
        }
      } catch (error) {
        console.error('Error loading chats from Supabase:', error)
        setMessages([])
      }
    }

    loadWorkspace()
    loadChatsFromSupabase()
  }, [workspaceId, router])

  // Update local session state when messages change (no localStorage, Supabase handles persistence)
  useEffect(() => {
    if (workspaceId && currentChatId && messages.length > 0) {
      const session: ChatSession = {
        id: currentChatId,
        workspaceId,
        messages,
        createdAt: chatSessions[currentChatId]?.createdAt || new Date(),
        updatedAt: new Date()
      }
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
    // First check the chatSessions record
    let session: ChatSession | undefined = chatSessions[chatId]
    
    // If not found, look in workspaceChatSessions array
    if (!session) {
      session = workspaceChatSessions.find(s => s.id === chatId)
    }
    
    if (session) {
      // Convert timestamp strings back to Date objects if needed
      const messagesWithDates = session.messages.map(msg => ({
        ...msg,
        timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp)
      }))
      setMessages(messagesWithDates)
      setCurrentChatId(chatId)
      // Also add to chatSessions record for future lookups
      setChatSessions(prev => ({
        ...prev,
        [chatId]: {
          ...session,
          messages: messagesWithDates
        }
      }))
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

  // Helper function to save a message to Supabase
  const saveMessageToSupabase = async (role: string, message: string) => {
    try {
      await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          role,
          message
        })
      })
    } catch (error) {
      console.error('Error saving message to Supabase:', error)
    }
  }

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isProcessing) return

    // If no current chat session, create one for this new conversation
    if (!currentChatId) {
      const newChatId = `${workspaceId}_${Date.now()}`
      setCurrentChatId(newChatId)
    }

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      content,
      role: 'user',
      timestamp: new Date()
    }

    setMessages((prev) => [...prev, userMessage])
    setIsProcessing(true)

    // Save user message to Supabase
    await saveMessageToSupabase('user', content)

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
          conversation_history,
          workspace_id: workspaceId
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
                const jsonStr = line.slice(6)
                if (!jsonStr.trim()) continue // Skip empty lines
                
                try {
                  const data = JSON.parse(jsonStr)

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
                    // Streaming complete - save assistant response to Supabase
                    if (accumulatedContent) {
                      saveMessageToSupabase('assistant', accumulatedContent)
                    }
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
                  // Log invalid SSE data for debugging
                  if (jsonStr.startsWith('<')) {
                    // HTML response (likely an error page)
                    console.error('Received HTML instead of JSON. This indicates a server error.')
                    throw new Error('Server returned HTML error page. Check server logs.')
                  } else {
                    console.error('Error parsing SSE data:', parseError, 'Raw data:', jsonStr)
                  }
                }
              }
            }
          }
        }
      } else {
        // Fallback for non-streaming responses
        const data = await response.json()

        // Save assistant response to Supabase
        if (data.response) {
          await saveMessageToSupabase('assistant', data.response)
        }

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
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="text-[#888]">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  // Show loading state while workspace is being fetched
  if (!currentWorkspace) {
    return (
      <div className="flex h-screen bg-[#0d0d0d] overflow-hidden">
        <Sidebar
          user={user}
          onSignOutAction={handleSignOut}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[#888]">Loading workspace...</div>
        </div>
      </div>
    )
  }

  // Always render the main layout with WorkspaceIntroduction component
  // It will handle showing introduction or chat history based on messages
  return (
    <div className="flex h-screen bg-[#1a1a1a] overflow-hidden">
      {/* Main Sidebar */}
      <Sidebar
        user={user}
        onSignOutAction={handleSignOut}
      />

      {/* Workspace Sidebar */}
      <WorkspaceSidebar
        workspace={currentWorkspace}
        chatSessions={workspaceChatSessions}
        currentChatId={currentChatId}
        onChatSelect={handleChatSelect}
        onNewChat={handleNewChat}
        onToggleSidebar={handleWorkspaceSidebarToggle}
      />

      {/* Main Content Area - Workspace Introduction Page takes full remaining width */}
      <div className="flex-1 flex overflow-hidden">
        <WorkspaceIntroduction
          workspace={currentWorkspace}
          messages={messages}
          isProcessing={isProcessing}
          onSendMessage={handleSendMessage}
          isWorkspaceSidebarCollapsed={isWorkspaceSidebarCollapsed}
          onExpandWorkspaceSidebar={handleExpandWorkspaceSidebar}
          chatSessions={workspaceChatSessions}
          onChatSelect={handleChatSelect}
        />
      </div>
    </div>
  )
}
