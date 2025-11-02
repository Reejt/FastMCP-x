# Sidebar Quick Reference

## 🚀 Quick Start

```tsx
import Sidebar from '@/app/components/Sidebar/Sidebar'

<Sidebar user={user} onSignOutAction={handleSignOut} />
```

## 📋 Props Reference

### Sidebar Component

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `user` | `User` | ✅ | - | User object with id, email, role |
| `onSignOutAction` | `() => void` | ✅ | - | Sign out callback function |
| `isMobileMenuOpen` | `boolean` | ❌ | `false` | Mobile drawer open state |
| `onMobileMenuClose` | `() => void` | ❌ | - | Mobile drawer close callback |

### SidebarItem Component

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `icon` | `ReactNode` | ✅ | - | SVG icon component |
| `label` | `string` | ✅ | - | Item label text |
| `isActive` | `boolean` | ❌ | `false` | Active/selected state |
| `isCollapsed` | `boolean` | ✅ | - | Sidebar collapsed state |
| `onClick` | `() => void` | ❌ | - | Click handler |
| `badge` | `number` | ❌ | - | Notification badge count |
| `className` | `string` | ❌ | `''` | Additional CSS classes |

## 🎨 CSS Classes Reference

### Width States
```tsx
w-64  // Expanded: 256px
w-16  // Collapsed: 64px
```

### Colors
```tsx
bg-gray-50           // Sidebar background
bg-gray-100          // Hover state
bg-indigo-50         // Active background
text-indigo-700      // Active text
border-indigo-200    // Active border
```

### Transitions
```tsx
transition-all duration-300 ease-in-out  // Default transition
```

## 📱 Responsive Breakpoints

```tsx
md:static           // Desktop: static positioning
md:translate-x-0    // Desktop: no horizontal translation

// Mobile (< 768px)
fixed left-0 top-0  // Mobile: fixed positioning
```

## 🔑 localStorage Key

```tsx
Key: 'sidebar-collapsed'
Values: 'true' | 'false'
```

## 📦 State Management

```tsx
// Collapse state
const [isCollapsed, setIsCollapsed] = useState(false)

// Hover state  
const [isHovering, setIsHovering] = useState(false)

// Computed expanded state
const isExpanded = !isCollapsed || isHovering

// Toggle with persistence
const toggleCollapse = () => {
  const newState = !isCollapsed
  setIsCollapsed(newState)
  localStorage.setItem('sidebar-collapsed', String(newState))
}
```

## 🎭 Animation Values

```tsx
// Framer Motion
animate={{
  width: isExpanded ? 256 : 64,      // Width animation
  x: isMobileMenuOpen ? 0 : -280,    // Mobile slide
}}
transition={{
  duration: 0.3,                      // 300ms
  ease: 'easeInOut',                 // Easing function
}}

// Label animation
animate={{
  opacity: isCollapsed ? 0 : 1,      // Fade
  x: isCollapsed ? -10 : 0,          // Slide
  width: isCollapsed ? 0 : 'auto',   // Width
}}
```

## 🎯 Common Patterns

### Adding a Navigation Item
```tsx
<SidebarItem
  icon={<svg>...</svg>}
  label="My Section"
  isActive={activeSection === 'mySection'}
  isCollapsed={!isExpanded}
  onClick={() => setActiveSection('mySection')}
/>
```

### Adding a Badge
```tsx
<SidebarItem
  {...props}
  badge={notificationCount}
/>
```

### Nested Items with Animation
```tsx
<AnimatePresence>
  {isActive && isExpanded && (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Nested content */}
    </motion.div>
  )}
</AnimatePresence>
```

## ♿ Accessibility Attributes

```tsx
// Sidebar
role="navigation"
aria-label="Main navigation"
aria-expanded={isExpanded}

// Toggle button
aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
aria-controls="sidebar-nav"

// Navigation items
role="button"
aria-label={label}
aria-current={isActive ? 'page' : undefined}
```

## 🔧 Customization Examples

### Change Width
```tsx
// In Sidebar.tsx
animate={{ width: isExpanded ? 320 : 80 }}  // From 256/64
```

### Change Animation Speed
```tsx
transition={{ duration: 0.2 }}  // From 0.3
```

### Change Colors
```tsx
// Active state
'bg-blue-50 text-blue-700 border border-blue-200'
// Instead of indigo
```

### Add Dark Mode
```tsx
className={`${
  isDark ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'
}`}
```

## 🐛 Debugging Tips

### Check Collapse State
```javascript
// Browser console
localStorage.getItem('sidebar-collapsed')
```

### Check Render Count
```tsx
useEffect(() => {
  console.log('Sidebar rendered', { isCollapsed, isHovering, isExpanded })
})
```

### Verify Animation
```tsx
// Add to motion component
onAnimationComplete={() => console.log('Animation done')}
```

## 📊 Performance Tips

1. **Use transform + opacity** (GPU accelerated)
   ```tsx
   // Good
   animate={{ opacity: 0, x: -10 }}
   
   // Avoid
   animate={{ marginLeft: -10 }}
   ```

2. **Minimize re-renders**
   ```tsx
   // Memoize expensive components
   const MemoizedItem = React.memo(SidebarItem)
   ```

3. **Debounce hover**
   ```tsx
   // If hover is too sensitive
   const debouncedHover = useDebouncedValue(isHovering, 100)
   ```

## 🔗 Related Files

- `frontend/app/components/Sidebar/Sidebar.tsx`
- `frontend/app/components/Sidebar/SidebarItem.tsx`
- `frontend/app/components/Sidebar/index.tsx`
- `frontend/app/dashboard/page.tsx`

## 📚 Full Documentation

- [README.md](./README.md) - Complete component docs
- [USAGE.md](./USAGE.md) - User guide
- [TESTING.md](./TESTING.md) - Testing checklist
- [../../../SIDEBAR_IMPLEMENTATION_SUMMARY.md](../../../SIDEBAR_IMPLEMENTATION_SUMMARY.md) - Full summary

## 🆘 Quick Fixes

| Problem | Solution |
|---------|----------|
| State doesn't persist | Clear localStorage, check key name |
| Animations jerky | Check Framer Motion installed, verify duration |
| Mobile drawer won't open | Check `isMobileMenuOpen` prop passed |
| Layout jumps | Add `min-w-0` to main content, check flex parent |
| Tooltips overlap | Adjust z-index or tooltip positioning |
| Icons not centered | Check flex/justify classes on icon container |

## 💡 Tips

- **Test collapsed state first** - Most edge cases appear when collapsed
- **Check mobile early** - Responsive issues harder to fix later
- **Use React DevTools** - Inspect props and state easily
- **Check localStorage** - Many state issues are persistence related
- **Verify z-index** - Sidebar (50), backdrop (40), menu button (30)

---

*Quick reference for developers working with the sidebar*
