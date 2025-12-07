// ============================================
// Database Schema Types (matching Supabase tables)
// ============================================

/**
 * User from `auth.users` table
 * Built-in Supabase authentication table
 */
export interface AuthUser {
  id: string                    // UUID primary key
  email: string                 // User email (not nullable)
  role: string | null           // User role (nullable)
  created_at: string            // ISO timestamp with time zone
  updated_at: string            // ISO timestamp with time zone
}

/**
 * Workspace from `workspaces` table
 * Represents a user's workspace for organizing documents and instructions
 */
export interface Workspace {
  id: string                    // UUID primary key
  user_id: string               // Foreign key to auth.users(id)
  name: string                  // Workspace name (required, non-empty)
  created_at: string            // ISO timestamp
  updated_at: string            // ISO timestamp (auto-updated)
}

/**
 * File from `file_upload` table
 * Stores document/file metadata
 */
export interface File {
  id: string                    // UUID primary key
  workspace_id: string          // Foreign key to workspaces(id)
  user_id: string               // Foreign key to auth.users(id)
  file_name: string             // Original filename
  file_type: string             // File type (text, mime type, etc.)
  file_path: string             // Storage path
  size_bytes: number            // File size in bytes
  status: string                // Upload status
  uploaded_at: string           // ISO timestamp
  created_at: string            // ISO timestamp
  updated_at: string            // ISO timestamp (auto-updated)
  deleted_at: string | null     // ISO timestamp (soft delete)
}

/**
 * Document Content from `document_content` table
 * Stores extracted text content from files
 */
export interface DocumentContent {
  id: string                    // UUID primary key
  file_id: string               // Foreign key to file_upload(id)
  user_id: string               // Foreign key to auth.users(id)
  content: string               // Extracted text content (not nullable)
  file_name: string | null      // Original file name (nullable)
  extracted_at: string          // ISO timestamp without time zone (nullable)
  created_at: string            // ISO timestamp without time zone (nullable)
  updated_at: string            // ISO timestamp without time zone (nullable)
}

/**
 * Document Embedding from `document_embeddings` table
 * Stores vector embeddings for semantic search
 */
export interface DocumentEmbedding {
  id: string                    // UUID primary key
  user_id: string               // Foreign key to auth.users(id)
  file_id: string               // Foreign key to file_upload(id)
  chunk_index: number           // Index of the chunk within document
  chunk_text: string            // Original text chunk
  embedding: number[]           // Vector embedding array (USER-DEFINED vector type)
  metadata: Record<string, any> // Optional metadata as JSONB
  created_at: string            // ISO timestamp
  updated_at: string            // ISO timestamp (auto-updated)
}

/**
 * Chat from `chats` table
 * Stores chat messages and conversations
 */
export interface Chat {
  id: string                    // UUID primary key
  workspace_id: string          // Foreign key to workspaces(id) (nullable)
  user_id: string               // Foreign key to auth.users(id) (nullable)
  role: string                  // Message role (user, assistant, system, etc.)
  message: string               // Chat message content
  created_at: string            // ISO timestamp with time zone
}

/**
 * Workspace Instruction from `workspace_instructions` table
 * Stores custom instructions for workspaces
 */
export interface WorkspaceInstruction {
  id: string                    // UUID primary key
  workspace_id: string          // Foreign key to workspaces(id)
  title: string                 // Instruction title
  instructions: string          // Instruction content (text)
  is_active: boolean            // Whether this instruction is active
  created_at: string            // ISO timestamp
  updated_at: string            // ISO timestamp (auto-updated)
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
