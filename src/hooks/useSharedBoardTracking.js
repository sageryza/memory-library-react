import { useCallback } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Hook to track activity on an imported shared board
 * Silently reports memory views and connection creation back to the original shared board
 *
 * @param {string|null} shareId - The ID of the shared board this was imported from
 * @returns {Object} { trackMemoryView, trackConnectionMade }
 */
export const useSharedBoardTracking = (shareId) => {
  /**
   * Track when a memory is viewed (clicked)
   */
  const trackMemoryView = useCallback(async (memoryId, memoryTitle) => {
    if (!shareId || !memoryId) return;

    try {
      const sharedBoardRef = doc(db, 'sharedBoards', shareId);
      const docSnap = await getDoc(sharedBoardRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const activityLog = data.activityLog || [];

        activityLog.push({
          type: 'memory_view',
          memoryId,
          memoryTitle: memoryTitle || 'Untitled',
          timestamp: new Date().toISOString()
        });

        // Keep only last 100 activities
        const trimmedLog = activityLog.slice(-100);

        await setDoc(sharedBoardRef, {
          activityLog: trimmedLog,
          lastActivityAt: serverTimestamp()
        }, { merge: true });
      }
    } catch (error) {
      // Silently fail - tracking shouldn't interrupt user experience
      console.error('Error tracking memory view:', error);
    }
  }, [shareId]);

  /**
   * Track when a connection is made between two memories
   */
  const trackConnectionMade = useCallback(async (fromMemoryTitle, toMemoryTitle) => {
    if (!shareId) return;

    try {
      const sharedBoardRef = doc(db, 'sharedBoards', shareId);
      const docSnap = await getDoc(sharedBoardRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const activityLog = data.activityLog || [];

        activityLog.push({
          type: 'connection_made',
          fromMemoryTitle: fromMemoryTitle || 'Untitled',
          toMemoryTitle: toMemoryTitle || 'Untitled',
          timestamp: new Date().toISOString()
        });

        // Keep only last 100 activities
        const trimmedLog = activityLog.slice(-100);

        await setDoc(sharedBoardRef, {
          activityLog: trimmedLog,
          lastActivityAt: serverTimestamp()
        }, { merge: true });
      }
    } catch (error) {
      // Silently fail - tracking shouldn't interrupt user experience
      console.error('Error tracking connection:', error);
    }
  }, [shareId]);

  // Return null functions if no shareId (board wasn't imported from a share)
  if (!shareId) {
    return {
      trackMemoryView: null,
      trackConnectionMade: null
    };
  }

  return {
    trackMemoryView,
    trackConnectionMade
  };
};

export default useSharedBoardTracking;
