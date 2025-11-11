# 🎨 Style Inventory - Where to Find Everything

## 🔘 BUTTONS

### 1. Sidebar Icon Buttons (YOUR FAVORITE!)
**What they look like:**
- Light gray outline (`border: 1px solid #ddd`)
- No background (transparent)
- Maroon icons (`color: #800020`)
- Subtle hover (light gray fill `#f8f8f8`)

**Where to see them:**
- **Page:** Conspiracy Board (`/conspiracy`)
- **Location:** Right side sidebar, top row of buttons
- **Buttons:** Scatter (dots icon), Undo (arrow), Constellation (stars), Search (magnifying glass), Pin (pin icon), Add Memory (plus)
- **Code:** `src/App.css` lines 1668-1722
- **Component:** `src/components/conspiracy-board/Sidebar.jsx`

**To test:**
1. Go to Conspiracy Board page
2. Look at the beige sidebar on the right
3. See the row of icon buttons at the top

---

### 2. Top Header Toggle Buttons
**What they look like:**
- Solid gray background (`#666`)
- White icons
- Turn maroon when active (`#800020`)

**Where to see them:**
- **Page:** Conspiracy Board (`/conspiracy`)
- **Location:** Top beige header bar, right side
- **Buttons:** View Toggle (grid icon), Opacity Toggle (eye icon), Insights Toggle (info icon)
- **Code:** `src/App.css` lines 136-186
- **Component:** `src/components/conspiracy-board/ConspiracyBoard.jsx` lines 815-872

**To test:**
1. Go to Conspiracy Board page
2. Look at top beige header
3. See buttons on the right side
4. Click them to see active state (turn maroon)

---

### 3. Board Dropdown Button
**What they look like:**
- White background
- Light border (`#ddd`)
- Shows current board name
- Dropdown arrow

**Where to see them:**
- **Page:** Conspiracy Board (`/conspiracy`)
- **Location:** Top header, right side, next to toggle buttons
- **Button:** Shows "Current Board" or saved board name
- **Code:** `src/App.css` lines 189-232
- **Component:** `src/components/conspiracy-board/ConspiracyBoard.jsx` lines 874-938

**To test:**
1. Go to Conspiracy Board page
2. Top header, right area
3. Click to see dropdown menu with "New Board", "Save", "Load"

---

### 4. Archive Page Buttons
**What they look like:**
- **Style A:** Solid maroon background, white text
- **Style B:** White background, maroon outline

**Where to see them:**
- **Page:** Archive (`/archive`)
- **Location:** Top header area
- **Buttons:**
  - Home button (top left, solid maroon)
  - Filter Toggle (outlined maroon)
  - View Toggle (outlined maroon)
  - Export (outlined maroon)
- **Code:** `src/components/archive/Archive.css` lines 29-132

**To test:**
1. Go to Archive page
2. Look at the top header
3. See various button styles

---

### 5. Modal Buttons
**What they look like:**
- Save button: Maroon background
- Cancel button: Gray background or outlined

**Where to see them:**
- **Page:** Conspiracy Board
- **Location:** Open any modal
- **Modals to try:**
  - Add Memory (click + button in sidebar)
  - Save Board (click board dropdown → "Save As New Board")
  - Venn Diagram (click a connection line between memories)
- **Code:** `src/App.css` lines 853-1010

**To test:**
1. Go to Conspiracy Board
2. Click the + button in sidebar to open Add Memory modal
3. See Save/Cancel buttons at bottom

---

## 🎨 COLORS

### Primary Maroon
**Shade:** `#800020`
**Used for:**
- Main brand color
- Button backgrounds
- Text headings
- Active states

**Where to see it:**
- Conspiracy Board: "Conspiracy" title text
- Archive: "Archive" title text
- All active toggle buttons
- Memory card pins (small red circles on cards)
- Connection strings between memories

---

### Dark Maroon (Hover)
**Shade:** `#600018`
**Used for:**
- Button hover states
- Darker version of primary

**Where to see it:**
- Hover over any maroon button
- Hover over home button in Archive

---

### Crimson Red (Pins)
**Shade:** `#dc143c`
**Used for:**
- Memory pins (the small circles on cards)
- Standalone pins you can place
- Connection lines

**Where to see it:**
- Conspiracy Board: Drop a memory on canvas, see red pin in corner
- Conspiracy Board: Place a standalone pin (click pin button, then click canvas)

---

### Beige Background
**Shade:** `#faf8e9`
**Used for:**
- Main app background
- Canvas area
- Memory cards

**Where to see it:**
- Conspiracy Board: Entire background
- Conspiracy Board: Memory cards background
- Sidebar background

---

### Light Grays (Borders)
**Shades used:**
- `#ddd` (most common)
- `#e0e0e0`
- `#E0E0E0` (same as above, different case)

**Where to see it:**
- Sidebar icon button borders
- Memory card borders
- Input field borders
- Header bottom border

**Where to see it:**
- Conspiracy Board sidebar: Button outlines
- Add Memory modal: Input field borders

---

### Mid Grays (Text)
**Shades used:**
- `#666` (common)
- `#999` (lighter)
- `#333` (darker)

**Where to see it:**
- Memory card dates/timestamps
- Placeholder text in inputs
- Secondary text

---

## 📝 TYPOGRAPHY

### Main Font: Crimson Text
**Where to see it:**
- Almost all text in the app
- Headings, body text, buttons

**Locations:**
- Conspiracy Board: "Conspiracy" title
- Archive: "Archive" title
- All memory card text

---

### Monospace Font: Courier Prime
**Where to see it:**
- Dates and timestamps on memory cards

**Locations:**
- Conspiracy Board: Date at bottom of memory cards
- Archive: Timestamps on cards

---

### Font Weights Used
- **Normal/400:** Regular body text
- **500:** Medium (some buttons)
- **600:** Semi-bold (headings)

**Examples:**
- Conspiracy Board title: Semi-bold (600)
- Memory card titles: Normal/Semi-bold varies
- Button text: Medium (500)

---

## 📐 BORDER RADIUS

### 4px (Most Common - 51 uses)
**Where to see it:**
- Sidebar icon buttons
- Most buttons throughout app
- Small elements

**Example locations:**
- Conspiracy Board: All sidebar icon buttons

---

### 6px (Medium)
**Where to see it:**
- Memory cards
- Some inputs

**Example locations:**
- Conspiracy Board: Memory cards on canvas

---

### 8px (Larger elements)
**Where to see it:**
- Modals
- Larger cards
- Archive memory cards

**Example locations:**
- Archive page: Memory cards
- Modals: Dialog boxes

---

### 50% (Circles)
**Where to see it:**
- Memory pins (red circles)
- Tag badges

**Example locations:**
- Conspiracy Board: Red pin circles on memory cards

---

## 📦 MEMORY CARDS

### Sidebar Memory Cards
**Style:**
- White/cream background (`#faf8e9`)
- Light border (`#e8e6d5`)
- Smaller size
- Hover: subtle shadow

**Where to see them:**
- **Page:** Conspiracy Board
- **Location:** Right sidebar, scrollable list below buttons
- **Code:** `src/components/conspiracy-board/ConspiracyBoard.css` lines 9-31

**To test:**
1. Go to Conspiracy Board
2. Scroll in the sidebar to see memory cards
3. Hover to see shadow effect

---

### Canvas Memory Cards (Dropped on board)
**Style:**
- Same cream background
- Larger size (250px wide)
- Red pin in top-right corner
- More padding

**Where to see them:**
- **Page:** Conspiracy Board
- **Location:** Drag a card from sidebar onto the canvas (left side)
- **Code:** `src/components/conspiracy-board/ConspiracyBoard.css` lines 33-61

**To test:**
1. Go to Conspiracy Board
2. Drag a memory card from sidebar to the canvas area
3. See larger card with red pin
4. Drag it around

---

### Stacked View Cards (Condensed)
**Style:**
- Square (120x120px)
- Title only, centered
- No content visible

**Where to see them:**
- **Page:** Conspiracy Board
- **Location:** Canvas area, after toggling stacked view
- **Code:** `src/components/conspiracy-board/ConspiracyBoard.css` lines 107-150

**To test:**
1. Go to Conspiracy Board
2. Click the view toggle button (grid icon) in top header
3. See cards shrink to squares showing just titles

---

### Archive Memory Cards
**Style:**
- White background
- Darker border
- Shows tags as maroon pills
- Actions appear on hover

**Where to see them:**
- **Page:** Archive (`/archive`)
- **Location:** Main content area, grid or list
- **Code:** `src/components/archive/Archive.css` lines 242-343

**To test:**
1. Go to Archive page
2. See cards in grid layout
3. Hover to see edit/delete buttons appear

---

## 🔗 CONNECTIONS & LINES

### Connection Strings
**Style:**
- Crimson red lines (`#dc143c`)
- 2px thick
- Connect memory cards via their pins
- Thicker on hover

**Where to see them:**
- **Page:** Conspiracy Board
- **Location:** Between memory cards on canvas
- **Code:** `src/App.css` lines 833-851

**To test:**
1. Go to Conspiracy Board
2. Drop 2 memories on canvas
3. Click the red pin on one card
4. Click the red pin on another card
5. See red line connecting them

---

## 🎯 INPUTS & FORMS

### Search Inputs
**Style:**
- White/cream background
- Light gray border
- Border turns maroon on focus

**Where to see them:**
- **Conspiracy Board:** Click search icon in sidebar, input appears
- **Archive:** Search bar at top

**To test:**
1. Conspiracy Board: Click search icon (magnifying glass)
2. See input field appear
3. Click in it to see maroon border

---

## 🎭 MODALS

### Add Memory Modal
**Style:**
- White background
- Rounded corners (8px)
- Shadow overlay
- Input fields, save/cancel buttons

**Where to see it:**
- **Page:** Conspiracy Board
- **Trigger:** Click + button in sidebar
- **Code:** `src/App.css` lines 853-1010

**To test:**
1. Go to Conspiracy Board
2. Click + button in sidebar (top right)
3. See modal appear

---

### Venn Diagram Modal
**Style:**
- Larger modal
- Shows two memory cards
- Venn diagram visualization
- Text area for insight

**Where to see it:**
- **Page:** Conspiracy Board
- **Trigger:** Click on a red connection line between two memories
- **Code:** `src/App.css` lines 605-731

**To test:**
1. Go to Conspiracy Board
2. Create a connection between 2 memories (see Connections section above)
3. Click the red line
4. See Venn diagram modal

---

### Board Management Modals
**Style:**
- Simple centered modal
- Input for board name
- Save/cancel buttons

**Where to see it:**
- **Page:** Conspiracy Board
- **Trigger:** Board dropdown → "Save As New Board"
- **Code:** `src/components/conspiracy-board/ConspiracyBoard.jsx` lines 1041-1122

**To test:**
1. Go to Conspiracy Board
2. Click board dropdown button
3. Click "Save As New Board"
4. See modal with input

---

## 📋 QUICK REFERENCE

### Pages in Your App
1. **Home/Login** - `/`
2. **Conspiracy Board** - `/conspiracy`
3. **Archive** - `/archive`
4. **Chronology** - `/chronology` (if exists)

### Most Important Locations to Review
1. ✅ **Conspiracy Board sidebar buttons** (your favorite style!)
2. ✅ **Memory cards on canvas** (drag from sidebar)
3. ✅ **Top header toggle buttons** (view, opacity, insights)
4. ✅ **Archive page** (different button styles)
5. ✅ **Add Memory modal** (forms and inputs)
6. ✅ **Connection lines** (create connections between memories)

---

## 🎬 NEXT STEPS

Once you've explored these locations:

1. **Tell me what you like/dislike** about each style
2. **Point out inconsistencies** you notice
3. **Choose your preferred versions** when there are multiple styles for the same thing

Then I'll create the standardized design system based on YOUR preferences!
