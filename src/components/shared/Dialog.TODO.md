# TODO: Create Custom Dialog Component

## Purpose
Replace all browser-native `alert()` and `confirm()` dialogs with a custom themed component that matches the app's design.

## Current Issues
- Using browser-native `alert()` for errors and messages
- Using browser-native `confirm()` for confirmations
- These don't match the app's theme/design
- Not customizable or consistent with app styling

## Implementation Plan

### Create Dialog Component
**Files to create:**
- `src/components/shared/Dialog.jsx`
- `src/components/shared/Dialog.css`

### Features Needed
- Support different types: `error`, `success`, `warning`, `info`, `confirm`
- Custom buttons (OK, Cancel, Yes/No, etc.)
- Callback handlers for button actions
- Smooth fade-in/fade-out animations
- Backdrop/overlay
- ESC key to dismiss
- Theme-matched styling (colors, fonts, spacing)

### Example Usage
```jsx
// For alerts
<Dialog
  type="error"
  title="Error"
  message="Failed to save board. Please try again."
  onClose={() => setShowDialog(false)}
/>

// For confirmations
<Dialog
  type="confirm"
  title="Delete Memory?"
  message="Are you sure you want to delete this memory? This cannot be undone."
  onConfirm={() => handleDelete()}
  onCancel={() => setShowDialog(false)}
/>
```

### Files to Update (Replace alert/confirm calls)

**ConspiracyBoard.jsx:**
- Line 611: `alert('Please enter a board name')`
- Line 627: `alert('Failed to save board. Please try again.')`
- Search for all other `alert()` calls

**Archive.jsx:**
- Search for `confirm()` calls (likely for delete confirmations)
- Search for any `alert()` calls

**Other components:**
- Scan entire codebase for `alert(` and `confirm(`

### Styling Requirements
- Use existing CSS variables from `theme.css`
- Match color scheme (beige backgrounds, muted colors)
- Use Crimson Text font family
- Consistent border-radius, shadows, transitions
- Responsive design

## Benefits
- Consistent user experience
- Better visual design
- More control over dialog behavior
- Theme consistency
- Professional appearance
