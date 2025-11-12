# Memory Library Architecture

## What This Library Does

Memory Library is a React-based personal knowledge management application that allows users to capture, organize, and visualize "memories" (notes/thoughts) across four different views:

- **Conspiracy Board**: Visual canvas for creating connections between memories with drag-and-drop positioning
- **Archive**: Pinterest-style masonry grid for browsing and managing all memories
- **Chronology**: Timeline interface for arranging memories in chronological order
- **Libraries**: Collection system for organizing memories with search-based filtering

The app supports both authenticated (Firebase) and demo mode (localStorage) with automatic migration between them.

## Core Concepts

- **Memory**: The fundamental data unit - a note with title, content, and hashtags
- **Constellation**: A group of related memories created from hashtags
- **Connection**: Visual links between memories on the Conspiracy Board
- **Library**: A saved collection of memories (manual or search-based)
- **Playground**: A sandbox workspace for experimenting with memory arrangements

## Main Files and Their Purpose

### Application Entry Points
- **`src/App.jsx`**: Main app component, handles routing, authentication, and memory state distribution to views
- **`src/firebase.js`**: Firebase configuration and initialization (auth + Firestore)
- **`src/main.jsx`**: React app entry point

### Views (Main Components)
- **`src/components/conspiracy-board/ConspiracyBoard.jsx`**: Visual canvas with drag-and-drop, connections, and infinite panning
- **`src/components/archive/Archive.jsx`**: Masonry grid view with search, filters, and library management
- **`src/components/Chronology.jsx`**: Timeline view with drag-and-drop chronological ordering
- **`src/components/libraries/Libraries.jsx`**: Library management interface

### Core Hooks (State Management)
- **`src/hooks/useMemories.js`**: Central memory CRUD operations (Firebase + localStorage fallback)
- **`src/hooks/useAuth.js`**: Firebase authentication state
- **`src/hooks/useBoardState.js`**: Conspiracy Board state persistence (pin positions, connections)
- **`src/hooks/useChronologyState.js`**: Chronology timeline state persistence
- **`src/hooks/useLibraries.js`**: Library CRUD operations
- **`src/hooks/useConstellations.js`**: Hashtag-based memory groupings
- **`src/hooks/useLocalStorage.js`**: Local storage management with memory limits for demo mode
- **`src/hooks/useMemoryConnections.js`**: Memory connection management for Conspiracy Board
- **`src/hooks/useSimplifyView.js`**: Simplified view toggle and title formatting

### Shared Components
- **`src/components/shared/MemoryModal.jsx`**: Create/edit memory modal
- **`src/components/shared/MemoryCard.jsx`**: Reusable memory card display
- **`src/components/shared/AdvancedSearch.jsx`**: Multi-criteria search interface
- **`src/components/shared/StorageIndicator.jsx`**: Storage usage display for demo mode

### Utilities
- **`src/utils/generateId.js`**: ID generation utilities with string consistency
- **`src/utils/migrateData.js`**: Migrates localStorage data to Firebase on login
- **`src/utils/migrateIds.js`**: One-time ID migration for legacy data
- **`src/utils/idUtils.js`**: ID normalization and comparison utilities
- **`src/utils/opacityCalculations.js`**: Opacity fade calculations for Conspiracy Board

## How Components Work Together

### Component Hierarchy
```
App (authentication + routing)
├── Navigation (auth status + sign out)
├── ConspiracyBoard (route: /)
│   ├── Sidebar (memory list with filters)
│   ├── Canvas (infinite panning workspace)
│   ├── Connections (visual links between memories)
│   ├── ConstellationSidebar (hashtag groups)
│   └── MemoryModal (create/edit)
├── Archive (route: /archive)
│   ├── ArchiveMemoryCard (masonry grid items)
│   ├── LibrarySidebar (drag-and-drop to collections)
│   ├── AdvancedSearch (multi-criteria filtering)
│   └── MemoryModal (create/edit)
├── Chronology (route: /chronology)
│   ├── Timeline (drag-and-drop ordering)
│   └── Sidebar (unplaced memories)
└── Libraries (route: /libraries)
    └── LibraryCard (collection display)
```

### State Flow Between Components

1. **App.jsx** fetches memories via `useMemories(user.uid)` and passes them down to all views
2. Each view maintains its own UI state but shares the same memory data
3. Changes to memories (add/update/delete) propagate via the shared `useMemories` hook
4. View-specific state (positions, connections, chronology order) is stored separately in Firebase

## Data Flow

### Authentication & Storage Strategy
```
User Login State (useAuth)
    ↓
┌─────────────────┬──────────────────┐
│   Authenticated │  Unauthenticated │
│    (Firebase)   │  (localStorage)  │
└─────────────────┴──────────────────┘
```

### Authenticated Flow (Firebase)
1. User logs in via Firebase Auth
2. `useMemories` subscribes to `/users/{userId}/memories` collection
3. All CRUD operations write to Firebase with real-time sync
4. View-specific state saved to separate documents:
   - Board state: `/users/{userId}/boardState/current`
   - Chronology: `/users/{userId}/chronologyState/current`
   - Libraries: `/users/{userId}/libraries/{libraryId}`

### Unauthenticated Flow (Demo Mode)
1. `useMemories` falls back to `useLocalStorage`
2. Memories stored in browser localStorage (max 100 memories)
3. On login, `migrateLocalStorageToFirestore` transfers data to Firebase
4. View state lost on browser clear (intentional demo limitation)

### Memory CRUD Flow
```
User Action (UI)
    ↓
Component calls addMemory/updateMemory/deleteMemory
    ↓
useMemories hook
    ↓
┌────────────────────────┬─────────────────────┐
│ Firebase (authenticated)│ localStorage (demo) │
└────────────────────────┴─────────────────────┘
    ↓
Real-time update via onSnapshot (Firebase) or setState (localStorage)
    ↓
All components receive updated memories array
```

### Key Data Patterns

**Memory Object Structure:**
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

**Board State Structure:**
```javascript
{
  pins: {
    [memoryId]: { x: number, y: number }
  },
  standalonePins: {
    [pinId]: { x: number, y: number, text: string, color: string }
  },
  connections: [
    { id: string, source: string, target: string, insight: string }
  ]
}
```

**Chronology State Structure:**
```javascript
{
  positions: {
    timelineIds: string[],    // Ordered memory IDs on timeline
    sidebarIds: string[],     // Memory IDs in sidebar
    lastUpdated: ISO timestamp
  }
}
```

## Key Features

### Hashtag System
- Hashtags auto-extracted from memory content (text starting with #)
- Used to create "Constellations" (auto-grouped memories)
- Click hashtag to filter views to related memories
- Right-click hashtag for quick actions (view as board, etc.)

### Drag-and-Drop
- **Conspiracy Board**: Memories can be positioned anywhere on infinite canvas
- **Chronology**: Memories dragged onto timeline in chronological order
- **Archive**: Memories dragged into libraries for organization

### Search & Filtering
- Basic search: Title, content, and hashtag text matching
- Advanced search: Multi-criteria with AND/OR logic
- Search results can be saved as Libraries

### Offline Support
- Demo mode works entirely offline with localStorage
- Authenticated users require internet for Firebase sync
- State persisted across page refreshes

## Technology Stack

- **React 19**: UI framework
- **Firebase**: Authentication + Firestore database
- **Vite**: Build tool and dev server
- **React Router**: Client-side routing
- **@dnd-kit**: Drag-and-drop functionality
- **Lucide React**: Icon library
- **React Masonry CSS**: Masonry grid layout
- **keyword-extractor/rake-js**: Keyword extraction for search
