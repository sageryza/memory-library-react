# How to Remove the Constellation Connection Feature

This document provides complete instructions for removing the constellation connection indicator feature from the React Memory Library application.

## Overview

The constellation feature adds glowing icons to memory cards that indicate when a memory has connections in linear timeline boards or conspiracy boards. It reads from localStorage and displays mini-map visualizations.

**Date Added:** November 4, 2025
**Files Modified:** 2
**Files Created:** 5

---

## Quick Disable (Reversible)

To instantly disable the feature without removing code:

1. Open `src/components/archive/ArchiveMemoryCard.jsx`
2. Find line 7:
   ```javascript
   const ENABLE_CONSTELLATION_FEATURE = true;
   ```
3. Change to:
   ```javascript
   const ENABLE_CONSTELLATION_FEATURE = false;
   ```
4. Save and refresh your browser

The feature is now disabled but all code remains in place for easy re-enabling.

---

## Complete Removal

### Step 1: Delete Created Files

Delete these 5 files:

```bash
rm src/hooks/useMemoryConnections.js
rm src/components/archive/ConstellationIcon.jsx
rm src/components/archive/ConstellationMiniMap.jsx
rm src/components/archive/ConstellationTooltip.jsx
rm src/components/archive/styles/Constellation.css
```

Or manually delete:
- `src/hooks/useMemoryConnections.js`
- `src/components/archive/ConstellationIcon.jsx`
- `src/components/archive/ConstellationMiniMap.jsx`
- `src/components/archive/ConstellationTooltip.jsx`
- `src/components/archive/styles/Constellation.css`

### Step 2: Restore ArchiveMemoryCard.jsx

Open `src/components/archive/ArchiveMemoryCard.jsx` and make these changes:

**REMOVE these imports (lines 2-4):**
```javascript
import ConstellationIcon from './ConstellationIcon';
import ConstellationTooltip from './ConstellationTooltip';
import { useMemoryConnections } from '../../hooks/useMemoryConnections';
```

**REMOVE the feature flag (lines 6-7):**
```javascript
// Feature flag - set to false to disable constellation feature
const ENABLE_CONSTELLATION_FEATURE = true;
```

**REMOVE these state/ref declarations (lines 11-13):**
```javascript
const [showTooltip, setShowTooltip] = useState(false);
const iconRef = useRef(null);
const { hasConnections } = useMemoryConnections();
```

**REMOVE this handler function (lines 48-51):**
```javascript
const handleConstellationClick = (e) => {
  e.stopPropagation();
  setShowTooltip(!showTooltip);
};
```

**REMOVE the constellation icon/tooltip JSX (lines 73-88):**
```javascript
{ENABLE_CONSTELLATION_FEATURE && hasConnections(memory.id) && (
  <div className="constellation-icon-wrapper">
    <ConstellationIcon
      ref={iconRef}
      onClick={handleConstellationClick}
    />
  </div>
)}

{ENABLE_CONSTELLATION_FEATURE && showTooltip && (
  <ConstellationTooltip
    memoryId={memory.id}
    anchorElement={iconRef.current}
    onClose={() => setShowTooltip(false)}
  />
)}
```

**UPDATE the imports at the top to only include:**
```javascript
import React from 'react';
```

(Remove `useState` and `useRef` from the React import if they're not used elsewhere)

### Step 3: Restore Archive.jsx

Open `src/components/archive/Archive.jsx`

**REMOVE this import (line 14):**
```javascript
import './styles/Constellation.css';
```

The imports section should look like:
```javascript
import './LibrarySidebar.css';
import './styles/Archive.css';
import './styles/MemoryCard.css';
import '../../styles/simplifyView.css';
```

---

## Verification Steps

After removal, verify everything works:

1. **Check for errors:**
   ```bash
   npm run dev
   ```
   Look for any import errors or missing module warnings

2. **Test the Archive view:**
   - Navigate to the Library/Archive page
   - Memory cards should display normally without constellation icons
   - Click on cards to ensure normal functionality works

3. **Verify no console errors:**
   - Open browser DevTools (F12)
   - Check the Console tab for errors
   - Should be clean with no constellation-related errors

4. **Search for remaining references:**
   ```bash
   grep -r "constellation" src/
   ```
   Should only find references in:
   - `src/hooks/useConstellations.js` (different feature - Firebase-based saved boards)
   - No other files should reference constellation

---

## Files That Should NOT Be Modified

These files are unrelated to the connection indicator feature and should be left alone:

- `src/hooks/useConstellations.js` - This is for saved constellation boards in Firebase (different feature)
- `src/components/conspiracy-board/ConstellationMode.jsx` - Part of conspiracy board view
- Any other constellation-related files NOT listed in Step 1

---

## Rollback / Restore

If you removed the feature but want it back:

1. **From Git:**
   ```bash
   git checkout HEAD -- src/hooks/useMemoryConnections.js
   git checkout HEAD -- src/components/archive/ConstellationIcon.jsx
   git checkout HEAD -- src/components/archive/ConstellationMiniMap.jsx
   git checkout HEAD -- src/components/archive/ConstellationTooltip.jsx
   git checkout HEAD -- src/components/archive/styles/Constellation.css
   git checkout HEAD -- src/components/archive/ArchiveMemoryCard.jsx
   git checkout HEAD -- src/components/archive/Archive.jsx
   ```

2. **Or revert the commit:**
   ```bash
   git log --oneline  # Find the commit hash
   git revert <commit-hash>
   ```

---

## Support

If you encounter issues during removal:

1. Check that all 5 created files were deleted
2. Verify both modified files were updated correctly
3. Clear browser cache and restart dev server
4. Check for typos in the modified files

---

## Summary Checklist

- [ ] Delete 5 created files
- [ ] Remove imports from ArchiveMemoryCard.jsx
- [ ] Remove state/refs from ArchiveMemoryCard.jsx
- [ ] Remove handler function from ArchiveMemoryCard.jsx
- [ ] Remove JSX elements from ArchiveMemoryCard.jsx
- [ ] Remove CSS import from Archive.jsx
- [ ] Test app runs without errors
- [ ] Verify memory cards display normally
- [ ] Delete this README if desired

**Estimated removal time:** 5-10 minutes

---

*This feature was added on November 4, 2025 as a read-only UI enhancement that displays connection indicators for memories linked in linear timeline and conspiracy board views.*
