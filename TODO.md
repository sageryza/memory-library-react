# TODO - Memory Library React Refactoring

**Last Updated:** 2025-11-11
**Priority:** High items first

---

# ⚡ PARALLEL DEVELOPMENT WORKFLOW

⚠️ **IMPORTANT: Multiple chats are working on different tasks simultaneously using git worktrees.**

## How This Works

- **Main repo:** `/Users/sageryza/Documents/timeline/memory-library-react`
- **This file:** Contains ALL tasks for ALL chats
- **Your worktree:** You're working in a separate directory on a specific branch
- **Other chats:** Working in their own worktrees on their own branches

## Before You Start

1. **Pick a task** from the list below that interests you
   - Either: Pick one and tell the user which one (await confirmation)
   - Or: Give the user 2-3 options you're interested in working on
2. **Mark your task as IN PROGRESS** by adding `**[IN PROGRESS]**` to the task title
   - Example: `### Archive - Boolean Hashtag Filtering **[IN PROGRESS]**`
   - This prevents other chats from picking the same task
3. **Check related tasks** to see if other chats are touching the same files
4. **Note shared files** that multiple tasks might modify (see list below)

## Avoiding Conflicts

### High-Risk Shared Files (check if others are modifying these):
- `src/App.css` - Global styles (many tasks touch this)
- `src/components/conspiracy-board/ConspiracyBoard.jsx` - Large file, many tasks
- `src/components/conspiracy-board/ConspiracyBoard.css` - Styling for conspiracy board
- `src/components/archive/Archive.jsx` - Archive component
- `src/components/shared/*` - Shared components used everywhere
- `src/hooks/*` - Shared hooks

### Best Practices:
1. **Scan other task descriptions** to see which files they touch
2. **If another task touches your files:** Coordinate or work on different parts
3. **Prefer creating NEW files** over modifying shared ones when possible
4. **Use specific CSS classes** to avoid global style conflicts
5. **Ask questions** if you're unsure about conflicts

## Your Worktree

- You're in an isolated directory with your own branch
- Changes you make here don't affect other chats until merged
- You can safely commit without disrupting others
- Reference this master task file at: `../memory-library-react/TODO.md`

## When You're Done

1. **Mark your task as COMPLETE** by changing `**[IN PROGRESS]**` to `**[COMPLETE]**`
2. Commit your changes to your branch (including the TODO.md status update)
3. Report back: "Task complete, branch: [your-branch-name]"
4. User will test and merge if successful

## Task Status Legend

- **No marker** = Available to work on
- **[IN PROGRESS]** = Someone is currently working on this
- **[COMPLETE]** = Finished and waiting for merge/testing
- **[MERGED]** = Successfully merged to main

---

## 🌙 GROUP DREAM JOURNAL (2026-06-21)

**Decision made:** Build on **Firebase now**; add **Supabase later** as an *additive* analytics
layer (not a replacement) only when a concrete cross-user feature justifies it.

**Why Firebase now:** The app is already fully on Firebase (Auth, Firestore, rules, hosting,
offline persistence). A group journal as a *shared feed* (post a dream, everyone in the group
sees it live) is Firestore's sweet spot. Per-user and per-group data stays bounded, so user
growth is not the scaling risk.

**The "add Supabase later" trigger:** The one thing Firestore can't do ergonomically is
**impromptu, ad-hoc cross-user aggregation** ("read all dreams, find commonalities, not preset").
Fixed metrics ("200 people dreamt of water last night") are fine via pre-aggregated counters;
"find similar to X" is now doable via Firestore vector search. But open-ended exploratory
analytics across the whole corpus is the signal to add a Postgres/pgvector analytics store
alongside Firebase, fed by a write-through. This same engine would later serve cross-user
"cards of the day" matching too — it's recurring product infrastructure, not a one-off.

**Data-hygiene note (do this regardless, cheap insurance):** keep records clean and structured
now — consistent tags/keywords, real timestamps, and persist extracted keywords onto each
memory/dream doc rather than recomputing — so backfilling into Postgres later is painless.

### Group Dream Journal - Firestore Schema & Security Rules
**Goal:** Foundation for the group journal. Everything else sits on this.

**Approach:**
- New collections: `/groups/{groupId}` (metadata + `memberIds`) and
  `/groups/{groupId}/entries/{entryId}` (dream entries)
- Personal dreams (if a private dream journal is wanted) → `/users/{uid}/dreams`,
  kept distinct from `/users/{uid}/memories`
- Membership model: `memberIds` array (or a `members` subcollection if groups get large)
- Extend `firestore.rules` with group read/write: e.g. read/write entries
  `if request.auth.uid in get(/groups/$(groupId)).data.memberIds`
- Reuse existing auth + offline persistence; mirror the existing user-scoped rules patterns

**Dream entry shape — dreams are a specialized kind of card, NOT memories:**
Store dreams separately from memories (different collection + access model), but reuse a shared
*card base* so existing card/board/keyword/chronology machinery still works.
- Shared card base: `title`, `content`, `tags[]`, `date`, `createdAt`, `type: 'dream' | 'memory'`
- Dream-specific extension (nested `dream: {...}`): `sleepDate` (distinct from logged date),
  `lucid`, `vividness`, `emotions[]`, `symbols[]`, `recurring`, `people[]`, `wakingTriggers`
- **Make `symbols[]` and `emotions[]` first-class structured fields** (not freetext / generic
  hashtags) — this is what makes the later cross-user aggregation ("200 dreamt of water") and
  Postgres/pgvector backfill clean. Get this right BEFORE accumulating dream data; reshaping
  after the fact is the painful migration.

**Files:** `firestore.rules`, `firestore.indexes.json`, new `src/hooks/useGroups.js` (+ entries hook)

---

### Group Dream Journal - Shared Feed UI
**Goal:** Post a dream to a group and see the group's entries live.

**Approach:**
- Group create / join / invite UI
- Real-time feed via `onSnapshot` on `/groups/{groupId}/entries` ordered by `createdAt`
- Adapt existing memory/card components to render a group entry instead of a user-scoped one

**Depends on:** Group Firestore Schema & Security Rules (above)

---

### Board-State Concurrency Fix (prerequisite for ANY multi-user editing)
**Problem:** All canvas state (positions, **all connections as one array**, pins) lives in a
single `users/{uid}/boardState/current` doc that is rewritten on every change
(`useBoardState.js:64`, `ConspiracyBoard.jsx:291`). With one user across tabs this already risks
last-write-wins; with multiple users editing a shared board, one person's write clobbers another's.

**Fix:** Split the single doc into per-entity documents so concurrent edits don't collide, e.g.
`/boards/{id}/items/{itemId}` and `/boards/{id}/connections/{connId}`. Independent of the journal,
but required before any shared/collaborative board editing works.

**Files:** `src/hooks/useBoardState.js`, `src/components/conspiracy-board/ConspiracyBoard.jsx`,
`firestore.rules`

---

## 🗑️ RECENTLY DELETED FEATURE **[IN PROGRESS - NEEDS DEBUGGING]**

**Status:** Backend complete ✅ | UI created ✅ | Integration broken ❌

### What It Does
Soft-delete system where deleted memories go to "trash" instead of being permanently removed. Users can restore or permanently delete from Settings → Recently Deleted.

### Implementation Status

**✅ COMPLETE:**
1. **Backend (useMemories.js)**
   - `deleteMemory()` now soft deletes (sets `deletedAt` timestamp)
   - `deletedMemories` state auto-updates via Firestore onSnapshot
   - `restoreMemory(id)` - Restores memory by clearing `deletedAt`
   - `permanentlyDeleteMemory(id)` - Actually deletes from Firestore
   - `emptyTrash()` - Permanently deletes all deleted memories

2. **UI Components**
   - `RecentlyDeletedModal.jsx` + CSS - Displays trash, restore/delete buttons
   - `SettingsModal.jsx` + CSS - Settings menu with Recently Deleted option

**❌ BROKEN:**
- Settings button in ConspiracyBoard User Account dropdown not opening modal
- Possible HMR cache issue or JavaScript error

### How to Complete/Debug

**Option 1: Debug Current Implementation**
```bash
# 1. Verify state exists in ConspiracyBoard
grep "showSettingsModal" src/components/conspiracy-board/ConspiracyBoard.jsx

# 2. Check onClick updated (should NOT be alert anymore)
grep "onClick: () => setShowSettingsModal" src/components/conspiracy-board/ConspiracyBoard.jsx

# 3. Hard refresh browser (Cmd+Shift+R) and check console for errors
```

**Option 2: Add to Other Pages**
If ConspiracyBoard continues having issues, add Settings to Archive/Chronology:
```javascript
// In Archive.jsx or other pages:
import SettingsModal from '../shared/SettingsModal'
import RecentlyDeletedModal from '../shared/RecentlyDeletedModal'
import { useMemories } from '../../hooks/useMemories'

// Add state
const [showSettings, setShowSettings] = useState(false)
const [showRecentlyDeleted, setShowRecentlyDeleted] = useState(false)

// Add button somewhere in UI
<button onClick={() => setShowSettings(true)}>⚙️ Settings</button>

// Render modals
{showSettings && <SettingsModal ... />}
{showRecentlyDeleted && <RecentlyDeletedModal ... />}
```

### Files Modified
- `src/hooks/useMemories.js`
- `src/components/shared/RecentlyDeletedModal.jsx` (NEW)
- `src/components/shared/RecentlyDeletedModal.css` (NEW)
- `src/components/shared/SettingsModal.jsx` (NEW)
- `src/components/shared/SettingsModal.css` (NEW)
- `src/components/conspiracy-board/ConspiracyBoard.jsx`
- `src/App.jsx`

### Testing Steps
1. Delete a memory → Verify it disappears
2. Settings → Recently Deleted → See deleted memory with date
3. Click Restore → Memory reappears
4. Delete again → Click Delete Forever → Permanently gone
5. Empty Trash → All deleted memories removed

---

## 📝 NEW TODOS FROM NOTEBOOK (2025-11-11)

### Archive - Boolean Hashtag Filtering (Simple Version) **[COMPLETE]**
**Current behavior:** Click one hashtag → filter to only memories with that tag

**Desired behavior:**
- Click multiple hashtags to add them to the filter bar
- Default operator is `+` (AND) between tags
- Click the `+` to toggle it to `OR`
- Display in header: `#work + #urgent` or `#work OR #urgent`
- Memories must match based on the operators:
  - AND (`+`) = memory must have ALL selected tags
  - OR = memory can have ANY of the selected tags

**Future consideration:** Complex version with parentheses/grouping for mixed operators (e.g., `#work + (#urgent OR #personal)`) - implements boolean operator precedence

---

### Conspiracy Board Constellation Mode - Fix Tab Styling
**Issues:**
- No space above the "Select" and "Load" tabs
- Missing header color

**Location:** Constellation mode tab interface

---

### Conspiracy Board - Redesign Advanced Search Styling
**Goal:** Improve the visual design and styling of the advanced search panel

**Location:** `src/components/shared/AdvancedSearch.jsx` and `AdvancedSearch.css`

**Areas to review:**
- Overall layout and spacing
- Input field styling
- Button styling
- Visual hierarchy
- Color scheme
- Responsiveness

**Note:** Specific design changes to be determined

---

### Conspiracy Board - Enable Touchpad/Mousepad Scrolling **[COMPLETE]**
**Goal:** Make it possible to scroll/pan the Conspiracy Board canvas using touchpad or mousepad wheel events

**Current behavior:** Wheel events are prevented but don't trigger panning

**Desired behavior:**
- Two-finger scroll on touchpad should pan the canvas
- Mouse wheel should pan the canvas
- Should feel smooth and natural
- Should respect pan bounds (don't pan beyond canvas limits)

**Location:** `src/components/conspiracy-board/ConspiracyBoard.jsx:1312` - `handleWheel` function

**Implementation notes:**
- Wheel event listener already exists with `passive: false`
- Need to update `panOffset` state based on `e.deltaX` and `e.deltaY`
- Should respect the same bounds as mouse panning (CANVAS_OFFSET_X/Y)
- May want to add sensitivity adjustment for natural feel

---

### Archive - Match Constellation Hover Feature from Vanilla Code
**Goal:** Implement the constellation hover icon and behavior from the vanilla archive, including the glowing visual effect

**Reference:** Vanilla archive.html/archive.css constellation hover feature

**Tasks:**
- Add constellation icon to memory cards (match vanilla icon)
- Implement hover behavior (show icon on card hover)
- Add glowing effect when hovering over constellation icon
- Match visual styling from vanilla code

**Location:** `src/components/archive/Archive.jsx` and `src/components/archive/styles/MemoryCard.css`

**Investigation needed:**
- Review vanilla archive.html for constellation icon HTML structure
- Review vanilla archive.css for constellation icon styling and glow effects
- Understand the click behavior (does it navigate to Conspiracy Board?)

---

### Conspiracy Board - Fix Drag-Drop Issue for Canvas-Created Memories **[COMPLETE]**
**Issue:** Certain cards cannot be dropped from the sidebar onto the Conspiracy Board. This appears to affect cards that were originally created by right-clicking directly on the canvas.

**Current behavior:**
- Right-click on canvas → "Add Memory" creates a memory with `isOnCanvas: true`
- This memory gets saved to Firestore
- Later, when trying to drag this memory from the sidebar back onto the board, the drop may fail

**Suspected cause:**
- Memories created via `handleAddMemoryAtPosition` (right-click) are added with `isOnCanvas: true`
- When dragging from sidebar, `handleDragEnd` checks `!memoryData?.isOnCanvas` (line 377)
- This condition might reject memories that still have `isOnCanvas: true` from previous canvas placement

**Locations to investigate:**
- `src/components/conspiracy-board/ConspiracyBoard.jsx:377` - `handleDragEnd` sidebar drop logic
- `src/components/conspiracy-board/ConspiracyBoard.jsx:883` - `handleAddMemoryAtPosition` memory creation

**Potential fixes:**
- Clear `isOnCanvas` flag when memory is returned to sidebar
- Update drag-drop logic to handle re-drops of previously canvas-placed memories
- Ensure memory data is properly normalized when dragging from sidebar

**Testing:**
1. Right-click canvas → Add Memory → Fill in details → Save
2. Remove memory from canvas (Return to Sidebar)
3. Try dragging that memory back onto canvas from sidebar
4. Verify the drop succeeds

---

### Conspiracy Board - Add Close Button for Search Bar in Sidebar **[COMPLETE]**
**Issue:** Once the search bar is toggled on in the Conspiracy Board sidebar, there's no way to close/hide it

**Current behavior:**
- Search toggle button in header turns search on
- No way to turn it off or hide the search bar

**Desired behavior:**
- Add close/dismiss button to search bar
- Or make toggle button work bidirectionally (toggle on/off)
- Search bar should be dismissible

**Location:** `src/components/conspiracy-board/ConspiracyBoard.jsx:88` - `showSearch` state and sidebar search component

---

### Archive - Make Search Bar Smaller
**Goal:** Reduce the size of the search bar in archive view to make it less prominent

**Location:**
- `src/components/shared/SearchInput.jsx`
- `src/components/shared/SearchInput.css`
- `src/components/archive/Archive.jsx:451` - SearchInput usage

**Potential changes:**
- Reduce padding
- Smaller font size
- Smaller height
- More compact styling overall

---

### UI Consistency - Standardize Button Styling
**Goal:** Make all buttons look more similar across the application for better visual consistency

**Areas to standardize:**
- Header buttons
- Modal buttons
- Sidebar buttons
- Action buttons
- Dropdown buttons

**Locations:**
- `src/App.css` - Global button styles
- `src/components/shared/Dropdown.css` - Dropdown button styles
- Various component-specific CSS files

**Elements to standardize:**
- Border radius
- Padding
- Font size/weight
- Colors (background, text, hover states)
- Transition effects
- Border styling

---

### Conspiracy Board - Increase Font Size in File Menu Dropdown
**Goal:** Make the text in the file menu dropdown slightly bigger for better readability

**Location:**
- `src/components/shared/Dropdown.jsx`
- `src/components/shared/Dropdown.css`
- `src/components/conspiracy-board/ConspiracyBoard.jsx:1621` - Pages/File dropdown usage

---

### Conspiracy Board - Fix False Error When Saving Board **[COMPLETE]**
**Issue:** When saving a board, sometimes an error popup appears even though the board was successfully saved

**Resolution:**
- Fixed `setShowBoardDropdown` undefined reference error
- Memoized `saveBoard`, `loadBoard`, and `deleteBoard` functions with `useCallback`
- Added `updateTimestamp` parameter to prevent auto-save from reordering boards
- Added stable client-side secondary sort by board name
- Prevents flickering when timestamps are equal or during serverTimestamp resolution

**Commit:** d9ac364 (2025-11-15)

---

### Conspiracy Board - Add Board-Level Notes/Description Field
**Goal:** Allow users to add and edit notes/descriptions for saved boards

**UI Behavior:**

**Save Board Modal:**
- Add optional notes field when creating a new board
- Multi-line textarea (2 rows) for entering notes

**Load Board Modal:**
- Display notes below each board name in italic text (non-bold)
- Toggle button to make notes editable
- When editable: Shows 2-line textarea
- When not editable: Displays in italic text
- Auto-exits edit mode when user performs another action (load, delete, etc.)
- Toggle can re-enable editing

**Data Structure:**
- Add `notes` field to board documents in Firebase
- Store as string in board data structure
- Include in `saveBoard` and `loadBoard` operations

**Locations:**
- `src/hooks/useSavedBoards.js` - Add `notes` field to save/load operations
- `src/components/conspiracy-board/ConspiracyBoard.jsx` - Save Board modal (add notes input)
- `src/components/conspiracy-board/ConspiracyBoard.jsx:2385-2418` - Load Board modal (add notes display/edit)

**Implementation Notes:**
- Notes are optional (can be empty)
- Use textarea with `rows={2}` for input
- CSS: italic text for display mode, normal textarea for edit mode
- Consider adding character limit (e.g., 200-300 characters)

---

### UI Consistency - Create Custom Popup/Dialog Component
**Goal:** Replace browser-native `alert()` and `confirm()` dialogs with custom themed components

**Current issues:**
- Using browser-native `alert()` for errors
- Using browser-native `confirm()` for confirmations
- These don't match the app's theme/design
- Not customizable

**Desired behavior:**
- Create shared Dialog/Modal component for alerts, confirms, and prompts
- Match app theme (colors, fonts, styling)
- Support different types: error, success, warning, confirm
- Smooth animations
- Consistent across all views

**Files using native dialogs:**
- `src/components/conspiracy-board/ConspiracyBoard.jsx` - Multiple `alert()` calls
- `src/components/archive/Archive.jsx` - Likely has `confirm()` for deletes
- Other components

**Implementation:**
- Create `src/components/shared/Dialog.jsx`
- Create `src/components/shared/Dialog.css`
- Replace all `alert()` calls with custom component
- Replace all `confirm()` calls with custom component

---

### Settings - Advanced Mode for String Colors and Pin Styles
**Goal:** Create a settings option that enables advanced mode, allowing users to customize:
- String/connection colors
- Pin head styles (stars, red flags, etc.)

**Features needed:**
- Settings panel/modal accessible from header
- Toggle for "Advanced Mode"
- Color picker for connection strings
- Pin head style selector (dropdown or icon selector)
  - Current: Default pin head
  - Options: Star, Red flag, other icon styles
- Save preferences to localStorage or Firebase user settings
- Apply customizations in real-time

**Locations:**
- Create `src/components/shared/Settings.jsx` (settings modal)
- Create `src/components/shared/Settings.css`
- Update `src/components/conspiracy-board/ConspiracyBoard.css` for pin styles
- Update `src/components/conspiracy-board/Connections.jsx` for string colors
- Add settings button to header

**Implementation notes:**
- Store settings in user preferences (Firebase or localStorage)
- Apply CSS custom properties for colors
- Use conditional rendering for different pin head SVGs

---

### Conspiracy Board & Sidebar - Right-Click to Edit Memories
**Goal:** Add ability to edit memories by right-clicking on them in both Conspiracy Board and Sidebar

**Current state:**
- ✅ Conspiracy Board: Right-click context menu exists with "Edit Memory" option (line 1421)
- ❌ Sidebar: No right-click context menu for memories

**Desired behavior:**
- Right-click on memory in Conspiracy Board → Shows "Edit Memory" option → Opens MemoryModal
- Right-click on memory in Sidebar → Shows context menu → "Edit Memory" option → Opens MemoryModal

**Locations to update:**
- `src/components/conspiracy-board/ConspiracyBoard.jsx:1421` - Already has Edit Memory in context menu ✅
- `src/components/conspiracy-board/Sidebar.jsx` - Add onContextMenu handler to memory items
- Need to pass edit handler from ConspiracyBoard down to Sidebar component

**Note:** Conspiracy Board already supports this - just need to add to Sidebar

---

### Conspiracy Board - Fix Z-Index for Pins to Avoid Triggering Venn Modal
**Issue:** Pin z-index is too low, causing accidental clicks on connections underneath to trigger the Venn Modal

**Current state:**
- Pins z-index: 100 (line 376 in ConspiracyBoard.css)
- Connections mentioned as 2100 in comment (line 334)
- Clicking near pins sometimes triggers connection click handler

**Desired behavior:**
- Pins should have higher z-index than connections
- Clicking on pin should only trigger pin click, not connection click
- Connections should not be clickable when pins are on top

**Locations:**
- `src/components/conspiracy-board/ConspiracyBoard.css:376` - `.standalone-pin` z-index
- `src/components/conspiracy-board/Connections.jsx:126` - SVG container style
- May need to adjust pointer-events on connections SVG

**Potential fix:**
- Increase pin z-index to 2200 (above connections)
- Or adjust connections to ignore pointer events when pins are present
- Test that pins are clickable and connections don't interfere

---

### Conspiracy Board - Add Way to Remove String Connections
**Goal:** Create an easy way to remove/delete string connections between memories and pins

**Current state:**
- Right-click on connection shows context menu with "Remove Connection" option ✅
- This functionality already exists (line 1435 in ConspiracyBoard.jsx)

**Possible improvements:**
- Make it more discoverable (users may not know about right-click)
- Add visual affordance (delete button on hover?)
- Add keyboard shortcut (select connection + Delete key?)
- Add "Remove" button in Venn Modal when editing connection

**Locations:**
- `src/components/conspiracy-board/ConspiracyBoard.jsx:1435` - Context menu with Remove Connection
- `src/components/conspiracy-board/ConspiracyBoard.jsx:599` - `handleConnectionDelete` function
- `src/components/conspiracy-board/VennDiagramModal.jsx` - Could add delete button here

**Note:** Functionality exists - just needs better discoverability

---

### Conspiracy Board - Fix Random Venn Modal Triggers
**Issue:** Venn Modal (commonality editor) triggers at random/unexpected times when not intended

**Current behavior:**
- Clicking on connections triggers Venn Modal (intended)
- Modal sometimes opens when clicking near connections
- Modal opens when clicking pins near connections
- Triggers feel unpredictable/unintentional

**Suspected causes:**
- Z-index issue causing clicks to pass through pins to connections
- Connection line click hitbox too large
- Hover/click detection too sensitive
- Pointer events not properly handled

**Locations to investigate:**
- `src/components/conspiracy-board/ConspiracyBoard.jsx:582` - `handleConnectionClick` function
- `src/components/conspiracy-board/Connections.jsx` - Connection line click handlers
- `src/components/conspiracy-board/ConspiracyBoard.css:314` - `.connection-line` styles
  - `pointer-events: stroke` may be too sensitive
  - `stroke-width: 2` may create large click area
- Pin z-index issue (see separate TODO above)

**Potential fixes:**
- Increase pin z-index above connections
- Reduce connection line click hitbox
- Add modifier key requirement (hold Shift to click connection)
- Require deliberate click (short click = ignore, hold/double-click = open modal)
- Add "Edit Commonality" button to context menu instead of auto-opening modal
- Make connection lines less sensitive to clicks (increase stroke-width only on hover)

**Related TODO:** Fix Z-Index for Pins (may solve part of this issue)

---

### Conspiracy Board - Toggle String/Connection Z-Index (Over/Under Cards)
**Goal:** Add ability to toggle whether connection strings appear above or below memory cards on the conspiracy board

**Current behavior:**
- Connections have a fixed z-index
- Always render in the same layer relative to cards
- Can't change the visual stacking order

**Desired behavior:**
- Setting/toggle to control string z-index
- Option 1: Strings above cards (easier to see connections)
- Option 2: Strings below cards (less visual clutter)
- Should persist user preference

**Implementation:**
- Add toggle to settings or header
- CSS approach: Apply class to connections container
  ```css
  .connections-above { z-index: 2100; }
  .connections-below { z-index: 50; }
  ```
- Or use inline style based on user preference
- Save preference to localStorage or Firebase settings

**Locations:**
- `src/components/conspiracy-board/Connections.jsx:126` - SVG container style (currently no z-index)
- `src/components/conspiracy-board/ConspiracyBoard.css:334` - Drag overlay mentions connection z-index (2100)
- Could add to Settings component (see Settings TODO)

**Related:** Settings - Advanced Mode (could be part of advanced settings)

---

### Archive - Add Default Libraries: Core Memories & Synchronicities
**Goal:** Create two default libraries for new users: "Core Memories" and "Synchronicities"

**Background:**
- These were default libraries in the original vanilla version
- Should be created automatically for new users or on first app use
- Helps users understand how libraries work
- Provides starting structure

**Default Libraries:**

1. **Core Memories**
   - Name: "Core Memories"
   - Description: "Your most important and defining memories"
   - Empty initially (manual library)
   - No search logic
   - isLocked: false

2. **Synchronicities**
   - Name: "Synchronicities"
   - Description: "Meaningful coincidences and connections"
   - Empty initially (manual library)
   - No search logic
   - isLocked: false

**Implementation:**
- Check if user has any libraries on first load
- If `libraries.length === 0` (new user), create defaults
- Add logic to `useLibraries.js` after initial load
- Only create once, don't recreate if user deletes them

**Locations:**
- `src/hooks/useLibraries.js:44` - `loadFirestoreLibraries` function
- `src/hooks/useLibraries.js:30` - `loadLocalLibraries` function
- Add helper function: `createDefaultLibraries()`

**Code example:**
```javascript
const createDefaultLibraries = async () => {
  const coreMemories = await createLibrary({
    name: 'Core Memories',
    description: 'Your most important and defining memories',
    manualMemoryIds: [],
    searchLogic: null,
    isLocked: false
  });

  const synchronicities = await createLibrary({
    name: 'Synchronicities',
    description: 'Meaningful coincidences and connections',
    manualMemoryIds: [],
    searchLogic: null,
    isLocked: false
  });
};

// In loadFirestoreLibraries or useEffect:
if (libs.length === 0 && !hasCreatedDefaults) {
  await createDefaultLibraries();
  // Set flag in localStorage to prevent recreating
  localStorage.setItem('hasCreatedDefaultLibraries', 'true');
}
```

---

### Conspiracy Board - Add Mini-Map for Navigation
**Goal:** Add a mini-map showing an overview of the entire conspiracy board with an indicator of current viewport position

**Features needed:**
- Small map in corner (bottom-right or top-right)
- Shows all memories as small dots/boxes
- Shows connections as thin lines
- Viewport indicator (rectangle showing current visible area)
- Click to jump to that location
- Drag viewport indicator to pan
- Toggle to show/hide mini-map

**Benefits:**
- Easy navigation when panned far from origin
- Overview of entire board layout
- Quick way to jump to different areas

**Implementation approach:**
- Render scaled-down version of entire canvas (10000x8000 → maybe 200x160px)
- Use same connection/memory data
- Add viewport overlay rectangle based on panOffset
- Calculate click position to update pan offset

**Complexity:** Medium - requires rendering miniature version of board

**Locations:**
- Create `src/components/conspiracy-board/MiniMap.jsx`
- Create `src/components/conspiracy-board/MiniMap.css`
- Add to `ConspiracyBoard.jsx` (bottom-right corner)
- Pass: droppedMemories, connections, panOffset, onPanChange

---

### Conspiracy Board - Add Limited Zoom (50-75%)
**Goal:** Allow users to zoom out slightly to see more of the board at once

**Why limited zoom:**
- Past issues with full zoom feature (scaling, performance, positioning)
- Limiting to 50-75% zoom reduces complexity
- Still provides value without all the edge cases

**Implementation:**
- CSS transform: scale() on canvas container
- Only 2-3 zoom levels: 100% (default), 75%, 50%
- Buttons in header: [−] [Reset] [+]
- Or keyboard shortcuts: Cmd/Ctrl + Plus/Minus
- Adjust panOffset calculations when zoomed
- **Don't zoom:** header, sidebar, modals

**Technical approach:**
```css
.canvas-container {
  transform: scale(0.75);
  transform-origin: center center;
}
```

**Considerations:**
- Need to adjust mouse position calculations (screenToCanvas)
- Need to adjust pan bounds
- Memory positions stay same, just visual scaling
- May affect drag-and-drop positioning

**Complexity:** Medium - simpler than full zoom, but still needs coordinate adjustments

**My take:** This is much more feasible than full zoom! Limiting to just a couple levels avoids most of the complexity.

---

### Conspiracy Board - Add Customizable Grid with Labeled Axes
**Goal:** Add an optional grid overlay with customizable axis labels, allowing users to organize memories along meaningful dimensions

**Features:**
- Toggle grid on/off
- Adjustable grid spacing (or fixed)
- Customizable axis labels:
  - X-axis: e.g., "Past ←→ Future", "Personal ←→ Professional"
  - Y-axis: e.g., "Abstract ↑↓ Concrete", "Positive ↑↓ Negative"
- Visual grid lines (subtle, not overpowering)
- Axis labels displayed on edges
- Snap-to-grid option (optional)

**UI for configuration:**
- Settings panel or modal
- Text inputs for axis labels
- Preview of grid
- Toggle snap-to-grid

**Visual design:**
- Light gray dotted/dashed lines
- Semi-transparent
- Axis labels in corners/edges
- Should fade into background (not compete with content)

**Implementation:**
- SVG grid overlay (similar to connections layer)
- Render grid lines based on spacing
- Position axis labels at edges
- Store grid config in boardState or user settings
- If snap-to-grid: round positions to nearest grid point on drop

**Complexity:** Medium-High - Grid rendering is easy, axis labels need positioning, snap-to-grid adds logic

**Example axes users might want:**
- Time-based: "Past ←→ Future"
- Emotional: "Positive ↑↓ Negative"
- Scope: "Personal ←→ Universal"
- Certainty: "Certain ←→ Uncertain"
- Impact: "Low Impact ↑↓ High Impact"

**Locations:**
- Create `src/components/conspiracy-board/GridOverlay.jsx`
- Create `src/components/conspiracy-board/GridSettings.jsx` (config modal)
- Add grid config to boardState
- Render in ConspiracyBoard.jsx between canvas and connections

---

### Conspiracy Board - Improve Pin Hover UX
**Goal:** Make it clearer when you're hovering over the pin vs. the card body

**Current issue:**
- Card shows shadow on hover (indicates draggable)
- Pin shows `cursor: pointer` and tooltip "Click to connect"
- But card shadow still appears when hovering over pin, making it unclear you're interacting with the pin

**Desired behavior:**
1. **Pin hover effect:** Pin head gets slightly bigger (scale up ~1.2x or similar)
2. **Card hover disabled over pin:** When hovering over pin, card should NOT show shadow (goes back to normal state)

**Benefits:**
- Clearer visual separation between "drag card" and "click pin" actions
- Pin becomes more obvious when you hover it
- Reduces confusion about what will happen when you click

**Implementation:**
- Add `.memory-pin:hover .memory-pin-circle` scale effect in CSS
- Add `:has(.memory-pin:hover)` selector to remove card shadow when pin is hovered (or use pointer-events/z-index approach)

**Locations:**
- `src/components/conspiracy-board/ConspiracyBoard.css` - Lines 190-192 (pin hover)
- `src/components/conspiracy-board/ConspiracyBoard.css` - Line 36-38 (card hover)
- `src/components/conspiracy-board/Canvas.jsx` - Line 31 (cursor behavior)

---

### Refactor - Extract ConspiracyBoard Header into Component
**Goal:** Create a separate `ConspiracyBoardHeader.jsx` component to clean up the main file and make disabled state management simpler

**Current issue:**
- All header dropdowns (Pages, Tools, Board, View, Account, Constellation) are defined inline in ConspiracyBoard.jsx
- Makes the file very long (2000+ lines)
- Had to add `disabled={!!selectedPin}` 6 times (repetitive code)
- Any change to disable logic requires updating multiple places

**Desired approach:**
- Extract into `src/components/conspiracy-board/ConspiracyBoardHeader.jsx`
- Pass `selectedPin` as a prop
- Handle disabled state in ONE place inside the component
- Makes ConspiracyBoard.jsx cleaner and more maintainable

**Benefits:**
- Cleaner code (single responsibility)
- Easier to maintain
- Can reuse patterns for Archive header
- Disabled logic in one place

**Implementation:**
```jsx
// New component
<ConspiracyBoardHeader
  selectedPin={selectedPin}
  isConstellationMode={isConstellationMode}
  onNewBoard={handleNewBoard}
  onSaveBoard={handleSaveBoard}
  // ... all handlers as props
/>
```

---

### Constellation Sidebar - Bigger Minimap Visualizations
**Goal:** Increase the size of constellation visualizations in the minimap

**Investigation needed:**
- What's constraining their size currently?
- Is there a bounding box limiting them?
- Can we adjust container dimensions or apply scaling?

---

### Code Quality - Replace All Magic Numbers & Hardcoded Values
**What are magic numbers?** Hardcoded values (in JS or CSS) without explanation of what they represent

**Completed:**
- ✅ Text input focus styling - Changed from maroon outline to subtle gray (App.css:540, 1490)

**JavaScript Examples:**
```javascript
// Bad (magic number - what does 0.3 mean?)
if (opacity < 0.3) { ... }

// Good (named constant with clear meaning)
const MIN_VISIBLE_OPACITY = 0.3;
if (opacity < MIN_VISIBLE_OPACITY) { ... }
```

**CSS Examples:**
```css
/* Bad (hardcoded values) */
padding: 8px;
border-radius: 4px;
transition: 0.2s ease;
color: #999;

/* Good (theme variables) */
padding: var(--spacing-sm);
border-radius: var(--radius-small);
transition: var(--transition-normal);
color: var(--color-text-muted);
```

**Task:** Systematically replace ALL hardcoded values with named constants

**JavaScript locations to check:**
- `src/utils/opacityCalculations.js` - opacity thresholds
- Layout/positioning code - dimensions and spacing
- Animation code - timing values, durations
- Any hardcoded thresholds, limits, or configuration values

**CSS locations to check:**
- All `.css` files - look for hardcoded colors, spacing, transitions, border-radius
- Replace with variables from `src/styles/theme.css`
- Add new variables to theme.css if needed

**Areas to review:**
- Colors: Replace `#999`, `#666`, `#ddd` with `var(--color-text-muted)`, etc.
- Spacing: Replace `8px`, `16px`, `20px` with `var(--spacing-sm/md/lg)`
- Transitions: Replace `0.2s`, `0.3s` with `var(--transition-normal/fast/slow)`
- Border radius: Replace `4px`, `6px`, `8px` with `var(--radius-small/medium/large)`
- Shadows: Use `var(--shadow-small/medium/large)`

**Benefits:**
- Easier to maintain consistency
- Single source of truth for design values
- Easy to update styles globally
- Self-documenting code

---

### Conspiracy Board - Enhance Recently Added Dropdown
**Tasks:**
- Change or add icons to dropdown menu items
- Implement keyboard shortcuts for menu actions
- Display keyboard shortcuts next to menu items (standard pattern: menu item left, shortcut right aligned)

**Note:** Longer/more involved task

---

### Testing - Review Coverage for Recent Bug Fixes
**Context:** Fixed at least 3 major bugs in the past two days (around Nov 9-11)

**Goal:**
- Document what bugs were fixed
- Identify edge cases that might not be tested
- Look for patterns in what broke
- Ensure similar issues won't reoccur
- Consider adding tests for critical paths

**Questions to answer:**
- What caused each bug?
- Are there similar patterns elsewhere in the code?
- What inputs/scenarios weren't handled?

---

### Investigation - ID/String Mismatch Related Issues
**Context:** Recently resolved an ID type inconsistency issue (numbers vs strings) that caused persistence bugs

**Task:**
- Locate file documenting related issues (user mentioned they have these documented)
- Review documented issues
- Search codebase for similar ID type mismatches
- Ensure consistent ID handling throughout (decide: always strings? always numbers?)
- Add safeguards to prevent future type mismatches

**Files likely involved:**
- `src/utils/idUtils.js`
- `src/utils/generateId.js`
- Any files dealing with Firebase persistence
- Components that create or reference memory/constellation IDs

**Action needed:** User to identify which file contains the documented related issues

---

## ✅ COMPLETED THIS SESSION (2025-11-03)

### Modal Migration
- ✅ Conspiracy Board migrated to shared MemoryModal
- ✅ Archive using shared MemoryModal
- ✅ Old AddMemoryModal files deleted

### CSS Organization
- ✅ Archive inline styles extracted to separate files:
  - `src/components/archive/styles/Archive.css`
  - `src/components/archive/styles/MemoryCard.css`
- ✅ Vanilla CSS ported with ~95% accuracy
- ✅ Fixed CSS conflicts (scoped `.memory-title` to `.add-memory-popup`)
- ✅ Fixed Masonry card width issue
- ✅ Renamed old conflicting Archive.css to `.old-backup`

### Issues Resolved
- ✅ Memory titles no longer have white backgrounds
- ✅ Cards display at proper widths in Masonry layout
- ✅ App.css and MemoryModal.css styles scoped to modals only

---

## 🔴 HIGH PRIORITY (Start Here Next Session)

**📖 READ FIRST:** `/Users/sageryza/Documents/timeline/memory-library-react/ARCHIVE-FEATURE-RESTORATION.md`

This document contains:
- Complete implementation guide for all missing features
- Files to reference (vanilla HTML/CSS/JS)
- Potential interfering files (App.css, index.css)
- Detailed step-by-step instructions
- Priority order and what to skip

### Next Three Features (In Order):

#### 1. **Simplify View Toggle** ⭐ START HERE
**Estimated Time:** 30-45 minutes
**Reference:** archive.css lines 896-947

**Goal:** Add toggle button to switch between normal cards and tiny 120px square cards showing only titles

**Key Points:**
- Disable Masonry in simplify view (use flex wrap instead)
- Cards become 120x120px squares
- Hide content, only show title
- CSS already exists in vanilla, just needs to be ported

---

#### 2. **Filter Bar Center Display**
**Estimated Time:** 30-45 minutes
**Reference:** archive.css lines 147-185

**Goal:** Show current hashtag or library name in large pill in center of filter bar

**Example:**
```
[Home] Memory Archive | [#philosophy] | [New Memory] [Select]
```

---

#### 3. **Advanced Search Panel with Boolean Operators**
**Estimated Time:** 2-3 hours (COMPLEX!)
**Reference:** archive.css lines 535-818

**Goal:** Full-featured search with AND/OR/NOT operators, field-specific search, date ranges

**⚠️ This is the most complex feature - break into sub-tasks**

---

## 🟡 MEDIUM PRIORITY

### 4. Content Expand/Collapse
**Reference:** archive.css lines 1012-1034
**Note:** User mentioned we might change how this works

### 5. Pagination (or Infinite Scroll)
**Reference:** archive.css lines 1214-1317
**Alternative:** Consider infinite scroll instead of pagination

---

## 🟢 LOW PRIORITY / FUTURE

- Memory counter in header
- Context menu (right-click)
- Delete confirmation modal (currently using confirm())
- Animations and transitions
- Voice recording button

---

## 🚫 DO NOT IMPLEMENT (User Confirmed)

- ❌ Table view mode (not needed)
- ❌ Export/Import modals (have Firebase now)
- ❌ Quick Add modal (may redesign)

---

## ⚠️ KNOWN POTENTIAL INTERFERING FILES

### Files That May Cause CSS Conflicts:

1. **`src/App.css`** (2,794 lines - HUGE)
   - Status: `.memory-title` scoped to `.add-memory-popup` ✅
   - May have other conflicts as we add features
   - Strategy: Scope additional conflicting styles as encountered

2. **`src/index.css`** (69 lines)
   - Has wrong fonts (system fonts instead of Crimson Text)
   - Has `body { display: flex; place-items: center }` layout
   - Has global button styles (8px border-radius, wrong padding)
   - May need to override or scope these

3. **`src/components/archive/Archive.css.old-backup`**
   - Old Archive CSS we renamed
   - Not imported, but exists as backup
   - Can delete if needed

---

## 📋 Session Startup Checklist

**Starting next session? Do these:**

1. [ ] Read `ARCHIVE-FEATURE-RESTORATION.md` (main guide)
2. [ ] Read `REFACTORING.md` for background context
3. [ ] Check this `TODO.md` for status
4. [ ] Run `npm run dev` (port 5178)
5. [ ] Test Archive view before making changes

---

## 📊 Current State Summary

### What's Working:
- ✅ Archive with Masonry layout
- ✅ Create/edit/delete memories
- ✅ Search by text
- ✅ Select mode with bulk delete
- ✅ Library sidebar with drag-drop
- ✅ Vanilla styling (beige cards, correct fonts, hover states)
- ✅ Shared MemoryModal across views

### What's Missing (High Priority):
1. ❌ Simplify view toggle
2. ❌ Filter bar center (hashtag/library display)
3. ❌ Advanced search panel
4. ❌ Content truncation with expand/collapse
5. ❌ Pagination

### Files Structure:
```
src/components/
├── archive/
│   ├── Archive.jsx (357 lines - clean!)
│   ├── LibrarySidebar.jsx
│   ├── LibrarySidebar.css
│   ├── Archive.css.old-backup (renamed, not imported)
│   └── styles/
│       ├── Archive.css (vanilla layout/filter bar)
│       └── MemoryCard.css (vanilla card styling)
├── conspiracy-board/
│   ├── ConspiracyBoard.jsx
│   └── ConspiracyBoard.css
└── shared/
    ├── MemoryModal.jsx (shared modal)
    └── MemoryModal.css (scoped to .add-memory-popup)
```

---

## 🎯 Success Criteria for Next Session

**Feature #1 (Simplify View) Complete When:**
- [ ] Toggle button added to filter bar
- [ ] Click toggles between normal and simplify view
- [ ] Simplify view shows 120x120px square cards
- [ ] Simplify view only shows titles (content hidden)
- [ ] Simplify view uses flex wrap (not Masonry)
- [ ] CSS matches vanilla archive.css lines 896-947
- [ ] No console errors
- [ ] Doesn't break existing features

---

## 🔧 Modularity Guidelines

**Keep files under 400 lines!**

If Archive.jsx grows too large, extract:
- `MemoryCard.jsx` component
- `FilterBar.jsx` component
- `AdvancedSearchPanel.jsx` component

**One CSS file per feature/component:**
```
styles/
├── Archive.css
├── MemoryCard.css
├── FilterBar.css
├── AdvancedSearchPanel.css
└── Pagination.css
```

---

## 📝 Notes for Next Session

### CSS Scoping Strategy
- All Archive styles should be scoped under `.app-container` or use `.archive-` prefix
- Modal styles MUST use `.add-memory-popup` prefix
- If App.css conflicts appear, scope them more specifically
- Test in browser DevTools to identify conflicting styles

### Testing Each Feature
- Compare side-by-side with vanilla archive.html
- Check all interactions (clicks, hovers, toggles)
- Test responsive behavior
- Verify no console errors
- Confirm Firebase saves still work

### Reference Files
- **Vanilla HTML:** `/Users/sageryza/Documents/timeline/archive.html`
- **Vanilla CSS:** `/Users/sageryza/Documents/timeline/archive.css`
- **Vanilla JS:** `/Users/sageryza/Documents/timeline/archive.js`

---

## 🚨 Important Reminders

1. **Don't start work without user approval** (per CLAUDE.md)
2. **Always create backups before major changes**
3. **Test after each feature** - don't batch changes
4. **Keep components modular** - split if over 400 lines
5. **Reference vanilla files** - don't guess at styling
6. **Scope CSS properly** - avoid global conflicts

---

## End of TODO
**Next Action:** Read `ARCHIVE-FEATURE-RESTORATION.md` and implement Simplify View
