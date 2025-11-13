# Custom Hooks API Reference

This document describes all custom hooks in the Memory Library application. These hooks handle state management, data persistence, and business logic.

## Table of Contents

- [Data Management](#data-management)
  - [useMemories](#usememories)
  - [useAuth](#useauth)
  - [useLocalStorage](#uselocalstorage)
- [View-Specific State](#view-specific-state)
  - [useBoardState](#useboardstate)
  - [useChronologyState](#usechronologystate)
  - [useLibraries](#uselibraries)
  - [useConstellations](#useconstellations)
- [UI State](#ui-state)
  - [useSimplifyView](#usesimplifyview)
- [Feature-Specific](#feature-specific)
  - [useMemoryConnections](#usememoryconnections)
  - [useSavedBoards](#usesavedboards)
  - [usePlaygrounds](#useplaygrounds)

---

## Data Management

### useMemories

**Purpose**: Central hook for all memory CRUD operations. Automatically switches between Firebase (authenticated) and localStorage (demo mode).

**Location**: `src/hooks/useMemories.js`

**Parameters**:
- `userId` (string | null): Firebase user ID, or null for demo mode

**Returns**:
```javascript
{
  memories: Array<Memory>,           // All memories
  loading: boolean,                  // Initial load state
  error: string | null,             // Error message if any
  addMemory: (memoryData) => Promise<string>,     // Returns new memory ID
  updateMemory: (memoryId, updates) => Promise<void>,
  deleteMemory: (memoryId) => Promise<void>,

  // Demo mode only:
  isUsingLocalStorage: boolean,     // True if in demo mode
  memoryCount: number,              // Current memory count
  maxMemories: number,              // Max allowed (100)
  isApproachingLimit: boolean,      // True when > 90 memories
  hasReachedLimit: boolean,         // True when at 100
  storageInfo: Object               // Storage usage stats
}
```

**Memory Object Structure**:
```javascript
{
  id: string,              // Firestore doc ID or generated ID
  title: string,           // Memory title
  content: string,         // Memory content/description
  hashtags: string[],      // Array of hashtags (without #)
  createdAt: Timestamp,    // Firebase server timestamp
  updatedAt: Timestamp     // Firebase server timestamp
}
```

**Usage**:
```javascript
const {
  memories,
  loading,
  addMemory,
  updateMemory,
  deleteMemory
} = useMemories(user?.uid);

// Create a memory
await addMemory({
  title: 'My Memory',
  content: 'Memory content with #hashtag',
  hashtags: ['hashtag']
});

// Update a memory
await updateMemory(memoryId, {
  title: 'Updated Title'
});

// Delete a memory
await deleteMemory(memoryId);
```

**Notes**:
- Automatically migrates localStorage data to Firebase on login
- Enforces 100 memory limit in demo mode
- All IDs are normalized to strings for consistency
- Never include 'id' field in memoryData/updates (it's managed internally)

---

### useAuth

**Purpose**: Manages Firebase authentication state.

**Location**: `src/hooks/useAuth.js`

**Parameters**: None

**Returns**:
```javascript
{
  user: User | null,       // Firebase user object or null
  loading: boolean         // Auth state loading
}
```

**Usage**:
```javascript
const { user, loading } = useAuth();

if (loading) return <LoadingSpinner />;
if (user) {
  // User is authenticated
} else {
  // User is in demo mode
}
```

---

### useLocalStorage

**Purpose**: Low-level localStorage management with memory limits. Used internally by other hooks.

**Location**: `src/hooks/useLocalStorage.js`

**Parameters**: None

**Returns**:
```javascript
{
  memories: Array<Memory>,
  boardState: Object,
  MAX_MEMORIES: number,              // 100
  isApproachingLimit: boolean,
  hasReachedLimit: boolean,
  addMemory: (memoryData) => { success: boolean, id?: string, error?: string },
  updateMemory: (memoryId, updates) => void,
  deleteMemory: (memoryId) => void,
  updateBoardState: (newState) => void,
  estimateStorageUsage: () => Object
}
```

**Notes**:
- Typically not used directly; use `useMemories` instead
- Automatically handles storage quota management

---

## View-Specific State

### useBoardState

**Purpose**: Manages Conspiracy Board state (pin positions, connections, pan offset).

**Location**: `src/hooks/useBoardState.js`

**Parameters**:
- `userId` (string | null): Firebase user ID, or null for demo mode

**Returns**:
```javascript
{
  boardState: {
    droppedMemories: Array<{ id: string, x: number, y: number }>,
    connections: Array<Connection>,
    standalonePins: Array<Pin>,
    panOffset: { x: number, y: number }
  },
  loading: boolean,
  error: string | null,
  updateBoardState: (newState) => Promise<void>
}
```

**Connection Object**:
```javascript
{
  id: string,
  source: string,          // Memory ID
  target: string,          // Memory ID
  insight: string          // Connection annotation
}
```

**Pin Object**:
```javascript
{
  id: string,
  x: number,
  y: number,
  text: string,
  color: string
}
```

**Usage**:
```javascript
const { boardState, updateBoardState } = useBoardState(user?.uid);

// Update board state
await updateBoardState({
  ...boardState,
  droppedMemories: [...boardState.droppedMemories, { id: memoryId, x: 100, y: 200 }]
});
```

---

### useChronologyState

**Purpose**: Manages Chronology timeline state (memory order and sidebar).

**Location**: `src/hooks/useChronologyState.js`

**Parameters**:
- `userId` (string | null): Firebase user ID

**Returns**:
```javascript
{
  chronologyState: {
    positions: {
      timelineIds: string[],       // Ordered memory IDs on timeline
      sidebarIds: string[],        // Memory IDs in sidebar
      lastUpdated: string          // ISO timestamp
    }
  },
  loading: boolean,
  updateChronologyState: (newState) => Promise<void>
}
```

**Usage**:
```javascript
const { chronologyState, updateChronologyState } = useChronologyState(user?.uid);

// Update timeline order
await updateChronologyState({
  positions: {
    timelineIds: ['mem1', 'mem2', 'mem3'],
    sidebarIds: ['mem4', 'mem5'],
    lastUpdated: new Date().toISOString()
  }
});
```

---

### useLibraries

**Purpose**: Manages memory collections (Libraries) with manual and search-based filtering. Libraries can contain both manual and search-based memories simultaneously.

**Location**: `src/hooks/useLibraries.js`

**Parameters**:
- `userId` (string | null): Firebase user ID, or null for demo mode

**Returns**:
```javascript
{
  libraries: Array<Library>,
  loading: boolean,
  createLibrary: (libraryData) => Promise<Library>,
  updateLibrary: (libraryId, updates) => Promise<void>,
  deleteLibrary: (libraryId) => Promise<void>,
  addMemoryToLibrary: (libraryId, memoryId) => Promise<void>,
  removeMemoryFromLibrary: (libraryId, memoryId) => Promise<void>,
  getLibraryMemories: (libraryId, allMemories) => Array<Memory>
}
```

**Library Object**:
```javascript
{
  id: string,
  name: string,
  description: string,
  manualMemoryIds: string[],       // Manually added memories
  searchLogic: SearchLogic | null, // Dynamic search filter
  isLocked: boolean,               // Hidden from main views
  color: string | null,
  createdAt: string
}
```

**Note**: Libraries support hybrid functionality - they can have both `manualMemoryIds` and `searchLogic` simultaneously. The `getLibraryMemories` function returns the union of both sources (deduplicated).

**SearchLogic Object**:
```javascript
{
  andTerms: string[],              // All must match
  orTerms: string[],               // At least one must match
  excludeTerms: string,            // None should match
  searchInTitles: boolean,
  searchInContent: boolean,
  searchInHashtags: boolean,
  searchInDates: boolean
}
```

**Usage**:
```javascript
const { libraries, createLibrary, getLibraryMemories } = useLibraries(user?.uid);

// Create a manual library
await createLibrary({
  name: 'My Collection',
  description: 'Important memories',
  manualMemoryIds: ['mem1', 'mem2']
});

// Create a search-based library
await createLibrary({
  name: 'Work Notes',
  searchLogic: {
    andTerms: ['work', 'project'],
    orTerms: [],
    searchInTitles: true,
    searchInContent: true,
    searchInHashtags: true
  }
});

// Create a hybrid library (both manual and search-based)
await createLibrary({
  name: 'Important Work Items',
  description: 'Work-related memories plus specific highlights',
  manualMemoryIds: ['mem1', 'mem2'],  // Specific memories
  searchLogic: {                      // Plus dynamic search
    andTerms: ['work'],
    orTerms: [],
    searchInTitles: true,
    searchInContent: true,
    searchInHashtags: true
  }
});

// Get memories in a library (returns union of manual + search results)
const libraryMemories = getLibraryMemories(libraryId, memories);
```

---

### useConstellations

**Purpose**: Manages saved Constellation boards (hashtag-based memory groupings).

**Location**: `src/hooks/useConstellations.js`

**Parameters**:
- `userId` (string | null): Firebase user ID

**Returns**:
```javascript
{
  constellations: Array<Constellation>,
  loading: boolean,
  error: string | null,
  saveConstellation: (name, data) => Promise<void>,
  loadConstellation: (constellationId) => ConstellationData | null,
  deleteConstellation: (constellationId) => Promise<void>
}
```

**Constellation Object**:
```javascript
{
  id: string,
  name: string,
  memories: Array<{ id: string, x: number, y: number }>,
  connections: Array<Connection>,
  pins: Array<Pin>,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Usage**:
```javascript
const { constellations, saveConstellation, loadConstellation } = useConstellations(user?.uid);

// Save current board as constellation
await saveConstellation('Work Project', {
  memories: droppedMemories,
  connections: connections,
  pins: standalonePins
});

// Load a constellation
const data = loadConstellation(constellationId);
if (data) {
  // Apply constellation data to board
}
```

---

## UI State

### useSimplifyView

**Purpose**: Manages simplified view toggle and title formatting (converts commas to bullets).

**Location**: `src/hooks/useSimplifyView.js`

**Parameters**: None

**Returns**:
```javascript
{
  isSimplified: boolean,
  toggleSimplify: () => void,
  processInputTitle: (title: string) => string,      // Converts commas to bullets
  formatTitleForDisplay: (title: string) => string   // Formats bullets for display
}
```

**Usage**:
```javascript
const { isSimplified, toggleSimplify, formatTitleForDisplay } = useSimplifyView();

// In component
<button onClick={toggleSimplify}>
  {isSimplified ? 'Normal View' : 'Simplified View'}
</button>

// Format title for display
<div>{formatTitleForDisplay(memory.title)}</div>
```

**Notes**:
- `processInputTitle`: Use when saving memories (converts `, ` to ` • `)
- `formatTitleForDisplay`: Use when displaying titles (converts ` • ` to line breaks in simplified mode)

---

## Feature-Specific

### useMemoryConnections

**Purpose**: Manages connections between memories on Conspiracy Board.

**Location**: `src/hooks/useMemoryConnections.js`

**Parameters**:
- `userId` (string | null): Firebase user ID

**Returns**:
```javascript
{
  connections: Array<Connection>,
  addConnection: (sourceId, targetId, insight) => void,
  updateConnection: (connectionId, insight) => void,
  deleteConnection: (connectionId) => void,
  getConnectionsForMemory: (memoryId) => Array<Connection>
}
```

**Usage**:
```javascript
const { connections, addConnection } = useMemoryConnections(user?.uid);

// Add a connection
addConnection('mem1', 'mem2', 'These ideas relate because...');
```

**Notes**:
- Connections are automatically saved to boardState
- Used specifically for Conspiracy Board

---

### useSavedBoards

**Purpose**: Manages saved board snapshots (full board state with name).

**Location**: `src/hooks/useSavedBoards.js`

**Parameters**:
- `userId` (string | null): Firebase user ID

**Returns**:
```javascript
{
  savedBoards: Array<SavedBoard>,
  loading: boolean,
  saveBoard: (name, boardData) => Promise<void>,
  loadBoard: (boardId) => Promise<Object>,
  deleteBoard: (boardId) => Promise<void>
}
```

**SavedBoard Object**:
```javascript
{
  id: string,
  name: string,
  droppedMemories: Array,
  connections: Array,
  standalonePins: Array,
  panOffset: Object,
  createdAt: Timestamp
}
```

**Usage**:
```javascript
const { savedBoards, saveBoard, loadBoard } = useSavedBoards(user?.uid);

// Save current board
await saveBoard('Project Board', {
  droppedMemories,
  connections,
  standalonePins,
  panOffset
});

// Load a saved board
const boardData = await loadBoard(boardId);
```

---

### usePlaygrounds

**Purpose**: Manages Playground workspaces (experimental memory arrangements).

**Location**: `src/hooks/usePlaygrounds.js`

**Parameters**:
- `userId` (string | null): Firebase user ID

**Returns**:
```javascript
{
  playgrounds: Array<Playground>,
  loading: boolean,
  createPlayground: (playgroundData) => Promise<Playground>,
  updatePlayground: (playgroundId, updates) => Promise<void>,
  deletePlayground: (playgroundId) => Promise<void>,
  getPlayground: (playgroundId) => Playground | null
}
```

**Playground Object**:
```javascript
{
  id: string,
  name: string,
  centralHashtag: string | null,
  description: string,
  memories: Array,
  connections: Array,
  pins: Array,
  createdAt: Timestamp
}
```

**Usage**:
```javascript
const { playgrounds, createPlayground } = usePlaygrounds(user?.uid);

// Create a new playground
const playground = await createPlayground({
  name: 'Experiment',
  centralHashtag: 'research',
  description: 'Testing ideas'
});
```

---

## Best Practices

1. **Always pass userId from useAuth**: Most hooks need the user ID to determine storage mode
   ```javascript
   const { user } = useAuth();
   const { memories } = useMemories(user?.uid);
   ```

2. **Handle loading states**: All data hooks return a `loading` boolean
   ```javascript
   if (loading) return <LoadingSpinner />;
   ```

3. **Error handling**: Wrap async operations in try-catch
   ```javascript
   try {
     await addMemory(memoryData);
   } catch (error) {
     console.error('Failed to add memory:', error);
   }
   ```

4. **ID consistency**: Never include 'id' in create/update operations - it's managed by hooks
   ```javascript
   // ❌ Bad
   await addMemory({ id: '123', title: 'Test' });

   // ✅ Good
   await addMemory({ title: 'Test' });
   ```

5. **Demo mode support**: Hooks automatically handle localStorage fallback when userId is null
