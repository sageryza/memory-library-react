/**
 * Centralized localStorage management for unauthenticated users
 * Mirrors Firebase structure for easy migration when user signs up
 */

import { useState, useEffect, useCallback } from 'react';
import { generateLocalId } from '../utils/generateId';

const STORAGE_KEY = 'memoryLibraryLocalData';
const MAX_MEMORIES = 50;
const CURRENT_VERSION = '1.0';

// Initialize with default structure
const getDefaultData = () => ({
  memories: [],
  boardState: {
    droppedMemories: [],
    connections: [],
    standalonePins: [],
    panOffset: { x: 0, y: 0 }
  },
  libraries: [],
  metadata: {
    version: CURRENT_VERSION,
    lastUpdated: new Date().toISOString(),
    memoryCount: 0
  }
});

/**
 * Hook for managing all localStorage data
 * Provides Firebase-like interface for unauthenticated users
 */
export const useLocalStorage = () => {
  const [data, setData] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Migrate old format if needed
        if (Array.isArray(parsed)) {
          // Old format was just an array of memories
          return {
            ...getDefaultData(),
            memories: parsed,
            metadata: {
              ...getDefaultData().metadata,
              memoryCount: parsed.length
            }
          };
        }
        return { ...getDefaultData(), ...parsed };
      }
    } catch (error) {
      console.error('Error loading localStorage:', error);
    }
    return getDefaultData();
  });

  // Save to localStorage whenever data changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
      // Check if quota exceeded
      if (error.name === 'QuotaExceededError') {
        console.error('localStorage quota exceeded');
        // Could trigger a warning to user here
      }
    }
  }, [data]);

  // Memory operations
  const addMemory = useCallback((memoryData) => {
    // Check memory limit
    if (data.memories.length >= MAX_MEMORIES) {
      return {
        success: false,
        error: 'LIMIT_REACHED',
        message: `Free account limited to ${MAX_MEMORIES} memories. Sign up for unlimited storage!`
      };
    }

    const newMemory = {
      ...memoryData,
      id: generateLocalId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setData(prev => ({
      ...prev,
      memories: [newMemory, ...prev.memories],
      metadata: {
        ...prev.metadata,
        lastUpdated: new Date().toISOString(),
        memoryCount: prev.memories.length + 1
      }
    }));

    return { success: true, id: newMemory.id };
  }, [data.memories.length]);

  const updateMemory = useCallback((memoryId, updates) => {
    setData(prev => ({
      ...prev,
      memories: prev.memories.map(memory =>
        memory.id === memoryId
          ? { ...memory, ...updates, updatedAt: new Date().toISOString() }
          : memory
      ),
      metadata: {
        ...prev.metadata,
        lastUpdated: new Date().toISOString()
      }
    }));
  }, []);

  const deleteMemory = useCallback((memoryId) => {
    setData(prev => ({
      ...prev,
      memories: prev.memories.filter(m => m.id !== memoryId),
      metadata: {
        ...prev.metadata,
        lastUpdated: new Date().toISOString(),
        memoryCount: Math.max(0, prev.memories.length - 1)
      }
    }));
  }, []);

  // Board state operations
  const updateBoardState = useCallback((updates) => {
    setData(prev => ({
      ...prev,
      boardState: {
        ...prev.boardState,
        ...updates,
        updatedAt: new Date().toISOString()
      },
      metadata: {
        ...prev.metadata,
        lastUpdated: new Date().toISOString()
      }
    }));
  }, []);

  // Library operations (these already exist in useLibraries.js)
  const addLibrary = useCallback((libraryData) => {
    const newLibrary = {
      ...libraryData,
      id: generateLocalId(),
      createdAt: new Date().toISOString()
    };

    setData(prev => ({
      ...prev,
      libraries: [...prev.libraries, newLibrary],
      metadata: {
        ...prev.metadata,
        lastUpdated: new Date().toISOString()
      }
    }));

    return newLibrary;
  }, []);

  const updateLibrary = useCallback((libraryId, updates) => {
    setData(prev => ({
      ...prev,
      libraries: prev.libraries.map(lib =>
        lib.id === libraryId
          ? { ...lib, ...updates, updatedAt: new Date().toISOString() }
          : lib
      ),
      metadata: {
        ...prev.metadata,
        lastUpdated: new Date().toISOString()
      }
    }));
  }, []);

  const deleteLibrary = useCallback((libraryId) => {
    setData(prev => ({
      ...prev,
      libraries: prev.libraries.filter(l => l.id !== libraryId),
      metadata: {
        ...prev.metadata,
        lastUpdated: new Date().toISOString()
      }
    }));
  }, []);

  // Check if approaching limit
  const isApproachingLimit = data.memories.length >= MAX_MEMORIES - 5;
  const hasReachedLimit = data.memories.length >= MAX_MEMORIES;

  // Storage usage estimate (rough)
  const estimateStorageUsage = () => {
    try {
      const dataSize = new Blob([JSON.stringify(data)]).size;
      const maxSize = 5 * 1024 * 1024; // 5MB estimate
      return {
        used: dataSize,
        max: maxSize,
        percentage: (dataSize / maxSize) * 100
      };
    } catch {
      return { used: 0, max: 0, percentage: 0 };
    }
  };

  // Clear all data (for testing or user request)
  const clearAllData = useCallback(() => {
    setData(getDefaultData());
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Export data for migration
  const exportData = useCallback(() => {
    return { ...data };
  }, [data]);

  return {
    // Data
    memories: data.memories,
    boardState: data.boardState,
    libraries: data.libraries,
    metadata: data.metadata,

    // Memory operations
    addMemory,
    updateMemory,
    deleteMemory,

    // Board state operations
    updateBoardState,

    // Library operations
    addLibrary,
    updateLibrary,
    deleteLibrary,

    // Utility
    isApproachingLimit,
    hasReachedLimit,
    estimateStorageUsage,
    clearAllData,
    exportData,

    // Constants
    MAX_MEMORIES
  };
};

export default useLocalStorage;