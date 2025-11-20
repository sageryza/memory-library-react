# Pan Offset System - Quick Reference

## The Problem We're Solving
Canvas position (pan offset) needs to persist across page reloads without any visual jumping or flashing.

## The Three-Layer Solution

### Layer 1: SessionStorage (Instant)
- **Purpose**: Immediate restoration on page reload
- **When saved**: Only on user interaction (drag, wheel, reset)
- **When loaded**: On component mount
- **Lifetime**: Current browser session

### Layer 2: React State (Live)
- **Purpose**: Real-time UI updates
- **When updated**: On any pan change
- **What uses it**: Canvas transform calculations

### Layer 3: Firebase/localStorage (Persistent)
- **Purpose**: Long-term storage across sessions
- **When saved**: Debounced after user interaction
- **When loaded**: After auth completes
- **Lifetime**: Forever (until cleared)

## Critical Code Sections

### Initialization (ConspiracyBoard.jsx)
```javascript
// Line 115-128: Initialize from sessionStorage
const [panOffset, setPanOffset] = useState(() => {
  const savedPan = sessionStorage.getItem('boardPanOffset')
  if (savedPan) {
    return JSON.parse(savedPan)  // Instant restoration!
  }
  return { x: 0, y: 0 }
})
```

### User Interaction Save
```javascript
// Line 197-200: Controlled sessionStorage save
const savePanOffsetToSession = useCallback((offset) => {
  sessionStorage.setItem('boardPanOffset', JSON.stringify(offset))
}, [])

// In handlers (e.g., line 1419-1420):
setPanOffset(newOffset)
savePanOffsetToSession(newOffset)  // Only on user action!
```

### Firebase Sync Check
```javascript
// Line 215-217: Avoid conflicts
const isDifferent = Math.abs(savedPanOffset.x - currentPan.x) > 1 ||
                   Math.abs(savedPanOffset.y - currentPan.y) > 1
```

## DO's and DON'Ts

### ✅ DO:
- Initialize pan offset from sessionStorage
- Save to sessionStorage ONLY on user interaction
- Use a difference threshold when syncing from Firebase
- Wait for auth loading before choosing data source
- Debounce Firebase saves

### ❌ DON'T:
- Save to sessionStorage when loading from Firebase
- Initialize with { x: 0, y: 0 } without checking sessionStorage
- Make data source decisions while auth is loading
- Trust exact equality when comparing offsets (use threshold)
- Save to Firebase on every frame during drag

## Common Breakage Scenarios

### Scenario 1: "It jumps to 0,0"
```javascript
// WRONG:
const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })

// RIGHT:
const [panOffset, setPanOffset] = useState(() => {
  // Check sessionStorage first!
})
```

### Scenario 2: "Firebase fights with sessionStorage"
```javascript
// WRONG:
useEffect(() => {
  sessionStorage.setItem('boardPanOffset', JSON.stringify(panOffset))
}, [panOffset])  // Saves on EVERY change including Firebase loads

// RIGHT:
const savePanOffsetToSession = useCallback((offset) => {
  sessionStorage.setItem('boardPanOffset', JSON.stringify(offset))
}, [])
// Only call this on user interaction
```

### Scenario 3: "Wrong data loads briefly"
```javascript
// WRONG:
const isUsingLocalStorage = !userId  // Doesn't wait for auth

// RIGHT:
const isUsingLocalStorage = !userId && !authLoading  // Waits for auth
```

## Debug Commands

```javascript
// Check current sessionStorage
sessionStorage.getItem('boardPanOffset')

// Clear sessionStorage (for testing)
sessionStorage.removeItem('boardPanOffset')

// Check Firebase value (in console)
firebase.firestore().collection('users').doc(USER_ID)
  .collection('boardState').doc('current').get()
  .then(doc => console.log(doc.data().panOffset))

// Force specific position (for testing)
sessionStorage.setItem('boardPanOffset', JSON.stringify({x: 100, y: 200}))
location.reload()
```

## Testing Checklist
- [ ] Pan to position, reload → stays in place
- [ ] Pan to position, logout/login → restores position
- [ ] Pan to position, new tab → loads from Firebase
- [ ] Pan to position, clear sessionStorage, reload → loads from Firebase
- [ ] No console errors about "different pan offset"
- [ ] No visual jumping on load

---

**Remember**: The goal is zero visual disruption. If you see ANY jumping, flashing, or position changes on load, something is broken!