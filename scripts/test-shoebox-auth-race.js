// test-shoebox-auth-race.js — the Shoebox must never paint the WRONG pile
// of boards while Firebase is still restoring the session.
//   node scripts/test-shoebox-auth-race.js
//
// Firebase restores a session asynchronously, so on every fresh load there
// is a window where she IS signed in and `userId` is still undefined. The
// hook read that as signed out and fell through to this device's
// localStorage board — her real boards apparently gone, with nothing on
// screen saying why (found live 2026-08-29: "where r the old bosrds",
// the minute a deploy forced a reload).
//
// Source assertions, deliberately: the failure is a missing ARGUMENT on a
// path that renders perfectly happily, so what has to be pinned is that the
// flag is taken, threaded, and actually consulted before the signed-out
// branch — not that some component renders.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = readFileSync(join(root, 'src/hooks/useShoeboxState.js'), 'utf8');
const jsx = readFileSync(join(root, 'src/components/shoebox/Shoebox.jsx'), 'utf8');
const app = readFileSync(join(root, 'src/App.jsx'), 'utf8');
const memories = readFileSync(join(root, 'src/hooks/useMemories.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
};

console.log('the flag reaches the hook');
ok(/useShoeboxState\(userId,\s*authLoading\s*=\s*false\)/.test(hook), 'the hook takes authLoading');
ok(/<Shoebox[\s\S]{0,240}authLoading=\{authLoading\}/.test(app), 'App passes it down');
ok(/authLoading = false \}\)/.test(jsx), 'the page takes it as a prop');
ok(/useShoeboxState\(userId,\s*authLoading\)/.test(jsx), 'the page hands it to the hook');

console.log('it is consulted BEFORE the signed-out fallback');
// The whole bug is an ordering one: reading localStorage first is what
// showed the wrong boards, so the guard has to come before `if (userId)`.
const body = hook.slice(hook.indexOf('let dead = false;'));
const guard = body.indexOf('if (authLoading)');
const signedIn = body.indexOf('if (userId)');
const localRead = body.indexOf("getItem('shoeboxData')");
ok(guard > -1, 'the effect has an authLoading guard');
ok(guard < signedIn, 'it runs before the signed-in branch');
ok(guard < localRead, 'it runs before this device\'s local board is ever read');
ok(/authLoading[\s\S]{0,200}setLoaded\(false\)/.test(body), 'it leaves `loaded` false — the page shows "Loading the board…"');

console.log('nothing saves into the wrong pile meanwhile');
ok(/if \(authLoading \|\| blocked\.current\)/.test(hook), 'write() refuses while auth is unresolved');
ok(/\}, \[userId, authLoading\]\);/.test(hook), 'the effect and write re-run when auth resolves');
const deps = hook.match(/\}, \[userId, authLoading\]\);/g) || [];
ok(deps.length >= 2, 'both the effect and write carry the flag in their deps');

console.log('the page does not accuse her of being signed out too early');
ok(/loaded && !authLoading && !userId/.test(jsx), 'the signed-out notice waits for auth to answer');

console.log('the sibling hook still carries the same guard');
// useMemories learned this first, and its comment says so. If that guard
// ever goes, this one is the next to be "tidied" away.
ok(/authLoading/.test(memories), 'useMemories still gates on authLoading');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
