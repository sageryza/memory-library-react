// Firestore data layer. The catalog stays hardcoded in catalog.js — only
// interactions live in Firestore, namespaced simt* because the database is
// shared with the memory-library games:
//
//   simtProducts/{pid}                      — aggregates (Cloud Function-maintained):
//                                             voteUp, voteDown, hearts, reserved, raised, investors
//   simtProducts/{pid}/simtVotes/{uid}      — { dir: "up"|"down", uid, pid, at }
//   simtProducts/{pid}/simtHearts/{uid}     — { uid, pid, at }
//   simtProducts/{pid}/simtPreorders/{uid}  — { uid, pid, variant, at }
//   simtProducts/{pid}/simtInvestments/{uid}— { uid, pid, amount, pay: "now"|"later", at }
//   simtSubmissions/{subId}                 — user-submitted items, status pending|approved|rejected
//
// pid is the numeric catalog id (as a string) or a submission doc id.
// Aggregate docs are locked to clients; functions/simt.js maintains them.

import {
  addDoc, collection, collectionGroup, deleteDoc, doc, onSnapshot,
  query, runTransaction, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "./firebase";

export const PRODUCTS = "simtProducts";
export const SUBMISSIONS = "simtSubmissions";
const VOTES = "simtVotes";
const HEARTS = "simtHearts";
const PREORDERS = "simtPreorders";
const INVESTMENTS = "simtInvestments";

// ---- listeners ----

// All aggregate docs → { pid: {voteUp, voteDown, hearts, reserved, raised, investors} }
export function listenAggregates(cb) {
  return onSnapshot(collection(db, PRODUCTS), (snap) => {
    const m = {};
    snap.forEach((d) => { m[d.id] = d.data(); });
    cb(m);
  });
}

// Approved submissions, oldest first (sorted client-side to avoid a composite index).
export function listenApprovedSubmissions(cb) {
  const q = query(collection(db, SUBMISSIONS), where("status", "==", "approved"));
  return onSnapshot(q, (snap) => {
    const rows = [];
    snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
    rows.sort((a, b) => (a.at?.toMillis?.() || 0) - (b.at?.toMillis?.() || 0));
    cb(rows);
  });
}

// Every submission regardless of status — /results only (rules gate it).
export function listenAllSubmissions(cb) {
  return onSnapshot(collection(db, SUBMISSIONS), (snap) => {
    const rows = [];
    snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
    rows.sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0));
    cb(rows);
  });
}

// The signed-in user's own interactions across every product, one
// collection-group query per type → cb(type, { pid: docData }).
export function listenMine(uid, cb) {
  const types = [
    ["votes", VOTES],
    ["hearts", HEARTS],
    ["preorders", PREORDERS],
    ["investments", INVESTMENTS],
  ];
  const unsubs = types.map(([label, coll]) =>
    onSnapshot(query(collectionGroup(db, coll), where("uid", "==", uid)), (snap) => {
      const m = {};
      snap.forEach((d) => { m[d.data().pid] = d.data(); });
      cb(label, m);
    })
  );
  return () => unsubs.forEach((u) => u());
}

// ---- writes (all require a signed-in user; rules enforce it) ----

// Voting the same direction again clears it; the other direction switches.
export function setVote(uid, pid, dir, current) {
  const d = doc(db, PRODUCTS, pid, VOTES, uid);
  if (current === dir) return deleteDoc(d);
  return setDoc(d, { dir, uid, pid, at: serverTimestamp() });
}

export function toggleHeart(uid, pid, hasHeart) {
  const d = doc(db, PRODUCTS, pid, HEARTS, uid);
  if (hasHeart) return deleteDoc(d);
  return setDoc(d, { uid, pid, at: serverTimestamp() });
}

export function preorder(uid, pid, variant) {
  const d = doc(db, PRODUCTS, pid, PREORDERS, uid);
  return setDoc(d, { uid, pid, variant: variant || null, at: serverTimestamp() });
}

// One investment doc per user per product; repeat investments accumulate.
export function invest(uid, pid, amount, pay) {
  const d = doc(db, PRODUCTS, pid, INVESTMENTS, uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(d);
    const prev = snap.exists() ? snap.data().amount || 0 : 0;
    tx.set(d, { uid, pid, amount: prev + amount, pay, at: serverTimestamp() });
  });
}

export async function createSubmission(uid, f) {
  let img = "";
  if (f.file) {
    const safeName = (f.file.name || "photo").replace(/[^\w.-]+/g, "_").slice(-80);
    const r = ref(storage, `simt-submissions/${uid}/${Date.now()}-${safeName}`);
    await uploadBytes(r, f.file, { contentType: f.file.type || "image/jpeg" });
    img = await getDownloadURL(r);
  }
  await addDoc(collection(db, SUBMISSIONS), {
    uid,
    title: f.title.trim(),
    retail: Number(f.retail) || 0,
    cost: Number(f.cost) || 0,
    goal: Number(f.goal) || 50,
    desc: f.desc.trim(),
    cat: f.cat,
    img,
    status: "pending",
    at: serverTimestamp(),
  });
}

export function setSubmissionStatus(subId, status) {
  return updateDoc(doc(db, SUBMISSIONS, subId), { status });
}
