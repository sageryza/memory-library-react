import { useState, useEffect } from 'react';
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
  // TODO: Investigate false error popups when board saves successfully
  // Sometimes this function succeeds but triggers error handling in ConspiracyBoard.jsx
  // Possible issues:
  // - serverTimestamp() timing issue?
  // - Promise resolution timing?
  // - Network/Firebase timeout false positive?
  const saveBoard = async (name, boardState) => {
    if (!userId || !name) return;

    try {
      const boardRef = doc(db, 'users', userId, 'boards', name);
      await setDoc(boardRef, {
        name,
        droppedMemories: boardState.droppedMemories || [],
        connections: boardState.connections || [],
        standalonePins: boardState.standalonePins || [],
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error saving board:', error);
      throw error;
    }
  };

  // Load a board
  const loadBoard = (boardId) => {
    const board = savedBoards.find(b => b.id === boardId);
    if (board) {
      return {
        droppedMemories: board.droppedMemories || [],
        connections: board.connections || [],
        standalonePins: board.standalonePins || []
      };
    }
    return null;
  };

  // Delete a board
  const deleteBoard = async (boardId) => {
    if (!userId || !boardId) return;

    try {
      const boardRef = doc(db, 'users', userId, 'boards', boardId);
      await deleteDoc(boardRef);
    } catch (error) {
      console.error('Error deleting board:', error);
      throw error;
    }
  };

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
