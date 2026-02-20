'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { flushSync } from 'react-dom'  // ✅ ADD THIS for immediate updates
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { Message, User, ChatSession, Workspace, WorkspaceInstruction, Chat } from '@/app/types'
import Sidebar from '@/app/components/Sidebar/Sidebar'
import DiagramPreviewPanel from '@/app/components/UI/DiagramPreviewPanel'
import DocumentPreviewPanel from '@/app/components/UI/DocumentPreviewPanel'
import { generateDiagram, extractMermaidCode, isDiagramQuery as checkDiagramQuery } from '@/app/lib/diagram-client'
import { useMermaidDetector } from '@/app/hooks/useMermaidDetector'
import { useDocumentDetector } from '@/app/hooks/useDocumentDetector'

// Dynamic imports for heavy components
const WorkspaceSidebar = dynamic(() => import('@/app/components/WorkspaceSidebar'), {
  loading: () => <div className="w-64 h-screen animate-pulse" style={{ backgroundColor: 'var(--bg-surface)' }} />,
  ssr: false
})
const ChatContainer = dynamic(() => import('@/app/components/Chat/ChatContainer'), {
  loading: () => <div className="flex-1" style={{ backgroundColor: 'var(--bg-app)' }} />,
  ssr: false
})
const ChatInput = dynamic(() => import('@/app/components/Chat/ChatInput'), {
  loading: () => <div className="h-16" style={{ backgroundColor: 'var(--bg-elevated)', borderTop: '1px solid var(--border-subtle)' }} />,
  ssr: false
})

export default function DashboardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const workspaceId = searchParams.get('workspace')
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
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
  const [generalChatSessions, setGeneralChatSessions] = useState<ChatSession[]>([])
  const [currentGeneralSessionId, setCurrentGeneralSessionId] = useState<string>('')
  const isCreatingSessionRef = useRef(false) // Track if we're already creating a session

  // Check if the query is diagram-related - memoized to avoid infinite loops
  // ✅ Uses diagram-client utility for consistent detection
  const hasDiagramQuery = useMemo(() => {
    if (messages.length === 0) return false
    
    // Check last up to 3 user messages for diagram keywords
    const relevantMessages = messages
      .filter(msg => msg.role === 'user')
      .slice(-3)
    
    return relevantMessages.some(msg => checkDiagramQuery(msg.content))
  }, [messages])

  // Mermaid diagram detection - only enabled for diagram queries
  const { currentDiagram, showDiagram, addDynamicDiagram, closeDiagram, hasDiagrams } = useMermaidDetector(messages, hasDiagramQuery)

  // Document preview detection for streaming
  const { currentDocument, isDocumentPanelOpen, closeDocumentPanel } = useDocumentDetector(
    messages,
    {
      enableStreamingPreview: true
    }
  )

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount - router and supabase are stable

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

  // Extract general session ID from search params
  const generalSessionId = searchParams.get('general')

  // Load chat history - workspace chat or general chat
  useEffect(() => {
    if (!user) return // Wait for user to be loaded

    console.log('Dashboard effect running - generalSessionId:', generalSessionId, 'workspaceId:', workspaceId)

    if (workspaceId) {
      loadWorkspaceChat()
    } else {
      // For general chat:
      if (generalSessionId) {
        // If a session ID is specified, load that session's messages
        console.log('Loading existing session:', generalSessionId)
        loadGeneralChat()
      } else {
        // If no session ID, check if there are existing sessions
        // Only create a new session if no sessions exist
        console.log('No session ID - checking for existing sessions...')
        loadOrCreateGeneralSession()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, user?.id, generalSessionId]) // Re-run when session ID changes

  // Load most recent general chat session or create one if none exist
  const loadOrCreateGeneralSession = async () => {
    if (isCreatingSessionRef.current) {
      console.log('Session operation already in progress, skipping...')
      return
    }

    try {
      // Fetch existing general chat sessions
      const sessionsResponse = await fetch('/api/chats/general/sessions')
      if (!sessionsResponse.ok) {
        throw new Error('Failed to load general chat sessions')
      }

      const sessionsResult = await sessionsResponse.json()
      const sessions = sessionsResult.sessions || []
      
      if (sessions.length > 0) {
        // Load the most recent session (first in list)
        console.log('Found existing sessions, loading most recent:', sessions[0].id)
        router.push(`/dashboard?general=${sessions[0].id}`)
      } else {
        // No sessions exist - create a new one
        console.log('No existing sessions found - creating new general chat session...')
        await createNewGeneralSession()
      }
    } catch (error) {
      console.error('Error in loadOrCreateGeneralSession:', error)
      // Fallback: create a new session if fetching fails
      await createNewGeneralSession()
    }
  }

  // Create a new general chat session
  const createNewGeneralSession = async () => {
    // Prevent duplicate calls
    if (isCreatingSessionRef.current) {
      console.log('Session creation already in progress, skipping...')
      return
    }

    isCreatingSessionRef.current = true
    try {
      console.log('Creating new general chat session...')
      // Create a new session with "New Chat" title
      // Title will be auto-generated after the first message is sent
      const createResponse = await fetch('/api/chats/general/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat' })
      })

      if (!createResponse.ok) {
        throw new Error('Failed to create general chat session')
      }

      const createResult = await createResponse.json()
      const newSession = createResult.session
      console.log('New session created:', newSession.id, 'with title:', 'New Chat')

      // Immediately update state with the new empty session
      setMessages([])
      setCurrentGeneralSessionId(newSession.id)
      setCurrentChatId(newSession.id)
      setIsGeneralChat(true)
      setCurrentWorkspaceName('General Chat')
      setCurrentWorkspace(null)
      setWorkspaceChatSessions([])
      setActiveInstruction(null)
      setShowInstructionBanner(false)
      
      // Update sessions in chatSessions map
      setChatSessions({
        [newSession.id]: {
          id: newSession.id,
          user_id: newSession.user_id || '',
          workspace_id: null, // General chat sessions don't belong to a workspace
          title: newSession.title,
          created_at: newSession.created_at,
          updated_at: newSession.updated_at,
          deleted_at: newSession.deleted_at,
          messages: [],
          is_general_chat: true
        }
      })
      
      // Update sessions list for sidebar
      setGeneralChatSessions([newSession])

      // Then navigate to the new session
      console.log('Navigating to new session:', newSession.id)
      router.push(`/dashboard?general=${newSession.id}`)
    } catch (error) {
      console.error('Error creating new chat session:', error)
      setMessages([])
    } finally {
      isCreatingSessionRef.current = false
    }
  }

  const loadGeneralChat = async () => {
    if (!user || !generalSessionId) {
      setMessages([])
      return
    }

    try {
      console.log('Loading general chat session:', generalSessionId)
      
      // Load list of general chat sessions
      const sessionsResponse = await fetch('/api/chats/general/sessions')
      if (!sessionsResponse.ok) {
        throw new Error('Failed to load general chat sessions')
      }

      const sessionsResult = await sessionsResponse.json()
      const sessions = sessionsResult.sessions || []
      console.log('Available sessions:', sessions.map((s: any) => ({ id: s.id, title: s.title })))

      // Find the requested session
      let currentSession = sessions.find((s: ChatSession) => s.id === generalSessionId)
      
      if (!currentSession) {
        console.warn('Session not found in list, trying to fetch directly...')
        // Try to fetch the session directly
        const directResponse = await fetch(`/api/chats/general/session?sessionId=${generalSessionId}`)
        if (!directResponse.ok) {
          throw new Error(`Session ${generalSessionId} not found`)
        }
        
        const directResult = await directResponse.json()
        // Create a minimal session object if we got messages
        currentSession = {
          id: generalSessionId,
          user_id: user?.id || '',
          title: 'New Chat',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          messages: directResult.messages || []
        }
      }

      // Load messages for this session
      const messagesResponse = await fetch(
        `/api/chats/general/session?sessionId=${currentSession.id}`
      )

      if (!messagesResponse.ok) {
        throw new Error('Failed to load general chat messages')
      }

      const messagesResult = await messagesResponse.json()
      const chatMessages = messagesResult.messages || []
      console.log('Messages loaded for session:', currentSession.id, 'Count:', chatMessages.length)

      // Update state
      setMessages(chatMessages)
      setCurrentGeneralSessionId(currentSession.id)
      setCurrentChatId(currentSession.id)
      
      // Store all sessions in chatSessions map for switching
      // Only load messages for the current session, keep others empty until clicked
      const chatSessionsMap: Record<string, ChatSession> = {}
      sessions.forEach((session: any) => {
        chatSessionsMap[session.id] = {
          id: session.id,
          user_id: session.user_id || '',
          workspace_id: null, // General chat sessions don't belong to a workspace
          title: session.title,
          created_at: session.created_at,
          updated_at: session.updated_at,
          deleted_at: session.deleted_at,
          messages: session.id === currentSession.id ? chatMessages : [], // Only load messages for current session
          is_general_chat: true
        }
      })
      
      // Also include the current session if it wasn't in the list
      if (!sessions.find((s: any) => s.id === currentSession.id)) {
        chatSessionsMap[currentSession.id] = {
          id: currentSession.id,
          user_id: currentSession.user_id,
          workspace_id: null,
          title: currentSession.title,
          created_at: currentSession.created_at,
          updated_at: currentSession.updated_at,
          deleted_at: currentSession.deleted_at,
          messages: chatMessages,
          is_general_chat: true
        }
      }
      
      setChatSessions(chatSessionsMap)

      // Update sessions list for sidebar (without messages)
      setGeneralChatSessions(sessions)

      setIsGeneralChat(true)
      setCurrentWorkspaceName('General Chat')
      setCurrentWorkspace(null)
      setWorkspaceChatSessions([])
      setActiveInstruction(null)
      setShowInstructionBanner(false)
    } catch (error) {
      console.error('Error loading general chat:', error)
      setMessages([])
    }
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
          const workspace = workspaces.find((w: Workspace) => w.id === workspaceId)
          if (workspace) {
            setCurrentWorkspaceName(workspace.name)
            setCurrentWorkspace({
              ...workspace,
              created_at: new Date(workspace.created_at).toISOString(),
              updated_at: new Date(workspace.updated_at).toISOString()
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
          workspace_id: workspaceId,
          user_id: user?.id || '',
          title: 'Workspace Chat',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          messages,
        }
      }))

      // For sidebar, we'll show just this one session if it has messages
      if (messages.length > 0) {
        setWorkspaceChatSessions([{
          id: sessionId,
          workspace_id: workspaceId,
          user_id: user?.id || '',
          title: 'Workspace Chat',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          messages
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

  const handleChatSelect = async (chatId: string) => {
    // For general chat, load messages from API if not already loaded
    if (isGeneralChat) {
      try {
        setCurrentChatId(chatId)
        setCurrentGeneralSessionId(chatId)

        const response = await fetch(`/api/chats/general/session?sessionId=${chatId}`)
        if (response.ok) {
          const result = await response.json()
          const chatMessages = result.messages || []
          setMessages(chatMessages)

          // Update local cache
          setChatSessions(prev => ({
            ...prev,
            [chatId]: {
              ...prev[chatId],
              messages: chatMessages
            }
          }))
        }

        // Update URL to reflect current session
        router.push(`/dashboard?general=${chatId}`)
      } catch (error) {
        console.error('Error loading general chat session:', error)
      }
      return
    }

    // For workspace chats, use local state
    const session = chatSessions[chatId]
    if (session) {
      setMessages(session.messages || [])
      setCurrentChatId(chatId)
    }
  }

  const handleNewChat = async () => {
    if (isGeneralChat) {
      // For general chat: create a new session via API
      await createNewGeneralSession()
      return
    }

    if (!workspaceId) return

    // Clear messages - new chat starts empty
    // Chats are only persisted once the user sends a message
    setMessages([])
    const newSessionId = `${workspaceId}_main`
    setCurrentChatId(newSessionId)
  }

  const handleDeleteSession = async (sessionId: string) => {
    try {
      console.log('🗑️ Deleting session:', sessionId)
      
      // Determine if this is a general chat or workspace chat
      const session = chatSessions[sessionId]
      const isGeneralChatSession = session?.workspace_id === null || session?.is_general_chat
      
      // Call appropriate delete endpoint
      const deleteUrl = isGeneralChatSession
        ? `/api/chats/general/session?sessionId=${sessionId}`
        : `/api/chats/session?sessionId=${sessionId}`
      
      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (!response.ok) {
        throw new Error(`Failed to delete session: ${response.statusText}`)
      }
      
      console.log('✅ Session deleted:', sessionId)
      
      // Remove session from state
      setChatSessions(prev => {
        const updated = { ...prev }
        delete updated[sessionId]
        return updated
      })
      
      // Remove from sidebar lists
      if (isGeneralChatSession) {
        setGeneralChatSessions(prev => prev.filter(s => s.id !== sessionId))
      } else if (workspaceId) {
        setWorkspaceChatSessions(prev => prev.filter(s => s.id !== sessionId))
      }
      
      // If the deleted session is the current one, navigate to another session
      if (currentChatId === sessionId) {
        if (isGeneralChatSession) {
          // For general chat: create a new session or load another one
          const remainingGeneralSessions = generalChatSessions.filter(s => s.id !== sessionId)
          if (remainingGeneralSessions.length > 0) {
            // Load the most recent remaining session
            const nextSession = remainingGeneralSessions[0]
            router.push(`/dashboard?general=${nextSession.id}`)
          } else {
            // No more sessions - create a new one
            await createNewGeneralSession()
          }
        } else if (workspaceId) {
          // For workspace chat: clear messages and show "New Chat"
          setMessages([])
          const newSessionId = `${workspaceId}_main`
          setCurrentChatId(newSessionId)
        }
      }
      
    } catch (error) {
      console.error('❌ Error deleting session:', error)
      // Show user-friendly error message
      alert(`Failed to delete session: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
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

  // ✅ Helper function for safe diagram generation using diagram-client (Issues 2, 3, 4, 7)
  const generateDiagramFromResponse = async (userQuery: string, messageId: string) => {
    try {
      console.log('📊 Generating diagram using diagram-client...')
      
      // Use diagram-client for consistent, tested diagram generation logic
      const diagramResult = await generateDiagram(userQuery, 'auto', undefined, abortController?.signal)
      
      if (diagramResult.success && diagramResult.diagram) {
        console.log('✅ Diagram generated:', diagramResult.diagram_type)
        
        // Extract mermaid code safely using diagram-client utility
        const mermaidCode = extractMermaidCode(diagramResult.diagram).trim()
        
        // Validate before adding
        if (mermaidCode && typeof mermaidCode === 'string' && mermaidCode) {
          const success = addDynamicDiagram({
            id: messageId,
            type: diagramResult.diagram_type || 'unknown',
            title: `Generated ${diagramResult.diagram_type || 'Diagram'}`,
            mermaidCode: mermaidCode,
            createdAt: new Date()
          })
          if (!success) {
            console.warn('Failed to add diagram to state')
          }
        } else {
          console.warn('Extracted mermaid code is empty')
        }
      } else if (diagramResult.error) {
        console.warn('Diagram generation error:', diagramResult.error)
      }
    } catch (diagramError) {
      console.error('⚠️ Diagram generation failed:', diagramError)
      // Don't fail the main query if diagram generation fails
    }
  }

  // ✅ NEW: Generate diagram directly from user query (diagram-only mode)
  // Bypasses text response - shows only diagram
  const generateDiagramDirectly = async (
    query: string,
    messageId: string,
    diagramType: string = 'auto'
  ) => {
    try {
      console.log('📊 Generating diagram directly from query (diagram-only mode)...')
      
      // Import the new function
      const { generateDiagramFromQuery, detectDiagramType } = await import('@/app/lib/diagram-client')
      
      // Detect diagram type from query if not specified
      const detectedType = diagramType === 'auto' ? detectDiagramType(query) : diagramType
      console.log('   Detected diagram type:', detectedType)
      
      // Call diagram generation with direct query
      const diagramResult = await generateDiagramFromQuery(
        query,
        detectedType,
        workspaceId || undefined,
        undefined,
        abortController?.signal
      )
      
      if (diagramResult.success && diagramResult.diagram) {
        console.log('✅ Diagram generated:', diagramResult.diagram_type)
        
        // Extract mermaid code safely
        const mermaidCode = extractMermaidCode(diagramResult.diagram).trim()
        
        // Validate before adding
        if (mermaidCode && typeof mermaidCode === 'string' && mermaidCode) {
          const success = addDynamicDiagram({
            id: messageId,
            type: diagramResult.diagram_type || detectedType || 'unknown',
            title: `Generated ${diagramResult.diagram_type || detectedType || 'Diagram'}`,
            mermaidCode: mermaidCode,
            createdAt: new Date()
          })
          
          if (success) {
            // Show the diagram panel
            showDiagram(messageId)
            
            // Add optional system message indicating diagram was generated
            const systemMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `📊 Generated ${diagramResult.diagram_type || detectedType} diagram`,
              role: 'system',
              timestamp: new Date(),
              isStreaming: false
            }
            setMessages(prev => [...prev, systemMsg])
          } else {
            console.warn('Failed to add diagram to state')
          }
        } else {
          console.warn('Extracted mermaid code is empty')
        }
      } else if (diagramResult.error) {
        console.warn('Diagram generation error:', diagramResult.error)
        // Show error message in chat
        const errorMessage: Message = {
          id: messageId,
          content: `❌ **Diagram Generation Failed**\n\n${diagramResult.error}`,
          role: 'assistant',
          timestamp: new Date(),
          isStreaming: false
        }
        setMessages(prev =>
          prev.map((msg) =>
            msg.id === messageId ? errorMessage : msg
          )
        )
      }
    } catch (diagramError) {
      console.error('⚠️ Direct diagram generation failed:', diagramError)
      
      // Show error message
      const errorMessage: Message = {
        id: messageId,
        content: `❌ **Diagram Generation Error**\n\n${diagramError instanceof Error ? diagramError.message : 'Unknown error'}`,
        role: 'assistant',
        timestamp: new Date(),
        isStreaming: false
      }
      setMessages(prev =>
        prev.map((msg) =>
          msg.id === messageId ? errorMessage : msg
        )
      )
    } finally {
      setIsStreaming(false)
      setIsProcessing(false)
      setAbortController(null)
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

  const handleSendMessage = async (content: string, selected_file_ids?: string[]) => {
    if (!content.trim() || isProcessing) return

    // Check if this is the first message BEFORE adding to state
    const isFirstMessage = messages.length === 0

    // Add user message to state
    const userMessage: Message = {
      id: Date.now().toString(),
      content,
      role: 'user',
      timestamp: new Date()
    }

    setMessages((prev) => [...prev, userMessage])
    setIsProcessing(true)

    // Save user message to database (workspace chats)
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
        console.error('Error saving user message to workspace chat:', error)
      }
    }

    // Save user message to database (general chat)
    if (isGeneralChat && currentGeneralSessionId) {
      try {
        await fetch('/api/chats/general', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: currentGeneralSessionId,
            role: 'user',
            message: content
          })
        })
      } catch (error) {
        console.error('Error saving user message to general chat:', error)
      }
    }

    // ✅ Generate title for first message in any session
    if (isFirstMessage)
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
        
        // Determine which session to update and which API endpoint to use
        const sessionIdToUpdate = isGeneralChat ? currentGeneralSessionId : (workspaceId ? `${workspaceId}_main` : currentChatId)
        const titleUpdateUrl = isGeneralChat
          ? '/api/chats/general/session'
          : '/api/chats/session'
        
        if (titleResponse.ok) {
          const titleData = await titleResponse.json()
          const generatedTitle = titleData.title || 'New Chat'
          
          console.log('✅ Generated title:', generatedTitle)
          
          // Update the session title in database using correct endpoint
          await fetch(titleUpdateUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: sessionIdToUpdate,
              title: generatedTitle
            })
          })
          
          // Update local state
          setChatSessions(prev => ({
            ...prev,
            [sessionIdToUpdate]: {
              ...prev[sessionIdToUpdate],
              title: generatedTitle
            }
          }))
          
          // Update sidebar display
          if (isGeneralChat) {
            setGeneralChatSessions(prev =>
              prev.map(s => s.id === sessionIdToUpdate ? { ...s, title: generatedTitle } : s)
            )
          } else if (workspaceId) {
            setWorkspaceChatSessions(prev =>
              prev.map(s => s.id === sessionIdToUpdate ? { ...s, title: generatedTitle } : s)
            )
          }
        } else {
          // Fallback to truncated message if title generation fails
          console.warn('⚠️ Title generation failed, using fallback')
          const fallbackTitle = content.length > 50 ? content.substring(0, 50) + '...' : content
          
          await fetch(titleUpdateUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: sessionIdToUpdate,
              title: fallbackTitle
            })
          })
          
          setChatSessions(prev => ({
            ...prev,
            [sessionIdToUpdate]: {
              ...prev[sessionIdToUpdate],
              title: fallbackTitle
            }
          }))
          
          if (isGeneralChat) {
            setGeneralChatSessions(prev =>
              prev.map(s => s.id === sessionIdToUpdate ? { ...s, title: fallbackTitle } : s)
            )
          } else if (workspaceId) {
            setWorkspaceChatSessions(prev =>
              prev.map(s => s.id === sessionIdToUpdate ? { ...s, title: fallbackTitle } : s)
            )
          }
        }
      } catch (error) {
        console.error('❌ Error generating title:', error)
        // Continue with chat flow even if title generation fails
      }
    }

    // ✅ NEW: Check if this is a diagram-only query
    const { detectDiagramType } = await import('@/app/lib/diagram-client')
    const isDiagramOnly = checkDiagramQuery(content)
    
    if (isDiagramOnly) {
      console.log('🎨 Diagram-only query detected - skipping text response')
      
      // Create placeholder for diagram
      const assistantMessageId = (Date.now() + 1).toString()
      const assistantMessage: Message = {
        id: assistantMessageId,
        content: '📊 Generating diagram...',
        role: 'assistant',
        timestamp: new Date(),
        isStreaming: true
      }
      
      setMessages((prev) => [...prev, assistantMessage])
      
      // Create AbortController for this request
      const controller = new AbortController()
      setAbortController(controller)
      
      // Generate diagram directly (diagram-only mode)
      const diagramType = detectDiagramType(content)
      await generateDiagramDirectly(content, assistantMessageId, diagramType)
      
      return  // Exit here - don't process normal chat flow
    }

    // ✅ Normal chat flow (existing code)
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

    // Create a new AbortController for this request
    const controller = new AbortController()
    setAbortController(controller)

    try {
      // Prepare conversation history from EXISTING messages ONLY (limit to last 10 messages for context)
      // Do NOT include the current userMessage - it's sent separately as the 'query' parameter
      // Including it would duplicate the current query in the prompt
      const conversation_history = messages.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      // Call Next.js API route with streaming support and abort signal
      const response = await fetch('/api/chat/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: content,
          conversation_history,
            workspace_id: workspaceId,  // Pass workspace ID for instruction application
            selected_file_ids
        }),
        signal: controller.signal
      })

      if (!response.ok) {
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
        let updateTimeout: NodeJS.Timeout | null = null
        let lastUpdateTime = 0
        const UPDATE_INTERVAL = 16  // ~60fps, update every 16ms max

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

                      // Smart throttling: update immediately if enough time has passed, otherwise debounce
                      const now = Date.now()
                      const timeSinceLastUpdate = now - lastUpdateTime
                      
                      if (timeSinceLastUpdate > UPDATE_INTERVAL) {
                        // Enough time has passed - update immediately
                        lastUpdateTime = now
                        if (updateTimeout) clearTimeout(updateTimeout)
                        updateTimeout = null
                        
                        flushSync(() => {
                          setMessages((prev) =>
                            prev.map((msg) =>
                              msg.id === assistantMessageId
                                ? { ...msg, content: accumulatedContent, isStreaming: true }
                                : msg
                            )
                          )
                        })
                      } else if (!updateTimeout) {
                        // Not enough time passed and no pending update - schedule one
                        updateTimeout = setTimeout(() => {
                          lastUpdateTime = Date.now()
                          updateTimeout = null
                          
                          flushSync(() => {
                            setMessages((prev) =>
                              prev.map((msg) =>
                                msg.id === assistantMessageId
                                  ? { ...msg, content: accumulatedContent, isStreaming: true }
                                  : msg
                              )
                            )
                          })
                        }, UPDATE_INTERVAL - timeSinceLastUpdate)
                      }
                    } else if (data.done) {
                      // Clear any pending timeout
                      if (updateTimeout) {
                        clearTimeout(updateTimeout)
                        updateTimeout = null
                      }

                      // Final update with complete content
                      flushSync(() => {
                        setMessages((prev) =>
                          prev.map((msg) =>
                            msg.id === assistantMessageId
                              ? { ...msg, content: accumulatedContent, isStreaming: false }
                              : msg
                          )
                        )
                      })

                      // Save message via API to database
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
                          console.error('Error saving assistant message to workspace chat:', error)
                        }
                      }

                      // Save message to general chat if applicable
                      if (isGeneralChat && currentGeneralSessionId) {
                        try {
                          await fetch('/api/chats/general', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              sessionId: currentGeneralSessionId,
                              role: 'assistant',
                              message: accumulatedContent
                            })
                          })
                        } catch (error) {
                          console.error('Error saving assistant message to general chat:', error)
                        }
                      }

                      // ✅ Issue 2, 4: Generate diagram immediately after streaming ends (no race condition)
                      if (hasDiagramQuery && accumulatedContent) {
                        console.log('📊 Generating diagram from response...')
                        // Fire diagram generation without blocking message completion
                        generateDiagramFromResponse(accumulatedContent, assistantMessageId)
                      }
                      setIsStreaming(false)
                      setAbortController(null)
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
            
            // Check if this is an abort error (from user cancellation)
            const isAborted = readerError instanceof Error && readerError.name === 'AbortError'
            
            if (!isAborted) {
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
            }
            setIsStreaming(false)
            setAbortController(null)
            setIsProcessing(false)
            if (!isAborted) {
              throw readerError
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
        setIsStreaming(false)
        setAbortController(null)
      }
    } catch (error) {
      // Check if this is an abort error (from user cancellation)
      if (
        (error instanceof Error && error.name === 'AbortError') ||
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.message?.includes('BodyStreamBuffer was aborted')) ||
        (error instanceof Error && error.message?.includes('aborted')) ||
        (error instanceof Error && error.message === 'User cancelled the request') ||
        (typeof error === 'string' && error === 'User cancelled the request')
      ) {
        console.log('Request was cancelled by user')
        setIsStreaming(false)
        setAbortController(null)
        setIsProcessing(false)
        return
      }
      
      console.error('❌ Error sending message:', error)
      
      let errorContent = 'Sorry, I encountered an error processing your request.'
      
      if (error instanceof Error) {
        console.error('   Error type:', error.name)
        console.error('   Error message:', error.message)
      
        if (error.message.includes('Bridge server is not running')) {
          errorContent = `❌ **Bridge Server Not Running**\n\n${error.message}`
        } else if (error.message.includes('Failed to connect')) {
          errorContent = `❌ **Connection Error**\n\n${error.message}`
        } else if (error.message.includes('JSON parsing failed')) {
          errorContent = `❌ **Invalid Response Format**\n\n${error.message}`
        } else if (error.message.includes('Stream')) {
          errorContent = `❌ **Streaming Error**\n\n${error.message}`
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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-app)' }}>
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const hasMessages = messages.length > 0
  const workspaceLabel = currentWorkspace?.name || currentWorkspaceName || 'this workspace'
  const headlineText = isGeneralChat || !workspaceId
    ? 'What should we work on today?'
    : `What should we work on in ${workspaceLabel}?`

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-app)' }}>
      {/* Main Sidebar */}
      <Sidebar
        user={user}
        onSignOutAction={handleSignOut}
      />

      {/* Workspace Sidebar - Shows workspace chats or general chat sessions */}
      {(workspaceId && currentWorkspace) || isGeneralChat ? (
        <WorkspaceSidebar
          workspace={currentWorkspace}
          chatSessions={isGeneralChat ? generalChatSessions : workspaceChatSessions}
          currentChatId={currentChatId}
          onChatSelect={handleChatSelect}
          onNewChat={handleNewChat}
          onSessionDelete={handleDeleteSession}
          onToggleSidebar={handleWorkspaceSidebarToggle}
          isGeneralChat={isGeneralChat}
        />
      ) : null}

      {/* Main Chat Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Content */}
        <div className={`flex flex-col flex-1 transition-all duration-200 ${isDocumentPanelOpen ? 'w-[55%]' : 'w-full'}`}>
        {/* Breadcrumb Navigation for Workspace */}
        {workspaceId && currentWorkspace && (
          <div className="flex items-center gap-3 px-8 py-4" style={{ backgroundColor: 'var(--bg-app)' }}>
            {isWorkspaceSidebarCollapsed && (
              <button
                type="button"
                onClick={handleExpandWorkspaceSidebar}
                className="p-2 rounded transition-colors flex-shrink-0"
                style={{ 
                  color: 'var(--text-secondary)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
                aria-label="Expand sidebar"
              >
                <svg className="w-5 h-5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M14 2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h12zM2 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2H2z" />
                  <path d="M3 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4z" />
                </svg>
              </button>
            )}
            <nav className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <button
                type="button"
                onClick={() => router.push('/workspaces')}
                className="transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--text-primary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }}
              >
                Workspaces
              </button>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{currentWorkspace.name || 'Workspace'}</span>
            </nav>
          </div>
        )}

        {/* Breadcrumb Navigation for General Chat */}
        {isGeneralChat && (
          <div className="flex items-center gap-3 px-8 py-4 relative" style={{ backgroundColor: 'var(--bg-app)', zIndex: 10 }}>
            {isWorkspaceSidebarCollapsed ? (
              <button
                type="button"
                onClick={handleExpandWorkspaceSidebar}
                className="p-2 rounded transition-colors flex-shrink-0 cursor-pointer active:opacity-60"
                style={{ 
                  color: 'var(--text-secondary)',
                  zIndex: 20
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
                aria-label="Expand sidebar"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  style={{ pointerEvents: 'none' }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsWorkspaceSidebarCollapsed(true)
                  localStorage.setItem('workspace-sidebar-collapsed', 'true')
                }}
                className="p-1 rounded transition-colors cursor-pointer active:opacity-60"
                style={{ 
                  color: 'var(--text-secondary)',
                  zIndex: 20
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
                aria-label="Collapse sidebar"
              >
                <svg 
                  className="w-5 h-5" 
                  viewBox="0 0 16 16" 
                  fill="currentColor"
                  style={{ pointerEvents: 'none' }}
                >
                  <path d="M14 2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h12zM2 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2H2z" />
                  <path d="M3 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4z" />
                </svg>
              </button>
            )}
            <nav className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {isWorkspaceSidebarCollapsed && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Chats</span>
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

        <AnimatePresence mode="wait">
          {hasMessages ? (
            <motion.div
              key="chat"
              className="flex-1 flex flex-col min-h-0"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              {/* Chat Messages */}
              <ChatContainer messages={messages} workspaceName={currentWorkspaceName} activeInstruction={activeInstruction} onShowDiagram={showDiagram} />

              {/* Chat Input */}
              <ChatInput
                onSendMessage={handleSendMessage}
                onCancel={handleCancelStreaming}
                disabled={isProcessing}
                isStreaming={isStreaming}
                hasMessages={messages.length > 0}
                workspaceName={currentWorkspaceName}
                workspaceId={workspaceId || undefined}
                variant="dock"
              />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              className="flex-1 flex flex-col items-center justify-center px-6 -mt-2 xl:-mt-20"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <div className="w-full max-w-3xl text-center mb-6 xl:mb-8">
                <h1 className="text-2xl md:text-3xl font-light" style={{ color: 'var(--text-primary)' }}>
                  {headlineText}
                </h1>
              </div>
              <div className="w-full">
                <ChatInput
                  onSendMessage={handleSendMessage}
                  onCancel={handleCancelStreaming}
                  disabled={isProcessing}
                  isStreaming={isStreaming}
                  hasMessages={false}
                  workspaceName={currentWorkspaceName}
                  workspaceId={workspaceId || undefined}
                  variant="hero"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Document Preview Panel - Right side (45% when open) */}
      {isDocumentPanelOpen && (
        <div className="w-[45%] h-full p-3 flex-shrink-0">
          <DocumentPreviewPanel
            isOpen={isDocumentPanelOpen}
            document={currentDocument}
            onClose={closeDocumentPanel}
            isStreaming={messages[messages.length - 1]?.isStreaming}
          />
        </div>
      )}

      {/* Mermaid Diagram Preview Panel */}
      <DiagramPreviewPanel
        isOpen={!!currentDiagram}
        diagram={currentDiagram}
        onClose={closeDiagram}
      />
    </div>
    </div>
  )
}
