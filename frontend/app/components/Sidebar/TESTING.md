# Visual Testing Guide for Sidebar Component

## Quick Test Checklist

Use this guide to verify the sidebar is working correctly.

---

## 🖥️ Desktop Testing (Screen ≥ 768px)

### 1. Initial Load
- [ ] Sidebar appears expanded (256px wide)
- [ ] All labels visible
- [ ] Active section highlighted (Chat)
- [ ] VARYS AI logo visible in header

### 2. Collapse/Expand Toggle
- [ ] Click the double-chevron (<<) button
- [ ] Sidebar smoothly shrinks to 64px over 300ms
- [ ] Labels fade out and slide left
- [ ] Icons remain centered
- [ ] Chevron icon rotates 180°
- [ ] Main content expands smoothly (no jump)

### 3. Hover-to-Expand (When Collapsed)
- [ ] Hover over collapsed sidebar
- [ ] Sidebar expands to 256px
- [ ] Labels fade in and slide right
- [ ] No layout shift in main content
- [ ] Move mouse away
- [ ] Sidebar collapses back smoothly

### 4. Tooltips (When Collapsed)
- [ ] Hover over each icon
- [ ] Tooltip appears to the right
- [ ] Tooltip shows correct label
- [ ] Tooltip disappears on mouse leave

### 5. Navigation
- [ ] Click each navigation item
- [ ] Active state changes (indigo highlight)
- [ ] Previous item deselects
- [ ] Works in both collapsed and expanded states

### 6. User Profile Section
**Expanded:**
- [ ] Avatar with first letter visible
- [ ] Email displayed
- [ ] Role displayed
- [ ] Sign Out button visible

**Collapsed:**
- [ ] Avatar visible
- [ ] Hover shows tooltip with email
- [ ] Sign out icon visible
- [ ] Hover shows tooltip "Sign Out"

### 7. localStorage Persistence
- [ ] Collapse sidebar
- [ ] Refresh page (Ctrl+R or Cmd+R)
- [ ] Sidebar remains collapsed
- [ ] Expand sidebar
- [ ] Refresh page
- [ ] Sidebar remains expanded

### 8. Projects Section (Expanded)
- [ ] Click Projects
- [ ] Sub-items appear smoothly
- [ ] "No projects yet" message visible
- [ ] "+ New Project" button visible
- [ ] Click another section
- [ ] Sub-items collapse smoothly

---

## 📱 Mobile Testing (Screen < 768px)

### 1. Initial State
- [ ] Sidebar hidden off-screen
- [ ] Hamburger menu (☰) visible in top-left
- [ ] Main content fills screen

### 2. Open Mobile Menu
- [ ] Click hamburger button
- [ ] Semi-transparent backdrop appears (50% opacity black)
- [ ] Sidebar slides in from left (300ms)
- [ ] Sidebar shows expanded view (256px)
- [ ] All labels visible

### 3. Close Mobile Menu
**Via Backdrop:**
- [ ] Click on backdrop area
- [ ] Sidebar slides out to left
- [ ] Backdrop fades out
- [ ] Hamburger button remains visible

**Via Navigation:**
- [ ] Open menu
- [ ] Click a navigation item
- [ ] Menu stays open (expected behavior)
- [ ] Click backdrop to close

### 4. Touch Interactions
- [ ] Tap on navigation items
- [ ] Active state changes
- [ ] No double-tap required
- [ ] Smooth transitions

---

## ⌨️ Keyboard Accessibility Testing

### 1. Tab Navigation
- [ ] Tab through all interactive elements
- [ ] Focus indicator visible on each item
- [ ] Tab order: Toggle → Nav items → User section → Sign out

### 2. Toggle with Keyboard
- [ ] Tab to toggle button
- [ ] Press Enter or Space
- [ ] Sidebar collapses/expands
- [ ] Focus maintained on toggle button

### 3. Navigate with Keyboard
- [ ] Tab to navigation item
- [ ] Press Enter or Space
- [ ] Section activates
- [ ] Active state visible

---

## 🎨 Visual Regression Checks

### 1. Animations
- [ ] No jerky movements
- [ ] Smooth 300ms transitions
- [ ] No layout jumps
- [ ] Icons don't shift horizontally

### 2. Spacing & Alignment
**Expanded:**
- [ ] Consistent padding (p-3 or p-4)
- [ ] Icons aligned to left with 3-unit gap
- [ ] Labels aligned left

**Collapsed:**
- [ ] Icons centered horizontally
- [ ] Equal spacing top and bottom
- [ ] Tooltips don't overlap

### 3. Colors & Shadows
- [ ] Background: bg-gray-50
- [ ] Active: bg-indigo-50 + border
- [ ] Hover: bg-gray-100
- [ ] Shadow visible on right edge

### 4. Typography
- [ ] Logo: text-xl font-bold
- [ ] Nav labels: font-medium
- [ ] User email: text-sm
- [ ] User role: text-xs

---

## 🌐 Browser Compatibility

Test in each browser:

### Chrome/Edge
- [ ] All animations smooth
- [ ] No console errors
- [ ] localStorage works
- [ ] Hover states work

### Firefox
- [ ] All animations smooth
- [ ] No console errors
- [ ] localStorage works
- [ ] Hover states work

### Safari
- [ ] All animations smooth
- [ ] No console errors
- [ ] localStorage works
- [ ] Hover states work

---

## 🐛 Common Issues to Check

### Issue: Sidebar state doesn't persist
**Test:**
1. Open DevTools → Application → Local Storage
2. Check for key: `sidebar-collapsed`
3. Value should be "true" or "false"

**Fix:**
- Clear localStorage and try again
- Check browser privacy settings

### Issue: Hover expansion is jumpy
**Test:**
1. Collapse sidebar
2. Slowly move mouse over sidebar
3. Watch for smooth expansion

**Fix:**
- Check Framer Motion is installed
- Verify transition duration is 0.3

### Issue: Mobile drawer doesn't open
**Test:**
1. Resize window to < 768px
2. Click hamburger button
3. Check console for errors

**Fix:**
- Verify `isMobileMenuOpen` state in dashboard
- Check z-index values (sidebar: 50, backdrop: 40)

### Issue: Main content jumps on collapse
**Test:**
1. Watch main content area while toggling
2. Should expand smoothly, not jump

**Fix:**
- Ensure main content has `flex-1 min-w-0`
- Check parent container has `display: flex`

---

## 📸 Screenshot Checklist

Take screenshots for documentation:

1. **Desktop Expanded** - Full view with active section
2. **Desktop Collapsed** - With icons only
3. **Desktop Hover** - Collapsed sidebar with hover expansion
4. **Desktop Tooltip** - Showing tooltip on collapsed icon
5. **Mobile Closed** - Just hamburger button
6. **Mobile Open** - Drawer with backdrop
7. **Active States** - Each navigation section active
8. **User Profile** - Both expanded and collapsed

---

## ✅ Final Verification

Before marking as complete:

- [ ] All desktop tests pass
- [ ] All mobile tests pass
- [ ] All keyboard tests pass
- [ ] All browser tests pass
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] No visual glitches
- [ ] localStorage working
- [ ] Documentation accurate
- [ ] Code committed to git

---

## 🎯 Performance Testing

### Animation FPS
1. Open Chrome DevTools
2. Go to Performance tab
3. Record while toggling sidebar
4. Check for 60 FPS (green bars)
5. No layout thrashing (purple bars)

### Bundle Size
1. Run production build
2. Check sidebar chunk size
3. Should be ~3KB additional

### Load Time
1. Measure initial page load
2. Sidebar should render immediately
3. No FOUC (Flash of Unstyled Content)

---

*Use this checklist for QA and regression testing*
