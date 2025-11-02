# Sidebar Usage Guide

## Quick Start

The sidebar is already integrated into your dashboard. Here's how to use it:

### Desktop Experience

1. **Collapse/Expand Toggle**: Click the double-chevron icon (<<) in the top-right of the sidebar header
   - Collapsed: 64px width with only icons visible
   - Expanded: 256px width with icons and labels

2. **Hover to Peek**: When collapsed, hover over the sidebar to temporarily expand it
   - Labels fade in smoothly
   - Sidebar expands without affecting main content
   - Moves away when you move your mouse out

3. **Persistence**: Your preference is automatically saved
   - Refreshing the page maintains your chosen state
   - Works across browser sessions
   - Stored in localStorage

### Mobile Experience (< 768px)

1. **Access Menu**: Tap the hamburger menu icon in the top-left corner
2. **Sidebar Drawer**: Slides in from the left with a backdrop
3. **Close**: Tap the backdrop or navigate to close

## Navigation Items

### Current Sections

- **Chat**: Main conversation interface
- **Projects**: Organize your work into projects
- **Vault**: Document storage and management
- **Instructions**: Custom AI instructions

### Active States

The currently active section is highlighted with:
- Light indigo background
- Indigo text color
- Border outline

## Keyboard Navigation

- **Tab**: Move between navigation items
- **Enter/Space**: Activate selected item
- **Escape**: Close mobile drawer (on mobile)

## Tooltips

When the sidebar is collapsed, hover over any icon to see a tooltip with the label.

## User Profile Section

At the bottom of the sidebar:
- **Avatar**: Shows first letter of email
- **User Info**: Email and role (when expanded)
- **Sign Out**: Click to log out

## Best Practices

### For Development

1. **Adding New Items**: Use the `SidebarItem` component
   ```tsx
   <SidebarItem
     icon={<YourSVGIcon />}
     label="Your Label"
     isActive={activeSection === 'yourSection'}
     isCollapsed={!isExpanded}
     onClick={() => setActiveSection('yourSection')}
   />
   ```

2. **Nested Items**: Use AnimatePresence for smooth expand/collapse
   ```tsx
   <AnimatePresence>
     {isActive && isExpanded && (
       <motion.div
         initial={{ opacity: 0, height: 0 }}
         animate={{ opacity: 1, height: 'auto' }}
         exit={{ opacity: 0, height: 0 }}
       >
         {/* Nested content */}
       </motion.div>
     )}
   </AnimatePresence>
   ```

### For Users

1. **Keep it Collapsed**: For maximum screen space, keep sidebar collapsed
2. **Hover to Navigate**: Quick peek at labels without expanding
3. **Expand for Details**: When working with projects/vault, expand for better visibility

## Customization

### Changing Active Section Color

In `Sidebar.tsx` and `SidebarItem.tsx`, update the classes:
```tsx
// From indigo to blue
'bg-indigo-50 text-indigo-700 border border-indigo-200'
// to
'bg-blue-50 text-blue-700 border border-blue-200'
```

### Adjusting Animation Speed

In `Sidebar.tsx`, modify the transition duration:
```tsx
transition={{
  duration: 0.3, // Faster: 0.2, Slower: 0.4
  ease: 'easeInOut'
}}
```

## Troubleshooting

**Q: Sidebar state doesn't persist after refresh**
- Check browser localStorage is enabled
- Clear cache and try again
- Key used: `sidebar-collapsed`

**Q: Hover expansion is jumpy**
- This is normal if you move mouse quickly
- Smooth transitions are set to 300ms
- Try slower mouse movement

**Q: Mobile menu button not visible**
- Only shows on screens < 768px
- Check responsive design in DevTools
- Button is positioned at top-left with z-30

**Q: Main content shifts when sidebar collapses**
- Ensure parent has `flex` display
- Main content should have `flex-1` and `min-w-0`
- Check for conflicting CSS

## Tips & Tricks

1. **Quick Toggle**: Press the collapse button twice to verify smooth animations
2. **Test Responsive**: Resize browser window to see mobile/desktop transitions
3. **Accessibility Check**: Navigate using only keyboard to test tab order
4. **Inspect State**: Open browser DevTools → Application → Local Storage → Check `sidebar-collapsed`

## Integration Checklist

- [x] Sidebar component created
- [x] SidebarItem component created  
- [x] Dashboard integration complete
- [x] Mobile drawer implemented
- [x] localStorage persistence working
- [x] Accessibility attributes added
- [x] Tooltips in collapsed state
- [x] Smooth animations implemented
- [x] Hover-to-expand functionality
- [x] Responsive design (desktop/mobile)

## Support

For issues or feature requests, please refer to the main README.md or create an issue in the repository.
