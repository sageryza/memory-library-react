/**
 * Get all memory IDs from locked libraries
 * @param {Array} libraries - Array of library objects
 * @param {Array} memories - Array of memory objects
 * @returns {Set} Set of memory IDs that belong to locked libraries
 */
export function getLockedMemoryIds(libraries, memories) {
  const lockedMemoryIds = new Set();

  libraries.forEach(library => {
    if (library.isLocked) {
      // Add manual memory IDs from locked library
      if (library.manualMemoryIds && library.manualMemoryIds.length > 0) {
        library.manualMemoryIds.forEach(id => {
          // Normalize ID to string
          lockedMemoryIds.add(String(id));
        });
      }

      // For search-based locked libraries, filter dynamically
      if (library.searchLogic) {
        const matchingMemories = filterMemoriesBySearchLogic(memories, library.searchLogic);
        matchingMemories.forEach(memory => {
          // Normalize ID to string
          lockedMemoryIds.add(String(memory.id));
        });
      }
    }
  });

  return lockedMemoryIds;
}

/**
 * Filter memories based on search logic (AND/OR/EXCLUDE terms)
 * @param {Array} memories - Array of memory objects
 * @param {Object} searchLogic - Search logic object with andTerms, orTerms, excludeTerms
 * @returns {Array} Filtered array of memories that match the search logic
 */
function filterMemoriesBySearchLogic(memories, searchLogic) {
  if (!searchLogic) return [];

  const { andTerms = [], orTerms = [], excludeTerms = '' } = searchLogic;

  // Parse exclude terms (comma-separated)
  const excludeList = excludeTerms
    ? excludeTerms.split(',').map(term => term.trim().toLowerCase()).filter(Boolean)
    : [];

  return memories.filter(memory => {
    const searchableText = `${memory.title || ''} ${memory.content || ''} ${(memory.hashtags || []).join(' ')}`.toLowerCase();

    // Check AND terms (all must be present)
    const andMatch = andTerms.length === 0 || andTerms.every(term =>
      searchableText.includes(term.toLowerCase())
    );

    // Check OR terms (at least one must be present)
    const orMatch = orTerms.length === 0 || orTerms.some(term =>
      searchableText.includes(term.toLowerCase())
    );

    // Check exclude terms (none should be present)
    const excludeMatch = excludeList.length === 0 || !excludeList.some(term =>
      searchableText.includes(term)
    );

    return andMatch && orMatch && excludeMatch;
  });
}

/**
 * Check if a library should show its content (is unlocked or is the active filter)
 * @param {Object} library - Library object
 * @param {Object} activeLibraryFilter - Currently active library filter
 * @returns {boolean} True if library content should be shown
 */
export function shouldShowLibraryContent(library, activeLibraryFilter) {
  // If no library is locked, show everything
  if (!library.isLocked) return true;

  // If this locked library is the active filter, show its content
  if (activeLibraryFilter && activeLibraryFilter.id === library.id) return true;

  // Otherwise, hide locked library content
  return false;
}