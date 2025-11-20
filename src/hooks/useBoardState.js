import { useState, useEffect } from 'react';
import {
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import useLocalStorage from './useLocalStorage';

export const useBoardState = (userId, authLoading = false) => {
  // Initialize pan offset from sessionStorage to prevent flash on reload
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

  // Use localStorage when not authenticated
  const localStorage = useLocalStorage();
  const isUsingLocalStorage = !userId && !authLoading;  // Don't use localStorage if auth is still loading

  useEffect(() => {
    // Wait for auth to finish loading before deciding data source
    if (authLoading) {
      return;  // Don't load any data while auth is loading
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