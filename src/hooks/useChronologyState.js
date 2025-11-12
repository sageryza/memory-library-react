import { useState, useEffect, useCallback } from 'react';
import {
  doc,
  onSnapshot,
  setDoc,
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
          console.log('Raw Firebase document data:', data);
          console.log('Positions from Firebase:', data.positions);
          setChronologyState({
            positions: data.positions || {},
            viewSettings: data.viewSettings || {}
          });
        } else {
          console.log('Document does not exist in Firebase');
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

  // Update the chronology state with merge to prevent data loss
  // WRAPPED IN useCallback to prevent unnecessary re-renders
  const updateChronologyState = useCallback(async (newState) => {
    console.log('📤 updateChronologyState called:', {
      userId,
      hasUserId: !!userId,
      newState,
      positions: newState.positions
    });

    if (!userId) {
      console.error('❌ Cannot save: No userId');
      return;
    }

    try {
      const chronologyRef = doc(db, 'users', userId, 'chronologyState', 'current');
      console.log('📍 Document path:', `users/${userId}/chronologyState/current`);

      const dataToSave = {
        positions: newState.positions || {},
        viewSettings: newState.viewSettings || chronologyState.viewSettings || {},
        updatedAt: serverTimestamp()
      };

      console.log('💾 Calling setDoc with data:', dataToSave);

      // CRITICAL FIX: Use merge: true to update without overwriting entire document
      await setDoc(chronologyRef, dataToSave, { merge: true });

      console.log('✅ setDoc completed successfully');
      console.log('Successfully saved chronology state with positions:', newState.positions);
    } catch (error) {
      console.error('❌ Error updating chronology state:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      throw error;
    }
  }, [userId, chronologyState.viewSettings]);

  return {
    chronologyState,
    loading,
    error,
    updateChronologyState
  };
};

export default useChronologyState;
