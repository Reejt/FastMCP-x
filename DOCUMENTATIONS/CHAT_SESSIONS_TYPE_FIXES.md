# Type Conversion & Breaking Changes Guide

**Created:** January 20, 2026  
**Purpose:** Document type inconsistencies resolved and breaking changes to watch for

---

## ✅ Issues Fixed

### 1. **Nullability Consistency**

**Before:**
```typescript
interface Chat {
  workspace_id: string | null   // ❌ Inconsistent with DB
  user_id: string | null        // ❌ Inconsistent with DB
  session_id: string
}
```

**After:**
```typescript
interface Chat {
  workspace_id: string          // ✅ Matches DB NOT NULL constraint
  user_id: string               // ✅ Matches DB NOT NULL constraint
  session_id: string            // ✅ Already correct
}
```

---

### 2. **Field Name Mapping**

**Database (Chat type):**
- `message: string` ← Actual DB column name
- `created_at: string` ← ISO timestamp from PostgreSQL

**UI (Message type):**
- `content: string` ← Displayed in chat interface
- `timestamp: Date` ← JavaScript Date object

**Solution:** Added helper functions:
```typescript
import { chatToMessage, chatsToMessages } from '@/app/types'

// Convert single chat
const message = chatToMessage(chat)

// Convert array
const messages = chatsToMessages(chats)
```

---

## 🚨 Breaking Changes to Handle

### Change 1: `createChatMessage` Signature

**OLD (what existing code expects):**
```typescript
createChatMessage(workspaceId: string, role: string, message: string)
```

**NEW (what we implemented):**
```typescript
createChatMessage(sessionId: string, workspaceId: string, role: string, message: string)
```

**Impact:**
- ❌ `/api/chats/route.ts` POST endpoint will break
- ❌ Any frontend code calling this function will break

**Fix Required in Step 6:**
```typescript
// OLD API route body
const { workspaceId, role, message } = await request.json()

// NEW API route body (need to add sessionId)
const { sessionId, workspaceId, role, message } = await request.json()
```

---

### Change 2: Message Loading Pattern

**OLD pattern:**
```typescript
// Load all workspace messages (mixed sessions)
const chats = await getWorkspaceChats(workspaceId)
```

**NEW pattern:**
```typescript
// Load session-specific messages
const chats = await getSessionMessages(sessionId)
const messages = chatsToMessages(chats)  // Convert to UI type
```

**Impact:**
- Need to update page.tsx to load by session
- Need to pass sessionId when loading messages

---

## 📋 Checklist for Remaining Steps

### Step 5-6: API Routes
- [ ] Update `/api/chats/route.ts` POST to accept `sessionId`
- [ ] Create `/api/chats/sessions/route.ts` for session management
- [ ] Create `/api/chats/session/route.ts` for session messages

### Step 7: Frontend State Management
- [ ] Use `chatsToMessages()` when loading from DB
- [ ] Pass both `sessionId` and `workspaceId` when creating messages
- [ ] Load messages via `getSessionMessages(sessionId)` not `getWorkspaceChats(workspaceId)`

### Step 8: Sidebar
- [ ] Display sessions with `getWorkspaceSessions(workspaceId)`
- [ ] Show active session indicator based on `currentSessionId`

---

## 🎯 Validation Checklist

Before considering each step complete, verify:

**Types:**
- [ ] No TypeScript errors in types/index.ts
- [ ] Helper functions compile without errors
- [ ] Chat and Message types don't have null where NOT NULL

**Service Layer:**
- [ ] `createChatMessage` requires both sessionId and workspaceId
- [ ] `getSessionMessages` returns Chat[], not Message[]
- [ ] Conversion helpers work correctly

**API Routes:**
- [ ] Request body includes sessionId
- [ ] Response converts Chat to Message when needed
- [ ] Error handling for missing sessionId

**Frontend:**
- [ ] Uses `chatsToMessages()` for type conversion
- [ ] Passes sessionId to all message operations
- [ ] Loads messages by session, not by workspace

---

## 🔄 Type Conversion Examples

### Loading Messages for Display
```typescript
// 1. Fetch from database (returns Chat[])
const chats = await getSessionMessages(sessionId)

// 2. Convert to UI type (returns Message[])
const messages = chatsToMessages(chats)

// 3. Use in UI
setMessages(messages)
```

### Creating a New Message
```typescript
// 1. Create in database (accepts string content)
const chat = await createChatMessage(
  sessionId,
  workspaceId,
  'user',
  userInput  // This is the 'message' field in DB
)

// 2. Convert to UI type for display
const message = chatToMessage(chat)

// 3. Add to messages array
setMessages(prev => [...prev, message])
```

---

## 🐛 Common Pitfalls to Avoid

1. **Don't forget type conversion**
   ```typescript
   // ❌ BAD: Using Chat directly in UI
   const chats = await getSessionMessages(sessionId)
   setMessages(chats)  // Type error: Chat[] != Message[]
   
   // ✅ GOOD: Convert first
   const chats = await getSessionMessages(sessionId)
   setMessages(chatsToMessages(chats))
   ```

2. **Don't pass workspaceId alone**
   ```typescript
   // ❌ BAD: Missing sessionId
   await createChatMessage(workspaceId, 'user', content)
   
   // ✅ GOOD: Pass both
   await createChatMessage(sessionId, workspaceId, 'user', content)
   ```

3. **Don't load by workspace when you mean session**
   ```typescript
   // ❌ BAD: Loads all workspace messages (mixed sessions)
   const chats = await getWorkspaceChats(workspaceId)
   
   // ✅ GOOD: Load specific session
   const chats = await getSessionMessages(sessionId)
   ```

---

**Status:** ✅ Types Fixed | ⏭️ Ready for Steps 5-6

