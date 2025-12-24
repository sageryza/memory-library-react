import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signInAnonymously, linkWithCredential, EmailAuthProvider } from 'firebase/auth';
import { auth } from '../firebase';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  /**
   * Sign in anonymously - creates a temporary account
   * Data persists and can be linked to a real account later
   */
  const signInAnonymouslyFn = useCallback(async () => {
    try {
      const result = await signInAnonymously(auth);
      return result.user;
    } catch (error) {
      console.error('Anonymous sign-in failed:', error);
      throw error;
    }
  }, []);

  /**
   * Link anonymous account to email/password credentials
   * Called when user signs up after using the app anonymously
   */
  const linkAnonymousToEmail = useCallback(async (email, password) => {
    if (!user || !user.isAnonymous) {
      throw new Error('No anonymous user to link');
    }

    try {
      const credential = EmailAuthProvider.credential(email, password);
      const result = await linkWithCredential(user, credential);
      return result.user;
    } catch (error) {
      console.error('Failed to link account:', error);
      throw error;
    }
  }, [user]);

  return {
    user,
    loading,
    isAnonymous: user?.isAnonymous || false,
    signInAnonymously: signInAnonymouslyFn,
    linkAnonymousToEmail
  };
};

export default useAuth;