'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Message, User, ChatSession, Workspace } from '@/app/types'
import Sidebar from '@/app/components/Sidebar/Sidebar'
import WorkspaceSidebar from '@/app/components/WorkspaceSidebar'
import ChatContainer from '@/app/components/Chat/ChatContainer'
import ChatInput from '@/app/components/Chat/ChatInput'

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

  // Load chat session for current workspace
  useEffect(() => {
    if (!workspaceId) {
      setMessages([])
      setCurrentWorkspaceName('')
      setCurrentWorkspace(null)
      setWorkspaceChatSessions([])
      return
    }

    // Load workspace from localStorage
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

    try {
      // TODO: Replace with actual API call to your FastMCP backend
      // For now, simulate a response
      await new Promise((resolve) => setTimeout(resolve, 1000))

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `I received your message: "${content}"\n\nThis is a placeholder response. Once you connect this to your FastMCP backend at http://localhost:8000, I'll be able to answer queries using your ingested documents and configured LLMs.`,
        role: 'assistant',
        timestamp: new Date()
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        role: 'assistant',
        timestamp: new Date()
      }
      setMessages((prev) => [...prev, errorMessage])
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
      <Sidebar user={user} onSignOutAction={handleSignOut} />

      {/* Workspace Sidebar */}
      {workspaceId && currentWorkspace && (
        <WorkspaceSidebar
          workspace={currentWorkspace}
          chatSessions={workspaceChatSessions}
          currentChatId={currentChatId}
          onChatSelect={handleChatSelect}
          onNewChat={handleNewChat}
        />
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Messages */}
        <ChatContainer messages={messages} workspaceName={currentWorkspaceName} />

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
