import { useCallback } from 'react';
import { useConstellations } from './useConstellations';

/**
 * Custom hook for detecting memory connections from Firebase constellations
 * Shows which memories are connected in saved constellation boards
 */
export function useMemoryConnections(userId) {
  const { constellations, loading } = useConstellations(userId);

  /**
   * Get all connections for a specific memory
   * Returns array of constellation data containing connections
   */
  const getMemoryConnections = useCallback((memoryId) => {
    if (!memoryId || loading || !constellations) return [];

    const connectionsData = [];

    // Check each saved constellation
    constellations.forEach(constellation => {
      if (constellation.connections && constellation.connections.length > 0) {
        // Check if this memory is involved in any connections
        const memoryConnections = constellation.connections.filter(conn =>
          String(conn.from) === String(memoryId) || String(conn.to) === String(memoryId)
        );

        if (memoryConnections.length > 0) {
          connectionsData.push({
            boardId: constellation.id,
            boardName: constellation.name || 'Untitled Constellation',
            connections: memoryConnections,
            memories: constellation.memories || []
          });
        }
      }
    });

    return connectionsData;
  }, [constellations, loading]);

  /**
   * Check if a memory has any connections
   */
  const hasConnections = useCallback((memoryId) => {
    return getMemoryConnections(memoryId).length > 0;
  }, [getMemoryConnections]);

  /**
   * Navigate to the Conspiracy Board where constellations can be viewed
   * Note: Constellations are managed within the main board's constellation mode
   */
  const navigateToBoard = useCallback((boardId) => {
    // Navigate to the main Conspiracy Board
    // User can then enter constellation mode and load the desired constellation
    window.location.href = `/`;
  }, []);

  return {
    getMemoryConnections,
    hasConnections,
    navigateToBoard,
    loading
  };
}
