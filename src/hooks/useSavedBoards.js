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

        // Add client-side sort for stable ordering (secondary sort by name to break ties)
        boards.sort((a, b) => {
          // First sort by updatedAt (newest first)
          const timeA = a.updatedAt?.toMillis?.() || 0;
          const timeB = b.updatedAt?.toMillis?.() || 0;
          if (timeB !== timeA) {
            return timeB - timeA;
          }
          // If timestamps are equal, sort alphabetically by name for stability
          return (a.name || '').localeCompare(b.name || '');
        });

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

  // Rename a board (creates new doc with new name, copies data, deletes old)
  const renameBoard = useCallback(async (oldName, newName) => {
    if (!userId || !oldName || !newName || oldName === newName) return;

    try {
      // Get the old board data
      const oldBoard = savedBoards.find(b => b.id === oldName);
      if (!oldBoard) {
        throw new Error('Board not found');
      }

      // Create new board with new name
      const newBoardRef = doc(db, 'users', userId, 'boards', newName);
      await setDoc(newBoardRef, {
        name: newName,
        droppedMemories: oldBoard.droppedMemories || [],
        connections: oldBoard.connections || [],
        standalonePins: oldBoard.standalonePins || [],
        updatedAt: serverTimestamp()
      });

      // Delete the old board
      const oldBoardRef = doc(db, 'users', userId, 'boards', oldName);
      await deleteDoc(oldBoardRef);

      return newName;
    } catch (error) {
      console.error('Error renaming board:', error);
      throw error;
    }
  }, [userId, savedBoards]);

  return {
    savedBoards,
    loading,
    error,
    saveBoard,
    loadBoard,
    deleteBoard,
    renameBoard
  };
};

export default useSavedBoards;
