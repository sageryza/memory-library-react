/**
 * ID utility functions for handling and comparing IDs consistently
 * Handles both string and numeric IDs
 */

/**
 * Normalizes an ID to a consistent string format
 * @param {string|number} id - The ID to normalize
 * @returns {string} The normalized ID as a string
 */
export function normalizeId(id) {
  if (id === null || id === undefined) {
    return '';
  }
  return String(id);
}

/**
 * Compares two IDs after normalization
 * @param {string|number} id1 - First ID to compare
 * @param {string|number} id2 - Second ID to compare
 * @returns {boolean} True if IDs are equal after normalization
 */
export function compareIds(id1, id2) {
  return normalizeId(id1) === normalizeId(id2);
}

/**
 * Finds an item in an array by ID
 * @param {Array} array - The array to search
 * @param {string|number} id - The ID to find
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
 * @param {string|number} id - The ID to look for
 * @returns {boolean} True if the Set contains the ID
 */
export function setHasId(set, id) {
  if (!set || !(set instanceof Set)) {
    return false;
  }
  const normalizedId = normalizeId(id);

  // Check if the set contains the normalized ID
  // Since Sets can contain both strings and numbers, we need to check both
  return set.has(normalizedId) || set.has(id);
}
