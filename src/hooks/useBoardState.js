import { useState, useEffect } from 'react';
import {
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import useLocalStorage from './useLocalStorage';

export const useBoardState = (userId) => {
  const [boardState, setBoardState] = useState({
    droppedMemories: [],
    connections: [],
    standalonePins: [],
    panOffset: { x: 0, y: 0 }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Use localStorage when not authenticated
  const localStorage = useLocalStorage();
  const isUsingLocalStorage = !userId;

  useEffect(() => {
    if (!userId) {
      // Use localStorage for unauthenticated users
      setBoardState(localStorage.boardState || {
        droppedMemories: [],
        connections: [],
        standalonePins: [],
        panOffset: { x: 0, y: 0 }
      });
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
            panOffset: data.panOffset || { x: 0, y: 0 }
          });
        } else {
          // Initialize with empty state if document doesn't exist
          setBoardState({
            droppedMemories: [],
            connections: [],
            standalonePins: [],
            panOffset: { x: 0, y: 0 }
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
  }, [userId]);

  // Update the board state
  const updateBoardState = async (newState) => {
    // Use localStorage if not authenticated
    if (isUsingLocalStorage) {
      localStorage.updateBoardState(newState);
      setBoardState(localStorage.boardState);
      return;
    }

    // Firebase path for authenticated users
    if (!userId) return;

    try {
      const boardStateRef = doc(db, 'users', userId, 'boardState', 'current');
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