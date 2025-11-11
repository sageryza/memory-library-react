# Memory Library React - Styling Guide

> **Last Updated:** November 2025
> **Purpose:** Ensure consistent styling across all components using our global theme system

---

## Table of Contents

1. [Overview](#overview)
2. [Theme System](#theme-system)
3. [Global Component Patterns](#global-component-patterns)
4. [Best Practices](#best-practices)
5. [Examples](#examples)

---

## Overview

This project uses a **centralized design system** to maintain visual consistency across all components. All new components should:

- ✅ Use CSS variables from `src/styles/theme.css`
- ✅ Extend global component classes from `src/styles/components.css`
- ✅ Follow established patterns from `src/App.css`
- ✅ Avoid hardcoding colors, spacing, or typography

---

## Theme System

### Location
- **Theme Variables:** `/src/styles/theme.css`
- **Component Styles:** `/src/styles/components.css`
- **Base App Styles:** `/src/App.css`

### Color Palette

Always use CSS variables instead of hardcoded hex values:

```css
/* ❌ DON'T DO THIS */
.my-component {
  background: #800020;
  color: #666;
  border: 1px solid #ddd;
}

/* ✅ DO THIS */
.my-component {
  background: var(--color-primary);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border-standard);
}
```

#### Primary Colors
```css
--color-primary: #800020;        /* Maroon - CTAs, active states */
--color-primary-hover: #A0001C;  /* Light maroon - hover states */
--color-primary-light: #b88585;  /* Lighter maroon - active toggles */
```

#### Accent Colors
```css
--color-accent-gold: #FFD700;    /* Gold - constellation features */
--color-accent-crimson: #dc143c; /* Crimson - connections */
--color-accent-orange: #ff4500;  /* Orange - connection hovers */
```

#### Background Colors
```css
--color-bg-white: #FFFFFF;       /* Pure white backgrounds */
--color-bg-tan: #faf8ea;         /* Tan - modal headers, highlights */
--color-bg-card: #faf8e9;        /* Card backgrounds, memory pins */
--color-bg-light: #f0f0f0;       /* Light gray - active buttons */
--color-bg-overlay: rgba(0, 0, 0, 0.5); /* Modal overlays */
```

#### Border Colors
```css
--color-border-primary: #e8e6d5; /* Primary borders - cards, dividers */
--color-border-light: #c0beac;   /* Light borders - inactive buttons */
--color-border-muted: #ce9c9c;   /* Muted rose borders */
--color-border-standard: #ddd;   /* Standard gray borders */
--color-border-divider: #e5e5e5; /* Section dividers */
```

#### Text Colors
```css
--color-text-primary: #2F4F4F;   /* Dark slate - headings, primary text */
--color-text-secondary: #666;     /* Medium gray - secondary text */
--color-text-muted: #999;         /* Light gray - muted text */
--color-text-light: #333;         /* Darker gray for emphasis */
--color-text-white: #FFFFFF;      /* White text on dark backgrounds */
```

#### State Colors
```css
--color-success: #28a745;         /* Success states */
--color-error: #dc3545;           /* Error states */
--color-warning: #ffc107;         /* Warning states */
--color-info: #17a2b8;            /* Info states */
```

### Spacing System

```css
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;
```

**Usage:**
```css
.my-component {
  padding: var(--spacing-md);
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
}
```

### Border Radius

```css
--radius-small: 4px;
--radius-medium: 6px;
--radius-large: 8px;
```

### Typography

```css
--font-family-primary: 'Crimson Text', serif;
--font-size-base: 14px;
--font-size-small: 12px;
--font-size-medium: 16px;
--font-size-large: 18px;
--font-size-xlarge: 24px;
```

### Shadows

```css
--shadow-small: 0 2px 4px rgba(0, 0, 0, 0.1);
--shadow-medium: 0 4px 8px rgba(0, 0, 0, 0.15);
--shadow-large: 0 10px 25px rgba(0, 0, 0, 0.2);
```

### Transitions

```css
--transition-fast: 0.15s ease;
--transition-normal: 0.2s ease;
--transition-slow: 0.3s ease;
```

### Z-Index Scale

```css
--z-dropdown: 100;
--z-sidebar: 500;
--z-modal-backdrop: 1000;
--z-modal: 1001;
--z-tooltip: 2000;
```

---

## Global Component Patterns

### Buttons

Use existing button classes from `/src/styles/components.css`:

#### Primary Button
```jsx
<button className="btn btn-primary">Save</button>
```

#### Secondary Button
```jsx
<button className="btn btn-secondary">Cancel</button>
```

#### Icon Button
```jsx
<button className="btn-icon">
  <svg>...</svg>
</button>
```

#### Toggle Button
```jsx
<button className={`btn-toggle ${isActive ? 'active' : ''}`}>
  Toggle
</button>
```

#### Custom Button Styling
If you need custom button styles, extend the base classes:

```css
/* ✅ Good - extends base .btn class */
.btn-custom {
  /* Inherits padding, border-radius, transitions from .btn */
  background: var(--color-accent-gold);
  color: var(--color-text-light);
}

.btn-custom:hover {
  background: #FFC700;
}
```

### Modals

All modals should use the global modal structure:

#### HTML Structure
```jsx
<div className={`modal-overlay ${isOpen ? 'show' : ''}`} onClick={handleOverlayClick}>
  <div className="modal-content">
    <div className="modal-header">
      <h3>Modal Title</h3>
      <button className="modal-close" onClick={onClose}>&times;</button>
    </div>

    <div className="modal-body">
      {/* Modal content */}
    </div>

    <div className="modal-footer">
      <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" onClick={onSave}>Save</button>
    </div>
  </div>
</div>
```

#### CSS
```css
/* No need to redefine these - they're global! */
/* Just add custom styling for modal-specific content */

.my-modal-custom-content {
  padding: var(--spacing-md);
  color: var(--color-text-secondary);
}
```

### Sidebars

**⚠️ IMPORTANT:** All sidebars must use the global sidebar structure from `/src/App.css`

#### Required Structure

```jsx
<div className="sidebar">
  <div className="sidebar-header">
    <h2>Sidebar Title</h2>
    {/* Optional: search, filters, etc. */}
  </div>

  <div className="sidebar-content">
    {/* Scrollable content goes here */}
  </div>
</div>
```

#### Global Sidebar Classes

These classes are defined in `App.css` and should **NOT** be redefined:

| Class | Purpose | Key Styles |
|-------|---------|------------|
| `.sidebar-wrapper` | Container for sidebar + toggle | `width: 300px`, handles collapse |
| `.sidebar` | Main sidebar container | `background: #FFFFFF`, `border-left: 1px solid #E0E0E0` |
| `.sidebar-header` | Header area | `background: #FAFAFA`, `border-bottom: 1px solid #E0E0E0` |
| `.sidebar-content` | Scrollable content area | `flex: 1`, `overflow-y: auto`, `padding: 15px` |
| `.sidebar-toggle-tab` | Toggle button | Positioned absolutely, handles open/close |

#### Example: Custom Sidebar

```jsx
// MyCustomSidebar.jsx
export default function MyCustomSidebar({ items }) {
  return (
    <div className="sidebar">
      <div className="sidebar-header my-custom-header">
        <h2>My Custom Sidebar</h2>
        {/* Custom header content */}
      </div>

      <div className="sidebar-content">
        {items.map(item => (
          <div key={item.id} className="my-custom-item">
            {item.name}
          </div>
        ))}
      </div>
    </div>
  )
}
```

```css
/* MyCustomSidebar.css */
/* Base sidebar structure comes from App.css (.sidebar, .sidebar-header, .sidebar-content) */

/* Only add CUSTOM styles specific to your sidebar */
.my-custom-header {
  /* Extends .sidebar-header */
  background: var(--color-bg-tan); /* Override if needed */
}

.my-custom-item {
  padding: var(--spacing-md);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-medium);
  margin-bottom: var(--spacing-sm);
}
```

#### Sidebar Header with Tabs

For sidebars with tabs (like ConstellationSidebar):

```jsx
<div className="sidebar">
  <div className="sidebar-header custom-header-with-tabs">
    <div className="custom-tabs">
      <button className={`tab ${activeTab === 'tab1' ? 'active' : ''}`}>
        Tab 1
      </button>
      <button className={`tab ${activeTab === 'tab2' ? 'active' : ''}`}>
        Tab 2
      </button>
    </div>
  </div>

  <div className="sidebar-content">
    {/* Content based on active tab */}
  </div>
</div>
```

**Reference Implementation:** See `ConstellationSidebar.jsx` and `ConstellationSidebar.css`

### Forms

Use global form classes:

```jsx
<div className="form-group">
  <label className="form-label">Email</label>
  <input type="email" className="form-input" placeholder="Enter email" />
</div>

<div className="form-group">
  <label className="form-label">Message</label>
  <textarea className="form-textarea" placeholder="Enter message" />
</div>
```

### Cards

```jsx
<div className="card">
  <div className="card-header">
    <h4>Card Title</h4>
  </div>
  <div className="card-body">
    Card content goes here
  </div>
</div>
```

---

## Best Practices

### 1. Always Use Theme Variables

**❌ Bad:**
```css
.my-component {
  background: #800020;
  padding: 16px;
  border-radius: 8px;
  transition: all 0.2s ease;
}
```

**✅ Good:**
```css
.my-component {
  background: var(--color-primary);
  padding: var(--spacing-md);
  border-radius: var(--radius-large);
  transition: all var(--transition-normal);
}
```

### 2. Extend Global Classes, Don't Redefine

**❌ Bad:**
```css
.my-sidebar {
  width: 100%;
  background: #FFFFFF;
  border-left: 1px solid #E0E0E0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
```

**✅ Good:**
```jsx
// Use global .sidebar class
<div className="sidebar">
  {/* Global styles automatically applied */}
</div>
```

### 3. Add Component-Specific Documentation

Always add a comment at the top of your CSS file:

```css
/* MyComponent Styles */
/* Base structure comes from [source file] */

/* Custom styles below */
.my-component-specific-class {
  /* ... */
}
```

### 4. Follow Naming Conventions

- **BEM-like naming:** `.component-element-modifier`
- **State classes:** `.active`, `.selected`, `.disabled`, `.open`, `.closed`
- **Descriptive names:** `.btn-save` not `.btn1`

### 5. Mobile Responsiveness

Always consider responsive design:

```css
.my-component {
  padding: var(--spacing-md);
}

@media (max-width: 768px) {
  .my-component {
    padding: var(--spacing-sm);
  }
}
```

### 6. Accessibility

- Use semantic HTML
- Include `aria-*` attributes where needed
- Ensure sufficient color contrast
- Support keyboard navigation

---

## Examples

### Example 1: Creating a New Sidebar

```jsx
// InsightsSidebar.jsx
import './InsightsSidebar.css'

export default function InsightsSidebar({ insights, onSelect }) {
  return (
    <div className="sidebar">
      <div className="sidebar-header insights-header">
        <h2>Insights</h2>
        <p className="insights-count">{insights.length} insights found</p>
      </div>

      <div className="sidebar-content">
        {insights.map(insight => (
          <div
            key={insight.id}
            className="insight-card"
            onClick={() => onSelect(insight)}
          >
            <h4>{insight.title}</h4>
            <p>{insight.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

```css
/* InsightsSidebar.css */
/* Base sidebar structure comes from App.css (.sidebar, .sidebar-header, .sidebar-content) */

.insights-header {
  /* Extends .sidebar-header */
  background: var(--color-bg-tan);
}

.insights-count {
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
  margin-top: var(--spacing-xs);
}

.insight-card {
  background: var(--color-bg-white);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-medium);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  cursor: pointer;
  transition: all var(--transition-normal);
}

.insight-card:hover {
  border-color: var(--color-border-light);
  box-shadow: var(--shadow-small);
}

.insight-card h4 {
  font-size: var(--font-size-medium);
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-xs) 0;
}

.insight-card p {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  margin: 0;
}
```

### Example 2: Creating a New Modal

```jsx
// ConfirmModal.jsx
import './ConfirmModal.css'

export default function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }) {
  if (!isOpen) return null

  return (
    <div className={`modal-overlay ${isOpen ? 'show' : ''}`} onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onCancel}>&times;</button>
        </div>

        <div className="modal-body">
          <p className="confirm-message">{message}</p>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
```

```css
/* ConfirmModal.css */
/* Base modal structure comes from components.css (.modal-overlay, .modal-content, etc.) */

.confirm-message {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0;
}
```

### Example 3: Creating Custom Buttons

```jsx
// ExportButton.jsx
export default function ExportButton({ onClick, disabled }) {
  return (
    <button
      className="btn btn-export"
      onClick={onClick}
      disabled={disabled}
    >
      <svg>...</svg>
      Export
    </button>
  )
}
```

```css
/* ExportButton.css */

.btn-export {
  /* Inherits from .btn in components.css */
  background: var(--color-accent-gold);
  color: var(--color-text-light);
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.btn-export:hover:not(:disabled) {
  background: #FFC700;
}

.btn-export svg {
  width: 16px;
  height: 16px;
}
```

---

## Checklist for New Components

When creating a new component, use this checklist:

- [ ] Uses CSS variables from `theme.css`
- [ ] Extends global classes where applicable
- [ ] Follows established patterns (sidebars, modals, buttons)
- [ ] Includes documentation comment in CSS file
- [ ] Uses semantic HTML
- [ ] Accessible (keyboard navigation, aria labels)
- [ ] Responsive design considered
- [ ] No hardcoded colors, spacing, or typography
- [ ] Consistent naming conventions
- [ ] Tested in different views (Conspiracy Board, Archive, Chronology)

---

## Reference Files

| File | Purpose |
|------|---------|
| `/src/styles/theme.css` | CSS variables (colors, spacing, typography, etc.) |
| `/src/styles/components.css` | Global component classes (buttons, modals, forms, cards) |
| `/src/App.css` | Base app structure (sidebars, layouts) |
| `/src/components/conspiracy-board/ConstellationSidebar.*` | Example of properly structured sidebar |
| `/src/components/shared/MemoryModal.*` | Example of properly structured modal |
| `/src/components/archive/LibrarySidebar.*` | Example of sidebar using global patterns |

---

## Questions?

When in doubt:
1. Check if a global class exists in `components.css` or `App.css`
2. Reference existing components that follow these patterns
3. Use theme variables instead of hardcoding values
4. Add a documentation comment to your CSS file

**For major styling changes, always consult this guide first!**
