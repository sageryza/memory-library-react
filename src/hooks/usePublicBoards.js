import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase';

export const usePublicBoards = () => {
  const [publicBoards, setPublicBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch all public boards
  useEffect(() => {
    const boardsRef = collection(db, 'publicBoards');
    const q = query(boardsRef, orderBy('createdAt', 'desc'), limit(50));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const boards = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setPublicBoards(boards);
        setLoading(false);
        setError(null);
      },
      (error) => {
        console.error('Error fetching public boards:', error);
        setError(error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Create a new public board
  const createPublicBoard = async (title, userId) => {
    if (!title) return null;

    try {
      const docRef = await addDoc(collection(db, 'publicBoards'), {
        title,
        createdBy: userId || 'anonymous',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        memoryCount: 0,
        connectionCount: 0
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating public board:', error);
      throw error;
    }
  };

  // Delete a public board (only by creator)
  const deletePublicBoard = async (boardId, userId) => {
    if (!boardId) return;

    try {
      // Check if user is the creator
      const boardRef = doc(db, 'publicBoards', boardId);
      const boardSnap = await getDoc(boardRef);

      if (boardSnap.exists() && boardSnap.data().createdBy === userId) {
        await deleteDoc(boardRef);
      } else {
        throw new Error('Only the board creator can delete it');
      }
    } catch (error) {
      console.error('Error deleting public board:', error);
      throw error;
    }
  };

  return {
    publicBoards,
    loading,
    error,
    createPublicBoard,
    deletePublicBoard
  };
};

// Hook for managing a specific public board's data
export const usePublicBoard = (boardId) => {
  const [boardData, setBoardData] = useState(null);
  const [memories, setMemories] = useState([]);
  const [connections, setConnections] = useState([]);
  const [standalonePins, setStandalonePins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Subscribe to board metadata
  useEffect(() => {
    if (!boardId) {
      setLoading(false);
      return;
    }

    const boardRef = doc(db, 'publicBoards', boardId);
    const unsubscribe = onSnapshot(
      boardRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setBoardData({
            id: snapshot.id,
            ...snapshot.data()
          });
        } else {
          setBoardData(null);
        }
        setError(null);
      },
      (error) => {
        console.error('Error fetching board data:', error);
        setError(error.message);
      }
    );

    return () => unsubscribe();
  }, [boardId]);

  // Subscribe to board memories
  useEffect(() => {
    if (!boardId) return;

    const memoriesRef = collection(db, 'publicBoards', boardId, 'memories');
    const q = query(memoriesRef, orderBy('addedAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const mems = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMemories(mems);
        setLoading(false);
        setError(null);
      },
      (error) => {
        console.error('Error fetching board memories:', error);
        setError(error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [boardId]);

  // Subscribe to board connections
  useEffect(() => {
    if (!boardId) return;

    const connectionsRef = collection(db, 'publicBoards', boardId, 'connections');

    const unsubscribe = onSnapshot(
      connectionsRef,
      (snapshot) => {
        const conns = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setConnections(conns);
        setError(null);
      },
      (error) => {
        console.error('Error fetching board connections:', error);
        setError(error.message);
      }
    );

    return () => unsubscribe();
  }, [boardId]);

  // Subscribe to standalone pins
  useEffect(() => {
    if (!boardId) return;

    const pinsRef = collection(db, 'publicBoards', boardId, 'pins');

    const unsubscribe = onSnapshot(
      pinsRef,
      (snapshot) => {
        const pins = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setStandalonePins(pins);
        setError(null);
      },
      (error) => {
        console.error('Error fetching board pins:', error);
        setError(error.message);
      }
    );

    return () => unsubscribe();
  }, [boardId]);

  // Add memory to public board (from user's archive)
  const addMemoryToBoard = async (memory, position, userId) => {
    if (!boardId || !memory) return;

    try {
      // Add the memory with its position
      const memoryData = {
        ...memory,
        x: position?.x || 100,
        y: position?.y || 100,
        originalOwnerId: userId || 'anonymous',
        addedBy: userId || 'anonymous',
        addedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'publicBoards', boardId, 'memories', memory.id), memoryData);

      // Update memory count
      const boardRef = doc(db, 'publicBoards', boardId);
      await updateDoc(boardRef, {
        memoryCount: memories.length + 1,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error adding memory to board:', error);
      throw error;
    }
  };

  // Update memory position
  const updateMemoryPosition = async (memoryId, position) => {
    if (!boardId || !memoryId) return;

    try {
      const memoryRef = doc(db, 'publicBoards', boardId, 'memories', memoryId);
      await updateDoc(memoryRef, {
        x: position.x,
        y: position.y
      });
    } catch (error) {
      console.error('Error updating memory position:', error);
      throw error;
    }
  };

  // Remove memory from board
  const removeMemoryFromBoard = async (memoryId) => {
    if (!boardId || !memoryId) return;

    try {
      await deleteDoc(doc(db, 'publicBoards', boardId, 'memories', memoryId));

      // Update memory count
      const boardRef = doc(db, 'publicBoards', boardId);
      await updateDoc(boardRef, {
        memoryCount: Math.max(0, memories.length - 1),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error removing memory from board:', error);
      throw error;
    }
  };

  // Add connection between memories
  const addConnection = async (fromId, toId, userId) => {
    if (!boardId || !fromId || !toId) return;

    try {
      const connectionData = {
        from: fromId,
        to: toId,
        createdBy: userId || 'anonymous',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'publicBoards', boardId, 'connections'), connectionData);

      // Update connection count
      const boardRef = doc(db, 'publicBoards', boardId);
      await updateDoc(boardRef, {
        connectionCount: connections.length + 1,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error adding connection:', error);
      throw error;
    }
  };

  // Remove connection
  const removeConnection = async (connectionId) => {
    if (!boardId || !connectionId) return;

    try {
      await deleteDoc(doc(db, 'publicBoards', boardId, 'connections', connectionId));

      // Update connection count
      const boardRef = doc(db, 'publicBoards', boardId);
      await updateDoc(boardRef, {
        connectionCount: Math.max(0, connections.length - 1),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error removing connection:', error);
      throw error;
    }
  };

  // Add standalone pin
  const addStandalonePin = async (position, userId) => {
    if (!boardId) return;

    try {
      const pinData = {
        x: position.x,
        y: position.y,
        createdBy: userId || 'anonymous',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'publicBoards', boardId, 'pins'), pinData);
    } catch (error) {
      console.error('Error adding standalone pin:', error);
      throw error;
    }
  };

  // Remove standalone pin
  const removeStandalonePin = async (pinId) => {
    if (!boardId || !pinId) return;

    try {
      await deleteDoc(doc(db, 'publicBoards', boardId, 'pins', pinId));
    } catch (error) {
      console.error('Error removing pin:', error);
      throw error;
    }
  };

  return {
    boardData,
    memories,
    connections,
    standalonePins,
    loading,
    error,
    addMemoryToBoard,
    updateMemoryPosition,
    removeMemoryFromBoard,
    addConnection,
    removeConnection,
    addStandalonePin,
    removeStandalonePin
  };
};

export default usePublicBoards;