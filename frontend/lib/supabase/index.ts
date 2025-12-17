/**
 * Supabase Service Layer Exports
 * Centralized exports for all Supabase service functions
 * 
 * Exported tables:
 * - auth.users: Authentication via supabase.auth.getUser()
 * - workspaces: User workspace management
 * - file_upload: File metadata and storage
 * - document_content: Extracted text content
 * - document_embeddings: Vector embeddings for semantic search
 * - workspace_instructions: Custom workspace instructions
 * - chats: Chat messages and conversation history
 */

// Re-export client
export { createClient } from './client'

// Re-export workspace functions
export {
  getUserWorkspaces,
  getWorkspaceById,
  createWorkspace,
  updateWorkspace,
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

// Re-export instruction functions
export {
  getWorkspaceInstructions,
  getInstructionById,
  createInstruction,
  updateInstruction,
  activateInstruction,
  deactivateInstruction,
  deactivateAllInstructions,
  deleteInstruction,
  switchActiveInstruction
} from './instructions'
