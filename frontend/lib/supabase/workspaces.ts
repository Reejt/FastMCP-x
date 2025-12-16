/**
 * Workspace Service Layer
 * Handles all interactions with the workspaces table
 */

import { createClient } from './server'
import type { Workspace } from '@/app/types'

/**
 * Get all workspaces for the current user (excluding archived)
 */
export async function getUserWorkspaces(_includeArchived: boolean = false) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  // Fetch all workspaces owned by the user
  const { data: workspaces, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching user workspaces:', error)
    throw error
  }

  return workspaces as Workspace[]
}

/**
 * Get a specific workspace by ID
 */
export async function getWorkspaceById(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', workspaceId)
    .single()

  if (error) {
    console.error('Error fetching workspace:', error)
    throw error
  }

  return data as Workspace
}

/**
 * Create a new workspace
 */
export async function createWorkspace(name: string, description?: string, userId?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  // Validate name
  if (!name || name.trim().length === 0) {
    throw new Error('Workspace name cannot be empty')
  }

  const { data, error } = await supabase
    .from('workspaces')
    .insert({
      user_id: userId || user.id,
      name: name.trim(),
      description: description || null
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating workspace:', error)
    throw error
  }

  return data as Workspace
}

/**
 * Update a workspace
 */
export async function updateWorkspace(
  workspaceId: string,
  updates: {
    name?: string
    description?: string | null
  },
  _userId?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  // Validate name if provided
  if (updates.name !== undefined) {
    if (!updates.name || updates.name.trim().length === 0) {
      throw new Error('Workspace name cannot be empty')
    }
    updates.name = updates.name.trim()
  }

  // Trim description if provided
  if (updates.description !== undefined && updates.description !== null) {
    updates.description = updates.description.trim() || null
  }

  const { data, error } = await supabase
    .from('workspaces')
    .update(updates)
    .eq('id', workspaceId)
    .select()
    .single()

  if (error) {
    console.error('Error updating workspace:', error)
    throw error
  }

  return data as Workspace
}

/**
 * Permanently delete a workspace
 * WARNING: This cascades to all documents and instructions!
 */
export async function deleteWorkspace(workspaceId: string, _userId?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { error } = await supabase
    .from('workspaces')
    .delete()
    .eq('id', workspaceId)

  if (error) {
    console.error('Error deleting workspace:', error)
    throw error
  }

  return true
}

/**
 * Get or create default workspace for a user
 * Useful for migration from non-workspace system
 */
export async function getOrCreateDefaultWorkspace() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  // Check if user has any workspaces
  const { data: existingWorkspaces } = await supabase
    .from('workspaces')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)

  // Return existing workspace if found
  if (existingWorkspaces && existingWorkspaces.length > 0) {
    return existingWorkspaces[0] as Workspace
  }

  // Create default workspace
  return await createWorkspace('Personal Workspace')
}
