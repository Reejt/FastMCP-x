/**
 * Workspace Instructions Service Layer
 * Handles all interactions with the workspace_instructions table
 */

import { createClient } from './server'
import type { WorkspaceInstruction } from '@/app/types'

/**
 * Get all instructions for a workspace
 */
export async function getWorkspaceInstructions(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('workspace_instructions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching workspace instructions:', error)
    throw error
  }

  return data as WorkspaceInstruction[]
}

/**
 * Get a specific instruction by ID
 */
export async function getInstructionById(instructionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('workspace_instructions')
    .select('*')
    .eq('id', instructionId)
    .single()

  if (error) {
    console.error('Error fetching instruction:', error)
    throw error
  }

  return data as WorkspaceInstruction
}

/**
 * Create a new instruction
 */
export async function createInstruction(
  workspaceId: string,
  title: string,
  instructions: string,
  isActive?: boolean
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  // Validate inputs
  if (!title || title.trim().length === 0) {
    throw new Error('Instruction title cannot be empty')
  }

  if (!instructions || instructions.trim().length === 0) {
    throw new Error('Instruction content cannot be empty')
  }

  const { data, error } = await supabase
    .from('workspace_instructions')
    .insert({
      workspace_id: workspaceId,
      title: title.trim(),
      instructions: instructions.trim(),
      is_active: isActive || false,
      user_id: user.id
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating instruction:', error)
    throw error
  }

  return data as WorkspaceInstruction
}

/**
 * Update an existing instruction
 */
export async function updateInstruction(
  instructionId: string,
  updates: {
    title?: string
    content?: string
    instructions?: string | null
  }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  // Validate inputs if provided
  if (updates.title !== undefined) {
    if (!updates.title || updates.title.trim().length === 0) {
      throw new Error('Instruction title cannot be empty')
    }
    updates.title = updates.title.trim()
  }

  // Map content to instructions column in database
  const dbUpdates: any = { ...updates }
  if (updates.content !== undefined) {
    dbUpdates.instructions = updates.content.trim()
    delete dbUpdates.content
  }

  if (dbUpdates.instructions !== undefined && dbUpdates.instructions !== null) {
    dbUpdates.instructions = dbUpdates.instructions.trim() || null
  }

  const { data, error } = await supabase
    .from('workspace_instructions')
    .update(dbUpdates)
    .eq('id', instructionId)
    .select()
    .single()

  if (error) {
    console.error('Error updating instruction:', error)
    throw error
  }

  return data as WorkspaceInstruction
}

/**
 * Activate an instruction (deactivates all others in the workspace)
 */
export async function activateInstruction(instructionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  // First, get the instruction to find its workspace
  const instruction = await getInstructionById(instructionId)

  // Deactivate all instructions in the workspace
  await deactivateAllInstructions(instruction.workspace_id)

  // Activate the target instruction
  const { data, error } = await supabase
    .from('workspace_instructions')
    .update({ is_active: true })
    .eq('id', instructionId)
    .select()
    .single()

  if (error) {
    console.error('Error activating instruction:', error)
    throw error
  }

  return data as WorkspaceInstruction
}

/**
 * Deactivate an instruction
 */
export async function deactivateInstruction(instructionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('workspace_instructions')
    .update({ is_active: false })
    .eq('id', instructionId)
    .select()
    .single()

  if (error) {
    console.error('Error deactivating instruction:', error)
    throw error
  }

  return data as WorkspaceInstruction
}

/**
 * Deactivate all instructions in a workspace
 * Helper function used before activating a new instruction
 */
export async function deactivateAllInstructions(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { error } = await supabase
    .from('workspace_instructions')
    .update({ is_active: false })
    .eq('workspace_id', workspaceId)
    .eq('is_active', true) // Only update currently active ones

  if (error) {
    console.error('Error deactivating instructions:', error)
    throw error
  }

  return true
}

/**
 * Delete an instruction permanently
 */
export async function deleteInstruction(instructionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { error } = await supabase
    .from('workspace_instructions')
    .delete()
    .eq('id', instructionId)

  if (error) {
    console.error('Error deleting instruction:', error)
    throw error
  }

  return true
}

/**
 * Switch active instruction (deactivate current, activate new)
 * More efficient than calling deactivate + activate separately
 */
export async function switchActiveInstruction(
  workspaceId: string,
  newInstructionId: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  // Verify the new instruction exists and belongs to this workspace
  const newInstruction = await getInstructionById(newInstructionId)

  if (newInstruction.workspace_id !== workspaceId) {
    throw new Error('Instruction does not belong to this workspace')
  }

  // Deactivate all instructions in workspace
  await deactivateAllInstructions(workspaceId)

  // Activate the new instruction
  const { data, error } = await supabase
    .from('workspace_instructions')
    .update({ is_active: true })
    .eq('id', newInstructionId)
    .select()
    .single()

  if (error) {
    console.error('Error switching active instruction:', error)
    throw error
  }

  return data as WorkspaceInstruction
}
