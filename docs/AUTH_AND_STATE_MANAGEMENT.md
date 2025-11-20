# Authentication and State Management Documentation

## Overview
This document explains how authentication, data loading, and pan offset persistence work in the Memory Library application. Understanding these systems is crucial for avoiding common issues like data flashing, state conflicts, and persistence problems.

## Table of Contents
1. [Authentication Flow](#authentication-flow)
2. [Data Source Selection](#data-source-selection)
3. [Pan Offset Persistence](#pan-offset-persistence)
4. [Common Issues and Solutions](#common-issues-and-solutions)
5. [Debugging Tips](#debugging-tips)

---

## Authentication Flow

### How It Works
1. **Initial State**: When the app loads, authentication state is unknown (`user: null, loading: true`)
2. **Auth Check**: Firebase's `onAuthStateChanged` listener checks if user is logged in
3. **Loading State**: While checking, `authLoading` is `true` and app shows loading spinner
4. **Resolution**: Once determined, `authLoading` becomes `false` and `user` is either an object (logged in) or `null` (logged out)

### Key Files
- `src/hooks/useAuth.js` - Manages authentication state
- `src/App.jsx` - Shows loading spinner while auth is loading (line 204-206)

### Critical Rule
**NEVER make data source decisions while `authLoading` is true!** This prevents the app from temporarily using the wrong data source.

---

## Data Source Selection

### The Two Data Sources
1. **Firebase** (Firestore) - Used when user is authenticated
2. **localStorage** - Used when user is NOT authenticated (demo mode)

### How Data Source is Determined

```javascript
// In useMemories.js and useBoardState.js
const isUsingLocalStorage = !userId && !authLoading;

useEffect(() => {
  // CRITICAL: Wait for auth to finish loading
  if (authLoading) {
    return; // Don't load ANY data while auth is loading
  }

  if (!userId) {
    // Load from localStorage
  } else {
    // Load from Firebase
  }
}, [userId, authLoading, ...])
```

### Key Files
- `src/hooks/useMemories.js` - Manages memory data (lines 37-95)
- `src/hooks/useBoardState.js` - Manages board state (lines 36-90)

### Common Pitfall: Data Flash
**Problem**: If you don't wait for auth loading, the app briefly loads localStorage data (thinking user is logged out), then switches to Firebase when auth completes.

**Solution**: Always pass `authLoading` to data hooks and check it before loading data.

---

## Pan Offset Persistence

### Three-Layer System
The pan offset (canvas position) is persisted in three places for different purposes:

1. **Component State** (`panOffset`) - Immediate UI updates
2. **SessionStorage** - Instant restoration on page reload (same session)
3. **Firebase/localStorage** - Long-term persistence across sessions

### How It Works

#### 1. Initial Load
```javascript
// ConspiracyBoard.jsx (lines 115-128)
const [panOffset, setPanOffset] = useState(() => {
  // Try sessionStorage first for instant restoration
  const savedPan = sessionStorage.getItem('boardPanOffset')
  if (savedPan) {
    return JSON.parse(savedPan)
  }
  return { x: 0, y: 0 }
})
```

#### 2. User Interaction Saving
```javascript
// Only save to sessionStorage when USER interacts
const savePanOffsetToSession = useCallback((offset) => {
  sessionStorage.setItem('boardPanOffset', JSON.stringify(offset))
}, [])

// In drag/wheel/reset handlers:
setPanOffset(newOffset)
savePanOffsetToSession(newOffset) // Save to session
// Firebase save happens separately (debounced)
```

#### 3. Firebase Sync
```javascript
// ConspiracyBoard.jsx (lines 201-225)
// Only update from Firebase if significantly different
const isDifferent = Math.abs(savedPanOffset.x - currentPan.x) > 1 ||
                    Math.abs(savedPanOffset.y - currentPan.y) > 1
```

### Key Files
- `src/components/conspiracy-board/ConspiracyBoard.jsx` (lines 115-225, 1419-1420, 1474-1475)
- `src/hooks/useBoardState.js` (lines 13-23)

### Critical Rules
1. **Initialize from sessionStorage** to prevent flash on reload
2. **Only save to sessionStorage on user interaction**, not when loading from Firebase
3. **Check for significant differences** before updating from Firebase to avoid conflicts

---

## Common Issues and Solutions

### Issue 1: "Canvas jumps to 0,0 after reload"
**Cause**: Pan offset not properly restored from sessionStorage
**Solution**:
- Ensure `boardPanOffset` is in sessionStorage
- Check that `useBoardState` uses `getInitialPanOffset()`
- Verify `savePanOffsetToSession` is called on user interactions

### Issue 2: "Different memories flash before real ones load"
**Cause**: App loads localStorage data before Firebase auth completes
**Solution**:
- Pass `authLoading` to data hooks
- Check `if (authLoading) return;` before loading data
- Show loading spinner in UI while `authLoading` is true

### Issue 3: "Pan offset keeps resetting to wrong position"
**Cause**: Conflict between sessionStorage and Firebase values
**Solution**:
- Only save to sessionStorage on user interaction
- Don't save to sessionStorage when loading from Firebase
- Use difference threshold when syncing from Firebase

### Issue 4: "State not persisting across sessions"
**Cause**: Firebase save failing or not being called
**Solution**:
- Check `updateBoardState` is called with pan offset
- Verify Firebase rules allow write access
- Check browser console for Firebase errors

---

## Debugging Tips

### Console Logs to Look For
```javascript
// Good signs:
"🔄 Restored pan offset from sessionStorage: {x: 251, y: 454}"  // Correct restoration
"💾 Saved pan offset to sessionStorage: {x: 251, y: 454}"        // User interaction save
"✅ Saved to Firebase - panOffset: {x: 251, y: 454}"            // Firebase sync

// Bad signs:
"🔵 Loaded different pan offset from Firebase"  // Conflict between sources
"Failed to parse saved pan offset"              // Corrupted sessionStorage
```

### Debug Checklist
1. **Check Auth State**: Is `authLoading` properly tracked?
2. **Check SessionStorage**: `sessionStorage.getItem('boardPanOffset')`
3. **Check Firebase Data**: Use Firebase Console to verify stored values
4. **Check Network Tab**: Ensure Firebase requests are succeeding
5. **Check Console Errors**: Look for Firebase permission errors

### Testing Procedure
1. Set canvas to specific position (e.g., x: 200, y: 300)
2. Check sessionStorage has correct value
3. Reload page - should restore to same position
4. Log out and log back in - should restore from Firebase
5. Open in new tab - should load from Firebase (not sessionStorage)

---

## Implementation Checklist
When modifying these systems, ensure:

- [ ] Auth loading state is properly propagated to all data hooks
- [ ] Data hooks wait for auth loading to complete before choosing source
- [ ] Pan offset initializes from sessionStorage
- [ ] SessionStorage only updates on user interaction
- [ ] Firebase sync uses debouncing to avoid excessive writes
- [ ] Loading states prevent UI flash during transitions
- [ ] Error boundaries handle Firebase connection issues

---

## Related Files
- `src/hooks/useAuth.js` - Authentication state management
- `src/hooks/useMemories.js` - Memory data management
- `src/hooks/useBoardState.js` - Board state management
- `src/hooks/useLocalStorage.js` - localStorage abstraction
- `src/components/conspiracy-board/ConspiracyBoard.jsx` - Main board component
- `src/App.jsx` - Root component with auth handling

---

*Last Updated: November 2024*
*If you're reading this because something broke, check the console logs first!*