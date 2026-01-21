/**
 * Chats Service Layer
 * Handles all interactions with the chats and chat_sessions tables
 */

import { createClient } from './server'
import type { Chat, ChatSession } from '@/app/types'
import { chatToMessage, chatsToMessages } from '@/app/types'

// Re-export helper functions for convenience
export { chatToMessage, chatsToMessages }

// ============================================
// Chat Sessions Functions
// ============================================

/**
 * Create a new chat session
 */
export async function createChatSession(
  workspaceId: string,
  title: string = 'New Chat'
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  if (!title || title.trim().length === 0) {
    throw new Error('Session title cannot be empty')
  }

  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({
      workspace_id: workspaceId,
      user_id: user.id,
      title: title.trim()
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating chat session:', error)
    throw error
  }

  return data as ChatSession
}

/**
 * Get all sessions for a workspace (excluding deleted)
 */
export async function getWorkspaceSessions(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching workspace sessions:', error)
    throw error
  }

  return data as ChatSession[]
}

/**
 * Get a specific session by ID
 */
export async function getSessionById(sessionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (error) {
    console.error('Error fetching session:', error)
    throw error
  }

  return data as ChatSession
}

/**
 * Get all messages for a specific session
 */
export async function getSessionMessages(sessionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching session messages:', error)
    throw error
  }

  return data as Chat[]
}

/**
 * Update session title
 */
export async function updateSessionTitle(sessionId: string, title: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  if (!title || title.trim().length === 0) {
    throw new Error('Session title cannot be empty')
  }

  const { data, error } = await supabase
    .from('chat_sessions')
    .update({ title: title.trim() })
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    console.error('Error updating session title:', error)
    throw error
  }

  return data as ChatSession
}

/**
 * Soft delete a session (sets deleted_at timestamp)
 */
export async function deleteSession(sessionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { error } = await supabase
    .from('chat_sessions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', user.id)

  if (error) {
    console.error('Error deleting session:', error)
    throw error
  }

  return true
}

/**
 * Get session count for a workspace
 */
export async function getWorkspaceSessionCount(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { count, error } = await supabase
    .from('chat_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .is('deleted_at', null)

  if (error) {
    console.error('Error counting sessions:', error)
    throw error
  }

  return count || 0
}

// ============================================
// Chat Messages Functions
// ============================================

/**
 * Get all chats for a workspace
 * @deprecated Use getSessionMessages() instead for session-specific messages
 */
export async function getWorkspaceChats(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching chats:', error)
    throw error
  }

  return data as Chat[]
}

/**
 * Get a specific chat by ID
 */
export async function getChatById(chatId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .eq('id', chatId)
    .eq('user_id', user.id)
    .single()

  if (error) {
    console.error('Error fetching chat:', error)
    throw error
  }

  return data as Chat
}

/**
 * Create a new chat message
 * @param sessionId - The session ID to associate the message with (required)
 * @param workspaceId - The workspace ID (required, frontend already knows this)
 * @param role - Message role (user, assistant, system)
 * @param message - Message content
 */
export async function createChatMessage(
  sessionId: string,
  workspaceId: string,
  role: string,
  message: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  if (!message || message.trim().length === 0) {
    throw new Error('Message cannot be empty')
  }

  if (!sessionId) {
    throw new Error('Session ID is required')
  }

  if (!workspaceId) {
    throw new Error('Workspace ID is required')
  }

  const { data, error } = await supabase
    .from('chats')
    .insert({
      session_id: sessionId,
      workspace_id: workspaceId,
      user_id: user.id,
      role: role,
      message: message.trim()
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating chat message:', error)
    throw error
  }

  return data as Chat
}

/**
 * Delete a chat message
 */
export async function deleteChatMessage(chatId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { error } = await supabase
    .from('chats')
    .delete()
    .eq('id', chatId)
    .eq('user_id', user.id)

  if (error) {
    console.error('Error deleting chat message:', error)
    throw error
  }

  return true
}

/**
 * Delete all chats for a workspace
 */
export async function deleteWorkspaceChats(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { error } = await supabase
    .from('chats')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)

  if (error) {
    console.error('Error deleting workspace chats:', error)
    throw error
  }

  return true
}

/**
 * Get chat count for a workspace
 */
export async function getWorkspaceChatCount(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { count, error } = await supabase
    .from('chats')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)

  if (error) {
    console.error('Error counting chats:', error)
    throw error
  }

  return count || 0
}
