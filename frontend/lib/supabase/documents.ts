/**
 * Files Service Layer
 * Handles all interactions with the files and document_content tables
 */

import { createClient } from './server'
import type { File, DocumentContent } from '@/app/types'

/**
 * Get all files for a workspace
 */
export async function getWorkspaceFiles(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  // Verify workspace belongs to user
  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (workspaceError || !workspace) {
    throw new Error('Workspace not found or access denied')
  }

  const { data, error } = await supabase
    .from('file_upload')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('uploaded_at', { ascending: false })

  if (error) {
    console.error('Error fetching files:', error)
    throw error
  }

  return data as File[]
}

/**
 * Get a specific file by ID
 */
export async function getFileById(fileId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('file_upload')
    .select('*')
    .eq('id', fileId)
    .is('deleted_at', null)
    .single()

  if (error) {
    console.error('Error fetching file:', error)
    throw error
  }

  return data as File
}

/**
 * Get file count for a workspace
 */
export async function getWorkspaceFileCount(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { count, error } = await supabase
    .from('file_upload')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)

  if (error) {
    console.error('Error counting files:', error)
    throw error
  }

  return count || 0
}

/**
 * Move file to a different workspace
 */
export async function moveFileToWorkspace(
  fileId: string,
  workspaceId: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('file_upload')
    .update({ workspace_id: workspaceId })
    .eq('id', fileId)
    .select()
    .single()

  if (error) {
    console.error('Error moving file:', error)
    throw error
  }

  return data as File
}

/**
 * Soft delete a file (sets deleted_at timestamp)
 */
export async function deleteFile(fileId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('file_upload')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', fileId)
    .select()
    .single()

  if (error) {
    console.error('Error deleting file:', error)
    throw error
  }

  return data as File
}

/**
 * Get signed URL for downloading a file
 */
export async function getFileDownloadUrl(
  fileId: string,
  expiresIn: number = 60
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  // Get file to verify ownership and get path
  const file = await getFileById(fileId)

  // Generate signed URL
  const { data, error } = await supabase.storage
    .from('vault_files')
    .createSignedUrl(file.file_path, expiresIn)

  if (error) {
    console.error('Error creating signed URL:', error)
    throw error
  }

  return data.signedUrl
}

/**
 * Store extracted text content for a file
 * Creates or updates document_content table entry
 */
export async function storeDocumentContent(
  fileId: string,
  content: string,
  fileName: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  if (!content || content.trim().length === 0) {
    throw new Error('Document content cannot be empty')
  }

  const { data, error } = await supabase
    .from('document_content')
    .upsert(
      {
        file_id: fileId,
        user_id: user.id,
        content: content.trim(),
        file_name: fileName,
        extracted_at: new Date().toISOString()
      },
      { onConflict: 'file_id' }
    )
    .select()
    .single()

  if (error) {
    console.error('Error storing document content:', error)
    throw error
  }

  return data as DocumentContent
}

/**
 * Get stored content for a file
 */
export async function getDocumentContent(fileId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('document_content')
    .select('*')
    .eq('file_id', fileId)
    .eq('user_id', user.id)
    .single()

  if (error) {
    console.error('Error fetching document content:', error)
    throw error
  }

  return data as DocumentContent
}

/**
 * Delete document content
 */
export async function deleteDocumentContent(fileId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { error } = await supabase
    .from('document_content')
    .delete()
    .eq('file_id', fileId)
    .eq('user_id', user.id)

  if (error) {
    console.error('Error deleting document content:', error)
    throw error
  }

  return true
}
