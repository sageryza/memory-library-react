// Client wrapper for the `aiAssist` Cloud Function (Anthropic-backed).
//
// The function reads its API key from a locked-down Firestore doc
// (config/anthropic) set via the Firebase console. Until that's configured (and
// the project is on the Blaze plan), calls reject with 'failed-precondition' —
// callers should treat any rejection as "AI unavailable" and fall back.

import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '../firebase';

const fns = getFunctions(app);

// Generate a short, human title for a memory's text. Returns '' if AI is off.
export async function aiGenerateTitle(text) {
  const call = httpsCallable(fns, 'aiAssist');
  const res = await call({ mode: 'title', text });
  return (res.data && res.data.title) || '';
}

// Distill an array of memory texts into ~n candidate card phrases.
export async function aiGenerateCards(memories, n = 24) {
  const call = httpsCallable(fns, 'aiAssist');
  const res = await call({ mode: 'cards', memories, n });
  return (res.data && res.data.cards) || [];
}

export default { aiGenerateTitle, aiGenerateCards };
