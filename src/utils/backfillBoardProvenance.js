/**
 * Board Provenance Backfill Utility
 *
 * Populates sourceBoardId and boardIds for existing memories based on
 * which boards they currently appear on.
 *
 * To use: Import and call from browser console or temporarily add to a component
 *
 * In console after app loads:
 *   1. Run: window.scanProvenance()
 *   2. Review the output
 *   3. Run: window.backfillProvenance()
 */

import { collection, getDocs, getDoc, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

// Scan memories and boards to determine what needs backfilling
export async function scanProvenance() {
  const user = auth.currentUser;

  if (!user) {
    console.log('❌ Not logged in. Please log in first.');
    return null;
  }

  console.log(`📧 Logged in as: ${user.email}`);
  console.log('🔍 Scanning for memories needing provenance backfill...\n');

  // Fetch all memories
  const memoriesRef = collection(db, 'users', user.uid, 'memories');
  const memoriesSnapshot = await getDocs(memoriesRef);
  const memories = new Map();
  memoriesSnapshot.docs.forEach(doc => {
    memories.set(doc.id, { id: doc.id, ...doc.data() });
  });

  console.log(`Total memories: ${memories.size}`);

  // Fetch all saved boards
  const boardsRef = collection(db, 'users', user.uid, 'boards');
  const boardsSnapshot = await getDocs(boardsRef);
  const boards = boardsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  console.log(`Total saved boards: ${boards.length}`);

  // Also check the current board state
  const boardStateRef = doc(db, 'users', user.uid, 'boardState', 'current');
  let currentBoardMemories = [];
  try {
    const boardStateSnapshot = await getDoc(boardStateRef);
    if (boardStateSnapshot.exists()) {
      currentBoardMemories = boardStateSnapshot.data().droppedMemories || [];
    }
  } catch (e) {
    console.log('Note: Could not read current board state');
  }

  // Build a map: memoryId -> [boardIds]
  const memoryToBoardsMap = new Map();

  // Process saved boards
  boards.forEach(board => {
    const droppedMemories = board.droppedMemories || [];
    droppedMemories.forEach(dm => {
      const memId = String(dm.id);
      if (!memoryToBoardsMap.has(memId)) {
        memoryToBoardsMap.set(memId, []);
      }
      if (!memoryToBoardsMap.get(memId).includes(board.id)) {
        memoryToBoardsMap.get(memId).push(board.id);
      }
    });
  });

  // Note: We don't include current board state since we don't know its name
  // The current board will be saved to a named board eventually

  // Determine what needs updating
  const updates = [];

  memoryToBoardsMap.forEach((boardIds, memoryId) => {
    const memory = memories.get(memoryId);
    if (!memory) {
      console.log(`   ⚠️  Memory ${memoryId} found on boards but doesn't exist in memories collection`);
      return;
    }

    const currentSourceBoardId = memory.sourceBoardId || null;
    const currentBoardIds = memory.boardIds || [];

    // Determine new values
    const newSourceBoardId = currentSourceBoardId || boardIds[0]; // First board if not set
    const newBoardIds = [...new Set([...currentBoardIds, ...boardIds])]; // Merge and dedupe

    // Check if update is needed
    const needsUpdate =
      currentSourceBoardId !== newSourceBoardId ||
      JSON.stringify(currentBoardIds.sort()) !== JSON.stringify(newBoardIds.sort());

    if (needsUpdate) {
      updates.push({
        memoryId,
        title: (memory.title || '').replace(/<br\s*\/?>/g, ' ').substring(0, 50),
        currentSourceBoardId,
        currentBoardIds,
        newSourceBoardId,
        newBoardIds
      });
    }
  });

  // Count memories with no board association
  let memoriesWithProvenance = 0;
  let memoriesWithoutProvenance = 0;
  memories.forEach(mem => {
    if (mem.sourceBoardId || (mem.boardIds && mem.boardIds.length > 0)) {
      memoriesWithProvenance++;
    } else {
      memoriesWithoutProvenance++;
    }
  });

  console.log(`\n📊 Summary:`);
  console.log(`   Memories already with provenance: ${memoriesWithProvenance}`);
  console.log(`   Memories without provenance: ${memoriesWithoutProvenance}`);
  console.log(`   Memories on boards needing update: ${updates.length}`);

  if (updates.length === 0) {
    console.log('\n✅ No backfill needed!');
    return { updates: [], boards: boards.map(b => b.id) };
  }

  console.log(`\n📝 Updates to apply:`);
  updates.slice(0, 10).forEach(u => {
    console.log(`   Memory: "${u.title}${u.title.length >= 50 ? '...' : ''}"`);
    console.log(`      sourceBoardId: ${u.currentSourceBoardId || '(none)'} → ${u.newSourceBoardId}`);
    console.log(`      boardIds: [${u.currentBoardIds.join(', ') || '(none)'}] → [${u.newBoardIds.join(', ')}]`);
  });
  if (updates.length > 10) {
    console.log(`   ... and ${updates.length - 10} more`);
  }

  // Store globally for backfill
  window.__PROVENANCE_UPDATES__ = updates;
  window.__USER_ID__ = user.uid;

  console.log(`\n⚠️  To apply these updates, run: window.backfillProvenance()`);

  return { updates, boards: boards.map(b => b.id) };
}

// Apply the backfill updates
export async function backfillProvenance() {
  const updates = window.__PROVENANCE_UPDATES__;
  const userId = window.__USER_ID__;

  if (!updates || updates.length === 0) {
    console.log('No updates to apply. Run window.scanProvenance() first.');
    return;
  }

  console.log(`📝 Applying ${updates.length} provenance updates...`);

  let updated = 0;
  let errors = 0;

  for (const update of updates) {
    try {
      const memoryRef = doc(db, 'users', userId, 'memories', update.memoryId);
      await updateDoc(memoryRef, {
        sourceBoardId: update.newSourceBoardId,
        boardIds: update.newBoardIds
      });
      updated++;
      if (updated % 10 === 0) {
        console.log(`   Updated ${updated}/${updates.length}...`);
      }
    } catch (err) {
      console.error(`   Error updating ${update.memoryId}:`, err.message);
      errors++;
    }
  }

  console.log(`\n✅ Done! Updated ${updated} memories.`);
  if (errors > 0) {
    console.log(`⚠️  ${errors} errors occurred.`);
  }
  console.log(`🔄 Refresh the page to see changes.`);

  // Cleanup
  delete window.__PROVENANCE_UPDATES__;
  delete window.__USER_ID__;

  return { updated, errors };
}

// Expose to window for console access
if (typeof window !== 'undefined') {
  window.scanProvenance = scanProvenance;
  window.backfillProvenance = backfillProvenance;
}

export default { scanProvenance, backfillProvenance };
