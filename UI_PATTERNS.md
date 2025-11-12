# UI Patterns Documentation

This document captures UI patterns, design decisions, and styling conventions established in the Memory Library application.

---

## Header Dropdown Menu Pattern

**Created:** November 11, 2025
**First Implementation:** Conspiracy Board Header

### Problem
Headers with many individual buttons (11+) become cluttered and difficult to navigate, especially as features grow.

### Solution
Organize related actions into logical dropdown menus, keeping only the most frequently used or mode-changing actions as standalone buttons.

### When to Use
- **Use dropdowns when:**
  - Header has 5+ action buttons
  - Actions can be logically grouped (e.g., view options, tools, file operations)
  - You need to maintain a clean, scalable interface

- **Keep as standalone buttons:**
  - Mode-changing actions (e.g., Constellation Mode)
  - Frequently used primary actions
  - Actions that need constant visibility

### Implementation Example

#### Conspiracy Board Header Organization

**Dropdown Menus:**
1. **View Menu** - Display and viewing options
   - Reset View
   - Simplified/Normal View toggle
   - Opacity Fading toggle
   - Show/Hide All Insights

2. **Tools Menu** - Creation and editing tools
   - Add Memory
   - Place Pin
   - Scatter Memories
   - Search
   - Undo (with keyboard shortcut)

3. **Board Menu** - Board management
   - New Board
   - Save As New Board
   - Load Board

**Standalone Buttons:**
- Constellation Mode (changes entire interface mode)
- Playground (distinct feature area)

### Results
- Reduced from 11+ buttons to 5 visible elements
- Better organization with related functions grouped
- Scalable design for adding new features

---

## Dropdown Component

**Location:** `src/components/shared/Dropdown.jsx`
**Styles:** `src/components/shared/Dropdown.css`

### Purpose
A reusable dropdown menu component for organizing actions in headers and other UI areas.

### Props

```jsx
<Dropdown
  trigger={<button>Click Me</button>}  // Required: Element that opens dropdown
  items={[...]}                         // Required: Array of menu items
  className="custom-class"              // Optional: Additional CSS class
  align="left"                          // Optional: 'left' | 'right' (default: 'left')
  closeOnItemClick={true}               // Optional: Auto-close on item click (default: true)
/>
```

### Item Object Structure

```jsx
{
  label: 'Action Name',           // Required: Display text
  onClick: () => {},              // Required: Click handler
  icon: <svg>...</svg>,           // Optional: Icon element
  disabled: false,                // Optional: Disable the item
  active: false,                  // Optional: Highlight as active
  title: 'Tooltip text',          // Optional: Hover tooltip
  shortcut: '⌘Z',                 // Optional: Keyboard shortcut display
  separator: true                 // Optional: Renders a separator line
}
```

### Usage Example

```jsx
import Dropdown from '../shared/Dropdown'

<Dropdown
  className="header-dropdown"
  align="left"
  trigger={
    <button className="header-dropdown-btn">
      <svg width="16" height="16" fill="#2F4F4F" viewBox="0 0 16 16">
        {/* icon path */}
      </svg>
      <span>View</span>
      <svg className="dropdown-arrow" width="12" height="12" fill="#2F4F4F" viewBox="0 0 16 16">
        {/* dropdown arrow */}
      </svg>
    </button>
  }
  items={[
    {
      label: 'Reset View',
      icon: <svg>{/* ... */}</svg>,
      onClick: handleResetView,
      title: 'Reset view to center'
    },
    { separator: true },
    {
      label: isSimplified ? 'Normal View' : 'Simplified View',
      icon: <svg>{/* ... */}</svg>,
      onClick: toggleSimplify,
      active: isSimplified
    }
  ]}
/>
```

### Features
- **Click-outside detection** - Automatically closes when clicking outside
- **ESC key support** - Press ESC to close dropdown
- **Keyboard shortcuts display** - Show shortcuts like "⌘Z" for Undo
- **Active state indicators** - Highlight currently active options
- **Separators** - Visual grouping of related items
- **Disabled state** - Gray out unavailable actions

---

## Color & Styling Conventions

### Light Background Headers

**Background:** `#FAFAFA` (Light gray)

**Button Colors:**
```css
.header-dropdown-btn {
  color: #2F4F4F;              /* Dark slate gray for text */
  border: 1px solid #e8e6d5;    /* Light beige border */
  background: transparent;
}

.header-dropdown-btn:hover {
  background: rgba(47, 79, 79, 0.05);  /* Subtle dark tint */
  border-color: #2F4F4F;
}

.header-dropdown-btn.active {
  background: rgba(47, 79, 79, 0.1);   /* Stronger tint */
  border-color: #2F4F4F;
}
```

**SVG Icons:**
```jsx
// Use explicit dark color, not "currentColor" which inherits from parent
<svg fill="#2F4F4F" viewBox="0 0 16 16">
  {/* ... */}
</svg>
```

### Dropdown Menu Colors

```css
.dropdown-menu {
  background: #ffffff;           /* White background */
  border: 1px solid #e0e0e0;    /* Light gray border */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.dropdown-item {
  color: #333333;                /* Dark gray text */
}

.dropdown-item-icon {
  color: #666666;                /* Medium gray for icons */
}

.dropdown-item:hover {
  background-color: #f5f5f5;    /* Light gray hover */
}

.dropdown-item.active {
  background-color: #e8f4f8;    /* Light blue active state */
  color: #0066cc;                /* Blue text */
}
```

### Key Principle
**Always ensure sufficient contrast between text/icons and background.** On light backgrounds (#FAFAFA), use dark colors (#2F4F4F). Avoid using `fill="currentColor"` in headers as it can inherit unintended colors.

---

## Best Practices

### Dropdown Menu Design
1. **Group related actions** - Don't mix view controls with editing tools
2. **Use separators** - Visually separate logical groups
3. **Limit items** - Keep menus focused (4-7 items per dropdown)
4. **Show shortcuts** - Display keyboard shortcuts for discoverability
5. **Indicate state** - Use active/disabled states to show current context

### Header Organization
1. **Prioritize by frequency** - Most used actions should be most accessible
2. **Consider hierarchy** - View < Tools < File operations
3. **Maintain consistency** - Use same patterns across different views (Archive, Chronology, Conspiracy Board)

### Accessibility
- Always provide `title` attributes for tooltips
- Use semantic button elements
- Ensure keyboard navigation (ESC to close)
- Maintain color contrast ratios

---

## Future Implementations

### Archive View
Consider applying dropdown pattern if the header becomes crowded with filter, sort, and view options.

### Chronology View
Evaluate whether timeline controls would benefit from dropdown organization.

---

## Related Files

- **Component:** `src/components/shared/Dropdown.jsx`
- **Styles:** `src/components/shared/Dropdown.css`
- **Example Implementation:** `src/components/conspiracy-board/ConspiracyBoard.jsx` (lines 1534-1766)
- **Additional Styles:** `src/components/conspiracy-board/ConspiracyBoard.css` (lines 418-502)

---

## Changelog

**2025-11-11**
- Created Dropdown component
- Implemented dropdown pattern in Conspiracy Board header
- Established color conventions for light backgrounds
- Reduced header from 11+ buttons to 5 elements
