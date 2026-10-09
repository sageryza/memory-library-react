'use strict';
// A reel Instagram is still processing is never dropped (2026-10-09): the
// REAL publishReelToInstagram, publishDuePosts and the ig-reel-publish route,
// lifted out of functions/index.js and run against a fake Graph API and
// Firestore. No network, no money, no live data.
//
//   node --test functions/test/instagram-reel.test.js
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert');
const path = require('node:path');
const { test } = require('node:test');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const a = src.indexOf('async function publishReelToInstagram');
const b = src.indexOf('const REEL_CHECKS = 24;') + 'const REEL_CHECKS = 24;'.length;
const pub = src.slice(a, b);
const r0 = src.indexOf("if (styleKey === 'ig-reel-publish') {");
let depth = 0, i = src.indexOf('{', r0), end = -1;
for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) { end = i + 1; break; } }
const route = src.slice(r0, end);
class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
function world(statuses) {
  const calls = { create: 0, publish: 0, status: [] }, docs = new Map(); let n = 0, seq = [...statuses];
  const fetch = async (url, opts) => {
    if (url.endsWith('/media') && opts?.method === 'POST') { calls.create++; return { ok: true, json: async () => ({ id: 'C' + calls.create }) }; }
    if (url.includes('/media_publish')) { calls.publish++; calls.published = String(opts.body.get('creation_id')); return { ok: true, json: async () => ({ id: 'M1' }) }; }
    const id = url.split('/').pop().split('?')[0]; calls.status.push(id);
    const s = seq.length > 1 ? seq.shift() : seq[0];
    return { ok: true, json: async () => ({ status_code: s }) };
  };
  const ref = (id) => ({ id, update: async (o) => { docs.set(id, { ...docs.get(id), ...o }); }, delete: async () => { docs.delete(id); } });
  const db = {
    doc: () => ({ get: async () => ({ exists: true, data: () => ({ accessToken: 'T', igUserId: 'U' }) }) }),
    collection: () => ({
      add: async (o) => { const id = 'd' + (++n); docs.set(id, o); return { id }; },
      where: () => ({ orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [...docs.entries()].filter(([, v]) => v.postAt <= Date.now()).map(([id, v]) => ({ id, data: () => v, ref: ref(id) })) }) }) }) }),
    }),
  };
  let handler;
  const ctx = vm.createContext({ fetch, db, HttpsError, FieldValue: { serverTimestamp: () => 'TS' }, URLSearchParams, setTimeout: (f) => setImmediate(f), console: { log() {}, warn() {} }, Date, Math, JSON, String, Error, exports: {}, onSchedule: (_o, h) => { handler = h; return h; } });
  vm.runInContext(pub + '\nthis.publishReelToInstagram = publishReelToInstagram;', ctx);
  const runRoute = vm.runInContext(`(async function (styleKey, request, uid) { ${route} })`, ctx);
  return { calls, docs, ctx, tick: () => handler(), runRoute, setStatuses: (s) => { seq = [...s]; } };
}
test('a still-processing reel keeps its container until it posts', async () => {
  // 1. The tool's own short reel: finishes, publishes once.
  let w = world(['IN_PROGRESS', 'FINISHED']);
  let out = await w.ctx.publishReelToInstagram('https://v/a.mp4', 'cap');
  assert.deepStrictEqual([out.posted, w.calls.create, w.calls.publish], [true, 1, 1]);
  // 2. Post as Reel on a long clip: still processing -> queued with its container, honest message.
  w = world(['IN_PROGRESS']);
  w.ctx.Date = { now: (() => { let t = 0; return () => (t += 30000); })() };
  await assert.rejects(w.runRoute('ig-reel-publish', { data: { videoUrl: 'https://v/long.mp4', caption: 'c' } }, 'uid1'), /still processing this reel/);
  const [qid, q] = [...w.docs.entries()][0];
  assert.deepStrictEqual([q.type, q.creationId, q.videoUrl, q.uid, w.calls.create, w.calls.publish], ['reel', 'C1', 'https://v/long.mp4', 'uid1', 1, 0]);
  // 3. Next tick, still processing: same container re-checked, doc kept, no new container.
  w.ctx.Date = { now: (() => { let t = 0; return () => (t += 30000); })() };
  await w.tick();
  assert.ok(w.docs.has(qid)); assert.strictEqual(w.docs.get(qid).checks, 1); assert.strictEqual(w.calls.create, 1);
  assert.ok(w.calls.status.every((s) => s === 'C1'));
  // 4. Tick after: FINISHED -> publishes THAT container and removes the doc.
  w.setStatuses(['FINISHED']);
  await w.tick();
  assert.deepStrictEqual([w.docs.has(qid), w.calls.publish, w.calls.published, w.calls.create], [false, 1, 'C1', 1]);
  // 5. A scheduled reel (no container yet) that errors at Instagram: removed, never published.
  w = world(['ERROR']);
  await w.ctx.db.collection('scheduledPosts').add({ type: 'reel', postAt: Date.now() - 1, videoUrl: 'https://v/x.mp4', caption: '' });
  await w.tick();
  assert.deepStrictEqual([w.docs.size, w.calls.publish], [0, 0]);
  // 6. Gives up after REEL_CHECKS looks, and only then removes it.
  w = world(['IN_PROGRESS']);
  await w.ctx.db.collection('scheduledPosts').add({ type: 'reel', postAt: Date.now() - 1, videoUrl: 'https://v/y.mp4', caption: '', creationId: 'C9', checks: 23 });
  w.ctx.Date = { now: (() => { let t = 0; return () => (t += 30000); })() };
  await w.tick();
  assert.deepStrictEqual([w.docs.size, w.calls.create, w.calls.publish], [0, 0, 0]);
  // 7. A container another look already published is not published twice.
  w = world(['PUBLISHED']);
  out = await w.ctx.publishReelToInstagram('https://v/z.mp4', '', { creationId: 'C5' });
  assert.deepStrictEqual([out.posted, w.calls.publish, w.calls.create], [true, 0, 0]);
});
