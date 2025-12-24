import { useState, useEffect } from 'react';
import {
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import useLocalStorage from './useLocalStorage';

// CRITICAL: authLoading parameter prevents localStorage/Firebase confusion
// Without this, app briefly uses localStorage before auth completes
export const useBoardState = (userId, authLoading = false) => {
  // Initialize pan offset from sessionStorage for instant restoration
  // This runs before Firebase data loads, preventing visual jumps
  const getInitialPanOffset = () => {
    const savedPan = sessionStorage.getItem('boardPanOffset');
    if (savedPan) {
      try {
        return JSON.parse(savedPan);
      } catch (e) {
        console.warn('Failed to parse saved pan offset in useBoardState:', e);
      }
    }
    return { x: 0, y: 0 };
  };

  const [boardState, setBoardState] = useState({
    droppedMemories: [],
    connections: [],
    standalonePins: [],
    panOffset: getInitialPanOffset()
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Determine data source based on auth state
  const localStorage = useLocalStorage();
  // CRITICAL: Check authLoading to prevent premature localStorage usage
  const isUsingLocalStorage = !userId && !authLoading;

  useEffect(() => {
    // CRITICAL: Wait for auth to resolve before choosing data source
    // This prevents the "flash of wrong data" issue
    if (authLoading) {
      return;  // Exit early - don't load ANY data while auth is determining state
    }

    if (!userId) {
      // Use localStorage for unauthenticated users
      const localBoardState = localStorage.boardState || {
        droppedMemories: [],
        connections: [],
        standalonePins: [],
        panOffset: getInitialPanOffset()
      };
      setBoardState(localBoardState);
      setLoading(false);
      return;
    }

    const boardStateRef = doc(db, 'users', userId, 'boardState', 'current');

    const unsubscribe = onSnapshot(
      boardStateRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setBoardState({
            droppedMemories: data.droppedMemories || [],
            connections: data.connections || [],
            standalonePins: data.standalonePins || [],
            panOffset: data.panOffset || getInitialPanOffset()
          });
        } else {
          // Initialize with empty state if document doesn't exist
          setBoardState({
            droppedMemories: [],
            connections: [],
            standalonePins: [],
            panOffset: getInitialPanOffset()
          });
        }
        setLoading(false);
        setError(null);
      },
      (error) => {
        console.error('Error fetching board state:', error);
        setError(error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId, authLoading, localStorage.boardState]);

  // Update the board state
  const updateBoardState = async (newState) => {
    // Use localStorage if not authenticated
    if (isUsingLocalStorage) {
      localStorage.updateBoardState(newState);
      setBoardState(newState); // Use newState directly instead of reading stale localStorage.boardState
      return;
    }

    // Firebase path for authenticated users
    if (!userId) return;

    try {
      // Optimistic update - update local state immediately for responsive UI
      setBoardState(newState);

      const boardStateRef = doc(db, 'users', userId, 'boardState', 'current');
      console.log('✅ Saved to Firebase - panOffset:', newState.panOffset);
      await setDoc(boardStateRef, {
        ...newState,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating board state:', error);
      throw error;
    }
  };

  return {
    boardState,
    loading,
    error,
    updateBoardState
  };
};

export default useBoardState;