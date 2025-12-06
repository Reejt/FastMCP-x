/**
 * Chats Service Layer
 * Handles all interactions with the chats table
 */

import { createClient } from './server'
import type { Chat } from '@/app/types'

/**
 * Get all chats for a workspace
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
 */
export async function createChatMessage(
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

  const { data, error } = await supabase
    .from('chats')
    .insert({
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
