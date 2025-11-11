# TODO - Memory Library React Refactoring

**Last Updated:** 2025-11-03
**Priority:** High items first

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
