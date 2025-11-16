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

// Re-export instruction functions
export {
  getWorkspaceInstructions,
  getActiveInstruction,
  getInstructionById,
  createInstruction,
  updateInstruction,
  activateInstruction,
  deactivateInstruction,
  deactivateAllInstructions,
  deleteInstruction,
  switchActiveInstruction
} from './instructions'

// Re-export document functions
export {
  getUserDocuments,
  getDocumentById,
  getWorkspaceDocumentCount,
  moveDocumentToWorkspace,
  deleteDocument,
  getDocumentDownloadUrl
} from './documents'
