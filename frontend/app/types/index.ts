// ============================================
// Database Schema Types (matching Supabase tables)
// ============================================

/**
 * Workspace from `workspaces` table
 * Represents a user's workspace for organizing documents and instructions
 */
export interface Workspace {
  id: string                    // UUID primary key
  name: string                  // Workspace name (required, non-empty)
  description: string | null    // Optional description
  owner_id: string              // Foreign key to auth.users(id)
  created_at: string            // ISO timestamp
  updated_at: string            // ISO timestamp (auto-updated)
  is_archived: boolean          // Soft delete flag
}

/**
 * Document from `vault_documents` table
 * Stores document metadata with workspace association
 */
export interface VaultDocument {
  document_id: string           // UUID primary key
  user_id: string               // Foreign key to auth.users(id)
  workspace_id: string | null   // Foreign key to workspaces(id), optional for backward compat
  file_name: string             // Original filename
  file_path: string             // Storage path: {workspace_id}/{timestamp}_{filename}
  file_size: number             // File size in bytes
  file_type: string             // MIME type
  upload_timestamp: string      // ISO timestamp
  metadata: Record<string, any> // JSONB metadata
  created_at: string            // ISO timestamp
  updated_at: string            // ISO timestamp (auto-updated)
}

/**
 * Workspace Instruction from `workspace_instructions` table
 * Custom AI system instructions per workspace
 */
export interface WorkspaceInstruction {
  id: string                    // UUID primary key
  workspace_id: string          // Foreign key to workspaces(id)
  title: string                 // Instruction title
  content: string               // Full instruction prompt
  is_active: boolean            // Only one can be active per workspace
  created_at: string            // ISO timestamp
  updated_at: string            // ISO timestamp (auto-updated)
}

/**
 * Workspace Summary (from view)
 * Quick overview with document count
 */
export interface WorkspaceSummary extends Workspace {
  document_count: number        // Count of documents in workspace
}

// ============================================
// UI/Application Types
// ============================================

export interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: Date
  isStreaming?: boolean
}

/**
 * @deprecated Use VaultDocument instead
 * Legacy interface for backward compatibility
 */
export interface VaultFile {
  id: string
  name: string
  type: string
  size: number
  uploadedAt: Date
  path: string
}

/**
 * @deprecated Use WorkspaceInstruction instead
 * Legacy interface for backward compatibility
 */
export interface Instruction {
  id: string
  title: string
  content: string
  createdAt: Date
}

export interface User {
  id: string
  email: string
  role: 'user' | 'admin'
  name?: string
}

export interface ChatSession {
  id: string
  workspaceId?: string
  messages: Message[]
  createdAt: Date
  updatedAt: Date
}
