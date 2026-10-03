'use strict';
// Checks firestore.rules for the Little Book of Miracles paths against the
// LOCAL Firestore emulator (a demo project; nothing live is touched):
// the owner, and only the owner, reads and writes miracleBooks/{uid} and its
// pages; nobody can read or write the daily counters (miracleUsage) or config.
//
// Not part of `npm test`: it needs Java, the emulator and two extra packages.
// From the repo root:
//   npm i --no-save @firebase/rules-unit-testing firebase-tools
//   npx firebase emulators:exec --only firestore --project demo-miracles \
//     "node functions/test/firestore-rules.check.js"

const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } = require('firebase/firestore');

const RULES = process.env.RULES_FILE || path.join(__dirname, '..', '..', 'firestore.rules');
let passed = 0;
let failed = 0;
async function check(label, promise, allowed) {
  try {
    await (allowed ? assertSucceeds(promise) : assertFails(promise));
    passed += 1;
    console.log(`  ok    ${allowed ? 'allow' : 'deny '}  ${label}`);
  } catch (e) {
    failed += 1;
    console.log(`  FAIL  expected ${allowed ? 'allow' : 'deny'}: ${label} (${String(e.message).split('\n')[0]})`);
  }
}

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-miracles',
    firestore: { rules: fs.readFileSync(RULES, 'utf8') },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'miracleBooks/alice'), { v: 2, updatedAt: 1, order: ['p1'], data: '[]' });
    await setDoc(doc(db, 'miracleBooks/alice/pages/p1'), { data: '{"id":"p1"}', updatedAt: 1 });
    await setDoc(doc(db, 'miracleUsage/alice_2026-10-03'), { taps: 1, upgrades: 0 });
    await setDoc(doc(db, 'miracleUsage/_all_2026-10-03'), { taps: 1 });
    await setDoc(doc(db, 'config/miracles'), { dailyPerUser: 10, dailyTotal: 100 });
    await setDoc(doc(db, 'config/openai'), { apiKey: 'sk-proj-TEST' });
  });
  const alice = env.authenticatedContext('alice', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  const bob = env.authenticatedContext('bob', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  const nobody = env.unauthenticatedContext().firestore();

  console.log('miracleBooks/{uid}: owner only');
  await check('alice reads her book', getDoc(doc(alice, 'miracleBooks/alice')), true);
  await check('alice writes her book (v, order, updatedAt)', setDoc(doc(alice, 'miracleBooks/alice'), { v: 2, updatedAt: 2, order: ['p1', 'p2'] }, { merge: true }), true);
  await check("bob reads alice's book", getDoc(doc(bob, 'miracleBooks/alice')), false);
  await check("bob writes alice's book", setDoc(doc(bob, 'miracleBooks/alice'), { v: 9 }), false);
  await check("signed-out reads alice's book", getDoc(doc(nobody, 'miracleBooks/alice')), false);

  console.log('miracleBooks/{uid}/pages/{pageId}: owner only');
  await check('alice reads a page', getDoc(doc(alice, 'miracleBooks/alice/pages/p1')), true);
  await check('alice lists her pages', getDocs(collection(alice, 'miracleBooks/alice/pages')), true);
  await check('alice creates a page', setDoc(doc(alice, 'miracleBooks/alice/pages/p2'), { data: '{"id":"p2"}', updatedAt: 2 }), true);
  await check('alice updates a page', updateDoc(doc(alice, 'miracleBooks/alice/pages/p2'), { data: '{"id":"p2"}', updatedAt: 3 }), true);
  await check('alice deletes a page', deleteDoc(doc(alice, 'miracleBooks/alice/pages/p2')), true);
  await check("bob reads alice's page", getDoc(doc(bob, 'miracleBooks/alice/pages/p1')), false);
  await check("bob lists alice's pages", getDocs(collection(bob, 'miracleBooks/alice/pages')), false);
  await check("bob writes a page into alice's book", setDoc(doc(bob, 'miracleBooks/alice/pages/p9'), { data: '{}' }), false);
  await check("bob deletes alice's page", deleteDoc(doc(bob, 'miracleBooks/alice/pages/p1')), false);
  await check('signed-out reads a page', getDoc(doc(nobody, 'miracleBooks/alice/pages/p1')), false);
  await check('signed-out writes a page', setDoc(doc(nobody, 'miracleBooks/alice/pages/p9'), { data: '{}' }), false);

  console.log('deny by default below and beside the pages');
  await check('alice writes under a page', setDoc(doc(alice, 'miracleBooks/alice/pages/p1/x/y'), { a: 1 }), false);
  await check('alice writes another subcollection of her book', setDoc(doc(alice, 'miracleBooks/alice/other/x'), { a: 1 }), false);
  await check('alice lists every book', getDocs(collection(alice, 'miracleBooks')), false);

  console.log('miracleUsage and config: closed to every client');
  await check('alice reads her own counter', getDoc(doc(alice, 'miracleUsage/alice_2026-10-03')), false);
  await check('alice resets her own counter', setDoc(doc(alice, 'miracleUsage/alice_2026-10-03'), { taps: 0 }), false);
  await check('alice deletes her own counter', deleteDoc(doc(alice, 'miracleUsage/alice_2026-10-03')), false);
  await check("alice reads everyone's counter", getDoc(doc(alice, 'miracleUsage/_all_2026-10-03')), false);
  await check('alice lists the counters', getDocs(collection(alice, 'miracleUsage')), false);
  await check('signed-out reads a counter', getDoc(doc(nobody, 'miracleUsage/alice_2026-10-03')), false);
  await check('alice reads config/miracles', getDoc(doc(alice, 'config/miracles')), false);
  await check('alice raises her own limit', setDoc(doc(alice, 'config/miracles'), { dailyPerUser: 9999 }), false);
  await check('alice lists config', getDocs(collection(alice, 'config')), false);
  await check('signed-out reads config/openai', getDoc(doc(nobody, 'config/openai')), false);

  await env.cleanup();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
