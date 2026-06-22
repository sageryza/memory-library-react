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
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

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
