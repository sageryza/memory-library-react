# Memory Library React - Comprehensive Architecture Analysis
## For Planning Public/Shared Boards Feature

**Analysis Date**: November 13, 2025  
**Project**: memory-library-react  
**Firebase Project**: membry-df528

---

## EXECUTIVE SUMMARY

Memory Library is a React-based personal knowledge management app with four visualization modes (Conspiracy Board, Archive, Chronology, Libraries) that supports both offline demo mode (localStorage) and authenticated cloud mode (Firebase). The application demonstrates a sophisticated dual-storage architecture handling both unauthenticated users and authenticated users seamlessly.

**Key Finding**: The codebase is currently **entirely user-scoped** with no sharing/collaboration infrastructure. All data is strictly partitioned by `userId`, making the public/shared boards feature a significant architectural extension requiring new Firestore collections, access control patterns, and permission models.

---

## 1. FIREBASE INTEGRATION ANALYSIS

### 1.1 Current Firebase Configuration

**File**: `src/firebase.js`

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyCA04ReaTAoNDUgUCuBS-ti0Jkfl-16h_s",
  authDomain: "membry-df528.firebaseapp.com",
  projectId: "membry-df528",
  storageBucket: "membry-df528.firebasestorage.app",
  messagingSenderId: "513384339473",
  appId: "1:513384339473:web:8f46c5915a949c93a8b9b0",
  measurementId: "G-M75CDQ819E"
};
```

**Initialized Services**:
- Firebase Authentication (`getAuth()`)
- Firestore Database (`getFirestore()`)

**Notable**: No Cloud Storage, Cloud Functions, or Real-time Database used.

### 1.2 Authentication Implementation

**File**: `src/hooks/useAuth.js`

- **Pattern**: Simple state hook monitoring Firebase Auth state
- **Auth Types Supported**:
  - Email/password signup and signin (implemented)
  - Google OAuth (UI present but commented out)
  - Demo mode (no auth required - unauthenticated users use localStorage)

**Code Flow**:
```
onAuthStateChanged(auth) 
  → setUser(user) 
  → All components receive updated user via prop drilling
```

**Key Insight**: Authentication is **reactive** using Firebase's real-time listener, meaning user state updates automatically when user signs in/out.

### 1.3 Firestore Database Structure

**Current Data Model** (User-Scoped):
```
firestore/
├── users/{userId}/
│   ├── memories/{memoryId}
│   │   ├── id: string (Firestore doc ID)
│   │   ├── title: string
│   │   ├── content: string (HTML)
│   │   ├── hashtags: string[]
│   │   ├── createdAt: Timestamp
│   │   └── updatedAt: Timestamp
│   │
│   ├── boardState/current
│   │   ├── droppedMemories: Array<{id, x, y}>
│   │   ├── connections: Array<{from, to, insight}>
│   │   ├── standalonePins: Array<{id, x, y, text, color}>
│   │   ├── panOffset: {x, y}
│   │   └── updatedAt: Timestamp
│   │
│   ├── chronologyState/current
│   │   ├── positions: {
│   │   │   timelineIds: string[],
│   │   │   sidebarIds: string[],
│   │   │   lastUpdated: ISO timestamp,
│   │   │   version: number
│   │   │ }
│   │   └── updatedAt: Timestamp
│   │
│   ├── constellations/{constellationId}
│   │   ├── name: string
│   │   ├── memories: Array<{id, title, content}>
│   │   ├── connections: Array<{from, to}>
│   │   ├── pins: Array<{id, x, y, text}>
│   │   ├── createdAt: Timestamp
│   │   └── updatedAt: Timestamp
│   │
│   ├── boards/{boardId}
│   │   ├── name: string
│   │   ├── droppedMemories: Array<{id, x, y}>
│   │   ├── connections: Array<{from, to, insight}>
│   │   ├── standalonePins: Array<{id, x, y, text, color}>
│   │   └── updatedAt: Timestamp
│   │
│   ├── libraries/{libraryId}
│   │   ├── name: string
│   │   ├── description: string
│   │   ├── manualMemoryIds: string[]
│   │   ├── searchLogic: { ... }
│   │   ├── isLocked: boolean
│   │   ├── color: string
│   │   ├── createdAt: Timestamp
│   │   └── updatedAt: Timestamp
│   │
│   └── playgrounds/{playgroundId}
│       ├── name: string
│       ├── centralHashtag: string
│       ├── description: string
│       ├── createdAt: Timestamp
│       └── updatedAt: Timestamp
│
└── [No root-level collections for sharing]
```

**Critical Observation**: 
- All data lives under `users/{userId}/` with strict user-based partitioning
- No root-level shared collections exist
- No permission fields in any documents
- No visibility flags (public/private)

### 1.4 Firebase Service Usage Patterns

**Memory CRUD** (`src/hooks/useMemories.js`):
```javascript
// Path structure
collection(db, 'users', userId, 'memories')
query(memoriesRef, orderBy('createdAt', 'desc'))
onSnapshot(q, ...) // Real-time sync
```

**Board State** (`src/hooks/useBoardState.js`):
```javascript
doc(db, 'users', userId, 'boardState', 'current')
setDoc(boardStateRef, {...})
```

**Key Firebase Pattern**: 
- Uses `onSnapshot` for real-time listeners (not polling)
- Uses `serverTimestamp()` for all timestamps
- No batch writes or transactions currently
- No security rules configured in repo (cloud-managed)

---

## 2. CONSPIRACY BOARD IMPLEMENTATION DEEP DIVE

### 2.1 Canvas Component Architecture

**File**: `src/components/conspiracy-board/Canvas.jsx`

**Purpose**: Renders draggable memory cards on an infinite canvas

**Key Props**:
- `droppedMemories`: Array of memory objects with position (x, y)
- `connections`: Array of visual links between memories
- `selectedPin`: Current selection for drawing connections
- Various callbacks for interactions

**Canvas Rendering Logic**:
```javascript
// Dropped memory cards rendered as absolutely positioned elements
droppedMemories.map(memory => (
  <DroppedMemoryCard
    key={memory.id}
    memory={memory}
    style={{
      position: 'absolute',
      left: memory.x,
      top: memory.y,
      transform: isDragging ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    }}
  />
))
```

**Drag-and-Drop Integration**:
- Uses `@dnd-kit/core` library
- `useDraggable` hook on each memory card
- `useDroppable` hook on canvas itself
- `DragOverlay` component shows dragging preview

### 2.2 Connections System

**File**: `src/components/conspiracy-board/Connections.jsx`

**Data Structure for Connections**:
```javascript
{
  id: string,           // Unique connection ID
  from: string,         // Source memory ID
  to: string,           // Target memory ID
  insight: string       // Optional annotation
}
```

**Rendering Method**:
- SVG-based line drawing using actual DOM element positions
- Dynamic viewport positioning (supports infinite panning)
- Fallback positions when DOM not yet rendered
- Opacity fading algorithm for unrelated connections

**Key Implementation Details**:
```javascript
// Calculate node position from DOM
const getNodePosition = (nodeId) => {
  const memory = droppedMemories.find(m => compareIds(m.id, nodeId))
  // Pin positioned at: top -17px, right -2px on card
  // Calculates tail center for SVG line attachment
  return { x: cardWidth - 8, y: 7 }
}

// SVG lines drawn from node to node with curve
<path 
  d={`M ${fromX} ${fromY} Q ${controlX} ${controlY} ${toX} ${toY}`}
  stroke={color}
  fill="none"
/>
```

### 2.3 ConspiracyBoard Component - Main Orchestrator

**File**: `src/components/conspiracy-board/ConspiracyBoard.jsx` (~700+ lines)

**Responsibilities**:
1. State management for canvas interactions
2. Memory drag-and-drop handling
3. Connection creation and management
4. Board saving/loading
5. Sidebar and filter management
6. Constellation mode (hashtag-based grouping)
7. Pan and zoom operations

**State Variables** (partial list):
```javascript
const [droppedMemories, setDroppedMemories] = useState([])
const [connections, setConnections] = useState([])
const [standalonePins, setStandalonePins] = useState([])
const [selectedPin, setSelectedPin] = useState(null)
const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
const [activeBoardName, setActiveBoardName] = useState(null)
const [boardState, updateBoardState] = useBoardState(user?.uid)
```

**Undo/Redo System**:
```javascript
const MAX_UNDO_STATES = 50
const [undoHistory, setUndoHistory] = useState([])
```

**Auto-save Mechanism**:
```javascript
// Debounced save to Firebase
useEffect(() => {
  const timeoutId = setTimeout(() => {
    saveBoard(activeBoardName, boardState)
  }, 1000) // 1 second debounce
}, [activeBoardName, boardState])
```

### 2.4 Board State Management

**Saved Boards Hook**: `src/hooks/useSavedBoards.js`

```javascript
// Structure for saved boards
{
  id: string,              // Document ID (used as name)
  name: string,
  droppedMemories: [{id, x, y, title, content, hashtags}],
  connections: [{id, from, to, insight}],
  standalonePins: [{id, x, y, text, color}],
  updatedAt: Timestamp
}
```

**Board Lifecycle**:
1. Generate default name if none exists: `"Untitled Board - Nov 13, 2:34 PM"`
2. Auto-save to `users/{userId}/boards/{boardName}` on changes
3. Load most recent untitled board on startup
4. User can rename/delete boards via BoardManager component

---

## 3. MEMORY AND DATA MANAGEMENT

### 3.1 Memory Data Structure

**Complete Memory Object**:
```javascript
{
  id: string,                    // Firestore doc ID or generated local ID
  title: string,                 // User-entered title
  content: string,               // HTML content (rich text)
  hashtags: string[],            // Extracted from content (without #)
  createdAt: Timestamp | string, // Firestore Timestamp or ISO string
  updatedAt: Timestamp | string,
  category: string,              // Optional, defaults to 'general'
  url: string,                   // Optional external link
  imageUrl: string,              // Optional image reference
  date: string                   // Optional associated date
}
```

### 3.2 Storage Strategy: Dual Mode Architecture

**Unauthenticated Users** (Demo Mode):
- All data stored in `localStorage` under key: `'memoryLibraryLocalData'`
- Maximum 50 memories (soft limit with warning at 45+)
- Data structure mirrors Firebase (easy migration)
- No real-time sync, no cloud backup

**Authenticated Users** (Firebase Mode):
- Real-time Firestore subscriptions
- Unlimited memories
- Data syncs across devices
- Automatic backups

**Hook Pattern**:
```javascript
// From useMemories.js
const isUsingLocalStorage = !userId  // Determine storage based on auth

if (isUsingLocalStorage) {
  // Use localStorage hook
  return localStorage.addMemory(memoryData)
} else {
  // Use Firebase
  return addDoc(collection(db, 'users', userId, 'memories'), {...})
}
```

### 3.3 localStorage Implementation

**File**: `src/hooks/useLocalStorage.js`

**Data Schema**:
```javascript
const defaultData = {
  memories: [],
  boardState: {
    droppedMemories: [],
    connections: [],
    standalonePins: [],
    panOffset: { x: 0, y: 0 }
  },
  libraries: [],
  metadata: {
    version: '1.0',
    lastUpdated: ISO timestamp,
    memoryCount: number
  }
}
```

**Storage Key**: `'memoryLibraryLocalData'` (JSON stringified)

**Limitations**:
- 50 memory limit (enforced before adding)
- ~5MB max size estimate
- Cleared on browser data clear
- No cross-device sync

### 3.4 Data Migration Path

**File**: `src/utils/migrateData.js`

**Trigger**: When user logs in (Firebase auth completes)

**Process**:
1. Check if `users/{userId}` has `migrated: true` flag (skip if already done)
2. Retrieve `memoryLibraryLocalData` from localStorage
3. Transform memory structure (preserve all fields)
4. Batch write to Firestore `users/{userId}/memories/{auto-id}`
5. Set migration flag with count and timestamp

**Code**:
```javascript
await Promise.all(memories.map(memory => 
  addDoc(memoriesRef, {
    title: memory.title || '',
    content: memory.content || '',
    hashtags: memory.hashtags || [],
    createdAt: memory.timestamp ? new Date(memory.timestamp) : serverTimestamp(),
    updatedAt: serverTimestamp()
  })
))
```

### 3.5 ID Management

**File**: `src/utils/generateId.js`

**Critical Detail**: All IDs must be strings (to prevent Firestore ID type mismatches)

**Functions**:
```javascript
generateLocalId()       // Generates 16-char alphanumeric string
generatePinId()         // For standalone pins
ensureStringId(id)      // Converts any ID to string (defensive)
```

**Why This Matters**: Early in development, ID type inconsistencies caused numerous bugs (numbers vs strings). Application enforces string IDs throughout.

---

## 4. OVERALL ARCHITECTURE OVERVIEW

### 4.1 Component Hierarchy

```
App.jsx (Routes, Auth State Distribution)
├── Navigation (Auth Status + Sign Out)
├── PageTitle (Route-based title management)
├── StorageIndicator (Demo mode storage display)
└── Routes:
    ├── ConspiracyBoard.jsx (Route: /conspiracy-board)
    │   ├── Sidebar.jsx (Memory list with filters)
    │   ├── Canvas.jsx (Infinite canvas)
    │   ├── Connections.jsx (SVG visual links)
    │   ├── ConstellationSidebar.jsx (Hashtag groups)
    │   ├── ConstellationMode.jsx (Constellation UI)
    │   ├── StandalonePins.jsx (Text annotations)
    │   ├── PinEditModal.jsx (Edit pins)
    │   ├── TabbedSidebar.jsx (Tag cloud, libraries)
    │   └── MemoryModal.jsx (Create/edit memories)
    │
    ├── Archive.jsx (Route: /archive)
    │   ├── ArchiveMemoryCard (Masonry grid)
    │   ├── LibrarySidebar (Collections)
    │   ├── AdvancedSearch.jsx (Multi-criteria search)
    │   └── MemoryModal.jsx
    │
    ├── Chronology.jsx (Route: /chronology)
    │   ├── Timeline (Drag-to-order)
    │   └── Sidebar (Unplaced memories)
    │
    ├── Libraries.jsx (Route: /libraries)
    │   └── LibraryCard[] (Collection list)
    │
    └── Login.jsx (Route: /login)
```

### 4.2 State Management Patterns

**No Redux/Zustand** - Uses React Hooks exclusively

**Pattern 1: Custom Data Hooks** (Manage Firebase/localStorage)
```javascript
const { 
  memories, 
  addMemory, 
  updateMemory, 
  deleteMemory 
} = useMemories(user?.uid)
```

**Pattern 2: Local Component State** (UI interactions)
```javascript
const [selectedPin, setSelectedPin] = useState(null)
const [showModal, setShowModal] = useState(false)
```

**Pattern 3: Browser localStorage** (Transient UI state)
```javascript
localStorage.setItem('activeBoardName', boardName)
localStorage.setItem('simplifyView', isSimplified)
```

**Data Flow**:
```
User Action
  ↓
Component State Update
  ↓
useMemories/useBoardState (calls Firebase or localStorage)
  ↓
Real-time Listener (onSnapshot) re-renders component
  ↓
UI reflects new data
```

### 4.3 Hook-Based Architecture

**Core Data Hooks**:
1. `useAuth()` - Firebase auth state
2. `useMemories(userId)` - CRUD + sync
3. `useBoardState(userId)` - Board layout persistence
4. `useConstellations(userId)` - Hashtag groupings
5. `useSavedBoards(userId)` - Named board snapshots
6. `useLibraries(userId)` - Memory collections
7. `usePlaygrounds(userId)` - Experimental workspaces
8. `useLocalStorage()` - Demo mode persistence

**UI Control Hooks**:
9. `useSimplifyView()` - Title formatting toggle
10. `useChronologyState(userId)` - Timeline ordering
11. `useMemoryConnections(userId)` - Connection detection

### 4.4 Routing Structure

**File**: React Router in `App.jsx`

```javascript
<Routes>
  <Route path="/" element={<Home />} />
  <Route path="/conspiracy-board" element={<ConspiracyBoard {...props} />} />
  <Route path="/archive" element={<Archive {...props} />} />
  <Route path="/libraries" element={<Libraries {...props} />} />
  <Route path="/chronology" element={<Chronology {...props} />} />
  <Route path="/login" element={<Login />} />
</Routes>
```

**Key**: No nested routes, flat structure with prop drilling for data distribution.

---

## 5. KEY ARCHITECTURAL PATTERNS

### 5.1 Real-Time Synchronization Pattern

**Mechanism**: Firestore `onSnapshot` listeners

```javascript
const unsubscribe = onSnapshot(query, (snapshot) => {
  const data = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }))
  setData(data)
})

// Auto-cleanup
return () => unsubscribe()
```

**Characteristics**:
- Automatic re-renders on data changes
- One listener per data collection per user
- Real-time across tabs/devices (if same user)
- Network-aware (pauses offline)

### 5.2 Fallback to localStorage Pattern

**Strategy**: Every hook that would use Firebase checks `userId`:

```javascript
if (!userId) {
  // Unauthenticated - use localStorage
  return localStorage.getData()
} else {
  // Authenticated - use Firebase
  onSnapshot(collection(db, 'users', userId, ...), ...)
}
```

**Benefit**: Single hook interface for both storage backends

**Challenge**: Component must handle both Timestamp objects (Firebase) and ISO strings (localStorage)

### 5.3 Defensive ID Handling

**Problem**: String vs number ID mismatches caused bugs

**Solution**: `ensureStringId()` wrapper function throughout

```javascript
const ensureStringId = (id) => {
  if (typeof id === 'string') return id
  if (typeof id === 'number') return id.toString()
  return String(id)
}

// Used everywhere IDs are compared or stored
const normalizedId = ensureStringId(memoryId)
```

### 5.4 Optimistic Updates Pattern

**File**: ConspiracyBoard.jsx lines 62-63

```javascript
const [optimisticPositions, setOptimisticPositions] = useState({})

// User drags memory - update UI immediately
setOptimisticPositions({...previousPositions, [memoryId]: {x, y}})

// Meanwhile, persist to Firebase in background
updateBoardState({droppedMemories: [...], ...})
  .catch(error => rollbackOptimisticUpdate())
```

**Benefit**: Instant UI response without network wait

### 5.5 Debounced Auto-Save

**Implementation**: ConspiracyBoard.jsx line ~228

```javascript
useEffect(() => {
  const timeoutId = setTimeout(() => {
    saveBoard(activeBoardName, boardState)
      .catch(error => {
        // Error handling
      })
  }, 1000) // 1 second debounce
  
  return () => clearTimeout(timeoutId)
}, [activeBoardName, boardState])
```

**Why**: Prevents excessive Firebase writes when user rapidly moves cards

---

## 6. CRITICAL ARCHITECTURAL CONSTRAINTS FOR SHARED BOARDS

### 6.1 Current Limitations (Hard Constraints)

1. **Strict User Partitioning**
   - All queries are scoped: `collection(db, 'users', userId, ...)`
   - No root-level collections
   - No cross-user queries possible without restructuring

2. **No Access Control**
   - No `isPublic`, `visibility`, or `permissions` fields
   - No concept of read/write access
   - Firestore security rules not in repo (cloud-managed)

3. **No Sharing/Invitation System**
   - No concept of "board owner" vs "board editor" vs "board viewer"
   - No board sharing URLs or link-based access
   - No user metadata (username, profile, etc.)

4. **No Cross-User References**
   - Memories reference only contain IDs, no user info
   - Can't reliably identify which user created what
   - No audit trail

5. **Single-Device Scope**
   - Assumes one user per browser
   - No session management
   - No "active viewers" tracking

### 6.2 What Would Need to Change

#### New Firestore Collections
```
firestore/
├── sharedBoards/{boardId}          // NEW: Public board metadata
│   ├── name: string
│   ├── description: string
│   ├── ownerId: string             // Reference to owner
│   ├── visibility: 'private'|'public'|'restricted'
│   ├── accessList: {
│   │   [userId]: 'owner'|'editor'|'viewer'
│   │ }
│   ├── droppedMemories: [...]
│   ├── connections: [...]
│   ├── createdAt: Timestamp
│   └── updatedAt: Timestamp
│
├── users/{userId}/                 // EXISTING
│   ├── profile/                    // NEW: User metadata
│   │   ├── username: string
│   │   ├── email: string
│   │   ├── displayName: string
│   │   ├── avatar: string (URL)
│   │   └── joinedAt: Timestamp
│   │
│   └── sharedBoardAccess/{boardId} // NEW: Track shared boards user can access
│       └── accessLevel: 'owner'|'editor'|'viewer'
│
└── boardActivity/{boardId}/logs/   // NEW (Optional): Audit trail
    └── {logId}: {
          userId: string,
          action: 'created'|'edited'|'viewed',
          timestamp: Timestamp
        }
```

#### Authentication Enhancements Needed
- Capture and store user profile data (not currently done)
- Generate readable usernames or display names
- Consider social auth integration (Google, GitHub)

#### Security Rules Changes
- Would need to validate access before allowing reads/writes
- Example rule needed:
  ```firestore
  match /sharedBoards/{boardId} {
    allow read: if 
      resource.data.visibility == 'public' ||
      request.auth.uid in resource.data.accessList;
    allow write: if 
      request.auth.uid == resource.data.accessList[request.auth.uid].owner;
  }
  ```

---

## 7. KEY FILES AND DEPENDENCIES

### 7.1 Critical Files to Understand First

| File | Lines | Purpose | Complexity |
|------|-------|---------|-----------|
| App.jsx | 260 | Main app shell, routing | Medium |
| ConspiracyBoard.jsx | 700+ | Board orchestration | High |
| useMemories.js | 280 | Core memory CRUD | Medium |
| useBoardState.js | 105 | Board state persistence | Low |
| Canvas.jsx | 170 | Card rendering + drag | Medium |
| Connections.jsx | 200+ | SVG line drawing | High |
| useAuth.js | 22 | Auth state | Low |
| useLocalStorage.js | 260 | Demo mode persistence | Medium |

### 7.2 External Dependencies

```json
{
  "react": "19.1.1",                 // UI framework
  "react-dom": "19.1.1",
  "react-router-dom": "7.9.4",       // Routing
  "firebase": "12.4.0",              // Backend
  "@dnd-kit/core": "6.3.1",          // Drag-and-drop
  "lucide-react": "0.545.0",         // Icons
  "react-masonry-css": "1.0.16",     // Grid layout (Archive)
  "keyword-extractor": "0.0.28",     // Search
  "rake-js": "0.1.1"                 // Keyword extraction
}
```

**Note**: No state management library (Redux, Zustand, Jotai). Uses React Hooks and Context implicitly.

---

## 8. KNOWN ISSUES AND TODOs

### 8.1 From Code Comments

**In useMemories.js (line 1-9)**:
- TODO: Review testing coverage for recent bug fixes
- Fixed ID type issues around Nov 9-11
- localStorage dependency issues noted

**In useBoardState.js (line 51-52)**:
- TODO: Investigate false error popups on successful saves
- serverTimestamp() timing issue suspected

**In Connections.jsx (line 6-10)**:
- TODO: Customizable connection colors
- TODO: Fix random Venn Modal triggers (too sensitive collision detection)

**In useLibraries.js (line 44-48)**:
- TODO: Add default libraries on first use
- Implement "Core Memories" and "Synchronicities" templates

### 8.2 Current Bugs/Limitations

From TODO.md:
- Timestamp inconsistency between Firestore and localStorage
- Some edge cases in ID handling still present
- No validation of memory data structure

---

## 9. WHAT WOULD BE NEEDED FOR PUBLIC/SHARED BOARDS FEATURE

### 9.1 Minimal Feature Set

**Essential Components**:
1. Share button on existing boards
2. Copy shareable link
3. View-only access for non-owners
4. List of shared boards for each user

**Implementation Steps**:
1. Create `sharedBoards` root collection
2. Add user profile data to `users/{userId}/profile`
3. Implement access control queries
4. Add sharing UI to ConspiracyBoard
5. Create public board view route
6. Handle permissions in all CRUD operations

### 9.2 Recommended Architecture for Shared Boards

**Query Pattern for Shared Boards**:
```javascript
// Get all public boards
collection(db, 'sharedBoards')
  .where('visibility', '==', 'public')
  .orderBy('createdAt', 'desc')

// Get boards shared with current user
collection(db, 'sharedBoards')
  .where('accessList.' + userId, '!=', null)

// For current user's shared boards
collection(db, 'sharedBoards')
  .where('ownerId', '==', userId)
```

**Hook Pattern** (similar to existing hooks):
```javascript
export const useSharedBoards = (userId) => {
  const [publicBoards, setPublicBoards] = useState([])
  const [accessibleBoards, setAccessibleBoards] = useState([])
  
  // Listen to public boards
  useEffect(() => {
    const q = query(
      collection(db, 'sharedBoards'),
      where('visibility', '==', 'public'),
      orderBy('createdAt', 'desc')
    )
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPublicBoards(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })))
    })
    return unsubscribe
  }, [])
  
  // Similar pattern for user-accessible boards
  // ...
  
  return { publicBoards, accessibleBoards, ... }
}
```

---

## 10. EXISTING FEATURES THAT COULD SUPPORT SHARING

### 10.1 Constellation Feature

**Current Use**: Hashtag-based automatic grouping

**Current Code**: `src/hooks/useConstellations.js`

```javascript
// Constellations are saved snapshots
{
  name: string,
  memories: Array<{id, title, content}>,
  connections: Array<{from, to}>,
  pins: Array<{id, x, y, text}>,
  createdAt: Timestamp
}
```

**Potential**: Could be extended to be shareable (already has good data structure)

### 10.2 Libraries Feature

**Current Use**: Memory collections (manual + search-based)

**Could Support**:
- Shared collections by default
- Public/private toggle per library
- Collaborative curation

### 10.3 Playgrounds Feature

**Current Use**: Experimental workspaces

**Could Support**:
- Public playgrounds for collaborative brainstorming
- Invitation-based editing

---

## 11. IMPLEMENTATION ROADMAP SUGGESTION

### Phase 1: Foundation (1-2 weeks)
- [ ] Create user profile schema and migrate existing users
- [ ] Add `sharedBoards` root collection
- [ ] Implement basic access control queries
- [ ] Create new `useSharedBoards` hook

### Phase 2: UI for Sharing (1-2 weeks)
- [ ] Add "Share" button to ConspiracyBoard
- [ ] Create sharing modal (public/private toggle, invite links)
- [ ] List shared boards in sidebar
- [ ] Display board owner/contributor info

### Phase 3: Viewing Shared Boards (1 week)
- [ ] Create read-only board view for non-owners
- [ ] Add public board discovery page
- [ ] Implement permission checks for all mutations

### Phase 4: Advanced Features (2+ weeks)
- [ ] Multi-user editing with real-time collaboration
- [ ] Activity logs and change tracking
- [ ] Commenting on connections/memories
- [ ] User mentions and notifications

### Phase 5: Six Degrees Integration (Research)
- [ ] Trace connection paths between users' boards
- [ ] Cross-board memory linking
- [ ] Community discovery features

---

## 12. SUMMARY TABLE

| Aspect | Current State | For Sharing | Effort |
|--------|--------------|-------------|--------|
| Auth | Email/password + Google | Needs profile data | Low |
| Database | User-scoped collections | Needs root collections | Medium |
| Access Control | Single user only | Needs permission model | Medium |
| Real-time Sync | In place for single user | Works for multi-user | Low |
| UI for Sharing | None | Needs UI components | Medium |
| Cross-user Queries | Not possible | Needs query refactor | Medium |
| Conflict Resolution | N/A (single user) | Needs strategy | High |

---

## CONCLUSION

Memory Library has a solid, well-structured codebase with clear separation between storage backends (Firebase vs localStorage) and good patterns for data management. However, it is fundamentally designed for single-user scenarios with strict user-data partitioning.

Adding public/shared boards requires:
1. **Structural changes** to Firestore (new root collections)
2. **Data model changes** (permissions, ownership, visibility)
3. **Query pattern changes** (cross-user queries)
4. **Security rules updates** (access control)
5. **UI additions** (sharing, permissions, discovery)

The existing architecture provides good patterns to build upon—the dual Firebase/localStorage approach, hook-based state management, and real-time sync capabilities will all support sharing features well once the foundational access control is in place.
