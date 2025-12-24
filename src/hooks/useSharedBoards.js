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

  /**
   * Record that the recipient viewed the shared board
   */
  const recordView = useCallback(async () => {
    if (!shareId) return;

    try {
      const sharedBoardRef = doc(db, 'sharedBoards', shareId);
      const docSnap = await getDoc(sharedBoardRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const updates = {
          lastViewedAt: serverTimestamp(),
          viewCount: (data.viewCount || 0) + 1
        };

        // Only set firstViewedAt if it hasn't been set yet
        if (!data.firstViewedAt) {
          updates.firstViewedAt = serverTimestamp();
        }

        await setDoc(sharedBoardRef, updates, { merge: true });
      }
    } catch (error) {
      console.error('Error recording view:', error);
    }
  }, [shareId]);

  /**
   * Record that a specific memory was viewed
   */
  const recordMemoryView = useCallback(async (memoryId, memoryTitle) => {
    if (!shareId || !memoryId) return;

    try {
      const sharedBoardRef = doc(db, 'sharedBoards', shareId);
      const docSnap = await getDoc(sharedBoardRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const activityLog = data.activityLog || [];

        // Add to activity log
        activityLog.push({
          type: 'memory_view',
          memoryId,
          memoryTitle: memoryTitle || 'Untitled',
          timestamp: new Date().toISOString()
        });

        // Keep only last 100 activities
        const trimmedLog = activityLog.slice(-100);

        await setDoc(sharedBoardRef, {
          activityLog: trimmedLog,
          lastActivityAt: serverTimestamp()
        }, { merge: true });
      }
    } catch (error) {
      console.error('Error recording memory view:', error);
    }
  }, [shareId]);

  /**
   * Record an action (connection made, pin added, etc.)
   */
  const recordAction = useCallback(async (actionType, details = {}) => {
    if (!shareId) return;

    try {
      const sharedBoardRef = doc(db, 'sharedBoards', shareId);
      const docSnap = await getDoc(sharedBoardRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const activityLog = data.activityLog || [];

        // Add to activity log
        activityLog.push({
          type: actionType,
          ...details,
          timestamp: new Date().toISOString()
        });

        // Keep only last 100 activities
        const trimmedLog = activityLog.slice(-100);

        await setDoc(sharedBoardRef, {
          activityLog: trimmedLog,
          lastActivityAt: serverTimestamp()
        }, { merge: true });
      }
    } catch (error) {
      console.error('Error recording action:', error);
    }
  }, [shareId]);

  return {
    sharedBoard,
    loading,
    error,
    updateSharedBoard,
    recordView,
    recordMemoryView,
    recordAction
  };
};

export default useSharedBoards;
