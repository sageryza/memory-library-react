# ID Generation Guide

## Overview
This document outlines the proper ID generation patterns for the Memory Library app after migrating from localStorage to Firebase.

## ID Generation Rules

### ✅ DO Use These Patterns

1. **Firebase Documents (Preferred)**
   ```javascript
   // Let Firebase generate the ID
   const docRef = await addDoc(collection(db, 'memories'), data);
   const id = docRef.id; // "ZMfLbJUFTg5qjwCDfZ5h"
   ```

2. **Client-side Temporary IDs**
   ```javascript
   import { generateLocalId } from './utils/generateId';

   // For localStorage or temporary UI state
   const id = generateLocalId(); // "550e8400-e29b-41d4-a716-446655440000"
   ```

3. **UI Element IDs**
   ```javascript
   import { generateShortId } from './utils/generateId';

   // For React keys or temporary UI elements
   const id = generateShortId('gap'); // "gap-abc123"
   ```

### ❌ DON'T Use These Patterns

1. **Timestamp-based IDs**
   ```javascript
   // BAD - Old pattern from localStorage days
   const id = Date.now().toString(); // "1761696407790"
   ```

2. **Including IDs in Document Data**
   ```javascript
   // BAD - Causes duplicate ID issues
   await addDoc(collection(db, 'memories'), {
     id: someId, // Don't do this!
     title: "...",
     content: "..."
   });
   ```

## Where IDs Are Used

### Firestore Collections
- `memories` - Uses Firestore document IDs
- `libraries` - Uses Firestore document IDs (localStorage uses generateLocalId)
- `playgrounds` - Uses Firestore document IDs
- `playground-memories` - Uses Firestore document IDs
- `boardState` - Single document per user, no ID needed

### UI State (Not Persisted)
- Selection tracking (`selectedIds`)
- Drag & drop (`draggedMemoryIds`)
- Timeline gaps (temporary elements)
- React component keys

## Migration Status

### ✅ Completed
- Replaced `Date.now().toString()` in `useLibraries.js` with `generateLocalId()`
- Improved playground naming to use readable dates instead of timestamps
- Created `generateId.js` utility for consistent ID generation
- Fixed memory creation to exclude `id` from document data

### 🚧 Future Work
- Implement full localStorage support for memories (if keeping unauthenticated mode)
- Remove localStorage library support (if going Firebase-only)
- Clean up any remaining timestamp-based patterns in backup files

## Best Practices

1. **Always use the Firestore document ID as the single source of truth**
2. **Never store an `id` field in the document data**
3. **Pass IDs separately from data**: `updateMemory(id, data)`
4. **Use type-appropriate ID generators**:
   - Firebase operations: Let Firestore generate
   - localStorage: Use `generateLocalId()`
   - UI elements: Use `generateShortId()`

## Testing ID Generation

To verify IDs are being generated correctly:
1. Create a new library in localStorage mode
2. Check that it has a UUID-style ID, not a timestamp
3. Create a new memory in Firebase
4. Verify no `id` field exists in the document data