// IO for the SHARED midjourney deck extras — cards Sage adds for everyone,
// plus global removals — stored in one Firestore doc (xi/deckExtras):
//   added   : append-only [{id, cap, img, ts}] — never reordered or deleted,
//             so pool indices derived from array order stay stable on every
//             client (Versus boards reference cards by pool index).
//   removed : [baseId] hidden everywhere (bundled or added) — reversible.
// Cached in localStorage so pools assemble instantly at module load; callers
// re-fetch in the background and apply any delta (see decks.js).
//
// This file only does IO — no deck imports — so decks.js can import it.
import { doc, getDoc, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../firebase';

const LS = 'xi_deckExtras_v1';

const normalize = (d) => ({
  added: Array.isArray(d?.added) ? d.added.filter((e) => e && e.id) : [],
  removed: Array.isArray(d?.removed) ? d.removed.filter((x) => typeof x === 'string') : [],
});

export function cachedDeckExtras() {
  try { return normalize(JSON.parse(localStorage.getItem(LS) || 'null')); }
  catch { return { added: [], removed: [] }; }
}

const extrasRef = () => doc(db, 'xi', 'deckExtras');

export async function fetchDeckExtras() {
  const snap = await getDoc(extrasRef());
  const extras = normalize(snap.exists() ? snap.data() : {});
  try { localStorage.setItem(LS, JSON.stringify(extras)); } catch { /* ignore */ }
  return extras;
}

// ── curator writes (Firestore rules restrict these to Sage's account) ──

const genId = () => `xr${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/// Upload the card art, then append the card. Returns the new entry.
export async function addSharedCard({ cap, file }) {
  const id = genId();
  const img = await uploadCardArt(id, file);
  const entry = { id, cap: String(cap || '').trim(), img, ts: Date.now() };
  await setDoc(extrasRef(), { added: arrayUnion(entry) }, { merge: true });
  return entry;
}

async function uploadCardArt(id, file) {
  const ext = (file.name || '').split('.').pop() || 'jpg';
  const r = storageRef(getStorage(), `xi-deck/${id}.${ext}`);
  await uploadBytes(r, file, { contentType: file.type || 'image/jpeg' });
  return getDownloadURL(r);
}

/// Hide a card everywhere (bundled or added), by base id. Reversible.
export async function removeSharedCard(baseId) {
  await setDoc(extrasRef(), { removed: arrayUnion(baseId) }, { merge: true });
}

export async function restoreSharedCard(baseId) {
  await setDoc(extrasRef(), { removed: arrayRemove(baseId) }, { merge: true });
}
