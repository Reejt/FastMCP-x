/**
 * Supabase Service Layer Exports
 * Centralized exports for all Supabase service functions
 */

// Re-export client
export { createClient } from './client'

// Re-export workspace functions
export {
  getUserWorkspaces,
  getWorkspaceSummaries,
  getWorkspaceById,
  createWorkspace,
  updateWorkspace,
  archiveWorkspace,
  unarchiveWorkspace,
  deleteWorkspace,
  getOrCreateDefaultWorkspace
} from './workspaces'

// Re-export chat functions
export {
  getWorkspaceChats,
  getChatById,
  createChatMessage,
  deleteChatMessage,
  deleteWorkspaceChats,
  getWorkspaceChatCount
} from './chats'

// Re-export file functions
export {
  getWorkspaceFiles,
  getFileById,
  getWorkspaceFileCount,
  moveFileToWorkspace,
  deleteFile,
  getFileDownloadUrl,
  storeDocumentContent,
  getDocumentContent,
  deleteDocumentContent
} from './documents'

// Re-export embedding functions
export {
  storeEmbeddings,
  getFileEmbeddings,
  getWorkspaceEmbeddings,
  deleteFileEmbeddings,
  getFileEmbeddingCount
} from './embeddings'
