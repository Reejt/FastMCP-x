/**
 * Embeddings Service Layer
 * Handles all interactions with the document_embeddings table
 */

import { createClient } from './server'
import type { DocumentEmbedding } from '@/app/types'

/**
 * Store document chunk embeddings
 */
export async function storeEmbeddings(
  fileId: string,
  userId: string,
  fileName: string,
  chunks: Array<{
    index: number
    content: string
    embedding: number[]
  }>
) {
  const supabase = await createClient()

  if (!userId) {
    throw new Error('User not authenticated')
  }

  if (chunks.length === 0) {
    throw new Error('No chunks provided')
  }

  // Prepare records for batch insert
  const records = chunks.map((chunk) => ({
    file_id: fileId,
    user_id: userId,
    chunk_index: chunk.index,
    content: chunk.content,
    embedding: chunk.embedding,
    file_name: fileName,
  }))

  const { data, error } = await supabase
    .from('document_embeddings')
    .insert(records)
    .select()

  if (error) {
    console.error('Error storing embeddings:', error)
    throw error
  }

  return data as DocumentEmbedding[]
}

/**
 * Get all embeddings for a file
 */
export async function getFileEmbeddings(fileId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('document_embeddings')
    .select('*')
    .eq('file_id', fileId)
    .eq('user_id', user.id)
    .order('chunk_index', { ascending: true })

  if (error) {
    console.error('Error fetching embeddings:', error)
    throw error
  }

  return data as DocumentEmbedding[]
}

/**
 * Get embeddings for multiple files
 */
export async function getWorkspaceEmbeddings(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('document_embeddings')
    .select('*')
    .eq('user_id', user.id)
    .in('file_id', (await getWorkspaceFileIds(workspaceId)))

  if (error) {
    console.error('Error fetching workspace embeddings:', error)
    throw error
  }

  return data as DocumentEmbedding[]
}

/**
 * Delete embeddings for a file
 */
export async function deleteFileEmbeddings(fileId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { error } = await supabase
    .from('document_embeddings')
    .delete()
    .eq('file_id', fileId)
    .eq('user_id', user.id)

  if (error) {
    console.error('Error deleting embeddings:', error)
    throw error
  }

  return true
}

/**
 * Get embedding count for a file
 */
export async function getFileEmbeddingCount(fileId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { count, error } = await supabase
    .from('document_embeddings')
    .select('*', { count: 'exact', head: true })
    .eq('file_id', fileId)
    .eq('user_id', user.id)

  if (error) {
    console.error('Error counting embeddings:', error)
    throw error
  }

  return count || 0
}

/**
 * Helper: Get all file IDs for a workspace
 */
async function getWorkspaceFileIds(workspaceId: string): Promise<string[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('file_upload')
    .select('id')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)

  if (error) {
    throw error
  }

  return data.map((f) => f.id)
}
