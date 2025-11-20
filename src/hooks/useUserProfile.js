import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// Hook for managing the current user's profile
export const useUserProfile = (user) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setProfile(null);
      setLoading(false);
      return;
    }

    // Listen to profile changes
    const profileRef = doc(db, 'users', user.uid, 'profile', 'current');
    const unsubscribe = onSnapshot(profileRef,
      async (doc) => {
        if (doc.exists()) {
          const existingProfile = doc.data();
          setProfile(existingProfile);

          // Check if we have a Google first name to update with
          const googleFirstName = localStorage.getItem('googleFirstName');
          if (googleFirstName && googleFirstName !== existingProfile.firstName) {
            // User signed in with Google, update their profile with the real name
            try {
              await setDoc(profileRef, {
                ...existingProfile,
                firstName: googleFirstName,
                updatedAt: new Date().toISOString()
              });
              localStorage.removeItem('googleFirstName');
            } catch (error) {
              console.error('Error updating profile with Google name:', error);
            }
          }
        } else {
          // Profile doesn't exist, create a basic one
          createInitialProfile(user, profileRef);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching profile:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const createInitialProfile = async (user, profileRef) => {
    try {
      // Extract first name from different sources
      let firstName = 'Anonymous';

      // First, check if we have the Google first name stored
      const googleFirstName = localStorage.getItem('googleFirstName');
      if (googleFirstName) {
        firstName = googleFirstName;
        // Clean up after using it
        localStorage.removeItem('googleFirstName');
      }
      // Otherwise try to get from Google display name
      else if (user.displayName) {
        firstName = user.displayName.split(' ')[0];
      }
      // Last resort: try to extract from email (for email/password signups)
      else if (user.email && !user.providerData?.some(p => p.providerId === 'google.com')) {
        let emailName = user.email.split('@')[0];
        // Remove any numbers or special characters first
        emailName = emailName.replace(/[^a-zA-Z]/g, '');

        // Try to extract just the first part if it looks like a combined name
        // Check for camelCase (sophieSpincher -> Sophie)
        const camelMatch = emailName.match(/^[a-z]+(?=[A-Z])/);
        if (camelMatch) {
          emailName = camelMatch[0];
        }
        // Otherwise just take the first reasonable length (max 10 chars)
        else if (emailName.length > 10) {
          emailName = emailName.substring(0, 10);
        }

        // Capitalize first letter
        firstName = emailName.charAt(0).toUpperCase() + emailName.slice(1).toLowerCase();
      }

      const profileData = {
        firstName,
        email: user.email,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(profileRef, profileData);
      setProfile(profileData);
    } catch (error) {
      console.error('Error creating profile:', error);
    }
  };

  const updateFirstName = async (newFirstName) => {
    if (!user?.uid) return;

    try {
      const profileRef = doc(db, 'users', user.uid, 'profile', 'current');
      await setDoc(profileRef, {
        firstName: newFirstName,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.error('Error updating first name:', error);
    }
  };

  return { profile, loading, updateFirstName };
};

// Hook for fetching any user's profile by ID
export const useUserProfileById = (userId) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        const profileRef = doc(db, 'users', userId, 'profile', 'current');
        const profileDoc = await getDoc(profileRef);

        if (profileDoc.exists()) {
          setProfile(profileDoc.data());
        } else {
          // Return a default profile for users without profiles
          setProfile({ firstName: 'Anonymous' });
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
        setProfile({ firstName: 'Anonymous' });
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [userId]);

  return { profile, loading };
};