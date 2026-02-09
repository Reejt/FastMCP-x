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
  description?: string | null   // Optional workspace description
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
  extracted_at: string | null   // ISO timestamp (nullable)
  created_at: string | null     // ISO timestamp (nullable)
  updated_at: string | null     // ISO timestamp (nullable)
}

/**
 * Document Embedding from `document_embeddings` table
 * Stores vector embeddings for semantic search
 */
export interface DocumentEmbedding {
  id: string                    // UUID primary key
  user_id: string               // Foreign key to auth.users(id) (NOT nullable)
  file_id: string               // Foreign key to file_upload(id) (NOT nullable)
  chunk_index: number           // Index of the chunk within document (integer, NOT nullable)
  chunk_text: string            // Original text chunk (NOT nullable)
  embedding: number[]           // Vector embedding array (NOT nullable, USER-DEFINED vector type)
  metadata: Record<string, unknown> | null // Optional metadata as JSONB (nullable)
  created_at: string            // ISO timestamp with time zone (NOT nullable)
  updated_at: string            // ISO timestamp with time zone (NOT nullable)
}

/**
 * Chat from `chats` table
 * Stores chat messages and conversations
 */
export interface Chat {
  id: string                    // UUID primary key
  workspace_id: string          // Foreign key to workspaces(id) (NOT nullable after migration)
  user_id: string               // Foreign key to auth.users(id) (NOT nullable after migration)
  session_id: string            // Foreign key to chat_sessions(id) (NOT nullable)
  role: string                  // Message role (user, assistant, system, etc.) (NOT nullable)
  message: string               // Chat message content (NOT nullable)
  created_at: string            // ISO timestamp with time zone (NOT nullable)
}

/**
 * Workspace Instruction from `workspace_instructions` table
 * Stores custom instructions for workspaces
 */
export interface WorkspaceInstruction {
  id: string                    // UUID primary key
  workspace_id: string          // Foreign key to workspaces(id) (NOT nullable)
  title: string                 // Instruction title (NOT nullable)
  instructions: string          // Instruction content/prompt (NOT nullable)
  is_active?: boolean           // Whether this instruction is active (nullable)
  user_id?: string | null       // User who created the instruction (nullable)
  created_at: string            // ISO timestamp (NOT nullable)
  updated_at: string            // ISO timestamp (auto-updated, NOT nullable)
}

/**
 * Structured Data from `structured_data` table
 * Stores CSV/Excel file data as JSONB rows
 */
export interface StructuredData {
  id: string                    // UUID primary key
  file_id: string               // Foreign key to file_upload(id) (NOT nullable)
  workspace_id: string          // Foreign key to workspaces(id) (NOT nullable)
  file_name: string             // Original file name (NOT nullable)
  file_type: "csv" | "excel"    // File type indicator (NOT nullable)
  data: Record<string, unknown> // JSONB column storing the actual data row (NOT nullable)
  created_at: string            // ISO timestamp with time zone (NOT nullable)
  updated_at: string            // ISO timestamp with time zone (NOT nullable)
}

// ============================================
// UI/Application Types
// ============================================

export interface Message {
  id: string
  content: string
  role: 'user' | 'assistant' | 'system'
  timestamp: Date
  session_id?: string           // Optional: Links message to session for proper scoping
  isStreaming?: boolean
  connectorSource?: string      // Source connector type (e.g., 'gdrive', 'slack')
  connectorSourceName?: string  // Display name of source connector
  connectorAuthRequired?: {     // Set when connector auth is needed
    connector: string
    name: string
    authUrl: string
    query?: string               // Original query to retry after auth
    userId?: string              // User ID for retrying query
  }
}

export interface User {
  id: string
  email: string
  role: 'user' | 'admin'
  name?: string
}

/**
 * ChatSession from `chat_sessions` table
 * Represents an isolated conversation thread within a workspace
 */
export interface ChatSession {
  id: string                    // UUID primary key
  workspace_id: string          // Foreign key to workspaces(id) (NOT nullable)
  user_id: string               // Foreign key to auth.users(id) (NOT nullable)
  title: string                 // Session title (default: "New Chat")
  created_at: string            // ISO timestamp with time zone
  updated_at: string            // ISO timestamp with time zone (auto-updated)
  deleted_at: string | null     // Soft delete timestamp (nullable)
  messages?: Message[]          // Frontend-only: Loaded separately from chats table
}

// ============================================
// Type Conversion Helpers
// ============================================

/**
 * Convert database Chat type to UI Message type
 * Handles field name differences and type conversions
 */
export function chatToMessage(chat: Chat): Message {
  return {
    id: chat.id,
    content: chat.message,        // DB: message → UI: content
    role: chat.role as 'user' | 'assistant',
    timestamp: new Date(chat.created_at),  // string → Date conversion
    session_id: chat.session_id
  }
}

/**
 * Convert array of Chat to array of Message
 */
export function chatsToMessages(chats: Chat[]): Message[] {
  return chats.map(chatToMessage)
}
