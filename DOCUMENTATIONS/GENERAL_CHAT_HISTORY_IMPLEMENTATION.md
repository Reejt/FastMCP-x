# Adding Chat History to Main Chat (General Chat)

**Status:** 📋 Documentation  
**Date:** February 17, 2026  
**Purpose:** Add persistent chat history to the General Chat feature, matching the functionality of Workspace Chats

---

## Current State Analysis

### Workspace Chats (✅ With History)
- **Storage:** Persisted in `chat_sessions` and `chats` tables
- **Database Schema:**
  - `chat_sessions` table stores session metadata (id, workspace_id, user_id, title, created_at, updated_at, deleted_at)
  - `chats` table stores individual messages (id, session_id, workspace_id, user_id, role, message, created_at)
- **Frontend Flow:**
  - User selects workspace
  - `loadWorkspaceChat()` fetches chat history via `/api/chats?workspaceId={id}`
  - Messages converted from `Chat` type to `Message` type
  - Messages displayed in chat interface
  - New messages saved via POST `/api/chats` with sessionId
- **Sidebar:** Shows list of chat sessions for each workspace

### General Chat (❌ No History)
- **Storage:** Ephemeral (in-memory only)
- **Current Implementation:**
  ```typescript
  // In dashboard/page.tsx loadGeneralChat()
  const loadGeneralChat = async () => {
    const newSession: ChatSession = {
      id: 'general_chat',
      workspace_id: '',
      user_id: '',
      title: 'General Chat',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      messages: []
    }
    setMessages([])
    setCurrentChatId(newSession.id)
    // ...
  }
  ```
- **Problem:** Messages are cleared on page refresh; no persistent history
- **User Experience:** Users lose conversation context when navigating away or refreshing

---

## Implementation Plan

### Phase 1: Database Schema Updates

#### 1.1 Update `chat_sessions` table
**File:** Database migration or direct SQL  
**Changes:**
- Make `workspace_id` nullable (currently required)
- Add constraint to handle general chat sessions (workspace_id = NULL)

```sql
-- Update chat_sessions to allow nullable workspace_id for general chat
ALTER TABLE chat_sessions 
ALTER COLUMN workspace_id DROP NOT NULL;

-- Add check constraint to ensure either workspace_id or is_general is set
ALTER TABLE chat_sessions 
ADD CONSTRAINT general_or_workspace CHECK (
  (workspace_id IS NOT NULL AND workspace_id != '') 
  OR workspace_id IS NULL
);

-- Add index for general chat sessions (workspace_id IS NULL)
CREATE INDEX idx_chat_sessions_general_user 
ON chat_sessions(user_id, created_at) 
WHERE workspace_id IS NULL;
```

#### 1.2 Update `chats` table
**File:** Database migration or direct SQL  
**Changes:**
- Make `workspace_id` nullable (currently required)
- Ensure consistency with chat_sessions relationship

```sql
-- Update chats to allow nullable workspace_id for general chat
ALTER TABLE chats 
ALTER COLUMN workspace_id DROP NOT NULL;

-- Add index for efficient querying of general chat messages
CREATE INDEX idx_chats_general_session 
ON chats(session_id, created_at) 
WHERE workspace_id IS NULL;
```

---

### Phase 2: TypeScript Type Updates

#### 2.1 Update `ChatSession` Interface
**File:** `frontend/app/types/index.ts`  
**Changes:**
- Add optional `is_general_chat` flag for clarity
- Update JSDoc to reflect nullable workspace_id

```typescript
/**
 * ChatSession from `chat_sessions` table
 * Represents an isolated conversation thread within a workspace or general chat
 */
export interface ChatSession {
  id: string                    // UUID primary key
  workspace_id: string | null   // Foreign key to workspaces(id) (nullable for general chat)
  user_id: string               // Foreign key to auth.users(id) (NOT nullable)
  title: string                 // Session title (default: "New Chat")
  created_at: string            // ISO timestamp with time zone
  updated_at: string            // ISO timestamp with time zone (auto-updated)
  deleted_at: string | null     // Soft delete timestamp (nullable)
  is_general_chat?: boolean     // Optional flag indicating this is general chat
  messages?: Message[]          // Frontend-only: Loaded separately from chats table
}
```

#### 2.2 Update `Chat` Interface
**File:** `frontend/app/types/index.ts`  
**Changes:**
- Update JSDoc to reflect nullable workspace_id

```typescript
/**
 * Chat from `chats` table
 * Stores chat messages and conversations (workspace and general)
 */
export interface Chat {
  id: string                    // UUID primary key
  workspace_id: string | null   // Foreign key to workspaces(id) (nullable for general chat)
  user_id: string               // Foreign key to auth.users(id) (NOT nullable)
  session_id: string            // Foreign key to chat_sessions(id) (NOT nullable)
  role: string                  // Message role (user, assistant, system, etc.) (NOT nullable)
  message: string               // Chat message content (NOT nullable)
  created_at: string            // ISO timestamp with time zone (NOT nullable)
}
```

---

### Phase 3: Backend Service Layer Updates

#### 3.1 Create/Update Chats Service Layer
**File:** `frontend/lib/supabase/chats.ts`  
**New Functions to Add:**

```typescript
/**
 * Get general chat session for current user
 * Returns the most recent general chat session or null
 */
export async function getGeneralChatSession(userId: string): Promise<ChatSession | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('user_id', userId)
    .is('workspace_id', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') {
      // No general chat session exists yet
      return null
    }
    throw error
  }
  
  return data as ChatSession
}

/**
 * Create a new general chat session
 */
export async function createGeneralChatSession(
  userId: string,
  title: string = 'General Chat'
): Promise<ChatSession> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({
      user_id: userId,
      workspace_id: null, // null indicates general chat
      title,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null
    })
    .select()
    .single()
  
  if (error) throw error
  
  return data as ChatSession
}

/**
 * Get all messages for general chat session
 */
export async function getGeneralChatMessages(sessionId: string): Promise<Chat[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  
  if (error) throw error
  
  return data as Chat[]
}

/**
 * Save message to general chat
 */
export async function saveGeneralChatMessage(
  userId: string,
  sessionId: string,
  role: string,
  message: string
): Promise<Chat> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('chats')
    .insert({
      user_id: userId,
      session_id: sessionId,
      workspace_id: null, // null for general chat
      role,
      message,
      created_at: new Date().toISOString()
    })
    .select()
    .single()
  
  if (error) throw error
  
  return data as Chat
}

/**
 * Get all general chat sessions for user (for sidebar/history)
 */
export async function getUserGeneralChatSessions(userId: string): Promise<ChatSession[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('user_id', userId)
    .is('workspace_id', null)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
  
  if (error) throw error
  
  return data as ChatSession[]
}
```

---

### Phase 4: API Route Updates

#### 4.1 Update General Chat API Route
**File:** `frontend/app/api/chats/general/route.ts`  
**Purpose:** Save messages to general chat

```typescript
/**
 * POST /api/chats/general
 * Save a message to general chat
 * 
 * Body: { sessionId: string, role: string, message: string }
 */
export async function POST(request: NextRequest) {
  // Save message to general chat
  const chat = await createGeneralChatMessage(sessionId, role, message)
  return NextResponse.json({ success: true, chat })
}
```

#### 4.2 Create General Chat Session API Route
**File:** `frontend/app/api/chats/general/session/route.ts` (New)  
**Purpose:** Get messages, update title, and delete general chat sessions

```typescript
/**
 * GET /api/chats/general/session?sessionId=xxx
 * Fetch all messages for a specific general chat session
 */
export async function GET(request: NextRequest) {
  const chats = await getGeneralChatMessages(sessionId)
  const messages = chatsToMessages(chats)
  return NextResponse.json({ success: true, messages })
}

/**
 * PATCH /api/chats/general/session
 * Update general chat session title
 * 
 * Body: { sessionId: string, title: string }
 */
export async function PATCH(request: NextRequest) {
  const session = await updateGeneralChatSessionTitle(sessionId, title)
  return NextResponse.json({ success: true, session })
}

/**
 * DELETE /api/chats/general/session
 * Soft delete a general chat session
 * 
 * Body: { sessionId: string }
 */
export async function DELETE(request: NextRequest) {
  await deleteGeneralChatSession(sessionId)
  return NextResponse.json({ success: true })
}
```

#### 4.3 Create General Chat Sessions List API Route
**File:** `frontend/app/api/chats/general/sessions/route.ts`  
**Purpose:** List and create general chat sessions

```typescript
/**
 * GET /api/chats/general/sessions
 * Fetch all general chat sessions for the current user
 */
export async function GET(request: NextRequest) {
  const sessions = await getUserGeneralChatSessions()
  return NextResponse.json({ success: true, sessions })
}

/**
 * POST /api/chats/general/sessions
 * Create a new general chat session
 * 
 * Body: { title?: string }
 */
export async function POST(request: NextRequest) {
  const session = await getOrCreateGeneralChatSession(title || 'General Chat')
  return NextResponse.json({ success: true, session })
}
```

---

### Phase 5: Frontend Component Updates

#### 5.1 Update `dashboard/page.tsx`
**File:** `frontend/app/dashboard/page.tsx`  
**Changes:**

```typescript
// Add new state for general chat
const [generalChatSessions, setGeneralChatSessions] = useState<ChatSession[]>([])
const [currentGeneralSessionId, setCurrentGeneralSessionId] = useState<string>('')

// Replace loadGeneralChat function
const loadGeneralChat = async () => {
  if (!user) {
    setMessages([])
    return
  }

  try {
    // Load list of general chat sessions
    const sessionsResponse = await fetch('/api/chats/general/sessions')
    let sessions = sessionsResponse.data.sessions || []

    // If no sessions exist, create one
    let currentSession
    if (sessions.length === 0) {
      const createResponse = await fetch('/api/chats/general/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'General Chat' })
      })
      currentSession = createResponse.data.session
      sessions = [currentSession]
    } else {
      // Use most recent session
      currentSession = sessions[0]
    }

    // Load messages for this session
    const messagesResponse = await fetch(
      `/api/chats/general/session?sessionId=${currentSession.id}`
    )
    const chatMessages = messagesResponse.data.messages || []

    // Update state
    setMessages(chatMessages)
    setCurrentGeneralSessionId(currentSession.id)
    setCurrentChatId(currentSession.id)
    setChatSessions(prev => ({
      ...prev,
      [currentSession.id]: {
        ...currentSession,
        messages: chatMessages,
        is_general_chat: true
      }
    }))

    setGeneralChatSessions(sessions)
    setIsGeneralChat(true)
    setCurrentWorkspaceName('General Chat')
    setCurrentWorkspace(null)
    setWorkspaceChatSessions([])
    setActiveInstruction(null)
    setShowInstructionBanner(false)
  } catch (error) {
    console.error('Error loading general chat:', error)
    setMessages([])
  }
}

// Add new function to load general chat sessions list
const loadGeneralChatSessions = async () => {
  if (!user) return

  try {
    const response = await fetch('/api/chats/general/sessions')
    const result = await response.json()
    setGeneralChatSessions(result.sessions || [])
  } catch (error) {
    console.error('Error loading general chat sessions:', error)
    setGeneralChatSessions([])
  }
}

// Update handleSendMessage to save general chat messages
const handleSendMessage = async (content: string) => {
  // ... existing code ...

  // Save user message if it's a general chat
  if (isGeneralChat && currentGeneralSessionId) {
    try {
      await fetch('/api/chats/general', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentGeneralSessionId,
          role: 'user',
          message: content
        })
      })
    } catch (error) {
      console.error('Error saving user message to general chat:', error)
    }
  }

  // ... rest of the function ...

  // Save assistant response if general chat
  if (isGeneralChat && currentGeneralSessionId && assistantResponse) {
    try {
      await fetch('/api/chats/general', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentGeneralSessionId,
          role: 'assistant',
          message: assistantResponse
        })
      })
    } catch (error) {
      console.error('Error saving assistant message to general chat:', error)
    }
  }
}
```

#### 5.2 Update Sidebar Component
**File:** `frontend/app/components/WorkspaceSidebar/WorkspaceSidebar.tsx`  
**Changes:**

The sidebar component now accepts an optional `isGeneralChat` prop to indicate when displaying general chat sessions:

```typescript
interface WorkspaceSidebarProps {
  workspace: Workspace | null
  chatSessions: ChatSession[]  // General chat sessions when isGeneralChat=true
  currentChatId?: string
  onChatSelect?: (chatId: string) => void
  onNewChat?: () => void
  onToggleSidebar?: (isCollapsed: boolean) => void
  onSessionRename?: (sessionId: string, newTitle: string) => void
  onSessionDelete?: (sessionId: string) => void
  isGeneralChat?: boolean  // NEW: Indicates if displaying general chat sessions
}

// In the component body, conditionally render header text:
const headerText = isGeneralChat ? 'General Chat Sessions' : `${workspace?.name || 'Workspace'} Chats`

// Render session list - handles both workspace and general chat sessions identically
const sessionList = chatSessions.map(session => (
  <SessionItem
    key={session.id}
    session={session}
    isActive={session.id === currentChatId}
    onSelect={() => onChatSelect?.(session.id)}
    onRename={(newTitle) => onSessionRename?.(session.id, newTitle)}
    onDelete={() => onSessionDelete?.(session.id)}
  />
))

// "New Chat" button works for both workspaces and general chat:
// - For workspace: Creates new workspace chat session
// - For general chat: Creates new general chat session
```

**Key Features:**
- Display list of general chat sessions just like workspace sessions
- Show timestamps and session titles
- Resume previous sessions by clicking them
- Allow deletion of old sessions (soft delete)
- Context menu for rename/delete operations
- Smooth transitions using Framer Motion

#### 5.3 Update Dashboard Session Switching
**File:** `frontend/app/dashboard/page.tsx`  
**Implementation Details:**

```typescript
// When user clicks a different general chat session:
const handleGeneralChatSelect = async (sessionId: string) => {
  if (!user) return

  try {
    setCurrentGeneralSessionId(sessionId)
    setCurrentChatId(sessionId)
    setIsGeneralChat(true)

    // Load messages for the selected session
    const response = await fetch(`/api/chats/general/session?sessionId=${sessionId}`)
    const result = await response.json()
    
    const messages: Message[] = result.messages.map((chat: Chat) => ({
      id: chat.id,
      content: chat.message,
      role: chat.role,
      timestamp: new Date(chat.created_at)
    }))

    setMessages(messages)
    setCurrentWorkspaceName('General Chat')
    setCurrentWorkspace(null)
    setWorkspaceChatSessions([])
  } catch (error) {
    console.error('Error loading general chat session:', error)
  }
}

// When user wants to create a new general chat session from button click:
const handleNewGeneralChat = async () => {
  if (!user) return

  try {
    const response = await fetch('/api/chats/general/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Chat' })
    })
    const result = await response.json()
    
    const newSession = result.session
    setCurrentGeneralSessionId(newSession.id)
    setCurrentChatId(newSession.id)
    setMessages([])
    setIsGeneralChat(true)

    // Reload sessions list for sidebar
    const sessionsResponse = await fetch('/api/chats/general/sessions')
    const sessionsResult = await sessionsResponse.json()
    setGeneralChatSessions(sessionsResult.sessions || [])
  } catch (error) {
    console.error('Error creating new general chat session:', error)
  }
}
```

---

### Phase 6: Data Migration (If Needed)

#### 6.1 Handle Existing Users
**File:** `scripts/migrate_general_chat.py` (New)  
**Purpose:** Migrate any existing ephemeral chat data to database

```python
"""
Migration script to handle general chat history for existing users.
Since general chat was previously ephemeral, there's nothing to migrate.
This script can be used to:
1. Create default general chat sessions for all users
2. Log migration completion
"""

import supabase
from datetime import datetime

def migrate_general_chat_sessions():
    su = supabase.create_client(
        url=os.getenv('SUPABASE_URL'),
        key=os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    )
    
    # Get all unique users
    users_response = su.table('auth.users').select('id').execute()
    
    for user in users_response.data:
        # Check if user already has a general chat session
        existing = su.table('chat_sessions')\
            .select('*')\
            .eq('user_id', user['id'])\
            .is('workspace_id', None)\
            .execute()
        
        # If no general chat session exists, create one
        if not existing.data:
            su.table('chat_sessions').insert({
                'user_id': user['id'],
                'workspace_id': None,
                'title': 'General Chat',
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat(),
                'deleted_at': None
            }).execute()
    
    print(f"Migration complete! Processed {len(users_response.data)} users.")

if __name__ == '__main__':
    migrate_general_chat_sessions()
```

---

### Phase 7: Testing Plan

#### 7.1 Unit Tests
**File:** `tests/test_general_chat.py`

```python
"""
Tests for general chat functionality
"""

import pytest
from datetime import datetime

def test_create_general_chat_session(supabase):
    """Test creating a new general chat session"""
    # Implementation
    pass

def test_get_general_chat_session(supabase):
    """Test retrieving existing general chat session"""
    # Implementation
    pass

def test_save_general_chat_message(supabase):
    """Test saving message to general chat"""
    # Implementation
    pass

def test_get_general_chat_messages(supabase):
    """Test fetching all messages from general chat"""
    # Implementation
    pass

def test_get_user_general_chat_sessions(supabase):
    """Test fetching all general chat sessions for a user"""
    # Implementation
    pass
```

#### 7.2 Frontend Tests
**File:** `tests/test_general_chat_components.tsx`

```typescript
/**
 * Tests for general chat components
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DashboardPage from '@/app/dashboard/page'

describe('General Chat History', () => {
  test('loads general chat history on mount', async () => {
    // Implementation
  })

  test('displays previous general chat sessions in sidebar', async () => {
    // Implementation
  })

  test('saves user messages to general chat', async () => {
    // Implementation
  })

  test('saves assistant messages to general chat', async () => {
    // Implementation
  })

  test('switches between general chat sessions', async () => {
    // Implementation
  })

  test('persists messages across page refresh', async () => {
    // Implementation
  })
})
```

#### 7.3 Integration Tests
**Test Scenarios:**
1. User logs in → loads general chat with previous history
2. User sends message → message appears in chat and is saved to DB
3. User switches to workspace chat → general chat history is preserved
4. User returns to general chat → history is intact
5. User creates new general chat session → previous sessions still accessible
6. User navigates away and returns → history is restored

---

## Implementation Checklist

### Phase 1: Database
- [ ] Backup production database
- [ ] Create migration file for schema changes
- [ ] Update `chat_sessions` table to allow nullable `workspace_id`
- [ ] Update `chats` table to allow nullable `workspace_id`
- [ ] Add indexes for general chat queries
- [ ] Test migration in staging environment
- [ ] Deploy migration to production

### Phase 2: Types
- [ ] Update `ChatSession` interface in `types.ts`
- [ ] Update `Chat` interface in `types.ts`
- [ ] Update any other related types
- [ ] Run TypeScript compiler to verify no type errors

### Phase 3: Backend Services
- [ ] Create/update `getGeneralChatSession()` in `chats.ts`
- [ ] Create/update `createGeneralChatSession()` in `chats.ts`
- [ ] Create/update `getGeneralChatMessages()` in `chats.ts`
- [ ] Create/update `saveGeneralChatMessage()` in `chats.ts`
- [ ] Create/update `getUserGeneralChatSessions()` in `chats.ts`
- [ ] Add unit tests for service layer
- [ ] Test with Supabase directly

### Phase 4: API Routes
- [ ] Create `/api/chats/general/route.ts`
- [ ] Create `/api/chats/general/sessions/route.ts`
- [ ] Test GET `/api/chats/general`
- [ ] Test POST `/api/chats/general`
- [ ] Test GET `/api/chats/general/sessions`
- [ ] Add request validation and error handling
- [ ] Add API tests

### Phase 5: Frontend Components
- [ ] Update `dashboard/page.tsx` with new state management
- [ ] Update `loadGeneralChat()` function
- [ ] Add `loadGeneralChatSessions()` function
- [ ] Update `handleSendMessage()` to save messages
- [ ] Update Sidebar component to show general chat sessions
- [ ] Update ChatContainer to handle general chat properly
- [ ] Test with different scenarios

### Phase 6: Migration
- [ ] Create migration script (if needed)
- [ ] Test migration in staging
- [ ] Document any manual steps required

### Phase 7: Testing
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Manual QA testing
  - [ ] Create new general chat
  - [ ] Send messages and verify persistence
  - [ ] Refresh page and verify history loads
  - [ ] Switch to workspace chat and back
  - [ ] View list of previous general chats
  - [ ] Switch between general chats
  - [ ] Delete old sessions
- [ ] Performance testing (large number of messages)
- [ ] Load testing (multiple concurrent sessions)

### Phase 8: Documentation
- [ ] Update user documentation
- [ ] Update API documentation
- [ ] Add comments to code
- [ ] Create runbook for operations team
- [ ] Document any database changes

### Phase 9: Deployment
- [ ] Code review
- [ ] Merge to main branch
- [ ] Deploy to staging environment
- [ ] Run smoke tests on staging
- [ ] Deploy to production
- [ ] Monitor logs for errors
- [ ] Verify functionality in production

---

## Database Schema Reference

### chat_sessions table structure
```
id: uuid (primary key)
workspace_id: uuid (nullable - null indicates general chat)
user_id: uuid (foreign key to auth.users)
title: text
created_at: timestamp with time zone
updated_at: timestamp with time zone
deleted_at: timestamp with time zone (nullable)
```

### chats table structure
```
id: uuid (primary key)
session_id: uuid (foreign key to chat_sessions)
workspace_id: uuid (nullable - null indicates general chat)
user_id: uuid (foreign key to auth.users)
role: text (user, assistant, system)
message: text
created_at: timestamp with time zone
```

---

## Key Differences: General Chat vs Workspace Chat

| Aspect | General Chat | Workspace Chat |
|--------|---------|--------|
| **Storage** | Database (new) | Database (existing) |
| **Session** | Created per user | Created per workspace per user |
| **workspace_id** | NULL | UUID value |
| **Sidebar Display** | List of previous general chats | List of chats within workspace |
| **Scope** | User-level | Workspace-level |
| **Instructions** | None (global system instructions) | Workspace-specific instructions |
| **Access** | Always available | Only when workspace selected |
| **Privacy** | Personal to user | Accessible to workspace members (future) |

---

## API Endpoints Summary

### General Chat Endpoints

#### Get All General Chat Sessions
```
GET /api/chats/general/sessions
Response: { success: true, sessions: ChatSession[] }
```

#### Create New General Chat Session
```
POST /api/chats/general/sessions
Body: { title?: string }
Response: { success: true, session: ChatSession }
```

#### Get Messages for General Chat Session
```
GET /api/chats/general/session?sessionId=xxxx
Response: { success: true, messages: Message[] }
```

#### Update General Chat Session Title
```
PATCH /api/chats/general/session
Body: { sessionId: string, title: string }
Response: { success: true, session: ChatSession }
```

#### Delete General Chat Session (Soft Delete)
```
DELETE /api/chats/general/session
Body: { sessionId: string }
Response: { success: true }
```

#### Save Message to General Chat
```
POST /api/chats/general
Body: { sessionId: string, role: string, message: string }
Response: { success: true, chat: Chat }
```

### Workspace Chat Endpoints (Existing)
```
GET /api/chats?workspaceId={id}
POST /api/chats
GET /api/chats/session?sessionId=xxx
PATCH /api/chats/session
DELETE /api/chats/session
GET /api/chats/sessions?workspaceId={id}
POST /api/chats/sessions
```

---

## Frontend State Management

### Dashboard Component State
```typescript
// General Chat State
const [generalChatSessions, setGeneralChatSessions] = useState<ChatSession[]>([])
const [currentGeneralSessionId, setCurrentGeneralSessionId] = useState<string>('')
const [isGeneralChat, setIsGeneralChat] = useState<boolean>(false)

// Existing state
const [messages, setMessages] = useState<Message[]>([])
const [currentChatId, setCurrentChatId] = useState<string>('')
const [chatSessions, setChatSessions] = useState<Record<string, ChatSession>>({})
// ... other state
```

### Data Flow
1. **Load General Chat**: User navigates without workspace
   - Call `loadGeneralChat()`
   - Fetch `/api/chats/general`
   - Load messages and session
   - Display in chat interface

2. **Send Message**: User sends message in general chat
   - Add to local messages state immediately (optimistic update)
   - Save via POST `/api/chats/general`
   - Fetch updated session if needed

3. **View Sessions History**: User wants to see previous chats
   - Display `generalChatSessions` list in sidebar
   - User clicks session
   - Load that session's messages
   - Switch chat context

---

## Migration & Rollback Strategy

### Forward Migration
1. Deploy database schema changes (nullable workspace_id)
2. Deploy backend service layer changes
3. Deploy API route changes
4. Deploy frontend component changes
5. Feature flag new functionality (optional)

### Rollback Plan
**If issues occur during deployment:**
1. Keep workspace_id nullable (no data loss)
2. Revert recent frontend/API changes
3. General chat reverts to ephemeral (users lose current session but can access previous ones)
4. No data deletion necessary
5. Can re-enable at any time since schema is backward compatible

---

## Performance Considerations

### Query Optimization
```sql
-- Efficient queries for general chat
SELECT * FROM chat_sessions 
WHERE user_id = $1 AND workspace_id IS NULL 
ORDER BY updated_at DESC;

-- Index created on:
-- (user_id, created_at) WHERE workspace_id IS NULL
```

### Pagination (Future Enhancement)
For users with large chat histories:
```typescript
// Paginate chat sessions
const PAGE_SIZE = 20
const offset = (pageNumber - 1) * PAGE_SIZE

const { data, count } = await supabase
  .from('chat_sessions')
  .select('*', { count: 'exact' })
  .eq('user_id', userId)
  .is('workspace_id', null)
  .order('updated_at', { ascending: false })
  .range(offset, offset + PAGE_SIZE - 1)
```

### Message Pagination (Future Enhancement)
For sessions with many messages:
```typescript
// Load messages in batches
const { data } = await supabase
  .from('chats')
  .select('*')
  .eq('session_id', sessionId)
  .order('created_at', { ascending: true })
  .range(offset, offset + PAGE_SIZE - 1)
```

---

## Related Documentation

- [Database Integration Summary](./DB_INTEGRATION_SUMMARY.md)
- [Chat Sessions Documentation](./CHAT_SESSIONS_TYPE_FIXES.md)
- [Conversation Context](./CONVERSATION_CONTEXT_COMPLETE.md)
- [Chat Title Generation](./CHAT_TITLE_GENERATION.md)
- [Streaming Preview Implementation](./STREAMING_PREVIEW_IMPLEMENTATION.md)

---

## Questions & Answers

### Q: Will this break existing functionality?
**A:** No. The schema changes enable but don't require general chat history. Workspace chats continue to work as before.

### Q: How do we handle memory limits with long chat histories?
**A:** Load messages in pages (pagination). Implement lazy loading of older messages.

### Q: Should we limit the number of general chat sessions per user?
**A:** Not initially. Revisit if storage becomes a concern. Could add soft-delete and archive old sessions.

### Q: How do we sync state across browser tabs?
**A:** Use localStorage events or consider IndexedDB for session management. Current implementation will need per-tab state.

### Q: What about chat privacy?
**A:** General chats are private to the user. Future: could add sharing functionality similar to workspace chats.

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Feb 17, 2026 | Assistant | Initial comprehensive documentation |

