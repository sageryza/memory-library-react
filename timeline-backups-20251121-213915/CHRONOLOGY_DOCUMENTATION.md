# Chronology Component - Comprehensive Documentation

## Overview

The Chronology component is an interactive timeline view that allows users to arrange memories chronologically. It features drag-and-drop functionality, dynamic scaling/focus effects, and Firebase persistence.

**File:** `src/components/chronology.jsx` (1239 lines)

---

## Core Concepts

### 1. **Timeline Structure**

The timeline is an array containing THREE types of items:

```javascript
timeline = [
  { id: 'ghost-start', type: 'ghost' },      // Start bookend (droppable)
  { id: 'mem-123', type: 'memory', ... },    // Actual memory
  { id: 'gap-abc', type: 'gap' },            // Droppable gap between memories
  { id: 'mem-456', type: 'memory', ... },    // Another memory
  { id: 'ghost-end', type: 'ghost' }         // End bookend (droppable)
]
```

**Important:** ALL three types participate in scaling/focus - not just memories!

### 2. **Memory Chunks**

Adjacent memories (no gaps between) are grouped into "chunks" for rendering:
- Chunk = consecutive memories with no gaps
- Rendered as `<div className="memory-chunk">` wrapper
- Allows dragging groups of adjacent memories together

### 3. **State Management**

**Local State:**
- `timeline` - Array of memories, gaps, and ghosts
- `sidebarMemories` - Memories not on timeline
- `focusedIndex` - Currently focused timeline index (for scaling)
- `draggedItem` - Item being dragged
- `dropTarget` - Where drop would occur

**Firebase State (via useChronologyState hook):**
```javascript
{
  positions: {
    timelineIds: ['mem-1', 'mem-2', ...],  // Memory IDs on timeline
    sidebarIds: ['mem-3', 'mem-4', ...],   // Memory IDs in sidebar
    lastUpdated: "ISO timestamp"
  }
}
```

**Critical Refs:**
- `hasLoadedFromFirebaseRef` - Has data been loaded once?
- `processedPositionsRef` - Which positions data have we processed?
- `lastSavedStateRef` - What did we last save (prevents duplicate work)?
- `initialLoadCompleteRef` - Is initial load done (can we save now)?
- `saveTimeoutRef` - Debounce timer for saves

---

## Data Flow

### Initial Page Load

```
1. Component mounts
   └─> Load Effect runs
       ├─> memoriesLoading = true → Skip
       └─> chronologyLoading = true → Skip

2. useMemories finishes loading
   └─> memoriesLoading = false
       └─> Load Effect runs
           ├─> chronologyLoading = true → Skip
           └─> Wait for Firebase

3. useChronologyState finishes loading
   └─> chronologyLoading = false
       └─> chronologyState.positions = {...}
           └─> Load Effect runs
               ├─> Compare with processedPositionsRef
               ├─> If positions have data → RESTORE
               │   ├─> Map timelineIds to memory objects
               │   ├─> Rebuild timeline with gaps
               │   └─> Set timeline & sidebar state
               └─> If no positions → FIRST TIME
                   └─> Put all memories in sidebar

4. Set initialLoadCompleteRef = true after 1 second
   └─> Enables saving
```

### User Drags Memory to Timeline

```
1. handleDragStart(e, memory)
   └─> setDraggedItem({ item: memory, fromSidebar: true })

2. User hovers over drop zone
   └─> handleDragOver(e, targetItem)
       ├─> Update focusedIndex (for visual feedback)
       └─> setDropTarget({ type, id, side })

3. User releases
   └─> handleDrop(e)
       ├─> If dropping on gap:
       │   ├─> Replace gap with: [gap-before, memory, gap-after]
       │   └─> Run cleanupGaps()
       ├─> If dropping on memory edge:
       │   └─> Insert memory at position
       └─> Update timeline state
           └─> Triggers Save Effect (after 2 seconds)
```

### Save Flow

```
1. Timeline/sidebar state changes
   └─> Save Effect runs
       ├─> Check guards (loaded? user? complete?)
       ├─> Extract memory IDs (filter out gaps/ghosts)
       ├─> Create currentStateKey = JSON.stringify({timelineIds, sidebarIds})
       ├─> Compare with lastSavedStateRef
       └─> If different:
           ├─> Clear existing timeout
           └─> Start 2-second timer
               └─> After 2 seconds:
                   ├─> updateChronologyState({ positions: {...} })
                   ├─> Save to Firebase with { merge: true }
                   └─> Update lastSavedStateRef

2. Firebase updates
   └─> onSnapshot in useChronologyState triggers
       └─> chronologyState.positions updates
           └─> Load Effect runs
               ├─> Compare with processedPositionsRef → Different!
               ├─> Compare with lastSavedStateRef
               └─> If matches lastSaved:
                   ├─> "This is our own save echoing back"
                   └─> Skip rebuild (prevents adding gaps)
```

---

## Key Functions

### Load Effect (Lines 51-168)

**Purpose:** Initialize timeline from Firebase data OR empty state

**Guards:**
1. `memoriesLoading` → Wait for memories
2. `chronologyLoading` → Wait for Firebase
3. `processedPositionsRef` → Skip if already processed this data
4. `lastSavedStateRef` → Skip if this is our own save echoing back

**Process:**
- Extract `timelineIds` and `sidebarIds` from Firebase
- Map IDs to actual memory objects
- Rebuild timeline with gaps between memories
- Set `processedPositionsRef` to prevent reprocessing

**Critical Bug Point:** Lines 119-126 ALWAYS add gaps between memories. This is correct for initial load, but problematic when Firebase updates trigger this effect.

### Save Effect (Lines 170-251)

**Purpose:** Save timeline arrangement to Firebase (debounced)

**Guards:**
1. `!hasLoadedFromFirebaseRef` → Don't save before loading
2. `!user?.uid` → Must be authenticated
3. `chronologyLoading` → Don't save while loading
4. `!initialLoadCompleteRef` → Wait 1 second after load

**Process:**
- Extract memory IDs from timeline (filter out gaps/ghosts)
- Create state key for comparison
- If changed, start 2-second debounce timer
- On timer completion, save to Firebase
- Update `lastSavedStateRef` on success

**Debounce:** 2 seconds - prevents excessive saves during dragging

### handleDrop (Lines 413-588)

**Purpose:** Handle memory drop on timeline

**Drop Zones:**
1. **Gap** - Replace gap with [gap, memory, gap], cleanup duplicates
2. **Ghost** - Add to start/end with one gap
3. **Memory edge** - Insert next to memory based on left/right side

**Important:** Always calls `cleanupGaps()` to remove:
- Duplicate adjacent gaps
- Gaps next to ghosts

### cleanupGaps (Lines 391-411)

**Purpose:** Remove invalid gaps from timeline

**Rules:**
- Remove duplicate consecutive gaps
- Remove gaps next to `ghost-start` or `ghost-end`

### getVisibleItemsAndScales (Lines 272-325)

**Purpose:** Calculate which timeline items to render and their scale factors

**Scaling Logic:**
- Focused item: scale = 1.0 (250px wide)
- Distance 1: scale = 0.75
- Distance 2: scale = 0.55
- Distance 3: scale = 0.4
- Distance 4+: scale = 0.25

**Performance:** Uses `useCallback` to avoid recalculation on every render

---

## Critical Issues & Bugs

### 1. **Gap Addition After Save (CURRENT BUG)**

**Problem:** When user places memories adjacent (no gap), after 2 seconds a gap appears between them.

**Root Cause:**
- Save completes → Firebase updates `positions`
- Load effect runs (dependency: `chronologyState.positions`)
- Lines 119-126 rebuild timeline, ALWAYS adding gaps
- Check at line 80 (`lastSavedStateRef` comparison) should prevent this but fails

**Why the check fails (hypothesis):**
- Line 137: Sets `lastSavedStateRef` with keys `{timeline, sidebar}`
- Line 204: Save effect uses keys `{timelineIds, sidebarIds}`
- These were mismatched until fixed in session
- Even after fix, gaps still appear - comparison may be failing for other reasons

**Possible Solutions:**
1. Don't add `chronologyState.positions` to load effect dependencies
2. Add a flag to track "is this a user load or auto-reload?"
3. Store actual timeline structure (with/without gaps) in Firebase
4. Only run load effect on ACTUAL page load, not Firebase updates

### 2. **Load Effect Runs on Every Save**

**Problem:** Load effect dependency includes `chronologyState.positions`, which updates on every save.

**Impact:**
- Effect runs unnecessarily
- Risk of rebuilding timeline when not needed
- Potential performance issues

**Solution:** Consider removing from dependencies or using a ref to track when to actually process.

### 3. **Key Naming Inconsistency (FIXED)**

**Was:** Save used `{timeline, sidebar}`, Load used `{timelineIds, sidebarIds}` - comparison always failed

**Fixed:** Both now use `{timelineIds, sidebarIds}` (line 204)

### 4. **Firebase setDoc Without Merge (FIXED)**

**Was:** `setDoc(ref, data)` overwrote entire document

**Fixed:** `setDoc(ref, data, { merge: true })` (useChronologyState.js:90)

---

## Effect Dependencies

### Load Effect Dependencies (Line 168)
```javascript
[memoriesLoading, chronologyLoading, memories.length, chronologyState.positions]
```

**Problem:** `chronologyState.positions` causes effect to run on every save!

### Save Effect Dependencies (Line 251)
```javascript
[timeline, sidebarMemories, user?.uid, chronologyLoading, updateChronologyState]
```

**Triggers:** Any timeline/sidebar change → Schedules save

---

## Drag & Drop System

### Drag States

```javascript
draggedItem = {
  item: {memory object or chunk},
  isChunk: boolean,
  fromSidebar: boolean
}

dropTarget = {
  type: 'gap' | 'memory' | 'ghost',
  id: string,
  side: 'left' | 'right'  // Only for memory type
}
```

### Drop Handlers (Lines 422-585)

**Gap Drop:**
- Replace gap with `[gap-before, memory, gap-after]`
- Remove from sidebar if `fromSidebar = true`
- Cleanup duplicate gaps

**Ghost Drop:**
- `ghost-start`: Insert `[memory, gap]` after ghost
- `ghost-end`: Insert `[gap, memory]` before ghost

**Memory Edge Drop:**
- Calculate insert position based on `side` ('left' or 'right')
- If from sidebar: Insert and remove from sidebar
- If reordering: Remove from current position, insert at new position
- Adjust insert index if moving right (account for removal)

---

## Performance Considerations

### Expensive Operations

1. **getVisibleItemsAndScales** - Runs on every focusedIndex change
   - Wrapped in `useCallback`
   - Calculates scales for all items

2. **Timeline Rebuild** - Happens in load effect
   - Maps IDs to memory objects
   - Creates new timeline array with gaps
   - Should only run on actual data changes

3. **Save Debouncing** - 2-second delay
   - Prevents excessive Firebase writes
   - Clears previous timeout on new changes

### Optimization Opportunities

1. Virtualization - Only render visible timeline items (currently renders all)
2. Memo - Wrap memory cards in `React.memo`
3. Reduce load effect reruns - Fix dependency issue

---

## Firebase Integration

### Document Structure

```
users/{userId}/chronologyState/current
{
  positions: {
    timelineIds: string[],
    sidebarIds: string[],
    lastUpdated: string (ISO timestamp)
  },
  viewSettings: {},
  updatedAt: Firestore Timestamp
}
```

### Hook: useChronologyState

**Responsibilities:**
- Subscribe to Firebase document via `onSnapshot`
- Provide `updateChronologyState` function
- Use `{ merge: true }` to prevent data loss

**Key Fix:** `useCallback` wrapper with proper dependencies (line 64)

---

## Common Scenarios

### First Time User
1. Load effect runs
2. No positions in Firebase → `[]` arrays
3. Put all memories in sidebar
4. Timeline = `[ghost-start, ghost-end]`

### Returning User with Saved Data
1. Load effect runs
2. Firebase has `{timelineIds: [...], sidebarIds: [...]}`
3. Map IDs to memories
4. Rebuild timeline with gaps
5. Restore arrangement

### Adding New Memory (to app)
1. New memory not in `timelineIds` or `sidebarIds`
2. Load effect finds it in "new memories" filter (line 115)
3. Adds to sidebar with existing sidebar memories

### Dragging Adjacent Memories
1. Drop memory next to another on memory edge
2. No gap between them initially
3. After 2 seconds, save completes
4. Firebase updates → Load effect runs
5. **BUG:** Rebuild adds gaps between ALL memories

---

## State Refs Explained

### hasLoadedFromFirebaseRef
- **Purpose:** Track if we've loaded data at least once
- **Used:** Guard against premature saves
- **Set:** After first successful load (line 162)

### processedPositionsRef
- **Purpose:** Track which specific positions data we've processed
- **Format:** JSON string of `{timelineIds, sidebarIds}`
- **Used:** Prevent reprocessing same data (line 73)

### lastSavedStateRef
- **Purpose:** Track what we last saved to Firebase
- **Format:** JSON string of `{timelineIds, sidebarIds}`
- **Used:**
  1. Skip save if nothing changed (line 210)
  2. Skip load if Firebase echo (line 80)

### initialLoadCompleteRef
- **Purpose:** Delay saves until 1 second after initial load
- **Reason:** Ensures Firebase has finished loading
- **Set:** setTimeout 1000ms after load (line 164)

### saveTimeoutRef
- **Purpose:** Store debounce timer ID
- **Used:** Clear previous timer when new changes occur (line 217)

---

## Styling Notes

- Uses inline `<style>` tag (lines 825-1236)
- Fonts: "Crimson Text" (main), "Courier Prime" (monospace)
- Colors: #800020 (burgundy primary), #faf8e9 (cream background)
- Responsive: Sidebar width changes at 768px breakpoint

---

## Debugging Guide

### Console Logs

Current session added comprehensive logging with emoji prefixes:

```
⏸️ - Waiting/Blocked
🎯 - Load effect running
🆕 - New data detected
✅ - Success
❌ - Error
🔍 - Save effect check
💾 - Saving to Firebase
📤 - Firebase function called
📍 - Document path
```

### Key Logs to Watch

**Initial Load:**
```
⏸️ Waiting for memories to load
⏸️ Waiting for chronology to load from Firebase
🎯 LOAD EFFECT - Initializing chronology with state
✅ RESTORING FROM FIREBASE or ✅ FIRST TIME LOAD
✅ Ready to save changes
```

**Dragging Memory:**
```
🔍 SAVE EFFECT - Running with checks
State changed, scheduling save...
SAVING TO FIREBASE
📤 updateChronologyState called
💾 Calling setDoc with data
✅ Save completed successfully
```

**Firebase Echo (The Bug):**
```
🆕 New positions detected  // Should say "⏸️ This is our own saved data"
🎯 LOAD EFFECT - Initializing chronology
✅ RESTORING FROM FIREBASE  // Rebuilds with gaps!
```

---

## Next Steps for Future Developer

### To Fix Gap Addition Bug:

1. **Investigate why line 80 check fails:**
   - Add more logging to compare actual values
   - Check if array order matters
   - Verify timing of when lastSavedStateRef is set vs. when Firebase updates

2. **Consider alternative approaches:**
   - Store gap presence in Firebase (not just memory IDs)
   - Don't add chronologyState.positions to load effect dependencies
   - Use a different mechanism to detect "real" vs "echo" Firebase updates

3. **Test with console logs:**
   ```javascript
   console.log('Comparing:');
   console.log('lastSaved:', lastSavedStateRef.current);
   console.log('current:', currentPositionsKey);
   console.log('Match?:', lastSavedStateRef.current === currentPositionsKey);
   ```

### To Improve Performance:

1. Implement virtualization for long timelines
2. Remove chronologyState.positions from load effect dependencies
3. Add React.memo to memory cards

### To Add Features:

1. Timeline zoom controls
2. Date/time labels on timeline
3. Search/filter memories on timeline
4. Bulk operations (select multiple, move together)

---

## Session Changes Summary

**Fixed:**
- ✅ Added `{ merge: true }` to setDoc (prevents data loss)
- ✅ Wrapped updateChronologyState in useCallback
- ✅ Changed from boolean guard to position tracking (processedPositionsRef)
- ✅ Fixed key naming mismatch (timeline/sidebar → timelineIds/sidebarIds)

**Still Broken:**
- ❌ Gaps still appear between adjacent memories after save
- ❌ Load effect runs on every Firebase update (performance issue)

**Added:**
- Comprehensive diagnostic logging
- Documentation of all functions and flows

---

## File References

- Main component: `src/components/chronology.jsx`
- State hook: `src/hooks/useChronologyState.js`
- Auth hook: `src/hooks/useAuth.js`
- ID utilities: `src/utils/generateId.js`
- Memories hook: `src/hooks/useMemories.js`

---

## Questions for Next Session

1. Should gaps be stored in Firebase or dynamically generated?
2. Should load effect run on every Firebase update or only page load?
3. Is the chunk system necessary or could it be simplified?
4. Should we implement a "loading" state to prevent premature saves?
5. Would it help to add version numbers to detect stale updates?

---

**Last Updated:** 2025-11-11
**By:** Claude (AI Assistant)
**Session:** Chronology Persistence Debugging
