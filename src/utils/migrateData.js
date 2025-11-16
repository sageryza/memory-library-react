import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';

export const migrateLocalStorageToFirestore = async (userId) => {
  if (!userId) return;

  try {
    // Check if user has already been migrated
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);

    // If user document exists and has migrated flag, skip migration
    if (userDoc.exists() && userDoc.data()?.migrated === true) {
      return;
    }

    // Check for localStorage data
    const localStorageData = localStorage.getItem('memoryLibraryData');
    if (!localStorageData) {
      // No data to migrate, just set the flag
      await setDoc(userDocRef, {
        migrated: true,
        migratedAt: serverTimestamp()
      }, { merge: true });
      return;
    }

    // Parse localStorage data
    let memories = [];
    try {
      const parsed = JSON.parse(localStorageData);
      // Check if data is in the expected format (object with memories property)
      if (parsed && parsed.memories && Array.isArray(parsed.memories)) {
        memories = parsed.memories;
      } else if (Array.isArray(parsed)) {
        // Fallback for older format where memories were stored directly as array
        memories = parsed;
      } else {
        // No memories found - still mark as migrated to prevent repeated attempts
        await setDoc(userDocRef, {
          migrated: true,
          migratedAt: serverTimestamp(),
          migratedCount: 0
        }, { merge: true });
        return;
      }
    } catch (error) {
      console.error('Error parsing localStorage data:', error);
      return;
    }

    // Migrate memories to Firestore
    const memoriesRef = collection(db, 'users', userId, 'memories');
    const migrationPromises = memories.map(async (memory) => {
      // Remove the 'id' field to prevent duplicate IDs
      const { id, ...memoryWithoutId } = memory;

      // Transform memory data to match Firestore structure
      const memoryData = {
        title: memoryWithoutId.title || '',
        content: memoryWithoutId.content || memoryWithoutId.text || '',
        hashtags: memoryWithoutId.hashtags || [],
        category: memoryWithoutId.category || 'general',
        createdAt: memoryWithoutId.timestamp ? new Date(memoryWithoutId.timestamp) : serverTimestamp(),
        updatedAt: serverTimestamp(),
        // Preserve any additional fields (except 'id')
        ...(memoryWithoutId.url && { url: memoryWithoutId.url }),
        ...(memoryWithoutId.imageUrl && { imageUrl: memoryWithoutId.imageUrl }),
        ...(memoryWithoutId.date && { date: memoryWithoutId.date })
      };

      return addDoc(memoriesRef, memoryData);
    });

    // Wait for all memories to be migrated
    await Promise.all(migrationPromises);

    // Set migration flag
    await setDoc(userDocRef, {
      migrated: true,
      migratedAt: serverTimestamp(),
      migratedCount: memories.length
    }, { merge: true });

    // Optional: Clear localStorage after successful migration
    // Uncomment the line below if you want to remove data after migration
    // localStorage.removeItem('memoryLibraryData');
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  }
};

export default migrateLocalStorageToFirestore;