// TODO: Review Testing Coverage for Recent Bug Fixes
// Context: Fixed at least 3 major bugs around Nov 9-11
// Tasks:
// - Document what bugs were fixed
// - Identify edge cases that might not be tested
// - Look for patterns in what broke (e.g., ID type issues, localStorage dependencies)
// - Ensure similar issues won't reoccur
// - Consider adding tests for critical paths
// See TODO.md for systematic issues found (timestamp inconsistency, localStorage deps, etc.)

import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import useLocalStorage from './useLocalStorage';
import { ensureStringId } from '../utils/generateId';
import { enrichXiMemory } from '../xi/xiMemory';

// CRITICAL: authLoading parameter prevents data source confusion
// Without this, app shows localStorage memories briefly before Firebase loads
export const useMemories = (userId, authLoading = false) => {
  const [memories, setMemories] = useState([]);
  const [deletedMemories, setDeletedMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Determine data source based on auth state
  const localStorage = useLocalStorage();
  // CRITICAL: Check authLoading to prevent showing wrong memories
  const isUsingLocalStorage = !userId && !authLoading;

  useEffect(() => {
    // CRITICAL: Wait for auth to resolve before loading memories
    // This prevents the "flash of different memories" issue
    if (authLoading) {
      return;  // Exit early - don't load ANY memories while auth is determining state
    }

    if (!userId) {
      // Use localStorage for unauthenticated users
      // Ensure all localStorage memory IDs are strings
      const localMemories = (localStorage.memories || []).map(mem => ({
        ...mem,
        id: ensureStringId(mem.id)
      }));
      setMemories(localMemories);
      setLoading(false);
      return;
    }

    const memoriesRef = collection(db, 'users', userId, 'memories');
    const q = query(memoriesRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const allMemoriesData = snapshot.docs.map(doc => {
          const data = doc.data();

          // FIX: Remove any 'id' field from the data to prevent override
          const { id: dataId, ...restData } = data;

          // ENSURE ID IS ALWAYS A STRING
          return enrichXiMemory({
            id: ensureStringId(doc.id),  // Always use the Firestore document ID as a string
            ...restData  // Spread the rest of the data (without the id field)
          });
        });

        // Separate active and deleted memories
        const active = allMemoriesData.filter(m => !m.deletedAt);
        const deleted = allMemoriesData.filter(m => m.deletedAt);

        setMemories(active);
        setDeletedMemories(deleted);
        setLoading(false);
        setError(null);
      },
      (error) => {
        console.error('Error fetching memories:', error);
        setError(error.message);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [userId, authLoading, localStorage.memories]);

  // Add a new memory
  const addMemory = useCallback(async (memoryData) => {
    // Use localStorage if not authenticated
    if (isUsingLocalStorage) {
      const result = localStorage.addMemory(memoryData);
      if (!result.success) {
        // Handle limit reached
        if (result.error === 'LIMIT_REACHED') {
          const shouldSignUp = window.confirm(result.message + '\n\nWould you like to sign up now?');
          if (shouldSignUp) {
            // Trigger sign up flow (could emit an event or navigate)
            window.location.href = '/login?action=signup';
          }
        }
        throw new Error(result.message);
      }
      // Update local state
      setMemories(localStorage.memories);
      return result.id;
    }

    // Firebase path for authenticated users
    if (!userId) return null;

    try {
      // Remove any 'id' field to prevent duplicate IDs in document data
      const { id, ...dataWithoutId } = memoryData || {};

      const memoriesRef = collection(db, 'users', userId, 'memories');
      const docRef = await addDoc(memoriesRef, {
        ...dataWithoutId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return docRef.id;
    } catch (error) {
      console.error('Error adding memory:', error);
      throw error;
    }
  }, [userId, isUsingLocalStorage, localStorage]);

  // Update an existing memory
  const updateMemory = useCallback(async (memoryId, updates) => {
    // Use localStorage if not authenticated
    if (isUsingLocalStorage) {
      if (!memoryId) {
        console.error('Missing memoryId');
        return;
      }
      // Ensure memoryId is a string
      const normalizedId = ensureStringId(memoryId);
      localStorage.updateMemory(normalizedId, updates);
      setMemories(localStorage.memories);
      return;
    }

    // Firebase path for authenticated users
    if (!userId || !memoryId) {
      console.error('Missing userId or memoryId:', { userId, memoryId });
      return;
    }

    try {
      // Ensure memoryId is a string and valid
      const cleanMemoryId = ensureStringId(memoryId).trim();

      // Filter out any undefined or null values from updates, and never include 'id'
      const cleanUpdates = {};
      for (const [key, value] of Object.entries(updates)) {
        // Skip the 'id' field entirely to prevent duplicate IDs in document data
        if (key === 'id') continue;

        if (value !== undefined && value !== null) {
          cleanUpdates[key] = value;
        }
      }

      const memoryRef = doc(db, 'users', userId, 'memories', cleanMemoryId);

      // Check if the document exists first
      const docSnap = await getDoc(memoryRef);
      if (!docSnap.exists()) {
        throw new Error(`Memory with ID ${cleanMemoryId} not found in database`);
      }

      // Only add updatedAt if we have other updates
      if (Object.keys(cleanUpdates).length > 0) {
        await updateDoc(memoryRef, {
          ...cleanUpdates,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error updating memory:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        memoryId,
        userId
      });
      throw error;
    }
  }, [userId, isUsingLocalStorage, localStorage]);

  // Soft delete a memory (moves to trash)
  const deleteMemory = useCallback(async (memoryId) => {
    // Use localStorage if not authenticated
    if (isUsingLocalStorage) {
      if (!memoryId) {
        const error = new Error('Cannot delete memory: Memory ID is required');
        console.error(error);
        throw error;
      }
      // Ensure memoryId is a string
      const normalizedId = ensureStringId(memoryId);
      localStorage.deleteMemory(normalizedId);
      setMemories(localStorage.memories);
      return;
    }

    // Firebase path for authenticated users
    if (!userId) {
      const error = new Error('Cannot delete memory: User not authenticated');
      console.error(error);
      throw error;
    }
    if (!memoryId) {
      const error = new Error('Cannot delete memory: Memory ID is required');
      console.error(error);
      throw error;
    }

    try {
      // Ensure memoryId is a string as Firestore requires string IDs
      const memoryIdStr = ensureStringId(memoryId);
      const memoryRef = doc(db, 'users', userId, 'memories', memoryIdStr);

      // Soft delete: Set deletedAt timestamp instead of actually deleting
      // NOTE: x, y, isOnCanvas are runtime/boardState properties - never save them to Firebase
      await updateDoc(memoryRef, {
        deletedAt: serverTimestamp()
      });

      // Also remove the memory from chronology state
      try {
        const chronologyRef = doc(db, 'users', userId, 'chronologyState', 'current');
        const chronologySnap = await getDoc(chronologyRef);

        if (chronologySnap.exists()) {
          const chronologyData = chronologySnap.data();
          const positions = chronologyData.positions || {};

          // Remove the memory ID from both timeline and sidebar arrays
          const updatedTimelineIds = (positions.timelineIds || []).filter(id => id !== memoryIdStr);
          const updatedSidebarIds = (positions.sidebarIds || []).filter(id => id !== memoryIdStr);

          // Update chronology state with cleaned arrays
          await setDoc(chronologyRef, {
            ...chronologyData,
            positions: {
              ...positions,
              timelineIds: updatedTimelineIds,
              sidebarIds: updatedSidebarIds,
              lastUpdated: new Date().toISOString(),
              version: (positions.version || 0) + 1
            },
            updatedAt: serverTimestamp()
          });
        }
      } catch (chronologyError) {
        // Log but don't throw - memory deletion should succeed even if chronology update fails
        console.error('Error updating chronology state after memory deletion:', chronologyError);
      }
    } catch (error) {
      console.error('Error deleting memory:', error);
      throw error;
    }
  }, [userId, isUsingLocalStorage, localStorage]);

  // Restore a deleted memory
  const restoreMemory = useCallback(async (memoryId) => {
    if (!userId || !memoryId) {
      console.error('Missing userId or memoryId:', { userId, memoryId });
      return;
    }

    try {
      const memoryIdStr = ensureStringId(memoryId);
      const memoryRef = doc(db, 'users', userId, 'memories', memoryIdStr);

      // Remove deletedAt field to restore
      await updateDoc(memoryRef, {
        deletedAt: null
      });
    } catch (error) {
      console.error('Error restoring memory:', error);
      throw error;
    }
  }, [userId]);

  // Permanently delete a memory (cannot be undone)
  const permanentlyDeleteMemory = useCallback(async (memoryId) => {
    if (!userId || !memoryId) {
      console.error('Missing userId or memoryId:', { userId, memoryId });
      return;
    }

    try {
      const memoryIdStr = ensureStringId(memoryId);
      const memoryRef = doc(db, 'users', userId, 'memories', memoryIdStr);
      await deleteDoc(memoryRef);

      // Also remove from chronology
      try {
        const chronologyRef = doc(db, 'users', userId, 'chronologyState', 'current');
        const chronologySnap = await getDoc(chronologyRef);

        if (chronologySnap.exists()) {
          const chronologyData = chronologySnap.data();
          const positions = chronologyData.positions || {};

          const updatedTimelineIds = (positions.timelineIds || []).filter(id => id !== memoryIdStr);
          const updatedSidebarIds = (positions.sidebarIds || []).filter(id => id !== memoryIdStr);

          await setDoc(chronologyRef, {
            ...chronologyData,
            positions: {
              ...positions,
              timelineIds: updatedTimelineIds,
              sidebarIds: updatedSidebarIds,
              lastUpdated: new Date().toISOString(),
              version: (positions.version || 0) + 1
            },
            updatedAt: serverTimestamp()
          });
        }
      } catch (chronologyError) {
        console.error('Error updating chronology after permanent delete:', chronologyError);
      }
    } catch (error) {
      console.error('Error permanently deleting memory:', error);
      throw error;
    }
  }, [userId]);

  // Empty trash (permanently delete all deleted memories)
  const emptyTrash = useCallback(async () => {
    if (!userId) {
      console.error('Cannot empty trash: User not authenticated');
      return;
    }

    try {
      // Delete all memories that have deletedAt set
      const deletePromises = deletedMemories.map(memory =>
        permanentlyDeleteMemory(memory.id)
      );
      await Promise.all(deletePromises);
    } catch (error) {
      console.error('Error emptying trash:', error);
      throw error;
    }
  }, [userId, deletedMemories, permanentlyDeleteMemory]);

  return {
    memories,
    deletedMemories,
    loading,
    error,
    addMemory,
    updateMemory,
    deleteMemory,
    restoreMemory,
    permanentlyDeleteMemory,
    emptyTrash,
    // localStorage-specific info
    isUsingLocalStorage,
    ...(isUsingLocalStorage ? {
      memoryCount: localStorage.memories.length,
      maxMemories: localStorage.MAX_MEMORIES,
      isApproachingLimit: localStorage.isApproachingLimit,
      hasReachedLimit: localStorage.hasReachedLimit,
      storageInfo: localStorage.estimateStorageUsage()
    } : {})
  };
};

export default useMemories;