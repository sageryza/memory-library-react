import { useCallback } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Hook to track activity on an imported shared board
 * Silently reports all user actions back to the original shared board
 *
 * @param {string|null} shareId - The ID of the shared board this was imported from
 * @returns {Object} Tracking functions (all null if no shareId)
 */
export const useSharedBoardTracking = (shareId) => {
  /**
   * Generic action tracker - writes to the shared board's activity log
   */
  const trackAction = useCallback(async (type, details = {}) => {
    if (!shareId) return;

    try {
      const sharedBoardRef = doc(db, 'sharedBoards', shareId);
      const docSnap = await getDoc(sharedBoardRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const activityLog = data.activityLog || [];

        activityLog.push({
          type,
          ...details,
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
      console.error('Error tracking action:', error);
    }
  }, [shareId]);

  // Memory actions
  const trackMemoryView = useCallback((memoryId, memoryTitle) => {
    trackAction('memory_view', { memoryId, memoryTitle: memoryTitle || 'Untitled' });
  }, [trackAction]);

  const trackMemoryMoved = useCallback((memoryTitle) => {
    trackAction('memory_moved', { memoryTitle: memoryTitle || 'Untitled' });
  }, [trackAction]);

  const trackMemoryEdited = useCallback((memoryTitle) => {
    trackAction('memory_edited', { memoryTitle: memoryTitle || 'Untitled' });
  }, [trackAction]);

  const trackMemoryRemoved = useCallback((memoryTitle) => {
    trackAction('memory_removed', { memoryTitle: memoryTitle || 'Untitled' });
  }, [trackAction]);

  // Connection actions
  const trackConnectionMade = useCallback((fromMemoryTitle, toMemoryTitle) => {
    trackAction('connection_made', {
      fromMemoryTitle: fromMemoryTitle || 'Untitled',
      toMemoryTitle: toMemoryTitle || 'Untitled'
    });
  }, [trackAction]);

  const trackConnectionDeleted = useCallback((fromMemoryTitle, toMemoryTitle) => {
    trackAction('connection_deleted', {
      fromMemoryTitle: fromMemoryTitle || 'Untitled',
      toMemoryTitle: toMemoryTitle || 'Untitled'
    });
  }, [trackAction]);

  const trackConnectionInsightEdited = useCallback((fromMemoryTitle, toMemoryTitle) => {
    trackAction('connection_insight_edited', {
      fromMemoryTitle: fromMemoryTitle || 'Untitled',
      toMemoryTitle: toMemoryTitle || 'Untitled'
    });
  }, [trackAction]);

  // Pin actions
  const trackPinCreated = useCallback((pinText) => {
    trackAction('pin_created', { pinText: pinText || 'Empty pin' });
  }, [trackAction]);

  const trackPinMoved = useCallback((pinText) => {
    trackAction('pin_moved', { pinText: pinText || 'Empty pin' });
  }, [trackAction]);

  const trackPinEdited = useCallback((pinText) => {
    trackAction('pin_edited', { pinText: pinText || 'Empty pin' });
  }, [trackAction]);

  const trackPinDeleted = useCallback((pinText) => {
    trackAction('pin_deleted', { pinText: pinText || 'Empty pin' });
  }, [trackAction]);

  // Return null functions if no shareId (board wasn't imported from a share)
  if (!shareId) {
    return {
      trackMemoryView: null,
      trackMemoryMoved: null,
      trackMemoryEdited: null,
      trackMemoryRemoved: null,
      trackConnectionMade: null,
      trackConnectionDeleted: null,
      trackConnectionInsightEdited: null,
      trackPinCreated: null,
      trackPinMoved: null,
      trackPinEdited: null,
      trackPinDeleted: null
    };
  }

  return {
    trackMemoryView,
    trackMemoryMoved,
    trackMemoryEdited,
    trackMemoryRemoved,
    trackConnectionMade,
    trackConnectionDeleted,
    trackConnectionInsightEdited,
    trackPinCreated,
    trackPinMoved,
    trackPinEdited,
    trackPinDeleted
  };
};

export default useSharedBoardTracking;
