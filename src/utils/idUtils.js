/**
 * ID utility functions for handling and comparing IDs consistently
 * ALL IDs are now guaranteed to be strings from the source
 */

// TODO: Investigate ID/String Mismatch Related Issues
// Context: Recently resolved ID type inconsistency (numbers vs strings) causing persistence bugs
// Tasks:
// - Review documented related issues (need to locate documentation file)
// - Search for similar ID type mismatches elsewhere
// - Ensure consistent ID handling throughout codebase
// - Add safeguards to prevent future type mismatches
// See TODO.md for details

import { normalizeId } from './generateId';

// Re-export normalizeId for compatibility with existing imports
export { normalizeId };

/**
 * Compares two IDs after normalization
 * @param {string} id1 - First ID to compare
 * @param {string} id2 - Second ID to compare
 * @returns {boolean} True if IDs are equal after normalization
 */
export function compareIds(id1, id2) {
  // IDs should already be strings, but normalize for safety
  return normalizeId(id1) === normalizeId(id2);
}

/**
 * Finds an item in an array by ID
 * @param {Array} array - The array to search
 * @param {string} id - The ID to find
 * @returns {Object|undefined} The found item or undefined
 */
export function findById(array, id) {
  if (!array || !Array.isArray(array)) {
    return undefined;
  }
  const normalizedId = normalizeId(id);
  return array.find(item => normalizeId(item.id) === normalizedId);
}

/**
 * Checks if a Set contains a normalized ID
 * @param {Set} set - The Set to check
 * @param {string} id - The ID to look for
 * @returns {boolean} True if the Set contains the ID
 */
export function setHasId(set, id) {
  if (!set || !(set instanceof Set)) {
    return false;
  }
  const normalizedId = normalizeId(id);

  // Since all IDs are now strings, we only need to check once
  return set.has(normalizedId);
}
