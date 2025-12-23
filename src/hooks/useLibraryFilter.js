import { useState, useMemo, useCallback, useEffect } from 'react';
import useUserPreferences from './useUserPreferences';

const PREF_KEY = 'selectedLibraryId';

/**
 * Hook for managing library filter state in sidebar views.
 * Used by components that have a TabbedSidebar with Libraries tab.
 * Persists selected library to Firebase.
 *
 * @param {Array} libraries - Array of library objects
 * @param {Array} memories - Array of all memories
 * @param {Function} getLibraryMemories - Function from useLibraries to filter memories by library
 * @param {boolean} librariesLoading - Whether libraries are still loading
 * @param {string} userId - Current user's ID for Firebase persistence
 * @returns {Object} Library filter state and helpers
 */
export default function useLibraryFilter(libraries, memories, getLibraryMemories, librariesLoading = false, userId = null) {
  const { getPreference, setPreference, loading: prefsLoading } = useUserPreferences(userId);

  // Local override for immediate UI updates when user selects a library
  const [localOverride, setLocalOverride] = useState(null);
  const [hasLocalOverride, setHasLocalOverride] = useState(false);

  // Get the selected library ID - use local override if set, otherwise use Firebase
  const firebaseSelectedId = getPreference(PREF_KEY, null);
  const selectedLibraryId = hasLocalOverride ? localOverride : firebaseSelectedId;

  // Clear local override once Firebase catches up
  useEffect(() => {
    if (hasLocalOverride && firebaseSelectedId === localOverride) {
      setHasLocalOverride(false);
    }
  }, [firebaseSelectedId, localOverride, hasLocalOverride]);

  // Clear selection if library no longer exists (only after everything has loaded)
  useEffect(() => {
    const allLoaded = !librariesLoading && !prefsLoading;

    if (allLoaded && selectedLibraryId && libraries && libraries.length > 0) {
      const libraryExists = libraries.some(lib => lib.id === selectedLibraryId);
      if (!libraryExists) {
        setLocalOverride(null);
        setHasLocalOverride(true);
        setPreference(PREF_KEY, null);
      }
    }
  }, [selectedLibraryId, libraries, librariesLoading, prefsLoading, setPreference]);

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
    setLocalOverride(null);
    setHasLocalOverride(true);
    setPreference(PREF_KEY, null);
  }, [setPreference]);

  // Select a library
  const selectLibrary = useCallback((libraryId) => {
    setLocalOverride(libraryId);
    setHasLocalOverride(true);
    setPreference(PREF_KEY, libraryId);
  }, [setPreference]);

  return {
    selectedLibraryId,
    selectedLibrary,
    filteredMemories,
    selectLibrary,
    clearFilter,
    loading: prefsLoading
  };
}
