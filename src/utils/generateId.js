/**
 * Utility for generating unique IDs
 * Replaces the old Date.now() pattern with proper string IDs
 */

/**
 * Generate a unique ID for client-side use
 * Uses crypto.randomUUID when available, falls back to a random string
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
 */
export const generateShortId = (prefix = '') => {
  const randomPart = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}-${randomPart}` : randomPart;
};

/**
 * Generate a timestamp-based ID (for sorting purposes)
 * This maintains chronological ordering while being unique
 * Format: timestamp-random (e.g., "1234567890-abc123")
 */
export const generateChronologicalId = () => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 7);
  return `${timestamp}-${random}`;
};

export default generateLocalId;