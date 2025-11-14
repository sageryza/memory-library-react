# Public Boards Setup Guide

## Overview
Public boards allow users to create collaborative memory spaces where anyone can add memories and create connections. This creates a collective memory library experience.

## Features Added
- **Public Board Discovery**: Browse all public boards
- **Create Public Boards**: Anyone can create a new public board
- **Add Memories**: Users can add their own memories to any public board
- **Create Connections**: Anyone can draw connections between memories
- **Collective Editing**: True collaborative experience - no ownership restrictions

## Firebase Setup

### Deploy Firestore Security Rules
To enable public boards, you need to deploy the updated security rules to Firebase:

```bash
# Install Firebase CLI if you haven't already
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project directory
firebase init firestore

# Deploy the security rules
firebase deploy --only firestore:rules
```

### Firestore Structure
```
publicBoards/
├── {boardId}/
│   ├── title: string
│   ├── createdBy: userId or "anonymous"
│   ├── createdAt: timestamp
│   ├── updatedAt: timestamp
│   ├── memoryCount: number
│   ├── connectionCount: number
│   │
│   ├── memories/
│   │   └── {memoryId}/
│   │       ├── ...memory data
│   │       ├── x: number
│   │       ├── y: number
│   │       ├── originalOwnerId: userId
│   │       └── addedAt: timestamp
│   │
│   ├── connections/
│   │   └── {connectionId}/
│   │       ├── from: memoryId
│   │       ├── to: memoryId
│   │       └── createdAt: timestamp
│   │
│   └── pins/
│       └── {pinId}/
│           ├── x: number
│           ├── y: number
│           └── createdAt: timestamp
```

## Components Created

1. **usePublicBoards.js**: Hook for managing public boards data
2. **PublicBoardsContainer.jsx**: Main container handling navigation
3. **PublicBoardsDiscovery.jsx**: Browse and create public boards
4. **PublicBoard.jsx**: Interactive board canvas for collaboration

## Usage

### Creating a Public Board
1. Navigate to "Public Boards" in the navigation
2. Click "Create New Board"
3. Enter a title for your board
4. Start adding memories and making connections

### Adding Memories to Public Boards
1. Open a public board
2. Click "Add to Board" in the sidebar
3. Select memories from your archive to add
4. Drag them to position on the canvas

### Creating Connections
1. Click on a memory's pin
2. Click on another memory's pin
3. A connection line will be drawn between them

## Privacy Considerations
- All public boards are visible to everyone
- Memories added to public boards become part of the collective
- Focus is on the content, not individual attribution
- Consider implementing anonymous posting options in the future

## Next Steps
- Add search/filter for discovering boards
- Implement "Card of the Day" daily prompts
- Add option to post memories anonymously
- Create themed boards for specific topics
- Add real-time collaboration indicators