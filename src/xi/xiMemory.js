// Mapping between XI's game model and the shared memory-library schema.
//
// An XI memory is stored as a STANDARD memory document in the existing
// users/{uid}/memories collection, just tagged with XI-specific fields so the
// archive and other components pick it up natively:
//
//   content   -> the memory the user wrote (body; archive searches/renders this)
//   title     -> the pairing rendered as a sentence ("I [event], [twist]")
//   hashtags  -> ['#xi'] so XI memories are filterable in the archive
//   source    -> 'xi'
//   mode      -> 'daily' | 'board'
//   event     -> { id, cap }  (stable id + caption; art resolved from the deck)
//   twist     -> { id, cap }
//   pairKey   -> stable key for the pairing (event.id × twist.id)
//
// Note: card art (base64 webp) is intentionally NOT stored on the memory — it
// would blow past Firestore's 1MB document limit. Art is resolved from the
// bundled deck via the stable card id at render time.

export const XI_SOURCE = 'xi';
export const XI_HASHTAG = '#xi';

// A stable key for a pairing, independent of which card was tapped first.
export function pairKey(eventRef, twistRef) {
  const e = (eventRef && eventRef.id) || '';
  const t = (twistRef && twistRef.id) || '';
  return `${e}__${t}`;
}

function cardRef(card) {
  if (!card) return null;
  return { id: card.id || null, cap: card.cap || '' };
}

// Build the human-readable pairing sentence: "I [event], [twist]".
// Events are first-person actions ("I ___"); twists are universal modifiers.
export function pairingSentence(eventRef, twistRef) {
  const ev = (eventRef && eventRef.cap ? eventRef.cap : '').toLowerCase();
  const tw = (twistRef && twistRef.cap ? twistRef.cap : '').toLowerCase();
  if (ev && tw) return `I ${ev}, ${tw}`;
  if (ev) return `I ${ev}`;
  return tw;
}

// Build a memory document (without server timestamps; useMemories adds those)
// from an XI pairing + the user's text.
export function buildXiMemoryDoc({ text, event, twist, mode }) {
  const evRef = cardRef(event);
  const twRef = cardRef(twist);
  const now = new Date();
  return {
    content: String(text || '').trim(),
    title: pairingSentence(evRef, twRef),
    hashtags: [XI_HASHTAG],
    source: XI_SOURCE,
    mode: mode || 'daily',
    event: evRef,
    twist: twRef,
    pairKey: pairKey(evRef, twRef),
    timestamp: now.toISOString(),
    dateTime: now.toLocaleDateString(),
  };
}

// True if a memory came from XI.
export function isXiMemory(memory) {
  return memory && memory.source === XI_SOURCE;
}

// All XI memories for a given pairing, newest first.
export function memoriesForPairing(memories, eventRef, twistRef) {
  const key = pairKey(eventRef, twistRef);
  return (memories || [])
    .filter((m) => isXiMemory(m) && m.pairKey === key)
    .sort((a, b) => {
      const ta = a.timestamp || '';
      const tb = b.timestamp || '';
      return tb.localeCompare(ta);
    });
}

export default { buildXiMemoryDoc, pairKey, pairingSentence, isXiMemory, memoriesForPairing };
