'use client'

import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { flushSync } from 'react-dom'  // ✅ ADD THIS for immediate updates
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
  const [isStreaming, setIsStreaming] = useState(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [chatSessions, setChatSessions] = useState<Record<string, ChatSession>>({})
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
  const [workspaceChatSessions, setWorkspaceChatSessions] = useState<ChatSession[]>([])
  const [currentChatId, setCurrentChatId] = useState<string>('')
  const [currentSessionId, setCurrentSessionId] = useState<string>('')  // Session ID for DB persistence
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

    const loadSessionsFromAPI = async () => {
      try {
        console.log('Fetching chat sessions from API...')
        const response = await fetch(`/api/chats/sessions?workspaceId=${workspaceId}`)
        
        if (!response.ok) {
          throw new Error(`Failed to fetch sessions: ${response.statusText}`)
        }
        
        const data = await response.json()
        
        if (data.success && data.sessions) {
          console.log(`Loaded ${data.sessions.length} sessions`)
          
          // Convert API sessions to ChatSession type
          const sessions: ChatSession[] = data.sessions.map((s: any) => ({
            id: s.id,
            workspace_id: s.workspace_id,
            user_id: s.user_id,
            title: s.title,
            created_at: s.created_at,
            updated_at: s.updated_at,
            deleted_at: s.deleted_at,
            messages: []  // Messages loaded separately when session is selected
          }))
          
          setWorkspaceChatSessions(sessions)
          
          // Create sessions record for quick lookup
          const sessionsRecord: Record<string, ChatSession> = {}
          sessions.forEach(s => {
            sessionsRecord[s.id] = s
          })
          setChatSessions(sessionsRecord)
          
          // Keep messages empty initially - user must click to view
          setMessages([])
          setCurrentChatId('')
          setCurrentSessionId('')
        } else {
          // No existing sessions
          setMessages([])
          setCurrentChatId('')
          setCurrentSessionId('')
          setChatSessions({})
          setWorkspaceChatSessions([])
        }
      } catch (error) {
        console.error('Error loading sessions from API:', error)
        setMessages([])
      }
    }

    loadWorkspace()
    loadSessionsFromAPI()
  }, [workspaceId, router])

  const handleChatSelect = async (chatId: string) => {
    // chatId is actually sessionId from database
    setCurrentChatId(chatId)
    setCurrentSessionId(chatId)
    
    // Check if messages are already loaded in memory
    const session = chatSessions[chatId]
    if (session && session.messages && session.messages.length > 0) {
      // Messages already loaded, just display them
      setMessages(session.messages)
      return
    }
    
    // Load messages from API for this session
    try {
      const response = await fetch(`/api/chats/session?sessionId=${chatId}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch session messages: ${response.statusText}`)
      }
      
      const data = await response.json()
      
      if (data.success && data.messages) {
        // Messages are already in UI format (converted by API)
        setMessages(data.messages)
        
        // Update session in chatSessions record with loaded messages
        setChatSessions(prev => ({
          ...prev,
          [chatId]: {
            ...prev[chatId],
            messages: data.messages
          }
        }))
      }
    } catch (error) {
      console.error('Error loading session messages:', error)
      setMessages([])
    }
  }

  const handleCancelStreaming = () => {
    if (abortController) {
      try {
        abortController.abort()
      } catch (error) {
        // Ignore abort errors - they're expected
        console.log('Stream aborted by user')
      }
      setAbortController(null)
      setIsStreaming(false)
      setIsProcessing(false)
      
      // Update the last message to show it was cancelled
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1]
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          const updatedMessages = prev.map((msg) =>
            msg.id === lastMsg.id ? { ...msg, isStreaming: false } : msg
          )
          
          // Add system message to indicate cancellation
          const systemMessage: Message = {
            id: (Date.now() + 2).toString(),
            content: 'You stopped this response',
            role: 'system',
            timestamp: new Date(),
            isStreaming: false
          }
          
          return [...updatedMessages, systemMessage]
        }
        return prev
      })
    }
  }

  const handleNewChat = async (): Promise<string | null> => {
    if (!workspaceId) return null

    try {
      // Create new session on server
      const response = await fetch('/api/chats/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          title: 'New Chat'
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to create session')
      }
      
      const data = await response.json()
      
      if (data.success && data.session) {
        const newSession: ChatSession = {
          id: data.session.id,
          workspace_id: data.session.workspace_id,
          user_id: data.session.user_id,
          title: data.session.title,
          created_at: data.session.created_at,
          updated_at: data.session.updated_at,
          deleted_at: data.session.deleted_at,
          messages: []
        }
        
        setMessages([])
        setCurrentChatId(newSession.id)
        setCurrentSessionId(newSession.id)
        setChatSessions(prev => ({ ...prev, [newSession.id]: newSession }))
        setWorkspaceChatSessions(prev => [newSession, ...prev])
        
        return newSession.id  // Return the session ID
      }
      return null
    } catch (error) {
      console.error('Error creating new chat session:', error)
      return null
    }
  }

  const handleWorkspaceSidebarToggle = (isCollapsed: boolean) => {
    setIsWorkspaceSidebarCollapsed(isCollapsed)
    // Only collapse main sidebar when workspace sidebar is expanded (not collapsed)
    setShouldCollapseMainSidebar(!isCollapsed)
  }

  const handleSessionRename = (sessionId: string, newTitle: string) => {
    // Update workspaceChatSessions state immediately
    setWorkspaceChatSessions(prev => 
      prev.map(session => 
        session.id === sessionId ? { ...session, title: newTitle } : session
      )
    )
    
    // Also update chatSessions record if it exists
    setChatSessions(prev => ({
      ...prev,
      [sessionId]: prev[sessionId] ? { ...prev[sessionId], title: newTitle } : prev[sessionId]
    }))
  }

  const handleSessionDelete = (sessionId: string) => {
    // Remove deleted session from workspaceChatSessions immediately
    setWorkspaceChatSessions(prev => 
      prev.filter(session => session.id !== sessionId)
    )
    
    // Remove from chatSessions record
    setChatSessions(prev => {
      const updated = { ...prev }
      delete updated[sessionId]
      return updated
    })
    
    // Clear messages and chat state if deleted session was active
    if (currentChatId === sessionId) {
      setMessages([])
      setCurrentChatId('')
      setCurrentSessionId('')
    }
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
  const saveMessageToSupabase = async (sessionId: string, role: string, message: string) => {
    if (!sessionId) {
      console.error('Cannot save message: no session ID provided')
      return
    }
    
    try {
      await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId,
          workspaceId,
          role,
          message
        })
      })
    } catch (error) {
      console.error('Error saving message to Supabase:', error)
    }
  }

  const handleSendMessage = async (content: string, selected_file_ids?: string[]) => {
    if (!content.trim() || isProcessing) return

    // If no current session, create one first and get the session ID
    let sessionIdToUse = currentSessionId
    
    if (!sessionIdToUse) {
      const newSessionId = await handleNewChat()
      if (!newSessionId) {
        console.error('Failed to create session for new message')
        return
      }
      sessionIdToUse = newSessionId
    }

    // Check if this is the first message in the session (no messages yet)
    const isFirstMessage = messages.length === 0

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      content,
      role: 'user',
      timestamp: new Date()
    }

    setMessages((prev) => [...prev, userMessage])
    setIsProcessing(true)

    // Save user message to Supabase with the correct sessionId
    try {
      await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdToUse,
          workspaceId,
          role: 'user',
          message: content
        })
      })
      
      // If this is the first message, generate a descriptive title using LLM
      if (isFirstMessage) {
        try {
          console.log('🎯 Generating title for first message:', content.substring(0, 50))
          
          // Call the title generation API
          const titleResponse = await fetch('/api/chats/generate-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: content
            })
          })
          
          console.log('📥 Title generation response status:', titleResponse.status)
          
          if (titleResponse.ok) {
            const titleData = await titleResponse.json()
            const generatedTitle = titleData.title || 'New Chat'
            
            console.log('✅ Generated title:', generatedTitle)
            
            // Update the session title in database
            await fetch('/api/chats/session', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: sessionIdToUse,
                title: generatedTitle
              })
            })
            
            // Update local state with new title
            setChatSessions(prev => ({
              ...prev,
              [sessionIdToUse]: {
                ...prev[sessionIdToUse],
                title: generatedTitle
              }
            }))
            
            setWorkspaceChatSessions(prev => 
              prev.map(s => s.id === sessionIdToUse ? { ...s, title: generatedTitle } : s)
            )
          } else {
            // Fallback to truncated message if title generation fails
            const fallbackTitle = content.length > 50 ? content.substring(0, 50) + '...' : content
            await fetch('/api/chats/session', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: sessionIdToUse,
                title: fallbackTitle
              })
            })
            
            setChatSessions(prev => ({
              ...prev,
              [sessionIdToUse]: {
                ...prev[sessionIdToUse],
                title: fallbackTitle
              }
            }))
            
            setWorkspaceChatSessions(prev => 
              prev.map(s => s.id === sessionIdToUse ? { ...s, title: fallbackTitle } : s)
            )
          }
        } catch (titleError) {
          console.error('Error generating/updating session title:', titleError)
          // Still use fallback title in case of any error
          const fallbackTitle = content.length > 50 ? content.substring(0, 50) + '...' : content
          try {
            await fetch('/api/chats/session', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: sessionIdToUse,
                title: fallbackTitle
              })
            })
          } catch {
            // Silently fail - title update is not critical
          }
        }
      }
    } catch (error) {
      console.error('Error saving message to Supabase:', error)
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
    setIsStreaming(true)

    // Cancel any previous streaming request
    if (abortController) {
      abortController.abort('New request started')
    }

    const newAbortController = new AbortController()
    setAbortController(newAbortController)

    try {
      // Prepare conversation history from CURRENT SESSION MESSAGES ONLY (limit to last 10 for context)
      // Do NOT include the new userMessage - it's sent separately as the 'query' parameter
      // Including it would duplicate the current query in the prompt
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
            workspace_id: workspaceId,
            selected_file_ids
        }),
        signal: newAbortController.signal
      })

      if (!response.ok) {
        // Try to get detailed error message from response
        let errorMessage = `API error: ${response.statusText}`
        try {
          const errorData = await response.json()
          if (errorData.error) {
            errorMessage = errorData.error
            if (errorData.hint) {
              errorMessage += `\n\n${errorData.hint}`
            }
          }
        } catch {
          // If JSON parsing fails, use the status text
        }
        throw new Error(errorMessage)
      }

      // Check if response is streaming (SSE)
      const contentType = response.headers.get('content-type')
      if (contentType?.includes('text/event-stream')) {
        // Handle streaming response
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let accumulatedContent = ''
        let streamError = false

        if (reader) {
          try {
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

                      // ✅ FORCE IMMEDIATE UPDATE - Don't batch with React
                      flushSync(() => {
                        setMessages((prev) =>
                          prev.map((msg) =>
                            msg.id === assistantMessageId
                              ? { ...msg, content: accumulatedContent, isStreaming: true }
                              : msg
                          )
                        )
                      })
                    } else if (data.done) {
                      // Streaming complete - save assistant response to Supabase
                      if (accumulatedContent && !streamError) {
                        saveMessageToSupabase(sessionIdToUse, 'assistant', accumulatedContent)
                      }
                      setMessages((prev) =>
                        prev.map((msg) =>
                          msg.id === assistantMessageId
                            ? { ...msg, isStreaming: false }
                            : msg
                        )
                      )
                      setIsProcessing(false)
                      return
                    } else if (data.error) {
                      streamError = true
                      console.error('🛑 Stream error:', data.error, 'Type:', data.type)
                      throw new Error(data.error)
                    }
                  } catch (parseError) {
                    // Log invalid SSE data for debugging
                    if (parseError instanceof SyntaxError) {
                      console.error('🛑 JSON parsing failed - invalid SSE:', { line, error: parseError.message })
                      console.error('   Raw data:', jsonStr.substring(0, 100))
                      streamError = true
                      throw new Error(`Invalid JSON response: ${parseError.message}`)
                    }
                    throw parseError
                  }
                }
              }
            }
          } catch (readerError) {
            console.error('🛑 Stream reading error:', readerError)
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { 
                      ...msg, 
                      content: accumulatedContent || `Error: ${readerError instanceof Error ? readerError.message : 'Stream failed'}`,
                      isStreaming: false 
                    }
                  : msg
              )
            )
            setIsProcessing(false)
            throw readerError
          }
        }
      } else {
        // Fallback for non-streaming responses
        const data = await response.json()

        // Save assistant response to Supabase
        if (data.response) {
          await saveMessageToSupabase(sessionIdToUse, 'assistant', data.response)
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
      // Check if this is an abort error (user cancelled) first
      if (
        (error instanceof Error && error.name === 'AbortError') ||
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.message?.includes('BodyStreamBuffer was aborted')) ||
        (error instanceof Error && error.message?.includes('aborted'))
      ) {
        console.log('Request was cancelled by user')
        setIsStreaming(false)
        setIsProcessing(false)
        setAbortController(null)
        return
      }
      
      console.error('❌ Error sending message:', error)
      
      // Create a more informative error message
      let errorContent = 'Sorry, I encountered an error processing your request.'
      
      if (error instanceof Error) {
        console.error('   Error type:', error.name)
        console.error('   Error message:', error.message)
        console.error('   Stack:', error.stack?.substring(0, 200))
        
        if (error.message.includes('Bridge server is not running')) {
          errorContent = `❌ **Bridge Server Not Running**\n\n${error.message}\n\nThe bridge server is required to process queries. It connects the frontend to the backend AI services.`
        } else if (error.message.includes('Failed to connect')) {
          errorContent = `❌ **Connection Error**\n\n${error.message}\n\nPlease check that all required services are running.`
        } else if (error.message.includes('JSON parsing failed')) {
          errorContent = `❌ **Invalid Response Format**\n\n${error.message}\n\nThe server returned an unexpected response format. Check the server logs for details.`
        } else if (error.message.includes('Stream')) {
          errorContent = `❌ **Streaming Error**\n\n${error.message}\n\nThere was an issue with the real-time response stream. Try again.`
        } else {
          errorContent = `❌ **Error**\n\n${error.message}`
        }
      }
      
      const errorMessage: Message = {
        id: assistantMessageId,
        content: errorContent,
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
      setIsStreaming(false)
      setAbortController(null)
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
        onSessionRename={handleSessionRename}
        onSessionDelete={handleSessionDelete}
      />

      {/* Main Content Area - Workspace Introduction Page takes full remaining width */}
      <div className="flex-1 flex overflow-hidden">
        <WorkspaceIntroduction
          workspace={currentWorkspace}
          messages={messages}
          isProcessing={isProcessing}
          isStreaming={isStreaming}
          onSendMessage={handleSendMessage}
          onCancel={handleCancelStreaming}
          isWorkspaceSidebarCollapsed={isWorkspaceSidebarCollapsed}
          onExpandWorkspaceSidebar={handleExpandWorkspaceSidebar}
          chatSessions={workspaceChatSessions}
          onChatSelect={handleChatSelect}
          currentChatId={currentChatId}
        />
      </div>
    </div>
  )
}
