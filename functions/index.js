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

async function loadReplicateToken() {
  try {
    const snap = await db.doc('config/replicate').get();
    const d = snap.exists ? snap.data() : null;
    return d && d.apiToken ? String(d.apiToken).trim() : null;
  } catch { return null; }
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
async function persistImage(imageUrl, groupId, entryId) {
  try {
    const resp = await fetch(imageUrl);
    if (!resp.ok) throw new Error(`download ${resp.status}`);
    const buffer = Buffer.from(await resp.arrayBuffer());
    const bucket = getStorage().bucket(STORAGE_BUCKET);
    const file = bucket.file(`dreams/${groupId}/${entryId}.webp`);
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

    // Resolve the model's current version, then create the prediction with the
    // same flux-dev LoRA settings ImageForge uses.
    const model = await replicateFetch(`/v1/models/${REPLICATE_MODEL}`, token);
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

    // Poll until finished (~every 1.5s), with a hard deadline under the
    // function timeout.
    const deadline = Date.now() + 110000;
    while (prediction.status === 'starting' || prediction.status === 'processing') {
      if (Date.now() > deadline) {
        throw new HttpsError('deadline-exceeded', 'The illustration took too long.');
      }
      await new Promise((r) => setTimeout(r, 1500));
      prediction = await replicateFetch(`/v1/predictions/${prediction.id}`, token);
    }

    if (prediction.status !== 'succeeded') {
      throw new HttpsError('internal',
        `Illustration ${prediction.status}: ${prediction.error || 'unknown error'}`);
    }

    const out = prediction.output;
    const rawUrl = Array.isArray(out) ? out[0] : out;
    if (!rawUrl) throw new HttpsError('internal', 'No image was returned.');

    const url = await persistImage(rawUrl, groupId, entryId);

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
