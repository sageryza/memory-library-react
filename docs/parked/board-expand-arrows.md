# Parked feature: Conspiracy board expandable canvas edge arrows

**Parked:** July 10, 2026
**Branched from:** `origin/main` @ `d71e9076eaec12964ebde39e389cc4a313bfb808` (use `git show d71e9076:src/components/conspiracy-board/ConspiracyBoard.jsx` to see the full original file)
**Owner's reason:** "doesn't really work and confuses things — remove for now, restore later."

## What the feature did

When the user panned (drag or wheel/trackpad scroll) past the edge of the board
canvas, slim maroon (`#800020`) arrow buttons appeared flush against that edge
of the viewport and stayed visible for ~3 seconds after the gesture ended.
Tapping an arrow grew the canvas by half a viewport in that direction (left/up
expansion also shifted the origin offset so existing card positions stayed
put). The expanded bounds were persisted to sessionStorage
(`boardCanvasBounds`) and saved per board (`canvasBounds` on the board doc).

## What was KEPT (do not re-remove when restoring)

The `canvasBounds` state and all bounds *honoring* remain in place so boards
that were already expanded still render all their cards:

- `canvasBounds` state + sessionStorage restore (`boardCanvasBounds` key) —
  `ConspiracyBoard.jsx` ~line 140
- `saveCanvasBoundsToSession` + `calculateBoundsForContent` helpers (~line 330)
- Initial-load effect that auto-grows bounds to fit content (never clips
  cards) — ~line 440
- Board save/load carrying `canvasBounds` (`handleSaveBoard`,
  `handleLoadBoardClick` ~lines 1045–1095, and `useSavedBoards.js` /
  `useLocalStorage.js` persistence fields)
- All pan clamping to `canvasBounds.offsetX/Y` (drag, wheel, minimap, keyboard)

Only the *manual expansion* ability (arrow UI, pan-past-edge detection, the
`expandCanvas` handler) was removed. The arrows used inline styles only — no
CSS classes were involved (the `.expand-btn` class in `ConspiracyBoard.css` is
an unrelated, older memory-popup text-expand button and was left alone).

## Removed code (verbatim)

### 1. State — `src/components/conspiracy-board/ConspiracyBoard.jsx`, ~line 137 (with the other `useState` declarations, just before `showZoomIndicator`)

```jsx
  const [showExpandArrow, setShowExpandArrow] = useState({ left: false, right: false, up: false, down: false })
```

Also, the comment above the `canvasBounds` state read (restore if desired):

```jsx
  // Dynamic canvas bounds - starts at 2x viewport, expandable by half viewport increments
```

### 2. Timeout ref — same file, ~line 222 (with the other refs, just after `panSaveTimeoutRef`)

```jsx
  // Timer for keeping expand arrows visible
  const expandArrowTimeoutRef = useRef(null)
```

### 3. `expandCanvas` handler — same file, ~lines 378–408 (right after `calculateBoundsForContent`, before the Firebase pan-offset sync effect)

```jsx
  // Expand canvas in a specific direction by half viewport
  const expandCanvas = useCallback((direction) => {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const halfWidth = viewportWidth / 2
    const halfHeight = viewportHeight / 2

    setCanvasBounds(prev => {
      let newBounds = { ...prev }

      switch (direction) {
        case 'left':
          newBounds.width += halfWidth
          newBounds.offsetX += halfWidth // Push origin right to maintain positions
          break
        case 'right':
          newBounds.width += halfWidth
          break
        case 'up':
          newBounds.height += halfHeight
          newBounds.offsetY += halfHeight // Push origin down to maintain positions
          break
        case 'down':
          newBounds.height += halfHeight
          break
      }

      saveCanvasBoundsToSession(newBounds)
      return newBounds
    })
  }, [])
```

### 4. Pan-past-bound detection (drag) — same file, inside `handlePanMove`, ~lines 1986–1997 (between the `rawX`/`rawY` computation and the clamped `newOffset`)

```jsx
      // Detect if user is trying to pan beyond limits
      const tryingLeft = rawX > maxPanX
      const tryingRight = rawX < -maxPanX
      const tryingUp = rawY > maxPanY
      const tryingDown = rawY < -maxPanY

      setShowExpandArrow({
        left: tryingLeft,
        right: tryingRight,
        up: tryingUp,
        down: tryingDown
      })
```

(The enclosing comment originally read `// Pan bounds use dynamic canvas bounds (starts at 2x viewport, expandable)`.)

### 5. Arrow linger timer (drag end) — same file, inside `handlePanEnd`, ~lines 2012–2018 (right after `setPanStart(null)`)

```jsx
      // Keep expand arrows visible for 3 seconds after panning ends so user can tap them
      if (expandArrowTimeoutRef.current) {
        clearTimeout(expandArrowTimeoutRef.current)
      }
      expandArrowTimeoutRef.current = setTimeout(() => {
        setShowExpandArrow({ left: false, right: false, up: false, down: false })
      }, 3000)
```

### 6. Scroll-past-bound detection (wheel) — same file, inside the wheel handler, ~lines 2196–2217 (between the `maxPanX`/`maxPanY` declarations and `clampedOffset`)

```jsx
      // Detect if user is trying to scroll beyond limits
      const tryingLeft = newOffset.x > maxPanX
      const tryingRight = newOffset.x < -maxPanX
      const tryingUp = newOffset.y > maxPanY
      const tryingDown = newOffset.y < -maxPanY

      // Show arrows when hitting edges, keep visible for 3 seconds
      if (tryingLeft || tryingRight || tryingUp || tryingDown) {
        setShowExpandArrow({
          left: tryingLeft,
          right: tryingRight,
          up: tryingUp,
          down: tryingDown
        })
        // Clear previous timeout and set new 3 second timeout
        if (expandArrowTimeoutRef.current) {
          clearTimeout(expandArrowTimeoutRef.current)
        }
        expandArrowTimeoutRef.current = setTimeout(() => {
          setShowExpandArrow({ left: false, right: false, up: false, down: false })
        }, 3000)
      }
```

### 7. Arrow render block — same file, ~lines 3611–3684 (inside the board canvas container `<div>`, immediately after the minimap block's closing `)}` and before the container's `</div>`)

```jsx
            {/* Canvas expansion arrows - appear when user tries to pan past canvas edge */}
            {(() => {
              const sidebarWidth = isSidebarOpen ? 400 : 0

              // Maroon rectangle with white arrow styling
              const baseStyle = {
                position: 'absolute',
                background: '#800020', // Maroon
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 100,
                color: 'white',
                transition: 'opacity 0.2s',
                borderRadius: '1px'
              }

              // Horizontal arrows (left/right) - slim rectangles
              const horizontalStyle = {
                ...baseStyle,
                width: '20px',
                height: '48px'
              }

              // Vertical arrows (up/down) - slim rectangles
              const verticalStyle = {
                ...baseStyle,
                width: '48px',
                height: '20px'
              }

              return (
                <>
                  {showExpandArrow.left && (
                    <button
                      style={{ ...horizontalStyle, left: 0, top: '50%', transform: 'translateY(-50%)' }}
                      onClick={() => expandCanvas('left')}
                      title="Expand canvas left"
                    >
                      <ChevronLeft size={16} color="white" />
                    </button>
                  )}
                  {showExpandArrow.right && (
                    <button
                      style={{ ...horizontalStyle, right: sidebarWidth, top: '50%', transform: 'translateY(-50%)' }}
                      onClick={() => expandCanvas('right')}
                      title="Expand canvas right"
                    >
                      <ChevronRight size={16} color="white" />
                    </button>
                  )}
                  {showExpandArrow.up && (
                    <button
                      style={{ ...verticalStyle, left: `calc(50% - ${sidebarWidth / 2}px)`, top: 0, transform: 'translateX(-50%)' }}
                      onClick={() => expandCanvas('up')}
                      title="Expand canvas up"
                    >
                      <ChevronUp size={16} color="white" />
                    </button>
                  )}
                  {showExpandArrow.down && (
                    <button
                      style={{ ...verticalStyle, left: `calc(50% - ${sidebarWidth / 2}px)`, bottom: 0, transform: 'translateX(-50%)' }}
                      onClick={() => expandCanvas('down')}
                      title="Expand canvas down"
                    >
                      <ChevronDown size={16} color="white" />
                    </button>
                  )}
                </>
              )
            })()}
```

### 8. Icon imports — same file, line 3

`ChevronLeft, ChevronRight, ChevronUp, ChevronDown` were removed from the
`lucide-react` import. Original line:

```jsx
import { Library, Grid3x3, Eye, EyeOff, Trash2, Lightbulb, Pin, MapPin, Star, Flag, X, Pencil, Undo2, Plus, SquarePlus, Copy, BookOpen, Map, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Share2 } from 'lucide-react'
```

## Restore notes

1. Re-add the four Chevron icons to the `lucide-react` import (block 8).
2. Re-add the `showExpandArrow` state (block 1) with the other `useState`
   declarations, and `expandArrowTimeoutRef` (block 2) with the other refs.
3. Re-add the `expandCanvas` callback (block 3) after
   `calculateBoundsForContent` — it depends on `setCanvasBounds` and
   `saveCanvasBoundsToSession`, both still present.
4. Re-insert detection block 4 into `handlePanMove` (search for
   `const rawY = panStart.startPanY + deltaY`) and block 5 into `handlePanEnd`
   (right after `setPanStart(null)`).
5. Re-insert detection block 6 into the native wheel handler (search for
   `Clamp to pan bounds using dynamic canvas bounds`), between the
   `maxPanX`/`maxPanY` declarations and `clampedOffset`. Note both handlers
   are `useCallback`s / effects whose dependency arrays already include
   `canvasBounds`, so no dep changes are needed.
6. Re-insert the render block 7 inside the canvas container div, after the
   minimap conditional (`{showMinimap && (...)}`) block.
7. Consider adding a missing-in-the-original unmount cleanup for
   `expandArrowTimeoutRef` (the original never cleared it on unmount).

All persistence plumbing (sessionStorage key `boardCanvasBounds`, the
`canvasBounds` field on saved boards in `src/hooks/useSavedBoards.js` and
`src/hooks/useLocalStorage.js`, and the save/load merge logic in
`ConspiracyBoard.jsx`) was intentionally left in place, so restoring is purely
re-adding the blocks above.
