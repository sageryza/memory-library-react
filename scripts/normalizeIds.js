/**
 * Browser Console Script - Copy and paste this into DevTools Console
 *
 * Prerequisites:
 * 1. Be logged into the app
 * 2. Open DevTools (F12 or Cmd+Option+I)
 * 3. Go to Console tab
 * 4. Paste this entire script and press Enter
 */

(async function normalizeAllIds() {
  // Access Firebase from the app's window context
  const firebaseApp = window.__FIREBASE_APP__ || null;

  // Get current user from auth
  let user = null;
  try {
    // Try to get user from Firebase Auth
    const auth = firebase?.auth?.() || window.firebase?.auth?.();
    user = auth?.currentUser;
  } catch (e) {
    console.log('Could not access Firebase auth directly');
  }

  console.log('🔧 Starting ID Normalization...\n');

  let totalFixed = 0;

  // 1. Normalize localStorage
  console.log('💾 Checking localStorage...');
  const localData = localStorage.getItem('memory-library-data');

  if (localData) {
    try {
      const parsed = JSON.parse(localData);
      let localNeedsUpdate = false;

      // Normalize local memories
      if (parsed.memories?.length > 0) {
        const before = parsed.memories.filter(m => typeof m.id !== 'string').length;
        parsed.memories = parsed.memories.map(mem => ({
          ...mem,
          id: String(mem.id)
        }));
        if (before > 0) {
          console.log(`  Fixed ${before} memory IDs`);
          localNeedsUpdate = true;
          totalFixed += before;
        }
      }

      // Normalize local board state
      if (parsed.boardState) {
        // droppedMemories
        if (parsed.boardState.droppedMemories?.length > 0) {
          const before = parsed.boardState.droppedMemories.filter(m => typeof m.id !== 'string').length;
          parsed.boardState.droppedMemories = parsed.boardState.droppedMemories.map(mem => ({
            ...mem,
            id: String(mem.id)
          }));
          if (before > 0) {
            console.log(`  Fixed ${before} droppedMemory IDs`);
            localNeedsUpdate = true;
            totalFixed += before;
          }
        }

        // connections
        if (parsed.boardState.connections?.length > 0) {
          let connFixed = 0;
          parsed.boardState.connections = parsed.boardState.connections.map(conn => {
            const fixed = {
              ...conn,
              from: String(conn.from),
              to: String(conn.to)
            };
            if (typeof conn.from !== 'string' || typeof conn.to !== 'string') {
              connFixed++;
            }
            return fixed;
          });
          if (connFixed > 0) {
            console.log(`  Fixed ${connFixed} connection IDs`);
            localNeedsUpdate = true;
            totalFixed += connFixed;
          }
        }

        // standalonePins
        if (parsed.boardState.standalonePins?.length > 0) {
          const before = parsed.boardState.standalonePins.filter(p => typeof p.id !== 'string').length;
          parsed.boardState.standalonePins = parsed.boardState.standalonePins.map(pin => ({
            ...pin,
            id: String(pin.id)
          }));
          if (before > 0) {
            console.log(`  Fixed ${before} pin IDs`);
            localNeedsUpdate = true;
            totalFixed += before;
          }
        }
      }

      // Normalize libraries
      if (parsed.libraries?.length > 0) {
        const before = parsed.libraries.filter(l => typeof l.id !== 'string').length;
        parsed.libraries = parsed.libraries.map(lib => ({
          ...lib,
          id: String(lib.id)
        }));
        if (before > 0) {
          console.log(`  Fixed ${before} library IDs`);
          localNeedsUpdate = true;
          totalFixed += before;
        }
      }

      if (localNeedsUpdate) {
        localStorage.setItem('memory-library-data', JSON.stringify(parsed));
        console.log('  ✅ localStorage updated\n');
      } else {
        console.log('  ✅ All localStorage IDs are already strings\n');
      }
    } catch (e) {
      console.error('  ❌ Failed to parse localStorage:', e);
    }
  } else {
    console.log('  ℹ️ No localStorage data found\n');
  }

  // 2. Check sessionStorage for board state
  console.log('📦 Checking sessionStorage...');
  const sessionKeys = ['boardPanOffset', 'boardZoomLevel'];
  sessionKeys.forEach(key => {
    const val = sessionStorage.getItem(key);
    if (val) {
      console.log(`  ${key}: ${val.substring(0, 50)}...`);
    }
  });
  console.log('  ✅ sessionStorage checked (no IDs to normalize)\n');

  // Summary
  console.log('========================================');
  console.log('✅ ID Normalization Complete!');
  console.log(`   Total items fixed: ${totalFixed}`);
  console.log('========================================');

  if (totalFixed > 0) {
    console.log('\n🔄 Please refresh the page to see changes.');
  } else {
    console.log('\n✨ All IDs were already normalized!');
  }

  return { totalFixed };
})();
