import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase';

export const useSavedBoards = (userId) => {
  const [savedBoards, setSavedBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) {
      setSavedBoards([]);
      setLoading(false);
      return;
    }

    const boardsRef = collection(db, 'users', userId, 'boards');
    const q = query(boardsRef, orderBy('updatedAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const boards = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setSavedBoards(boards);
        setLoading(false);
        setError(null);
      },
      (error) => {
        console.error('Error fetching saved boards:', error);
        setError(error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // Save a board
  // updateTimestamp: if true, updates the updatedAt timestamp (for manual saves)
  //                  if false, doesn't update timestamp (for auto-saves to prevent re-ordering)
  const saveBoard = useCallback(async (name, boardState, updateTimestamp = true) => {
    if (!userId || !name) return;

    try {
      const boardRef = doc(db, 'users', userId, 'boards', name);
      const data = {
        name,
        droppedMemories: boardState.droppedMemories || [],
        connections: boardState.connections || [],
        standalonePins: boardState.standalonePins || []
      };

      // Only update timestamp for manual saves, not auto-saves
      if (updateTimestamp) {
        data.updatedAt = serverTimestamp();
      }

      await setDoc(boardRef, data, { merge: true });
    } catch (error) {
      console.error('Error saving board:', error);
      throw error;
    }
  }, [userId]);

  // Load a board
  const loadBoard = useCallback((boardId) => {
    const board = savedBoards.find(b => b.id === boardId);
    if (board) {
      return {
        droppedMemories: board.droppedMemories || [],
        connections: board.connections || [],
        standalonePins: board.standalonePins || []
      };
    }
    return null;
  }, [savedBoards]);

  // Delete a board
  const deleteBoard = useCallback(async (boardId) => {
    if (!userId || !boardId) return;

    try {
      const boardRef = doc(db, 'users', userId, 'boards', boardId);
      await deleteDoc(boardRef);
    } catch (error) {
      console.error('Error deleting board:', error);
      throw error;
    }
  }, [userId]);

  return {
    savedBoards,
    loading,
    error,
    saveBoard,
    loadBoard,
    deleteBoard
  };
};

export default useSavedBoards;
