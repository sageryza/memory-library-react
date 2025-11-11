# Memory Library React - Refactoring Documentation

**Last Updated:** 2025-11-03
**Status:** In Progress - Modal Migration Phase

---

## Project Overview

Migrating a memory management app from vanilla HTML/CSS/JS to React with three main views:
1. **Archive** - Grid/masonry view of memories with library sidebar
2. **Conspiracy Board** - Canvas with draggable memory cards and connections
3. **Chronology** - Timeline view of memories

**Tech Stack:** React, Vite, Firebase, react-masonry-css

---

## Current State

### ✅ Completed

#### 1. Archive Masonry Layout (Nov 3, 2025)
- Implemented `react-masonry-css` for Pinterest-style card layout
- Cards adjust to content height (no fixed heights)
- Responsive breakpoints: 4/3/2/1 columns
- **Files Modified:** `src/components/archive/Archive.jsx`

#### 2. Library Sidebar (Nov 3, 2025)
- Created `useLibraries` hook for library management (Firebase + localStorage)
- Created `LibrarySidebar` component with drag-drop support
- Ported vanilla sidebar CSS
- **Files Created:**
  - `src/hooks/useLibraries.js`
  - `src/components/archive/LibrarySidebar.jsx`
  - `src/components/archive/LibrarySidebar.css`

#### 3. Shared Memory Modal (Nov 3, 2025)
- Ported vanilla linear.html modal to React
- Features: multiple units, toggleable Context/Sort, trash button
- **Files Created:**
  - `src/components/shared/MemoryModal.jsx`
  - `src/components/shared/MemoryModal.css`
- **Integrated Into:** Archive view only (so far)

### 🚧 In Progress

#### Modal Migration
- **Archive:** ✅ Complete
- **Conspiracy Board:** ❌ Needs migration (uses old `AddMemoryModal.jsx`)
- **Chronology:** ❓ Unknown (needs investigation)

### ❌ Not Started

#### CSS Organization (Option B - Hybrid Approach)
**Goal:** Port core vanilla styles (~850 lines) while keeping React improvements

**Core Vanilla Styles to Port:**
1. Memory Cards (~200 lines) - Beige cards, hover states, selection
2. Filter/Search Bar (~150 lines) - Top bar, search input, buttons
3. Page Layout (~100 lines) - Container, header, content areas
4. Colors & Typography (~50 lines) - Crimson Text, maroon accents, beige backgrounds
5. Buttons (~100 lines) - Primary, secondary, icon buttons
6. Basic Responsive (~50 lines) - Mobile breakpoints
7. Library Sidebar (~200 lines) - Already created, needs refinement

**Target Structure:**
```
src/components/shared/styles/
├── buttons.css          # Shared button styles
├── colors.css           # Color variables
└── typography.css       # Font definitions

src/components/archive/styles/
├── Archive.css          # Main layout
├── MemoryCard.css       # Card styling
├── FilterBar.css        # Search/filter bar
└── Pagination.css       # Page navigation (future)
```

**Current Problem:** Archive.jsx has ~380 lines of inline `<style>` tags that need extraction

---

## File Locations

### Vanilla Reference Files
```
/Users/sageryza/Documents/timeline/
├── archive.html        # Original archive HTML
├── archive.css         # Original archive CSS (2,892 lines)
├── archive.js          # Original archive JS (large file)
├── linear.html         # Original linear view HTML
├── linear.css          # Original linear view CSS
└── linear.js           # Original linear view JS
```

### React App Structure
```
src/
├── components/
│   ├── shared/
│   │   ├── MemoryModal.jsx      ✅ Created
│   │   └── MemoryModal.css      ✅ Created
│   ├── archive/
│   │   ├── Archive.jsx          ✅ Using shared modal
│   │   ├── LibrarySidebar.jsx   ✅ Created
│   │   └── LibrarySidebar.css   ✅ Created
│   ├── conspiracy-board/
│   │   ├── ConspiracyBoard.jsx  ⚠️ Still uses AddMemoryModal
│   │   ├── AddMemoryModal.jsx   ⚠️ Delete after migration
│   │   ├── VennDiagramModal.jsx
│   │   └── PinEditModal.jsx
│   └── chronology/
│       └── Chronology.jsx       ❓ Unknown modal status
├── hooks/
│   ├── useLibraries.js          ✅ Created
│   ├── useMemories.js
│   ├── useBoardState.js
│   └── [other hooks]
└── firebase.js
```

---

## Key Decisions Made

### 1. Modal Approach
**Decision:** Create ONE shared modal matching vanilla linear.html
**Rationale:** Consistency across views, matches original UX
**Trade-off:** More complex than simple modals, but feature-rich

### 2. CSS Strategy
**Decision:** Option B (Hybrid) - Port core styles, keep React improvements
**Rationale:** Balance between vanilla match and development time
**Trade-off:** Won't be 100% identical, but ~85% visual match with 30% effort

### 3. Masonry Layout
**Decision:** Keep react-masonry-css instead of vanilla flex grid
**Rationale:** Better than vanilla (no fixed heights, better packing)
**Trade-off:** Slightly different from vanilla, but superior UX

### 4. Library Management
**Decision:** Firebase + localStorage dual support
**Rationale:** Matches vanilla localStorage pattern, adds cloud sync
**Trade-off:** More complex than Firebase-only

---

## Development Commands

```bash
# Start dev server
npm run dev
# Currently running on: http://localhost:5178/

# Routes
http://localhost:5178/           # Conspiracy Board
http://localhost:5178/archive    # Archive (with masonry + sidebar)
http://localhost:5178/chronology # Chronology

# Kill all dev servers (if needed)
lsof -ti:5173,5174,5175,5176,5177,5178 | xargs kill
```

---

## Known Issues

1. **Archive scrolling** - Fixed by adding `overflow: auto !important` to body/root
2. **Old modal duplication** - Fixed by removing inline modal components
3. **Library sidebar positioning** - Working, uses fixed positioning on right
4. **Inline styles bloat** - Archive.jsx has 380 lines of inline CSS (needs extraction)

---

## Next Steps (Priority Order)

See `TODO.md` for detailed task list.

1. **Immediate:** Complete modal migration (Conspiracy Board, Chronology)
2. **Short-term:** Extract Archive inline styles to CSS files
3. **Medium-term:** Port core vanilla styles (850 lines)
4. **Long-term:** Add pagination, advanced search

---

## Testing Checklist

### Archive View
- [x] Masonry layout working
- [x] Cards adjust to content height
- [x] Responsive breakpoints work
- [x] Sidebar shows libraries
- [x] Sidebar collapse/expand works
- [ ] Drag memories to libraries works
- [x] Create memory modal opens
- [x] Edit memory modal opens
- [ ] Memory saves to Firebase
- [ ] Multiple memory units work

### Conspiracy Board
- [ ] Memory modal migration complete
- [ ] Modal opens/closes
- [ ] Memory creation works
- [ ] Memory editing works

### Chronology
- [ ] Check if modals exist
- [ ] Migrate if needed

---

## Important Notes for Next Session

1. **Don't recreate shared modal** - It's already done at `src/components/shared/MemoryModal.jsx`
2. **Check MODAL-MIGRATION.md** - Contains detailed briefing for modal work
3. **Archive is mostly done** - Focus on Conspiracy Board and Chronology
4. **User wants vanilla match** - Prioritize porting vanilla styles over custom improvements
5. **Multiple dev servers may be running** - Check ports 5173-5178

---

## Contact Points

- User's global instructions: `/Users/sageryza/.claude/CLAUDE.md`
- Project instructions: `/Users/sageryza/Documents/timeline/CLAUDE.md`
  - **Important:** "Don't start working unless I explicitly say to"

---

## Useful Commands for Investigation

```bash
# Find all modal references in a view
grep -rn "modal\|Modal" src/components/conspiracy-board/

# Check if a component exists
ls -la src/components/chronology/

# Count lines in inline styles
grep -n "<style>" src/components/archive/Archive.jsx

# Find vanilla CSS sections
grep -n "^/\* " ../archive.css

# Check library management code
grep -n "localStorage.*memoryLibraries" ../archive.js
```
