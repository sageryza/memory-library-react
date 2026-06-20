/**
 * One-time importer for standalone XI JSON backups.
 *
 * The standalone XI app exports backups shaped like:
 *   { "app": "XI",
 *     "entries": [ { "cards": ["EVENT CAP", "TWIST CAP"],
 *                    "memories": [ { "text": "...", "ts": 123 } ] } ],
 *     "stumped": [ { "cards": ["EVENT", "TWIST"], "count": 2 } ],
 *     "stumpedByCard": { "CARD": 1 } }
 *
 * Each entry's memories become standard memory-library documents (body = text,
 * event/twist = cards, source = 'xi') in users/{uid}/memories, and the stumped
 * tallies are merged into the user's XI settings (misses, keyed by pairing).
 *
 * Cards are matched to the bundled decks by caption (case-insensitive) so they
 * get a stable id; unmatched captions still import with id = slug(caption).
 *
 * Usage (browser console, while signed in):
 *   1. window.importXiBackup(backupObject)   // pass the parsed JSON
 *      or window.importXiBackupFromText(jsonString)
 */

import { collection, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { buildXiMemoryDoc, pairKey } from '../xi/xiMemory';

// Build a caption -> card lookup across both decks (prefer board art when a
// caption appears in both decks). Decks are imported dynamically so this
// utility doesn't pull XI's ~1.3 MB of deck art into the main bundle.
function buildCaptionIndex(dailyDeck, boardDeck) {
  const index = new Map();
  for (const deck of [dailyDeck, boardDeck]) {
    for (const card of [...deck.events, ...deck.twists]) {
      const key = card.cap.trim().toLowerCase();
      if (!index.has(key)) index.set(key, card);
    }
  }
  return index;
}

// Resolve a caption to a card ref. Events are the first card in a pairing,
// twists the second — we use that positional hint when the deck lookup is
// ambiguous, but the stable id is what matters downstream.
function captionToRef(caption, kindHint, captionIndex, slugifyCaption) {
  const cap = String(caption || '').trim();
  const found = captionIndex.get(cap.toLowerCase());
  if (found) return { id: found.id, cap: found.cap };
  // Unmatched: synthesize a stable id from the caption + kind hint.
  return { id: `imported-${kindHint}-${slugifyCaption(cap)}`, cap: cap.toUpperCase() };
}

export async function importXiBackup(backup, options = {}) {
  const user = auth.currentUser;
  if (!user) {
    console.log('❌ Not signed in. Please sign in first.');
    return { ok: false, error: 'not-signed-in' };
  }
  if (!backup || !Array.isArray(backup.entries)) {
    console.log('❌ Invalid backup: expected an object with an "entries" array.');
    return { ok: false, error: 'invalid-backup' };
  }

  const dryRun = !!options.dryRun;
  const mode = options.mode || 'daily';
  const { dailyDeck, boardDeck, slugifyCaption } = await import('../xi/decks');
  const captionIndex = buildCaptionIndex(dailyDeck, boardDeck);
  const memoriesRef = collection(db, 'users', user.uid, 'memories');

  let imported = 0;
  let skipped = 0;

  for (const entry of backup.entries) {
    const cards = entry.cards || [];
    const eventRef = captionToRef(cards[0], 'event', captionIndex, slugifyCaption);
    const twistRef = captionToRef(cards[1], 'twist', captionIndex, slugifyCaption);

    for (const mem of entry.memories || []) {
      const text = (mem.text || '').trim();
      if (!text) {
        skipped += 1;
        continue;
      }
      const ts = typeof mem.ts === 'number' ? new Date(mem.ts) : new Date();
      const docData = {
        ...buildXiMemoryDoc({ text, event: eventRef, twist: twistRef, mode }),
        // Preserve the original authored time for chronology/archive ordering.
        timestamp: ts.toISOString(),
        dateTime: ts.toLocaleDateString(),
      };

      if (dryRun) {
        imported += 1;
        continue;
      }

      await addDoc(memoriesRef, {
        ...docData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      imported += 1;
    }
  }

  // Merge stumped tallies into XI settings misses, keyed by pairing.
  const misses = {};
  for (const s of backup.stumped || []) {
    const cards = s.cards || [];
    const eventRef = captionToRef(cards[0], 'event', captionIndex, slugifyCaption);
    const twistRef = captionToRef(cards[1], 'twist', captionIndex, slugifyCaption);
    misses[pairKey(eventRef, twistRef)] = s.count || 1;
  }
  if (!dryRun && Object.keys(misses).length > 0) {
    const settingsRef = doc(db, 'users', user.uid, 'xiSettings', 'state');
    await setDoc(settingsRef, { misses }, { merge: true });
  }

  const summary = { ok: true, imported, skipped, missPairings: Object.keys(misses).length, dryRun };
  console.log(`${dryRun ? '🔎 [dry run] ' : '✅ '}XI import complete:`, summary);
  return summary;
}

export async function importXiBackupFromText(jsonText, options = {}) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    console.log('❌ Could not parse backup JSON:', e.message);
    return { ok: false, error: 'parse-error' };
  }
  return importXiBackup(parsed, options);
}

// Expose on window for one-time manual use, mirroring the repo's other
// temporary migration helpers (window.scanProvenance, etc.).
if (typeof window !== 'undefined') {
  window.importXiBackup = importXiBackup;
  window.importXiBackupFromText = importXiBackupFromText;
}

export default importXiBackup;
