'use strict';
// A reel Instagram is still processing is never dropped (2026-10-09), and a
// trial reel carries Meta's trial_params all the way through (2026-10-15): the
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
  const calls = { create: 0, publish: 0, status: [], bodies: [] }, docs = new Map(), logs = new Map();
  let n = 0, seq = [...statuses], logFails = false;
  const fetch = async (url, opts) => {
    if (url.endsWith('/media') && opts?.method === 'POST') { calls.create++; calls.bodies.push(opts.body); return { ok: true, json: async () => ({ id: 'C' + calls.create }) }; }
    if (url.includes('/media_publish')) { calls.publish++; calls.published = String(opts.body.get('creation_id')); return { ok: true, json: async () => ({ id: 'M1' }) }; }
    const id = url.split('/').pop().split('?')[0]; calls.status.push(id);
    const s = seq.length > 1 ? seq.shift() : seq[0];
    return { ok: true, json: async () => ({ status_code: s }) };
  };
  const ref = (id) => ({ id, update: async (o) => { docs.set(id, { ...docs.get(id), ...o }); }, delete: async () => { docs.delete(id); } });
  const db = {
    doc: () => ({ get: async () => ({ exists: true, data: () => ({ accessToken: 'T', igUserId: 'U' }) }) }),
    collection: (name) => name === 'scheduledPostsLog' ? {
      doc: (id) => ({ set: async (o) => { if (logFails) throw new Error('log down'); logs.set(id, { ...o, docStillFiled: docs.has(id) }); } }),
    } : ({
      add: async (o) => { const id = 'd' + (++n); docs.set(id, o); return { id }; },
      where: () => ({ orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [...docs.entries()].filter(([, v]) => v.postAt <= Date.now()).map(([id, v]) => ({ id, data: () => v, ref: ref(id) })) }) }) }) }),
    }),
  };
  let handler;
  const ctx = vm.createContext({ fetch, db, HttpsError, FieldValue: { serverTimestamp: () => 'TS' }, URLSearchParams, setTimeout: (f) => setImmediate(f), console: { log() {}, warn() {} }, Date, Math, JSON, String, Error, exports: {}, onSchedule: (_o, h) => { handler = h; return h; } });
  vm.runInContext(pub + '\nthis.publishReelToInstagram = publishReelToInstagram; this.scheduleInstagramPost = scheduleInstagramPost;', ctx);
  const runRoute = vm.runInContext(`(async function (styleKey, request, uid) { ${route} })`, ctx);
  return { calls, docs, logs, ctx, tick: () => handler(), runRoute, setStatuses: (s) => { seq = [...s]; }, failLog: (v) => { logFails = v; } };
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
test('a trial reel carries trial_params, and a wrong word posts nothing', async () => {
  const sent = (w) => { const b = w.calls.bodies.at(-1); return b.get('trial_params') ? JSON.parse(b.get('trial_params')) : null; };
  // 1. Our two words become Meta's two strategies; no word, no trial.
  let w = world(['FINISHED']);
  await w.ctx.publishReelToInstagram('https://v/a.mp4', 'c', { trial: 'manual' });
  assert.deepStrictEqual(sent(w), { graduation_strategy: 'MANUAL' });
  await w.ctx.publishReelToInstagram('https://v/a.mp4', 'c', { trial: 'auto' });
  assert.deepStrictEqual(sent(w), { graduation_strategy: 'SS_PERFORMANCE' });
  await w.ctx.publishReelToInstagram('https://v/a.mp4', 'c');
  assert.strictEqual(sent(w), null);
  // 2. A word we don't know is refused before anything reaches Instagram.
  w = world(['FINISHED']);
  await assert.rejects(w.ctx.publishReelToInstagram('https://v/a.mp4', 'c', { trial: 'yes' }), /Unknown trial setting/);
  await assert.rejects(w.runRoute('ig-reel-publish', { data: { videoUrl: 'https://v/a.mp4', trial: 'trial' } }, 'u'), /Unknown trial setting/);
  assert.deepStrictEqual([w.calls.create, w.calls.publish], [0, 0]);
  // 3. Post as Reel with a trial on a long clip: the queued doc keeps the trial.
  w = world(['IN_PROGRESS']);
  w.ctx.Date = { now: (() => { let t = 0; return () => (t += 30000); })() };
  await assert.rejects(w.runRoute('ig-reel-publish', { data: { videoUrl: 'https://v/long.mp4', trial: 'auto' } }, 'u'), /still processing/);
  assert.deepStrictEqual([sent(w), [...w.docs.values()][0].trial], [{ graduation_strategy: 'SS_PERFORMANCE' }, 'SS_PERFORMANCE']);
  // 4. Schedule for later: the doc keeps the trial, the tick sends it, the log says it posted.
  w = world(['FINISHED']);
  const s = await w.ctx.scheduleInstagramPost('u', { type: 'reel', postAt: Date.now() + 60000, videoUrl: 'https://v/s.mp4', caption: 'c', trial: 'manual' });
  assert.strictEqual(w.docs.get(s.id).trial, 'MANUAL');
  w.docs.get(s.id).postAt = Date.now() - 1;
  await w.tick();
  const lg = w.logs.get(s.id);
  assert.deepStrictEqual([sent(w), w.docs.size, lg.ok, lg.mediaId, lg.trial], [{ graduation_strategy: 'MANUAL' }, 0, true, 'M1', 'MANUAL']);
  // The doc is gone BEFORE the log is written: a stalled log can never hold it for a second post.
  assert.strictEqual(lg.docStillFiled, false);
  // 5. Only a reel can be a trial; a picture schedules with no trial.
  await assert.rejects(w.ctx.scheduleInstagramPost('u', { type: 'feed', postAt: Date.now() + 60000, imageUrl: 'https://i/a.jpg', trial: 'manual' }), /Only a reel/);
  const f = await w.ctx.scheduleInstagramPost('u', { type: 'feed', postAt: Date.now() + 60000, imageUrl: 'https://i/a.jpg' });
  assert.strictEqual(w.docs.get(f.id).trial, null);
  // 6. A post Instagram refuses is logged as failed, and its doc still goes.
  w = world(['ERROR']);
  await w.ctx.db.collection('scheduledPosts').add({ type: 'reel', postAt: Date.now() - 1, videoUrl: 'https://v/x.mp4', caption: '', trial: 'MANUAL', from: 'chat:x' });
  await w.tick();
  const log = [...w.logs.values()][0];
  assert.deepStrictEqual([w.docs.size, log.ok, /could not process/.test(log.error), log.mediaId, log.from], [0, false, true, null, 'chat:x']);
  // 7. A log that cannot be written never keeps the doc (that would post it twice).
  w = world(['FINISHED']); w.failLog(true);
  await w.ctx.db.collection('scheduledPosts').add({ type: 'reel', postAt: Date.now() - 1, videoUrl: 'https://v/y.mp4', caption: '' });
  await w.tick();
  assert.deepStrictEqual([w.docs.size, w.calls.publish], [0, 1]);
});
