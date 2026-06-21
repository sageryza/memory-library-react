import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';

// Where the unauthenticated app actually stores its data (see useLocalStorage).
// The original migration read 'memoryLibraryData' — the wrong key — so it never
// found anything and stamped accounts `migrated: true`, locking out a retry and
// silently stranding signed-out memories. We read the correct key now, keep the
// old ones as fallbacks, and gate on a fresh `migratedV2` flag so the fixed
// migration runs once even for accounts the buggy version already "migrated".
const LOCAL_KEYS = ['memoryLibraryLocalData', 'memoryLibraryData', 'memories'];

function readLocalMemories() {
  for (const key of LOCAL_KEYS) {
    let raw;
    try { raw = localStorage.getItem(key); } catch { raw = null; }
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.memories)) return parsed.memories;
      if (Array.isArray(parsed)) return parsed;
    } catch { /* try next key */ }
  }
  return [];
}

// Stable de-dupe key so a re-run never doubles a memory already in the account.
function dedupeKey(m) {
  const ts = m.timestamp
    || (m.createdAt && typeof m.createdAt.toMillis === 'function' ? m.createdAt.toMillis() : m.createdAt)
    || '';
  return (m.content || m.text || '') + '|' + (m.pairKey || '') + '|' + ts;
}

export const migrateLocalStorageToFirestore = async (userId) => {
  if (!userId) return;

  try {
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists() && userDoc.data()?.migratedV2 === true) {
      return; // already handled by the fixed migration
    }

    const memories = readLocalMemories();

    if (!memories.length) {
      await setDoc(userDocRef, {
        migrated: true, migratedV2: true, migratedAt: serverTimestamp(), migratedCount: 0
      }, { merge: true });
      return;
    }

    const memoriesRef = collection(db, 'users', userId, 'memories');

    // Load what's already in the account so we don't create duplicates.
    const existingSnap = await getDocs(memoriesRef);
    const seen = new Set();
    existingSnap.forEach((d) => seen.add(dedupeKey(d.data())));

    let added = 0;
    for (const memory of memories) {
      const { id: _id, ...rest } = memory; // drop local id; Firestore assigns its own
      const key = dedupeKey(rest);
      if (seen.has(key)) continue;

      // Preserve EVERY field (incl. XI's source/event/twist/pairKey/mode/dateTime)
      // and just normalise content + server timestamps.
      const memoryData = {
        ...rest,
        content: rest.content || rest.text || '',
        title: rest.title || '',
        hashtags: rest.hashtags || [],
        createdAt: rest.timestamp ? new Date(rest.timestamp) : (rest.createdAt ? new Date(rest.createdAt) : serverTimestamp()),
        updatedAt: serverTimestamp(),
      };

      await addDoc(memoriesRef, memoryData);
      seen.add(key);
      added++;
    }

    await setDoc(userDocRef, {
      migrated: true, migratedV2: true, migratedAt: serverTimestamp(), migratedCount: added
    }, { merge: true });
  } catch (error) {
    // Do NOT set the flag on failure, so the next load retries.
    console.error('Error during migration:', error);
    throw error;
  }
};

export default migrateLocalStorageToFirestore;
