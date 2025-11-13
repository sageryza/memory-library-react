# TODO - Memory Library React Refactoring

**Last Updated:** 2025-11-11
**Priority:** High items first

---

## 📝 NEW TODOS FROM NOTEBOOK (2025-11-11)

### Archive - Boolean Hashtag Filtering (Simple Version)
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
