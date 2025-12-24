import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  getDoc,
  serverTimestamp,
  query,
  where,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Hook to manage shared boards
 * - createShare: Create a new shared board from current board state
 * - useSharedBoard: Subscribe to a shared board by ID
 * - updateSharedBoard: Update a shared board's content
 */

// Generate a random share ID
const generateShareId = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Hook to list shared boards created by a user
 */
export const useSharedBoards = (userId) => {
  const [sharedBoards, setSharedBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) {
      setSharedBoards([]);
      setLoading(false);
      return;
    }

    const sharedBoardsRef = collection(db, 'sharedBoards');
    const q = query(
      sharedBoardsRef,
      where('sharedBy.userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const boards = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setSharedBoards(boards);
        setLoading(false);
        setError(null);
      },
      (error) => {
        console.error('Error fetching shared boards:', error);
        setError(error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  /**
   * Create a new shared board
   * @param {Object} boardState - Current board state (droppedMemories, connections, standalonePins)
   * @param {string} recipientName - Name of the person being shared with
   * @param {Object} user - Current user object
   * @param {Object} profile - Current user's profile (for firstName)
   * @param {string} boardName - Name of the board being shared
   * @returns {string} The share ID
   */
  const createShare = useCallback(async (boardState, recipientName, user, profile, boardName = 'Shared Board') => {
    if (!user?.uid) {
      throw new Error('Must be logged in to share a board');
    }

    const shareId = generateShareId();
    const sharedBoardRef = doc(db, 'sharedBoards', shareId);

    const shareData = {
      name: boardName,
      sharedBy: {
        userId: user.uid,
        firstName: profile?.firstName || 'Someone'
      },
      sharedWith: {
        name: recipientName || 'you'
      },
      memoryCount: boardState.droppedMemories?.length || 0,
      droppedMemories: boardState.droppedMemories || [],
      connections: boardState.connections || [],
      standalonePins: boardState.standalonePins || [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(sharedBoardRef, shareData);
    return shareId;
  }, []);

  return {
    sharedBoards,
    loading,
    error,
    createShare
  };
};

/**
 * Hook to subscribe to a single shared board by ID
 */
export const useSharedBoard = (shareId) => {
  const [sharedBoard, setSharedBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!shareId) {
      setSharedBoard(null);
      setLoading(false);
      return;
    }

    const sharedBoardRef = doc(db, 'sharedBoards', shareId);

    const unsubscribe = onSnapshot(
      sharedBoardRef,
      (doc) => {
        if (doc.exists()) {
          setSharedBoard({
            id: doc.id,
            ...doc.data()
          });
          setError(null);
        } else {
          setSharedBoard(null);
          setError('Shared board not found');
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching shared board:', error);
        setError(error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [shareId]);

  /**
   * Update the shared board's content
   */
  const updateSharedBoard = useCallback(async (updates) => {
    if (!shareId) return;

    try {
      const sharedBoardRef = doc(db, 'sharedBoards', shareId);
      await setDoc(sharedBoardRef, {
        ...updates,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error('Error updating shared board:', error);
      throw error;
    }
  }, [shareId]);

  return {
    sharedBoard,
    loading,
    error,
    updateSharedBoard
  };
};

export default useSharedBoards;
