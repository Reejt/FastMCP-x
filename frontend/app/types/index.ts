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
  user_id: string               // Foreign key to auth.users(id)
  created_at: string            // ISO timestamp
  updated_at: string            // ISO timestamp (auto-updated)
  is_archived: boolean          // Soft delete flag
}

/**
 * File from `files` table
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
  deleted_at: string | null     // ISO timestamp (soft delete)
}

/**
 * Chat from `chats` table
 * Stores chat messages and conversations
 */
export interface Chat {
  id: string                    // UUID primary key
  workspace_id: string          // Foreign key to workspaces(id)
  user_id: string               // Foreign key to auth.users(id)
  role: string                  // Message role (user, assistant, system, etc.)
  message: string               // Chat message content
  created_at: string            // ISO timestamp
}

/**
 * Document Content from `document_content` table
 * Stores extracted text content from files
 */
export interface DocumentContent {
  id: string                    // UUID primary key
  file_id: string               // Foreign key to files(id)
  user_id: string               // Foreign key to auth.users(id)
  content: string               // Extracted text content
  file_name: string             // Original file name
  extracted_at: string          // ISO timestamp
  created_at: string            // ISO timestamp
  updated_at: string            // ISO timestamp
}

/**
 * Document Embedding from `document_embeddings` table
 * Stores vector embeddings for semantic search
 */
export interface DocumentEmbedding {
  id: string                    // UUID primary key
  file_id: string               // Foreign key to files(id)
  user_id: string               // Foreign key to auth.users(id)
  chunk_index: number           // Index of the chunk within document
  content: string               // Original text chunk
  embedding: number[]           // Vector embedding array
  file_name: string             // Original file name
  created_at: string            // ISO timestamp
  updated_at: string            // ISO timestamp
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
