export const decodeJwtPayload = token => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(window.atob(normalized));
  } catch (error) {
    return null;
  }
};
export const getDefaultViewForRole = role => {
  if (role === 'hrmu') return 'hrmu-dashboard';
  if (role === 'cssu') return 'cssu-dashboard';
  if (['assistant_dean', 'college_dean'].includes(role)) return 'dean-dashboard';
  if (role === 'admin') return 'admin-dashboard';
  return 'dashboard';
};
export const APP_VIEWS = new Set(['login', 'forgot-password', 'reset-code', 'set-new-password', 'signup', 'dashboard', 'scan', 'status', 'locator-slip-detail', 'locator-slip', 'updates', 'route-approved', 'slip-submitted', 'map-slip-selection', 'map', 'profile', 'change-password', 'notifications', 'notification-settings', 'dean-notification-settings', 'edit-profile', 'privacy-security', 'dean-privacy-security', 'dean-dashboard', 'dean-notifications', 'dean-requests', 'dean-request-detail', 'dean-profile', 'dean-faculty', 'dean-registry', 'dean-signature', 'dean-change-password', 'dean-edit-profile', 'hrmu-dashboard', 'hrmu-verification', 'hrmu-analytics', 'hrmu-reports', 'hrmu-live', 'hrmu-notifications', 'hrmu-inbox', 'admin-dashboard', 'cssu-dashboard', 'cssu-map', 'cssu-scan', 'cssu-reports', 'cssu-notifications', 'admin-notifications', 'admin-approval-requests', 'admin-approval-detail', 'admin-registry', 'admin-faculty', 'admin-profile', 'admin-change-password', 'admin-edit-profile']);
export const getViewFromUrlHash = () => {
  if (typeof window === 'undefined') return null;
  const rawHash = window.location.hash || '';
  const normalized = decodeURIComponent(rawHash.replace(/^#\/?/, '').trim());
  if (!normalized) return null;
  return APP_VIEWS.has(normalized) ? normalized : null;
};
export const getHashForView = view => {
  if (!view || view === 'login') return '';
  return `#/${encodeURIComponent(view)}`;
};
export const getPortalHomeViewForRole = role => {
  if (role === 'hrmu') return 'hrmu-dashboard';
  if (role === 'cssu') return 'cssu-dashboard';
  if (role === 'admin') return 'admin-dashboard';
  return 'dashboard';
};
export const getPortalNotificationsViewForRole = role => {
  if (role === 'hrmu') return 'hrmu-notifications';
  if (role === 'cssu') return 'cssu-notifications';
  if (role === 'admin') return 'admin-notifications';
  return 'notifications';
};
export const getPortalBadgeLabel = role => {
  if (role === 'hrmu') return 'HRMU ADMIN';
  if (role === 'cssu') return 'CSSU ADMIN';
  if (role === 'admin') return 'ADMIN';
  return 'PORTAL';
};
export const isCollegeDeanDepartment = (department = '') => /^College of\b/i.test(String(department || '').trim());
export const isDeanPortalAccount = (profileData = {}) => ['assistant_dean', 'college_dean'].includes(profileData?.accountRole) || profileData?.accountRole === 'admin' && isCollegeDeanDepartment(profileData?.department);
export const getPortalPositionLabel = (profileData = {}) => {
  if (profileData?.position) return profileData.position;
  if (profileData?.accountRole === 'hrmu') return 'Human Resources Management Unit';
  if (profileData?.accountRole === 'cssu') return 'Information Security';
  if (profileData?.accountRole === 'admin') return 'Administrator';
  return 'Portal User';
};
export const getPortalMetaLabel = (profileData = {}) => {
  if (profileData?.accountRole === 'cssu') return 'CSSU Administration';
  if (profileData?.accountRole === 'hrmu') return 'HRMU Administration';
  return profileData?.department || 'Portal Administration';
};
export const supportsPortalPushNotifications = (accountRole = '', department = '') => {
  const normalizedRole = String(accountRole || '').toLowerCase();
  if (['faculty', 'assistant_dean', 'college_dean', 'hrmu', 'cssu'].includes(normalizedRole)) {
    return true;
  }
  if (normalizedRole === 'admin') {
    return true;
  }
  return false;
};
export const getPortalAdministrationDescription = (profileData = {}) => {
  if (profileData?.accountRole === 'cssu') {
    return 'Manage your CSSU profile details and credential settings.';
  }
  if (profileData?.accountRole === 'hrmu') {
    return 'Manage your HRMU profile details and credential settings.';
  }
  return 'Manage your profile details and credential settings.';
};
export const getEduRouteDialogContent = ({
  title = 'EduRoute notice',
  message = '',
  tone = 'info'
} = {}) => {
  let text = String(message ?? '');
  if (/Gmail SMTP|SMTP_HOST|SMTP_PORT|SMTP_SECURE|SMTP_ADDRESS_FAMILY|SMTP_USER|SMTP_PASS|MAIL_FROM|EMAIL_PROVIDER=resend|RESEND_API_KEY|RESEND_FROM|HTTPS email delivery/i.test(text)) {
    text = 'EduRoute password recovery now uses Resend API. Please verify RESEND_API_KEY and EMAIL_FROM in the Railway backend variables, then redeploy the backend.';
  }
  if (text.toLowerCase().includes('invalid credentials')) {
    return {
      title: 'Incorrect Credentials',
      message: 'The password or account detail you entered does not match our records. Please check your credentials and try again, or use Forgot Password if you need to reset it.',
      tone: 'error'
    };
  }
  return {
    title,
    message: text,
    tone
  };
};
