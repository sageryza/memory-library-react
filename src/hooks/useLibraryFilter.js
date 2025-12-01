import { useState, useMemo, useCallback } from 'react';

/**
 * Hook for managing library filter state in sidebar views.
 * Used by components that have a TabbedSidebar with Libraries tab.
 *
 * @param {Array} libraries - Array of library objects
 * @param {Array} memories - Array of all memories
 * @param {Function} getLibraryMemories - Function from useLibraries to filter memories by library
 * @returns {Object} Library filter state and helpers
 */
export default function useLibraryFilter(libraries, memories, getLibraryMemories) {
  const [selectedLibraryId, setSelectedLibraryId] = useState(null);

  // Get the selected library object
  const selectedLibrary = useMemo(() => {
    if (!selectedLibraryId) return null;
    return libraries.find(lib => lib.id === selectedLibraryId) || null;
  }, [selectedLibraryId, libraries]);

  // Get filtered memories based on selected library
  const filteredMemories = useMemo(() => {
    if (!selectedLibraryId) return memories;
    return getLibraryMemories(selectedLibraryId, memories);
  }, [selectedLibraryId, memories, getLibraryMemories]);

  // Clear the library filter
  const clearFilter = useCallback(() => {
    setSelectedLibraryId(null);
  }, []);

  // Select a library
  const selectLibrary = useCallback((libraryId) => {
    setSelectedLibraryId(libraryId);
  }, []);

  return {
    selectedLibraryId,
    selectedLibrary,
    filteredMemories,
    selectLibrary,
    clearFilter
  };
}
