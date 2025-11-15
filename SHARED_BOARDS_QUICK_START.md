# Shared Boards Feature - Quick Start Guide

**Generated**: November 13, 2025

## Key Questions Answered

### 1. How is Firebase Auth Currently Implemented?

- **File**: `src/hooks/useAuth.js`
- **Pattern**: Simple reactive hook using `onAuthStateChanged()`
- **Methods Supported**: Email/password, Google OAuth (UI hidden)
- **Auth Flow**: User state automatically updates and distributes via props
- **No Profile Data**: Auth system only provides `user.email` and `user.uid`

**What's Missing for Sharing**:
- User profile creation (username, display name, avatar)
- User metadata storage in Firestore

### 2. What Firebase Services Are Being Used?

- **Firebase Authentication** (Email + Google OAuth infrastructure)
- **Firestore Database** (NoSQL, real-time sync)
- **NO**: Cloud Storage, Cloud Functions, Real-time Database

**Firestore Usage Pattern**:
```javascript
// All data scoped to user
collection(db, 'users', userId, 'memories')
collection(db, 'users', userId, 'boardState')
collection(db, 'users', userId, 'boards')
collection(db, 'users', userId, 'constellations')
collection(db, 'users', userId, 'libraries')
```

### 3. How Does the Conspiracy Board Work?

**File**: `src/components/conspiracy-board/ConspiracyBoard.jsx` (700+ lines)

**Architecture**:
1. **Canvas.jsx** - Renders draggable memory cards using `@dnd-kit/core`
2. **Connections.jsx** - SVG lines drawn between connected memories
3. **Main Component** - Orchestrates all interactions, auto-saves board state

**Data Structure**:
```javascript
boardState = {
  droppedMemories: [{id, x, y, title, content, hashtags}],
  connections: [{id, from, to, insight}],
  standalonePins: [{id, x, y, text, color}],
  panOffset: {x, y}
}
```

**How Connections Work**:
- User clicks on memory pin (blue circle on card) to select for connection
- Clicks another pin to create connection
- Connections stored as `{from, to, insight}` 
- Rendered as SVG Bezier curves with positions calculated from DOM

### 4. How Are Connections Created and Stored?

**Storage**:
```javascript
// Each connection object
{
  id: string,      // Unique ID
  from: string,    // Source memory ID
  to: string,      // Target memory ID
  insight: string  // Optional annotation/label
}
```

**Persistence**:
- Auto-saved to Firestore: `users/{userId}/boardState/current`
- Auto-save debounced (1 second) to prevent excessive writes
- Real-time updates via `onSnapshot` listener

### 5. What's the Memory Data Structure?

```javascript
{
  id: string,              // Firestore doc ID
  title: string,           // User title
  content: string,         // HTML rich text
  hashtags: string[],      // Extracted from content
  createdAt: Timestamp,    // Server timestamp
  updatedAt: Timestamp,
  // Optional fields:
  category: string,
  url: string,
  imageUrl: string,
  date: string
}
```

### 6. How Are Memories Stored (localStorage vs Firebase)?

**Decision Logic**:
```javascript
const isUsingLocalStorage = !userId  // True if unauthenticated
```

**localStorage (Demo Mode)**:
- Key: `'memoryLibraryLocalData'`
- Limit: 50 memories max
- Cleared on browser data clear
- No real-time sync

**Firebase (Authenticated)**:
- Real-time Firestore subscriptions
- Unlimited memories
- Cross-device sync
- Automatic backups

**Both Use Same CRUD Interface**:
```javascript
const { memories, addMemory, updateMemory, deleteMemory } = useMemories(userId)
```

### 7. How Is User Data Persisted?

**Authenticated Users**:
- Memories: `users/{userId}/memories/{memoryId}`
- Board state: `users/{userId}/boardState/current`
- Chronology: `users/{userId}/chronologyState/current`
- Saved boards: `users/{userId}/boards/{boardName}`
- Libraries: `users/{userId}/libraries/{libraryId}`
- Constellations: `users/{userId}/constellations/{constellationId}`

**Unauthenticated Users**:
- Everything in `localStorage['memoryLibraryLocalData']` as JSON string

**On Login**:
- `migrateLocalStorageToFirestore()` moves demo data to Firestore
- Only runs once (checks `users/{userId}.migrated` flag)

### 8. Main Components and Their Relationships

```
App (root router, auth state)
├── useAuth() → watches Firebase Auth
├── useMemories(userId) → real-time memory sync
├── useBoardState(userId) → board layout sync
└── Routes:
    ├── ConspiracyBoard (canvas view)
    │   ├── Canvas (memory cards)
    │   ├── Connections (SVG lines)
    │   ├── Sidebar (memory list)
    │   └── useSavedBoards() (named board snapshots)
    ├── Archive (masonry grid)
    │   └── useLibraries() (collections)
    ├── Chronology (timeline)
    │   └── useChronologyState()
    ├── Libraries (collections list)
    └── Login (Firebase auth UI)
```

### 9. State Management Approach

**No Redux/Zustand** - Pure React Hooks

**Three Patterns**:
1. **Data Hooks** - Manage Firebase/localStorage (useMemories, useBoardState, etc.)
2. **Component State** - UI interactions (useState)
3. **Browser localStorage** - Transient UI state (activeBoardName, etc.)

**Data Flow**:
```
User Action 
  → Component State Update
  → useMemories/useBoardState calls Firebase
  → onSnapshot listener fires
  → Component re-renders
```

### 10. File Structure Organization

```
src/
├── components/
│   ├── conspiracy-board/      # Canvas, connections, board UI
│   ├── archive/               # Masonry grid, libraries sidebar
│   ├── chronology.jsx         # Timeline view
│   ├── libraries/             # Collections management
│   ├── shared/                # Reusable components (Modal, Card, Search)
│   ├── playgrounds/           # Experimental workspaces
│   ├── Home.jsx
│   ├── Login.jsx
│   └── App.jsx                # Root component, routing
├── hooks/                      # Custom data hooks
│   ├── useMemories.js         # Memory CRUD + sync
│   ├── useAuth.js             # Firebase auth state
│   ├── useBoardState.js       # Board persistence
│   ├── useConstellations.js   # Hashtag groupings
│   ├── useSavedBoards.js      # Named board snapshots
│   ├── useLibraries.js        # Collections
│   ├── usePlaygrounds.js      # Workspaces
│   ├── useLocalStorage.js     # Demo mode storage
│   ├── useChronologyState.js  # Timeline state
│   └── useSimplifyView.js     # Title formatting toggle
├── utils/
│   ├── generateId.js          # ID generation (all strings!)
│   ├── migrateData.js         # localStorage → Firebase
│   ├── idUtils.js             # ID comparison helpers
│   └── opacityCalculations.js # Connection visibility algorithm
└── firebase.js                 # Firebase config
```

---

## Critical Constraints for Shared Boards Feature

### Hard Constraints (Must Change)

1. **All Data Is User-Scoped**
   - Every query uses `users/{userId}/...` path
   - No root-level shared collections
   - No cross-user queries possible without restructuring

2. **No Access Control Exists**
   - No `visibility` field (public/private)
   - No permission fields
   - No ownership concept
   - Firestore rules not in repo (cloud-managed)

3. **No User Metadata**
   - Only `user.uid` and `user.email` from Auth
   - No username, display name, or avatar
   - Can't identify users for sharing

4. **No Invitation/Sharing UI**
   - No share buttons
   - No link generation
   - No permission management UI

### Architectural Strengths for Sharing

1. **Real-Time Sync Already Works**
   - `onSnapshot` listeners handle multi-user updates automatically
   - Just need to add access control

2. **Good Hook-Based Pattern**
   - Easy to create `useSharedBoards()` hook
   - Follows existing conventions

3. **Clean Data Structures**
   - Memories, connections, and pins are simple objects
   - Easy to snapshot and share

---

## What Needs to Be Built

### Minimum to Enable Sharing

1. **User Profiles** (`users/{userId}/profile`)
   - username, displayName, email, avatar

2. **Shared Boards Collection** (`sharedBoards/{boardId}`)
   - ownerId, visibility, accessList, board data

3. **Access Control**
   - Firestore security rules
   - `useSharedBoards()` hook with permission checks

4. **Sharing UI**
   - "Share Board" button
   - Public/private toggle
   - Invite link generation
   - Permission management

5. **Public Board View**
   - Read-only ConspiracyBoard variant
   - Share discovery page

### Nice to Have for MVP+

- Public board discovery feed
- Activity logs (who edited what)
- Comments on connections
- Multi-user simultaneous editing
- "Six Degrees" connection visualization

---

## Recommended Implementation Order

### Phase 1: User Profiles (1-2 days)
```javascript
// Create Firestore document
users/{userId}/profile
  ├── username: string
  ├── displayName: string
  ├── email: string
  ├── avatar: string (URL)
  └── joinedAt: Timestamp
```

### Phase 2: Shared Boards Collection (2-3 days)
```javascript
// New root collection for shared boards
sharedBoards/{boardId}
  ├── name: string
  ├── ownerId: string
  ├── visibility: 'public' | 'private' | 'restricted'
  ├── accessList: { [userId]: 'owner'|'editor'|'viewer' }
  ├── droppedMemories: [...]
  ├── connections: [...]
  └── createdAt: Timestamp
```

### Phase 3: Query Hook (1-2 days)
```javascript
export const useSharedBoards = (userId) => {
  // Listen to public boards
  // Listen to boards user has access to
  // Return with permission checking
}
```

### Phase 4: Sharing UI (2-3 days)
- Share button on ConspiracyBoard
- Modal for visibility + invites
- Copy link button
- Permission editor

### Phase 5: Public View (1-2 days)
- Route: `/board/{boardId}`
- Read-only board rendering
- Display owner info

---

## Key Code Locations to Modify

| Feature | Location | Action |
|---------|----------|--------|
| Auth | `src/hooks/useAuth.js` | Add profile data capture on signup |
| Board Saving | `src/hooks/useSavedBoards.js` | Add sharing fields |
| Board Rendering | `src/components/conspiracy-board/ConspiracyBoard.jsx` | Add "Share" button + permission checks |
| Drag-Drop | `src/components/conspiracy-board/Canvas.jsx` | Disable for non-owners |
| CRUD | All hooks | Add permission checks |
| Routes | `src/App.jsx` | Add `/board/:boardId` route |

---

## Testing Checklist for Shared Boards

- [ ] User can create profile
- [ ] User can share board publicly
- [ ] Public board shows in discovery
- [ ] Non-owner can view but not edit
- [ ] Owner can revoke access
- [ ] Permissions enforce at API level
- [ ] Changes sync real-time for invited users
- [ ] Unauthenticated demo users can't see shared boards
- [ ] Deleted memories don't break shared boards
- [ ] User deletion handles owned boards gracefully

---

## Related Code References

**Existing Sharing-Like Features**:
- Libraries (can group memories)
- Constellations (auto-grouped by hashtags)
- Playgrounds (experimental workspaces)

**All Could be Extended with Sharing**:
- Add `visibility` field
- Add `accessList` 
- Add sharing UI

---

## See Also

- `ARCHITECTURE_ANALYSIS_FOR_SHARED_BOARDS.md` - Full 942-line architectural deep dive
- `ARCHITECTURE.md` - Original project architecture (user-scoped)
- `HOOKS.md` - Custom hooks reference
- `TODO.md` - Known issues and feature requests

