// Client wrapper for the `aiAssist` Cloud Function (Anthropic-backed).
//
// The function reads its API key from a locked-down Firestore doc
// (config/anthropic) set via the Firebase console. Until that's configured (and
// the project is on the Blaze plan), calls reject with 'failed-precondition' —
// callers should treat any rejection as "AI unavailable" and fall back.

import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '../firebase';

const fns = getFunctions(app);

// Whether the Anthropic key is configured (config/anthropic doc set). Makes no
// model call and costs nothing. Returns { configured, error } — error is set
// when the function itself is unreachable (deploy/auth), which is distinct from
// "key not set".
export async function aiStatus() {
  const call = httpsCallable(fns, 'aiAssist');
  try {
    const res = await call({ mode: 'status' });
    return { configured: !!(res.data && res.data.configured), error: null };
  } catch (e) {
    return { configured: false, error: (e && e.message) || 'unreachable' };
  }
}

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
