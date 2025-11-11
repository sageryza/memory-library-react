# Archive Feature Restoration Guide

## Context: What We've Done So Far

We successfully migrated Archive to React with:
- ✅ Masonry layout working
- ✅ Shared `MemoryModal` component
- ✅ Library sidebar with drag-drop
- ✅ Vanilla CSS extracted to separate files:
  - `src/components/archive/styles/Archive.css`
  - `src/components/archive/styles/MemoryCard.css`
- ✅ Fixed CSS conflicts (scoped modal styles to `.add-memory-popup`)
- ✅ Memory cards display correctly with vanilla styling

## Files to Reference

### Original Vanilla Files (Source of Truth)
- **HTML:** `/Users/sageryza/Documents/timeline/archive.html`
- **CSS:** `/Users/sageryza/Documents/timeline/archive.css` (2,892 lines)
- **JavaScript:** `/Users/sageryza/Documents/timeline/archive.js`

### Current React Implementation
- **Component:** `src/components/archive/Archive.jsx` (357 lines)
- **Styles:**
  - `src/components/archive/styles/Archive.css`
  - `src/components/archive/styles/MemoryCard.css`
- **Sidebar:** `src/components/archive/LibrarySidebar.jsx`
- **Modal:** `src/components/shared/MemoryModal.jsx`

## Potential Interfering Files

### ⚠️ Files That May Cause CSS Conflicts:

1. **`src/App.css`** (2,794 lines - HUGE)
   - Contains global styles that may override Archive
   - We already scoped `.memory-title` to `.add-memory-popup`
   - May need to scope other conflicting styles as encountered

2. **`src/index.css`** (69 lines)
   - Default Vite CSS with wrong fonts, button styles, body layout
   - Overrides `:root` font to system fonts instead of Crimson Text
   - Sets `body { display: flex; place-items: center }` which could break layout

3. **`src/components/archive/Archive.css.old-backup`**
   - Old Archive CSS we renamed (380 lines)
   - Not imported, but exists as backup
   - Can delete if needed

4. **`src/components/shared/MemoryModal.css`**
   - We already scoped styles to `.add-memory-popup`
   - Should be fine now, but watch for conflicts

### 💡 Strategy for Handling Conflicts:
- When adding new features, if styles don't work, check if App.css or index.css is overriding
- Scope conflicting styles to `.add-memory-popup` (for modals) or increase specificity
- Consider creating `.archive-view` wrapper class to scope ALL Archive styles

---

## Feature Restoration TODO List

### 🎯 HIGH PRIORITY (Do These First, In Order)

#### 1. **Simplify View** (Vanilla: lines 896-947)
**Goal:** Toggle between normal cards and tiny 120px square cards showing only titles

**Vanilla CSS to Port:**
```css
/* Lines 896-947 in archive.css */
.memories-container.simplify-view .memory-content { display: none !important; }
.memories-container.simplify-view .memory-title { /* centered, full width */ }
.memories-container.simplify-view { /* flex wrap instead of columns */ }
.memories-container.simplify-view .memory-item { /* 120x120px squares */ }
```

**Implementation Steps:**
1. Add `simplifyView` state to Archive.jsx
2. Add toggle button in filter bar (near Select button)
3. Port simplify-view CSS to MemoryCard.css
4. Add `simplify-view` class to `.memories-container` when active
5. **Note:** Masonry should be DISABLED in simplify view (vanilla uses flex wrap)

**Files to Create/Modify:**
- Modify: `src/components/archive/Archive.jsx` (add state + button)
- Modify: `src/components/archive/styles/MemoryCard.css` (add simplify styles)

---

#### 2. **Filter Bar Center Display** (Vanilla: lines 147-185)
**Goal:** Show current hashtag or library name in large pill in center of filter bar

**Vanilla Structure:**
```html
<div class="filter-bar-center">
  <div class="current-hashtag-display">
    <div class="current-hashtag-large">#philosophy</div>
  </div>
  <!-- OR -->
  <div class="current-library-header">
    <span>📚 Library: Work Ideas</span>
  </div>
</div>
```

**Vanilla CSS to Port:**
```css
/* Lines 147-185 in archive.css */
.filter-bar-center { flex: 1; display: flex; justify-content: center; }
.current-hashtag-large { /* Large maroon pill */ }
.current-library-header { /* Library name display */ }
```

**Implementation Steps:**
1. Modify filter bar layout: `filter-bar-left | filter-bar-center | toolbar-buttons`
2. Track `currentHashtag` and `currentLibrary` state
3. Port CSS to Archive.css
4. Add click-to-clear functionality (X button on pill)
5. Update when hashtag is clicked or library is selected

**Files to Modify:**
- `src/components/archive/Archive.jsx` (layout + state)
- `src/components/archive/styles/Archive.css` (center display styles)

---

#### 3. **Advanced Search Panel** (Vanilla: lines 535-818)
**Goal:** Full-featured search panel with boolean operators (AND/OR/NOT), field-specific search, date ranges

**⚠️ THIS IS COMPLEX - BREAK INTO SUB-TASKS:**

##### 3a. Basic Panel Toggle
- Add "Advanced Search" button
- Create collapsible panel component
- Port panel container CSS

##### 3b. Visual Boolean Search Interface (Lines 571-660)
**This is the unique feature - visual representation of search logic**

Vanilla has:
- AND/OR/NOT operator buttons with visual styling
- Search groups that can be combined
- Real-time visual feedback of search logic
- Custom checkbox styling for maroon theme

**Vanilla Structure:**
```html
<div class="search-builder">
  <div class="search-group">
    <select class="boolean-operator">
      <option>AND</option>
      <option>OR</option>
      <option>NOT</option>
    </select>
    <input class="search-term" placeholder="Search term...">
  </div>
</div>
```

##### 3c. Field-Specific Search
- Search by: Title, Content, Hashtags, Date
- Dropdown selector for field
- Different input types per field

##### 3d. Date Range Filtering
- Start date / End date pickers
- "Last 7 days", "Last 30 days", "Custom" presets

##### 3e. Tag Cloud
- Show all available hashtags
- Click to filter by tag
- Multi-select capability

**Implementation Steps:**
1. Create `AdvancedSearchPanel.jsx` component
2. Create `AdvancedSearchPanel.css` with vanilla styles (lines 535-818)
3. Build boolean search logic (parse AND/OR/NOT)
4. Implement field-specific filtering
5. Add date range picker
6. Add tag cloud with multi-select
7. Connect to memory filtering logic

**Files to Create:**
- `src/components/archive/AdvancedSearchPanel.jsx`
- `src/components/archive/styles/AdvancedSearchPanel.css`

**Files to Modify:**
- `src/components/archive/Archive.jsx` (integrate panel)

**Reference Closely:**
- Lines 535-660 in `archive.css` for visual boolean interface
- Lines 661-818 for checkbox styling and logic
- `archive.js` for search filtering logic

---

### 📋 MEDIUM PRIORITY (Do After High Priority)

#### 4. **Content Expand/Collapse** (Vanilla: lines 1012-1034)
**Goal:** Truncate long memory content to 4 lines, show "...more" button

**Note:** User mentioned we might change how this works, so stay flexible

**Vanilla CSS:**
```css
.memory-content.truncated {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

**Implementation:**
1. Add `expanded` state per memory card
2. Apply `.truncated` class by default
3. Add "...more" / "...less" toggle button
4. Port CSS to MemoryCard.css

---

#### 5. **Pagination** (Vanilla: lines 1214-1317)
**Goal:** Show 20-50 memories per page with prev/next buttons

**Consider:** With Masonry and Firebase, might want infinite scroll instead of pagination

**If Implementing Pagination:**
1. Add `currentPage`, `itemsPerPage` state
2. Slice filteredMemories array
3. Port pagination CSS from vanilla (lines 1214-1317)
4. Add page controls to bottom

**Alternative:** Implement infinite scroll (more modern, works better with Masonry)

---

### 🚫 SKIP THESE (Not Needed)

- ❌ **Table View** (lines 1147-1213) - Not needed, grid/masonry is sufficient
- ❌ **Export/Import Modals** (lines 1659-1744) - Have Firebase now
- ❌ **Quick Add Modal** (lines 1996-2046) - May redesign this

---

### 🔮 FUTURE CONSIDERATIONS (Low Priority / May Change)

- **Voice Recording Button** (lines 1597-1658) - May add later
- **Context Menu** (lines 1877-1923) - Right-click menu for cards
- **Delete Confirmation Modal** (lines 1924-1995) - Currently using simple confirm()
- **Memory Counter in Header** (lines 94-104) - Shows "X memories" count
- **Animations** (lines 1867-1876) - Fade-in effects

---

## Implementation Guidelines

### Modularity Rules:
1. **Keep files under 400 lines** - Split into multiple files if needed
2. **One feature per component** - Don't cram everything into Archive.jsx
3. **Separate CSS files** - One CSS file per component/feature
4. **Use composition** - Build smaller components, compose them together

### Component Structure Example:
```
src/components/archive/
├── Archive.jsx                      (Main container, <400 lines)
├── MemoryCard.jsx                   (Extract from Archive.jsx if needed)
├── AdvancedSearchPanel.jsx          (New component)
├── FilterBar.jsx                    (Extract from Archive.jsx if needed)
├── LibrarySidebar.jsx               (Exists)
├── styles/
│   ├── Archive.css
│   ├── MemoryCard.css
│   ├── AdvancedSearchPanel.css
│   ├── FilterBar.css
│   └── LibrarySidebar.css
```

### CSS Scoping Strategy:
- All Archive-specific CSS should start with `.archive-` or be nested under `.app-container`
- Modal styles MUST be scoped to `.add-memory-popup` to avoid conflicts
- Use specific class names to avoid App.css conflicts
- If App.css or index.css interferes, scope those styles more specifically

---

## Testing Checklist (Per Feature)

For each feature you add:

- [ ] Visual match: Compare side-by-side with vanilla archive.html
- [ ] Functionality: All interactions work (clicks, hovers, toggles)
- [ ] Responsive: Works at different screen sizes
- [ ] No CSS conflicts: Check buttons, text, spacing match vanilla
- [ ] No console errors: Check browser console
- [ ] Firebase integration: Saves/loads data correctly
- [ ] Doesn't break existing features: Test memory CRUD, sidebar, modal

---

## Quick Reference: Vanilla CSS Line Numbers

| Feature | Lines in archive.css |
|---------|---------------------|
| Filter Bar | 135-436 |
| Filter Bar Center | 147-185 |
| Advanced Search Panel | 535-570 |
| Visual Boolean Search | 571-660 |
| Custom Checkboxes | 661-818 |
| Memory Cards | 834-895 |
| Simplify View | 896-947 |
| Content Expand/Collapse | 1012-1034 |
| Memory Selection Checkbox | 1072-1113 |
| Table View (SKIP) | 1147-1213 |
| Pagination | 1214-1317 |
| Sidebar | 1318-1450 |
| Modals | 1451-1591 |
| Export/Import (SKIP) | 1659-1744 |
| Quick Add Modal | 1996-2046 |

---

## Common Issues & Solutions

### Issue: Styles don't apply
**Solution:** Check if App.css or index.css is overriding. Increase specificity or scope the conflicting styles.

### Issue: Layout breaks
**Solution:** Check if index.css `body { display: flex }` is interfering. May need to override in Archive.css.

### Issue: Buttons look wrong
**Solution:** index.css has global button styles. Either override in Archive.css or scope index.css button styles to specific components.

### Issue: Wrong fonts
**Solution:** index.css sets `:root` to system fonts. Ensure Archive components explicitly use 'Crimson Text'.

### Issue: Masonry not working
**Solution:** Cards must be `width: 100%` for Masonry. Don't use fixed widths or calc() for card width.

---

## Session Workflow

For each feature:

1. **Read vanilla CSS** (note line numbers from table above)
2. **Read vanilla HTML** structure for that feature
3. **Read vanilla JS** logic if interactive
4. **Create/modify React component** with similar structure
5. **Port CSS** to appropriate file
6. **Test** against vanilla version
7. **Fix conflicts** if any arise
8. **Commit** with clear message

---

## Current State Summary

### ✅ What's Working:
- Basic masonry layout with memory cards
- Create/edit/delete memories via modal
- Search by text
- Select mode with bulk delete
- Library sidebar with drag-drop
- Vanilla card styling (beige background, correct fonts, hover states)
- Checkbox selection in select mode

### ❌ What's Missing (Priority Order):
1. Simplify view toggle
2. Filter bar center (current hashtag/library display)
3. Advanced search panel with boolean operators
4. Content truncation with expand/collapse
5. Pagination (or infinite scroll)

### 🎯 Start Here Next Session:
**Feature #1: Simplify View**
- Reference: archive.css lines 896-947
- Should take ~30-45 minutes
- Adds toggle button + tiny square card mode
