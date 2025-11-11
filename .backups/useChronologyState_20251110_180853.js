import { useState, useEffect } from 'react';
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

  // Update the chronology state
  const updateChronologyState = async (newState) => {
    if (!userId) return;

    try {
      const chronologyRef = doc(db, 'users', userId, 'chronologyState', 'current');
      await setDoc(chronologyRef, {
        ...newState,
        updatedAt: serverTimestamp()
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
