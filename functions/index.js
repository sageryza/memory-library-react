// Cloud Functions — XI Versus turn notifications.
//
// When a game updates such that a player can now move (and hasn't been pinged
// yet this round), notify them: a web-push via FCM to their registered devices,
// and an email via the "Trigger Email" extension (we just write to /mail).
//
// Spam control: we track a `notified` array on the game doc — players already
// pinged for the current round. It resets when the round advances. Our own write
// of `notified` re-triggers this function, but then everyone able to move is
// already in `notified`, so no further sends and no write — no loop.

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { getStorage } = require('firebase-admin/storage');
const crypto = require('node:crypto');
const Anthropic = require('@anthropic-ai/sdk');

initializeApp();
const db = getFirestore();

const APP_URL = 'https://membry-df528.web.app';

// Twilio credentials live in a locked-down Firestore doc (config/twilio:
// { accountSid, authToken, from }) so they can be set from the Firebase console
// — no CLI/Secret Manager needed. Client rules don't match config/**, so it's
// admin-only by default. Returns false if SMS isn't configured.
async function loadTwilio() {
  try {
    const snap = await db.doc('config/twilio').get();
    const d = snap.exists ? snap.data() : null;
    return (d && d.accountSid && d.authToken && d.from) ? d : false;
  } catch { return false; }
}

async function sendSms(cfg, to, body) {
  if (!cfg) return;
  let num = String(to).trim();
  if (!num.startsWith('+')) {
    const digits = num.replace(/\D/g, '');
    num = '+' + (digits.length === 10 ? '1' + digits : digits); // assume US if 10 digits
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;
  const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');
  const form = new URLSearchParams({ To: num, From: cfg.from, Body: body });
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  if (!res.ok) console.error('Twilio SMS failed', res.status, await res.text().catch(() => ''));
}

exports.notifyVersusTurn = onDocumentUpdated('versusGames/{gameId}', async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data();
  if (!after) return;

  const players = after.players || [];
  if (players.length < 2) return; // solo game: no one is waiting on a turn

  const acted = after.acted || [];
  const roundChanged = (before.round || 0) !== (after.round || 0);
  const notified = roundChanged ? [] : (after.notified || []).slice();

  // Players who can move now and haven't been pinged yet this round. (The player
  // who just moved is in `acted`, so they're naturally excluded.)
  const toNotify = players.filter((p) => !acted.includes(p.uid) && !notified.includes(p.uid));

  if (toNotify.length === 0) {
    // Nothing to send; only persist a round-reset of `notified` if needed.
    if (roundChanged && (after.notified || []).length) {
      await event.data.after.ref.update({ notified: [] });
    }
    return;
  }

  const gameId = event.params.gameId;
  const link = `${APP_URL}/xi/versus/${gameId}`;
  const twilio = await loadTwilio();

  for (const p of toNotify) {
    try {
      const uSnap = await db.doc(`users/${p.uid}`).get();
      const u = uSnap.exists ? uSnap.data() : {};
      if (u.notifOptIn !== true) { notified.push(p.uid); continue; } // not opted in

      // Web push to all their devices.
      const tokens = Array.isArray(u.fcmTokens) ? u.fcmTokens : [];
      if (tokens.length) {
        const res = await getMessaging().sendEachForMulticast({
          tokens,
          notification: { title: 'XI · Versus', body: 'It’s your move on the board.' },
          webpush: {
            fcmOptions: { link },
            notification: { icon: '/pwa-192x192.png', badge: '/pwa-192x192.png' },
          },
        });
        const dead = [];
        res.responses.forEach((r, i) => { if (!r.success) dead.push(tokens[i]); });
        if (dead.length) {
          await db.doc(`users/${p.uid}`).update({ fcmTokens: FieldValue.arrayRemove(...dead) });
        }
      }

      // Email via the Trigger Email extension (reads the /mail collection).
      if (u.notifEmailOn === true && u.notifEmail) {
        await db.collection('mail').add({
          to: u.notifEmail,
          message: {
            subject: 'Your move in XI · Versus',
            text: `It’s your turn to play in XI · Versus.\nOpen the board: ${link}`,
            html: `<p>It’s your turn to play in <b>XI · Versus</b>.</p>`
                + `<p><a href="${link}">Open the board →</a></p>`,
          },
        });
      }

      // Text via Twilio (if both the player and the project are configured).
      if (u.notifSmsOn === true && u.notifPhone) {
        await sendSms(twilio, u.notifPhone, `XI · Versus — it’s your move: ${link}`);
      }

      notified.push(p.uid);
    } catch (e) {
      console.error('notify failed for', p.uid, e);
    }
  }

  await event.data.after.ref.update({ notified });
});

// ===========================================================================
// Dream illustration — draw a picture for a dream entry via Replicate.
//
// Reuses the same trained-LoRA styles as the ImageForge app. v1 ships ONE
// style, "Book Illustrations" (Replicate model sageryza/victorianstyle,
// trigger word "vict"), and is words-only: the dream's text becomes the prompt.
//
// The Replicate API token lives in a locked-down Firestore doc
// (config/replicate: { apiToken }) so it can be set from the Firebase console
// — same pattern as config/twilio. Client rules don't match config/**, so it's
// admin-only by default. Set it once and image generation goes live.
// ===========================================================================

const REPLICATE_MODEL = 'sageryza/victorianstyle'; // "Book Illustrations"
const REPLICATE_TRIGGER = 'vict';
const STORAGE_BUCKET = 'membry-df528.firebasestorage.app';

// Find the Replicate API token in the config collection. It's added by hand
// from the Firebase console, so it may live in any config/* doc under any field
// name (e.g. config/replicate.apiToken, or config/anthropic with a field named
// "api token"). Replicate tokens always start with "r8_", which lets us locate
// it unambiguously without depending on an exact path/field name.
async function loadReplicateToken() {
  try {
    const snap = await db.collection('config').get();
    for (const doc of snap.docs) {
      for (const v of Object.values(doc.data() || {})) {
        if (typeof v === 'string' && v.trim().startsWith('r8_')) return v.trim();
      }
    }
  } catch { /* ignore */ }
  return null;
}

// Find the OpenAI API key in the config collection (same hand-entry tolerance
// as the Replicate token). OpenAI keys start with "sk-" / "sk-proj-"; we
// explicitly skip "sk-ant-" so we never grab the Anthropic key by mistake.
async function loadOpenAIKey() {
  try {
    const snap = await db.collection('config').get();
    for (const doc of snap.docs) {
      for (const v of Object.values(doc.data() || {})) {
        if (typeof v === 'string') {
          const s = v.trim();
          if (s.startsWith('sk-') && !s.startsWith('sk-ant')) return s;
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}

// Turn a dream entry into a Replicate prompt. The LoRA trigger word must be
// present in the prompt for the trained style to apply.
function buildDreamPrompt(entry) {
  const parts = [];
  if (entry.title) parts.push(String(entry.title).trim());
  if (entry.content) parts.push(String(entry.content).trim());
  const body = parts.join('. ').replace(/\s+/g, ' ').trim().slice(0, 1500);
  return `${REPLICATE_TRIGGER}, ${body}`;
}

async function replicateFetch(path, token, init = {}) {
  const res = await fetch(`https://api.replicate.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Replicate ${path} ${res.status}: ${text}`);
  }
  return res.json();
}

// Download the finished image and store it permanently in Firebase Storage,
// returning a stable Firebase download URL (works regardless of bucket access
// settings, no makePublic/signing needed). Falls back to the temporary
// Replicate URL if the upload fails for any reason.
async function persistImage(imageUrl, path) {
  try {
    const resp = await fetch(imageUrl);
    if (!resp.ok) throw new Error(`download ${resp.status}`);
    const buffer = Buffer.from(await resp.arrayBuffer());
    const bucket = getStorage().bucket(STORAGE_BUCKET);
    const file = bucket.file(path);
    const downloadToken = crypto.randomUUID();
    await file.save(buffer, {
      resumable: false,
      contentType: 'image/webp',
      metadata: {
        cacheControl: 'public, max-age=31536000',
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    });
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/`
      + `${encodeURIComponent(file.name)}?alt=media&token=${downloadToken}`;
  } catch (e) {
    console.error('persistImage failed, falling back to temporary URL', e);
    return imageUrl;
  }
}

// Generate one image with the Book Illustrations LoRA: resolve the model's
// current version, create the flux-dev prediction (same settings ImageForge
// uses), and poll to completion. Returns the raw (temporary) Replicate URL.
async function generateReplicateImage(token, prompt, modelSlug = REPLICATE_MODEL) {
  const model = await replicateFetch(`/v1/models/${modelSlug}`, token);
  const version = model.latest_version?.id;
  if (!version) throw new HttpsError('internal', 'Could not resolve the image model version.');

  let prediction = await replicateFetch('/v1/predictions', token, {
    method: 'POST',
    body: JSON.stringify({
      version,
      input: {
        prompt,
        model: 'dev',
        aspect_ratio: '1:1',
        num_outputs: 1,
        num_inference_steps: 28,
        guidance_scale: 3,
        lora_scale: 1,
        output_format: 'webp',
        output_quality: 80,
      },
    }),
  });

  // Poll until finished (~every 1.5s), with a hard deadline under the timeout.
  const deadline = Date.now() + 110000;
  while (prediction.status === 'starting' || prediction.status === 'processing') {
    if (Date.now() > deadline) {
      throw new HttpsError('deadline-exceeded', 'The image took too long.');
    }
    await new Promise((r) => setTimeout(r, 1500));
    prediction = await replicateFetch(`/v1/predictions/${prediction.id}`, token);
  }

  if (prediction.status !== 'succeeded') {
    throw new HttpsError('internal',
      `Image generation ${prediction.status}: ${prediction.error || 'unknown error'}`);
  }

  const out = prediction.output;
  const rawUrl = Array.isArray(out) ? out[0] : out;
  if (!rawUrl) throw new HttpsError('internal', 'No image was returned.');
  return { rawUrl, modelSlug, version, predictionId: prediction.id };
}

exports.illustrateDream = onCall(
  { region: 'us-central1', timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to illustrate a dream.');

    const groupId = String(request.data?.groupId || '');
    const entryId = String(request.data?.entryId || '');
    if (!groupId || !entryId) {
      throw new HttpsError('invalid-argument', 'groupId and entryId are required.');
    }

    // Membership check — only members of the group may illustrate its dreams,
    // so a stranger can't burn Replicate credits on someone else's journal.
    const groupSnap = await db.doc(`groups/${groupId}`).get();
    const memberIds = groupSnap.exists ? (groupSnap.data().memberIds || []) : [];
    if (!memberIds.includes(uid)) {
      throw new HttpsError('permission-denied', 'You are not a member of this group.');
    }

    const entryRef = db.doc(`groups/${groupId}/entries/${entryId}`);
    const entrySnap = await entryRef.get();
    if (!entrySnap.exists) throw new HttpsError('not-found', 'Dream not found.');
    const entry = entrySnap.data();

    const token = await loadReplicateToken();
    if (!token) {
      throw new HttpsError('failed-precondition',
        'Image generation is not configured yet (missing config/replicate).');
    }

    const prompt = buildDreamPrompt(entry);

    const { rawUrl } = await generateReplicateImage(token, prompt);
    const url = await persistImage(rawUrl, `dreams/${groupId}/${entryId}.webp`);

    const illustration = {
      url,
      prompt,
      style: 'Book Illustrations',
      model: REPLICATE_MODEL,
      source: 'replicate',
      createdAt: new Date().toISOString(),
    };
    await entryRef.update({ illustration, updatedAt: FieldValue.serverTimestamp() });

    return { url };
  }
);

// The trained ImageForge styles, by key. Each is a Replicate LoRA owned by
// sageryza with its own trigger word. Used by the test page so we can compare
// styles and find the one that matches the dream-drawing look.
const TEST_STYLES = {
  vict: { model: 'sageryza/victorianstyle', trigger: 'vict' }, // Book Illustrations
  wtr: { model: 'sageryza/watercolordrawings', trigger: 'wtr' }, // Watercolor
  tok: { model: 'sageryza/pwcscans', trigger: 'tok' }, // PWC Scans
  pnt: { model: 'sageryza/paint', trigger: 'pnt' }, // Painterly
  special: { model: 'sageryza/special', trigger: 'special' }, // Sketchy
  gosh: { model: 'sageryza/gosh', trigger: 'gosh' }, // Gouache
};

// Standalone image-generation test. Takes a prompt + style key, runs it through
// the chosen LoRA, and returns the image URL — no dream entry, group, or storage
// involved. Lets us verify the Replicate setup and compare styles independent of
// the dream-journal UI.
exports.generateTestImage = onCall(
  { region: 'us-central1', timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const raw = String(request.data?.prompt || '').trim();
    if (!raw) throw new HttpsError('invalid-argument', 'Enter a prompt.');

    const token = await loadReplicateToken();
    if (!token) {
      throw new HttpsError('failed-precondition',
        'No Replicate token found in config/* (looking for an r8_… value).');
    }

    const style = TEST_STYLES[String(request.data?.style || 'vict')] || TEST_STYLES.vict;
    const body = raw.slice(0, 1500);
    const prompt = style.trigger ? `${style.trigger}, ${body}` : body;
    const { rawUrl, modelSlug, version, predictionId } =
      await generateReplicateImage(token, prompt, style.model);
    return {
      url: rawUrl,
      prompt,
      model: modelSlug,
      version,
      predictionUrl: `https://replicate.com/p/${predictionId}`,
    };
  }
);

// Image-reference test via OpenAI gpt-image-1. Takes an uploaded image + prompt
// and returns a transformed image (data URL). Uses the images/edits endpoint —
// the one that accepts an input image — so we can compare reference output
// against the Replicate trained styles.
exports.generateReferenceImage = onCall(
  { region: 'us-central1', timeoutSeconds: 120, memory: '1GiB' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const prompt = String(request.data?.prompt || '').trim();
    const imageBase64 = String(request.data?.imageBase64 || '');
    const mimeType = String(request.data?.mimeType || 'image/png');
    if (!prompt) throw new HttpsError('invalid-argument', 'Enter a prompt.');
    if (!imageBase64) throw new HttpsError('invalid-argument', 'Upload a reference image.');

    const key = await loadOpenAIKey();
    if (!key) {
      throw new HttpsError('failed-precondition',
        'No OpenAI key found in config/* (looking for an sk-… value, not sk-ant).');
    }

    const buffer = Buffer.from(imageBase64, 'base64');
    const ext = /jpe?g/.test(mimeType) ? 'jpg' : (/webp/.test(mimeType) ? 'webp' : 'png');

    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', prompt);
    form.append('size', '1024x1024');
    form.append('n', '1');
    form.append('image', new Blob([buffer], { type: mimeType }), `reference.${ext}`);

    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 429) {
        throw new HttpsError('resource-exhausted',
          'OpenAI rate limit (~5 images/minute). Wait ~30–60s and try again.');
      }
      throw new HttpsError('internal', `OpenAI ${res.status}: ${text.slice(0, 400)}`);
    }
    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new HttpsError('internal', 'No image returned from OpenAI.');
    return { url: `data:image/png;base64,${b64}`, model: 'gpt-image-1', prompt };
  }
);

/* ===== AI assist (Anthropic) ============================================== */
// The Anthropic API key lives in a locked-down Firestore doc (config/anthropic:
// { key }), set from the Firebase console — same pattern as Twilio above, so no
// CLI / Secret Manager is needed. Client rules don't match config/**, so only
// this (admin) function can read it.
async function loadAnthropicKey() {
  try {
    const snap = await db.doc('config/anthropic').get();
    const d = snap.exists ? snap.data() : null;
    return (d && d.key) ? d.key : null;
  } catch { return null; }
}

// Frequent + cheap for titles; stronger for the occasional card-generation pass.
const TITLE_MODEL = 'claude-haiku-4-5';
const CARDS_MODEL = 'claude-sonnet-4-6';

const TITLE_SYSTEM = 'You write short, evocative titles for a person\'s own memories. '
  + '2–6 words. No quotes, no trailing punctuation. Capture what the memory is ABOUT '
  + 'so the writer recognizes it at a glance — plain, human, specific. Never generic, '
  + 'never a summary sentence. Output only the title.';

// The creative crux of the card generator: teach the target "altitude" with the
// dream-deck phrases as exemplars, and forbid retelling the person's specifics.
const CARDS_SYSTEM = [
  'You generate cards for "XI", a memory game. A card is a SHORT phrase (2–6 words)',
  'that works as a provocative prompt — it should make someone think "oh, when did',
  'THAT happen to me?" and surface a specific memory of their own.',
  '',
  'The sweet spot:',
  '- Broad enough to match MANY different life situations, but',
  '- evocative enough to NOT be generic filler.',
  '- Mostly first-person past-tense action fragments, or universal states/twists.',
  '- Plain language. No proper nouns, no names, no details unique to one story.',
  '',
  'Model cards that nail the altitude:',
  'did my best · used my time wisely · falsely accused · told them how I felt ·',
  'had no idea what to do · saw them for what they were · interrupted · fell asleep',
  'at the wheel · was unable to help · finally confessed · the tip of the iceberg ·',
  'it took longer than expected · took me by surprise',
  '',
  'You will be given memories from one person\'s life. Read them for recurring shapes,',
  'feelings, and turning points, then ABSTRACT up to card altitude. Do NOT retell their',
  'specific memories — generalize the underlying move so each card works for them AND',
  'others. Avoid duplicating the model cards above.',
  '',
  'Output ONLY the cards, one per line, lowercase, no numbering, no commentary.',
].join('\n');

const textOf = (msg) => ((msg && msg.content && msg.content[0] && msg.content[0].text) || '');

// Callable AI assist:
//   { mode: 'title', text }                    -> { title }
//   { mode: 'cards', memories: [str,...], n }  -> { cards: [phrase,...] }
exports.aiAssist = onCall({ cors: true, timeoutSeconds: 120 }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const key = await loadAnthropicKey();
  const data = req.data || {};
  const mode = data.mode || '';

  // Health check — reports whether the key is configured. No model call, no
  // cost, and doesn't require the key to exist (returns false if missing).
  if (mode === 'status') return { configured: !!key };

  if (!key) throw new HttpsError('failed-precondition', 'AI is not configured yet.');
  const client = new Anthropic({ apiKey: key });

  if (mode === 'title') {
    const text = String(data.text || '').trim().slice(0, 4000);
    if (!text) throw new HttpsError('invalid-argument', 'No text to title.');
    const msg = await client.messages.create({
      model: TITLE_MODEL,
      max_tokens: 40,
      system: TITLE_SYSTEM,
      messages: [{ role: 'user', content: `Memory:\n\n${text}\n\nTitle:` }],
    });
    const title = textOf(msg).trim().replace(/^["']|["']$/g, '').replace(/[.\s]+$/, '');
    return { title };
  }

  if (mode === 'cards') {
    const mems = Array.isArray(data.memories)
      ? data.memories.map((m) => String(m || '').trim()).filter(Boolean).slice(0, 200) : [];
    if (!mems.length) throw new HttpsError('invalid-argument', 'No memories provided.');
    const n = Math.max(1, Math.min(60, Number(data.n) || 24));
    const corpus = mems.map((m, i) => `${i + 1}. ${m.slice(0, 400)}`).join('\n');
    const msg = await client.messages.create({
      model: CARDS_MODEL,
      max_tokens: 1500,
      system: CARDS_SYSTEM,
      messages: [{ role: 'user', content: `Here are memories from one person's life:\n\n${corpus}\n\nWrite ${n} cards.` }],
    });
    const cards = textOf(msg).split('\n')
      .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
      .filter(Boolean).slice(0, n);
    return { cards };
  }

  throw new HttpsError('invalid-argument', 'Unknown mode.');
});

/* ===== The Little Book of Miracles ======================================= */
// One style (Sketchy / sageryza/special) + baked-in style guidelines. A moment
// is distilled by Claude into a short caption + a single simple thing to doodle,
// then drawn as a black-ink line doodle and saved permanently.

const MIRACLE_MODEL = 'sageryza/special';
const MIRACLE_TRIGGER = 'special';
const MIRACLE_STYLE_GUIDE =
  'simple black ink line drawing, bold confident strokes, the single subject drawn '
  + 'large and filling most of the frame, minimal background, no color, no text or '
  + 'letters, charming and childlike, plain white background';

const MIRACLE_SYSTEM = [
  'You turn a small real-life moment into ONE clever little doodle for a keepsake book',
  'of tiny daily miracles. This is a creative task: think about what single image would',
  'make someone instantly recall — and smile at — this exact moment. The best choice is',
  'recognizable at a glance AND captures what made the moment special, funny, or sweet.',
  'It is usually a specific object or a tiny two-element scene, NOT a literal retelling of',
  'the whole story. Consider a few options and pick the most evocative one.',
  '',
  'Respond with ONLY a JSON object: {"caption": "...", "drawing": "..."}.',
  '- drawing: name the literal subject to draw, plainly and concretely (e.g. "a slice of',
  '  birthday cake", "a hand holding a glass of water", "a sleeping fox"). Keep it simple',
  '  enough to draw in a few lines. Never include any words, letters, signs, or text.',
  '- caption: a short, warm, lowercase note, max ~8 words.',
].join('\n');

exports.illustrateMiracle = onCall(
  { region: 'us-central1', timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const text = String(request.data?.text || '').trim();
    if (!text) throw new HttpsError('invalid-argument', 'Write a miracle first.');
    const id = String(request.data?.id || crypto.randomUUID());

    const repToken = await loadReplicateToken();
    if (!repToken) {
      throw new HttpsError('failed-precondition', 'No Replicate token found in config/*.');
    }

    // Distill the moment into a simple drawing prompt (best-effort). When
    // distill is false, draw the user's text verbatim instead.
    const distill = request.data?.distill !== false;
    let caption = text.slice(0, 80);
    let drawing = text;
    if (distill) {
      const anthropicKey = await loadAnthropicKey();
      if (anthropicKey) {
        try {
          const client = new Anthropic({ apiKey: anthropicKey });
          const msg = await client.messages.create({
            model: 'claude-opus-4-8',
            max_tokens: 2000,
            thinking: { type: 'adaptive' }, // let it actually reason about the best image
            output_config: { effort: 'medium' },
            system: MIRACLE_SYSTEM,
            messages: [{ role: 'user', content: text.slice(0, 2000) }],
          });
          // With thinking on, the answer is the text block (not content[0]).
          const block = (msg.content || []).find((b) => b.type === 'text');
          const raw = (block?.text || '').trim().replace(/^```json\s*|\s*```$/g, '');
          const parsed = JSON.parse(raw);
          if (parsed.caption) caption = String(parsed.caption).trim();
          if (parsed.drawing) drawing = String(parsed.drawing).trim();
        } catch (e) {
          console.error('miracle distill failed; using raw text', e);
        }
      }
    }

    const prompt = `${MIRACLE_TRIGGER}, ${drawing}, ${MIRACLE_STYLE_GUIDE}`;
    const { rawUrl } = await generateReplicateImage(repToken, prompt, MIRACLE_MODEL);
    const url = await persistImage(rawUrl, `miracles/${uid}/${id}.webp`);
    return { url, caption, drawing, id };
  }
);
