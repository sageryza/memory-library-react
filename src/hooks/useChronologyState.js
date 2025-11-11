import { useState, useEffect } from 'react';
import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';

export const useChronologyState = (userId) => {
  const [chronologyState, setChronologyState] = useState({
    positions: {},
    viewSettings: {}
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) {
      setChronologyState({
        positions: {},
        viewSettings: {}
      });
      setLoading(false);
      return;
    }

    const chronologyRef = doc(db, 'users', userId, 'chronologyState', 'current');

    const unsubscribe = onSnapshot(
      chronologyRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setChronologyState({
            positions: data.positions || {},
            viewSettings: data.viewSettings || {}
          });
        } else {
          // Initialize with empty state if document doesn't exist
          setChronologyState({
            positions: {},
            viewSettings: {}
          });
        }
        setLoading(false);
        setError(null);
      },
      (error) => {
        console.error('Error fetching chronology state:', error);
        setError(error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // Update the chronology state with transaction support
  const updateChronologyState = async (newState) => {
    if (!userId) return;

    try {
      const chronologyRef = doc(db, 'users', userId, 'chronologyState', 'current');

      await runTransaction(db, async (transaction) => {
        const docSnapshot = await transaction.get(chronologyRef);

        let existingData = {};
        let existingVersion = 0;

        if (docSnapshot.exists()) {
          existingData = docSnapshot.data();
          existingVersion = existingData.positions?.version || 0;
        }

        // Check if the incoming version is newer
        const incomingVersion = newState.positions?.version || 0;

        // Only update if this is a newer version or if versions are equal (for conflict resolution)
        if (incomingVersion > existingVersion) {
          transaction.set(chronologyRef, {
            ...existingData,
            ...newState,
            updatedAt: serverTimestamp()
          });
        } else if (incomingVersion === existingVersion) {
          // Handle concurrent updates - merge positions intelligently
          console.warn('Concurrent update detected, merging changes');

          // For simplicity, we'll take the incoming state but increment version
          transaction.set(chronologyRef, {
            ...existingData,
            ...newState,
            positions: {
              ...newState.positions,
              version: existingVersion + 1
            },
            updatedAt: serverTimestamp()
          });
        } else {
          console.warn('Skipping update - existing version is newer');
        }
      });
    } catch (error) {
      console.error('Error updating chronology state:', error);
      throw error;
    }
  };

  return {
    chronologyState,
    loading,
    error,
    updateChronologyState
  };
};

export default useChronologyState;
