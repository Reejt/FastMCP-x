# Chat UI Components

This directory contains the chat interface components for Varys AI.

## Components

### Chat Components (`/Chat`)
- **ChatContainer.tsx** - Main container that displays messages and empty state
- **ChatMessage.tsx** - Individual message component with user/assistant styling
- **ChatInput.tsx** - Text input with attachment button and send functionality

### Sidebar Components (`/Sidebar`)
- **Sidebar.tsx** - Navigation sidebar with sections for Chat, Projects, Vault, Instructions, and user profile

## Usage

```tsx
import Sidebar from '@/app/components/Sidebar/Sidebar'
import ChatContainer from '@/app/components/Chat/ChatContainer'
import ChatInput from '@/app/components/Chat/ChatInput'

// See app/dashboard/page.tsx for full implementation
```

## Features

- ✅ Dark theme UI matching dashboard.png
- ✅ Responsive chat interface
- ✅ Message streaming support
- ✅ Auto-scrolling to latest messages
- ✅ Expandable textarea with keyboard shortcuts
- ✅ Empty state with quick action suggestions
- ✅ User authentication integration
- ✅ Project and vault navigation placeholders

## Next Steps

1. Connect to FastMCP backend API at `http://localhost:8000`
2. Implement file upload functionality
3. Add project management features
4. Integrate vault file browser
5. Add instructions/prompts management
6. Implement message history persistence
