/**
 * Data migration utility to ensure all IDs are strings
 * Runs once to clean up any existing numeric or mixed-type IDs
 */

import { ensureStringId } from './generateId';

/**
 * Migrate board state to ensure all IDs are strings
 * @param {Object} boardState - The board state to migrate
 * @returns {Object} - Migrated board state with all string IDs
 */
export function migrateBoardState(boardState) {
  if (!boardState) return boardState;

  const migrated = { ...boardState };

  // Migrate dropped memories
  if (migrated.droppedMemories) {
    migrated.droppedMemories = migrated.droppedMemories.map(memory => ({
      ...memory,
      id: ensureStringId(memory.id)
    }));
  }

  // Migrate connections
  if (migrated.connections) {
    migrated.connections = migrated.connections.map(conn => ({
      ...conn,
      from: ensureStringId(conn.from),
      to: ensureStringId(conn.to)
    }));
  }

  // Migrate standalone pins
  if (migrated.standalonePins) {
    migrated.standalonePins = migrated.standalonePins.map(pin => ({
      ...pin,
      id: ensureStringId(pin.id)
    }));
  }

  return migrated;
}

/**
 * Migrate localStorage memories to ensure all IDs are strings
 * @param {Array} memories - Array of memories from localStorage
 * @returns {Array} - Migrated memories with all string IDs
 */
export function migrateLocalStorageMemories(memories) {
  if (!memories || !Array.isArray(memories)) return memories;

  return memories.map(memory => ({
    ...memory,
    id: ensureStringId(memory.id)
  }));
}

/**
 * Migrate chronology state to ensure all IDs are strings
 * @param {Object} chronologyState - The chronology state to migrate
 * @returns {Object} - Migrated chronology state with all string IDs
 */
export function migrateChronologyState(chronologyState) {
  if (!chronologyState) return chronologyState;

  const migrated = { ...chronologyState };

  // Migrate timeline IDs
  if (migrated.positions?.timelineIds) {
    migrated.positions.timelineIds = migrated.positions.timelineIds.map(id => ensureStringId(id));
  }

  // Migrate sidebar IDs
  if (migrated.positions?.sidebarIds) {
    migrated.positions.sidebarIds = migrated.positions.sidebarIds.map(id => ensureStringId(id));
  }

  return migrated;
}

/**
 * Check if migration is needed by looking for non-string IDs
 * @param {Object} data - The data to check
 * @returns {boolean} - True if migration is needed
 */
export function needsMigration(data) {
  if (!data) return false;

  // Check board state
  if (data.droppedMemories) {
    for (const memory of data.droppedMemories) {
      if (memory.id && typeof memory.id !== 'string') return true;
    }
  }

  if (data.connections) {
    for (const conn of data.connections) {
      if ((conn.from && typeof conn.from !== 'string') ||
          (conn.to && typeof conn.to !== 'string')) return true;
    }
  }

  if (data.standalonePins) {
    for (const pin of data.standalonePins) {
      if (pin.id && typeof pin.id !== 'string') return true;
      // Also check for old pin_N format
      if (pin.id && /^pin_\d+$/.test(pin.id)) return true;
    }
  }

  // Check localStorage memories
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item.id && typeof item.id !== 'string') return true;
    }
  }

  return false;
}

/**
 * Run a one-time migration on app startup
 * This should be called in the main App component or a startup hook
 */
export function runIdMigration() {
  try {
    // Check and migrate localStorage data
    const localData = localStorage.getItem('memoryLibraryData');
    if (localData) {
      const parsed = JSON.parse(localData);

      if (parsed.memories && needsMigration(parsed.memories)) {
        console.log('Migrating localStorage memories to string IDs...');
        parsed.memories = migrateLocalStorageMemories(parsed.memories);
        localStorage.setItem('memoryLibraryData', JSON.stringify(parsed));
        console.log('localStorage migration complete');
      }
    }

    // Check and migrate board states from localStorage
    const boardKeys = Object.keys(localStorage).filter(key => key.startsWith('boardState_'));
    boardKeys.forEach(key => {
      const boardData = JSON.parse(localStorage.getItem(key));
      if (needsMigration(boardData)) {
        console.log(`Migrating board state ${key} to string IDs...`);
        const migrated = migrateBoardState(boardData);
        localStorage.setItem(key, JSON.stringify(migrated));
        console.log(`Board state ${key} migration complete`);
      }
    });

    // Set migration flag so we don't run this repeatedly
    const migrationKey = 'idMigration_v1_completed';
    if (!localStorage.getItem(migrationKey)) {
      localStorage.setItem(migrationKey, new Date().toISOString());
      console.log('ID migration completed successfully');
    }
  } catch (error) {
    console.error('Error during ID migration:', error);
    // Don't throw - we don't want to break the app if migration fails
  }
}

export default {
  migrateBoardState,
  migrateLocalStorageMemories,
  migrateChronologyState,
  needsMigration,
  runIdMigration
};