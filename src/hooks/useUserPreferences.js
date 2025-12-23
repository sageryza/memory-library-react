import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Hook for managing user preferences stored in Firebase.
 * Stores preferences at users/{userId}/preferences/general
 */
export default function useUserPreferences(userId) {
  const [preferences, setPreferences] = useState({});
  const [loading, setLoading] = useState(true);

  // Listen to preferences in real-time
  useEffect(() => {
    if (!userId) {
      setPreferences({});
      setLoading(false);
      return;
    }

    const prefsRef = doc(db, 'users', userId, 'preferences', 'general');

    const unsubscribe = onSnapshot(prefsRef, (docSnap) => {
      if (docSnap.exists()) {
        console.log('[useUserPreferences] Loaded from Firebase:', docSnap.data());
        setPreferences(docSnap.data());
      } else {
        console.log('[useUserPreferences] No preferences document found');
        setPreferences({});
      }
      setLoading(false);
    }, (error) => {
      console.error('Error loading preferences:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  // Update a single preference
  const setPreference = useCallback(async (key, value) => {
    if (!userId) return;

    const prefsRef = doc(db, 'users', userId, 'preferences', 'general');
    try {
      console.log('[useUserPreferences] Saving to Firebase:', key, '=', value);
      await setDoc(prefsRef, { [key]: value }, { merge: true });
      console.log('[useUserPreferences] Save successful');
    } catch (error) {
      console.error('Error saving preference:', error);
    }
  }, [userId]);

  // Get a single preference with optional default
  const getPreference = useCallback((key, defaultValue = null) => {
    return preferences[key] ?? defaultValue;
  }, [preferences]);

  return {
    preferences,
    loading,
    setPreference,
    getPreference
  };
}
