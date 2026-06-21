// Storage adapter that gives the XI engine its original sget/sset/slist
// contract, but routes:
//   • memory keys ('xi2_mem_<refs>')  -> the shared Firestore memories collection
//     (so XI memories show up natively in the archive), with an optimistic
//     pending buffer so a just-saved memory appears instantly before the
//     Firestore snapshot round-trips back.
//   • state keys ('xi2_pair' / 'xi2_misses' / 'xi2_board') -> per-user XI
//     settings doc (users/{uid}/xiSettings/state), mirrored to localStorage so
//     state loads instantly and survives offline / signed-out use.
//
// POOL is { ev, tw, be, bw } of normalized deck cards ({ id, cap, img, kind }).

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { buildXiMemoryDoc, pairKey, isXiMemory } from './xiMemory';

const STATE_FIELD = { xi2_pair: 'pair', xi2_misses: 'misses', xi2_board: 'board', xi2_screen: 'screen' };

export function makeXiStorage({ userId, getMemories, addMemory, POOL }) {
  // --- card ref helpers -------------------------------------------------
  const normCard = (r) => POOL[r.d] && POOL[r.d][r.i];
  const modeOf = (d) => (d === 'be' || d === 'bw' ? 'board' : 'daily');

  // Reverse map: card id -> { d, i } so a Firestore memory can be turned back
  // into the engine's memKey (for slist / board dots).
  const idToRef = new Map();
  for (const d of Object.keys(POOL)) {
    POOL[d].forEach((cardObj, i) => { idToRef.set(cardObj.id, { d, i }); });
  }

  // pairKey for a set of refs (engine memKey refs), matching how memories are
  // tagged in buildXiMemoryDoc (event id × twist id).
  function pkFromRefs(refs) {
    let ev = null, tw = null;
    for (const r of refs) {
      const c = normCard(r);
      if (!c) continue;
      if (c.kind === 'twist') tw = c; else ev = c;
    }
    return pairKey(ev ? { id: ev.id } : null, tw ? { id: tw.id } : null);
  }

  const tsOf = (m) => {
    const t = Date.parse(m.timestamp);
    if (!Number.isNaN(t)) return t;
    if (typeof m.xiTs === 'number') return m.xiTs;
    return 0;
  };

  // --- optimistic pending memories --------------------------------------
  // Items the user just saved, not yet reflected in the Firestore snapshot.
  let pending = []; // { pk, ts, text }

  function xiMemories() {
    return (getMemories() || []).filter(isXiMemory);
  }

  // Drop pending items once the live snapshot contains them (matched by ts).
  function reconcilePending() {
    if (!pending.length) return;
    const live = new Set(xiMemories().map((m) => m.pairKey + '|' + tsOf(m)));
    pending = pending.filter((p) => !live.has(p.pk + '|' + p.ts));
  }

  function memoriesForKey(memk) {
    const refs = refsFromKey(memk);
    const pk = pkFromRefs(refs);
    reconcilePending();
    const live = xiMemories()
      .filter((m) => m.pairKey === pk)
      .map((m) => ({ text: m.content, ts: tsOf(m) }));
    const pend = pending.filter((p) => p.pk === pk).map((p) => ({ text: p.text, ts: p.ts }));
    return [...pend, ...live].sort((a, b) => b.ts - a.ts);
  }

  function refsFromKey(k) {
    return k.replace('xi2_mem_', '').split('-').map((t) => ({ d: t.slice(0, 2), i: parseInt(t.slice(2), 10) }));
  }

  async function saveMemories(memk, arr) {
    const refs = refsFromKey(memk);
    let ev = null, tw = null;
    for (const r of refs) {
      const c = normCard(r);
      if (!c) continue;
      if (c.kind === 'twist') tw = c; else ev = c;
    }
    const pk = pkFromRefs(refs);
    const mode = modeOf(refs[0] && refs[0].d);
    // Items not already known (live or pending) are new -> persist them.
    const known = new Set([
      ...xiMemories().filter((m) => m.pairKey === pk).map((m) => tsOf(m)),
      ...pending.filter((p) => p.pk === pk).map((p) => p.ts),
    ]);
    for (const item of arr) {
      if (known.has(item.ts)) continue;
      pending.push({ pk, ts: item.ts, text: item.text });
      const when = new Date(item.ts);
      const docData = {
        ...buildXiMemoryDoc({
          text: item.text,
          event: ev ? { id: ev.id, cap: ev.cap } : null,
          twist: tw ? { id: tw.id, cap: tw.cap } : null,
          mode,
        }),
        timestamp: when.toISOString(),
        dateTime: when.toLocaleDateString(),
      };
      try {
        await addMemory(docData);
      } catch (e) {
        console.error('[XI] Failed to save memory to archive:', e);
      }
    }
  }

  // --- per-user state (pair / misses / board) ---------------------------
  const lsKey = (k) => `xi_${userId || 'anon'}_${k}`;
  const stateCache = {};
  // hydrate instantly from localStorage
  for (const k of Object.keys(STATE_FIELD)) {
    try {
      const v = localStorage.getItem(lsKey(k));
      if (v != null) stateCache[k] = JSON.parse(v);
    } catch { /* ignore */ }
  }

  const stateRef = userId ? doc(db, 'users', userId, 'xiSettings', 'state') : null;
  let hydrated = false;
  async function hydrateFromFirestore(onReady) {
    if (!stateRef || hydrated) return;
    hydrated = true;
    try {
      const snap = await getDoc(stateRef);
      if (snap.exists()) {
        const data = snap.data();
        let changed = false;
        for (const [k, field] of Object.entries(STATE_FIELD)) {
          if (data[field] !== undefined && stateCache[k] === undefined) { stateCache[k] = data[field]; changed = true; }
        }
        if (changed && onReady) onReady();
      }
    } catch (e) {
      console.error('[XI] Could not load settings:', e);
    }
  }

  let saveTimer = null;
  function persistState() {
    if (!stateRef) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const payload = {};
      for (const [k, field] of Object.entries(STATE_FIELD)) {
        if (stateCache[k] !== undefined) payload[field] = stateCache[k];
      }
      setDoc(stateRef, payload, { merge: true }).catch((e) => console.error('[XI] Could not save settings:', e));
    }, 400);
  }

  // --- public adapter ---------------------------------------------------
  const adapter = {
    async get(k) {
      if (k.indexOf('xi2_mem_') === 0) return memoriesForKey(k);
      return k in stateCache ? stateCache[k] : null;
    },
    async set(k, v) {
      if (k.indexOf('xi2_mem_') === 0) return saveMemories(k, v);
      stateCache[k] = v;
      try { localStorage.setItem(lsKey(k), JSON.stringify(v)); } catch { /* ignore */ }
      persistState();
    },
    async list() {
      reconcilePending();
      const keys = new Set();
      const add = (refs) => {
        if (refs.some((r) => !r)) return;
        keys.add('xi2_mem_' + refs.map((r) => r.d + r.i).slice().sort().join('-'));
      };
      for (const m of xiMemories()) {
        const er = m.event && idToRef.get(m.event.id);
        const tr = m.twist && idToRef.get(m.twist.id);
        add([er, tr]);
      }
      return [...keys];
    },
    hydrateFromFirestore,
  };

  return adapter;
}

export default makeXiStorage;
