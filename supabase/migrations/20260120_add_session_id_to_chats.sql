-- Migration: Add session_id to chats table
-- Created: 2026-01-20
-- Description: Link chat messages to sessions for isolated conversation contexts
-- Purpose: Migrate existing messages to legacy sessions and enable session-based chat

-- ============================================================================
-- STEP 1: Add session_id column (nullable initially for migration)
-- ============================================================================

ALTER TABLE chats 
ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE;

-- ============================================================================
-- STEP 2: Create legacy sessions for existing messages
-- ============================================================================
-- Groups all existing messages by workspace into one "Legacy Chat" session per workspace
-- This preserves existing conversation history while enabling new session-based chats

DO $$
DECLARE
  workspace_record RECORD;
  legacy_session_id UUID;
  first_message_time TIMESTAMPTZ;
  last_message_time TIMESTAMPTZ;
BEGIN
  -- Loop through each workspace that has messages
  FOR workspace_record IN 
    SELECT DISTINCT 
      workspace_id, 
      user_id,
      MIN(created_at) as first_msg,
      MAX(created_at) as last_msg
    FROM chats 
    WHERE workspace_id IS NOT NULL 
      AND session_id IS NULL
    GROUP BY workspace_id, user_id
  LOOP
    -- Create a legacy session for this workspace
    INSERT INTO chat_sessions (
      workspace_id, 
      user_id, 
      title, 
      created_at, 
      updated_at
    )
    VALUES (
      workspace_record.workspace_id,
      workspace_record.user_id,
      'Legacy Chat',
      workspace_record.first_msg,
      workspace_record.last_msg
    )
    RETURNING id INTO legacy_session_id;
    
    -- Update all messages in this workspace to use the legacy session
    UPDATE chats
    SET session_id = legacy_session_id
    WHERE workspace_id = workspace_record.workspace_id
      AND user_id = workspace_record.user_id
      AND session_id IS NULL;
    
    RAISE NOTICE 'Created legacy session % for workspace %', legacy_session_id, workspace_record.workspace_id;
  END LOOP;
END $$;

-- ============================================================================
-- STEP 3: Make session_id NOT NULL
-- ============================================================================
-- Now that all existing messages have a session_id, we can enforce the constraint

ALTER TABLE chats 
ALTER COLUMN session_id SET NOT NULL;

-- ============================================================================
-- STEP 4: Add index on session_id for performance
-- ============================================================================

CREATE INDEX idx_chats_session_id ON chats(session_id);

-- Composite index for fetching messages by session (ordered chronologically)
CREATE INDEX idx_chats_session_created ON chats(session_id, created_at);

-- ============================================================================
-- STEP 5: Update RLS policies (if needed)
-- ============================================================================
-- Existing policies on chats table should still work since we're only adding a column
-- Users can only see messages in sessions they own (enforced via session_id FK)

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN chats.session_id IS 'Foreign key to chat_sessions table. Groups messages into isolated conversation contexts.';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these queries after migration to verify success:

-- Check that all messages have a session_id
-- SELECT COUNT(*) as orphaned_messages FROM chats WHERE session_id IS NULL;
-- Expected: 0

-- Count legacy sessions created
-- SELECT COUNT(*) as legacy_sessions FROM chat_sessions WHERE title = 'Legacy Chat';

-- View legacy sessions with message counts
-- SELECT 
--   cs.id, 
--   cs.workspace_id, 
--   cs.title, 
--   cs.created_at,
--   COUNT(c.id) as message_count
-- FROM chat_sessions cs
-- LEFT JOIN chats c ON c.session_id = cs.id
-- WHERE cs.title = 'Legacy Chat'
-- GROUP BY cs.id, cs.workspace_id, cs.title, cs.created_at
-- ORDER BY cs.created_at DESC;
