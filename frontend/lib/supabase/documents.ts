/**
 * Vault Documents Service Layer
 * Handles all interactions with the vault_documents table
 */

import { createClient } from './server'
import type { VaultDocument } from '@/app/types'

/**
 * Get all documents for the current user
 * Optionally filter by workspace_id
 */
export async function getUserDocuments(workspaceId?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  let query = supabase
    .from('vault_documents')
    .select('*')
    .eq('user_id', user.id)
    .order('upload_timestamp', { ascending: false })

  // Filter by workspace if provided
  if (workspaceId) {
    query = query.eq('workspace_id', workspaceId)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching documents:', error)
    throw error
  }

  return data as VaultDocument[]
}

/**
 * Get a specific document by ID
 */
export async function getDocumentById(documentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('vault_documents')
    .select('*')
    .eq('document_id', documentId)
    .eq('user_id', user.id)
    .single()

  if (error) {
    console.error('Error fetching document:', error)
    throw error
  }

  return data as VaultDocument
}

/**
 * Get document count for a workspace
 */
export async function getWorkspaceDocumentCount(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { count, error } = await supabase
    .from('vault_documents')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)

  if (error) {
    console.error('Error counting documents:', error)
    throw error
  }

  return count || 0
}

/**
 * Move document to a different workspace
 */
export async function moveDocumentToWorkspace(
  documentId: string,
  workspaceId: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('vault_documents')
    .update({ workspace_id: workspaceId })
    .eq('document_id', documentId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    console.error('Error moving document:', error)
    throw error
  }

  return data as VaultDocument
}

/**
 * Delete a document (removes from storage and database)
 */
export async function deleteDocument(documentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  // First, get the document to get the file path
  const document = await getDocumentById(documentId)

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('vault_files')
    .remove([document.file_path])

  if (storageError) {
    console.warn('Storage deletion error (continuing with DB deletion):', storageError)
  }

  // Delete from database
  const { error: dbError } = await supabase
    .from('vault_documents')
    .delete()
    .eq('document_id', documentId)
    .eq('user_id', user.id)

  if (dbError) {
    console.error('Database deletion error:', dbError)
    throw dbError
  }

  return true
}

/**
 * Get signed URL for downloading a document
 */
export async function getDocumentDownloadUrl(
  documentId: string,
  expiresIn: number = 60
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  // Get document to verify ownership and get path
  const document = await getDocumentById(documentId)

  // Generate signed URL
  const { data, error } = await supabase.storage
    .from('vault_files')
    .createSignedUrl(document.file_path, expiresIn)

  if (error) {
    console.error('Error creating signed URL:', error)
    throw error
  }

  return data.signedUrl
}
