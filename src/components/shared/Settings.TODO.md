# TODO: Create Settings Component for Advanced Mode

## Purpose
Create a settings modal/panel that allows users to customize the application appearance and behavior, starting with Advanced Mode features for string colors and pin styles.

## Features Needed

### Settings Modal
- Accessible from header (gear/settings icon)
- Modal overlay with settings form
- Save/Cancel buttons
- Organized into sections/tabs if needed

### Advanced Mode Settings
1. **Toggle Advanced Mode**
   - Checkbox or toggle switch
   - Enable/disable all advanced customization features

2. **String/Connection Color Customization**
   - Color picker for connection lines
   - Preview of color changes
   - Reset to default option
   - Apply to all existing connections

3. **Pin Head Style Selector**
   - Dropdown or icon-based selector
   - Options:
     - Default pin head (current)
     - Star icon
     - Red flag icon
     - Other custom icons
   - Preview of selected style
   - Apply to all existing pins

### Data Persistence
- Save settings to:
  - Option 1: Firebase user document (`users/{userId}/settings`)
  - Option 2: localStorage (faster but not synced across devices)
  - Recommendation: Use Firebase for sync across devices

### Settings Structure
```javascript
{
  advancedMode: false,
  connectionColor: '#8B7355', // default beige
  pinHeadStyle: 'default', // 'default' | 'star' | 'red-flag'
  // Future settings can be added here
}
```

## Implementation Plan

### 1. Create Settings Component
**File:** `src/components/shared/Settings.jsx`

```jsx
// Basic structure
export default function Settings({ isOpen, onClose, settings, onSave }) {
  return (
    <div className="settings-modal">
      {/* Advanced Mode Toggle */}
      {/* Color Picker for Connections */}
      {/* Pin Style Selector */}
      {/* Save/Cancel Buttons */}
    </div>
  )
}
```

### 2. Create Settings Stylesheet
**File:** `src/components/shared/Settings.css`
- Modal overlay styling
- Form layout
- Color picker styling
- Pin style selector grid
- Match app theme (beige, Crimson Text font)

### 3. Create Settings Hook
**File:** `src/hooks/useUserSettings.js`
- Load settings from Firebase/localStorage
- Save settings to Firebase/localStorage
- Provide default settings
- Real-time sync (if using Firebase)

### 4. Apply Settings Throughout App

#### Connection Colors
**File:** `src/components/conspiracy-board/Connections.jsx`
- Read connection color from settings
- Apply color to connection lines
- Could use CSS custom property: `--user-connection-color`

#### Pin Head Styles
**File:** `src/components/conspiracy-board/StandalonePins.jsx` (or similar)
- Read pin style from settings
- Conditionally render different SVG icons based on style
- Maintain same positioning/behavior

Example:
```jsx
{pinHeadStyle === 'star' && <StarIcon />}
{pinHeadStyle === 'red-flag' && <FlagIcon />}
{pinHeadStyle === 'default' && <DefaultPinIcon />}
```

### 5. Add Settings Button to Header
**File:** `src/components/shared/Header.jsx` or `ConspiracyBoard.jsx` header
- Add settings icon button
- Open settings modal on click

## CSS Variables Approach
Consider using CSS custom properties for dynamic theming:

```css
:root {
  --connection-color: var(--user-connection-color, #8B7355);
}

.connection-line {
  stroke: var(--connection-color);
}
```

Then update the custom property when settings change:
```javascript
document.documentElement.style.setProperty('--user-connection-color', settings.connectionColor)
```

## Future Enhancements
Once the settings infrastructure is in place, easy to add:
- Memory card background colors
- Font size preferences
- Theme switching (light/dark)
- Keyboard shortcut customization
- Display density options
- Animation speed controls

## Related TODOs
- See TODO.md line 239 for full specification
- ConspiracyBoard.css line 375 - Pin head styles
- ConspiracyBoard.css line 318 - Connection colors
- Connections.jsx line 6 - Apply custom colors
