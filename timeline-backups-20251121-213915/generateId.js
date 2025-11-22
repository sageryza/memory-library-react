/**
 * Utility for generating unique IDs
 * ALL IDs are guaranteed to be strings to prevent type mismatch issues
 */

/**
 * Generate a unique ID for client-side use
 * Uses crypto.randomUUID when available, falls back to a random string
 * ALWAYS returns a string
 */
export const generateLocalId = () => {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for older browsers or Node.js environments
  // Generates a random string similar to UUID v4 format
  return 'xxxx-xxxx-4xxx-yxxx-xxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * Generate a short ID for UI elements (like gaps in timeline)
 * These don't need to be globally unique, just unique within a session
 * ALWAYS returns a string
 */
export const generateShortId = (prefix = '') => {
  const randomPart = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}-${randomPart}` : randomPart;
};

/**
 * Generate a timestamp-based ID (for sorting purposes)
 * This maintains chronological ordering while being unique
 * Format: timestamp-random (e.g., "1234567890-abc123")
 * ALWAYS returns a string
 */
export const generateChronologicalId = () => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 7);
  return `${timestamp}-${random}`;
};

/**
 * Generate a unique ID for standalone pins
 * Format: pin-uuid (e.g., "pin-abc123def456")
 * ALWAYS returns a string
 */
export const generatePinId = () => {
  return `pin-${generateShortId()}`;
};

/**
 * Normalize any ID to ensure it's a string
 * This is the SINGLE source of truth for ID normalization
 * @param {any} id - The ID to normalize (can be string, number, null, undefined)
 * @returns {string} - Always returns a string (empty string for null/undefined)
 */
export const normalizeId = (id) => {
  if (id === null || id === undefined) {
    return '';
  }
  return String(id);
};

/**
 * Ensure an ID is a string at the point of creation/loading
 * Use this when receiving IDs from external sources (Firebase, localStorage, etc.)
 * @param {any} id - The ID to ensure is a string
 * @returns {string} - Always returns a string
 */
export const ensureStringId = (id) => {
  return normalizeId(id);
};

export default generateLocalId;