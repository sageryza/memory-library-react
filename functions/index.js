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
