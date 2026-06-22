import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import app, { db } from '../firebase';

// Public web-push key from Firebase Console → Cloud Messaging → Web Push
// certificates. Injected at build time; if absent, push is skipped gracefully.
const VAPID = import.meta.env.VITE_FCM_VAPID_KEY || '';

// Opt this user in to "it's your turn" alerts: a web push (if the browser
// supports it and the user grants permission) and email (signed-in users with
// an address). Preferences live on users/{uid} for the Cloud Function to read.
export async function enableTurnNotifications(user) {
  if (!user?.uid) throw new Error('Sign in to get turn notifications.');
  const prefs = { notifOptIn: true, notifEmail: user.email || '', notifEmailOn: !!user.email };
  let pushOn = false;

  try {
    const supported = (await isSupported().catch(() => false)) && !!VAPID && 'Notification' in window;
    if (supported) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/firebase-push/' });
        const token = await getToken(getMessaging(app), { vapidKey: VAPID, serviceWorkerRegistration: reg });
        if (token) { prefs.fcmTokens = arrayUnion(token); pushOn = true; }
      }
    }
  } catch (e) {
    console.warn('[notify] push setup failed:', e?.message || e);
  }

  await setDoc(doc(db, 'users', user.uid), prefs, { merge: true });
  return { pushOn, emailOn: !!user.email };
}

export async function disableTurnNotifications(user) {
  if (!user?.uid) return;
  await setDoc(doc(db, 'users', user.uid), { notifOptIn: false, notifEmailOn: false }, { merge: true });
}

export default enableTurnNotifications;
