'use strict';
// Offline tests for the Little Book of Miracles Cloud Functions:
// illustrateMiracle (daily limits, partial failures, plain-words errors, webp,
// the distiller's JSON, the fallback caption), deleteMiracleData, and the
// modes sagediagram still has.
//
// They load the REAL functions/index.js and the REAL firebase-functions SDK.
// Firestore, Storage, Auth, the Anthropic SDK and the OpenAI HTTP call are
// in-memory fakes, so nothing here touches the network, spends money, or
// writes to live data.
//
//   cd functions && npm install && npm test

// Lets the real callable HTTP wrapper accept an unsigned test token (the wire
// tests at the bottom). firebase-functions reads these when it loads; they are
// set for this test process only.
process.env.FIREBASE_DEBUG_MODE = 'true';
process.env.FIREBASE_DEBUG_FEATURES = JSON.stringify({ skipTokenVerification: true });

const { test, describe, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const FUNCTIONS_DIR = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// The fake world. `S` is replaced before every test.
// ---------------------------------------------------------------------------
let S;
function freshWorld() {
  return {
    docs: new Map(), // 'collection/doc[/sub/doc]' -> fields
    files: new Map(), // Storage object name -> { bytes, contentType }
    users: new Set(),
    txQueue: Promise.resolve(),
    claude: null, // async (body) => Anthropic message
    claudeCalls: [],
    anthropicOptions: [],
    openai: null, // async (formFields, callNumber) => Response
    openaiCalls: [],
    failSave: () => false,
    failGetFiles: false,
  };
}

const OP = Symbol('fieldValue');
const FieldValue = {
  increment: (n) => ({ [OP]: 'increment', n }),
  serverTimestamp: () => ({ [OP]: 'serverTimestamp' }),
  delete: () => ({ [OP]: 'delete' }),
  arrayUnion: (...values) => ({ [OP]: 'arrayUnion', values }),
};
function applyWrite(previous, data, merge) {
  const next = merge && previous ? { ...previous } : {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && v[OP]) {
      if (v[OP] === 'increment') next[k] = (Number(next[k]) || 0) + v.n;
      else if (v[OP] === 'serverTimestamp') next[k] = new Date(Date.now());
      else if (v[OP] === 'delete') delete next[k];
      else if (v[OP] === 'arrayUnion') next[k] = [...new Set([...(next[k] || []), ...v.values])];
    } else {
      next[k] = v;
    }
  }
  return next;
}

function snapshotOf(p) {
  const d = S.docs.get(p);
  return {
    id: p.split('/').pop(),
    ref: docRef(p),
    exists: d !== undefined,
    data: () => (d === undefined ? undefined : { ...d }),
    get: (field) => (d === undefined ? undefined : d[field]),
  };
}
function childrenOf(collectionPath) {
  const prefix = `${collectionPath}/`;
  return [...S.docs.keys()]
    .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
    .sort();
}
function docRef(p) {
  return {
    id: p.split('/').pop(),
    path: p,
    get: async () => snapshotOf(p),
    set: async (data, opts) => { S.docs.set(p, applyWrite(S.docs.get(p), data, opts?.merge)); },
    delete: async () => { S.docs.delete(p); },
    collection: (name) => collectionRef(`${p}/${name}`),
  };
}
function collectionRef(p) {
  return {
    id: p.split('/').pop(),
    path: p,
    doc: (id) => docRef(`${p}/${id}`),
    get: async () => {
      const docs = childrenOf(p).map(snapshotOf);
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
    listDocuments: async () => childrenOf(p).map(docRef),
  };
}
const fakeDb = {
  doc: docRef,
  collection: collectionRef,
  batch() {
    const ops = [];
    return {
      delete: (ref) => { ops.push(() => S.docs.delete(ref.path)); },
      set: (ref, data, opts) => { ops.push(() => S.docs.set(ref.path, applyWrite(S.docs.get(ref.path), data, opts?.merge))); },
      commit: async () => { ops.forEach((op) => op()); },
    };
  },
  // Transactions run one at a time, which is the isolation Firestore promises:
  // whatever a transaction reads is still true when its writes land.
  runTransaction(fn) {
    const run = S.txQueue.then(async () => {
      const writes = [];
      const tx = {
        get: async (ref) => snapshotOf(ref.path),
        getAll: async (...refs) => refs.map((ref) => snapshotOf(ref.path)),
        set: (ref, data, opts) => { writes.push([ref.path, data, opts]); },
        delete: (ref) => { writes.push([ref.path, null]); },
      };
      const result = await fn(tx);
      for (const [p, data, opts] of writes) {
        if (data === null) S.docs.delete(p);
        else S.docs.set(p, applyWrite(S.docs.get(p), data, opts?.merge));
      }
      return result;
    });
    S.txQueue = run.catch(() => {});
    return run;
  },
};

function storageFile(name) {
  return {
    name,
    save: async (bytes, opts) => {
      if (S.failSave(name)) throw new Error('Storage write failed (test)');
      S.files.set(name, { bytes: Buffer.from(bytes), contentType: opts?.contentType });
    },
    delete: async (opts) => {
      if (!S.files.has(name)) {
        if (opts?.ignoreNotFound) return [{}];
        const e = new Error(`No such object: ${name}`);
        e.code = 404;
        throw e;
      }
      S.files.delete(name);
      return [{}];
    },
  };
}
const fakeStorage = {
  bucket: (bucketName) => ({
    name: bucketName,
    file: storageFile,
    getFiles: async ({ prefix = '' } = {}) => {
      if (S.failGetFiles) throw new Error('Storage list failed (test)');
      return [[...S.files.keys()].filter((k) => k.startsWith(prefix)).sort().map(storageFile)];
    },
  }),
};

const fakeAuth = {
  deleteUser: async (uid) => {
    if (!S.users.has(uid)) {
      const e = new Error('There is no user record corresponding to the provided identifier.');
      e.code = 'auth/user-not-found';
      throw e;
    }
    S.users.delete(uid);
  },
};

class FakeAnthropic {
  constructor(options) {
    S.anthropicOptions.push(options);
    this.messages = {
      create: async (body) => { S.claudeCalls.push(body); return S.claude(body); },
    };
  }
}

const stubs = {
  'firebase-admin/app': { initializeApp: () => ({}), getApp: () => ({}) },
  'firebase-admin/firestore': { getFirestore: () => fakeDb, FieldValue },
  'firebase-admin/messaging': { getMessaging: () => ({}) },
  'firebase-admin/storage': { getStorage: () => fakeStorage },
  'firebase-admin/auth': { getAuth: () => fakeAuth },
  '@anthropic-ai/sdk': FakeAnthropic,
};
const realLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
  return realLoad.call(this, request, ...rest);
};

// The OpenAI edit call is answered by the test; a local URL (the wire tests'
// own server) goes through; anything else is a bug in the test.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1')) return realFetch(url, init);
  if (u === 'https://api.openai.com/v1/images/edits') {
    const fields = { images: 0, authorization: init.headers?.Authorization };
    for (const [k, v] of init.body.entries()) {
      if (k === 'image[]') fields.images += 1;
      else fields[k] = v;
    }
    S.openaiCalls.push(fields);
    return S.openai(fields, S.openaiCalls.length);
  }
  throw new Error(`unexpected fetch in a test: ${u}`);
};

// MIRACLES_TEST_INDEX runs the same tests against another copy of index.js
// (how these tests were checked to fail against the code before the fixes).
const fns = require(process.env.MIRACLES_TEST_INDEX || path.join(FUNCTIONS_DIR, 'index.js'));
const { HttpsError } = require('firebase-functions/v2/https');
const sharp = require('sharp');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let WEBP_B64;
before(async () => {
  WEBP_B64 = (await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } })
    .webp({ lossless: true }).toBuffer()).toString('base64');
});

const okImage = () => new Response(JSON.stringify({ data: [{ b64_json: WEBP_B64 }] }), { status: 200 });
const openaiError = (status, error) => new Response(JSON.stringify({ error }), { status });
const REFUSED = {
  message: 'Your request was rejected by the safety system. If you believe this is an error, contact us at help.openai.com and include the request ID req_123.',
  type: 'image_generation_user_error', param: null, code: 'moderation_blocked',
};

const THREE = { concepts: [
  { caption: 'cake after hours', drawing: 'a birthday cake with a little CLOSED sign' },
  { caption: 'unlocked for me', drawing: 'a key in a cake' },
  { caption: 'sweet exception', drawing: 'a bakery door shaped like a cake' },
] };
const THREE_DRAWINGS = THREE.concepts.map((c) => c.drawing);
const claudeSays = (text, stopReason = 'end_turn') => async () => ({
  stop_reason: stopReason,
  content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }],
});
const SENTENCE = 'It was my birthday and we went to get cake but the shop was closed, and they let us in anyway';

function seedKeys() {
  S.docs.set('config/anthropic', { key: 'sk-ant-TEST' });
  S.docs.set('config/openai', { apiKey: 'sk-proj-TEST' });
}
// The app signs in anonymously, so a caller's decoded token says so.
const ANON = { firebase: { sign_in_provider: 'anonymous' } };
const call = (name, uid, data, token = ANON) => fns[name].run({ auth: uid ? { uid, token } : undefined, data, rawRequest: {} });
const tap = (uid, extra = {}) => call('illustrateMiracle', uid, { text: SENTENCE, id: 'BOX1', distill: false, variants: 1, tier: 'fast', ...extra });
const upgrade = (uid, tier = 'better') => call('illustrateMiracle', uid, { text: SENTENCE, id: 'BOX1', distill: false, variants: 1, tier, concept: 'a key in a cake' });
async function thrown(promise) {
  try { await promise; } catch (e) { return e; }
  return assert.fail('expected the call to throw');
}
function assertPlainError(e, code, message, reason) {
  assert.ok(e instanceof HttpsError, `expected an HttpsError, got ${e && e.stack}`);
  assert.equal(e.code, code);
  assert.equal(e.message, message);
  assert.deepEqual(e.details, { reason });
  assert.doesNotMatch(e.message, /[{}]/, 'no raw JSON in what the person sees');
}
const LIMIT_MSG = "That's today's drawings. More tomorrow.";
const TOTAL_MSG = 'Drawing is resting for today. Try again tomorrow.';
const REFUSED_MSG = "This one can't be drawn. Try different words.";
const UNAVAILABLE_MSG = 'Drawing is unavailable right now. Try again later.';
const BUSY_MSG = 'Busy right now. Try again in a minute.';

// Each test runs at its own fake moment (only Date is faked; real timers keep
// running), a day apart, so the 60-second limits cache never carries over.
let dayOffset = 0;
function atOwnMoment(t, iso) {
  const now = iso ? Date.parse(iso) : Date.UTC(2026, 9, 5, 19, 0, 0) + (dayOffset += 1) * 86400000;
  t.mock.timers.enable({ apis: ['Date'], now });
  return now;
}
const sdkLogger = require('firebase-functions/logger');
const quiet = (t) => ({
  sdkDebug: t.mock.method(sdkLogger, 'debug', () => {}),
  error: t.mock.method(console, 'error', () => {}),
  warn: t.mock.method(console, 'warn', () => {}),
  log: t.mock.method(console, 'log', () => {}),
  info: t.mock.method(console, 'info', () => {}),
  debug: t.mock.method(console, 'debug', () => {}),
});
const logged = (m) => m.mock.calls.map((c) => c.arguments.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));

beforeEach(() => {
  S = freshWorld();
  S.claude = claudeSays(JSON.stringify(THREE));
  S.openai = async () => okImage();
});

// ---------------------------------------------------------------------------
describe('illustrateMiracle: the drawing call', () => {
  test('asks for webp (never output_compression) on every tier, and saves real webp bytes', async (t) => {
    atOwnMoment(t);
    quiet(t);
    seedKeys();
    // config/miracles holds numbers (one typed as text); the key scan must
    // still find the OpenAI key.
    S.docs.set('config/miracles', { dailyPerUser: 10, dailyTotal: '100' });
    const expected = {
      none: { model: 'gpt-image-1', quality: 'medium', input_fidelity: 'high' },
      fast: { model: 'gpt-image-1-mini', quality: 'low', input_fidelity: undefined },
      better: { model: 'gpt-image-1.5', quality: 'low', input_fidelity: 'high' },
      best: { model: 'gpt-image-2', quality: 'medium', input_fidelity: undefined },
    };
    for (const tier of Object.keys(expected)) {
      await tap('UID_FORMATS', { tier: tier === 'none' ? undefined : tier });
      const f = S.openaiCalls.at(-1);
      assert.equal(f.model, expected[tier].model, tier);
      assert.equal(f.quality, expected[tier].quality, tier);
      assert.equal(f.input_fidelity, expected[tier].input_fidelity, tier);
      assert.equal(f.output_format, 'webp', tier);
      assert.ok(!('output_compression' in f), `${tier}: output_compression must never be sent`);
      assert.equal(f.size, '1024x1024');
      assert.equal(f.n, '1');
      assert.equal(f.images, 7, 'the seven reference doodles ride along');
      assert.equal(f.authorization, 'Bearer sk-proj-TEST');
    }
    assert.equal(S.files.size, 4);
    for (const [name, file] of S.files) {
      assert.match(name, /^miracles\/UID_FORMATS\/BOX1\/[0-9a-f-]{36}\.webp$/);
      assert.equal(file.contentType, 'image/webp');
      assert.equal(file.bytes.subarray(0, 4).toString('latin1'), 'RIFF');
      assert.equal(file.bytes.subarray(8, 12).toString('latin1'), 'WEBP');
    }
  });

  test('one refused picture out of three: the other two come back, in order', async (t) => {
    atOwnMoment(t);
    const log = quiet(t);
    seedKeys();
    S.openai = async (f, n) => (n === 2 ? openaiError(400, REFUSED) : okImage());
    const out = await call('illustrateMiracle', 'UID_PARTIAL', { text: SENTENCE, id: 'BOX1', distill: true, variants: 3, tier: 'fast' });
    assert.equal(S.openaiCalls.length, 3);
    assert.deepEqual(out.concepts.map((c) => c.drawing), [THREE_DRAWINGS[0], THREE_DRAWINGS[2]]);
    assert.equal(out.url, out.concepts[0].url);
    assert.equal(out.caption, 'cake after hours');
    assert.equal(out.drawing, THREE_DRAWINGS[0]);
    assert.deepEqual(Object.keys(out).sort(), ['caption', 'concepts', 'drawing', 'engine', 'id', 'url', 'version']);
    assert.equal(out.version, 'v8-ladder-fast');
    assert.equal(S.files.size, 2);
    // The raw status and body are in the logs, so the logs say why.
    assert.ok(logged(log.error).some((l) => l.includes('400') && l.includes('moderation_blocked')), logged(log.error).join('\n'));
  });

  test('every picture refused: invalid-argument in plain words', async (t) => {
    atOwnMoment(t);
    quiet(t);
    seedKeys();
    S.openai = async () => openaiError(400, REFUSED);
    const e = await thrown(call('illustrateMiracle', 'UID_REFUSED', { text: SENTENCE, id: 'BOX1', distill: true, variants: 3, tier: 'fast' }));
    assertPlainError(e, 'invalid-argument', REFUSED_MSG, 'refused');
    assert.equal(S.files.size, 0);
  });

  test('no money left on the OpenAI account is "unavailable", not "busy"', async (t) => {
    atOwnMoment(t);
    quiet(t);
    seedKeys();
    const noMoney = [
      [429, { message: 'You exceeded your current quota, please check your plan and billing details.', type: 'insufficient_quota', param: null, code: 'insufficient_quota' }],
      // As the error-codes page lists it: TYPE rate_limit_error, so only the
      // code tells it apart from a real rate limit.
      [429, { message: 'Your organization has no prepaid credits remaining.', type: 'rate_limit_error', param: null, code: 'credit_balance_exhausted' }],
      [429, { message: 'Your organization reached its enforced spend limit.', type: 'insufficient_quota', code: 'organization_spend_limit_exceeded' }],
      [429, { message: 'Your project reached its enforced spend limit.', type: 'insufficient_quota', code: 'project_spend_limit_exceeded' }],
      [429, { message: 'Your organization reached its OpenAI-assigned usage limit.', type: 'insufficient_quota', code: 'organization_usage_limit_exceeded' }],
      [400, { message: 'Billing hard limit has been reached', type: 'invalid_request_error', code: 'billing_hard_limit_reached' }],
    ];
    for (const [i, [status, error]] of noMoney.entries()) {
      S.openai = async () => openaiError(status, error);
      const e = await thrown(tap(`UID_MONEY_${i}`));
      assertPlainError(e, 'unavailable', UNAVAILABLE_MSG, 'unavailable');
    }
  });

  test('a real rate limit is "busy"', async (t) => {
    atOwnMoment(t);
    quiet(t);
    seedKeys();
    const limited = [
      { message: 'Rate limit reached for gpt-image-1-mini on images per minute.', type: 'requests', param: null, code: 'rate_limit_exceeded' },
      { message: 'Your request rate increased too quickly.', type: 'rate_limit_error', code: 'slow_down' },
    ];
    for (const [i, error] of limited.entries()) {
      S.openai = async () => openaiError(429, error);
      const e = await thrown(tap(`UID_BUSY_${i}`));
      assertPlainError(e, 'unavailable', BUSY_MSG, 'busy');
    }
    // A 429 whose body is not JSON at all is still just busy.
    S.openai = async () => new Response('Too Many Requests', { status: 429 });
    assertPlainError(await thrown(tap('UID_BUSY_TEXT')), 'unavailable', BUSY_MSG, 'busy');
  });

  test('server errors, a dropped connection, a bad key: "unavailable"', async (t) => {
    atOwnMoment(t);
    quiet(t);
    seedKeys();
    const cases = [
      async () => openaiError(500, { message: 'The server had an error while processing your request.', type: 'server_error', code: null }),
      async () => openaiError(503, { message: 'The requested model is temporarily overloaded.', type: 'service_unavailable_error', code: 'server_is_overloaded' }),
      async () => new Response('<html>Bad Gateway</html>', { status: 502 }),
      async () => openaiError(401, { message: 'Incorrect API key provided: sk-proj-****TEST.', type: 'invalid_request_error', code: 'invalid_api_key' }),
      async () => { throw new TypeError('fetch failed'); },
      async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    ];
    for (const [i, answer] of cases.entries()) {
      S.openai = answer;
      const e = await thrown(tap(`UID_DOWN_${i}`));
      assertPlainError(e, 'unavailable', UNAVAILABLE_MSG, 'unavailable');
    }
  });

  test('a Storage failure is "unavailable", never "internal"; one failed save still returns the rest', async (t) => {
    atOwnMoment(t);
    quiet(t);
    seedKeys();
    S.failSave = () => true;
    const e = await thrown(call('illustrateMiracle', 'UID_STORAGE', { text: SENTENCE, id: 'BOX1', distill: true, variants: 3, tier: 'fast' }));
    assertPlainError(e, 'unavailable', UNAVAILABLE_MSG, 'unavailable');
    let saves = 0;
    S.failSave = () => { saves += 1; return saves === 1; };
    const out = await call('illustrateMiracle', 'UID_STORAGE', { text: SENTENCE, id: 'BOX2', distill: true, variants: 3, tier: 'fast' });
    assert.equal(out.concepts.length, 2);
  });

  test('a missing OpenAI key costs neither a Claude call nor one of the day\'s drawings', async (t) => {
    atOwnMoment(t);
    quiet(t);
    S.docs.set('config/anthropic', { key: 'sk-ant-TEST' });
    const e = await thrown(call('illustrateMiracle', 'UID_NOKEY', { text: SENTENCE, id: 'BOX1', distill: true, variants: 3, tier: 'fast' }));
    assertPlainError(e, 'unavailable', UNAVAILABLE_MSG, 'unavailable');
    assert.equal(S.claudeCalls.length, 0);
    assert.equal([...S.docs.keys()].filter((k) => k.startsWith('miracleUsage/')).length, 0);
  });
});

// ---------------------------------------------------------------------------
describe('illustrateMiracle: the distiller', () => {
  test('reads fenced JSON (with and without a language tag), bare JSON, and JSON inside a sentence', async (t) => {
    atOwnMoment(t);
    quiet(t);
    seedKeys();
    const json = JSON.stringify(THREE, null, 2);
    const answers = [
      '```json\n' + json + '\n```',
      '```\n' + json + '\n```',
      json,
      'Here are three ideas:\n' + json + '\nI hope one of them fits.',
      '{note} first, then the answer: ' + JSON.stringify(THREE),
    ];
    for (const [i, answer] of answers.entries()) {
      S.claude = claudeSays(answer);
      const out = await call('illustrateMiracle', `UID_JSON_${i}`, { text: SENTENCE, id: 'BOX1', distill: true, variants: 3, tier: 'fast' });
      assert.deepEqual(out.concepts.map((c) => c.drawing), THREE_DRAWINGS, `answer ${i}`);
    }
  });

  test('no usable JSON: draws the sentence as written and logs the stop_reason', async (t) => {
    atOwnMoment(t);
    const log = quiet(t);
    seedKeys();
    // The thinking used the whole budget: no text block at all.
    S.claude = async () => ({ stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '' }] });
    let out = await call('illustrateMiracle', 'UID_NOJSON', { text: SENTENCE, id: 'BOX1', distill: true, variants: 3, tier: 'fast' });
    assert.deepEqual(out.concepts.map((c) => c.drawing), [SENTENCE]);
    // Cut off mid-JSON.
    S.claude = claudeSays('{"concepts": [{"caption": "cake after hours", "drawing": "a birthday ca', 'max_tokens');
    out = await call('illustrateMiracle', 'UID_NOJSON', { text: SENTENCE, id: 'BOX2', distill: true, variants: 3, tier: 'fast' });
    assert.deepEqual(out.concepts.map((c) => c.drawing), [SENTENCE]);
    const warnings = logged(log.warn).filter((l) => l.includes('no usable JSON'));
    assert.equal(warnings.length, 2);
    assert.ok(warnings.every((l) => l.includes('max_tokens')), warnings.join('\n'));
  });

  test('same model, effort, budget and prompt; a 90s timeout with one retry', async (t) => {
    atOwnMoment(t);
    quiet(t);
    seedKeys();
    await call('illustrateMiracle', 'UID_CLAUDE', { text: SENTENCE, id: 'BOX1', distill: true, variants: 3, tier: 'fast' });
    assert.deepEqual(S.anthropicOptions, [{ apiKey: 'sk-ant-TEST', timeout: 90000, maxRetries: 1 }]);
    const body = S.claudeCalls[0];
    assert.equal(body.model, 'claude-opus-4-8');
    assert.equal(body.max_tokens, 3000);
    assert.deepEqual(body.thinking, { type: 'adaptive' });
    assert.deepEqual(body.output_config, { effort: 'high' });
    assert.ok(body.system.startsWith('You distill a small real-life moment into ONE clever little doodle'));
    assert.deepEqual(body.messages, [{ role: 'user', content: SENTENCE }]);
  });

  test('a Claude call that fails (a timeout) still draws the sentence', async (t) => {
    atOwnMoment(t);
    quiet(t);
    seedKeys();
    S.claude = async () => { const e = new Error('Request timed out.'); e.name = 'APIConnectionTimeoutError'; throw e; };
    const out = await call('illustrateMiracle', 'UID_TIMEOUT', { text: SENTENCE, id: 'BOX1', distill: true, variants: 3, tier: 'fast' });
    assert.deepEqual(out.concepts.map((c) => c.drawing), [SENTENCE]);
  });

  test('the fallback caption never cuts an emoji in half', async (t) => {
    atOwnMoment(t);
    quiet(t);
    seedKeys();
    const text = `${'a'.repeat(79)}😀 and the rest of the sentence`;
    assert.equal(text.slice(0, 80).isWellFormed(), false, 'a UTF-16 cut at 80 would split this emoji');
    const out = await call('illustrateMiracle', 'UID_EMOJI', { text, id: 'BOX1', distill: false, variants: 1, tier: 'fast' });
    assert.equal(out.caption, `${'a'.repeat(79)}😀`);
    assert.ok(out.caption.isWellFormed());
  });
});

// ---------------------------------------------------------------------------
describe('illustrateMiracle: daily limits', () => {
  test('the 11th tap of the day is refused, before anything is paid for', async (t) => {
    const now = atOwnMoment(t);
    quiet(t);
    seedKeys();
    for (let i = 0; i < 10; i += 1) await tap('UID_TEN');
    assert.equal(S.openaiCalls.length, 10);
    const e = await thrown(call('illustrateMiracle', 'UID_TEN', { text: SENTENCE, id: 'BOX1', distill: true, variants: 3, tier: 'fast' }));
    assertPlainError(e, 'resource-exhausted', LIMIT_MSG, 'daily-limit');
    assert.equal(S.openaiCalls.length, 10, 'no picture was drawn');
    assert.equal(S.claudeCalls.length, 0, 'Claude was not called');
    const day = new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    assert.equal(S.docs.get(`miracleUsage/UID_TEN_${day}`).taps, 10);
    assert.equal(S.docs.get(`miracleUsage/_all_${day}`).taps, 10);
    assert.equal(S.docs.has('config/miracles'), false, 'the limits doc is read, never created');
  });

  test('upgrades: two per tap already counted, never one without a tap', async (t) => {
    atOwnMoment(t);
    quiet(t);
    seedKeys();
    assertPlainError(await thrown(upgrade('UID_UP')), 'resource-exhausted', LIMIT_MSG, 'daily-limit');
    assert.equal(S.openaiCalls.length, 0);
    await tap('UID_UP');
    await upgrade('UID_UP', 'better');
    await upgrade('UID_UP', 'best');
    assertPlainError(await thrown(upgrade('UID_UP')), 'resource-exhausted', LIMIT_MSG, 'daily-limit');
    assert.equal(S.openaiCalls.length, 3);
    // Each tap brings two more.
    await tap('UID_UP');
    await upgrade('UID_UP');
    await upgrade('UID_UP');
    await thrown(upgrade('UID_UP'));
    assert.equal(S.openaiCalls.length, 6);
    const doc = [...S.docs.entries()].find(([k]) => k.startsWith('miracleUsage/UID_UP_'))[1];
    assert.equal(doc.taps, 2);
    assert.equal(doc.upgrades, 4);
  });

  test('concept cannot draw past the limit: after 10 taps, 20 upgrades and no more', async (t) => {
    atOwnMoment(t);
    quiet(t);
    seedKeys();
    for (let i = 0; i < 10; i += 1) await tap('UID_MAX');
    for (let i = 0; i < 20; i += 1) await upgrade('UID_MAX');
    assertPlainError(await thrown(upgrade('UID_MAX')), 'resource-exhausted', LIMIT_MSG, 'daily-limit');
    assertPlainError(await thrown(tap('UID_MAX')), 'resource-exhausted', LIMIT_MSG, 'daily-limit');
    assert.equal(S.openaiCalls.length, 30);
  });

  test('the total for everyone is enforced, and its upgrades still land', async (t) => {
    atOwnMoment(t);
    quiet(t);
    seedKeys();
    S.docs.set('config/miracles', { dailyPerUser: 10, dailyTotal: 3 });
    await tap('UID_A');
    await tap('UID_B');
    await tap('UID_C');
    const before = { claude: S.claudeCalls.length, openai: S.openaiCalls.length };
    const e = await thrown(call('illustrateMiracle', 'UID_D', { text: SENTENCE, id: 'BOX1', distill: true, variants: 3, tier: 'fast' }));
    assertPlainError(e, 'resource-exhausted', TOTAL_MSG, 'daily-total');
    assert.deepEqual({ claude: S.claudeCalls.length, openai: S.openaiCalls.length }, before);
    assert.equal([...S.docs.keys()].some((k) => k.startsWith('miracleUsage/UID_D_')), false);
    // The third tap's own background upgrades were already earned.
    await upgrade('UID_C', 'better');
    await upgrade('UID_C', 'best');
  });

  test('the numbers come from config/miracles, re-read about once a minute', async (t) => {
    const start = atOwnMoment(t);
    quiet(t);
    seedKeys();
    S.docs.set('config/miracles', { dailyPerUser: 1, dailyTotal: 100 });
    await tap('UID_CFG');
    assertPlainError(await thrown(tap('UID_CFG')), 'resource-exhausted', LIMIT_MSG, 'daily-limit');
    S.docs.set('config/miracles', { dailyPerUser: '3', dailyTotal: 100 }); // a number typed as text
    t.mock.timers.setTime(start + 30 * 1000);
    await thrown(tap('UID_CFG')); // still the cached 1
    t.mock.timers.setTime(start + 61 * 1000);
    await tap('UID_CFG');
    await tap('UID_CFG');
    await thrown(tap('UID_CFG'));
    // Nonsense falls back to the defaults (10 / 100).
    S.docs.set('config/miracles', { dailyPerUser: 'lots', dailyTotal: -4 });
    t.mock.timers.setTime(start + 125 * 1000);
    for (let i = 0; i < 7; i += 1) await tap('UID_CFG');
    await thrown(tap('UID_CFG'));
    const doc = [...S.docs.entries()].find(([k]) => k.startsWith('miracleUsage/UID_CFG_'))[1];
    assert.equal(doc.taps, 10);
  });

  test('a day is the Pacific day, summer and winter, and the count starts over at Pacific midnight', async (t) => {
    quiet(t);
    seedKeys();
    const cases = [
      ['2027-07-04T06:59:59Z', '2027-07-03'], // 11:59:59pm PDT
      ['2027-07-04T07:00:00Z', '2027-07-04'], // midnight PDT
      ['2027-01-15T07:59:59Z', '2027-01-14'], // 11:59:59pm PST
      ['2027-01-15T08:00:00Z', '2027-01-15'], // midnight PST
      ['2026-11-01T08:30:00Z', '2026-11-01'], // 1:30am PDT, the morning the clocks go back
      ['2026-11-01T09:30:00Z', '2026-11-01'], // 1:30am PST, the same Pacific day
    ];
    t.mock.timers.enable({ apis: ['Date'], now: Date.parse(cases[0][0]) });
    for (const [iso, day] of cases) {
      t.mock.timers.setTime(Date.parse(iso));
      await tap(`UID_DAY_${iso}`);
      assert.ok(S.docs.has(`miracleUsage/UID_DAY_${iso}_${day}`), `${iso} should count on ${day}`);
      assert.ok(S.docs.has(`miracleUsage/_all_${day}`), `${iso} should count on ${day} for everyone`);
    }
    // Ten taps at 11:50pm Pacific; the eleventh is refused; at 12:01am it's a new day.
    t.mock.timers.setTime(Date.parse('2027-03-01T07:50:00Z'));
    for (let i = 0; i < 10; i += 1) await tap('UID_MIDNIGHT');
    await thrown(tap('UID_MIDNIGHT'));
    t.mock.timers.setTime(Date.parse('2027-03-01T08:01:00Z'));
    await tap('UID_MIDNIGHT');
    assert.equal(S.docs.get('miracleUsage/UID_MIDNIGHT_2027-02-28').taps, 10);
    assert.equal(S.docs.get('miracleUsage/UID_MIDNIGHT_2027-03-01').taps, 1);
  });

  test('fifteen taps at once never overshoot ten', async (t) => {
    atOwnMoment(t);
    quiet(t);
    seedKeys();
    const results = await Promise.allSettled(Array.from({ length: 15 }, () => tap('UID_RACE')));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const refused = results.filter((r) => r.status === 'rejected' && r.reason.details?.reason === 'daily-limit').length;
    assert.equal(ok, 10);
    assert.equal(refused, 5);
    assert.equal(S.openaiCalls.length, 10);
  });

  const usage = (uid) => [...S.docs.entries()].find(([k]) => k.startsWith(`miracleUsage/${uid}_`))?.[1] || {};
  const allUsage = () => [...S.docs.entries()].find(([k]) => k.startsWith('miracleUsage/_all_'))?.[1] || {};
  const BUSY = { message: 'Rate limit reached.', type: 'requests', code: 'rate_limit_exceeded' };
  const BROKE = { message: 'You exceeded your current quota.', type: 'insufficient_quota', code: 'insufficient_quota' };

  test('a tap that drew nothing because OpenAI was busy or out of money is given back', async (t) => {
    atOwnMoment(t);
    quiet(t);
    seedKeys();
    S.openai = async () => openaiError(429, BUSY);
    for (let i = 0; i < 6; i += 1) assertPlainError(await thrown(tap('UID_BUSY')), 'unavailable', BUSY_MSG, 'busy');
    S.openai = async () => openaiError(429, BROKE);
    for (let i = 0; i < 4; i += 1) assertPlainError(await thrown(tap('UID_BUSY')), 'unavailable', UNAVAILABLE_MSG, 'unavailable');
    assert.equal(usage('UID_BUSY').taps, 0, 'ten failed taps used up nothing');
    assert.equal(allUsage().taps, 0);
    S.openai = async () => okImage();
    await tap('UID_BUSY');
    assert.equal(usage('UID_BUSY').taps, 1);
    assert.equal(usage('UID_BUSY').refunds, 10);
  });

  test('a refused tap still counts, and so does one where some pictures came back', async (t) => {
    atOwnMoment(t);
    quiet(t);
    seedKeys();
    S.openai = async () => openaiError(400, REFUSED);
    assertPlainError(await thrown(tap('UID_REF')), 'invalid-argument', REFUSED_MSG, 'refused');
    assert.equal(usage('UID_REF').taps, 1);
    S.openai = async (f, n) => (n === 2 ? openaiError(429, BUSY) : okImage());
    await tap('UID_REF', { variants: 3, distill: true });
    assert.equal(usage('UID_REF').taps, 2);
    assert.equal(usage('UID_REF').refunds || 0, 0);
  });

  test('refunds stop at the day\'s limits, so an outage cannot become unlimited Claude calls', async (t) => {
    atOwnMoment(t);
    quiet(t);
    seedKeys();
    S.docs.set('config/miracles', { dailyPerUser: 2, dailyTotal: 3 });
    S.openai = async () => openaiError(429, BUSY);
    // A person: two given back, then two that count, then the day is used up.
    for (let i = 0; i < 4; i += 1) await thrown(tap('UID_OUT'));
    assert.equal(usage('UID_OUT').refunds, 2);
    assert.equal(usage('UID_OUT').taps, 2);
    assertPlainError(await thrown(tap('UID_OUT')), 'resource-exhausted', LIMIT_MSG, 'daily-limit');
    // Everyone: one more refund is left for the whole day (3), then failures count.
    await thrown(tap('UID_OTHER'));
    assert.equal(allUsage().refunds, 3);
    await thrown(tap('UID_OTHER'));
    assert.equal(usage('UID_OTHER').taps, 1);
    assert.equal(allUsage().taps, 3);
    assertPlainError(await thrown(tap('UID_THIRD')), 'resource-exhausted', TOTAL_MSG, 'daily-total');
  });

  test('a failed upgrade is not given back', async (t) => {
    atOwnMoment(t);
    quiet(t);
    seedKeys();
    await tap('UID_UPFAIL');
    S.openai = async () => openaiError(429, BUSY);
    await thrown(upgrade('UID_UPFAIL', 'better'));
    assert.equal(usage('UID_UPFAIL').taps, 1);
    assert.equal(usage('UID_UPFAIL').upgrades, 1);
    assert.equal(usage('UID_UPFAIL').refunds || 0, 0);
  });
});

// ---------------------------------------------------------------------------
describe('deleteMiracleData', () => {
  function seedTwoPeople() {
    S.users.add('abc');
    S.users.add('abcd');
    S.docs.set('miracleBooks/abc', { v: 2, updatedAt: 1, order: ['p1', 'p2', 'p3'], data: '[]' });
    for (const p of ['p1', 'p2', 'p3']) S.docs.set(`miracleBooks/abc/pages/${p}`, { data: '{}', updatedAt: 1 });
    S.docs.set('miracleBooks/abcd', { v: 2, order: ['q1'] });
    S.docs.set('miracleBooks/abcd/pages/q1', { data: '{}', updatedAt: 1 });
    S.docs.set('miracleUsage/abc_2026-10-03', { taps: 3 });
    for (const f of ['miracles/abc/BOX1/one.webp', 'miracles/abc/BOX1/two.webp', 'miracles/abc/BOX2/three.webp',
      'miracles/abcd/BOX1/theirs.webp', 'sagediagram/shared.webp']) {
      S.files.set(f, { bytes: Buffer.from('x'), contentType: 'image/webp' });
    }
  }

  test('deletes the book, every page, every drawing and the account, and nobody else\'s', async (t) => {
    quiet(t);
    seedTwoPeople();
    const out = await call('deleteMiracleData', 'abc', {});
    assert.deepEqual(out, { ok: true, docs: 4, files: 3 });
    assert.deepEqual([...S.docs.keys()].filter((k) => k.startsWith('miracleBooks/abc/') || k === 'miracleBooks/abc'), []);
    assert.deepEqual([...S.files.keys()].sort(), ['miracles/abcd/BOX1/theirs.webp', 'sagediagram/shared.webp']);
    assert.ok(S.docs.has('miracleBooks/abcd'));
    assert.ok(S.docs.has('miracleBooks/abcd/pages/q1'));
    assert.ok(S.docs.has('miracleUsage/abc_2026-10-03'), 'the per-day counters stay');
    assert.deepEqual([...S.users], ['abcd']);
  });

  test('a Google sign-in loses its book but keeps its account', async (t) => {
    quiet(t);
    seedTwoPeople();
    const out = await call('deleteMiracleData', 'abc', {}, { firebase: { sign_in_provider: 'google.com' } });
    assert.deepEqual(out, { ok: true, docs: 4, files: 3 });
    assert.equal(S.docs.has('miracleBooks/abc'), false);
    assert.ok(S.users.has('abc'), 'the account stays');
  });

  test('is fine called twice', async (t) => {
    quiet(t);
    seedTwoPeople();
    await call('deleteMiracleData', 'abc', {});
    assert.deepEqual(await call('deleteMiracleData', 'abc', {}), { ok: true, docs: 0, files: 0 });
  });

  test('refuses a caller who is not signed in', async () => {
    const e = await thrown(call('deleteMiracleData', null, {}));
    assert.equal(e.code, 'unauthenticated');
  });

  test('keeps the account when the data could not be deleted, so it can be tried again', async (t) => {
    quiet(t);
    seedTwoPeople();
    S.failGetFiles = true;
    const e = await thrown(call('deleteMiracleData', 'abc', {}));
    assertPlainError(e, 'unavailable', "Couldn't delete everything just now. Try again in a minute.", 'unavailable');
    assert.ok(S.users.has('abc'));
    S.failGetFiles = false;
    assert.deepEqual(await call('deleteMiracleData', 'abc', {}), { ok: true, docs: 0, files: 3 });
    assert.equal(S.users.has('abc'), false);
  });

  test('lives where illustrateMiracle does', () => {
    assert.deepEqual(fns.deleteMiracleData.__endpoint.region, fns.illustrateMiracle.__endpoint.region);
    assert.deepEqual(fns.deleteMiracleData.__endpoint.region, ['us-central1']);
    assert.ok(fns.deleteMiracleData.__endpoint.callableTrigger);
  });
});

// ---------------------------------------------------------------------------
describe('sagediagram', () => {
  test('the moments and delete modes are gone', async () => {
    S.docs.set('miracleBooks/someone', { data: JSON.stringify([{ date: '2026-10-01', boxes: [{ text: 'a private moment' }] }]) });
    S.docs.set('sagediagram/keep_me', { name: 'keep_me.webp' });
    S.files.set('sagediagram/keep_me.webp', { bytes: Buffer.from('x') });
    for (const mode of ['moments', 'delete']) {
      const e = await thrown(call('sagediagram', 'ANON', { mode, id: 'keep_me' }));
      assert.equal(e.code, 'invalid-argument');
      assert.equal(e.message, `unknown mode: ${mode}`);
    }
    assert.ok(S.docs.has('sagediagram/keep_me'));
    assert.ok(S.files.has('sagediagram/keep_me.webp'));
  });

  test('list, add and caption still work', async (t) => {
    quiet(t);
    const added = await call('sagediagram', 'ANON', { mode: 'add', name: 'Owl On A Fence.webp', month: 'March', caption: 'owl', imageBase64: Buffer.from('img').toString('base64') });
    assert.equal(added.id, 'owl_on_a_fence');
    assert.ok(S.files.has('sagediagram/owl_on_a_fence.webp'));
    assert.deepEqual(await call('sagediagram', 'ANON', { mode: 'caption', id: 'owl_on_a_fence', caption: 'an owl' }), { ok: true });
    const { items } = await call('sagediagram', 'ANON', { mode: 'list' });
    assert.equal(items.length, 1);
    assert.equal(items[0].caption, 'an owl');
    assert.equal(items[0].month, 'March');
  });
});

// ---------------------------------------------------------------------------
// Through the real callable HTTP wrapper: what an app actually receives.
describe('on the wire', () => {
  let express;
  try { express = require('express'); } catch { express = null; }

  async function post(name, uid, data) {
    const app = express();
    app.use(express.json());
    app.post('/', (req, res) => fns[name](req, res));
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: uid, uid, firebase: { sign_in_provider: 'anonymous' } })}.sig`;
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data }),
      });
      return { status: res.status, body: await res.json() };
    } finally {
      server.close();
    }
  }

  test('a refusal arrives as a status, a plain message and details.reason', { skip: !express && 'express not installed' }, async (t) => {
    atOwnMoment(t);
    quiet(t);
    seedKeys();
    S.docs.set('config/miracles', { dailyPerUser: 1, dailyTotal: 100 });
    const first = await post('illustrateMiracle', 'UID_WIRE', { text: SENTENCE, id: 'BOX1', distill: false, variants: 1, tier: 'fast' });
    assert.equal(first.status, 200);
    assert.equal(first.body.result.concepts.length, 1);
    const second = await post('illustrateMiracle', 'UID_WIRE', { text: SENTENCE, id: 'BOX1', distill: false, variants: 1, tier: 'fast' });
    assert.equal(second.status, 429);
    assert.deepEqual(second.body, { error: { details: { reason: 'daily-limit' }, message: LIMIT_MSG, status: 'RESOURCE_EXHAUSTED' } });
    S.openai = async () => openaiError(400, REFUSED);
    const refused = await post('illustrateMiracle', 'UID_WIRE_2', { text: SENTENCE, id: 'BOX1', distill: false, variants: 1, tier: 'fast' });
    assert.equal(refused.status, 400);
    assert.deepEqual(refused.body, { error: { details: { reason: 'refused' }, message: REFUSED_MSG, status: 'INVALID_ARGUMENT' } });
    S.openai = async () => openaiError(429, { message: 'You exceeded your current quota.', type: 'insufficient_quota', code: 'insufficient_quota' });
    const broke = await post('illustrateMiracle', 'UID_WIRE_3', { text: SENTENCE, id: 'BOX1', distill: false, variants: 1, tier: 'fast' });
    assert.equal(broke.status, 503);
    assert.deepEqual(broke.body, { error: { details: { reason: 'unavailable' }, message: UNAVAILABLE_MSG, status: 'UNAVAILABLE' } });
    assert.doesNotMatch(JSON.stringify(broke.body), /quota/, 'none of OpenAI\'s words reach the app');
  });

  test('deleteMiracleData answers {ok, docs, files}', { skip: !express && 'express not installed' }, async (t) => {
    quiet(t);
    S.users.add('UID_WIRE_DEL');
    S.docs.set('miracleBooks/UID_WIRE_DEL', { v: 2 });
    S.docs.set('miracleBooks/UID_WIRE_DEL/pages/p1', { data: '{}' });
    S.files.set('miracles/UID_WIRE_DEL/BOX1/a.webp', { bytes: Buffer.from('x') });
    const res = await post('deleteMiracleData', 'UID_WIRE_DEL', {});
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { result: { ok: true, docs: 2, files: 1 } });
    assert.equal(S.users.has('UID_WIRE_DEL'), false, 'an anonymous account read off a real token is deleted');
  });
});

// ---------------------------------------------------------------------------
describe('Node 22', () => {
  test('package.json asks Cloud Functions for Node 22', () => {
    const pkg = require(path.join(FUNCTIONS_DIR, 'package.json'));
    const lock = require(path.join(FUNCTIONS_DIR, 'package-lock.json'));
    assert.equal(pkg.engines.node, '22');
    assert.equal(lock.packages[''].engines.node, '22');
  });

  test('index.js loads with its real dependencies on this Node', () => {
    const env = { ...process.env };
    delete env.FIREBASE_DEBUG_MODE;
    delete env.FIREBASE_DEBUG_FEATURES;
    const r = spawnSync(process.execPath, ['-e',
      "const m = require('./index.js'); console.log(JSON.stringify({ node: process.versions.node, exports: Object.keys(m) }));"],
    { cwd: FUNCTIONS_DIR, env, encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.ok(Number(out.node.split('.')[0]) >= 22, `running on Node ${out.node}`);
    for (const name of ['illustrateMiracle', 'deleteMiracleData', 'sagediagram']) assert.ok(out.exports.includes(name), name);
  });
});
