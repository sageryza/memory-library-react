import { useState, useEffect, useCallback, useRef } from 'react';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Simplified chronology state hook
 * - Loads once on mount (no real-time listener to avoid echo issues)
 * - Saves with debounce
 * - Simpler data structure: just arrays of memory IDs
 */
export function useChronologyStateV2(userId) {
  const [timelineIds, setTimelineIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const saveTimeoutRef = useRef(null);
  const hasLoadedRef = useRef(false);

  // Load state once on mount
  useEffect(() => {
    if (!userId) {
      setTimelineIds([]);
      setLoading(false);
      return;
    }

    // Only load once
    if (hasLoadedRef.current) return;

    const loadState = async () => {
      try {
        const chronologyRef = doc(db, 'users', userId, 'chronologyState', 'v2');
        const snapshot = await getDoc(chronologyRef);

        if (snapshot.exists()) {
          const data = snapshot.data();
          setTimelineIds(data.timelineIds || []);
        } else {
          setTimelineIds([]);
        }

        hasLoadedRef.current = true;
        setLoading(false);
      } catch (err) {
        console.error('Error loading chronology state:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    loadState();
  }, [userId]);

  // Save function with debounce
  const saveTimelineIds = useCallback((ids) => {
    if (!userId) return;

    // Update local state immediately
    setTimelineIds(ids);

    // Debounce the save to Firebase
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const chronologyRef = doc(db, 'users', userId, 'chronologyState', 'v2');
        await setDoc(chronologyRef, {
          timelineIds: ids,
          updatedAt: serverTimestamp()
        });
        console.log('Saved timeline:', ids.length, 'memories');
      } catch (err) {
        console.error('Error saving chronology state:', err);
        setError(err.message);
      }
    }, 1000); // 1 second debounce
  }, [userId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    timelineIds,
    setTimelineIds: saveTimelineIds,
    loading,
    error
  };
}

export default useChronologyStateV2;
