/* Firebase Cloud Messaging background worker. Handles "it's your turn" pushes
   when the XI PWA isn't in the foreground. Uses the compat SDK (service workers
   can't use ES modules + import.meta). The config below is public by design. */
/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCA04ReaTAoNDUgUCuBS-ti0Jkfl-16h_s',
  authDomain: 'membry-df528.firebaseapp.com',
  projectId: 'membry-df528',
  storageBucket: 'membry-df528.firebasestorage.app',
  messagingSenderId: '513384339473',
  appId: '1:513384339473:web:8f46c5915a949c93a8b9b0',
});

const messaging = firebase.messaging();

// Show the notification when a push arrives in the background.
messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const link = (payload.fcmOptions && payload.fcmOptions.link)
    || (payload.data && payload.data.link) || '/xi/versus';
  self.registration.showNotification(n.title || 'XI · Versus', {
    body: n.body || 'It’s your move.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: { link },
  });
});

// Focus/open the game when the notification is tapped.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/xi/versus';
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) { c.navigate(link); return c.focus(); } }
    if (clients.openWindow) return clients.openWindow(link);
  })());
});
