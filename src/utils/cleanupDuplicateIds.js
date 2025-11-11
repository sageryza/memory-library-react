import {
  collection,
  getDocs,
  updateDoc,
  doc,
  deleteField
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * One-time cleanup function to remove duplicate 'id' fields from memory documents
 * This fixes the issue where memories have both a document ID and a data.id field
 */
export const cleanupDuplicateIds = async (userId) => {
  if (!userId) {
    console.error('User ID is required for cleanup');
    return { success: false, error: 'No user ID provided' };
  }

  try {
    // Get all memories for the user
    const memoriesRef = collection(db, 'users', userId, 'memories');
    const snapshot = await getDocs(memoriesRef);

    let cleanedCount = 0;
    let errorCount = 0;
    const errors = [];

    // Process each document
    const cleanupPromises = snapshot.docs.map(async (docSnapshot) => {
      const data = docSnapshot.data();

      // Check if this document has a duplicate 'id' field in its data
      if (data.id && data.id !== docSnapshot.id) {
        try {
          // Remove the 'id' field from the document data
          const docRef = doc(db, 'users', userId, 'memories', docSnapshot.id);
          await updateDoc(docRef, {
            id: deleteField()  // This removes the field entirely
          });

          cleanedCount++;
        } catch (error) {
          errorCount++;
          errors.push({ docId: docSnapshot.id, error: error.message });
          console.error(`Failed to clean memory ${docSnapshot.id}:`, error);
        }
      }
    });

    // Wait for all cleanup operations to complete
    await Promise.all(cleanupPromises);

    return {
      success: true,
      cleanedCount,
      errorCount,
      errors,
      totalMemories: snapshot.docs.length
    };

  } catch (error) {
    console.error('Cleanup failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export default cleanupDuplicateIds;