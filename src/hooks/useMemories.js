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

export const useMemories = (userId) => {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Use localStorage when not authenticated
  const localStorage = useLocalStorage();
  const isUsingLocalStorage = !userId;

  useEffect(() => {
    if (!userId) {
      // Use localStorage for unauthenticated users
      setMemories(localStorage.memories || []);
      setLoading(false);
      return;
    }

    const memoriesRef = collection(db, 'users', userId, 'memories');
    const q = query(memoriesRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const memoriesData = snapshot.docs.map(doc => {
          const data = doc.data();

          // FIX: Remove any 'id' field from the data to prevent override
          const { id: dataId, ...restData } = data;

          // Now we're guaranteed to use the Firestore document ID
          return {
            id: doc.id,  // Always use the Firestore document ID
            ...restData  // Spread the rest of the data (without the id field)
          };
        });
        setMemories(memoriesData);
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
  }, [userId]);

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
      localStorage.updateMemory(memoryId, updates);
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
      const cleanMemoryId = String(memoryId).trim();

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

  // Delete a memory
  const deleteMemory = useCallback(async (memoryId) => {
    // Use localStorage if not authenticated
    if (isUsingLocalStorage) {
      if (!memoryId) {
        const error = new Error('Cannot delete memory: Memory ID is required');
        console.error(error);
        throw error;
      }
      localStorage.deleteMemory(memoryId);
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
      // Convert memoryId to string as Firestore requires string IDs
      const memoryIdStr = String(memoryId);
      const memoryRef = doc(db, 'users', userId, 'memories', memoryIdStr);
      await deleteDoc(memoryRef);

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

  return {
    memories,
    loading,
    error,
    addMemory,
    updateMemory,
    deleteMemory,
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