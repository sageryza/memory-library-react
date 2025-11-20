# Memory Card Styling Guide

## Overview
This guide documents the proper approach for styling memory cards in the archive view to maintain clean, vanilla CSS without excessive use of `!important` declarations.

## File Structure
- **MemoryCard.css** - Main vanilla styles for memory cards
- **Archive.css** - Archive-specific layout and container styles
- **simplifyView.css** - Simplified/stacked view overrides
- **Hashtag.css** - Shared hashtag component styles

## Best Practices

### 1. Avoid `!important` declarations
- Use CSS specificity naturally through class combinations
- Only use `!important` when absolutely necessary (e.g., forcing elements to hide)
- Document why `!important` is needed when you must use it

### 2. Proper CSS Cascade
```css
/* Good - uses specificity */
.memories-container.select-mode .memory-checkbox {
    display: flex;
    opacity: 1;
}

/* Avoid - unnecessary !important */
.memory-checkbox {
    display: flex !important;
}
```

### 3. Style Organization
- Base styles in MemoryCard.css
- View-specific overrides in their respective files
- Avoid duplicating styles across files

### 4. Vanilla Styling Values
Core vanilla styles for memory cards:
- Background: `#faf8e9`
- Border: `0.5px solid #E0E0E0`
- Border radius: `8px`
- Padding: `20px`
- Title font-weight: `600` (semi-bold, not bold - better for serif fonts)
- Title font-size: `16px`
- Title color: `#2F4F4F`
- Content font-size: `14px`
- Content color: `#4A4A4A`
- Hover background: `#f5f2e0`
- Selected background: `#fdf2f8`

## Recent Cleanup (November 2025)
- Removed unnecessary `!important` declarations from checkbox styles
- Eliminated duplicate checkbox styling in Archive.css
- Cleaned up simplifyView.css to minimize `!important` usage
- Added documentation for styling approach

## When to Use `!important`
Only use in these specific cases:
1. Hiding elements in simplified view (display: none)
2. Overriding third-party library styles
3. Critical accessibility features

Always add a comment explaining why `!important` is necessary.