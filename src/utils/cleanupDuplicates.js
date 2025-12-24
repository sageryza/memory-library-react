/**
 * Duplicate Cleanup Utility
 *
 * To use: Import and call from browser console or temporarily add to a component
 *
 * In console after app loads:
 *   1. Run: window.scanDuplicates()
 *   2. Review the output
 *   3. Run: window.deleteDuplicates()
 */

import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../firebase';

// Scan for duplicates
export async function scanDuplicates() {
  const user = auth.currentUser;

  if (!user) {
    console.log('❌ Not logged in. Please log in first.');
    return null;
  }

  console.log(`📧 Logged in as: ${user.email}`);
  console.log('🔍 Scanning for duplicates...\n');

  // Fetch all memories from Firebase
  const memoriesRef = collection(db, 'users', user.uid, 'memories');
  const snapshot = await getDocs(memoriesRef);

  const memories = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  console.log(`Total memories in Firebase: ${memories.length}`);

  // Group by content
  const groups = new Map();
  memories.forEach(m => {
    const key = (m.content || '').trim().toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(m);
  });

  // Find duplicates (keep oldest based on createdAt, mark rest for deletion)
  const toDelete = [];
  const toKeep = [];

  groups.forEach((mems, content) => {
    if (mems.length > 1) {
      // Sort by createdAt (oldest first)
      mems.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || 0;
        const bTime = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || 0;
        return aTime - bTime;
      });
      toKeep.push(mems[0]);
      toDelete.push(...mems.slice(1));
    } else {
      toKeep.push(mems[0]);
    }
  });

  console.log(`\n📊 Summary:`);
  console.log(`   Keeping: ${toKeep.length} unique memories`);
  console.log(`   Deleting: ${toDelete.length} duplicates`);

  if (toDelete.length === 0) {
    console.log('\n✅ No duplicates found!');
    return { toDelete: [], toKeep };
  }

  console.log(`\n🗑️ Duplicates to delete:`);
  toDelete.slice(0, 10).forEach(m => {
    const preview = (m.content || '(empty)').substring(0, 50);
    console.log(`   ID: ${m.id} | "${preview}${preview.length >= 50 ? '...' : ''}"`);
  });
  if (toDelete.length > 10) {
    console.log(`   ... and ${toDelete.length - 10} more`);
  }

  // Store globally for deletion
  window.__DUPLICATES_TO_DELETE__ = toDelete;
  window.__USER_ID__ = user.uid;

  console.log(`\n⚠️  To delete these duplicates, run: window.deleteDuplicates()`);

  return { toDelete, toKeep };
}

// Delete the found duplicates
export async function deleteDuplicates() {
  const toDelete = window.__DUPLICATES_TO_DELETE__;
  const userId = window.__USER_ID__;

  if (!toDelete || toDelete.length === 0) {
    console.log('No duplicates to delete. Run window.scanDuplicates() first.');
    return;
  }

  console.log(`🗑️ Deleting ${toDelete.length} duplicates from Firebase...`);

  let deleted = 0;
  let errors = 0;

  for (const memory of toDelete) {
    try {
      const memoryRef = doc(db, 'users', userId, 'memories', memory.id);
      await deleteDoc(memoryRef);
      deleted++;
      if (deleted % 10 === 0) {
        console.log(`   Deleted ${deleted}/${toDelete.length}...`);
      }
    } catch (err) {
      console.error(`   Error deleting ${memory.id}:`, err.message);
      errors++;
    }
  }

  console.log(`\n✅ Done! Deleted ${deleted} duplicates.`);
  if (errors > 0) {
    console.log(`⚠️  ${errors} errors occurred.`);
  }
  console.log(`🔄 Refresh the page to see changes.`);

  // Cleanup
  delete window.__DUPLICATES_TO_DELETE__;
  delete window.__USER_ID__;

  return { deleted, errors };
}

// Expose to window for console access
if (typeof window !== 'undefined') {
  window.scanDuplicates = scanDuplicates;
  window.deleteDuplicates = deleteDuplicates;
}

export default { scanDuplicates, deleteDuplicates };
