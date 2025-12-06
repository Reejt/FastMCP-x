/**
 * Workspace Service Layer
 * Handles all interactions with the workspaces table
 */

import { createClient } from './server'
import type { Workspace } from '@/app/types'

/**
 * Get all workspaces for the current user (excluding archived)
 */
export async function getUserWorkspaces(includeArchived: boolean = false) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  let query = supabase
    .from('workspaces')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })

  if (!includeArchived) {
    query = query.eq('is_archived', false)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching workspaces:', error)
    throw error
  }

  return data as Workspace[]
}

/**
 * Get workspace summaries with file count
 */
export async function getWorkspaceSummaries(includeArchived: boolean = false) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  // Get workspaces
  const workspaces = await getUserWorkspaces(includeArchived)

  // Get file counts for each workspace
  const summaries = await Promise.all(
    workspaces.map(async (workspace) => {
      const { count } = await supabase
        .from('file_upload')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspace.id)
        .is('deleted_at', null)

      return {
        ...workspace,
        file_count: count || 0
      }
    })
  )

  return summaries
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
    .eq('owner_id', user.id)
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
export async function createWorkspace(
  name: string,
  description?: string
) {
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
      name: name.trim(),
      description: description?.trim() || null,
      owner_id: user.id
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
 * Update an existing workspace
 */
export async function updateWorkspace(
  workspaceId: string,
  updates: {
    name?: string
    description?: string | null
  }
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
    updates.description = updates.description.trim()
  }

  const { data, error } = await supabase
    .from('workspaces')
    .update(updates)
    .eq('id', workspaceId)
    .eq('owner_id', user.id)
    .select()
    .single()

  if (error) {
    console.error('Error updating workspace:', error)
    throw error
  }

  return data as Workspace
}

/**
 * Archive a workspace (soft delete)
 * Does not delete documents, just marks workspace as archived
 */
export async function archiveWorkspace(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('workspaces')
    .update({ is_archived: true })
    .eq('id', workspaceId)
    .eq('owner_id', user.id)
    .select()
    .single()

  if (error) {
    console.error('Error archiving workspace:', error)
    throw error
  }

  return data as Workspace
}

/**
 * Unarchive a workspace
 */
export async function unarchiveWorkspace(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('workspaces')
    .update({ is_archived: false })
    .eq('id', workspaceId)
    .eq('owner_id', user.id)
    .select()
    .single()

  if (error) {
    console.error('Error unarchiving workspace:', error)
    throw error
  }

  return data as Workspace
}

/**
 * Permanently delete a workspace
 * WARNING: This cascades to all documents and instructions!
 * Consider using archiveWorkspace() instead.
 */
export async function deleteWorkspace(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { error } = await supabase
    .from('workspaces')
    .delete()
    .eq('id', workspaceId)
    .eq('owner_id', user.id)

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
    .eq('owner_id', user.id)
    .eq('is_archived', false)
    .order('created_at', { ascending: true })
    .limit(1)

  // Return existing workspace if found
  if (existingWorkspaces && existingWorkspaces.length > 0) {
    return existingWorkspaces[0] as Workspace
  }

  // Create default workspace
  return await createWorkspace(
    'Personal Workspace',
    'Your default workspace'
  )
}
