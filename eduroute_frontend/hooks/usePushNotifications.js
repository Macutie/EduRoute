import { useCallback, useEffect, useState } from 'react';
import {
  disablePushToken,
} from '../services/notificationApi';
import {
  subscribeToForegroundMessages,
} from '../lib/firebase';
import { registerPushNotificationsForCurrentBrowser } from '../app/shared/pushNotifications';

export const usePushNotifications = () => {
  const [permission, setPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [foregroundMessage, setForegroundMessage] = useState(null);

  useEffect(() => {
    let unsubscribe = () => {};

    subscribeToForegroundMessages((payload) => {
      setForegroundMessage(payload);
    }).then((cleanup) => {
      unsubscribe = cleanup || (() => {});
    }).catch(() => {});

    return () => {
      unsubscribe();
    };
  }, []);

  const enableNotifications = useCallback(async () => {
    if (!('Notification' in window)) {
      setPermission('unsupported');
      setError('This browser does not support notifications.');
      return null;
    }

    setLoading(true);
    setError('');

    try {
      const nextPermission = permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();

      setPermission(nextPermission);

      if (nextPermission !== 'granted') {
        return null;
      }

      const fcmToken = await registerPushNotificationsForCurrentBrowser();
      if (!fcmToken) {
        setError('Unable to get an FCM token for this browser.');
        return null;
      }

      setToken(fcmToken);
      return fcmToken;
    } catch (requestError) {
      setError(requestError.message || 'Notification permission request failed.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [permission]);

  const disableNotifications = useCallback(async () => {
    if (!token) return;
    await disablePushToken(token).catch(() => null);
    setToken('');
  }, [token]);

  return {
    permission,
    token,
    loading,
    error,
    foregroundMessage,
    enableNotifications,
    disableNotifications,
  };
};
