import { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebase';
import { generateRandomPosition } from '../utils/playgroundUtils';
import { generatePlaygroundHashtag } from '../utils/inlineParsingUtils';

export const usePlaygrounds = (userId) => {
  const [playgrounds, setPlaygrounds] = useState([]);
  const [playgroundMemories, setPlaygroundMemories] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Listen to playgrounds
  useEffect(() => {
    if (!userId) {
      setPlaygrounds([]);
      setLoading(false);
      return;
    }

    const playgroundsRef = collection(db, 'users', userId, 'playgrounds');
    const q = query(playgroundsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const playgroundsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setPlaygrounds(playgroundsData);
        setLoading(false);
        setError(null);
      },
      (error) => {
        console.error('Error fetching playgrounds:', error);
        setError(error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // Create a new playground
  const createPlayground = async (playgroundData) => {
    if (!userId) return null;

    try {
      const playgroundsRef = collection(db, 'users', userId, 'playgrounds');
      // Generate a more readable default name
      const dateStr = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const docRef = await addDoc(playgroundsRef, {
        name: playgroundData.name || `Playground - ${dateStr}`,
        centralHashtag: playgroundData.centralHashtag || null,
        description: playgroundData.description || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        userId
      });

      return {
        id: docRef.id,
        ...playgroundData,
        userId
      };
    } catch (error) {
      console.error('Error creating playground:', error);
      throw error;
    }
  };

  // Update playground
  const updatePlayground = async (playgroundId, updates) => {
    if (!userId || !playgroundId) return;

    try {
      const playgroundRef = doc(db, 'users', userId, 'playgrounds', playgroundId);
      await updateDoc(playgroundRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating playground:', error);
      throw error;
    }
  };

  // Delete playground and all its memories
  const deletePlayground = async (playgroundId) => {
    if (!userId || !playgroundId) return;

    try {
      // Delete all memories in this playground first
      const memoriesRef = collection(db, 'users', userId, 'playground-memories');
      const q = query(memoriesRef, where('playgroundId', '==', playgroundId));
      const snapshot = await getDocs(q);

      const deletePromises = snapshot.docs.map(docSnap =>
        deleteDoc(doc(db, 'users', userId, 'playground-memories', docSnap.id))
      );
      await Promise.all(deletePromises);

      // Then delete the playground itself
      const playgroundRef = doc(db, 'users', userId, 'playgrounds', playgroundId);
      await deleteDoc(playgroundRef);

      return true;
    } catch (error) {
      console.error('Error deleting playground:', error);
      throw error;
    }
  };

  // Get memories for a specific playground
  const getPlaygroundMemories = (playgroundId, callback) => {
    if (!userId || !playgroundId) return () => {};

    const memoriesRef = collection(db, 'users', userId, 'playground-memories');
    const q = query(
      memoriesRef,
      where('playgroundId', '==', playgroundId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const memoriesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        callback(memoriesData);
      },
      (error) => {
        console.error('Error fetching playground memories:', error);
      }
    );

    return unsubscribe;
  };

  // Add memory to playground
  const addMemoryToPlayground = async (playgroundId, memoryData, existingMemories = [], canvasSize) => {
    if (!userId || !playgroundId) return null;

    try {
      // Get the playground to check for central hashtag
      const playground = playgrounds.find(p => p.id === playgroundId);

      // Generate random position with collision detection
      const cardSize = { width: 200, height: 150 };
      const position = generateRandomPosition(existingMemories, canvasSize, cardSize);

      // Add central hashtag if it exists
      let hashtags = memoryData.hashtags || [];
      if (playground?.centralHashtag) {
        // Add central hashtag as first tag if not already present
        if (!hashtags.includes(playground.centralHashtag)) {
          hashtags = [playground.centralHashtag, ...hashtags];
        }
      }

      // Add hidden playground hashtag
      const playgroundHashtag = generatePlaygroundHashtag(playgroundId);
      if (!hashtags.includes(playgroundHashtag)) {
        hashtags.push(playgroundHashtag);
      }

      const memoriesRef = collection(db, 'users', userId, 'playground-memories');
      const docRef = await addDoc(memoriesRef, {
        ...memoryData,
        playgroundId,
        hashtags,
        position,
        isPractice: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      return {
        id: docRef.id,
        ...memoryData,
        playgroundId,
        hashtags,
        position,
        isPractice: true
      };
    } catch (error) {
      console.error('Error adding memory to playground:', error);
      throw error;
    }
  };

  // Update playground memory (mainly for position changes)
  const updatePlaygroundMemory = async (memoryId, updates) => {
    if (!userId || !memoryId) return;

    try {
      // Convert memoryId to string as Firestore requires string IDs
      const memoryRef = doc(db, 'users', userId, 'playground-memories', String(memoryId));
      await updateDoc(memoryRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating playground memory:', error);
      throw error;
    }
  };

  // Delete playground memory
  const deletePlaygroundMemory = async (memoryId) => {
    if (!userId || !memoryId) return;

    try {
      // Convert memoryId to string as Firestore requires string IDs
      const memoryRef = doc(db, 'users', userId, 'playground-memories', String(memoryId));
      await deleteDoc(memoryRef);
    } catch (error) {
      console.error('Error deleting playground memory:', error);
      throw error;
    }
  };

  // Copy memory to main archive (keeps it in playground too)
  const copyMemoryToArchive = async (memoryId, playgroundMemoriesData) => {
    if (!userId || !memoryId) return null;

    try {
      // Find the memory in playground memories
      const memory = playgroundMemoriesData.find(m => m.id === memoryId);
      if (!memory) {
        throw new Error('Memory not found');
      }

      // Copy to main memories collection (remove isPractice flag, keep playground hashtag)
      const mainMemoriesRef = collection(db, 'users', userId, 'memories');
      const docRef = await addDoc(mainMemoriesRef, {
        content: memory.content,
        title: memory.title,
        hashtags: memory.hashtags, // Keeps #pg- tag
        additionalContext: memory.additionalContext || '',
        timestamp: memory.timestamp || new Date().toISOString(),
        dateTime: memory.dateTime || new Date().toLocaleDateString(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
        // isPractice is NOT included - it's a regular memory now
      });

      return docRef.id;
    } catch (error) {
      console.error('Error copying memory to archive:', error);
      throw error;
    }
  };

  // Copy all memories from playground to archive
  const copyAllMemoriesToArchive = async (playgroundId, playgroundMemoriesData) => {
    if (!userId || !playgroundId) return [];

    try {
      const memories = playgroundMemoriesData.filter(m => m.playgroundId === playgroundId);

      const copyPromises = memories.map(memory => {
        const mainMemoriesRef = collection(db, 'users', userId, 'memories');
        return addDoc(mainMemoriesRef, {
          content: memory.content,
          title: memory.title,
          hashtags: memory.hashtags,
          additionalContext: memory.additionalContext || '',
          timestamp: memory.timestamp || new Date().toISOString(),
          dateTime: memory.dateTime || new Date().toLocaleDateString(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      const results = await Promise.all(copyPromises);
      return results.map(docRef => docRef.id);
    } catch (error) {
      console.error('Error copying all memories to archive:', error);
      throw error;
    }
  };

  // Update central hashtag
  const updateCentralHashtag = async (playgroundId, newHashtag) => {
    return updatePlayground(playgroundId, { centralHashtag: newHashtag });
  };

  // Auto-detect central hashtag from memories
  const autoDetectCentralHashtag = async (playgroundId, playgroundMemoriesData) => {
    if (!playgroundId) return null;

    try {
      const memories = playgroundMemoriesData.filter(m => m.playgroundId === playgroundId);

      // Count hashtag frequency (excluding #pg- tags)
      const hashtagCounts = {};
      memories.forEach(memory => {
        if (memory.hashtags) {
          memory.hashtags.forEach(tag => {
            if (!tag.startsWith('#pg-')) {
              hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
            }
          });
        }
      });

      // Find most common hashtag
      let mostCommon = null;
      let maxCount = 0;
      for (const [tag, count] of Object.entries(hashtagCounts)) {
        if (count > maxCount) {
          maxCount = count;
          mostCommon = tag;
        }
      }

      if (mostCommon) {
        await updateCentralHashtag(playgroundId, mostCommon);
      }

      return mostCommon;
    } catch (error) {
      console.error('Error auto-detecting central hashtag:', error);
      throw error;
    }
  };

  // Remove central hashtag
  const removeCentralHashtag = async (playgroundId) => {
    return updatePlayground(playgroundId, { centralHashtag: null });
  };

  return {
    playgrounds,
    playgroundMemories,
    loading,
    error,
    createPlayground,
    updatePlayground,
    deletePlayground,
    getPlaygroundMemories,
    addMemoryToPlayground,
    updatePlaygroundMemory,
    deletePlaygroundMemory,
    copyMemoryToArchive,
    copyAllMemoriesToArchive,
    updateCentralHashtag,
    autoDetectCentralHashtag,
    removeCentralHashtag
  };
};
