import { initializeApp } from 'firebase/app';
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';

const FIREBASE_SERVICE_WORKER_PATH = '/firebase-messaging-sw.js';
const FIREBASE_SERVICE_WORKER_VERSION = '2026-07-14-1';
const PUSH_REGISTRATION_RETRY_PATTERN = /push service|registration failed|subscribe|aborterror/i;
const FIREBASE_INDEXED_DB_PATTERNS = [
  /^firebase/i,
  /^fcm/i,
];

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let firebaseApp = null;

export const getFirebaseApp = () => {
  if (!firebaseApp) {
    firebaseApp = initializeApp(firebaseConfig);
  }
  return firebaseApp;
};

const getRequiredFirebaseConfig = () => {
  const requiredValues = {
    apiKey: firebaseConfig.apiKey,
    projectId: firebaseConfig.projectId,
    messagingSenderId: firebaseConfig.messagingSenderId,
    appId: firebaseConfig.appId,
  };
  const missingKeys = Object.entries(requiredValues)
    .filter(([, value]) => !String(value || '').trim())
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    throw new Error(`Firebase web configuration is incomplete: ${missingKeys.join(', ')}.`);
  }

  return requiredValues;
};

const waitForServiceWorkerActivation = async (registration) => {
  if (!registration) return null;
  if (registration.active) return registration;

  const worker = registration.installing || registration.waiting;
  if (!worker) return navigator.serviceWorker.ready;

  await new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error('EduRoute notification service worker did not activate in time.')), 15000);
    const handleStateChange = () => {
      if (worker.state === 'activated') {
        window.clearTimeout(timeoutId);
        worker.removeEventListener('statechange', handleStateChange);
        resolve();
      } else if (worker.state === 'redundant') {
        window.clearTimeout(timeoutId);
        worker.removeEventListener('statechange', handleStateChange);
        reject(new Error('EduRoute notification service worker became inactive during setup.'));
      }
    };

    worker.addEventListener('statechange', handleStateChange);
    handleStateChange();
  });

  return registration;
};

const getPushRegistrationDiagnostics = (registration = null) => {
  const activeWorker = registration?.active || registration?.waiting || registration?.installing || null;

  return {
    origin: window.location.origin,
    secureContext: window.isSecureContext,
    notificationPermission: 'Notification' in window ? Notification.permission : 'unsupported',
    serviceWorkerScope: registration?.scope || 'not registered',
    serviceWorkerState: activeWorker?.state || 'unknown',
    serviceWorkerScript: activeWorker?.scriptURL || registration?.active?.scriptURL || 'unknown',
    vapidKeyLength: String(import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim().length,
    projectId: firebaseConfig.projectId || 'missing',
    messagingSenderId: firebaseConfig.messagingSenderId || 'missing',
  };
};

const formatPushRegistrationFailure = (message, registration = null) => {
  const diagnostics = getPushRegistrationDiagnostics(registration);
  const details = [
    `Firebase/Chrome rejected the browser push subscription: ${message}`,
    `origin=${diagnostics.origin}`,
    `secureContext=${diagnostics.secureContext}`,
    `permission=${diagnostics.notificationPermission}`,
    `serviceWorker=${diagnostics.serviceWorkerState}`,
    `scope=${diagnostics.serviceWorkerScope}`,
    `projectId=${diagnostics.projectId}`,
    `senderId=${diagnostics.messagingSenderId}`,
    `vapidKeyLength=${diagnostics.vapidKeyLength}`,
  ];

  return `${details.join(' | ')}. Check that the deployed frontend uses the Firebase VAPID key from the same Firebase project, that the browser can reach Google/Firebase push services, and if this device used an older key, clear site data or unregister the service worker once.`;
};

const unregisterFirebaseServiceWorker = async (registration) => {
  const scriptUrl = registration?.active?.scriptURL || registration?.waiting?.scriptURL || registration?.installing?.scriptURL || '';
  if (!scriptUrl.includes(FIREBASE_SERVICE_WORKER_PATH)) return false;
  return registration.unregister().catch(() => false);
};

const deleteIndexedDbDatabase = (name) => new Promise((resolve) => {
  if (!name || !('indexedDB' in window)) {
    resolve(false);
    return;
  }

  const request = indexedDB.deleteDatabase(name);
  request.onsuccess = () => resolve(true);
  request.onerror = () => resolve(false);
  request.onblocked = () => resolve(false);
});

const clearFirebaseMessagingStorage = async () => {
  if (!('indexedDB' in window)) return;

  if (typeof indexedDB.databases === 'function') {
    const databases = await indexedDB.databases().catch(() => []);
    await Promise.all((databases || [])
      .map((database) => database?.name || '')
      .filter((name) => FIREBASE_INDEXED_DB_PATTERNS.some((pattern) => pattern.test(name)))
      .map((name) => deleteIndexedDbDatabase(name)));
    return;
  }

  await Promise.all([
    deleteIndexedDbDatabase('firebase-messaging-database'),
    deleteIndexedDbDatabase('firebase-installations-database'),
  ]);
};

const resetFirebasePushRegistrationState = async (registration = null) => {
  let registrations = registration ? [registration] : [];
  if (!registration && navigator.serviceWorker && typeof navigator.serviceWorker.getRegistrations === 'function') {
    registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  }

  await Promise.all(registrations.map(async (candidate) => {
    const scriptUrl = candidate?.active?.scriptURL || candidate?.waiting?.scriptURL || candidate?.installing?.scriptURL || '';
    if (!scriptUrl.includes(FIREBASE_SERVICE_WORKER_PATH)) return;
    const subscription = await candidate.pushManager?.getSubscription().catch(() => null);
    await subscription?.unsubscribe().catch(() => false);
    await unregisterFirebaseServiceWorker(candidate);
  }));

  await clearFirebaseMessagingStorage();
};

export const getFirebaseMessagingClient = async () => {
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;
  return getMessaging(getFirebaseApp());
};

export const registerFirebaseServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) {
    throw new Error('This browser does not support background notifications.');
  }

  getRequiredFirebaseConfig();

  const query = new URLSearchParams({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
    version: FIREBASE_SERVICE_WORKER_VERSION,
  });

  const serviceWorkerUrl = `${FIREBASE_SERVICE_WORKER_PATH}?${query.toString()}`;
  const registration = await navigator.serviceWorker.register(serviceWorkerUrl, {
    scope: '/',
    updateViaCache: 'none',
  });

  await registration.update().catch(() => null);
  return waitForServiceWorkerActivation(registration);
};

export const requestFirebaseMessagingToken = async () => {
  if (!window.isSecureContext) {
    throw new Error('Push notifications require HTTPS or localhost.');
  }

  if (!('Notification' in window)) {
    throw new Error('This browser does not support web notifications.');
  }

  if (Notification.permission !== 'granted') {
    throw new Error('Notification permission is not granted for this browser.');
  }

  const messaging = await getFirebaseMessagingClient();
  if (!messaging) {
    throw new Error('Firebase messaging is not supported by this browser.');
  }

  const vapidKey = String(import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim();
  if (!vapidKey || vapidKey === 'your_vapid_key') {
    throw new Error('Firebase VAPID key is missing from the frontend deployment.');
  }

  const serviceWorkerRegistration = await registerFirebaseServiceWorker();
  const tokenOptions = { vapidKey, serviceWorkerRegistration };

  try {
    return await getToken(messaging, tokenOptions);
  } catch (error) {
    if (!PUSH_REGISTRATION_RETRY_PATTERN.test(String(error?.message || error))) {
      throw error;
    }

    // A stale browser subscription can remain after a VAPID key or deployment change.
    await deleteToken(messaging).catch(() => false);
    const existingSubscription = await serviceWorkerRegistration.pushManager?.getSubscription().catch(() => null);
    await existingSubscription?.unsubscribe().catch(() => false);
    await serviceWorkerRegistration.update().catch(() => null);

    try {
      return await getToken(messaging, tokenOptions);
    } catch (retryError) {
      await resetFirebasePushRegistrationState(serviceWorkerRegistration);
      const refreshedRegistration = await registerFirebaseServiceWorker();

      try {
        return await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: refreshedRegistration,
        });
      } catch (finalError) {
        throw new Error(formatPushRegistrationFailure(finalError?.message || finalError, refreshedRegistration));
      }
    }
  }
};

export const showFirebaseForegroundNotification = async (payload = {}) => {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return false;
  }

  const registration = await registerFirebaseServiceWorker();
  const data = payload.data || {};
  const title = data.title || payload.notification?.title || 'EduRoute';
  const body = data.message || payload.notification?.body || 'You have a new EduRoute notification.';

  await registration.showNotification(title, {
    body,
    icon: data.icon || '/eduroute-logo-192.png',
    badge: data.badge || '/eduroute-logo-192.png',
    tag: data.tag || `eduroute-${data.type || 'notification'}-${data.notificationId || Date.now()}`,
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
  });
  return true;
};

export const subscribeToForegroundMessages = async (handler) => {
  const messaging = await getFirebaseMessagingClient();
  if (!messaging) return () => {};

  return onMessage(messaging, handler);
};
