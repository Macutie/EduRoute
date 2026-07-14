/* eslint-disable no-undef */
const search = new URL(self.location.href).searchParams;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

const firebaseConfig = {
  apiKey: search.get('apiKey') || '',
  authDomain: search.get('authDomain') || '',
  projectId: search.get('projectId') || '',
  storageBucket: search.get('storageBucket') || '',
  messagingSenderId: search.get('messagingSenderId') || '',
  appId: search.get('appId') || '',
};

if (firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId) {
  importScripts('https://www.gstatic.com/firebasejs/12.12.1/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/12.12.1/firebase-messaging-compat.js');

  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || 'EduRoute';
    const body = payload.notification?.body || payload.data?.message || 'You have a new notification.';
    const url = payload.data?.url || '/';
    const icon = payload.notification?.icon || payload.data?.icon || '/eduroute-logo-192.png';
    const badge = payload.data?.badge || '/eduroute-logo-192.png';
    const tag = payload.data?.tag || `eduroute-${payload.data?.type || 'notification'}-${payload.data?.notificationId || Date.now()}`;

    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      renotify: true,
      requireInteraction: false,
      vibrate: [200, 100, 200],
      timestamp: Date.now(),
      data: {
        url,
        notificationId: payload.data?.notificationId || '',
        locatorSlipId: payload.data?.locatorSlipId || '',
        type: payload.data?.type || '',
      },
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification?.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existingClient = clientList.find((client) => 'focus' in client);
      if (existingClient) {
        existingClient.navigate(targetUrl);
        return existingClient.focus();
      }

      return clients.openWindow(targetUrl);
    })
  );
});
