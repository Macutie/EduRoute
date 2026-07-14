import { supportsPortalPushNotifications } from "../routing/portalRouting.js";

export const isBrowserPushRegistrationFailure = (error) => {
  if (error?.isPushRegistrationFailure) return true;
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('push service error')
    || message.includes('browser push subscription')
    || message.includes('registration failed');
};

export const getPushRegistrationUserMessage = () =>
  'Notifications are allowed in your browser, but EduRoute could not connect this device to Firebase Cloud Messaging yet. Please check your internet connection, turn off browser/ad-block restrictions for EduRoute, then try again. If it still happens, clear this site data or reopen EduRoute after restarting the browser.';

export const registerPushNotificationsForCurrentBrowser = async () => {
  const [{
    requestFirebaseMessagingToken
  }, {
    savePushToken
  }] = await Promise.all([import('../../lib/firebase'), import('../../services/notificationApi')]);
  let fcmToken = '';
  try {
    fcmToken = await requestFirebaseMessagingToken();
  } catch (error) {
    if (isBrowserPushRegistrationFailure(error)) {
      console.error('EduRoute push registration diagnostic:', error);
      const friendlyError = new Error(getPushRegistrationUserMessage(error));
      friendlyError.isPushRegistrationFailure = true;
      friendlyError.cause = error;
      throw friendlyError;
    }

    throw error;
  }

  if (!fcmToken) {
    throw new Error('Notification permission was granted, but EduRoute could not get a device push token.');
  }

  await savePushToken({
    fcmToken,
    platform: 'web',
    deviceName: navigator.platform,
    userAgent: navigator.userAgent
  });
  return fcmToken;
};
export const syncPushTokenForGrantedBrowser = async (accountContext = {}) => {
  const normalizedContext = typeof accountContext === 'string' ? {
    accountRole: accountContext,
    department: ''
  } : {
    accountRole: accountContext?.accountRole || '',
    department: accountContext?.department || ''
  };
  if (!supportsPortalPushNotifications(normalizedContext.accountRole, normalizedContext.department)) return null;
  if (typeof window === 'undefined') return null;
  if (!localStorage.getItem('token')) return null;
  if (!('Notification' in window)) return null;
  if (Notification.permission !== 'granted') return null;

  try {
    return await registerPushNotificationsForCurrentBrowser();
  } catch (error) {
    if (isBrowserPushRegistrationFailure(error)) {
      // Automatic sync should not interrupt normal portal use when the browser's
      // push service rejects a subscription. Manual enablement still surfaces
      // the full diagnostic to the user.
      return null;
    }

    throw error;
  }
};
