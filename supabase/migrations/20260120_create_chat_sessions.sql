-- Migration: Create chat_sessions table
-- Created: 2026-01-20
-- Description: Add persistent chat sessions for workspace conversations
-- Purpose: Each workspace can have multiple chat sessions with isolated message history

-- ============================================================================
-- TABLE: chat_sessions
-- ============================================================================
-- Stores metadata for chat conversation threads within workspaces
-- Each session represents an isolated conversation context

CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  
  -- Constraints
  CONSTRAINT chat_session_title_not_empty CHECK (char_length(trim(title)) > 0)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Foreign key index for workspace lookups
CREATE INDEX idx_chat_sessions_workspace_id ON chat_sessions(workspace_id);

-- Foreign key index for user lookups
CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);

-- Index for chronological ordering (newest first)
CREATE INDEX idx_chat_sessions_created_at ON chat_sessions(created_at DESC);

-- Partial index for active (non-deleted) sessions
CREATE INDEX idx_chat_sessions_active 
  ON chat_sessions(workspace_id, deleted_at) 
  WHERE deleted_at IS NULL;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp on row modification
CREATE TRIGGER update_chat_sessions_updated_at
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on chat_sessions table
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own sessions
CREATE POLICY "Users can view their own chat sessions"
  ON chat_sessions FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Users can create their own sessions
CREATE POLICY "Users can create their own chat sessions"
  ON chat_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own sessions
CREATE POLICY "Users can update their own chat sessions"
  ON chat_sessions FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete (soft delete) their own sessions
CREATE POLICY "Users can delete their own chat sessions"
  ON chat_sessions FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE chat_sessions IS 'Chat conversation threads within workspaces. Each session represents an isolated conversation context with its own message history.';
COMMENT ON COLUMN chat_sessions.id IS 'Unique session identifier (UUID)';
COMMENT ON COLUMN chat_sessions.workspace_id IS 'Foreign key to workspaces table';
COMMENT ON COLUMN chat_sessions.user_id IS 'Foreign key to auth.users table';
COMMENT ON COLUMN chat_sessions.title IS 'Session title (auto-generated from first message or user-defined)';
COMMENT ON COLUMN chat_sessions.created_at IS 'Session creation timestamp';
COMMENT ON COLUMN chat_sessions.updated_at IS 'Last update timestamp (auto-updated)';
COMMENT ON COLUMN chat_sessions.deleted_at IS 'Soft delete timestamp (NULL = active, non-NULL = deleted)';
