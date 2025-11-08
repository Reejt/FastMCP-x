# FastMCP-x Frontend

Modern Next.js dashboard for the FastMCP document-aware query assistant. Features a ChatGPT-inspired interface with authentication, chat capabilities, and document management.

## Features

### 🔐 Authentication
- **Supabase Auth**: Magic link email authentication
- **Protected Routes**: Middleware-based route protection
- **User Profiles**: Role-based access (admin/user)
- **Session Management**: Persistent authentication across page loads

### 💬 Chat Interface
- **ChatGPT-style UI**: Modern, dark-themed chat interface
- **Message Display**: Support for user and assistant messages
- **Auto-scrolling**: Automatically scrolls to latest messages
- **Empty State**: Quick action suggestions for new chats
- **Expandable Input**: Textarea with keyboard shortcuts (Cmd/Ctrl+Enter to send)

### 🎨 UI Components
- **Collapsible Sidebar**: Smooth collapse/expand with hover functionality
  - 256px expanded, 64px collapsed
  - localStorage persistence
  - Keyboard accessible
  - Smooth Framer Motion animations
- **Navigation**: Dashboard, Workspaces, Vault, Instructions sections
- **User Profile**: Avatar, email, role display with sign-out

### 📱 Responsive Design
- Desktop-optimized interface
- Mobile drawer navigation
- Adaptive layouts with Tailwind CSS

## Getting Started

### Prerequisites
- Node.js 18+
- Supabase account with credentials
- Backend MCP server running (see root README.md)

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment:
   ```bash
   # Create .env.local
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000)

### First Login

1. Navigate to `/login`
2. Enter your authorized email
3. Check email for magic link
4. Click link to authenticate
5. Redirected to `/dashboard`

## Project Structure

```
frontend/
├── app/
│   ├── page.tsx              # Landing page
│   ├── layout.tsx            # Root layout with fonts
│   ├── globals.css           # Global styles & Tailwind
│   ├── dashboard/
│   │   └── page.tsx          # Main dashboard (protected)
│   ├── login/
│   │   └── page.tsx          # Login page
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts      # Magic link handler
│   ├── workspaces/
│   │   └── page.tsx          # Workspaces page
│   ├── vault/
│   │   └── page.tsx          # Vault page
│   ├── instructions/
│   │   └── page.tsx          # Instructions page
│   └── components/
│       ├── Chat/             # Chat interface components
│       │   ├── ChatContainer.tsx
│       │   ├── ChatMessage.tsx
│       │   ├── ChatInput.tsx
│       │   └── index.tsx
│       ├── Sidebar/          # Sidebar components
│       │   ├── Sidebar.tsx
│       │   ├── SidebarItem.tsx
│       │   ├── index.tsx
│       │   ├── README.md
│       │   ├── USAGE.md
│       │   ├── TESTING.md
│       │   └── QUICK_REFERENCE.md
│       └── WorkspaceSidebar/ # Workspace-specific sidebar
├── lib/
│   └── supabase/
│       ├── client.ts         # Browser Supabase client
│       └── server.ts         # Server Supabase client
├── middleware.ts             # Auth middleware
├── public/                   # Static assets
├── next.config.ts            # Next.js configuration
├── tailwind.config.ts        # Tailwind CSS config
├── tsconfig.json             # TypeScript config
└── package.json              # Dependencies
```

## Key Components

### Chat Components (`app/components/Chat/`)
- **ChatContainer**: Displays message list with empty state
- **ChatMessage**: Individual message with role-based styling
- **ChatInput**: Message input with file attachment support

### Sidebar Components (`app/components/Sidebar/`)
- **Sidebar**: Main navigation with collapse/hover functionality
- **SidebarItem**: Reusable navigation item with icons and tooltips

See `app/components/Sidebar/README.md` for detailed component documentation.

## Technology Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Authentication**: Supabase Auth
- **Icons**: Heroicons (via inline SVG)

## Available Scripts

```bash
# Development server (hot reload)
npm run dev

# Production build
npm run build

# Start production server
npm start

# Type checking
npm run type-check

# Linting
npm run lint
```

## Environment Variables

Required in `.env.local`:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

**Note**: Never commit `.env.local` to version control!

## Development Workflow

1. **Hot Reload**: Changes to `.tsx` files reload automatically
2. **Component Development**: Use component README files for guidance
3. **Auth Testing**: Clear cookies between login tests
4. **Backend Integration**: Ensure backend server is running on appropriate port

## Backend Integration

### Current Status
- UI components ready
- Chat interface built
- Backend connection: **Pending implementation**

### Next Steps for Backend Integration
1. Add API client for FastMCP server
2. Implement message streaming
3. Connect file upload to ingestion endpoint
4. Add workspace management API calls
5. Integrate vault with document storage

## Supabase Configuration

Required Supabase setup (see `../SUPABASE_CONFIG.md`):

1. **Redirect URLs**: Add `http://localhost:3000/auth/callback`
2. **Site URL**: Set to `http://localhost:3000`
3. **Email Provider**: Enable email authentication
4. **Profiles Table**: Ensure `profiles` table exists with RLS policies

## Troubleshooting

### Auth Issues
- **Magic link loops**: Check Supabase redirect URLs
- **Session not persisting**: Verify middleware configuration
- **"Not authorized"**: Ensure email is in `profiles` table

### Development Issues
- **Port already in use**: Kill process on port 3000 or use `-p 3001`
- **Module not found**: Run `npm install`
- **TypeScript errors**: Check `tsconfig.json` paths

### Component Issues
- **Sidebar state not persisting**: Check localStorage in DevTools
- **Animations jerky**: Verify Framer Motion version compatibility

## Documentation

- **Sidebar**: `app/components/Sidebar/README.md`
- **Chat**: `app/components/README.md`
- **Setup**: `../SETUP.md`
- **Auth Config**: `../SUPABASE_CONFIG.md`

## Contributing

When adding new features:
1. Follow existing component patterns
2. Use TypeScript for type safety
3. Maintain Tailwind CSS styling consistency
4. Add component documentation where appropriate
5. Test authentication flow with changes

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Connect repository to Vercel
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Update Supabase redirect URLs with production domain
5. Deploy

### Other Platforms

Build for production:
```bash
npm run build
npm start
```

Ensure environment variables are configured on your hosting platform.

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Framer Motion](https://www.framer.com/motion/)

## License

Part of FastMCP-x project (MIT License)
