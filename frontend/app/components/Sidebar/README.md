# Sidebar Component Documentation

A smooth, collapsible sidebar component inspired by ChatGPT's sidebar design, built for the Varys AI web application (desktop-only).

## Features

### ✨ Core Functionality

- **Smooth Collapse/Expand**: Toggle between expanded (256px) and collapsed (64px) states with fluid animations
- **Hover-to-Expand**: Temporarily expand the sidebar by hovering when in collapsed state
- **Persistent State**: Sidebar state is saved to localStorage and restored on page load
- **Keyboard Accessible**: Full keyboard navigation support with proper ARIA attributes
- **Tooltip Support**: Tooltips appear on collapsed items when hovering

### 🎨 Visual Design

- **Theme**: Light mode with gray-50 background
- **Smooth Transitions**: 300ms ease-in-out animations for all state changes
- **No Layout Jumps**: Main content area expands smoothly without abrupt reflows
- **Active States**: Visual indicators for active navigation items
- **Badges**: Support for notification badges on menu items

## Component Structure

### `Sidebar.tsx`
Main sidebar container component.

**Props:**
```typescript
interface SidebarProps {
  user: User                          // Current user object
  onSignOutAction: () => void         // Sign out callback
}
```

**State Management:**
- `isCollapsed`: Boolean for collapsed state (synced with localStorage)
- `isHovering`: Boolean for temporary hover expansion
- `activeSection`: Current active navigation section
- `isExpanded`: Computed value (`!isCollapsed || isHovering`)

**LocalStorage Key:**
- `sidebar-collapsed`: Stores "true" or "false"

### `SidebarItem.tsx`
Reusable navigation item component.

**Props:**
```typescript
interface SidebarItemProps {
  icon: ReactNode                // SVG icon component
  label: string                  // Item label text
  isActive?: boolean            // Active state (default: false)
  isCollapsed: boolean          // Sidebar collapsed state
  onClick?: () => void          // Click handler
  badge?: number                // Optional badge count
  className?: string            // Additional CSS classes
}
```

**Features:**
- Smooth label fade-in/out with translateX animation
- Tooltip on hover when collapsed
- Automatic icon centering
- Accessibility attributes (aria-label, aria-current)

## Usage Examples

### Basic Implementation

```tsx
import Sidebar from '@/app/components/Sidebar/Sidebar'

function Dashboard() {
  const [user, setUser] = useState<User>(/* ... */)
  
  const handleSignOut = async () => {
    // Sign out logic
  }

  return (
    <div className="flex h-screen">
      <Sidebar user={user} onSignOutAction={handleSignOut} />
      <main className="flex-1 min-w-0">
        {/* Main content */}
      </main>
    </div>
  )
}
```

### Custom Sidebar Item

```tsx
import SidebarItem from '@/app/components/Sidebar/SidebarItem'

<SidebarItem
  icon={
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  }
  label="Chat"
  isActive={activeSection === 'chat'}
  isCollapsed={!isExpanded}
  onClick={() => setActiveSection('chat')}
  badge={5}
/>
```

## Animation Details

### Width Transition
```tsx
animate={{
  width: isExpanded ? 256 : 64
}}
transition={{
  duration: 0.3,
  ease: 'easeInOut'
}}
```

### Label Fade & Slide
```tsx
animate={{
  opacity: isCollapsed ? 0 : 1,
  x: isCollapsed ? -10 : 0,
  width: isCollapsed ? 0 : 'auto'
}}
transition={{
  duration: 0.3,
  ease: 'easeInOut'
}}
```

### Mobile Drawer Slide
```tsx
animate={{
  x: isMobileMenuOpen ? 0 : -280
}}
transition={{
  duration: 0.3,
  ease: 'easeInOut'
}}
```

## Accessibility Features

- **ARIA Attributes**:
  - `role="navigation"` on sidebar
  - `aria-label="Main navigation"` for screen readers
  - `aria-expanded` indicates sidebar state
  - `aria-controls` links toggle to sidebar
  - `aria-current="page"` for active items
  - `aria-label` on icon-only buttons

- **Keyboard Navigation**:
  - All interactive elements are keyboard accessible
  - Proper tab order maintained
  - Toggle button accessible via keyboard

- **Focus Management**:
  - Focus states visible on all interactive elements
  - Proper focus indicators with Tailwind's focus utilities

## Responsive Behavior

### Desktop Only
- Sidebar positioned relatively in layout flow
- Toggles between 256px (expanded) and 64px (collapsed)
- Hover expands temporarily without affecting layout
- State persists via localStorage

**Note**: This component is designed for desktop use only. For responsive mobile layouts, consider implementing a separate mobile navigation pattern.

## Performance Considerations

- **Optimized Animations**: Uses transform and opacity (GPU-accelerated)
- **Conditional Rendering**: Only renders tooltips and expanded content when needed
- **Event Debouncing**: Hover state changes use React's built-in state batching
- **No Layout Thrashing**: Width changes don't trigger reflows in main content

## Customization

### Changing Colors
Edit the Tailwind classes in `Sidebar.tsx`:
```tsx
// Background
className="bg-gray-50" // Change to bg-white, bg-gray-100, etc.

// Active state
className="bg-indigo-50 text-indigo-700 border border-indigo-200"
```

### Adjusting Width
```tsx
// Expanded width
animate={{ width: isExpanded ? 256 : 64 }}
// Change 256 to desired width in pixels

// Mobile slide-in
animate={{ x: isMobileMenuOpen ? 0 : -280 }}
// Adjust -280 to match new width + buffer
```

### Transition Duration
```tsx
transition={{
  duration: 0.3, // Change to 0.2, 0.4, etc.
  ease: 'easeInOut'
}
```

## Browser Support

- Modern browsers with CSS Grid and Flexbox support
- Framer Motion requires JavaScript enabled
- localStorage API for state persistence
- Tested on Chrome, Firefox, Safari, Edge

## Dependencies

- `react` - Core React library
- `framer-motion` - Animation library
- `tailwindcss` - Utility-first CSS framework

## Troubleshooting

### Sidebar doesn't persist state
- Check localStorage is enabled in browser
- Verify localStorage key: `sidebar-collapsed`
- Clear localStorage and try again

### Hover expansion doesn't work
- Ensure `onMouseEnter` and `onMouseLeave` handlers are active
- Check if CSS transitions are disabled
- Verify Framer Motion is installed

### Mobile drawer not appearing
- Check viewport width detection (should be <768px)
- Verify `isMobileMenuOpen` state is being passed
- Ensure z-index is correct (z-50 for sidebar, z-40 for backdrop)

### Layout shifts on collapse
- Ensure main content has `min-w-0` class
- Check Flexbox parent container
- Verify transition timing matches across components

## Future Enhancements

- [ ] Dark mode support
- [ ] Customizable width breakpoints
- [ ] Drag-to-resize sidebar
- [ ] Multiple collapse states (mini, compact, full)
- [ ] Sidebar position (left/right)
- [ ] Nested navigation items
- [ ] Search/filter within sidebar
- [ ] Pinned items
- [ ] Recent items history
