# 📚 START HERE - Refactoring Documentation

**For Claude Code Sessions**

When starting a new session on this refactoring project, read these files in order:

---

## 📖 Documentation Files

### 1. **REFACTORING.md** - Read This First
Current state of the project, completed work, decisions made, file locations, and known issues.

**Read this to understand:** Where we are now, what's been done, and overall project structure.

---

### 2. **TODO.md** - Read This Second
Prioritized task list with detailed steps for each task.

**Read this to understand:** What to work on next and how to do it.

---

### 3. **MODAL-MIGRATION.md** - Read When Working on Modals
Complete briefing on migrating memory modals to the shared component.

**Read this to understand:** How to migrate modals in Conspiracy Board and Chronology.

---

## 🎯 Quick Start (Next Session)

1. **Read:** `REFACTORING.md` (5 min)
2. **Read:** `TODO.md` - Focus on "🔴 High Priority" section (3 min)
3. **Check:** Dev server is running
   ```bash
   npm run dev
   # Should see: http://localhost:5178/
   ```
4. **Start:** First task in TODO.md (likely Conspiracy Board modal migration)

---

## ⚡ Ultra-Quick Start (If in a hurry)

**What's Done:**
- ✅ Archive has masonry layout + library sidebar + shared modal
- ✅ Shared MemoryModal component created (matches vanilla)

**What's Next:**
- ❌ Migrate Conspiracy Board to use shared modal
- ❓ Check Chronology for modals, migrate if needed
- ❌ Extract Archive inline styles to CSS files

**Immediate Action:**
Open `TODO.md` → Go to "🔴 High Priority" → Start with "Complete Modal Migration to Conspiracy Board"

---

## 📁 File Locations

```
/Users/sageryza/Documents/timeline/memory-library-react/
├── README-REFACTORING.md   ← You are here
├── REFACTORING.md          ← Current state & decisions
├── TODO.md                 ← Task list with steps
└── MODAL-MIGRATION.md      ← Modal migration guide
```

---

## 🚨 Important Notes

- **Don't recreate shared modal** - It exists at `src/components/shared/MemoryModal.jsx`
- **Don't start work without user approval** - Check project `CLAUDE.md` instructions
- **Archive is mostly done** - Focus on Conspiracy Board and Chronology
- **Multiple dev servers may be running** - Check ports 5173-5178

---

## 🔗 Key Files to Know

### Already Created (Don't Recreate)
- `src/components/shared/MemoryModal.jsx`
- `src/components/shared/MemoryModal.css`
- `src/hooks/useLibraries.js`
- `src/components/archive/LibrarySidebar.jsx`
- `src/components/archive/LibrarySidebar.css`

### Need Attention Next
- `src/components/conspiracy-board/ConspiracyBoard.jsx` (migrate modal)
- `src/components/conspiracy-board/AddMemoryModal.jsx` (delete after migration)
- `src/components/chronology/Chronology.jsx` (check for modals)

### Vanilla Reference (Read Only)
- `/Users/sageryza/Documents/timeline/archive.css` (2,892 lines)
- `/Users/sageryza/Documents/timeline/archive.html`
- `/Users/sageryza/Documents/timeline/linear.html` (modal reference)

---

## 🎨 Project Context

**Goal:** Migrate memory management app from vanilla to React while matching vanilla appearance

**Three Views:**
1. Archive - Grid of memories with library sidebar
2. Conspiracy Board - Canvas with draggable memory cards
3. Chronology - Timeline of memories

**Current Phase:** Modal standardization + CSS organization

---

## 💬 User Preferences (From CLAUDE.md)

1. **"Don't start working unless I explicitly say to"** - Always ask before beginning
2. **"Always save a backup before making significant changes"** - Use backup files
3. User wants **vanilla match** - Prioritize matching original appearance

---

## 📊 Progress Tracking

After completing tasks:
1. Update `TODO.md` - Mark items as ✅ Complete
2. Update `REFACTORING.md` - Add to "✅ Completed" section
3. Note any blockers or decisions needed

---

## 🆘 If Stuck

1. Check `MODAL-MIGRATION.md` for detailed modal migration steps
2. Check `TODO.md` "📞 Questions for User" section
3. Ask user for clarification
4. Document the blocker in `TODO.md`

---

**Good luck! The next session should start with Conspiracy Board modal migration.**
