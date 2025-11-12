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
        // IDs are already strings, no conversion needed
        const memoryConnections = constellation.connections.filter(conn =>
          conn.from === memoryId || conn.to === memoryId
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
   * Navigate to a specific constellation board
   * Update this path based on where your constellation view is routed
   */
  const navigateToBoard = useCallback((boardId) => {
    // TODO: Update this route when constellation board view is implemented
    window.location.href = `/constellation/${boardId}`;
  }, []);

  return {
    getMemoryConnections,
    hasConnections,
    navigateToBoard,
    loading
  };
}
