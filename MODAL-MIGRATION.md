# MODAL MIGRATION BRIEFING

**For Claude Code Sessions**
**Task:** Migrate all memory modals to shared component

---

## Quick Context

We created ONE shared memory modal matching vanilla linear.html. Now we need to replace ALL existing modals across three views (Archive, Conspiracy Board, Chronology) with this shared component.

---

## Files Already Created (✅ DO NOT RECREATE)

```
src/components/shared/
├── MemoryModal.jsx      ← Shared modal component
└── MemoryModal.css      ← Modal styling
```

---

## Migration Status

| View | Status | File | Action Needed |
|------|--------|------|---------------|
| **Archive** | ✅ Complete | `src/components/archive/Archive.jsx` | None - already done |
| **Conspiracy Board** | ❌ Needs Work | `src/components/conspiracy-board/ConspiracyBoard.jsx` | Replace AddMemoryModal |
| **Chronology** | ❓ Unknown | `src/components/chronology/Chronology.jsx` | Investigate first |

---

## Shared MemoryModal API

### Props

```javascript
<MemoryModal
  isOpen={boolean}                        // Show/hide modal
  onClose={() => void}                    // Close handler
  onSave={(memories, isEditing) => void}  // Save handler
  editingMemory={object | null}           // Memory to edit (null = create)
/>
```

### onSave Callback

```javascript
function handleSaveMemory(memories, isEditing) {
  // memories: Array of memory objects
  // isEditing: boolean (true = update single, false = create multiple)

  if (isEditing) {
    // Always single memory when editing
    const memory = memories[0];
    await updateMemory(memory.id, memory);
  } else {
    // Can be multiple memories when creating
    for (const memory of memories) {
      await addMemory(memory);
    }
  }
}
```

### Memory Object Format

```javascript
{
  id: string,                    // Only when editing
  content: string,               // Main memory text (required)
  title: string,                 // Optional title
  hashtags: Array<string>,       // ['#work', '#life'] - WITH # prefix
  additionalContext: string,     // Optional context field
  timestamp: string,             // ISO date string
  dateTime: string              // Locale date string
}
```

---

## Features (From Vanilla Linear.html)

✅ **Multiple Memory Units** - "Add New" button to create multiple at once (only when creating)
✅ **Toggleable Context** - Click "Context" to show/hide context textarea
✅ **Toggleable Sort** - Click "Sort" to show/hide title + hashtags
✅ **Backup Status** - "✅ Backup created" indicator after save
✅ **Trash Button** - Clear all button with confirmation
✅ **Keyboard Shortcuts** - ESC to close, Ctrl+Enter to save
✅ **Hashtag Handling** - Stores with #, displays without # in input

---

## Step-by-Step Migration Guide

### Step 1: Investigate Current Modal

```bash
# Check what modal is being used
grep -n "Modal" src/components/[VIEW]/[Component].jsx

# Check modal imports
grep -n "import.*Modal" src/components/[VIEW]/[Component].jsx

# Find modal state
grep -n "useState.*modal\|useState.*Modal" src/components/[VIEW]/[Component].jsx
```

### Step 2: Add Shared Modal Import

```javascript
import MemoryModal from '../shared/MemoryModal';
```

### Step 3: Remove Old Modal Import

```javascript
// DELETE this line:
import AddMemoryModal from './AddMemoryModal';
// or whatever the old modal was called
```

### Step 4: Update Modal State (if needed)

The shared modal needs:
- `isOpen` state (boolean)
- `editingMemory` state (object or null)

```javascript
const [showModal, setShowModal] = useState(false);
const [editingMemory, setEditingMemory] = useState(null);
```

### Step 5: Create Save Handler

```javascript
const handleSaveMemory = async (memories, isEditing) => {
  try {
    if (isEditing) {
      // Edit mode: single memory
      const memory = memories[0];
      await updateMemory(memory.id, memory);
      setEditingMemory(null);
    } else {
      // Create mode: possibly multiple memories
      for (const memory of memories) {
        await addMemory(memory);
      }
      setShowModal(false);
    }
  } catch (error) {
    console.error('Error saving memory:', error);
    throw error; // Re-throw so modal knows it failed
  }
};
```

### Step 6: Replace Modal JSX

**Before:**
```javascript
{showModal && (
  <AddMemoryModal
    isOpen={showModal}
    onClose={() => setShowModal(false)}
    onSave={handleSave}
    editingMemory={editingMemory}
  />
)}
```

**After:**
```javascript
<MemoryModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onSave={handleSaveMemory}
  editingMemory={editingMemory}
/>
```

### Step 7: Update Open Modal Handlers

**To create new memory:**
```javascript
const handleCreateNew = () => {
  setEditingMemory(null);  // null = create mode
  setShowModal(true);
};
```

**To edit existing memory:**
```javascript
const handleEdit = (memory) => {
  setEditingMemory(memory);  // Pass memory object
  setShowModal(true);
};
```

### Step 8: Test Thoroughly

- [ ] Click "+" or "Create" button → Modal opens
- [ ] Fill in memory content
- [ ] Click "Context" button → Context section appears
- [ ] Click "Sort" button → Title/Hashtags appear
- [ ] Enter hashtags (with or without #)
- [ ] Click "Save" → Memory created
- [ ] Memory appears in view
- [ ] Click memory → Modal opens with data
- [ ] Verify "Add New" button is hidden when editing
- [ ] Update memory → Click "Save"
- [ ] Verify memory updated
- [ ] Press ESC → Modal closes
- [ ] Open modal → Press Ctrl+Enter → Saves

### Step 9: Clean Up

```bash
# Delete old modal file (ONLY after testing!)
rm src/components/[VIEW]/[OldModalName].jsx
```

---

## Common Migration Issues

### Issue 1: Old Save Handler Signature

**Old:**
```javascript
function handleSave(memoryData, isEditing) { }
function handleSave(id, memoryData) { }
```

**New:**
```javascript
function handleSave(memories, isEditing) {
  // memories is ALWAYS an array
}
```

### Issue 2: Hashtag Format Mismatch

**Problem:** Old modals might store hashtags without #

**Solution:** Shared modal always adds # prefix, so storage is consistent

### Issue 3: Single vs Multiple Memories

**Problem:** Old modals only created one memory at a time

**Solution:** Handle array in save handler:
```javascript
for (const memory of memories) {
  await addMemory(memory);
}
```

### Issue 4: Modal Won't Close After Save

**Problem:** Not clearing state after successful save

**Solution:**
```javascript
const handleSaveMemory = async (memories, isEditing) => {
  await saveLogic();
  // Clear state after success
  setEditingMemory(null);
  setShowModal(false);
};
```

---

## Conspiracy Board Specifics

### Expected Current State

**File:** `src/components/conspiracy-board/ConspiracyBoard.jsx`
**Current Modal:** `./AddMemoryModal.jsx` (separate file)
**Import:** `import AddMemoryModal from './AddMemoryModal'`

### Key Differences to Watch For

1. **Board-specific context** - Conspiracy board may store memory positions
2. **Connection data** - May need to preserve memory connections
3. **Canvas integration** - New memories need to appear on canvas

### Migration Checklist for Conspiracy Board

- [ ] Check if AddMemoryModal stores position data
- [ ] Verify connection data is preserved
- [ ] Test new memory appears on canvas
- [ ] Test edit doesn't move memory on canvas
- [ ] Verify drag-drop still works after edit

---

## Chronology Specifics

### Investigation Needed

```bash
# Check if Chronology has modals
grep -in "modal" src/components/chronology/Chronology.jsx
grep -in "create.*memory\|add.*memory" src/components/chronology/Chronology.jsx
```

### Possible Scenarios

**Scenario A:** Has its own modal
→ Follow standard migration steps

**Scenario B:** Shares Conspiracy Board modal
→ No changes needed if CB already migrated

**Scenario C:** No modal (uses board or archive)
→ Document and move on

**Scenario D:** No create/edit functionality
→ Determine if modal should be added

---

## Testing Checklist (All Views)

### Create New Memory
- [ ] Modal opens
- [ ] Can enter content
- [ ] Can toggle Context section
- [ ] Can toggle Sort section
- [ ] Can enter title
- [ ] Can enter hashtags (with or without #)
- [ ] "Add New" button visible (creates multiple units)
- [ ] Save button works
- [ ] Modal closes after save
- [ ] Memory appears in view
- [ ] Memory saved to Firebase

### Edit Existing Memory
- [ ] Click memory → Modal opens
- [ ] Existing data populated
- [ ] Context section expanded if has context
- [ ] Sort section expanded if has title/hashtags
- [ ] "Add New" button HIDDEN
- [ ] Can modify all fields
- [ ] Save button works
- [ ] Modal closes after save
- [ ] Memory updated in view
- [ ] Changes saved to Firebase

### Edge Cases
- [ ] Empty memory (should show alert)
- [ ] Only title, no content (should save)
- [ ] Hashtags without # (should add # automatically)
- [ ] Long content (should handle scroll)
- [ ] Multiple memory units (create only)
- [ ] ESC key closes modal
- [ ] Ctrl+Enter saves memory
- [ ] Click outside modal closes it
- [ ] Trash button clears all with confirmation

---

## Firebase Integration

### Verify Save Functions Exist

```javascript
// These should be passed as props or available via hooks
addMemory(memoryData)      // Create new
updateMemory(id, data)     // Update existing
deleteMemory(id)           // Delete (not used in modal)
```

### Check Firebase Schema

Memories should have:
```javascript
{
  id: string,
  content: string,
  title: string,
  hashtags: string[],
  additionalContext: string,
  timestamp: string,
  dateTime: string,
  userId: string,          // May be present
  position: object,        // May be present (Conspiracy Board)
  connections: array       // May be present (Conspiracy Board)
}
```

---

## Success Criteria

✅ **Migration Complete When:**
- [ ] Shared modal imported in all three views
- [ ] Old modal imports removed
- [ ] Old modal files deleted
- [ ] All tests pass (create, edit, save)
- [ ] Firebase saves confirmed
- [ ] No console errors
- [ ] Multiple memory units work (create mode)
- [ ] Edit mode works (single memory)
- [ ] Context/Sort toggles work
- [ ] Keyboard shortcuts work

---

## Quick Reference

### Dev Server
```bash
npm run dev
# http://localhost:5178/

# Routes:
# http://localhost:5178/           - Conspiracy Board
# http://localhost:5178/archive    - Archive
# http://localhost:5178/chronology - Chronology
```

### Useful Commands

```bash
# Find modal usage
grep -rn "Modal" src/components/[VIEW]/

# Check if file exists
ls -la src/components/[VIEW]/[Modal].jsx

# Count modal instances
grep -c "Modal" src/components/[VIEW]/[Component].jsx

# Find save handlers
grep -n "save.*memory\|addMemory\|updateMemory" src/components/[VIEW]/[Component].jsx
```

---

## When to Ask User

- [ ] View has special requirements not covered by shared modal
- [ ] Unknown if modal is needed for a view
- [ ] Firebase save functions have different signatures
- [ ] View-specific data needs to be preserved (positions, connections, etc.)
- [ ] Unsure if old modal file should be deleted

---

**END OF MODAL MIGRATION BRIEFING**

For general refactoring context, see: `REFACTORING.md`
For task priorities, see: `TODO.md`
