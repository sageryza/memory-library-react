import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { generateLocalId } from '../utils/generateId';

/**
 * Hook to manage memory libraries
 * Libraries can contain:
 * - Manual memories: Specific memory IDs (manualMemoryIds)
 * - Search-based memories: Search logic that filters memories dynamically (searchLogic)
 * - Both: Libraries can have both manual and search-based memories simultaneously
 * - Locked: Flag to make library only accessible when viewing that library (hidden from main view)
 */
export default function useLibraries(userId) {
  const [libraries, setLibraries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load libraries from Firestore or localStorage
  useEffect(() => {
    if (!userId) {
      // Load from localStorage if no user
      loadLocalLibraries();
      return;
    }

    // Set up real-time listener for Firestore directly in useEffect
    let unsubscribe;

    try {
      const librariesRef = collection(db, 'users', userId, 'libraries');

      unsubscribe = onSnapshot(
        librariesRef,
        (snapshot) => {
          const libs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));

          console.log('Real-time update: received', libs.length, 'libraries');
          setLibraries(libs);

          // Create defaults for new Firestore users on first load
          if (libs.length === 0 && !localStorage.getItem('hasCreatedDefaultLibraries')) {
            createDefaultLibraries();
          }

          setLoading(false);
        },
        (error) => {
          console.error('Firestore listener error:', error);
          setLibraries([]);
          setLoading(false);
        }
      );

      console.log('Firestore listener set up for user:', userId);
    } catch (error) {
      console.error('Error setting up listener:', error);
      setLoading(false);
    }

    // Cleanup listener on unmount or userId change
    return () => {
      if (unsubscribe) {
        console.log('Cleaning up Firestore listener');
        unsubscribe();
      }
    };
  }, [userId]);

  // Create default libraries for new users
  const createDefaultLibraries = async () => {
    const defaultsData = [
      {
        name: 'Core Memories',
        description: 'The memories that have lived with you the longest, that make you who you are, that you refer back to on a daily basis.',
        color: '#FFD700', // Gold
        isCore: true,
        manualMemoryIds: [],
        searchLogic: null,
        isLocked: false
      },
      {
        name: 'Coincidences',
        description: 'Strange synchronicities, unlikely encounters, and moments when the universe seemed to conspire in your favor.',
        color: '#9932CC', // Dark Orchid Purple
        isCore: true,
        manualMemoryIds: [],
        searchLogic: null,
        isLocked: false
      }
    ];

    const createdLibraries = [];

    for (const libraryData of defaultsData) {
      const newLibrary = {
        name: libraryData.name,
        description: libraryData.description || '',
        manualMemoryIds: libraryData.manualMemoryIds || [],
        searchLogic: libraryData.searchLogic || null,
        isLocked: libraryData.isLocked || false,
        isCore: libraryData.isCore || false,
        color: libraryData.color || null,
        createdAt: new Date().toISOString(),
        ...(!userId ? {} : { userId })
      };

      if (!userId) {
        // localStorage: generate ID
        const id = generateLocalId();
        createdLibraries.push({ ...newLibrary, id });
      } else {
        // Firestore: add document to user's subcollection
        const librariesRef = collection(db, 'users', userId, 'libraries');
        const docRef = await addDoc(librariesRef, newLibrary);
        createdLibraries.push({ ...newLibrary, id: docRef.id });
      }
    }

    // Update state with all new libraries at once
    if (!userId) {
      // Save to localStorage
      setLibraries(createdLibraries);
      localStorage.setItem('memoryLibraries', JSON.stringify(createdLibraries));
    } else {
      // Update Firestore state
      setLibraries(createdLibraries);
    }

    // Mark that we've created default libraries
    localStorage.setItem('hasCreatedDefaultLibraries', 'true');
  };

  const loadLocalLibraries = async () => {
    try {
      const stored = localStorage.getItem('memoryLibraries');
      if (stored) {
        const parsed = JSON.parse(stored);
        setLibraries(parsed);
      } else {
        // New user with no libraries - create defaults
        const hasCreatedDefaults = localStorage.getItem('hasCreatedDefaultLibraries');
        if (!hasCreatedDefaults) {
          await createDefaultLibraries();
        }
      }
    } catch (error) {
      console.error('Error loading libraries from localStorage:', error);
    } finally {
      setLoading(false);
    }
  };


  // Save libraries to storage
  const saveLibraries = async (updatedLibraries) => {
    setLibraries(updatedLibraries);

    if (!userId) {
      // Save to localStorage
      localStorage.setItem('memoryLibraries', JSON.stringify(updatedLibraries));
      return;
    }

    // Note: Individual library updates are handled in create/update/delete functions
  };

  // Create a new library
  const createLibrary = async (libraryData) => {
    try {
      const newLibrary = {
        name: libraryData.name,
        description: libraryData.description || '',
        manualMemoryIds: libraryData.manualMemoryIds || [],
        searchLogic: libraryData.searchLogic || null,
        isLocked: libraryData.isLocked || false,
        isCore: libraryData.isCore || false,
        color: libraryData.color || null,
        createdAt: new Date().toISOString(),
        ...(!userId ? {} : { userId })
      };

      if (!userId) {
        // localStorage: generate ID and save
        const id = generateLocalId();
        const withId = { ...newLibrary, id };
        const updated = [...libraries, withId];
        await saveLibraries(updated);
        return withId;
      } else {
        // Firestore: add document to user's subcollection
        const librariesRef = collection(db, 'users', userId, 'libraries');
        const docRef = await addDoc(librariesRef, newLibrary);
        const withId = { ...newLibrary, id: docRef.id };
        setLibraries([...libraries, withId]);
        return withId;
      }
    } catch (error) {
      console.error('Error creating library:', error);
      throw error;
    }
  };

  // Update an existing library
  const updateLibrary = async (libraryId, updates) => {
    try {
      if (!userId) {
        // localStorage
        const updated = libraries.map(lib =>
          lib.id === libraryId ? { ...lib, ...updates } : lib
        );
        await saveLibraries(updated);
      } else {
        // Firestore: update in user's subcollection
        const docRef = doc(db, 'users', userId, 'libraries', libraryId);
        await updateDoc(docRef, updates);
        setLibraries(libraries.map(lib =>
          lib.id === libraryId ? { ...lib, ...updates } : lib
        ));
      }
    } catch (error) {
      console.error('Error updating library:', error);
      throw error;
    }
  };

  // Delete a library
  const deleteLibrary = async (libraryId) => {
    try {
      if (!userId) {
        // localStorage
        const updated = libraries.filter(lib => lib.id !== libraryId);
        await saveLibraries(updated);
      } else {
        // Firestore: delete from user's subcollection
        const docRef = doc(db, 'users', userId, 'libraries', libraryId);
        await deleteDoc(docRef);
        setLibraries(libraries.filter(lib => lib.id !== libraryId));
      }
    } catch (error) {
      console.error('Error deleting library:', error);
      throw error;
    }
  };

  // Add memory to library
  const addMemoryToLibrary = async (libraryId, memoryId) => {
    const library = libraries.find(lib => lib.id === libraryId);
    if (!library) return;

    const currentIds = library.manualMemoryIds || [];
    if (currentIds.includes(memoryId)) return; // Already in library

    const updatedIds = [...currentIds, memoryId];
    await updateLibrary(libraryId, { manualMemoryIds: updatedIds });
  };

  // Remove memory from library
  const removeMemoryFromLibrary = async (libraryId, memoryId) => {
    const library = libraries.find(lib => lib.id === libraryId);
    if (!library) return;

    const currentIds = library.manualMemoryIds || [];
    const updatedIds = currentIds.filter(id => id !== memoryId);
    await updateLibrary(libraryId, { manualMemoryIds: updatedIds });
  };

  // Get memories in a library
  const getLibraryMemories = (libraryId, allMemories) => {
    const library = libraries.find(lib => lib.id === libraryId);
    if (!library) return [];

    const memoryIdsToInclude = new Set();

    // Collect memories from manual IDs
    if (library.manualMemoryIds && library.manualMemoryIds.length > 0) {
      library.manualMemoryIds.forEach(id => memoryIdsToInclude.add(id));
    }

    // Collect memories from search logic
    if (library.searchLogic) {
      const searchLogic = library.searchLogic;
      const searchMatches = allMemories.filter(memory => {
        let matches = true;

        // Check AND terms - all must match
        if (searchLogic.andTerms && searchLogic.andTerms.length > 0) {
          matches = searchLogic.andTerms.every(term => {
            const termLower = term.toLowerCase();
            return (
              (searchLogic.searchInTitles !== false && memory.title?.toLowerCase().includes(termLower)) ||
              (searchLogic.searchInContent !== false && memory.content?.toLowerCase().includes(termLower)) ||
              (searchLogic.searchInHashtags !== false && memory.hashtags?.some(tag => tag.toLowerCase().includes(termLower))) ||
              (searchLogic.searchInDates !== false && (
                memory.dateTime?.toLowerCase().includes(termLower) ||
                memory.timestamp?.toLowerCase().includes(termLower)
              ))
            );
          });
        }

        // Check OR terms - at least one must match
        if (matches && searchLogic.orTerms && searchLogic.orTerms.length > 0) {
          matches = searchLogic.orTerms.some(term => {
            const termLower = term.toLowerCase();
            return (
              (searchLogic.searchInTitles !== false && memory.title?.toLowerCase().includes(termLower)) ||
              (searchLogic.searchInContent !== false && memory.content?.toLowerCase().includes(termLower)) ||
              (searchLogic.searchInHashtags !== false && memory.hashtags?.some(tag => tag.toLowerCase().includes(termLower))) ||
              (searchLogic.searchInDates !== false && (
                memory.dateTime?.toLowerCase().includes(termLower) ||
                memory.timestamp?.toLowerCase().includes(termLower)
              ))
            );
          });
        }

        // Check exclude terms - none should match
        if (matches && searchLogic.excludeTerms) {
          const termLower = searchLogic.excludeTerms.toLowerCase();
          matches = !(
            memory.title?.toLowerCase().includes(termLower) ||
            memory.content?.toLowerCase().includes(termLower) ||
            memory.hashtags?.some(tag => tag.toLowerCase().includes(termLower)) ||
            memory.dateTime?.toLowerCase().includes(termLower) ||
            memory.timestamp?.toLowerCase().includes(termLower)
          );
        }

        return matches;
      });

      // Add search matches to the set
      searchMatches.forEach(memory => memoryIdsToInclude.add(memory.id));
    }

    // Return union of both manual and search-based memories (deduplicated)
    return allMemories.filter(memory => memoryIdsToInclude.has(memory.id));
  };

  return {
    libraries,
    loading,
    createLibrary,
    updateLibrary,
    deleteLibrary,
    addMemoryToLibrary,
    removeMemoryFromLibrary,
    getLibraryMemories
  };
}
