import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { SearchBox } from '@mapbox/search-js-react';
import './App.css';
import { API_BASE_URL, MAPBOX_PUBLIC_TOKEN } from './config';
import {
  useDeanDashboardSummary,
  useDeanNotifications,
  useDeanPendingApprovals,
  useDeanRealtimeNotifications,
} from './hooks/useDeanDashboard';
import { useHrmuAnalytics } from './hooks/useHrmuAnalytics';
import { useHrmuMonthlyReport } from './hooks/useHrmuMonthlyReport';
import {
  approveDeanLocatorSlipRequest,
  getDeanFacultyOverview,
  getDeanLocatorSlips,
  getDeanNotifications,
  getDeanPendingRequestsPage,
  getDeanRegistryPage,
  markDeanNotificationRead,
  rejectDeanLocatorSlipRequest,
} from './services/deanApi';
import {
  exportHrmuRecentActivityCsvPlaceholder,
  getHrmuDashboardSummary,
  getHrmuLiveFaculty,
  getHrmuNotifications,
  getHrmuRecentActivity,
} from './services/hrmuApi';
import {
  getCssuDashboardSummary,
  getCssuIncidentsOverview,
  getCssuLiveExitMonitoring,
  getCssuNotificationsOverview,
  getCssuReportsOverview,
  lookupCssuExitCandidate,
  updateCssuExitStatus,
} from './services/cssuApi';
import { useHrmuLiveTracking } from './hooks/useHrmuLiveTracking';
import { useProofOfCompliance } from './hooks/useProofOfCompliance';
import FacultyDetailCard from './components/hrmu/FacultyDetailCard';
import FacultyActivityLog from './components/hrmu/FacultyActivityLog';
import ProofOfComplianceForm from './components/faculty/ProofOfComplianceForm';
import ProofOfCompliancePreview from './components/faculty/ProofOfCompliancePreview';
import ProofComplianceList from './components/hrmu/ProofComplianceList';
import ProofComplianceDetails from './components/hrmu/ProofComplianceDetails';
import {
  downloadHrmuMonthlyReportPdf,
  getHrmuFlaggedTrips,
  getHrmuVerificationIncidentSummary,
} from './services/hrmuReportsApi';
import {
  getHrmuProofComplianceDetails,
  getHrmuProofComplianceList,
  getFacultyProofOfCompliance,
  reviewHrmuProofCompliance,
} from './services/proofComplianceApi';
import {
  getApprovedFacultyLocatorSlips,
  getFacultyLocatorSlipDetails,
  getFacultyTripSummary,
  markFacultyTripArrived,
  markFacultyTripReturned,
  resolveFacultyLocatorSlipDestination,
  saveFacultyManualPin,
  startFacultyTrip,
  startFacultyTripReturn,
} from './services/facultyTripApi';

const DEFAULT_PROFILE_IMAGE = '/profile_pic.png';
const decodeJwtPayload = (token) => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(window.atob(normalized));
  } catch (error) {
    return null;
  }
};

const getDefaultViewForRole = (role) => {
  if (role === 'hrmu') return 'hrmu-dashboard';
  if (role === 'cssu') return 'cssu-dashboard';
  if (['assistant_dean', 'college_dean'].includes(role)) return 'dean-dashboard';
  if (role === 'admin') return 'admin-dashboard';
  return 'dashboard';
};

const getPortalHomeViewForRole = (role) => {
  if (role === 'hrmu') return 'hrmu-dashboard';
  if (role === 'cssu') return 'cssu-dashboard';
  if (role === 'admin') return 'admin-dashboard';
  return 'dashboard';
};

const getPortalNotificationsViewForRole = (role) => {
  if (role === 'hrmu') return 'hrmu-notifications';
  if (role === 'cssu') return 'cssu-notifications';
  if (role === 'admin') return 'admin-notifications';
  return 'admin-notifications';
};

const getPortalBadgeLabel = (role) => {
  if (role === 'hrmu') return 'HRMU ADMIN';
  if (role === 'cssu') return 'CSSU ADMIN';
  if (role === 'admin') return 'ADMIN';
  return 'PORTAL';
};

const getPortalPositionLabel = (profileData = {}) => {
  if (profileData?.position) return profileData.position;
  if (profileData?.accountRole === 'hrmu') return 'Human Resources Management Unit';
  if (profileData?.accountRole === 'cssu') return 'Information Security';
  if (profileData?.accountRole === 'admin') return 'Administrator';
  return 'Portal User';
};

const getPortalMetaLabel = (profileData = {}) => {
  if (profileData?.accountRole === 'cssu') return 'CSSU Administration';
  if (profileData?.accountRole === 'hrmu') return 'HRMU Administration';
  return profileData?.department || 'Portal Administration';
};

const getPortalAdministrationDescription = (profileData = {}) => {
  if (profileData?.accountRole === 'cssu') {
    return 'Manage your CSSU profile details and credential settings.';
  }
  if (profileData?.accountRole === 'hrmu') {
    return 'Manage your HRMU profile details and credential settings.';
  }
  return 'Manage your profile details and credential settings.';
};

const registerPushNotificationsForCurrentBrowser = async () => {
  const [{ requestFirebaseMessagingToken }, { savePushToken }] = await Promise.all([
    import('./lib/firebase'),
    import('./services/notificationApi'),
  ]);

  const fcmToken = await requestFirebaseMessagingToken();
  if (!fcmToken) {
    throw new Error('Notification permission was granted, but EduRoute could not get a device push token.');
  }

  await savePushToken({
    fcmToken,
    platform: 'web',
    deviceName: navigator.platform,
    userAgent: navigator.userAgent,
  });

  return fcmToken;
};

function App() {
  console.log('API_BASE_URL:', API_BASE_URL);
  const [view, setView] = useState(() => {
    const token = localStorage.getItem('token');
    const savedView = localStorage.getItem('edurouteLastView');
    const tokenRole = decodeJwtPayload(token || '')?.role || '';
    return token ? (savedView || getDefaultViewForRole(tokenRole)) : 'login';
  });
  const [loading, setLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [profileData, setProfileData] = useState({
    fullName: 'Faculty User',
    employeeId: '',
    department: 'Faculty Department',
    position: '',
    email: '',
    image: DEFAULT_PROFILE_IMAGE,
    accountRole: '',
  });

  const [loginForm, setLoginForm] = useState({
    email_or_employee_id: '',
    password: ''
  });

  const [forgotForm, setForgotForm] = useState({
    email: ''
  });
  const [resetCode, setResetCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [selectedStatusSlip, setSelectedStatusSlip] = useState(null);
  const [logoutModalPortal, setLogoutModalPortal] = useState(null);
  const [selectedDeanRequest, setSelectedDeanRequest] = useState(null);
  const [selectedAdminRequest, setSelectedAdminRequest] = useState(null);
  const [newPasswordForm, setNewPasswordForm] = useState({
    password: '',
    confirm_password: '',
  });

  const [registerForm, setRegisterForm] = useState({
    account_role: 'faculty',
    full_name: '',
    employee_id: '',
    department_id: '',
    email: '',
    password: '',
    confirm_password: '',
    terms_accepted: false
  });
  const [showPermissionSetup, setShowPermissionSetup] = useState(false);
  const [permissionSetupStep, setPermissionSetupStep] = useState('intro');
  const [permissionSetupMessage, setPermissionSetupMessage] = useState('');
  const [permissionSetupLoading, setPermissionSetupLoading] = useState(false);
  const permissionSetupSeenRef = useRef(false);

  const isAuthView = (v) => ['login', 'forgot-password', 'reset-code', 'set-new-password', 'signup'].includes(v);

  const formatApiMessage = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(formatApiMessage).filter(Boolean).join('\n');
    if (typeof value === 'object') {
      return Object.values(value).map(formatApiMessage).filter(Boolean).join('\n');
    }

    return String(value);
  };

  const apiRequest = async (endpoint, options = {}) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });

    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      const text = await response.text();
      console.error('Non-JSON response:', text);
      throw new Error(`Expected JSON but got ${contentType || 'unknown content type'}`);
    }

    const data = await response.json();

    if (!response.ok) {
      const validationMessage = formatApiMessage(data.errors);
      throw new Error(validationMessage || formatApiMessage(data.message) || 'Request failed');
    }

    return data;
  };

  const fetchDepartmentsApi = () => apiRequest('/api/departments');

  const registerApi = (payload) =>
    apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

  const loginApi = (payload) =>
    apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

  const forgotPasswordApi = (payload) =>
    apiRequest('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

  const verifyResetCodeApi = (payload) =>
    apiRequest('/api/auth/verify-reset-code', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

  const resetPasswordApi = (payload) =>
    apiRequest('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

  const permissionApiHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
  });

  const fetchPermissionPreferencesApi = () =>
    apiRequest('/api/permissions/me', {
      headers: permissionApiHeaders(),
    });

  const updatePermissionPreferencesApi = (payload) =>
    apiRequest('/api/permissions/me', {
      method: 'PATCH',
      headers: permissionApiHeaders(),
      body: JSON.stringify(payload),
    });

  useEffect(() => {
    if (isAuthView(view)) return;
    localStorage.setItem('edurouteLastView', view);
  }, [view]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const pendingSlipId = localStorage.getItem('edurouteVerifySlipId');
    const savedView = localStorage.getItem('edurouteLastView');

    if (!token || !pendingSlipId || savedView !== 'scan' || selectedStatusSlip?.id === pendingSlipId) return;

    const restoreVerificationSlip = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/locator-slips/${pendingSlipId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();

        if (!response.ok) {
          localStorage.removeItem('edurouteVerifySlipId');
          return;
        }

        if (['approved', 'verified', 'completed'].includes(String(data.data?.status || '').toLowerCase())) {
          setSelectedStatusSlip(data.data);
          setView('scan');
        } else {
          localStorage.removeItem('edurouteVerifySlipId');
        }
      } catch (error) {
        console.error('Failed to restore verification slip:', error);
      }
    };

    restoreVerificationSlip();
  }, [selectedStatusSlip]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const pendingSlipId = localStorage.getItem('edurouteMapSlipId');
    const savedView = localStorage.getItem('edurouteLastView');

    if (!token || !pendingSlipId || !['map', 'map-slip-selection'].includes(savedView) || selectedStatusSlip?.id === pendingSlipId) return;

    const restoreMapSlip = async () => {
      try {
        const slip = await getFacultyLocatorSlipDetails(pendingSlipId);
        setSelectedStatusSlip(slip);
      } catch (error) {
        localStorage.removeItem('edurouteMapSlipId');
      }
    };

    restoreMapSlip();
  }, [selectedStatusSlip]);

  useEffect(() => {
    const loadDepartments = async () => {
      if (view !== 'signup') return;

      try {
        const data = await fetchDepartmentsApi();
        setDepartments(data.data || []);
      } catch (error) {
        alert(error.message);
      }
    };

    loadDepartments();
  }, [view]);

  useEffect(() => {
    localStorage.removeItem('profileImage');
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');

    if (!token || isAuthView(view)) return;

    const syncProfileFromDatabase = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();

        if (!response.ok) return;

        const databaseRole = data.data.account_role || '';
        const tokenRole = decodeJwtPayload(token)?.role || '';

        if (['assistant_dean', 'college_dean'].includes(databaseRole) && tokenRole !== databaseRole) {
          localStorage.removeItem('token');
          localStorage.removeItem('edurouteLastView');
          setView('login');
          alert('Your account role was updated. Please log in again to refresh your dean access.');
          return;
        }

        setProfileData((prev) => ({
          ...prev,
          fullName: data.data.full_name || 'Faculty User',
          employeeId: data.data.employee_id || '',
          department: data.data.department_name || 'Faculty Department',
          position: data.data.position || data.data.department_position || data.data.job_title || '',
          email: data.data.email || '',
          image: data.data.profile_image_url || DEFAULT_PROFILE_IMAGE,
          accountRole: databaseRole,
        }));

        if (
          ['assistant_dean', 'college_dean'].includes(databaseRole)
          && ['dashboard', 'admin-dashboard', 'profile', 'admin-profile'].includes(view)
        ) {
          setView('dean-dashboard');
          return;
        }

        const expectedDefaultView = getDefaultViewForRole(databaseRole);
        const genericRoleViews = ['dashboard', 'profile', 'status', 'locator-slip', 'map', 'scan', 'updates', 'map-slip-selection'];

        if (databaseRole === 'cssu' && genericRoleViews.includes(view)) {
          setView(expectedDefaultView);
          return;
        }

        if (databaseRole === 'hrmu' && genericRoleViews.includes(view)) {
          setView(expectedDefaultView);
          return;
        }

        if (databaseRole === 'admin' && genericRoleViews.includes(view)) {
          setView(expectedDefaultView);
        }
      } catch (error) {
        console.error('Failed to sync profile:', error);
      }
    };

    syncProfileFromDatabase();
  }, [view]);

  useEffect(() => {
    const token = localStorage.getItem('token');

    if (!token || view !== 'dashboard') return;
    if (permissionSetupSeenRef.current) return;

    const loadPermissionSetup = async () => {
      try {
        const data = await fetchPermissionPreferencesApi();
        const preferences = data.data;

        if (!preferences?.first_login_setup_completed) {
          permissionSetupSeenRef.current = true;
          setPermissionSetupStep('intro');
          setPermissionSetupMessage('');
          setShowPermissionSetup(true);
        } else {
          setShowPermissionSetup(false);
        }
      } catch (error) {
        console.error('Failed to load permission setup:', error);
      }
    };

    loadPermissionSetup();
  }, [view]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = await registerApi({
        ...registerForm,
        department_id: ['faculty', 'admin'].includes(registerForm.account_role)
          ? Number(registerForm.department_id)
          : null
      });

      alert(formatApiMessage(data.message) || 'Registration successful.');
      setView('login');
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e, portalRole = 'faculty') => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = await loginApi({
        ...loginForm,
        portal_role: portalRole,
      });
      localStorage.setItem('token', data.data.token);
      localStorage.removeItem('edurouteLastView');
      permissionSetupSeenRef.current = false;
      setProfileData((prev) => ({
        ...prev,
        fullName: data.data.user?.full_name || 'Faculty User',
        employeeId: data.data.user?.employee_id || '',
        department: data.data.user?.department_name || 'Faculty Department',
        position: data.data.user?.position || data.data.user?.department_position || data.data.user?.job_title || '',
        email: data.data.user?.email || '',
        image: data.data.user?.profile_image_url || DEFAULT_PROFILE_IMAGE,
        accountRole: data.data.user?.account_role || '',
      }));
      const accountRole = data.data.user?.account_role;
      alert(formatApiMessage(data.message) || 'Login successful.');
      setView(getDefaultViewForRole(accountRole || portalRole));
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('profileImage');
    localStorage.removeItem('edurouteLastView');
    localStorage.removeItem('edurouteVerifySlipId');
    localStorage.removeItem('edurouteMapSlipId');
    setShowPermissionSetup(false);
    setPermissionSetupStep('intro');
    setPermissionSetupMessage('');
    permissionSetupSeenRef.current = false;
    setProfileData({
      fullName: 'Faculty User',
      employeeId: '',
      department: 'Faculty Department',
      position: '',
      email: '',
      image: DEFAULT_PROFILE_IMAGE,
      accountRole: '',
    });
    setView('login');
  };

  const getLogoutPortalLabel = (portalKey) => {
    if (portalKey === 'cssu') return 'EduRoute CSSU Portal';
    if (portalKey === 'hrmu') return 'EduRoute HRMU Portal';
    if (portalKey === 'dean') return 'EduRoute Dean Portal';
    return 'EduRoute Portal';
  };

  const requestPortalLogout = (portalKey) => {
    setLogoutModalPortal(portalKey);
  };

  const finishPermissionSetup = async (notificationsStatus) => {
    setPermissionSetupLoading(true);

    try {
      await updatePermissionPreferencesApi({
        notifications_status: notificationsStatus,
        first_login_setup_completed: true,
      });
      permissionSetupSeenRef.current = true;
      setShowPermissionSetup(false);
      setPermissionSetupStep('intro');
      setPermissionSetupMessage('');
    } catch (error) {
      alert(error.message);
    } finally {
      setPermissionSetupLoading(false);
    }
  };

  const handleMaybeLaterPermissions = () => {
    finishPermissionSetup('dismissed');
  };

  const handleEnableNotificationPermission = async () => {
    setPermissionSetupLoading(true);

    try {
      let notificationStatus = 'unsupported';

      if ('Notification' in window) {
        if (Notification.permission === 'granted') {
          notificationStatus = 'granted';
        } else if (Notification.permission === 'denied') {
          notificationStatus = 'denied';
        } else {
          const browserPermission = await Notification.requestPermission();
          notificationStatus = browserPermission === 'default' ? 'dismissed' : browserPermission;
        }
      }

      await updatePermissionPreferencesApi({
        notifications_status: notificationStatus,
        first_login_setup_completed: true,
      });
      permissionSetupSeenRef.current = true;

      if (notificationStatus === 'granted') {
        await registerPushNotificationsForCurrentBrowser();
        setPermissionSetupMessage('Approval alerts are enabled for this browser. You can manage this later in Privacy & Security.');
      } else if (notificationStatus === 'denied') {
        setPermissionSetupMessage('Notifications are blocked in this browser. You can re-enable them from your browser or device site settings.');
      } else if (notificationStatus === 'dismissed') {
        setPermissionSetupMessage('No problem. EduRoute will still show alerts while the portal is open. You can enable notifications later in Privacy & Security.');
      } else {
        setPermissionSetupMessage('This browser does not support web notifications. You can still check approvals inside EduRoute.');
      }

      setPermissionSetupStep('result');
    } catch (error) {
      alert(error.message);
    } finally {
      setPermissionSetupLoading(false);
    }
  };

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;

    const timer = setTimeout(() => {
      setResendCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const sendForgotPasswordCode = async ({ goToCode = false } = {}) => {
    setLoading(true);

    try {
      const email = forgotForm.email.trim();
      const data = await forgotPasswordApi({ email });
      alert(formatApiMessage(data.message) || 'Reset code sent.');

      setForgotForm((prev) => ({ ...prev, email }));
      setResetCode('');
      setResetToken('');
      setResendCooldown(60);

      if (goToCode) {
        setView('reset-code');
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    await sendForgotPasswordCode({ goToCode: true });
  };

  const handleResendResetCode = async () => {
    if (resendCooldown > 0 || loading) return;
    await sendForgotPasswordCode();
  };

  const handleVerifyResetCode = (e) => {
    e.preventDefault();

    if (resetCode.length !== 6) {
      alert('Please enter the 6-digit reset code.');
      return;
    }

    const verifyCode = async () => {
      setLoading(true);

      try {
        const email = forgotForm.email.trim();
        const data = await verifyResetCodeApi({
          email,
          email_or_employee_id: email,
          code: resetCode.trim(),
          otp: resetCode.trim(),
          otp_code: resetCode.trim(),
          reset_code: resetCode.trim(),
        });

        setResetToken(
          data.data?.token ||
          data.data?.reset_token ||
          data.reset_token ||
          data.token ||
          ''
        );
        alert(formatApiMessage(data.message) || 'Reset code verified.');
        setNewPasswordForm({
          password: '',
          confirm_password: '',
        });
        setView('set-new-password');
      } catch (error) {
        alert(error.message);
      } finally {
        setLoading(false);
      }
    };

    verifyCode();
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const email = forgotForm.email.trim();
      const code = resetCode.trim();
      const data = await resetPasswordApi({
        email,
        email_or_employee_id: email,
        code,
        otp: code,
        otp_code: code,
        reset_code: code,
        token: resetToken,
        reset_token: resetToken,
        password: newPasswordForm.password,
        new_password: newPasswordForm.password,
        confirm_password: newPasswordForm.confirm_password,
        password_confirmation: newPasswordForm.confirm_password,
        new_password_confirmation: newPasswordForm.confirm_password,
      });

      alert(formatApiMessage(data.message) || 'Password updated successfully.');
      setResetCode('');
      setResetToken('');
      setNewPasswordForm({
        password: '',
        confirm_password: '',
      });
      setView('login');
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const desktopWorkspaceViews = [
    'hrmu-dashboard',
    'hrmu-verification',
    'hrmu-analytics',
    'hrmu-reports',
    'hrmu-live',
    'hrmu-notifications',
    'admin-profile',
    'admin-edit-profile',
    'admin-change-password',
    'cssu-dashboard',
    'cssu-map',
    'cssu-incidents',
    'cssu-scan',
    'cssu-reports',
    'cssu-notifications',
  ];

  return (
    <div className={`mobile-container ${isAuthView(view) ? 'login-shell' : ''} ${desktopWorkspaceViews.includes(view) ? 'workspace-shell' : ''}`}>
      {view === 'login' && (
        <LoginView
          setView={setView}
          loginForm={loginForm}
          setLoginForm={setLoginForm}
          onLogin={handleLogin}
          loading={loading}
          showLoginPassword={showLoginPassword}
          setShowLoginPassword={setShowLoginPassword}
        />
      )}

      {view === 'forgot-password' && (
        <ForgotPasswordView
          setView={setView}
          forgotForm={forgotForm}
          setForgotForm={setForgotForm}
          onForgotPassword={handleForgotPassword}
          loading={loading}
        />
      )}

      {view === 'reset-code' && (
        <ResetCodeView
          setView={setView}
          resetCode={resetCode}
          setResetCode={setResetCode}
          onVerifyResetCode={handleVerifyResetCode}
          onResendResetCode={handleResendResetCode}
          resendCooldown={resendCooldown}
          loading={loading}
        />
      )}

      {view === 'set-new-password' && (
        <SetNewPasswordView
          newPasswordForm={newPasswordForm}
          setNewPasswordForm={setNewPasswordForm}
          onResetPassword={handleResetPassword}
          loading={loading}
        />
      )}

      {view === 'signup' && (
        <SignUpView
          setView={setView}
          registerForm={registerForm}
          setRegisterForm={setRegisterForm}
          departments={departments}
          onRegister={handleRegister}
          loading={loading}
        />
      )}

      {view === 'dashboard' && <DashboardView setView={setView} profileData={profileData} />}
      {view === 'scan' && (
        <ScanView
          setView={setView}
          profileData={profileData}
          selectedSlip={selectedStatusSlip}
        />
      )}
      {view === 'status' && (
        <StatusView
          setView={setView}
          profileData={profileData}
          setSelectedStatusSlip={setSelectedStatusSlip}
        />
      )}
      {view === 'locator-slip-detail' && (
        <LocatorSlipDetailView
          setView={setView}
          profileData={profileData}
          selectedSlip={selectedStatusSlip}
        />
      )}
      {view === 'locator-slip' && (
        <LocatorSlipView
          setView={setView}
          profileData={profileData}
          setSelectedStatusSlip={setSelectedStatusSlip}
        />
      )}
      {view === 'updates' && <UpdatesView setView={setView} profileData={profileData} />}
      {view === 'route-approved' && <RouteApprovedView setView={setView} profileData={profileData} />}
      {view === 'slip-submitted' && <SlipSubmittedView setView={setView} profileData={profileData} />}
      {view === 'map-slip-selection' && (
        <ApprovedLocatorSlipSelectionView
          setView={setView}
          profileData={profileData}
          setSelectedSlip={setSelectedStatusSlip}
        />
      )}
      {view === 'map' && <MapTrackingView setView={setView} profileData={profileData} selectedSlip={selectedStatusSlip} setSelectedSlip={setSelectedStatusSlip} />}
      {view === 'profile' && <ProfileView setView={setView} profileData={profileData} onLogout={handleLogout} />}
      {view === 'change-password' && <ChangePasswordView setView={setView} profileData={profileData} />}
      {view === 'notification-settings' && <NotificationSettingsView setView={setView} profileData={profileData} />}
      {view === 'edit-profile' && (
        <EditProfileView
          setView={setView}
          profileData={profileData}
          setProfileData={setProfileData}
        />
      )}
      {view === 'privacy-security' && <PrivacySecurityView setView={setView} profileData={profileData} />}
      {view === 'dean-privacy-security' && <PrivacySecurityView setView={setView} profileData={profileData} mode="dean" />}
      {view === 'dean-dashboard' && <DeanDashboardView setView={setView} profileData={profileData} />}
      {view === 'dean-notifications' && <DeanNotificationsView setView={setView} profileData={profileData} />}
      {view === 'dean-requests' && (
        <DeanRequestsView
          setView={setView}
          profileData={profileData}
          setSelectedDeanRequest={setSelectedDeanRequest}
        />
      )}
      {view === 'dean-request-detail' && (
        <DeanRequestDetailView
          setView={setView}
          profileData={profileData}
          request={selectedDeanRequest}
        />
      )}
      {view === 'dean-profile' && <DeanProfileView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('dean')} />}
      {view === 'dean-faculty' && <DeanFacultyView setView={setView} profileData={profileData} />}
      {view === 'dean-registry' && (
        <DeanRegistryView
          setView={setView}
          profileData={profileData}
          setSelectedDeanRequest={setSelectedDeanRequest}
        />
      )}
      {view === 'dean-change-password' && <ChangePasswordView setView={setView} profileData={profileData} backView="dean-profile" />}
      {view === 'dean-edit-profile' && (
        <EditProfileView
          setView={setView}
          profileData={profileData}
          setProfileData={setProfileData}
          backView="dean-profile"
          useDeanNav
        />
      )}
      {view === 'hrmu-dashboard' && <HrmuDashboardView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('hrmu')} />}
      {view === 'hrmu-verification' && <HrmuVerificationView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('hrmu')} />}
      {view === 'hrmu-analytics' && <HrmuAnalyticsReportsView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('hrmu')} activeKey="analytics" />}
      {view === 'hrmu-reports' && <HrmuReportsView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('hrmu')} />}
      {view === 'hrmu-live' && <HrmuLiveTrackingView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('hrmu')} />}
      {view === 'hrmu-notifications' && <HrmuNotificationsRealtimeView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('hrmu')} />}
      {view === 'admin-dashboard' && <AdminDashboardView setView={setView} profileData={profileData} />}
      {view === 'cssu-dashboard' && <CSSUDashboardView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('cssu')} />}
      {view === 'cssu-map' && <CSSUMapView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('cssu')} />}
      {view === 'cssu-incidents' && <CSSUIncidentsView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('cssu')} />}
      {view === 'cssu-scan' && <CSSUScanView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('cssu')} />}
      {view === 'cssu-reports' && <CSSUReportsView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('cssu')} />}
      {view === 'cssu-notifications' && <CSSUNotificationsView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('cssu')} />}
      {view === 'admin-notifications' && <AdminNotificationsView setView={setView} profileData={profileData} />}
      {view === 'admin-approval-requests' && (
        <AdminApprovalRequestsView
          setView={setView}
          profileData={profileData}
          setSelectedAdminRequest={setSelectedAdminRequest}
        />
      )}
      {view === 'admin-approval-detail' && (
        <AdminApprovalDetailView
          setView={setView}
          profileData={profileData}
          request={selectedAdminRequest}
        />
      )}
      {view === 'admin-registry' && <AdminRegistryView setView={setView} profileData={profileData} />}
      {view === 'admin-faculty' && <AdminFacultyView setView={setView} profileData={profileData} />}
      {view === 'admin-profile' && <AdminProfileView setView={setView} profileData={profileData} onLogout={() => {
        const role = profileData?.accountRole;
        if (role === 'hrmu') {
          requestPortalLogout('hrmu');
          return;
        }
        if (role === 'cssu') {
          requestPortalLogout('cssu');
          return;
        }
        localStorage.removeItem('token');
        localStorage.removeItem('edurouteLastView');
        setView('login');
      }} />}
      {view === 'admin-change-password' && <ChangePasswordView setView={setView} profileData={profileData} backView="admin-profile" />}
      {view === 'admin-edit-profile' && <AdminEditProfileView setView={setView} profileData={profileData} />}


      {logoutModalPortal && (
        <div className="modal-overlay fade-in">
          <div className="logout-modal-card">
            <div className="logout-icon-container">
              <LogoutIcon color="var(--green)" />
              <div className="logout-cap-badge">
                <GraduationCapIcon color="#1A202C" />
              </div>
            </div>

            <h2 className="logout-modal-title">Are you sure you want<br />to logout?</h2>
            <p className="logout-modal-desc">
              You will be securely logged out of the <span className="text-green">{getLogoutPortalLabel(logoutModalPortal)}</span>. Any unsaved portal progress may be lost.
            </p>

            <button className="logout-confirm-btn" onClick={() => {
              setLogoutModalPortal(null);
              handleLogout();
            }}>
              Yes, Logout <ArrowRightIcon color="white" />
            </button>
            <button className="logout-cancel-btn" onClick={() => setLogoutModalPortal(null)}>
              Cancel
            </button>

            <div className="modal-dots">
              <div className="dot green-dot-pill"></div>
              <div className="dot grey-dot"></div>
              <div className="dot yellow-dot"></div>
            </div>
          </div>
        </div>
      )}

      {isAuthView(view) && (
        <div
          className={`auth-bottom-accent ${isAuthView(view) ? 'auth-view-bottom-accent' : ''}`}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            height: '36px',
            zIndex: 1,
            pointerEvents: 'none'
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              left: 0,
              top: 0,
              position: 'absolute',
              opacity: 0.4,
              background: 'linear-gradient(90deg, #049516 0%, #FFD517 50%, #036E10 100%)'
            }}
          />
        </div>
      )}

      {showPermissionSetup && (
        <PermissionSetupModal
          step={permissionSetupStep}
          message={permissionSetupMessage}
          loading={permissionSetupLoading}
          onShowExplainer={() => setPermissionSetupStep('notifications')}
          onEnableNotifications={handleEnableNotificationPermission}
          onMaybeLater={handleMaybeLaterPermissions}
          onClose={() => setShowPermissionSetup(false)}
        />
      )}

    </div>
  );
}

const PermissionSetupModal = ({
  step,
  message,
  loading,
  onShowExplainer,
  onEnableNotifications,
  onMaybeLater,
  onClose,
}) => {
  const isIntro = step === 'intro';
  const isResult = step === 'result';

  return (
    <div className="permission-modal-backdrop" role="dialog" aria-modal="true">
      <div className="permission-modal-card">
        <div className="permission-modal-glow" />
        <div className="permission-modal-icon">
          <NotificationIcon color="var(--green)" />
        </div>

        {isIntro && (
          <>
            <span className="permission-modal-kicker">FIRST LOGIN SETUP</span>
            <h2 className="permission-modal-title">Stay Updated on Approvals</h2>
            <p className="permission-modal-copy">
              EduRoute can notify you when locator slips, approvals, and request updates need your attention, even when the portal is closed.
            </p>
            <div className="permission-modal-note">
              We will ask for notifications first. Location, camera, and photos are only requested later when you use those features.
            </div>
            <button type="button" className="permission-primary-btn" onClick={onShowExplainer} disabled={loading}>
              Enable alerts
            </button>
            <button type="button" className="permission-ghost-btn" onClick={onMaybeLater} disabled={loading}>
              Maybe later
            </button>
          </>
        )}

        {step === 'notifications' && (
          <>
            <span className="permission-modal-kicker">APPROVAL ALERTS</span>
            <h2 className="permission-modal-title">Allow EduRoute Notifications?</h2>
            <p className="permission-modal-copy">
              You will receive faculty approval and request alerts on this device. EduRoute will not use notifications for ads or unrelated messages.
            </p>
            <div className="permission-modal-note">
              Your browser will show its own permission popup after you click Enable now.
            </div>
            <button type="button" className="permission-primary-btn" onClick={onEnableNotifications} disabled={loading}>
              {loading ? 'Opening permission...' : 'Enable now'}
            </button>
            <button type="button" className="permission-ghost-btn" onClick={onMaybeLater} disabled={loading}>
              Not now
            </button>
          </>
        )}

        {isResult && (
          <>
            <span className="permission-modal-kicker">SETUP SAVED</span>
            <h2 className="permission-modal-title">Notification Preference Updated</h2>
            <p className="permission-modal-copy">{message}</p>
            <button type="button" className="permission-primary-btn" onClick={onClose}>
              Continue to dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const MapIcon = () => (
  <svg width="36" height="36" viewBox="0 0 27 27" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 27L9 23.85L2.025 26.55C1.525 26.75 1.0625 26.6938 0.6375 26.3813C0.2125 26.0688 0 25.65 0 25.125V4.125C0 3.8 0.09375 3.5125 0.28125 3.2625C0.46875 3.0125 0.725 2.825 1.05 2.7L9 0L18 3.15L24.975 0.45C25.475 0.25 25.9375 0.30625 26.3625 0.61875C26.7875 0.93125 27 1.35 27 1.875V22.875C27 23.2 26.9062 23.4875 26.7188 23.7375C26.5312 23.9875 26.275 24.175 25.95 24.3L18 27ZM16.5 23.325V5.775L10.5 3.675V21.225L16.5 23.325Z" fill="#049516" />
  </svg>
);

const BadgeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ stroke: 'none', color: 'var(--text-light)' }}>
    <path d="M1.66667 16.6667C1.20833 16.6667 0.815972 16.5035 0.489583 16.1771C0.163194 15.8507 0 15.4583 0 15V5.83333C0 5.375 0.163194 4.98264 0.489583 4.65625C0.815972 4.32986 1.20833 4.16667 1.66667 4.16667H5.83333V1.66667C5.83333 1.20833 5.99653 0.815972 6.32292 0.489583C6.64931 0.163194 7.04167 0 7.5 0H9.16667C9.625 0 10.0174 0.163194 10.3438 0.489583C10.6701 0.815972 10.8333 1.20833 10.8333 1.66667V4.16667H15C15.4583 4.16667 15.8507 4.32986 16.1771 4.65625C16.5035 4.98264 16.6667 5.375 16.6667 5.83333V15C16.6667 15.4583 16.5035 15.8507 16.1771 16.1771C15.8507 16.5035 15.4583 16.6667 15 16.6667H1.66667ZM1.66667 15H15V5.83333H10.8333C10.8333 6.29167 10.6701 6.68403 10.3438 7.01042C10.0174 7.33681 9.625 7.5 9.16667 7.5H7.5C7.04167 7.5 6.64931 7.33681 6.32292 7.01042C5.99653 6.68403 5.83333 6.29167 5.83333 5.83333H1.66667V15ZM3.33333 13.3333H8.33333V12.9583C8.33333 12.7222 8.26736 12.5035 8.13542 12.3021C8.00347 12.1007 7.81944 11.9444 7.58333 11.8333C7.30556 11.7083 7.02431 11.6146 6.73958 11.5521C6.45486 11.4896 6.15278 11.4583 5.83333 11.4583C5.51389 11.4583 5.21181 11.4896 4.92708 11.5521C4.64236 11.6146 4.36111 11.7083 4.08333 11.8333C3.84722 11.9444 3.66319 12.1007 3.53125 12.3021C3.39931 12.5035 3.33333 12.7222 3.33333 12.9583V13.3333ZM10 12.0833H13.3333V10.8333H10V12.0833ZM5.83333 10.8333C6.18056 10.8333 6.47569 10.7118 6.71875 10.4688C6.96181 10.2257 7.08333 9.93056 7.08333 9.58333C7.08333 9.23611 6.96181 8.94097 6.71875 8.69792C6.47569 8.45486 6.18056 8.33333 5.83333 8.33333C5.48611 8.33333 5.19097 8.45486 4.94792 8.69792C4.70486 8.94097 4.58333 9.23611 4.58333 9.58333C4.58333 9.93056 4.70486 10.2257 4.94792 10.4688C5.19097 10.7118 5.48611 10.8333 5.83333 10.8333ZM10 9.58333H13.3333V8.33333H10V9.58333ZM7.5 5.83333H9.16667V1.66667H7.5V5.83333Z" fill="currentColor" />
  </svg>
);

const LockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 14 18" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ stroke: 'none', color: 'var(--text-light)' }}>
    <path d="M1.66667 17.5C1.20833 17.5 0.815972 17.3368 0.489583 17.0104C0.163194 16.684 0 16.2917 0 15.8333V7.5C0 7.04167 0.163194 6.64931 0.489583 6.32292C0.815972 5.99653 1.20833 5.83333 1.66667 5.83333H2.5V4.16667C2.5 3.01389 2.90625 2.03125 3.71875 1.21875C4.53125 0.40625 5.51389 0 6.66667 0C7.81944 0 8.80208 0.40625 9.61458 1.21875C10.4271 2.03125 10.8333 3.01389 10.8333 4.16667V5.83333H11.6667C12.125 5.83333 12.5174 5.99653 12.8438 6.32292C13.1701 6.64931 13.3333 7.04167 13.3333 7.5V15.8333C13.3333 16.2917 13.1701 16.684 12.8438 17.0104C12.5174 17.3368 12.125 17.5 11.6667 17.5H1.66667ZM1.66667 15.8333H11.6667V7.5H1.66667V15.8333ZM6.66667 13.3333C7.125 13.3333 7.51736 13.1701 7.84375 12.8438C8.17014 12.5174 8.33333 12.125 8.33333 11.6667C8.33333 11.2083 8.17014 10.816 7.84375 10.4896C7.51736 10.1632 7.125 10 6.66667 10C6.20833 10 5.81597 10.1632 5.48958 10.4896C5.16319 10.816 5 11.2083 5 11.6667C5 12.125 5.16319 12.5174 5.48958 12.8438C5.81597 13.1701 6.20833 13.3333 6.66667 13.3333ZM4.16667 5.83333H9.16667V4.16667C9.16667 3.47222 8.92361 2.88194 8.4375 2.39583C7.95139 1.90972 7.36111 1.66667 6.66667 1.66667C5.97222 1.66667 5.38194 1.90972 4.89583 2.39583C4.40972 2.88194 4.16667 3.47222 4.16667 4.16667V5.83333ZM1.66667 15.8333V7.5V15.8333Z" fill="currentColor" />
  </svg>
);

const EyeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 19 13" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ stroke: 'none', color: 'var(--text-light)' }}>
    <path d="M9.16667 10C10.2083 10 11.0938 9.63542 11.8229 8.90625C12.5521 8.17708 12.9167 7.29167 12.9167 6.25C12.9167 5.20833 12.5521 4.32292 11.8229 3.59375C11.0938 2.86458 10.2083 2.5 9.16667 2.5C8.125 2.5 7.23958 2.86458 6.51042 3.59375C5.78125 4.32292 5.41667 5.20833 5.41667 6.25C5.41667 7.29167 5.78125 8.17708 6.51042 8.90625C7.23958 9.63542 8.125 10 9.16667 10ZM9.16667 8.5C8.54167 8.5 8.01042 8.28125 7.57292 7.84375C7.13542 7.40625 6.91667 6.875 6.91667 6.25C6.91667 5.625 7.13542 5.09375 7.57292 4.65625C8.01042 4.21875 8.54167 4 9.16667 4C9.79167 4 10.3229 4.21875 10.7604 4.65625C11.1979 5.09375 11.4167 5.625 11.4167 6.25C11.4167 6.875 11.1979 7.40625 10.7604 7.84375C10.3229 8.28125 9.79167 8.5 9.16667 8.5ZM9.16667 12.5C7.13889 12.5 5.29167 11.934 3.625 10.8021C1.95833 9.67014 0.75 8.15278 0 6.25C0.75 4.34722 1.95833 2.82986 3.625 1.69792C5.29167 0.565972 7.13889 0 9.16667 0C11.1944 0 13.0417 0.565972 14.7083 1.69792C16.375 2.82986 17.5833 4.34722 18.3333 6.25C17.5833 8.15278 16.375 9.67014 14.7083 10.8021C13.0417 11.934 11.1944 12.5 9.16667 12.5ZM9.16667 10.8333C10.7361 10.8333 12.1771 10.4201 13.4896 9.59375C14.8021 8.76736 15.8056 7.65278 16.5 6.25C15.8056 4.84722 14.8021 3.73264 13.4896 2.90625C12.1771 2.07986 10.7361 1.66667 9.16667 1.66667C7.59722 1.66667 6.15625 2.07986 4.84375 2.90625C3.53125 3.73264 2.52778 4.84722 1.83333 6.25C2.52778 7.65278 3.53125 8.76736 4.84375 9.59375C6.15625 10.4201 7.59722 10.8333 9.16667 10.8333Z" fill="currentColor" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const ArrowRightIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 12H20M20 12L13 5M20 12L13 19" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const InfoIcon = ({ color = "currentColor", size = "20" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="16" x2="12" y2="12"></line>
    <line x1="12" y1="8" x2="12.01" y2="8"></line>
  </svg>
);

const CapIcon = ({ color = "white", outline = false }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {outline ? (
      <path d="M22 10L12 5L2 10L12 15L22 10Z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    ) : (
      <path d="M22 10L12 5L2 10L12 15L22 10Z" fill={color} />
    )}
    <path d="M6 12V17C6 17 8 20 12 20C16 20 18 17 18 17V12" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M22 10V18" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SignalIcon = () => (
  <svg width="16" height="12" viewBox="0 0 16 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="7" width="3" height="5" rx="1.5" fill="#0b9617" />
    <rect x="6" y="4" width="3" height="8" rx="1.5" fill="#0b9617" />
    <rect x="11" y="0" width="3" height="12" rx="1.5" fill="#0b9617" />
  </svg>
);

const WifiIcon = () => (
  <svg width="16" height="14" viewBox="0 0 24 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="18" r="2.5" fill="#0b9617" />
    <path d="M6 13C9 10 15 10 18 13" stroke="#0b9617" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M2 9C7 4.5 17 4.5 22 9" stroke="#0b9617" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const BatteryIcon = () => (
  <svg width="12" height="16" viewBox="0 0 10 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 2C3 1.44772 3.44772 1 4 1H6C6.55228 1 7 1.44772 7 2V3H9C9.55228 3 10 3.44772 10 4V14C10 14.5523 9.55228 15 9 15H1C0.447715 15 0 14.5523 0 14V4C0 3.44772 0.447715 3 1 3H3V2Z" fill="#0b9617" />
  </svg>
);

const GridIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"></rect>
    <rect x="14" y="3" width="7" height="7" rx="1"></rect>
    <rect x="14" y="14" width="7" height="7" rx="1"></rect>
    <rect x="3" y="14" width="7" height="7" rx="1"></rect>
  </svg>
);

const ScanQRIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 3H5C3.89543 3 3 3.89543 3 5V7" />
    <path d="M17 3H19C20.1046 3 21 3.89543 21 5V7" />
    <path d="M21 17V19C21 20.1046 20.1046 21 19 21H17" />
    <path d="M7 21H5C3.89543 21 3 20.1046 3 19V17" />
    <rect x="7" y="7" width="3" height="3" fill="currentColor" stroke="none" />
    <rect x="14" y="7" width="3" height="3" fill="currentColor" stroke="none" />
    <rect x="7" y="14" width="3" height="3" fill="currentColor" stroke="none" />
    <rect x="11" y="11" width="2" height="2" fill="currentColor" stroke="none" />
  </svg>
);

const SlipIcon = ({ color = "currentColor" }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <line x1="16" y1="13" x2="8" y2="13"></line>
    <line x1="16" y1="17" x2="8" y2="17"></line>
    <polyline points="10 9 9 9 8 9"></polyline>
  </svg>
);

const StatusGraphIcon = ({ color = "currentColor" }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="8" y1="17" x2="8" y2="11"></line>
    <line x1="12" y1="17" x2="12" y2="7"></line>
    <line x1="16" y1="17" x2="16" y2="13"></line>
  </svg>
);

const LocationPinIcon = ({ color = "currentColor" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
    <circle cx="12" cy="10" r="3"></circle>
  </svg>
);

const DocumentIcon = ({ color = "currentColor", width = "20", height = "20" }) => (
  <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <line x1="16" y1="13" x2="8" y2="13"></line>
    <line x1="16" y1="17" x2="8" y2="17"></line>
  </svg>
);

const SlashedPersonIcon = ({ color = "currentColor" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M4 21v-2a4 4 0 0 1 2-3.21"></path>
    <circle cx="12" cy="7" r="4"></circle>
    <line x1="3" y1="3" x2="21" y2="21"></line>
  </svg>
);

const MapFoldIcon = ({ color = "currentColor", width = "32", height = "32" }) => (
  <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
    <line x1="8" y1="2" x2="8" y2="18"></line>
    <line x1="16" y1="6" x2="16" y2="22"></line>
  </svg>
);

const HomeNavIcon = ({ color = "currentColor" }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
    <polyline points="9 22 9 12 15 12 15 22"></polyline>
  </svg>
);

const ProfileNavIcon = ({ color = "currentColor" }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

const BackArrowIcon = ({ color = "currentColor" }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"></line>
    <polyline points="12 19 5 12 12 5"></polyline>
  </svg>
);

const GlobeIcon = ({ color = "currentColor" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="2" y1="12" x2="22" y2="12"></line>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
  </svg>
);

const ClipboardCheckIcon = ({ color = "currentColor" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
    <path d="M9 14l2 2 4-4"></path>
  </svg>
);

const ClockIcon = ({ color = "currentColor" }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
);

const RefreshClockIcon = ({ color = "currentColor" }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 8 14"></polyline>
    <path d="M22 12A10 10 0 0 0 12 2" strokeDasharray="3 3"></path>
  </svg>
);

const SendIcon = ({ color = "white" }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"></line>
    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>
);

const ProfileEditIcon = ({ color = "currentColor" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9"></path>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
  </svg>
);

const PasswordIcon = ({ color = "currentColor" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.182 17 8.5l1.5-1.5 1.5 1.5L22 6.5V2h-4.5z"></path>
  </svg>
);

const NotificationIcon = ({ color = "currentColor" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
  </svg>
);

const PrivacyIcon = ({ color = "currentColor" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
    <circle cx="12" cy="11" r="3"></circle>
  </svg>
);

const ShieldSearchIcon = ({ color = "currentColor" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4.2 8-10.5V5.5L12 2 4 5.5v6C4 17.8 12 22 12 22z" />
    <circle cx="11" cy="11" r="3.2" />
    <path d="M13.4 13.4L16.5 16.5" />
  </svg>
);

const QuestionCircleIcon = ({ color = "currentColor" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9.5" />
    <path d="M9.7 9.2C10.1 7.9 11.1 7 12.6 7c1.7 0 2.9 1.1 2.9 2.6 0 1.9-2.5 2.4-3.1 4.1" />
    <path d="M12.3 17h.01" />
  </svg>
);

const LEGAL_DOCUMENTS = {
  terms: {
    title: 'Terms and Conditions',
    body: 'EduRoute is intended for official faculty routing, locator slip submission, and school-approved coordination. Faculty users are responsible for keeping account credentials private and submitting accurate travel information.'
  },
  privacy: {
    title: 'Privacy Policy',
    body: 'EduRoute stores registered faculty details, permission preferences, profile updates, and locator slip records only for school portal operations. Sensitive permissions are requested only when a feature needs them.'
  },
  dataFaq: {
    title: 'Data Usage FAQ',
    body: 'Notifications support approval alerts. Location is used only for route-related features. Camera and photo access are used only for profile pictures or document-related actions.'
  }
};

const LegalDocumentModal = ({ activeLegalDoc, onClose }) => {
  if (!activeLegalDoc) return null;

  const legalDoc = LEGAL_DOCUMENTS[activeLegalDoc];

  return (
    <div className="priv-legal-modal-backdrop" role="dialog" aria-modal="true">
      <div className="priv-legal-modal-card">
        <div className="priv-legal-modal-icon">
          {activeLegalDoc === 'privacy' && <ShieldSearchIcon color="var(--green)" />}
          {activeLegalDoc === 'dataFaq' && <QuestionCircleIcon color="var(--green)" />}
          {activeLegalDoc === 'terms' && <FileTextIcon color="var(--green)" />}
        </div>
        <h2>{legalDoc.title}</h2>
        <div className="priv-legal-modal-scroll">
          <p>{legalDoc.body}</p>
          <p>
            Authorized access is limited to registered Gordon College faculty users. Keep your password secure, submit accurate account and locator slip information, and use EduRoute only for official school-related coordination.
          </p>
          <p>
            EduRoute may update these guidelines as the academic portal grows. Continued use of the portal means you agree to follow current faculty data, security, and acceptable-use rules.
          </p>
        </div>
        <button type="button" className="priv-legal-modal-btn" onClick={onClose}>
          Go Back <ArrowRightIcon />
        </button>
        <div className="priv-legal-modal-pager">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
};

const LogoutIcon = ({ color = "currentColor" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
    <polyline points="16 17 21 12 16 7"></polyline>
    <line x1="21" y1="12" x2="9" y2="12"></line>
  </svg>
);

const ChevronRightIcon = ({ color = "currentColor" }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
);

const IdBadgeIcon = ({ color = "currentColor" }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2" ry="2"></rect>
    <circle cx="8" cy="12" r="2"></circle>
    <line x1="13" y1="11" x2="19" y2="11"></line>
    <line x1="13" y1="14" x2="19" y2="14"></line>
  </svg>
);

const FlashlightIcon = ({ color = "currentColor" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 6h-4"></path>
    <path d="M15 10v10a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V10l-2-4V2h10v4l-2 4z"></path>
  </svg>
);

const UploadIcon = ({ color = "currentColor" }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="17 8 12 3 7 8"></polyline>
    <line x1="12" y1="3" x2="12" y2="15"></line>
  </svg>
);

const HelpIcon = ({ color = "currentColor" }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  </svg>
);

const HourglassIcon = ({ color = "currentColor" }) => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path
      d="M18 8h28M18 56h28"
      stroke={color}
      strokeWidth="5"
      strokeLinecap="round"
    />
    <path
      d="M22 12c0 10 4.5 16 10 20-5.5 4-10 10-10 20M42 12c0 10-4.5 16-10 20 5.5 4 10 10 10 20"
      stroke={color}
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M26 18h12c-.8 4.5-2.9 7.4-6 9.8-3.1-2.4-5.2-5.3-6-9.8Z"
      fill={color}
      opacity="0.18"
    />
    <path
      d="M25 49c1.5-5.6 4-8.3 7-10.6 3 2.3 5.5 5 7 10.6H25Z"
      fill={color}
    />
  </svg>
);

const ShieldCheckSmallIcon = ({ color = "currentColor" }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
    <path d="M9 12l2 2 4-4"></path>
  </svg>
);

const ProgressReviewIcon = ({ color = "currentColor" }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"></polyline>
    <polyline points="1 20 1 14 7 14"></polyline>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
  </svg>
);

const FilledClockIcon = ({ color = "currentColor" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
);

const ShieldCheckIcon = ({ color = "currentColor" }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
    <polyline points="9 12 11 14 15 10"></polyline>
  </svg>
);

const CheckCircleSolidIcon = ({ color = "var(--green)", size = "36" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="12" fill={color} />
    <path d="M7 12L10.5 15.5L18 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ShieldSolidIcon = ({ color = "var(--green)", size = "16" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="none">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill={color} />
    <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LockSmallIcon = ({ color = "#9CA3AF" }) => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
  </svg>
);

const ExclamationCircleIcon = ({ color = "#EF4444", size = "20" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="8" x2="12" y2="12"></line>
    <line x1="12" y1="16" x2="12.01" y2="16"></line>
  </svg>
);

const EditPencilIcon = ({ color = "var(--green)", size = "12" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
  </svg>
);

const DummySignature = () => (
  <div style={{ width: '90px', height: '46px', background: '#333', position: 'relative', overflow: 'hidden' }}>
    <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} viewBox="0 0 100 50" preserveAspectRatio="none">
      <path d="M10,40 Q30,10 40,25 T60,30 T80,15" fill="none" stroke="#E5D9AE" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M20,35 Q50,-10 90,45" fill="none" stroke="#E5D9AE" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
      <line x1="0" y1="38" x2="100" y2="38" stroke="#E5D9AE" strokeWidth="0.5" opacity="0.4" />
    </svg>
  </div>
);

const GraduationCapIcon = ({ color = "currentColor" }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill={color}>
    <path d="M12 3L1 9L5 11.18V17H19V11.18L23 9L12 3Z" />
  </svg>
);

const AtSymbolIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
  </svg>
);

const LoginDoorIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" y1="12" x2="3" y2="12" />
  </svg>
);

const HeadsetIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

const PinIcon = ({ color = "currentColor", size = "20" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="7"></circle>
    <circle cx="12" cy="12" r="2" fill={color}></circle>
    <line x1="12" y1="1" x2="12" y2="5"></line>
    <line x1="12" y1="19" x2="12" y2="23"></line>
    <line x1="1" y1="12" x2="5" y2="12"></line>
    <line x1="19" y1="12" x2="23" y2="12"></line>
  </svg>
);

const FacultyRoleIcon = ({ color = "currentColor", size = "22" }) => (
  <svg width={size} height={size} viewBox="0 0 32 28" fill="none" aria-hidden="true">
    <path d="M16 2L2 9.25L16 16.5L30 9.25L16 2Z" stroke={color} strokeWidth="3" strokeLinejoin="round" />
    <path d="M7.5 12.8V20.2L16 25L24.5 20.2V12.8" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const HrmuRoleIcon = ({ color = "currentColor", size = "22" }) => (
  <svg width={size} height={size} viewBox="0 0 32 28" fill="none" aria-hidden="true">
    <rect x="2.5" y="7.5" width="27" height="18" rx="1.5" stroke={color} strokeWidth="3" />
    <path d="M12 7V3H20V7" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="15" r="2" fill={color} />
    <path d="M8.5 21C9.35 18.8 14.65 18.8 15.5 21" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    <path d="M19 14H25" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    <path d="M19 19H25" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const CssuRoleIcon = ({ color = "currentColor", size = "22" }) => (
  <svg width={size} height={size} viewBox="0 0 28 32" fill="none" aria-hidden="true">
    <path d="M14 2L25 6.8V14.2C25 22.6 19 28.2 14 30C9 28.2 3 22.6 3 14.2V6.8L14 2Z" stroke={color} strokeWidth="3" strokeLinejoin="round" />
    <path d="M14 5.3V26.6C10.2 24.7 6.2 20.4 6.2 14.4V9L14 5.3Z" fill={color} opacity="0.35" />
  </svg>
);

const AdminRoleIcon = ({ color = "currentColor", size = "22" }) => (
  <svg width={size} height={size} viewBox="0 0 28 32" fill="none" aria-hidden="true">
    <path d="M14 2L25 6.8V14.2C25 22.6 19 28.2 14 30C9 28.2 3 22.6 3 14.2V6.8L14 2Z" stroke={color} strokeWidth="3" strokeLinejoin="round" />
    <circle cx="16.5" cy="17" r="3" stroke={color} strokeWidth="2.4" />
    <path d="M11.2 24C12.1 21.2 20.9 21.2 21.8 24" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const BriefcaseIcon = ({ color = "currentColor", size = "20" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M3 12h18" />
    <path d="M10 11h4v3h-4z" />
  </svg>
);

const AdminBadgeIcon = ({ color = "currentColor", size = "20" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M15.5 10.5a3.5 3.5 0 1 1-6.4 2" />
    <path d="M12 7v5h5" />
  </svg>
);

const EwanIcon = ({ color = "currentColor", size = "20" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 4 4 9 12 14 20 9 12 4"></polygon>
    <polyline points="4 14 12 19 20 14"></polyline>
  </svg>
);

const AUTH_ACCOUNT_ROLES = [
  { key: 'faculty', label: 'Faculty', title: 'Gordon College Faculty Portal', icon: FacultyRoleIcon },
  { key: 'hrmu', label: 'HRMU', title: 'Gordon College HRMU Portal', icon: HrmuRoleIcon },
  { key: 'cssu', label: 'CSSU', title: 'Gordon College CSSU Portal', icon: CssuRoleIcon },
  { key: 'admin', label: 'Admin', title: 'Gordon College Admin Portal', icon: AdminRoleIcon },
];

const LOGIN_PORTAL_ROLES = [
  { key: 'faculty', label: 'Faculty', title: 'Gordon College Faculty Portal', icon: FacultyRoleIcon, portalRole: 'faculty', viewports: ['mobile'] },
  { key: 'dean', label: 'Dean', title: 'Gordon College Dean Portal', icon: AdminRoleIcon, portalRole: 'admin', viewports: ['mobile'] },
  { key: 'hrmu', label: 'HRMU', title: 'Gordon College HRMU Portal', icon: HrmuRoleIcon, portalRole: 'hrmu', viewports: ['desktop'] },
  { key: 'cssu', label: 'CSSU', title: 'Gordon College CSSU Portal', icon: CssuRoleIcon, portalRole: 'cssu', viewports: ['mobile', 'desktop'] },
];

const LoginView = ({ setView, loginForm, setLoginForm, onLogin, loading, showLoginPassword, setShowLoginPassword }) => {
  const getDesktopRoleViewport = () => (typeof window !== 'undefined' ? window.innerWidth >= 768 : true);
  const [isDesktopRoleViewport, setIsDesktopRoleViewport] = useState(getDesktopRoleViewport);
  const [selectedRole, setSelectedRole] = useState(() => (getDesktopRoleViewport() ? 'hrmu' : 'faculty'));

  useEffect(() => {
    const handleResize = () => {
      setIsDesktopRoleViewport(window.innerWidth >= 768);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const availableRoles = useMemo(
    () =>
      LOGIN_PORTAL_ROLES.filter((role) =>
        role.viewports.includes(isDesktopRoleViewport ? 'desktop' : 'mobile')
      ),
    [isDesktopRoleViewport]
  );

  useEffect(() => {
    if (!availableRoles.some((role) => role.key === selectedRole) && availableRoles.length > 0) {
      setSelectedRole(availableRoles[0].key);
    }
  }, [availableRoles, selectedRole]);

  const activeRole = availableRoles.find((role) => role.key === selectedRole) || availableRoles[0] || LOGIN_PORTAL_ROLES[0];
  const submitPortalRole = activeRole?.portalRole || activeRole?.key || 'faculty';

  return (
    <>
      {/* DESKTOP VIEW */}
      <div className="desktop-view">
        <div className="dlogin-page">
          <div className="dlogin-wrapper fade-in">
            {/* Left Panel */}
            <div className="dlogin-left">
              <div className="dlogin-left-inner">
                <div className="dlogin-logo-section">
                  <div className="dlogin-logo-box">
                    <MapIcon />
                  </div>
                  <h1>EduRoute</h1>
                  <h2>{activeRole.title.toUpperCase()}</h2>
                </div>

                <div className="dlogin-role-section">
                  <p className="dlogin-role-header">SELECT DEPARTMENT ROLE</p>
                  <div className={`dlogin-role-grid dlogin-role-grid--${availableRoles.length}`}>
                    {availableRoles.map((role) => {
                      const RoleIcon = role.icon;
                      const isActive = selectedRole === role.key;
                      return (
                        <button
                          type="button"
                          key={role.key}
                          className={`dlogin-role-btn ${isActive ? 'active' : ''}`}
                          onClick={() => setSelectedRole(role.key)}
                        >
                          <RoleIcon color={isActive ? 'var(--green)' : '#4B5563'} size="20" />
                          <span>{role.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="dlogin-footer">
                  <p>© 2026 EduRoute Institutional Security. All rights reserved.</p>
                  <p>Privacy Policy &nbsp;&nbsp;&nbsp; System Status</p>
                </div>

              </div>
              <div className="dlogin-bg-circle"></div>
            </div>

            {/* Right Panel */}
            <div className="dlogin-right">
              <div className="dlogin-form-inner">
                <form className="dlogin-form-container" onSubmit={(e) => onLogin(e, submitPortalRole)}>
                  <div className="dlogin-form-header">
                    <h2>Campus Gateway</h2>
                    <p>Verify your credentials to access the secure administrative environment.</p>
                  </div>

                  <div className="dlogin-form-body">
                    <div className="dlogin-input-group">
                      <label>Staff ID / Email</label>
                      <div className="dlogin-input-wrapper">
                        <BadgeIcon color="#9CA3AF" size="18" />
                        <input
                          type="text"
                          placeholder="e.g. admin.01@eduroute.edu"
                          value={loginForm.email_or_employee_id}
                          onChange={(e) =>
                            setLoginForm((prev) => ({
                              ...prev,
                              email_or_employee_id: e.target.value
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="dlogin-input-group">
                      <div className="dlogin-label-row">
                        <label>Security Passkey</label>
                        <a
                          href="#"
                          className="dlogin-forgot-link"
                          onClick={(e) => {
                            e.preventDefault();
                            setView('forgot-password');
                          }}
                        >
                          Forgot Password
                        </a>
                      </div>
                      <div className="dlogin-input-wrapper">
                        <LockIcon color="#9CA3AF" size="18" />
                        <input
                          type={showLoginPassword ? 'text' : 'password'}
                          placeholder="••••••••••••"
                          value={loginForm.password}
                          onChange={(e) =>
                            setLoginForm((prev) => ({
                              ...prev,
                              password: e.target.value
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="dlogin-eye-btn"
                          onClick={() => setShowLoginPassword((prev) => !prev)}
                        >
                          <EyeIcon color="#9CA3AF" size="18" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <button type="submit" className="dlogin-submit-btn" disabled={loading}>
                    {loading ? 'Logging in...' : (
                      <>Login <ArrowRightIcon color="white" size="18" /></>
                    )}
                  </button>

                  <div className="dlogin-divider">
                    <hr />
                    <span>OR</span>
                    <hr />
                  </div>

                  <button type="button" className="dlogin-signup-btn" onClick={() => setView('signup')}>
                    Sign Up
                  </button>

                  <div className="dlogin-security-box">
                    <InfoIcon color="#92400E" size="20" />
                    <p>Security Advisory: Unauthorized access attempts are logged and reported to the institutional security board. Please ensure you are using a secure connection.</p>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE VIEW */}
      <div className="mobile-view">
        <div className="content fade-in login-content">
          <div className="logo-container login-logo-container">
            <div className="logo-box login-logo-box">
              <MapIcon />
            </div>
            <h1>EduRoute</h1>
            <h2 className="login-portal-title">{activeRole.title.toUpperCase()}</h2>
          </div>

          <form className="card login-card" onSubmit={(e) => onLogin(e, submitPortalRole)}>
            <div className={`role-selector role-selector--${availableRoles.length}`} aria-label="Select portal role">
              {availableRoles.map((role) => {
                const RoleIcon = role.icon;
                const isActive = selectedRole === role.key;

                return (
                  <button
                    type="button"
                    key={role.key}
                    className={`role-tab ${isActive ? 'active' : ''}`}
                    onClick={() => setSelectedRole(role.key)}
                  >
                    <RoleIcon color={isActive ? 'var(--green)' : '#4e5a4f'} size="23" />
                    <span>{role.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="login-form-body">
              <div className="input-group">
                <label>EMAIL OR EMPLOYEE ID</label>
                <div className="input-wrapper">
                  <BadgeIcon />
                  <input
                    type="text"
                    placeholder="j.smith@gordoncollege.edu.ph "
                    value={loginForm.email_or_employee_id}
                    onChange={(e) =>
                      setLoginForm((prev) => ({
                        ...prev,
                        email_or_employee_id: e.target.value
                      }))
                    }
                  />
                </div>
              </div>

              <div className="input-group">
                <div className="label-row">
                  <label>PASSWORD</label>
                  <a
                    href="#"
                    className="forgot-link"
                    onClick={(e) => {
                      e.preventDefault();
                      setView('forgot-password');
                    }}
                  >
                    Forgot Password?
                  </a>
                </div>

                <div className="input-wrapper">
                  <LockIcon />
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={loginForm.password}
                    onChange={(e) =>
                      setLoginForm((prev) => ({
                        ...prev,
                        password: e.target.value
                      }))
                    }
                  />

                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                  >
                    <EyeIcon />
                  </button>
                </div>
              </div>

              <button type="submit" className="primary-btn" disabled={loading}>
                {loading ? 'Logging in...' : <>Login <ArrowRightIcon /></>}
              </button>

              <div className="divider">
                <hr />
                <span>NEW TO EDUROUTE?</span>
                <hr />
              </div>

              <button type="button" className="secondary-btn" onClick={() => setView('signup')}>
                Sign Up
              </button>

              <div className="login-security-version">
                <span className="login-security-dot" />
                <span>Institutional Security System v2.4.1</span>
              </div>
            </div>
          </form>

          <div className="footer">
            <div className="footer-logo">
              <CapIcon />
            </div>
            <div className="footer-text">
              <span className="footer-developed">DEVELOPED BY</span>
              <span className="footer-brand">ARCHONS</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const DesktopAuthShell = ({
  portalLabel,
  sideEyebrow,
  sideTitle,
  sideDescription,
  formTitle,
  formDescription,
  children,
}) => (
  <div className="auth-desktop-view fade-in">
    <div className="dlogin-page dauth-page">
      <div className="dlogin-wrapper dauth-wrapper">
        <div className="dlogin-left dauth-left">
          <div className="dlogin-left-inner dauth-left-inner">
            <div className="dlogin-logo-section dauth-logo-section">
              <div className="dlogin-logo-box dauth-logo-box">
                <MapIcon />
              </div>
              <h1>EduRoute</h1>
              <h2>{portalLabel}</h2>
            </div>

            <div className="dauth-side-copy">
              <span className="dauth-side-eyebrow">{sideEyebrow}</span>
              <h3>{sideTitle}</h3>
              <p>{sideDescription}</p>
            </div>

            <div className="dlogin-footer dauth-footer">
              <p>© 2026 EduRoute Institutional Security. All rights reserved.</p>
              <div className="dauth-footer-links">
                <span>Privacy Policy</span>
                <span>System Status</span>
              </div>
            </div>
          </div>

          <div className="dlogin-bg-circle dauth-bg-circle" />
        </div>

        <div className="dlogin-right dauth-right">
          <div className="dlogin-form-inner dauth-form-inner">
            <div className="dauth-form-scroll">
              <div className="dlogin-form-header dauth-form-header">
                <h2>{formTitle}</h2>
                <p>{formDescription}</p>
              </div>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const ForgotPasswordView = ({ setView, forgotForm, setForgotForm, onForgotPassword, loading }) => (
  <>
    <DesktopAuthShell
      portalLabel="ACCOUNT RECOVERY PORTAL"
      sideEyebrow="PASSWORD SUPPORT"
      sideTitle="Recover Access"
      sideDescription="Use your registered institutional email to receive a secure reset link and restore access to your account."
      formTitle="Account Recovery"
      formDescription="Enter your registered institutional email to receive a secure password reset link."
    >
      <form className="card recovery-card dauth-card dauth-recovery-card" onSubmit={onForgotPassword}>
        <div className="input-group">
          <label>INSTITUTIONAL EMAIL</label>
          <div className="input-wrapper tall-input-wrapper">
            <div className="at-icon-wrapper"><AtSymbolIcon /></div>
            <textarea
              placeholder="e.g.&#10;professor.name@eduroute.edu"
              rows={2}
              spellCheck="false"
              value={forgotForm.email}
              onChange={(e) =>
                setForgotForm((prev) => ({
                  ...prev,
                  email: e.target.value
                }))
              }
            />
          </div>
        </div>

        <button type="submit" className="primary-btn" disabled={loading}>
          {loading ? 'Sending...' : <>Send Reset Link <ArrowRightIcon /></>}
        </button>

        <button type="button" className="ghost-btn" onClick={() => setView('login')}>
          <LoginDoorIcon /> Back to Login
        </button>
      </form>

      <div className="support-badge dauth-support-badge">
        <div className="support-icon">
          <HeadsetIcon />
        </div>
        <div className="support-text">
          Issue persists? Contact<br />
          <span>IT Support Desk</span>
        </div>
      </div>
    </DesktopAuthShell>

    <div className="auth-mobile-view content fade-in forgot-pw-content">
      <div className="recovery-header">
        <CapIcon />
        <span>EduRoute Portal</span>
      </div>

      <div className="recovery-title-box">
        <div className="yellow-bar"></div>
        <h1>Account<br />Recovery</h1>
      </div>

      <p className="recovery-desc">
        Enter your registered institutional email to receive a secure password reset link.
      </p>

      <form className="card recovery-card" onSubmit={onForgotPassword}>
        <div className="input-group">
          <label>INSTITUTIONAL EMAIL</label>
          <div className="input-wrapper tall-input-wrapper">
            <div className="at-icon-wrapper"><AtSymbolIcon /></div>
            <textarea
              placeholder="e.g.&#10;professor.name@eduroute.edu"
              rows={2}
              spellCheck="false"
              value={forgotForm.email}
              onChange={(e) =>
                setForgotForm((prev) => ({
                  ...prev,
                  email: e.target.value
                }))
              }
            />
          </div>
        </div>

        <button type="submit" className="primary-btn" disabled={loading}>
          {loading ? 'Sending...' : <>Send Reset Link <ArrowRightIcon /></>}
        </button>

        <button type="button" className="ghost-btn" onClick={() => setView('login')}>
          <LoginDoorIcon /> Back to Login
        </button>
      </form>

      <div className="support-badge">
        <div className="support-icon">
          <HeadsetIcon />
        </div>
        <div className="support-text">
          Issue persists? Contact<br />
          <span>IT Support Desk</span>
        </div>
      </div>
    </div>
  </>
);

const ResetCodeView = ({
  setView,
  resetCode,
  setResetCode,
  onVerifyResetCode,
  onResendResetCode,
  resendCooldown,
  loading,
}) => {
  const codeInputRefs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, index) => resetCode[index] || '');
  const canResend = resendCooldown === 0 && !loading;

  const updateDigit = (index, value) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = digit;
    setResetCode(nextDigits.join(''));

    if (digit && index < codeInputRefs.current.length - 1) {
      codeInputRefs.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e) => {
    e.preventDefault();
    const pastedCode = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    setResetCode(pastedCode);
    codeInputRefs.current[Math.min(pastedCode.length, 5)]?.focus();
  };

  return (
    <>
      <DesktopAuthShell
        portalLabel="ACCOUNT RECOVERY PORTAL"
        sideEyebrow="VERIFICATION STEP"
        sideTitle="Confirm Reset Code"
        sideDescription="Enter the six-digit reset code sent to the registered account so we can verify this password recovery request."
        formTitle="Enter Reset Code"
        formDescription="Type the six-digit verification code and continue to set a new password."
      >
        <form className="card recovery-card reset-code-card dauth-card dauth-recovery-card" onSubmit={onVerifyResetCode}>
          <div className="input-group">
            <label>TYPE OTP CODE</label>
            <div className="otp-code-row" onPaste={handleCodePaste}>
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(node) => {
                    codeInputRefs.current[index] = node;
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  className="otp-code-box"
                  value={digit}
                  aria-label={`Reset code digit ${index + 1}`}
                  onChange={(e) => updateDigit(index, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(index, e)}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            className="resend-code-btn"
            disabled={!canResend}
            onClick={onResendResetCode}
          >
            {canResend ? 'RESEND CODE' : `RESEND IN ${resendCooldown}s`}
          </button>

          <button type="submit" className="primary-btn reset-verify-btn" disabled={loading || resetCode.length !== 6}>
            {loading ? 'Verifying...' : <>Verify <ArrowRightIcon /></>}
          </button>

          <button type="button" className="ghost-btn reset-back-btn" onClick={() => setView('login')}>
            <LoginDoorIcon /> Back to Faculty Login
          </button>
        </form>

        <div className="support-badge dauth-support-badge">
          <div className="support-icon">
            <HeadsetIcon />
          </div>
          <div className="support-text">
            Issue persists? Contact<br />
            <span>IT Support Desk</span>
          </div>
        </div>
      </DesktopAuthShell>

      <div className="auth-mobile-view content fade-in forgot-pw-content reset-code-content">
        <div className="recovery-header">
          <CapIcon />
          <span>EduRoute Faculty</span>
        </div>

        <div className="recovery-title-box reset-code-title-box">
          <div className="yellow-bar"></div>
          <h1>Account<br />Recovery</h1>
        </div>

        <p className="recovery-desc reset-code-desc">
          Enter your registered faculty email to receive a secure password reset link.
        </p>

        <form className="card recovery-card reset-code-card" onSubmit={onVerifyResetCode}>
          <div className="input-group">
            <label>TYPE OTP CODE</label>
            <div className="otp-code-row" onPaste={handleCodePaste}>
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(node) => {
                    codeInputRefs.current[index] = node;
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  className="otp-code-box"
                  value={digit}
                  aria-label={`Reset code digit ${index + 1}`}
                  onChange={(e) => updateDigit(index, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(index, e)}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            className="resend-code-btn"
            disabled={!canResend}
            onClick={onResendResetCode}
          >
            {canResend ? 'RESEND CODE' : `RESEND IN ${resendCooldown}s`}
          </button>

          <button type="submit" className="primary-btn reset-verify-btn" disabled={loading || resetCode.length !== 6}>
            {loading ? 'Verifying...' : <>Verify <ArrowRightIcon /></>}
          </button>

          <button type="button" className="ghost-btn reset-back-btn" onClick={() => setView('login')}>
            <LoginDoorIcon /> Back to Faculty Login
          </button>
        </form>

        <div className="support-badge">
          <div className="support-icon">
            <HeadsetIcon />
          </div>
          <div className="support-text">
            Issue persists? Contact<br />
            <span>IT Support Desk</span>
          </div>
        </div>
      </div>
    </>
  );
};

const SetNewPasswordView = ({
  newPasswordForm,
  setNewPasswordForm,
  onResetPassword,
  loading,
}) => {
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);

  const resetPasswordPolicy = useMemo(() => {
    const password = newPasswordForm.password;

    return {
      minLength: password.length >= 10,
      symbolsNumbers: /[0-9]/.test(password) && /[^a-zA-Z0-9\s]/.test(password),
      noPersonal: password.length > 0 && !['eduroute', 'password', 'faculty'].some((info) =>
        password.toLowerCase().includes(info)
      ),
    };
  }, [newPasswordForm.password]);

  const passwordsMatch =
    newPasswordForm.password.length > 0 && newPasswordForm.password === newPasswordForm.confirm_password;
  const policyComplete =
    resetPasswordPolicy.minLength && resetPasswordPolicy.symbolsNumbers && resetPasswordPolicy.noPersonal;
  const canSavePassword = policyComplete && passwordsMatch && !loading;

  const handleSubmit = (e) => {
    if (!canSavePassword) {
      e.preventDefault();
      return;
    }

    onResetPassword(e);
  };

  return (
    <>
      <DesktopAuthShell
        portalLabel="ACCOUNT RECOVERY PORTAL"
        sideEyebrow="SECURE RESET"
        sideTitle="Create A New Password"
        sideDescription="Set a fresh password that meets the institutional policy before access is restored."
        formTitle="Set New Password"
        formDescription="Create a strong new password and confirm it to finish the account recovery flow."
      >
        <div className="password-policy-card set-password-policy-card dauth-policy-card">
          <div className="policy-heading">
            <PolicyBulbIcon />
            <span>PASSWORD POLICY</span>
          </div>
          <div className="policy-list">
            <div className={`policy-item ${resetPasswordPolicy.minLength ? 'met' : 'unmet'}`}>
              <PolicyCheckIcon met={resetPasswordPolicy.minLength} />
              <span>Minimum 10 characters</span>
            </div>
            <div className={`policy-item ${resetPasswordPolicy.symbolsNumbers ? 'met' : 'unmet'}`}>
              <PolicyCheckIcon met={resetPasswordPolicy.symbolsNumbers} />
              <span>Include symbols &amp; numbers</span>
            </div>
            <div className={`policy-item ${resetPasswordPolicy.noPersonal ? 'met' : 'unmet'}`}>
              <PolicyCheckIcon met={resetPasswordPolicy.noPersonal} />
              <span>No personal information</span>
            </div>
          </div>
        </div>

        <form className="card recovery-card set-password-card dauth-card dauth-set-password-card" onSubmit={handleSubmit}>
          <h2 className="set-password-card-title">SET NEW PASSWORD</h2>

          <div className="input-group">
            <label>PASSWORD</label>
            <div className="input-wrapper plain-input-wrapper">
              <input
                type={showResetPassword ? 'text' : 'password'}
                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                value={newPasswordForm.password}
                onChange={(e) =>
                  setNewPasswordForm((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
              />
              <button
                type="button"
                className="signup-eye-btn"
                aria-label={showResetPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowResetPassword((prev) => !prev)}
              >
                {showResetPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div className="input-group">
            <label>CONFIRM PASSWORD</label>
            <div className="input-wrapper plain-input-wrapper">
              <input
                type={showResetConfirmPassword ? 'text' : 'password'}
                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                value={newPasswordForm.confirm_password}
                onChange={(e) =>
                  setNewPasswordForm((prev) => ({
                    ...prev,
                    confirm_password: e.target.value,
                  }))
                }
              />
              <button
                type="button"
                className="signup-eye-btn"
                aria-label={showResetConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                onClick={() => setShowResetConfirmPassword((prev) => !prev)}
              >
                {showResetConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {newPasswordForm.confirm_password.length > 0 && !passwordsMatch && (
            <span className="set-password-mismatch">Passwords do not match</span>
          )}

          <button
            type="submit"
            className={`primary-btn set-password-save-btn ${canSavePassword ? 'ready' : 'disabled'}`}
            disabled={!canSavePassword}
          >
            {loading ? 'Saving...' : <>Save Password <ArrowRightIcon /></>}
          </button>
        </form>

        <div className="support-badge dauth-support-badge">
          <div className="support-icon">
            <HeadsetIcon />
          </div>
          <div className="support-text">
            Issue persists? Contact<br />
            <span>IT Support Desk</span>
          </div>
        </div>
      </DesktopAuthShell>

      <div className="auth-mobile-view content fade-in forgot-pw-content set-password-content">
        <div className="recovery-header">
          <CapIcon />
          <span>EduRoute Faculty</span>
        </div>

        <div className="recovery-title-box set-password-title-box">
          <div className="yellow-bar"></div>
          <h1>Set New<br />Password</h1>
        </div>

        <p className="recovery-desc set-password-desc">
          Enter your registered faculty email to receive a secure password reset link.
        </p>

        <div className="password-policy-card set-password-policy-card">
          <div className="policy-heading">
            <PolicyBulbIcon />
            <span>PASSWORD POLICY</span>
          </div>
          <div className="policy-list">
            <div className={`policy-item ${resetPasswordPolicy.minLength ? 'met' : 'unmet'}`}>
              <PolicyCheckIcon met={resetPasswordPolicy.minLength} />
              <span>Minimum 10 characters</span>
            </div>
            <div className={`policy-item ${resetPasswordPolicy.symbolsNumbers ? 'met' : 'unmet'}`}>
              <PolicyCheckIcon met={resetPasswordPolicy.symbolsNumbers} />
              <span>Include symbols &amp; numbers</span>
            </div>
            <div className={`policy-item ${resetPasswordPolicy.noPersonal ? 'met' : 'unmet'}`}>
              <PolicyCheckIcon met={resetPasswordPolicy.noPersonal} />
              <span>No personal information</span>
            </div>
          </div>
        </div>

        <form className="card recovery-card set-password-card" onSubmit={handleSubmit}>
          <h2 className="set-password-card-title">SET NEW PASSWORD</h2>

          <div className="input-group">
            <label>PASSWORD</label>
            <div className="input-wrapper plain-input-wrapper">
              <input
                type={showResetPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={newPasswordForm.password}
                onChange={(e) =>
                  setNewPasswordForm((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
              />
              <button
                type="button"
                className="signup-eye-btn"
                aria-label={showResetPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowResetPassword((prev) => !prev)}
              >
                {showResetPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div className="input-group">
            <label>CONFIRM PASSWORD</label>
            <div className="input-wrapper plain-input-wrapper">
              <input
                type={showResetConfirmPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={newPasswordForm.confirm_password}
                onChange={(e) =>
                  setNewPasswordForm((prev) => ({
                    ...prev,
                    confirm_password: e.target.value,
                  }))
                }
              />
              <button
                type="button"
                className="signup-eye-btn"
                aria-label={showResetConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                onClick={() => setShowResetConfirmPassword((prev) => !prev)}
              >
                {showResetConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {newPasswordForm.confirm_password.length > 0 && !passwordsMatch && (
            <span className="set-password-mismatch">Passwords do not match</span>
          )}

          <button
            type="submit"
            className={`primary-btn set-password-save-btn ${canSavePassword ? 'ready' : 'disabled'}`}
            disabled={!canSavePassword}
          >
            {loading ? 'Saving...' : <>Save Password <ArrowRightIcon /></>}
          </button>
        </form>

        <div className="support-badge">
          <div className="support-icon">
            <HeadsetIcon />
          </div>
          <div className="support-text">
            Issue persists? Contact<br />
            <span>IT Support Desk</span>
          </div>
        </div>
      </div>
    </>
  );
};

const SignUpView = ({ setView, registerForm, setRegisterForm, departments, onRegister, loading }) => {
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);
  const [activeLegalDoc, setActiveLegalDoc] = useState(null);
  const selectedSignupRole = registerForm.account_role || 'faculty';
  const signupRole = AUTH_ACCOUNT_ROLES.find((role) => role.key === selectedSignupRole) || AUTH_ACCOUNT_ROLES[0];
  const signupNeedsDepartment = ['faculty', 'admin'].includes(selectedSignupRole);

  const signupPasswordPolicy = useMemo(() => {
    const password = registerForm.password;
    const passwordLower = password.toLowerCase();
    const personalInfo = [
      registerForm.full_name,
      registerForm.employee_id,
      registerForm.email,
      'eduroute',
    ]
      .flatMap((value) => String(value || '').toLowerCase().split(/[^a-z0-9]+/))
      .filter((value) => value.length >= 3);

    return {
      minLength: password.length >= 10,
      symbolsNumbers: /[0-9]/.test(password) && /[^a-zA-Z0-9\s]/.test(password),
      noPersonal: password.length > 0 && !personalInfo.some((info) => passwordLower.includes(info)),
    };
  }, [registerForm.email, registerForm.employee_id, registerForm.full_name, registerForm.password]);

  const signupPasswordsMatch =
    registerForm.password.length > 0 && registerForm.password === registerForm.confirm_password;
  const signupPolicyComplete =
    signupPasswordPolicy.minLength && signupPasswordPolicy.symbolsNumbers && signupPasswordPolicy.noPersonal;
  const canRegister =
    signupPolicyComplete &&
    signupPasswordsMatch &&
    registerForm.terms_accepted &&
    (!signupNeedsDepartment || registerForm.department_id) &&
    !loading;

  const handleSignupSubmit = (e) => {
    if (!canRegister) {
      e.preventDefault();
      return;
    }

    onRegister(e);
  };

  return (
    <>
      <DesktopAuthShell
        portalLabel={signupRole.title.toUpperCase()}
        sideEyebrow="INSTITUTIONAL ONBOARDING"
        sideTitle={`Create ${signupRole.label} Access`}
        sideDescription="Set up a secure EduRoute account with institutional details and a compliant password."
        formTitle={`Create ${signupRole.label} Account`}
        formDescription="Enter your institutional details to begin and review the password policy before submitting."
      >
        <form className="card signup-card dauth-card dauth-signup-card" onSubmit={handleSignupSubmit}>
          <div className="signup-header">
            <h1>Create {signupRole.label}<br />Account</h1>
            <p>Please enter your institutional details to begin.</p>
          </div>

          <div className="signup-role-selector" aria-label="Select account role">
            {AUTH_ACCOUNT_ROLES.map((role) => {
              const RoleIcon = role.icon;
              const isActive = selectedSignupRole === role.key;

              return (
                <button
                  type="button"
                  key={role.key}
                  className={`signup-role-tab ${isActive ? 'active' : ''}`}
                  onClick={() =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      account_role: role.key,
                      department_id: ['faculty', 'admin'].includes(role.key) ? prev.department_id : '',
                    }))
                  }
                >
                  <RoleIcon color={isActive ? 'var(--green)' : '#4e5a4f'} size="22" />
                  <span>{role.label}</span>
                </button>
              );
            })}
          </div>

          <div className="input-group">
            <label>FULL NAME</label>
            <div className="input-wrapper plain-input-wrapper">
              <input
                type="text"
                placeholder="Dr. Julian Vane"
                value={registerForm.full_name}
                onChange={(e) =>
                  setRegisterForm((prev) => ({ ...prev, full_name: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="input-group">
            <label>EMPLOYEE ID</label>
            <div className="input-wrapper plain-input-wrapper">
              <input
                type="text"
                placeholder="FAC-88920"
                value={registerForm.employee_id}
                onChange={(e) =>
                  setRegisterForm((prev) => ({ ...prev, employee_id: e.target.value }))
                }
              />
            </div>
          </div>

          {signupNeedsDepartment && (
            <div className="input-group">
              <label>DEPARTMENT</label>
              <div className="input-wrapper plain-input-wrapper select-wrapper">
                <select
                  value={registerForm.department_id}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({ ...prev, department_id: e.target.value }))
                  }
                >
                  <option value="" disabled>Select Department</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.department_name}
                    </option>
                  ))}
                </select>
                <div className="select-icon">
                  <ChevronDownIcon />
                </div>
              </div>
            </div>
          )}

          <div className="input-group">
            <label>EMAIL ADDRESS</label>
            <div className="input-wrapper plain-input-wrapper">
              <input
                type="email"
                placeholder="faculty@university.edu"
                value={registerForm.email}
                onChange={(e) =>
                  setRegisterForm((prev) => ({ ...prev, email: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="password-policy-card dauth-policy-card">
            <div className="policy-heading">
              <PolicyBulbIcon />
              <span>PASSWORD POLICY</span>
            </div>
            <div className="policy-list">
              <div className={`policy-item ${signupPasswordPolicy.minLength ? 'met' : 'unmet'}`}>
                <PolicyCheckIcon met={signupPasswordPolicy.minLength} />
                <span>Minimum 10 characters</span>
              </div>
              <div className={`policy-item ${signupPasswordPolicy.symbolsNumbers ? 'met' : 'unmet'}`}>
                <PolicyCheckIcon met={signupPasswordPolicy.symbolsNumbers} />
                <span>Include symbols &amp; numbers</span>
              </div>
              <div className={`policy-item ${signupPasswordPolicy.noPersonal ? 'met' : 'unmet'}`}>
                <PolicyCheckIcon met={signupPasswordPolicy.noPersonal} />
                <span>No personal information</span>
              </div>
            </div>
          </div>

          <div className="input-group">
            <label>PASSWORD</label>
            <div className="input-wrapper plain-input-wrapper">
              <input
                type={showSignupPassword ? 'text' : 'password'}
                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                value={registerForm.password}
                onChange={(e) =>
                  setRegisterForm((prev) => ({ ...prev, password: e.target.value }))
                }
              />
              <button
                type="button"
                className="signup-eye-btn"
                aria-label={showSignupPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowSignupPassword((prev) => !prev)}
              >
                {showSignupPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div className="input-group">
            <label>CONFIRM PASSWORD</label>
            <div className="input-wrapper plain-input-wrapper">
              <input
                type={showSignupConfirmPassword ? 'text' : 'password'}
                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                value={registerForm.confirm_password}
                onChange={(e) =>
                  setRegisterForm((prev) => ({ ...prev, confirm_password: e.target.value }))
                }
              />
              <button
                type="button"
                className="signup-eye-btn"
                aria-label={showSignupConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                onClick={() => setShowSignupConfirmPassword((prev) => !prev)}
              >
                {showSignupConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <label className="checkbox-container">
            <input
              type="checkbox"
              checked={registerForm.terms_accepted}
              onChange={(e) =>
                setRegisterForm((prev) => ({ ...prev, terms_accepted: e.target.checked }))
              }
            />
            <span className="checkmark"></span>
            <span className="checkbox-label">
              I agree to the{' '}
              <button type="button" className="legal-inline-link" onClick={() => setActiveLegalDoc('terms')}>
                Terms of Service
              </button>{' '}
              and{' '}
              <button type="button" className="legal-inline-link" onClick={() => setActiveLegalDoc('privacy')}>
                Privacy Policy
              </button>.
            </span>
          </label>

          <button type="submit" className={`primary-btn signup-btn ${canRegister ? 'ready' : 'disabled'}`} disabled={!canRegister}>
            {loading ? 'Registering...' : <>Register <ArrowRightIcon /></>}
          </button>

          <div className="signup-footer-link">
            Already have a faculty account? <span onClick={() => setView('login')}>Log In</span>
          </div>
        </form>
      </DesktopAuthShell>

      <div className="auth-mobile-view content fade-in signup-content">
        <form className="card signup-card" onSubmit={handleSignupSubmit}>
          <div className="signup-header">
            <h1>Create {signupRole.label}<br />Account</h1>
            <p>Please enter your institutional details to begin.</p>
          </div>

          <div className="signup-role-selector" aria-label="Select account role">
            {AUTH_ACCOUNT_ROLES.map((role) => {
              const RoleIcon = role.icon;
              const isActive = selectedSignupRole === role.key;

              return (
                <button
                  type="button"
                  key={role.key}
                  className={`signup-role-tab ${isActive ? 'active' : ''}`}
                  onClick={() =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      account_role: role.key,
                      department_id: ['faculty', 'admin'].includes(role.key) ? prev.department_id : '',
                    }))
                  }
                >
                  <RoleIcon color={isActive ? 'var(--green)' : '#4e5a4f'} size="22" />
                  <span>{role.label}</span>
                </button>
              );
            })}
          </div>

          <div className="input-group">
            <label>FULL NAME</label>
            <div className="input-wrapper plain-input-wrapper">
              <input
                type="text"
                placeholder="Dr. Julian Vane"
                value={registerForm.full_name}
                onChange={(e) =>
                  setRegisterForm((prev) => ({ ...prev, full_name: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="input-group">
            <label>EMPLOYEE ID</label>
            <div className="input-wrapper plain-input-wrapper">
              <input
                type="text"
                placeholder="FAC-88920"
                value={registerForm.employee_id}
                onChange={(e) =>
                  setRegisterForm((prev) => ({ ...prev, employee_id: e.target.value }))
                }
              />
            </div>
          </div>

          {signupNeedsDepartment && (
            <div className="input-group">
              <label>DEPARTMENT</label>
              <div className="input-wrapper plain-input-wrapper select-wrapper">
                <select
                  value={registerForm.department_id}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({ ...prev, department_id: e.target.value }))
                  }
                >
                  <option value="" disabled>Select Department</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.department_name}
                    </option>
                  ))}
                </select>
                <div className="select-icon">
                  <ChevronDownIcon />
                </div>
              </div>
            </div>
          )}

          <div className="input-group">
            <label>EMAIL ADDRESS</label>
            <div className="input-wrapper plain-input-wrapper">
              <input
                type="email"
                placeholder="faculty@university.edu"
                value={registerForm.email}
                onChange={(e) =>
                  setRegisterForm((prev) => ({ ...prev, email: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="password-policy-card">
            <div className="policy-heading">
              <PolicyBulbIcon />
              <span>PASSWORD POLICY</span>
            </div>
            <div className="policy-list">
              <div className={`policy-item ${signupPasswordPolicy.minLength ? 'met' : 'unmet'}`}>
                <PolicyCheckIcon met={signupPasswordPolicy.minLength} />
                <span>Minimum 10 characters</span>
              </div>
              <div className={`policy-item ${signupPasswordPolicy.symbolsNumbers ? 'met' : 'unmet'}`}>
                <PolicyCheckIcon met={signupPasswordPolicy.symbolsNumbers} />
                <span>Include symbols &amp; numbers</span>
              </div>
              <div className={`policy-item ${signupPasswordPolicy.noPersonal ? 'met' : 'unmet'}`}>
                <PolicyCheckIcon met={signupPasswordPolicy.noPersonal} />
                <span>No personal information</span>
              </div>
            </div>
          </div>

          <div className="input-group">
            <label>PASSWORD</label>
            <div className="input-wrapper plain-input-wrapper">
              <input
                type={showSignupPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={registerForm.password}
                onChange={(e) =>
                  setRegisterForm((prev) => ({ ...prev, password: e.target.value }))
                }
              />
              <button
                type="button"
                className="signup-eye-btn"
                aria-label={showSignupPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowSignupPassword((prev) => !prev)}
              >
                {showSignupPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div className="input-group">
            <label>CONFIRM PASSWORD</label>
            <div className="input-wrapper plain-input-wrapper">
              <input
                type={showSignupConfirmPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={registerForm.confirm_password}
                onChange={(e) =>
                  setRegisterForm((prev) => ({ ...prev, confirm_password: e.target.value }))
                }
              />
              <button
                type="button"
                className="signup-eye-btn"
                aria-label={showSignupConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                onClick={() => setShowSignupConfirmPassword((prev) => !prev)}
              >
                {showSignupConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <label className="checkbox-container">
            <input
              type="checkbox"
              checked={registerForm.terms_accepted}
              onChange={(e) =>
                setRegisterForm((prev) => ({ ...prev, terms_accepted: e.target.checked }))
              }
            />
            <span className="checkmark"></span>
            <span className="checkbox-label">
              I agree to the{' '}
              <button type="button" className="legal-inline-link" onClick={() => setActiveLegalDoc('terms')}>
                Terms of Service
              </button>{' '}
              and{' '}
              <button type="button" className="legal-inline-link" onClick={() => setActiveLegalDoc('privacy')}>
                Privacy Policy
              </button>.
            </span>
          </label>

          <button type="submit" className={`primary-btn signup-btn ${canRegister ? 'ready' : 'disabled'}`} disabled={!canRegister}>
            {loading ? 'Registering...' : <>Register <ArrowRightIcon /></>}
          </button>

          <div className="signup-footer-link">
            Already have a faculty account? <span onClick={() => setView('login')}>Log In</span>
          </div>
        </form>

        <div className="signup-brand-footer">
          <div className="signup-footer-logo">
            <CapIcon color="white" />
          </div>
          <div className="footer-text signup-footer-text">
            <span className="footer-developed">DEVELOPED BY</span>
            <span className="footer-brand">ARCHONS</span>
          </div>
        </div>

      </div>

      <LegalDocumentModal
        activeLegalDoc={activeLegalDoc}
        onClose={() => setActiveLegalDoc(null)}
      />
    </>
  );
};

const PolicyBulbIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 21H15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M10 17H14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M8 10.2C8 7.85 9.8 6 12 6C14.2 6 16 7.85 16 10.2C16 11.74 15.18 12.78 14.34 13.65C13.72 14.28 13.2 14.86 13.08 16H10.92C10.8 14.86 10.28 14.28 9.66 13.65C8.82 12.78 8 11.74 8 10.2Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
  </svg>
);

const BottomNav = ({ active = 'home', setView }) => (
  <div className="bottom-nav">
    <div className={`nav-item ${active === 'home' ? 'active-nav-pill' : ''}`} onClick={() => setView && setView('dashboard')}>
      {active === 'home' ? (
        <div className="nav-pill-bg">
          <HomeNavIcon color="white" />
          <span>HOME</span>
        </div>
      ) : (
        <><HomeNavIcon color="var(--text-gray)" /><span>HOME</span></>
      )}
    </div>
    <div className={`nav-item ${active === 'status' ? 'active-nav-pill' : ''}`} onClick={() => setView && setView('status')}>
      {active === 'status' ? (
        <div className="nav-pill-bg">
          <StatusGraphIcon color="white" />
          <span>STATUS</span>
        </div>
      ) : (
        <><StatusGraphIcon color="var(--text-gray)" /><span>STATUS</span></>
      )}
    </div>
    <div className={`nav-item ${active === 'slips' ? 'active-nav-pill' : ''}`} onClick={() => setView && setView('locator-slip')}>
      {active === 'slips' ? (
        <div className="nav-pill-bg">
          <DocumentIcon color="white" width="24" height="24" />
          <span>SLIPS</span>
        </div>
      ) : (
        <><DocumentIcon color="var(--text-gray)" width="24" height="24" /><span>SLIPS</span></>
      )}
    </div>
    <div className={`nav-item ${active === 'map' ? 'active-nav-pill' : ''}`} onClick={() => setView && setView('map')}>
      {active === 'map' ? (
        <div className="nav-pill-bg">
          <MapFoldIcon color="white" width="24" height="24" />
          <span>MAP</span>
        </div>
      ) : (
        <><MapFoldIcon color="var(--text-gray)" width="24" height="24" /><span>MAP</span></>
      )}
    </div>
    <div className={`nav-item ${active === 'profile' ? 'active-nav-pill' : ''}`} onClick={() => setView && setView('profile')}>
      {active === 'profile' ? (
        <div className="nav-pill-bg">
          <ProfileNavIcon color="white" />
          <span>PROFILE</span>
        </div>
      ) : (
        <><ProfileNavIcon color="var(--text-gray)" /><span>PROFILE</span></>
      )}
    </div>
  </div>
);

const DashboardView = ({ setView, profileData }) => {
  const [facultyProfile, setFacultyProfile] = useState(null);
  const [recentLocatorSlips, setRecentLocatorSlips] = useState([]);

  useEffect(() => {
    const loadDashboardProfile = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
          },
        });
        const data = await response.json();

        if (response.ok) {
          setFacultyProfile(data.data);
        }
      } catch (error) {
        console.error('Failed to load dashboard profile:', error);
      }
    };

    loadDashboardProfile();
  }, []);

  useEffect(() => {
    const loadRecentLocatorSlips = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/locator-slips/my-slips`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
          },
        });
        const data = await response.json();

        if (response.ok) {
          setRecentLocatorSlips((data.data || []).slice(0, 3));
        }
      } catch (error) {
        console.error('Failed to load recent locator slips:', error);
      }
    };

    loadRecentLocatorSlips();
  }, []);

  const localHour = new Date().getHours();
  const greeting = localHour < 12
    ? 'Good morning'
    : localHour < 18
      ? 'Good afternoon'
      : 'Good evening';
  const registeredName = facultyProfile?.full_name || profileData.fullName || '';
  const firstName = registeredName
    .replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, '')
    .trim()
    .split(/\s+/)[0] || 'Professor';
  const departmentLabel = facultyProfile?.department_name || profileData.department || 'Faculty Department';

  return (
    <div className="dashboard-wrapper">
      <div className="content fade-in dash-content">

        <div className="dash-top-nav">
          <div className="dash-menu-left">
            <span className="dash-logo-text">EduRoute</span>
          </div>
          <div className="dash-avatar" onClick={() => setView('profile')} style={{ cursor: 'pointer' }}>
            <img src={profileData.image} alt="Faculty Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>

        <div className="dash-header">
          <p>{greeting}, Prof. {firstName}</p>
          <h1>Faculty Dashboard</h1>
          <div className="dept-pill">
            <CapIcon color="var(--green)" outline={true} /> {departmentLabel.toUpperCase()}
          </div>
        </div>

        <div className="action-grid">
          <div className="primary-action-card" onClick={() => setView('status')} style={{ cursor: 'pointer' }}>
            <div className="primary-action-bg-deco">
              <img src="/Camera Translucent Icon.svg" alt="Camera Decoration Layout" />
            </div>
            <div className="primary-icon-wrapper">
              <img src="/Camera Icon.svg" alt="Camera Icon" />
            </div>
            <h2>Verify Location</h2>
            <p>Instant location verification</p>
          </div>

          <div className="secondary-action-grid">
            <div className="secondary-action-card" onClick={() => setView('locator-slip')} style={{ cursor: 'pointer' }}>
              <div className="sec-icon-bg green-bg"><SlipIcon color="var(--green)" /></div>
              <h3>New Slip</h3>
              <p>Create locator</p>
            </div>
            <div className="secondary-action-card" onClick={() => setView('status')} style={{ cursor: 'pointer' }}>
              <div className="sec-icon-bg yellow-bg"><StatusGraphIcon color="#B88A00" /></div>
              <h3>Status</h3>
              <p>Track progress</p>
            </div>
          </div>
        </div>

        <div className="recent-activity-section">
          <div className="activity-header">
            <h3>Recent Activity</h3>
            <span className="see-all" onClick={() => setView('status')}>SEE ALL</span>
          </div>

          <div className="activity-list">
            {recentLocatorSlips.length === 0 && (
              <div className="activity-card">
                <div className="act-icon-bg act-gray-bg"><DocumentIcon color="var(--green)" /></div>
                <div className="act-details">
                  <h4>No locator slips yet</h4>
                  <p>Create your first locator slip to see activity here.</p>
                </div>
              </div>
            )}

            {recentLocatorSlips.map((slip) => {
              const displayStatus = getSlipDisplayStatus(slip);
              return (
                <div key={slip.id} className="activity-card" onClick={() => setView('status')} style={{ cursor: 'pointer' }}>
                  <div className={`act-icon-bg ${['approved', 'completed'].includes(displayStatus) ? 'act-green-bg' : 'act-gray-bg'} ${displayStatus === 'rejected' ? 'act-red-icon' : ''}`}>
                    {displayStatus === 'rejected'
                      ? <SlashedPersonIcon color="#FF4D4D" />
                      : <DocumentIcon color="var(--green)" />}
                  </div>
                  <div className="act-details">
                    <h4>{getSlipTitle(slip)}</h4>
                    <p>{slip.destination}</p>
                    <span className={`status-badge badge-${displayStatus}`}>{displayStatus.toUpperCase()}</span>
                  </div>
                  <span className="act-time">{formatActivityFiledTime(slip.created_at)}</span>
                </div>
              );
            })}
          </div>

          <div className="activity-list dashboard-static-activity">
            <div className="activity-card">
              <div className="act-icon-bg act-green-bg"><LocationPinIcon color="var(--green)" /></div>
              <div className="act-details">
                <h4>Research Symposium</h4>
                <p>External Visit • Manila Hotel</p>
                <span className="status-badge badge-approved">APPROVED</span>
              </div>
              <span className="act-time">10:45 AM</span>
            </div>

            <div className="activity-card">
              <div className="act-icon-bg act-gray-bg"><DocumentIcon color="var(--green)" /></div>
              <div className="act-details">
                <h4>Curriculum Workshop</h4>
                <p>Official Business • Main Library</p>
                <span className="status-badge badge-pending">PENDING</span>
              </div>
              <span className="act-time">Yesterday</span>
            </div>

            <div className="activity-card">
              <div className="act-icon-bg act-gray-bg act-red-icon"><SlashedPersonIcon color="#FF4D4D" /></div>
              <div className="act-details">
                <h4>Personal Leave</h4>
                <p>Emergency • Out of Office</p>
                <span className="status-badge badge-rejected">REJECTED</span>
              </div>
              <span className="act-time">Oct 24</span>
            </div>
          </div>
        </div>

        <div className="map-card-container">
          <div className="map-bg-wrapper">
            <img src="/Map Image.png" alt="Map Background" className="map-dummy-texture" />
          </div>
          <div className="map-floating-element" onClick={() => setView('map')} style={{ cursor: 'pointer' }}>
            <MapFoldIcon color="var(--green)" width="32" height="32" />
            <span>View Live Campus Map</span>
          </div>
        </div>

      </div>
      <BottomNav active="home" setView={setView} />
    </div>
  );
};

const LOCATOR_PURPOSE_OPTIONS = [
  'Official Meeting/Conference',
  'Submission/Retrieval of Documents',
  'Coordination/Consultation',
  'Field Inspection/Monitoring',
  'Others',
];

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'approved', label: 'Approved' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'completed', label: 'Completed' },
  { key: 'pending', label: 'Pending' },
  { key: 'rejected', label: 'Rejected' },
];

const LOCATOR_SLIP_CANCEL_REASONS = [
  { value: 'change_of_schedule', label: 'Change of schedule' },
  { value: 'trip_no_longer_needed', label: 'Trip no longer needed' },
  { value: 'meeting_event_cancelled', label: 'Meeting/event cancelled' },
  { value: 'incorrect_locator_slip_details', label: 'Incorrect locator slip details' },
];

const getCancellationReasonLabel = (reasonValue) => {
  if (!reasonValue) return 'Cancelled';
  const matchedReason = LOCATOR_SLIP_CANCEL_REASONS.find((reason) => reason.value === reasonValue);
  return matchedReason?.label || String(reasonValue);
};

const getSlipDisplayStatus = (slip) => {
  const locatorSlipStatus = String(slip?.status || 'pending').toLowerCase();
  if (locatorSlipStatus === 'pending') {
    return 'pending';
  }
  if (locatorSlipStatus === 'rejected') {
    return 'rejected';
  }
  if (locatorSlipStatus === 'cancelled') {
    return 'cancelled';
  }
  if (locatorSlipStatus === 'completed') {
    return 'completed';
  }
  if (locatorSlipStatus === 'verified') {
    return 'approved';
  }
  return locatorSlipStatus === 'approved' ? 'approved' : 'pending';
};

const getCssuValidationStatus = (slip) => {
  const value = String(slip?.cssu_validation_status || slip?.cssuValidationStatus || '').toLowerCase();
  if (value === 'validated') return 'allowed';
  if (['allowed', 'denied', 'flagged'].includes(value)) return value;
  return 'pending';
};

const getLocatorSlipActionState = (slip, currentTrip = null) => {
  const displayStatus = getSlipDisplayStatus(slip);
  const cssuValidationStatus = getCssuValidationStatus(slip);
  const tripStatus = String(currentTrip?.status || slip?.trip_status || slip?.tripStatus || '').toLowerCase();
  const isCompleted = displayStatus === 'completed';
  const hasTripInProgress = ['active', 'arrived', 'returning'].includes(tripStatus);

  if (isCompleted) {
    return {
      showQr: false,
      viewRoute: false,
      startTrip: false,
      viewUploadedPhoto: false,
      showTripSummaryButton: false,
      helperText: 'This locator slip has been completed.',
      cssuValidationStatus,
    };
  }

  if (hasTripInProgress) {
    return {
      showQr: false,
      viewRoute: false,
      startTrip: false,
      viewUploadedPhoto: true,
      showTripSummaryButton: false,
      helperText: '',
      cssuValidationStatus,
    };
  }

  if (displayStatus === 'approved') {
    if (cssuValidationStatus === 'allowed') {
      return {
        showQr: true,
        viewRoute: true,
        startTrip: true,
        viewUploadedPhoto: true,
        showTripSummaryButton: false,
        helperText: 'CSSU validated. You can now access maps.',
        cssuValidationStatus,
      };
    }

    if (cssuValidationStatus === 'denied') {
      return {
        showQr: true,
        viewRoute: false,
        startTrip: false,
        viewUploadedPhoto: true,
        showTripSummaryButton: false,
        helperText: 'Exit denied by CSSU.',
        cssuValidationStatus,
      };
    }

    if (cssuValidationStatus === 'flagged') {
      return {
        showQr: true,
        viewRoute: false,
        startTrip: false,
        viewUploadedPhoto: true,
        showTripSummaryButton: false,
        helperText: 'Exit flagged by CSSU. Please contact CSSU or HRMU.',
        cssuValidationStatus,
      };
    }

    return {
      showQr: true,
      viewRoute: false,
      startTrip: false,
      viewUploadedPhoto: true,
      showTripSummaryButton: false,
      helperText: 'Waiting for CSSU exit validation.',
      cssuValidationStatus,
    };
  }

  return {
    showQr: false,
    viewRoute: false,
    startTrip: false,
    viewUploadedPhoto: false,
    showTripSummaryButton: false,
    helperText: '',
    cssuValidationStatus,
  };
};

const formatStatusDate = (value) => {
  if (!value) return 'No date set';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'No date set';

  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatStatusDateTime = (value) => {
  if (!value) return 'No date set';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'No date set';

  return date.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const formatDistanceLabel = (meters) => {
  const value = Number(meters);
  if (!Number.isFinite(value)) return '0 km';
  return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`;
};

const formatActivityFiledTime = (value) => {
  if (!value) return 'No time';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'No time';

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const getSlipTitle = (slip) => {
  if (slip.custom_purpose) return slip.custom_purpose;
  if (slip.purpose_of_travel === 'Others') return 'Other Official Travel';
  return slip.purpose_of_travel || 'Locator Slip';
};

const toDateTimeLocalValue = (date) => {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
};

const LocatorSlipView = ({ setView, profileData, setSelectedStatusSlip }) => {
  const [facultyProfile, setFacultyProfile] = useState(null);
  const [locatorSlipLoading, setLocatorSlipLoading] = useState(false);
  const [locatorSlipErrors, setLocatorSlipErrors] = useState({});
  const [currentDateTimeLocal, setCurrentDateTimeLocal] = useState(() => toDateTimeLocalValue(new Date()));
  const [locatorSlipForm, setLocatorSlipForm] = useState({
    destination: '',
    purpose_of_travel: '',
    custom_purpose: '',
    departure_datetime: '',
    expected_return_datetime: '',
    additional_remarks: '',
    is_urgent: false,
  });

  const locatorSlipValidation = useMemo(() => {
    const errors = {};
    const now = new Date(currentDateTimeLocal);
    const departureTime = locatorSlipForm.departure_datetime
      ? new Date(locatorSlipForm.departure_datetime).getTime()
      : null;
    const returnTime = locatorSlipForm.expected_return_datetime
      ? new Date(locatorSlipForm.expected_return_datetime).getTime()
      : null;

    if (!locatorSlipForm.destination.trim()) {
      errors.destination = 'Destination is required.';
    }

    if (!locatorSlipForm.purpose_of_travel) {
      errors.purpose_of_travel = 'Purpose of travel is required.';
    }

    if (locatorSlipForm.purpose_of_travel === 'Others' && !locatorSlipForm.custom_purpose.trim()) {
      errors.custom_purpose = 'Please specify your purpose.';
    }

    if (!locatorSlipForm.departure_datetime) {
      errors.departure_datetime = 'Departure date and time is required.';
    } else if (Number.isNaN(departureTime)) {
      errors.departure_datetime = 'Departure date and time is invalid.';
    } else if (departureTime < now.getTime()) {
      errors.departure_datetime = 'Unallowed time input: departure time has already passed. Please choose a departure time later than the current time.';
    }

    if (!locatorSlipForm.expected_return_datetime) {
      errors.expected_return_datetime = 'Expected return date and time is required.';
    } else if (Number.isNaN(returnTime)) {
      errors.expected_return_datetime = 'Expected return date and time is invalid.';
    } else if (returnTime < now.getTime()) {
      errors.expected_return_datetime = 'Unallowed time input: expected return time has already passed. Please choose a return time later than the current time.';
    } else if (
      locatorSlipForm.departure_datetime &&
      !Number.isNaN(departureTime) &&
      returnTime <= departureTime
    ) {
      errors.expected_return_datetime = 'Unallowed time input: expected return is earlier than or equal to the departure time. Please choose a return time after departure.';
    }

    if (locatorSlipForm.additional_remarks.length > 1000) {
      errors.additional_remarks = 'Additional remarks must not exceed 1000 characters.';
    }

    return errors;
  }, [currentDateTimeLocal, locatorSlipForm]);

  const canSubmitLocatorSlip =
    facultyProfile &&
    Object.keys(locatorSlipValidation).length === 0 &&
    !locatorSlipLoading;

  const getAuthHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
  });

  const formatApiError = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(formatApiError).filter(Boolean).join('\n');
    if (typeof value === 'object') {
      return Object.values(value).map(formatApiError).filter(Boolean).join('\n');
    }
    return String(value);
  };

  const fetchLocatorSlipJson = async (endpoint, options = {}) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...(options.headers || {}),
      },
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(formatApiError(data.errors) || formatApiError(data.message) || 'Request failed.');
    }

    return data;
  };

  useEffect(() => {
    const loadFacultyProfile = async () => {
      setLocatorSlipLoading(true);
      try {
        const data = await fetchLocatorSlipJson('/api/locator-slips/faculty-profile');
        setFacultyProfile(data.data);
      } catch (error) {
        alert(error.message);
      } finally {
        setLocatorSlipLoading(false);
      }
    };

    loadFacultyProfile();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTimeLocal(toDateTimeLocalValue(new Date()));
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  const updateLocatorSlipField = (field, value) => {
    setLocatorSlipForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'purpose_of_travel' && value !== 'Others' ? { custom_purpose: '' } : {}),
    }));
    setLocatorSlipErrors((prev) => ({
      ...prev,
      [field]: undefined,
      ...(field === 'departure_datetime' ? { expected_return_datetime: undefined } : {}),
    }));
  };

  const handleLocatorSlipSubmit = async () => {
    setLocatorSlipErrors(locatorSlipValidation);

    if (!canSubmitLocatorSlip) return;

    setLocatorSlipLoading(true);
    try {
      const payload = {
        ...locatorSlipForm,
        departure_datetime: locatorSlipForm.departure_datetime ? new Date(locatorSlipForm.departure_datetime).toISOString() : '',
        expected_return_datetime: locatorSlipForm.expected_return_datetime ? new Date(locatorSlipForm.expected_return_datetime).toISOString() : '',
      };

      const data = await fetchLocatorSlipJson('/api/locator-slips', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      alert(data.message);
      if (data.data) {
        setSelectedStatusSlip?.(data.data);
      }
      localStorage.setItem('edurouteLastView', 'status');
      setView('status');
    } catch (error) {
      alert(error.message);
    } finally {
      setLocatorSlipLoading(false);
    }
  };

  const visibleLocatorSlipErrors = {
    ...locatorSlipErrors,
    ...locatorSlipValidation,
  };

  const timeWarningFields = new Set(['departure_datetime', 'expected_return_datetime']);
  const locatorSlipTimeWarnings = [
    visibleLocatorSlipErrors.departure_datetime && locatorSlipForm.departure_datetime
      ? visibleLocatorSlipErrors.departure_datetime
      : null,
    visibleLocatorSlipErrors.expected_return_datetime && locatorSlipForm.expected_return_datetime
      ? visibleLocatorSlipErrors.expected_return_datetime
      : null,
  ].filter(Boolean);

  const renderLocatorSlipMessage = (field) => {
    const message = visibleLocatorSlipErrors[field];

    if (!message) return null;

    return (
      <span className={timeWarningFields.has(field) ? 'field-warning' : 'field-error'}>
        {timeWarningFields.has(field) && <span className="field-warning-icon">!</span>}
        {message}
      </span>
    );
  };

  return (
    <div className="dashboard-wrapper">
      <div className="content fade-in dash-content slip-content">

        <div className="slip-top-nav">
          <div className="slip-nav-left" onClick={() => setView('dashboard')}>
            <BackArrowIcon color="var(--green)" />
            <span className="dash-logo-text">EduRoute</span>
          </div>
          <div className="dash-avatar" onClick={() => setView('profile')} style={{ cursor: 'pointer' }}>
            <img src={profileData.image} alt="Faculty Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>

        <div className="slip-page-header">
          <span className="slip-subtitle">INTERNAL LOGISTICS</span>
          <h1>Create Locator Slip</h1>
          <p>Please document your destination and expected return for institutional coordination.</p>
        </div>

        <div className="slip-section-card credentials-card">
          <div className="section-title-row">
            <div className="section-icon green-circle-icon">
              <GlobeIcon color="white" />
            </div>
            <h3>Faculty Credentials</h3>
          </div>
          <div className="credential-field">
            <span className="cred-label">FULL NAME</span>
            <span className="cred-value">{facultyProfile?.full_name || 'Loading...'}</span>
          </div>
          <div className="credential-field">
            <span className="cred-label">EMPLOYEE ID</span>
            <span className="cred-value">{facultyProfile?.employee_id || 'Loading...'}</span>
          </div>
          <div className="credential-field">
            <span className="cred-label">DEPARTMENT</span>
            <span className="cred-value">{facultyProfile?.department_name || 'Loading...'}</span>
          </div>
        </div>

        <div className="slip-section-card trip-card">
          <div className="section-title-row">
            <div className="section-icon green-circle-icon">
              <ClipboardCheckIcon color="white" />
            </div>
            <h3>Trip Details</h3>
          </div>

          <div className="trip-field">
            <label>Destination</label>
            <div className="trip-input-wrapper">
              <LocationPinIcon color="var(--text-light)" />
              <input
                type="text"
                placeholder="Where are you heading?"
                value={locatorSlipForm.destination}
                onChange={(e) => updateLocatorSlipField('destination', e.target.value)}
              />
            </div>
            {renderLocatorSlipMessage('destination')}
          </div>

          <div className="trip-field">
            <label>Purpose of Travel</label>
            <div className="trip-input-wrapper trip-select-wrapper">
              <DocumentIcon color="var(--text-light)" width="18" height="18" />
              <select
                value={locatorSlipForm.purpose_of_travel}
                onChange={(e) => updateLocatorSlipField('purpose_of_travel', e.target.value)}
              >
                <option value="" disabled hidden>Select purpose...</option>
                {LOCATOR_PURPOSE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <div className="select-icon trip-chevron">
                <ChevronDownIcon />
              </div>
            </div>
            {renderLocatorSlipMessage('purpose_of_travel')}
            {locatorSlipForm.purpose_of_travel === 'Others' && (
              <div className="trip-input-wrapper others-input" style={{ marginTop: '12px' }}>
                <DocumentIcon color="var(--text-light)" width="18" height="18" />
                <input
                  type="text"
                  placeholder="Please specify your purpose..."
                  value={locatorSlipForm.custom_purpose}
                  onChange={(e) => updateLocatorSlipField('custom_purpose', e.target.value)}
                />
              </div>
            )}
            {renderLocatorSlipMessage('custom_purpose')}
          </div>

          <div className="trip-field urgent-toggle-field">
            <div>
              <label>Urgent Matter</label>
              <p>Mark this request urgent if it needs priority dean review.</p>
            </div>
            <button
              type="button"
              className={`urgent-toggle ${locatorSlipForm.is_urgent ? 'active' : ''}`}
              aria-pressed={locatorSlipForm.is_urgent}
              onClick={() => updateLocatorSlipField('is_urgent', !locatorSlipForm.is_urgent)}
            >
              <span />
            </button>
          </div>

          <div className="trip-field">
            <label>Departure</label>
            <div className={`trip-input-wrapper ${visibleLocatorSlipErrors.departure_datetime && locatorSlipForm.departure_datetime ? 'has-warning' : ''}`}>
              <ClockIcon color="var(--text-light)" />
              <input
                type="datetime-local"
                className="datetime-input"
                value={locatorSlipForm.departure_datetime}
                onChange={(e) => updateLocatorSlipField('departure_datetime', e.target.value)}
              />
            </div>
            {renderLocatorSlipMessage('departure_datetime')}
          </div>

          <div className="trip-field">
            <label>Expected Return</label>
            <div className={`trip-input-wrapper ${visibleLocatorSlipErrors.expected_return_datetime && locatorSlipForm.expected_return_datetime ? 'has-warning' : ''}`}>
              <RefreshClockIcon color="var(--text-light)" />
              <input
                type="datetime-local"
                className="datetime-input"
                value={locatorSlipForm.expected_return_datetime}
                onChange={(e) => updateLocatorSlipField('expected_return_datetime', e.target.value)}
              />
            </div>
            {renderLocatorSlipMessage('expected_return_datetime')}
          </div>

          <div className="trip-field">
            <label>Additional Remarks (Optional)</label>
            <div className="trip-textarea-wrapper">
              <textarea
                placeholder="Any specific details or contact info during the trip..."
                rows={3}
                value={locatorSlipForm.additional_remarks}
                onChange={(e) => updateLocatorSlipField('additional_remarks', e.target.value)}
              />
            </div>
            {renderLocatorSlipMessage('additional_remarks')}
          </div>
        </div>

        {locatorSlipTimeWarnings.length > 0 && (
          <div className="locator-time-warning-card" role="alert">
            <div className="locator-time-warning-icon">!</div>
            <div>
              <h4>Time check needed</h4>
              {locatorSlipTimeWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          className="primary-btn slip-submit-btn"
          disabled={!canSubmitLocatorSlip}
          onClick={handleLocatorSlipSubmit}
        >
          <SendIcon /> {locatorSlipLoading ? 'SUBMITTING...' : 'SUBMIT REQUEST'}
        </button>

        <button type="button" className="slip-cancel-btn" onClick={() => setView('dashboard')}>
          Cancel
        </button>

      </div>
      <BottomNav active="slips" setView={setView} />
    </div>
  );
};

const StatusView = ({ setView, profileData, setSelectedStatusSlip }) => {
  const [activeFilter, setActiveFilter] = useState('all');
  const [locatorSlips, setLocatorSlips] = useState([]);
  const [statusLoading, setStatusLoading] = useState(false);

  const fetchStatusSlips = async (filter) => {
    setStatusLoading(true);

    try {
      const query = filter === 'all' ? '' : `?status=${encodeURIComponent(filter)}`;
      const response = await fetch(`${API_BASE_URL}/api/locator-slips/my-slips${query}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(formatApiError(data.errors) || formatApiError(data.message) || 'Failed to load locator slips.');
      }

      setLocatorSlips(data.data || []);
    } catch (error) {
      alert(error.message);
    } finally {
      setStatusLoading(false);
    }
  };

  const formatApiError = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(formatApiError).filter(Boolean).join('\n');
    if (typeof value === 'object') {
      return Object.values(value).map(formatApiError).filter(Boolean).join('\n');
    }
    return String(value);
  };

  useEffect(() => {
    fetchStatusSlips(activeFilter);
  }, [activeFilter]);

  return (
    <div className="dashboard-wrapper status-wrapper">
      <div className="content fade-in dash-content status-content">
        <div className="status-sticky-header">
          <div className="status-top-nav">
            <div className="slip-nav-left" onClick={() => setView('dashboard')}>
              <BackArrowIcon color="var(--green)" />
              <span className="dash-logo-text">EduRoute</span>
            </div>
            <div className="dash-avatar" onClick={() => setView('profile')} style={{ cursor: 'pointer' }}>
              <img src={profileData.image} alt="Faculty Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </div>

          <div className="status-filter-row">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={`status-filter-chip ${activeFilter === filter.key ? 'active' : ''}`}
                onClick={() => setActiveFilter(filter.key)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="status-slip-list">
          {statusLoading && <div className="status-empty-card">Loading locator slips...</div>}

          {!statusLoading && locatorSlips.length === 0 && (
            <div className="status-empty-card">
              No {activeFilter === 'all' ? '' : activeFilter} locator slips found.
            </div>
          )}

          {!statusLoading && locatorSlips.map((slip) => {
            const displayStatus = getSlipDisplayStatus(slip);
            return (
              <button
                key={slip.id}
                type="button"
                className={`status-slip-card ${displayStatus}`}
                onClick={() => {
                  if (slip.status !== 'approved') {
                    localStorage.removeItem('edurouteVerifySlipId');
                  }
                  localStorage.setItem('edurouteLastView', 'locator-slip-detail');
                  setSelectedStatusSlip(slip);
                  setView('locator-slip-detail');
                }}
              >
                <div className="status-slip-header">
                  <h3>{getSlipTitle(slip)}</h3>
                  <span className={`status-badge badge-${displayStatus}`}>{displayStatus}</span>
                </div>

                <div className="status-slip-meta">
                  <div className="status-slip-row">
                    <GlobeSmIcon color="var(--text-gray)" />
                    <span>{slip.destination}</span>
                  </div>
                  <div className="status-slip-row">
                    <ClockIcon color="var(--text-gray)" />
                    <span>Departure: {formatStatusDateTime(slip.departure_datetime)}</span>
                  </div>
                  <div className="status-slip-row">
                    <RefreshClockIcon color="var(--text-gray)" />
                    <span>Expected Return: {formatStatusDateTime(slip.expected_return_datetime)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <BottomNav active="status" setView={setView} />
    </div>
  );
};

const LocatorSlipDetailView = ({ setView, profileData, selectedSlip }) => {
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showCancelReasonModal, setShowCancelReasonModal] = useState(false);
  const [selectedCancelReason, setSelectedCancelReason] = useState(LOCATOR_SLIP_CANCEL_REASONS[0].value);
  const [locationVerification, setLocationVerification] = useState(null);
  const [showLocationProof, setShowLocationProof] = useState(false);
  const [proofCompliance, setProofCompliance] = useState(null);
  const [showProofCompliance, setShowProofCompliance] = useState(false);
  const [completedTripSummary, setCompletedTripSummary] = useState(null);
  const [showTripSummary, setShowTripSummary] = useState(false);
  const [tripSummaryLoading, setTripSummaryLoading] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const slip = selectedSlip;

  useEffect(() => {
    if (!slip) {
      setView('status');
    }
  }, [slip, setView]);

  useEffect(() => {
    setShowLocationProof(false);
    setShowProofCompliance(false);
    setShowTripSummary(false);
    setShowCancelReasonModal(false);
    setSelectedCancelReason(LOCATOR_SLIP_CANCEL_REASONS[0].value);
  }, [slip?.id]);

  useEffect(() => {
    if (!slip || !['approved', 'verified', 'completed'].includes(String(slip.status || '').toLowerCase())) {
      setLocationVerification(null);
      setProofCompliance(null);
      setShowLocationProof(false);
      setShowProofCompliance(false);
      setCompletedTripSummary(null);
      setShowTripSummary(false);
      return;
    }

    const fetchLocationVerification = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/locator-slips/${slip.id}/location-verification`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
          },
        });
        const data = await response.json();

        if (!response.ok) return;

        setLocationVerification(data.data?.verification || null);
      } catch (error) {
        console.error('Failed to fetch location verification:', error);
      }
    };

    fetchLocationVerification();
  }, [slip]);

  useEffect(() => {
    if (!slip?.trip_id) {
      setProofCompliance(null);
      setShowProofCompliance(false);
      return;
    }

    let cancelled = false;

    const loadProofCompliance = async () => {
      try {
        const proof = await getFacultyProofOfCompliance(slip.trip_id);
        if (!cancelled) {
          setProofCompliance(proof || null);
        }
      } catch (error) {
        if (!cancelled) {
          setProofCompliance(null);
          console.error('Failed to load proof of compliance:', error);
        }
      }
    };

    loadProofCompliance();

    return () => {
      cancelled = true;
    };
  }, [slip?.trip_id]);

  useEffect(() => {
    if (!slip || getSlipDisplayStatus(slip) !== 'completed' || !slip.trip_id) {
      return;
    }

    let cancelled = false;

    const loadCompletedSummary = async () => {
      setTripSummaryLoading(true);
      try {
        const summary = await getFacultyTripSummary(slip.trip_id);
        if (!cancelled) {
          setCompletedTripSummary(summary);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load completed trip summary:', error);
        }
      } finally {
        if (!cancelled) {
          setTripSummaryLoading(false);
        }
      }
    };

    loadCompletedSummary();

    return () => {
      cancelled = true;
    };
  }, [slip]);

  if (!slip) return null;

  const isPending = slip.status === 'pending';
  const isCompleted = getSlipDisplayStatus(slip) === 'completed';
  const isApproved = ['approved', 'verified'].includes(String(slip.status || '').toLowerCase()) && !isCompleted;
  const isRejected = slip.status === 'rejected';
  const isCancelled = slip.status === 'cancelled';
  const actionState = getLocatorSlipActionState(slip, slip.currentTrip || null);
  const cssuValidationStatus = getCssuValidationStatus(slip);
  const canShowQrCode = actionState.showQr && Boolean(slip.locator_slip_code);
  const title = isPending
    ? 'Verification in'
    : isCompleted
      ? 'Trip'
      : (isApproved || isRejected || isCancelled)
        ? 'Verification'
        : `${slip.status.charAt(0).toUpperCase()}${slip.status.slice(1)}`;
  const referralId = `FAC-${String(slip.id).slice(0, 8).toUpperCase()}`;

  const openTripRoute = async () => {
    localStorage.setItem('edurouteMapSlipId', slip.id);
    localStorage.setItem('edurouteLastView', 'map');
    setView('map');
  };

  const cancelRequest = async () => {
    if (!isPending || cancelLoading) return;
    const reasonLabel = getCancellationReasonLabel(selectedCancelReason);

    setCancelLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/locator-slips/${slip.id}/cancel`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({ cancellation_reason: selectedCancelReason }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to cancel locator slip.');
      }

      alert(`${data.message || 'Locator slip request cancelled successfully.'} Reason: ${reasonLabel}.`);
      setShowCancelReasonModal(false);
      setView('status');
    } catch (error) {
      alert(error.message);
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="dashboard-wrapper submitted-wrapper">
      <div className="content fade-in dash-content">
        <div className="slip-top-nav">
          <div className="slip-nav-left" onClick={() => setView('status')}>
            <BackArrowIcon color="var(--green)" />
            <span className="dash-logo-text">EduRoute</span>
          </div>
          <div className="dash-avatar" onClick={() => setView('profile')} style={{ cursor: 'pointer' }}>
            <img src={profileData.image} alt="Faculty Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>

        <div className="submitted-graphic-container">
          <div className={`graphic-circle-dashed ${isApproved ? 'approved' : ''} ${isRejected ? 'rejected' : ''}`}>
            <div className="graphic-circle-solid">
              {isApproved && <CheckCircleSolidIcon color="var(--green)" size="66" />}
              {isRejected && <ExclamationCircleIcon color="#c9191f" size="74" />}
              {!isApproved && !isRejected && <HourglassIcon color="var(--green)" />}
            </div>
            <div className="graphic-shield-badge">
              <ShieldCheckSmallIcon color="white" />
            </div>
          </div>
        </div>

        <div className="submitted-status-text">
          <div className={`status-pill-yellow status-pill-${slip.status}`}>
            STATUS: {isPending ? 'PENDING APPROVAL' : isCompleted ? 'COMPLETED' : isApproved ? 'APPROVED' : slip.status.toUpperCase()}
          </div>
          <h2>
            {title}{' '}
            {isPending && <span className="text-green">Progress</span>}
            {isApproved && <span className="text-green">Approved</span>}
            {isCompleted && <span className="text-green">Completed</span>}
            {isRejected && <span className="text-red">Rejected</span>}
            {isCancelled && <span className="text-red">Cancelled</span>}
          </h2>
          <p>
            {isPending
              ? 'Your request is being reviewed. The EduRoute administration is currently verifying your faculty credentials.'
              : isCompleted
                ? 'Your approved trip was successfully completed and the generated trip summary is ready to view.'
                : isApproved
                  ? cssuValidationStatus === 'allowed'
                    ? 'Your request has been reviewed, approved, and cleared by CSSU. You may now view your route and start the trip.'
                    : 'Your request has been reviewed and approved by the dean. CSSU exit validation is still required before you can start the trip.'
                  : isRejected
                    ? 'Your request has been reviewed and rejected. You may submit a corrected locator slip request.'
                    : isCancelled
                      ? 'This locator slip was cancelled by the faculty user before approval.'
                    : `This locator slip request is currently marked as ${slip.status}.`}
          </p>
          {isRejected && slip.additional_remarks && (
            <div className="submitted-reason-card">
              <span>REJECTION REASON</span>
              <strong>{slip.additional_remarks}</strong>
            </div>
          )}
          {isApproved && actionState.helperText && (
            <p className="trip-search-state" style={{ marginTop: '0.75rem' }}>
              {actionState.helperText}
              {cssuValidationStatus === 'pending' ? ' CSSU must allow exit before you can start this trip.' : ''}
            </p>
          )}
        </div>

        {(isPending || isApproved || isCompleted || isRejected || isCancelled) && (
          <div className="progress-bar-container">
            <div className={`progress-track ${(isApproved || isCompleted) ? 'approved' : ''} ${(isRejected || isCancelled) ? 'rejected' : ''}`}>
              <div className="progress-fill"></div>
            </div>
            <div className="progress-points">
              <div className="progress-point active">
                <div className="point-dot green-dot-solid"></div>
                <span className="point-label">APPLIED</span>
              </div>
              <div className="progress-point current">
                <div className="point-icon-wrapper yellow-bg">
                  <ProgressReviewIcon color="var(--text-dark)" />
                </div>
                <span className="point-label green-label">REVIEW</span>
              </div>
              <div className={`progress-point ${(isApproved || isCompleted || isRejected || isCancelled) ? 'active' : 'pending'}`}>
                <div className={`point-dot ${(isApproved || isCompleted || isRejected || isCancelled) ? 'green-dot-solid' : 'grey-dot-solid'}`}></div>
                <span className={`point-label ${(isApproved || isCompleted) ? 'green-label' : ''} ${(isRejected || isCancelled) ? 'red-label' : ''}`}>
                  {(isRejected || isCancelled) ? 'INACTIVE' : 'ACTIVE'}
                </span>
              </div>
              {isCompleted && (
                <div className="progress-point active">
                  <div className="point-dot green-dot-solid"></div>
                  <span className="point-label green-label">COMPLETED</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="info-cards-container">
          <div className="info-card">
            <div className="info-icon green-light-bg">
              <FilledClockIcon color="var(--green)" />
            </div>
            <div className="info-text">
              <h4>{getSlipTitle(slip)}</h4>
              <p>{slip.destination} • {formatStatusDate(slip.departure_datetime)}</p>
            </div>
          </div>

          <div className="info-card">
            <div className="info-icon yellow-light-bg">
              <HelpIcon color="#B88A00" />
            </div>
            <div className="info-text">
              <h4>Need Help?</h4>
              <p>Contact support at admin.eduroute.system@gmail.com</p>
            </div>
          </div>
        </div>

        {isPending && (
          <button className="cancel-request-btn" onClick={() => setShowCancelReasonModal(true)} disabled={cancelLoading}>
            {cancelLoading ? 'CANCELLING...' : 'CANCEL REQUEST'}
          </button>
        )}

        {slip.status === 'cancelled' && slip.cancellation_reason && (
          <div className="cancel-reason-card">
            <span>CANCELLATION REASON</span>
            <strong>{getCancellationReasonLabel(slip.cancellation_reason)}</strong>
          </div>
        )}

        {(isApproved || isCompleted) && (
          <div className="approved-detail-actions">
            {actionState.viewRoute && (
              <button
                type="button"
                className="approved-view-route-btn"
                onClick={openTripRoute}
              >
                {tripSummaryLoading ? 'LOADING ROUTE...' : 'VIEW ROUTE'}
              </button>
            )}
            {!isCompleted && actionState.viewUploadedPhoto && locationVerification?.image_url && (
              <button
                type="button"
                className="approved-view-proof-btn"
                onClick={() => setShowLocationProof((current) => !current)}
              >
                {showLocationProof ? 'HIDE UPLOADED LOCATION' : 'VIEW UPLOADED LOCATION'}
              </button>
            )}
            {canShowQrCode && (
              <button
                type="button"
                className="approved-view-proof-btn"
                onClick={() => setShowQrCode(true)}
              >
                SHOW QR CODE
              </button>
            )}
            {isCompleted && locationVerification?.image_url && (
              <button
                type="button"
                className="approved-view-proof-btn"
                onClick={() => setShowLocationProof((current) => !current)}
              >
                {showLocationProof ? 'HIDE PROOF OF ARRIVAL' : 'VIEW PROOF OF ARRIVAL'}
              </button>
            )}
            {isCompleted && proofCompliance && (
              <button
                type="button"
                className="approved-view-proof-btn"
                onClick={() => setShowProofCompliance((current) => !current)}
              >
                {showProofCompliance ? 'HIDE PROOF OF COMPLIANCE' : 'VIEW PROOF OF COMPLIANCE'}
              </button>
            )}
            {isCompleted && (completedTripSummary?.summary || tripSummaryLoading) && (
              <button
                type="button"
                className="approved-view-proof-btn"
                onClick={() => setShowTripSummary((current) => !current)}
                disabled={tripSummaryLoading && !completedTripSummary?.summary}
              >
                {tripSummaryLoading && !completedTripSummary?.summary
                  ? 'LOADING TRIP SUMMARY...'
                  : showTripSummary
                    ? 'HIDE TRIP SUMMARY'
                    : 'VIEW TRIP SUMMARY'}
              </button>
            )}
          </div>
        )}

        {((isApproved && actionState.viewUploadedPhoto) || isCompleted) && showLocationProof && locationVerification?.image_url && (
          <div className="location-proof-card">
            <span className="location-proof-kicker">PROOF OF ARRIVAL</span>
            <h3>{locationVerification.target_location || slip.destination}</h3>
            <p>
              Uploaded {formatStatusDate(locationVerification.created_at)} for this approved locator slip.
            </p>
            <img src={locationVerification.image_url} alt="Uploaded proof of arrival" />
          </div>
        )}

        {isCompleted && showProofCompliance && proofCompliance && (
          <div className="location-proof-card compliance-proof-card">
            <span className="location-proof-kicker">PROOF OF COMPLIANCE</span>
            <h3>{proofCompliance.focalPersonName || 'Focal Person'}</h3>
            <p>
              Submitted {formatStatusDate(proofCompliance.submittedAt)} for this completed trip.
            </p>
            <ProofOfCompliancePreview
              proof={proofCompliance}
              title="Completed Trip Compliance"
              showStatus={false}
              showFullCard={false}
              showArrivalPhoto={false}
            />
          </div>
        )}

        {isCompleted && showTripSummary && completedTripSummary?.summary && (
          <div className="location-proof-card trip-summary-status-card">
            <span className="location-proof-kicker">TRIP SUMMARY</span>
            <h3>{completedTripSummary.locatorSlip?.destination || slip.destination}</h3>
            <div className="trip-summary-status-grid">
              <div><span>Locator Slip Departure</span><strong>{formatStatusDateTime(completedTripSummary.summary.departureTime)}</strong></div>
              <div><span>Actual Trip Start</span><strong>{formatStatusDateTime(completedTripSummary.summary.actualStartTripTime)}</strong></div>
              <div><span>Estimated Return</span><strong>{formatStatusDateTime(completedTripSummary.summary.estimatedReturnTime)}</strong></div>
              <div><span>Actual Return</span><strong>{formatStatusDateTime(completedTripSummary.summary.actualReturnTime)}</strong></div>
              <div><span>Total Distance</span><strong>{formatDistanceLabel(completedTripSummary.summary.totalDistanceMeters)}</strong></div>
              <div><span>Total Hours</span><strong>{Number(completedTripSummary.summary.totalTripHours || 0).toFixed(2)} hrs</strong></div>
            </div>
            <p>
              {completedTripSummary.summary.isLateReturn
                ? `Late return detected: ${completedTripSummary.summary.minutesLate} minutes late.`
                : 'Returned within the approved timeframe.'}
            </p>
          </div>
        )}

        {isRejected && (
          <div className="approved-detail-actions">
            <button type="button" className="approved-view-route-btn" onClick={() => setView('locator-slip')}>
              REQUEST AGAIN
            </button>
            <button type="button" className="rejected-dashboard-btn" onClick={() => setView('dashboard')}>
              RETURN TO DASHBOARD
            </button>
          </div>
        )}

        {showCancelReasonModal && (
          <div className="cancel-reason-modal-backdrop" role="presentation" onClick={() => !cancelLoading && setShowCancelReasonModal(false)}>
            <div className="cancel-reason-modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <span className="cancel-reason-modal-kicker">CANCEL LOCATOR SLIP</span>
              <h3>Why are you cancelling this request?</h3>
              <p>Select the reason that best matches the cancellation.</p>
              <div className="cancel-reason-options">
                {LOCATOR_SLIP_CANCEL_REASONS.map((reason) => (
                  <button
                    key={reason.value}
                    type="button"
                    className={`cancel-reason-option ${selectedCancelReason === reason.value ? 'selected' : ''}`}
                    onClick={() => setSelectedCancelReason(reason.value)}
                    disabled={cancelLoading}
                  >
                    {reason.label}
                  </button>
                ))}
              </div>
              <div className="cancel-reason-actions">
                <button type="button" className="cancel-reason-secondary" onClick={() => setShowCancelReasonModal(false)} disabled={cancelLoading}>
                  Back
                </button>
                <button type="button" className="cancel-reason-primary" onClick={cancelRequest} disabled={cancelLoading}>
                  {cancelLoading ? 'Cancelling...' : 'Confirm cancel'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="referral-id">
          REFERRAL ID: {referralId}
        </div>

        {showQrCode && canShowQrCode && (
          <div className="qr-modal-overlay" onClick={() => setShowQrCode(false)}>
            <div className="qr-modal-card" onClick={(event) => event.stopPropagation()}>
              <span className="location-proof-kicker">LOCATOR SLIP QR</span>
              <h3>{slip.locator_slip_code}</h3>
              <p>Present this QR code or locator slip code to CSSU while the locator slip is still pending or approved.</p>
              <img
                className="qr-modal-image"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(slip.locator_slip_code)}`}
                alt={`QR code for ${slip.locator_slip_code}`}
              />
              <div className="qr-modal-code">{slip.locator_slip_code}</div>
              <button type="button" className="approved-view-route-btn" onClick={() => setShowQrCode(false)}>
                CLOSE
              </button>
            </div>
          </div>
        )}
      </div>
      <BottomNav active="status" setView={setView} />
    </div>
  );
};

const UpdatesView = ({ setView, profileData }) => (
  <div className="dashboard-wrapper" style={{ background: '#F9FAFB' }}>
    <div className="content fade-in dash-content updates-content">
      <div className="slip-top-nav" style={{ borderBottom: '1px solid #F3F4F6' }}>
        <div className="slip-nav-left" onClick={() => setView('dashboard')}>
          <BackArrowIcon color="var(--green)" />
          <span className="dash-logo-text">EduRoute</span>
        </div>
        <div className="dash-avatar">
          <img src={profileData.image} alt="Faculty Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </div>

      <div className="updates-header">
        <h1 className="updates-title">Updates</h1>
        <p className="updates-subtitle">Your academic concierge activity feed.</p>
      </div>

      <div className="update-card" onClick={() => setView('route-approved')}>
        <div className="update-icon-wrapper">
          <ShieldCheckIcon color="var(--green)" />
        </div>
        <div className="update-content">
          <div className="update-header-row">
            <h3 className="update-card-title">Route Approval Confirmed</h3>
            <span className="update-time">2M<br />AGO</span>
          </div>
          <p className="update-desc">
            Your personalized academic curriculum path for the Fall semester has been formally vetted and approved by the Dean.
          </p>
          <div className="update-tags">
            <span className="update-tag-pill">ACADEMIC PATH</span>
            <span className="update-tag-text">View Route Details</span>
          </div>
        </div>
      </div>

    </div>
    <BottomNav active="slips" setView={setView} />
  </div>
);

const RouteApprovedView = ({ setView, profileData }) => (
  <div className="dashboard-wrapper" style={{ background: '#F9FAFB' }}>
    <div className="content fade-in dash-content">
      <div className="slip-top-nav" style={{ borderBottom: '1px solid #F3F4F6' }}>
        <div className="slip-nav-left" onClick={() => setView('dashboard')}>
          <BackArrowIcon color="var(--green)" />
          <span className="dash-logo-text">EduRoute</span>
        </div>
        <div className="dash-avatar">
          <img src={profileData.image} alt="Faculty Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </div>

      <div className="approved-hero">
        <div className="approved-icon-wrapper">
          <CheckCircleSolidIcon size="42" />
        </div>
        <h1 className="approved-title">Route Approved</h1>
        <p className="approved-subtitle">Your academic journey has been officially validated.</p>
      </div>

      <div className="approved-card">
        <div className="auth-header">
          <ShieldSolidIcon />
          <span>VERIFIED AUTHORIZATION</span>
        </div>
        <p className="auth-subtext">Approved with Digital Signature by</p>
        <h3 className="auth-name">Dr. Ronnie Luy</h3>
        <p className="auth-role">Dean of Undergraduate Studies</p>

        <div className="signature-box">
          <DummySignature />
          <div className="signature-hash">
            <LockSmallIcon /> HASH: 8F2A...9C1D
          </div>
        </div>
      </div>

      <div className="view-route-btn-container">
        <button className="primary-btn view-route-btn" onClick={() => setView('map')}>
          View Route <MapFoldIcon color="white" width="20" height="20" />
        </button>
      </div>

      <div className="rejected-card">
        <div className="rejected-icon-wrapper">
          <ExclamationCircleIcon />
        </div>
        <div className="rejected-content">
          <h4 className="rejected-title">Previous Attempt: Rejected</h4>
          <p className="rejected-reason">
            <strong>Reason:</strong> Prerequisites for ADV-402 not fully met in current sequence.
          </p>
          <button className="edit-resubmit-btn" onClick={() => setView('locator-slip')}>
            EDIT & RESUBMIT <EditPencilIcon />
          </button>
        </div>
      </div>

    </div>
    <BottomNav active="slips" setView={setView} />
  </div>
);

const ApprovedLocatorSlipSelectionView = ({ setView, profileData, setSelectedSlip }) => {
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadApprovedSlips = async () => {
      setLoading(true);
      setError('');

      try {
        const data = await getApprovedFacultyLocatorSlips();
        if (mounted) {
          setSlips(Array.isArray(data.locatorSlips) ? data.locatorSlips : []);
        }
      } catch (nextError) {
        if (mounted) {
          setError(nextError.message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadApprovedSlips();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSelectSlip = async (slipId) => {
    try {
      const slip = await getFacultyLocatorSlipDetails(slipId);
      setSelectedSlip(slip);
      localStorage.setItem('edurouteMapSlipId', slipId);
      localStorage.setItem('edurouteLastView', 'map');
      setView('map');
    } catch (nextError) {
      setError(nextError.message);
    }
  };

  const getTripAccessStatus = (slip) => {
    const normalizedTripStatus = String(slip.tripStatus || '').toLowerCase();
    if (normalizedTripStatus === 'completed' || String(slip.displayStatus || '').toLowerCase() === 'completed') {
      return 'completed';
    }

    if (slip.canStartTrip) {
      return 'approved';
    }

    return 'blocked';
  };

  return (
    <div className="dashboard-wrapper submitted-wrapper">
      <div className="content fade-in dash-content">
        <div className="slip-top-nav">
          <div className="slip-nav-left" onClick={() => setView('dashboard')}>
            <BackArrowIcon color="var(--green)" />
            <span className="dash-logo-text">EduRoute</span>
          </div>
          <div className="dash-avatar" onClick={() => setView('profile')} style={{ cursor: 'pointer' }}>
            <img src={profileData.image} alt="Faculty Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>

        <div className="submitted-status-text map-slip-selection-copy">
          <div className="status-pill-yellow status-pill-approved">TRIP ACCESS</div>
          <h2>Select an <span className="text-green">Approved Locator Slip</span></h2>
          <p>Choose the approved locator slip you want to use before opening the faculty trip map.</p>
        </div>

        {error && <div className="trip-map-error map-slip-selection-error">{error}</div>}

        <div className="map-slip-selection-list">
          {loading && <div className="map-slip-selection-empty">Loading approved locator slips...</div>}
          {!loading && slips.length === 0 && (
            <div className="map-slip-selection-empty">No approved locator slips are ready for trip access yet.</div>
          )}
          {!loading && slips.map((slip) => {
            const tripAccessStatus = getTripAccessStatus(slip);
            const isCompletedTrip = tripAccessStatus === 'completed';
            const isBlockedTrip = tripAccessStatus === 'blocked';
            const tripAccessHelper = slip.actions?.helperText || '';
            const cssuStatusLabel = getCssuValidationStatus(slip).toUpperCase();

            return (
              <button
                key={slip.id}
                type="button"
                className={`map-slip-selection-card ${isCompletedTrip ? 'is-completed' : isBlockedTrip ? 'is-blocked' : 'is-approved'}`}
                onClick={() => !isCompletedTrip && !isBlockedTrip && handleSelectSlip(slip.id)}
                disabled={isCompletedTrip || isBlockedTrip}
              >
                <div className="map-slip-selection-head">
                  <span className="map-slip-selection-purpose">{slip.purpose || 'Approved trip request'}</span>
                  <span className={`map-slip-selection-status ${isCompletedTrip ? 'completed' : isBlockedTrip ? 'blocked' : 'approved'}`}>
                    {isCompletedTrip ? 'COMPLETED' : isBlockedTrip ? cssuStatusLabel : 'APPROVED'}
                  </span>
                </div>
                <strong>{slip.destination}</strong>
                <span>Departure: {formatStatusDate(slip.departureTime)}</span>
                <span>Expected return: {formatStatusDate(slip.expectedReturnTime)}</span>
                {tripAccessHelper && <span>{tripAccessHelper}</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  );
};

const MapTrackingView = ({ setView, profileData, selectedSlip, setSelectedSlip }) => {
  const LIVE_TRACKING_MAX_ACCEPTED_ACCURACY_METERS = 30;
  const LIVE_TRACKING_MIN_MOVEMENT_METERS = 18;
  const LIVE_TRACKING_MIN_REROUTE_DISTANCE_METERS = 28;
  const LIVE_TRACKING_MIN_REROUTE_INTERVAL_MS = 5000;
  const LIVE_TRACKING_STATIONARY_SPEED_MPS = 0.8;

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const originMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const locationWatchRef = useRef(null);
  const lastRerouteAtRef = useRef(0);
  const lastAcceptedOriginRef = useRef(null);
  const lastRouteOriginRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [origin, setOrigin] = useState(null);
  const [tripStartOrigin, setTripStartOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [activeTrip, setActiveTrip] = useState(null);
  const [routeSummary, setRouteSummary] = useState(null);
  const [routeMode, setRouteMode] = useState('mapbox/driving-traffic');
  const [modeEstimates, setModeEstimates] = useState([]);
  const [activeRoutePanel, setActiveRoutePanel] = useState(null);
  const [selectedAlternativeIndex, setSelectedAlternativeIndex] = useState(-1);
  const [highlightedStepIndex, setHighlightedStepIndex] = useState(-1);
  const [isPinMode, setIsPinMode] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [showSearchPanel, setShowSearchPanel] = useState(true);
  const [showActionBoard, setShowActionBoard] = useState(true);
  const [showTripMetrics, setShowTripMetrics] = useState(false);
  const [showRouteTools, setShowRouteTools] = useState(true);
  const [showProofPanel, setShowProofPanel] = useState(true);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState('');
  const [locatorSlip, setLocatorSlip] = useState(selectedSlip || null);
  const [tripSummary, setTripSummary] = useState(null);
  const [overlayOffsets, setOverlayOffsets] = useState({
    search: { x: 0, y: 0 },
    action: { x: 0, y: 0 },
    metrics: { x: 0, y: 0 },
    proof: { x: 0, y: 0 },
    tools: { x: 0, y: 0 },
    panel: { x: 0, y: 0 },
  });
  const dragStateRef = useRef(null);
  const {
    proof: proofCompliance,
    submitting: proofSubmitting,
    error: proofError,
    submitProof,
    loadProof,
    clearProofError,
  } = useProofOfCompliance(activeTrip?.id);

  const routeModes = [
    { key: 'mapbox/driving-traffic', label: 'Best Route', tone: 'green' },
    { key: 'mapbox/driving', label: 'Driving', tone: 'yellow' },
    { key: 'mapbox/walking', label: 'Walking', tone: 'gray' },
  ];

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
  });

  const formatDistance = (meters) => {
    const value = Number(meters);
    if (!Number.isFinite(value)) return '0 km';
    return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`;
  };

  const formatDuration = (seconds) => {
    const value = Number(seconds);
    if (!Number.isFinite(value)) return '0 min';
    const minutes = Math.max(1, Math.round(value / 60));
    return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;
  };

  const getTripPhase = (trip) => {
    if (!trip) return !destination ? 'DESTINATION_RESOLVING' : (isPinMode ? 'MANUAL_PIN_REQUIRED' : 'READY_TO_START');
    if (trip.returned_at || trip.ended_at || trip.status === 'completed') return 'COMPLETED';
    if (trip.status === 'returning') return 'RETURNING';
    if (trip.arrived_at && (trip.arrival_verified_at || proofCompliance?.proofComplianceImageUrl)) return 'ARRIVAL_VERIFIED';
    if (trip.arrived_at || trip.status === 'arrived') return 'ARRIVED';
    if (trip.status === 'active') return 'ACTIVE';
    return !destination ? 'DESTINATION_RESOLVING' : (isPinMode ? 'MANUAL_PIN_REQUIRED' : 'READY_TO_START');
  };

  const activeAlternatives = routeSummary?.alternatives || [];
  const displayedRoute = selectedAlternativeIndex >= 0 ? activeAlternatives[selectedAlternativeIndex] : routeSummary;
  const activeSteps = displayedRoute?.steps || [];
  const tripLifecycleState = getTripPhase(activeTrip);
  const selectedModeMeta = routeModes.find((mode) => mode.key === routeMode) || routeModes[0];
  const activeModeEta = useMemo(
    () => modeEstimates.find((estimate) => estimate.profile === routeMode) || null,
    [modeEstimates, routeMode]
  );
  const toggleRoutePanel = (panelKey) => {
    setActiveRoutePanel((currentPanel) => (currentPanel === panelKey ? null : panelKey));
  };
  const getPointerPosition = (event) => {
    const point = event.touches?.[0] || event.changedTouches?.[0] || event;
    return { x: point.clientX, y: point.clientY };
  };
  const startOverlayDrag = (overlayKey) => (event) => {
    const { x, y } = getPointerPosition(event);
    const baseOffset = overlayOffsets[overlayKey] || { x: 0, y: 0 };
    dragStateRef.current = {
      key: overlayKey,
      startX: x,
      startY: y,
      baseX: baseOffset.x,
      baseY: baseOffset.y,
    };
  };
  const getOverlayStyle = (overlayKey) => ({
    transform: `translate(${overlayOffsets[overlayKey]?.x || 0}px, ${overlayOffsets[overlayKey]?.y || 0}px)`,
  });

  const getDistanceBetweenMeters = (first, second) => {
    if (!first || !second) return Number.POSITIVE_INFINITY;

    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const earthRadiusMeters = 6371000;
    const deltaLatitude = toRadians(second.latitude - first.latitude);
    const deltaLongitude = toRadians(second.longitude - first.longitude);
    const startLatitude = toRadians(first.latitude);
    const endLatitude = toRadians(second.latitude);

    const haversine =
      Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
      Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(deltaLongitude / 2) *
      Math.sin(deltaLongitude / 2);

    return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  };

  const drawRoute = (geometry) => {
    const map = mapRef.current;
    if (!map || !geometry) return;

    const routeFeature = { type: 'Feature', properties: {}, geometry };

    if (map.getSource('active-trip-route')) {
      map.getSource('active-trip-route').setData(routeFeature);
    } else {
      map.addSource('active-trip-route', { type: 'geojson', data: routeFeature });
      map.addLayer({
        id: 'active-trip-route-line',
        type: 'line',
        source: 'active-trip-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#049516', 'line-width': 5, 'line-opacity': 0.92 },
      });
    }

    const coordinates = geometry.coordinates || [];
    if (coordinates.length > 1) {
      const bounds = coordinates.reduce(
        (currentBounds, coordinate) => currentBounds.extend(coordinate),
        new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
      );
      map.fitBounds(bounds, { padding: 56, maxZoom: 16, duration: 900 });
    }
  };

  const drawHighlightedStep = (geometry) => {
    const map = mapRef.current;
    if (!map || !geometry) return;

    const stepFeature = { type: 'Feature', properties: {}, geometry };

    if (map.getSource('active-trip-step-highlight')) {
      map.getSource('active-trip-step-highlight').setData(stepFeature);
    } else {
      map.addSource('active-trip-step-highlight', { type: 'geojson', data: stepFeature });
      map.addLayer({
        id: 'active-trip-step-highlight-line',
        type: 'line',
        source: 'active-trip-step-highlight',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#FFD517', 'line-width': 7, 'line-opacity': 0.96 },
      });
    }
  };

  const clearHighlightedStep = () => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer('active-trip-step-highlight-line')) map.removeLayer('active-trip-step-highlight-line');
    if (map.getSource('active-trip-step-highlight')) map.removeSource('active-trip-step-highlight');
  };

  const clearRoute = () => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer('active-trip-route-line')) map.removeLayer('active-trip-route-line');
    if (map.getSource('active-trip-route')) map.removeSource('active-trip-route');
    clearHighlightedStep();
  };

  const stopLiveLocationWatch = () => {
    if (locationWatchRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    }
  };

  const setOriginMarker = (coordinate, { recenter = true } = {}) => {
    const map = mapRef.current;
    if (!map || !coordinate) return;
    const lngLat = [coordinate.longitude, coordinate.latitude];

    if (!originMarkerRef.current) {
      originMarkerRef.current = new mapboxgl.Marker({ color: '#049516' }).setLngLat(lngLat).addTo(map);
    } else {
      originMarkerRef.current.setLngLat(lngLat);
    }

    if (recenter) {
      map.flyTo({ center: lngLat, zoom: 15, essential: true });
    }
  };

  const setDestinationMarker = (coordinate) => {
    const map = mapRef.current;
    if (!map || !coordinate) return;
    const lngLat = [coordinate.longitude, coordinate.latitude];

    if (!destinationMarkerRef.current) {
      destinationMarkerRef.current = new mapboxgl.Marker({ color: '#FFD517' }).setLngLat(lngLat).addTo(map);
    } else {
      destinationMarkerRef.current.setLngLat(lngLat);
    }

    map.flyTo({ center: lngLat, zoom: 15, essential: true });
  };

  const handleDestinationRetrieve = async (result) => {
    const feature = result?.features?.[0] || result?.feature || result;
    const coordinates = feature?.geometry?.coordinates;

    if (!coordinates || coordinates.length < 2) {
      setMapError('Selected destination has no coordinates.');
      return;
    }

    const nextDestination = {
      longitude: coordinates[0],
      latitude: coordinates[1],
      name: feature.properties?.full_address || feature.properties?.name || feature.properties?.place_formatted || 'Selected destination',
    };

    try {
      if (locatorSlip?.id) {
        await saveFacultyManualPin(locatorSlip.id, {
          lat: nextDestination.latitude,
          lng: nextDestination.longitude,
          label: nextDestination.name,
        });
      }

      setDestination(nextDestination);
      setSearchValue(nextDestination.name);
      setSelectedAlternativeIndex(-1);
      setHighlightedStepIndex(-1);
      setIsPinMode(false);
      setDestinationMarker(nextDestination);
      setMapError('');
    } catch (error) {
      setMapError(error.message);
    }
  };

  const handlePinnedDestination = async (lngLat) => {
    const nextDestination = {
      longitude: lngLat.lng,
      latitude: lngLat.lat,
      name: `Pinned location (${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)})`,
      isPinned: true,
    };

    try {
      if (locatorSlip?.id) {
        const result = await saveFacultyManualPin(locatorSlip.id, {
          lat: nextDestination.latitude,
          lng: nextDestination.longitude,
          label: nextDestination.name,
        });
        setLocatorSlip(result.locatorSlip || locatorSlip);
      }

      setDestination(nextDestination);
      setSearchValue(nextDestination.name);
      setSelectedAlternativeIndex(-1);
      setHighlightedStepIndex(-1);
      setDestinationMarker(nextDestination);
      setMapError('');
    } catch (error) {
      setMapError(error.message);
    }
  };

  const clearPinnedDestination = () => {
    if (!destination?.isPinned) return;

    setDestination(null);
    setSelectedAlternativeIndex(-1);
    setHighlightedStepIndex(-1);
    setRouteSummary(null);
    clearRoute();

    if (destinationMarkerRef.current) {
      destinationMarkerRef.current.remove();
      destinationMarkerRef.current = null;
    }
  };

  const requestCurrentLocation = () => {
    setMapError('');

    if (!navigator.geolocation) {
      setMapError('Location is not supported on this browser.');
      return;
    }

    setMapLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinate = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading,
          timestamp: position.timestamp,
        };
        setOrigin(coordinate);
        lastAcceptedOriginRef.current = coordinate;
        lastRouteOriginRef.current = coordinate;
        setOriginMarker(coordinate, { recenter: true });
        setMapLoading(false);
      },
      (error) => {
        setMapError(error.code === error.PERMISSION_DENIED
          ? 'Location permission was denied. Enable location access to start a trip from your current location.'
          : 'Unable to get your current location. Please try again.');
        setMapLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
    );
  };

  const refreshRouteFromOrigin = async (nextOrigin, { skipFit = true, profile = routeMode, alternatives } = {}) => {
    if (!destination || !nextOrigin) return null;

    const response = await fetch(`${API_BASE_URL}/api/maps/directions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        origin: nextOrigin,
        destination,
        profile,
        alternatives: alternatives ?? profile === 'mapbox/driving-traffic',
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to refresh trip route.');
    }

    setRouteSummary(data.data);
    setSelectedAlternativeIndex(-1);
    setHighlightedStepIndex(-1);
    clearHighlightedStep();
    drawRoute(data.data.geometry);

    if (skipFit && mapRef.current && nextOrigin) {
      mapRef.current.easeTo({
        center: [nextOrigin.longitude, nextOrigin.latitude],
        duration: 700,
        zoom: Math.max(mapRef.current.getZoom(), 15),
        essential: true,
      });
    }

    return data.data;
  };

  const applyDisplayedRoute = (route, { flyTo = false } = {}) => {
    if (!route?.geometry) return;
    drawRoute(route.geometry);

    if (flyTo && mapRef.current) {
      const coordinates = route.geometry.coordinates || [];
      if (coordinates.length > 1) {
        const bounds = coordinates.reduce(
          (currentBounds, coordinate) => currentBounds.extend(coordinate),
          new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
        );
        mapRef.current.fitBounds(bounds, { padding: 64, maxZoom: 16, duration: 800 });
      }
    }
  };

  const handleModeSelection = async (profile) => {
    setRouteMode(profile);
    setSelectedAlternativeIndex(-1);
    setHighlightedStepIndex(-1);
    clearHighlightedStep();

    if (!origin || !destination) return;

    try {
      setMapLoading(true);
      setMapError('');
      await refreshRouteFromOrigin(origin, {
        skipFit: false,
        profile,
        alternatives: profile === 'mapbox/driving-traffic',
      });
    } catch (error) {
      setMapError(error.message);
    } finally {
      setMapLoading(false);
    }
  };

  const handleAlternativeSelection = (alternativeIndex) => {
    const alternativeRoute = activeAlternatives[alternativeIndex];
    if (!alternativeRoute) return;

    setSelectedAlternativeIndex(alternativeIndex);
    setHighlightedStepIndex(-1);
    clearHighlightedStep();
    applyDisplayedRoute(alternativeRoute, { flyTo: true });
  };

  const handleStepSelection = (step, stepIndex) => {
    setHighlightedStepIndex(stepIndex);

    if (step.geometry) {
      drawHighlightedStep(step.geometry);
    }

    const [lng, lat] = step.location || [];
    if (mapRef.current && Number.isFinite(lng) && Number.isFinite(lat)) {
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom: Math.max(mapRef.current.getZoom(), 16),
        essential: true,
        duration: 700,
      });
    }
  };

  const startLiveLocationWatch = () => {
    if (!navigator.geolocation || !activeTrip || !destination) return;

    stopLiveLocationWatch();

    locationWatchRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const nextOrigin = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading,
          timestamp: position.timestamp,
        };

        const lastAcceptedOrigin = lastAcceptedOriginRef.current;
        const lastRouteOrigin = lastRouteOriginRef.current;
        const movedDistanceMeters = getDistanceBetweenMeters(lastAcceptedOrigin, nextOrigin);
        const movedSinceRerouteMeters = getDistanceBetweenMeters(lastRouteOrigin, nextOrigin);
        const accuracyMeters = Number(position.coords.accuracy);
        const speedMetersPerSecond = Number.isFinite(position.coords.speed) ? Number(position.coords.speed) : null;
        const hasReliableAccuracy = Number.isFinite(accuracyMeters) ? accuracyMeters <= LIVE_TRACKING_MAX_ACCEPTED_ACCURACY_METERS : true;
        const minimumAcceptedMovement = Math.max(
          LIVE_TRACKING_MIN_MOVEMENT_METERS,
          Number.isFinite(accuracyMeters) ? Math.min(accuracyMeters, 24) : LIVE_TRACKING_MIN_MOVEMENT_METERS
        );
        const hasMeaningfulMovement = movedDistanceMeters >= minimumAcceptedMovement;
        const isStationary = speedMetersPerSecond !== null
          ? speedMetersPerSecond < LIVE_TRACKING_STATIONARY_SPEED_MPS
          : !hasMeaningfulMovement;

        if (!lastAcceptedOrigin || (hasReliableAccuracy && hasMeaningfulMovement && !isStationary)) {
          lastAcceptedOriginRef.current = nextOrigin;
          setOrigin(nextOrigin);
          setOriginMarker(nextOrigin, { recenter: false });

          if (activeTrip?.id) {
            fetch(`${API_BASE_URL}/api/trips/${activeTrip.id}/location`, {
              method: 'POST',
              headers: authHeaders(),
              body: JSON.stringify({
                facultyUserId: localStorage.getItem('userId') || undefined,
                lat: nextOrigin.latitude,
                lng: nextOrigin.longitude,
                speed: nextOrigin.speed,
                heading: nextOrigin.heading,
                recordedAt: new Date(nextOrigin.timestamp || Date.now()).toISOString(),
              }),
            }).catch(() => null);
          }
        } else {
          return;
        }

        const now = Date.now();
        if (now - lastRerouteAtRef.current < LIVE_TRACKING_MIN_REROUTE_INTERVAL_MS) return;
        if (movedSinceRerouteMeters < LIVE_TRACKING_MIN_REROUTE_DISTANCE_METERS) return;
        lastRerouteAtRef.current = now;

        try {
          await refreshRouteFromOrigin(nextOrigin);
          lastRouteOriginRef.current = nextOrigin;
          setMapError('');
        } catch (error) {
          setMapError(error.message);
        }
      },
      (error) => {
        setMapError(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied during live tracking. Re-enable it to keep the trip distance updated.'
            : 'Unable to refresh your live trip location.'
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  const startTrip = async () => {
    const tripActionState = getLocatorSlipActionState(locatorSlip, activeTrip);

    if (!tripActionState.startTrip) {
      setMapError(tripActionState.helperText || 'CSSU must allow exit before you can start this trip.');
      return;
    }

    if (!destination) {
      setMapError('Resolve or pin the locator slip destination first.');
      return;
    }

    if (!origin) {
      requestCurrentLocation();
      setMapError('Current location is needed before starting a trip.');
      return;
    }

    setMapLoading(true);
    setMapError('');

    try {
      const data = await startFacultyTrip({
        locatorSlipId: locatorSlip?.id,
        originLat: origin.latitude,
        originLng: origin.longitude,
        destinationLat: destination.latitude,
        destinationLng: destination.longitude,
        outboundDistanceMeters: routeSummary?.distance_meters || null,
        profile: routeMode,
      });

      setLocatorSlip(data.locatorSlip || locatorSlip);
      setActiveTrip(data.trip);
      setTripStartOrigin(origin);
      setRouteSummary(data.route);
      setTripSummary(null);
      lastAcceptedOriginRef.current = origin;
      lastRouteOriginRef.current = origin;
      setShowTripMetrics(false);
      setShowRouteTools(true);
      setSelectedAlternativeIndex(-1);
      setHighlightedStepIndex(-1);
      drawRoute(data.route.geometry);
      lastRerouteAtRef.current = Date.now();
      setActiveRoutePanel('summary');
    } catch (error) {
      setMapError(error.message);
    } finally {
      setMapLoading(false);
    }
  };

  const markTripArrived = async () => {
    if (!activeTrip) return;

    setMapLoading(true);
    setMapError('');

    try {
      const trip = await markFacultyTripArrived(activeTrip.id);
      setActiveTrip(trip);
      setMapError('');
    } catch (error) {
      setMapError(error.message);
    } finally {
      setMapLoading(false);
    }
  };

  const submitProofOfCompliance = async (formPayload) => {
    if (!activeTrip) {
      setMapError('Trip is missing.');
      return;
    }

    setMapError('');
    clearProofError();

    try {
      const data = await submitProof(formPayload);
      if (data?.trip) {
        setActiveTrip((current) => ({
          ...(current || {}),
          ...data.trip,
        }));
      }
      setMapError('');
      await loadProof({ silent: true });
    } catch (error) {
      setMapError(error.message || 'Failed to submit proof of compliance.');
    }
  };

  const beginReturnTrip = async () => {
    if (!activeTrip) return;

    setMapLoading(true);
    setMapError('');

    try {
      const trip = await startFacultyTripReturn(activeTrip.id);
      setActiveTrip(trip);
      if (tripStartOrigin && destination) {
        const returnDestination = {
          latitude: tripStartOrigin.latitude,
          longitude: tripStartOrigin.longitude,
          name: 'Starting location',
        };
        const returnOrigin = {
          latitude: destination.latitude,
          longitude: destination.longitude,
          name: destination.name || 'Verified destination',
        };

        setDestination(returnDestination);
        setDestinationMarker(returnDestination);
        setOrigin(returnOrigin);
        setOriginMarker(returnOrigin, { recenter: true });
        lastAcceptedOriginRef.current = returnOrigin;
        lastRouteOriginRef.current = returnOrigin;

        const response = await fetch(`${API_BASE_URL}/api/maps/directions`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            origin: returnOrigin,
            destination: returnDestination,
            profile: routeMode,
            alternatives: false,
          }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to prepare the return route.');
        }

        setRouteSummary(data.data);
        drawRoute(data.data.geometry);
      }
    } catch (error) {
      setMapError(error.message);
    } finally {
      setMapLoading(false);
    }
  };

  const completeReturnedTrip = async () => {
    if (!activeTrip) return;

    setMapLoading(true);
    setMapError('');

    try {
      const data = await markFacultyTripReturned(activeTrip.id, {
        returnDistanceMeters: routeSummary?.distance_meters || null,
        profile: routeMode,
      });
      const summaryPayload = await getFacultyTripSummary(activeTrip.id).catch(() => data);
      const completedTrip = data.trip ? {
        ...data.trip,
        status: 'completed',
        trip_status: 'completed',
      } : null;
      const applyCompletedSlipState = (current) => {
        if (!current) return current;
        return {
          ...current,
          status: 'completed',
          trip_status: 'completed',
          tripStatus: 'completed',
          displayStatus: 'completed',
          currentStatusLabel: 'completed',
          trip: completedTrip || current.trip || null,
        };
      };

      setTripSummary(summaryPayload);
      setActiveTrip(completedTrip);
      setTripStartOrigin(null);
      setShowTripMetrics(false);
      setShowRouteTools(false);
      setActiveRoutePanel(null);
      stopLiveLocationWatch();
      clearRoute();
      localStorage.removeItem('edurouteMapSlipId');
      if (completedTrip) {
        setLocatorSlip((current) => applyCompletedSlipState(current));
        setSelectedSlip?.((current) => applyCompletedSlipState(current));
      }
    } catch (error) {
      setMapError(error.message);
    } finally {
      setMapLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSlip) {
      setLocatorSlip(selectedSlip);
    }
  }, [selectedSlip]);

  useEffect(() => {
    if (proofCompliance?.id) {
      setShowProofPanel(true);
    }
  }, [proofCompliance?.id]);

  useEffect(() => {
    const storedSlipId = localStorage.getItem('edurouteMapSlipId');

    if (!selectedSlip?.id && !storedSlipId) {
      setView('map-slip-selection');
    }
  }, [selectedSlip?.id, setView]);

  useEffect(() => {
    let mounted = true;

    const loadLocatorSlip = async () => {
      const slipId = selectedSlip?.id || localStorage.getItem('edurouteMapSlipId');
      if (!slipId) return;

      try {
        setMapLoading(true);
        const slip = await getFacultyLocatorSlipDetails(slipId);

        if (!mounted) return;

        setLocatorSlip(slip);
        setSelectedSlip?.(slip);
        setSearchValue(slip.destination || '');
        setTripSummary(null);

        if (slip.currentTrip) {
          setActiveTrip(slip.currentTrip);
          if (slip.currentTrip.origin) {
            setOrigin(slip.currentTrip.origin);
            setTripStartOrigin(slip.currentTrip.origin);
            lastAcceptedOriginRef.current = slip.currentTrip.origin;
            lastRouteOriginRef.current = slip.currentTrip.origin;
            setOriginMarker(slip.currentTrip.origin);
          }

          if (slip.currentTrip.destination) {
            const nextDestination = getTripPhase(slip.currentTrip) === 'RETURNING' && slip.currentTrip.origin
              ? {
                latitude: slip.currentTrip.origin.latitude,
                longitude: slip.currentTrip.origin.longitude,
                name: 'Starting location',
              }
              : slip.currentTrip.destination;
            setDestination(nextDestination);
            setDestinationMarker(nextDestination);
          }

          if (slip.currentTrip.route_geometry) {
            const nextRouteSummary = {
              distance_meters: slip.currentTrip.total_distance_meters || slip.currentTrip.route_distance_meters,
              duration_seconds: slip.currentTrip.route_duration_seconds,
              geometry: slip.currentTrip.route_geometry,
              steps: [],
              alternatives: [],
            };
            setRouteSummary(nextRouteSummary);
            drawRoute(nextRouteSummary.geometry);
          }
        } else {
          setActiveTrip(null);
          setTripStartOrigin(null);
        }

        if (slip.destination_lat && slip.destination_lng) {
          const nextDestination = {
            latitude: Number(slip.destination_lat),
            longitude: Number(slip.destination_lng),
            name: slip.destination,
          };
          setDestination(nextDestination);
          setDestinationMarker(nextDestination);
          setIsPinMode(false);
        } else if (slip.destination) {
          const result = await resolveFacultyLocatorSlipDestination(slip.id, slip.destination);

          if (!mounted) return;

          if (result.resolved) {
            const nextDestination = {
              latitude: Number(result.destination.lat),
              longitude: Number(result.destination.lng),
              name: result.destination.label,
            };
            setLocatorSlip(result.locatorSlip || slip);
            setDestination(nextDestination);
            setDestinationMarker(nextDestination);
            setIsPinMode(false);
          } else {
            setDestination(null);
            setIsPinMode(true);
            setMapError(result.message || 'Destination could not be resolved automatically.');
          }
        }
      } catch (error) {
        if (!mounted) return;
        setMapError(error.message);
        const normalizedMessage = String(error.message || '').toLowerCase();
        const shouldRedirectToSelection =
          normalizedMessage.includes('approved locator slip not found')
          || normalizedMessage.includes('only approved or verified locator slips')
          || normalizedMessage.includes('locator slip not found');

        if (shouldRedirectToSelection) {
          localStorage.removeItem('edurouteMapSlipId');
          setView('map-slip-selection');
        } else {
          setShowSearchPanel(true);
          setIsPinMode(true);
        }
      } finally {
        if (mounted) {
          setMapLoading(false);
        }
      }
    };

    loadLocatorSlip();

    return () => {
      mounted = false;
    };
  }, [selectedSlip?.id, setSelectedSlip, setView, mapReady]);

  useEffect(() => {
    if (!MAPBOX_PUBLIC_TOKEN || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [120.2828, 14.8386],
      zoom: 13,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('load', () => setMapReady(true));
    mapRef.current = map;

    return () => {
      stopLiveLocationWatch();
      originMarkerRef.current?.remove();
      destinationMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    const handleMapClickForPin = (event) => {
      if (!isPinMode) return;
      handlePinnedDestination(event.lngLat);
    };

    map.on('click', handleMapClickForPin);

    return () => {
      map.off('click', handleMapClickForPin);
    };
  }, [isPinMode]);

  useEffect(() => {
    if (!origin || !destination || activeTrip) return undefined;

    let cancelled = false;

    const compareModes = async () => {
      try {
        const profiles = ['mapbox/driving-traffic', 'mapbox/driving', 'mapbox/walking'];
        const responses = await Promise.all(
          profiles.map(async (profile) => {
            const response = await fetch(`${API_BASE_URL}/api/maps/directions`, {
              method: 'POST',
              headers: authHeaders(),
              body: JSON.stringify({
                origin,
                destination,
                profile,
                alternatives: profile === 'mapbox/driving-traffic',
              }),
            });
            const data = await response.json();

            if (!response.ok) {
              throw new Error(data.message || 'Failed to compare route modes.');
            }

            return data.data;
          })
        );

        if (!cancelled) {
          setModeEstimates(responses);
          const suggestedMode = responses.reduce((bestRoute, nextRoute) =>
            !bestRoute || nextRoute.duration_seconds < bestRoute.duration_seconds ? nextRoute : bestRoute, null);
          if (suggestedMode?.profile) {
            setRouteMode(suggestedMode.profile);
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to compare route modes:', error);
        }
      }
    };

    compareModes();

    return () => {
      cancelled = true;
    };
  }, [origin?.latitude, origin?.longitude, destination?.latitude, destination?.longitude, activeTrip?.id]);

  useEffect(() => {
    if (activeTrip && destination && ['ACTIVE', 'RETURNING'].includes(getTripPhase(activeTrip))) {
      startLiveLocationWatch();
      return () => stopLiveLocationWatch();
    }

    stopLiveLocationWatch();
    return undefined;
  }, [activeTrip?.id, destination?.longitude, destination?.latitude]);

  useEffect(() => {
    const handleMove = (event) => {
      if (!dragStateRef.current) return;

      if (event.cancelable) {
        event.preventDefault();
      }

      const { x, y } = getPointerPosition(event);
      const { key, startX, startY, baseX, baseY } = dragStateRef.current;

      setOverlayOffsets((currentOffsets) => ({
        ...currentOffsets,
        [key]: {
          x: baseX + (x - startX),
          y: baseY + (y - startY),
        },
      }));
    };

    const handleEnd = () => {
      dragStateRef.current = null;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [overlayOffsets]);

  return (
    <div className="dashboard-wrapper map-trip-wrapper">
      <div ref={mapContainerRef} className="mapbox-canvas" />

      {!MAPBOX_PUBLIC_TOKEN && (
        <div className="map-token-warning">
          Add VITE_MAPBOX_PUBLIC_TOKEN to .env.local to load the map.
        </div>
      )}

      <div className="map-top-nav trip-map-top-nav">
        <div className="nav-left" onClick={() => setView('dashboard')} style={{ cursor: 'pointer' }}>
          <BackArrowIcon color="var(--green)" />
          <span className="nav-title">Trip Route</span>
        </div>
        <div className="dash-avatar" onClick={() => setView('profile')}>
          <img src={profileData.image} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        </div>
      </div>

      {showSearchPanel ? (
        <div className="trip-search-panel" style={getOverlayStyle('search')}>
          <div className="overlay-card-head overlay-card-head-search">
            <label>Destination</label>
            <div className="overlay-card-controls">
              <button type="button" className="overlay-toggle-btn" onClick={() => setShowSearchPanel(false)}>
                Hide
              </button>
              <button
                type="button"
                className="overlay-drag-handle"
                onMouseDown={startOverlayDrag('search')}
                onTouchStart={startOverlayDrag('search')}
              >
                Drag
              </button>
            </div>
          </div>
          {MAPBOX_PUBLIC_TOKEN ? (
            <SearchBox
              accessToken={MAPBOX_PUBLIC_TOKEN}
              map={mapRef.current}
              mapboxgl={mapboxgl}
              marker={false}
              value={searchValue}
              onChange={(nextValue) => {
                setSearchValue(nextValue);
                setIsPinMode(false);
                if (nextValue.trim()) {
                  clearPinnedDestination();
                }
              }}
              onClear={() => {
                setSearchValue('');
                setIsPinMode(false);
                clearPinnedDestination();
              }}
              onRetrieve={handleDestinationRetrieve}
              placeholder="Search destination..."
              options={{ language: 'en', country: 'PH' }}
            />
          ) : (
            <input disabled placeholder="Mapbox token required" />
          )}
          {locatorSlip && (
            <p className="trip-search-state">
              {tripLifecycleState === 'RETURNING'
                ? <>Return trip active: <strong>destination is now the original starting location</strong></>
                : <>Selected locator slip: <strong>{locatorSlip.destination}</strong></>}
            </p>
          )}
          <div className="trip-search-actions">
            <button
              type="button"
              className={`trip-pin-btn ${isPinMode ? 'active' : ''}`}
              onClick={() => {
                const nextPinMode = !isPinMode;
                setIsPinMode(nextPinMode);
                if (nextPinMode) {
                  setSearchValue('');
                  clearPinnedDestination();
                }
                setMapError('');
              }}
            >
              {isPinMode ? 'Tap Map To Pin' : 'Pin Location'}
            </button>
          </div>
          {destination && (
            <p className="trip-selected-destination">
              {tripLifecycleState === 'RETURNING'
                ? `Returning to ${destination.name} from the verified destination`
                : destination.name}
              {destination.isPinned ? ' • custom pin' : ''}
            </p>
          )}
          {isPinMode && (
            <p className="trip-search-state">Tap any point on the map to set a destination when Search Box does not find it.</p>
          )}
        </div>
      ) : (
        <button type="button" className="trip-search-restore-btn fade-in" onClick={() => setShowSearchPanel(true)}>
          Show Destination
        </button>
      )}

      {showActionBoard ? (
        <div className="trip-action-board fade-in" style={getOverlayStyle('action')}>
          <div className="tb-header">
            <div className="tb-header-left">
              <div className="tb-dot"></div>
              <span>{activeTrip ? 'FACULTY TRIP FLOW' : 'READY TO ROUTE'}</span>
            </div>
            <div className="tb-header-actions">
              <div className="tb-status">{tripLifecycleState.replace(/_/g, ' ')}</div>
              <button type="button" className="overlay-toggle-btn on-green" onClick={() => setShowActionBoard(false)}>
                Hide
              </button>
              <button
                type="button"
                className="overlay-drag-handle on-green"
                onMouseDown={startOverlayDrag('action')}
                onTouchStart={startOverlayDrag('action')}
              >
                Drag
              </button>
            </div>
          </div>

          {mapError && <div className="trip-map-error">{mapError}</div>}

          <div className="trip-map-actions">
            <button type="button" className="trip-location-btn" onClick={requestCurrentLocation} disabled={mapLoading}>
              Use My Current Location
            </button>
            {tripSummary?.summary || locatorSlip?.trip_status === 'completed' ? (
              <button
                type="button"
                className="trip-location-btn"
                onClick={() => {
                  setSelectedSlip?.(null);
                  setLocatorSlip(null);
                  localStorage.removeItem('edurouteMapSlipId');
                  setView('map-slip-selection');
                }}
              >
                Choose Another Slip
              </button>
            ) : !activeTrip || tripLifecycleState === 'COMPLETED' ? (
              <button
                type="button"
                className="trip-start-btn"
                onClick={startTrip}
                disabled={mapLoading || !destination || !getLocatorSlipActionState(locatorSlip, activeTrip).startTrip}
              >
                {mapLoading ? 'Preparing...' : 'Start Trip'}
              </button>
            ) : tripLifecycleState === 'ACTIVE' ? (
              <button type="button" className="trip-start-btn" onClick={markTripArrived} disabled={mapLoading}>
                {mapLoading ? 'Updating...' : 'Arrived'}
              </button>
            ) : tripLifecycleState === 'ARRIVED' ? (
              <div className="trip-map-verification-stack">
                <ProofOfComplianceForm
                  initialValues={{
                    focalPersonName: '',
                    focalPersonPosition: '',
                  }}
                  disabled={mapLoading || proofSubmitting}
                  loading={proofSubmitting}
                  error={proofError || mapError}
                  onSubmit={submitProofOfCompliance}
                />
              </div>
            ) : tripLifecycleState === 'ARRIVAL_VERIFIED' ? (
              <button type="button" className="trip-start-btn" onClick={beginReturnTrip} disabled={mapLoading}>
                {mapLoading ? 'Preparing...' : 'Start Return Trip'}
              </button>
            ) : tripLifecycleState === 'RETURNING' ? (
              <button type="button" className="trip-start-btn" onClick={completeReturnedTrip} disabled={mapLoading}>
                {mapLoading ? 'Saving...' : 'Returned'}
              </button>
            ) : (
              <button type="button" className="trip-location-btn" disabled>
                Trip Completed
              </button>
            )}
          </div>
          {proofCompliance?.proofComplianceImageUrl && tripLifecycleState !== 'RETURNING' && (
            <p className="trip-search-state">Proof of compliance submitted successfully. You can now start the return route back to the original starting location.</p>
          )}
          {tripLifecycleState === 'RETURNING' && (
            <p className="trip-search-state">Destination updated. You are now returning back to the original starting location.</p>
          )}
          {!activeTrip && locatorSlip && getLocatorSlipActionState(locatorSlip, activeTrip).helperText && (
            <p className="trip-search-state">{getLocatorSlipActionState(locatorSlip, activeTrip).helperText}</p>
          )}
          {tripSummary?.summary && (
            <div className="trip-summary-card">
              <strong>Trip Summary Ready</strong>
              <span>Total distance: {formatDistance(tripSummary.summary.totalDistanceMeters)}</span>
              <span>Total hours: {Number(tripSummary.summary.totalTripHours || 0).toFixed(2)} hrs</span>
              <span>{tripSummary.summary.isLateReturn ? `Late return: ${tripSummary.summary.minutesLate} mins late` : 'Returned within the expected window'}</span>
            </div>
          )}
        </div>
      ) : (
        <button type="button" className="trip-action-restore-btn fade-in" onClick={() => setShowActionBoard(true)}>
          Show Route
        </button>
      )}

      {proofCompliance && showProofPanel ? (
        <div className="trip-proof-panel fade-in" style={getOverlayStyle('proof')}>
          <div className="trip-metrics-head">
            <span>Compliance Proof</span>
            <div className="overlay-card-controls">
              <button type="button" className="overlay-toggle-btn" onClick={() => setShowProofPanel(false)}>
                Hide
              </button>
              <button
                type="button"
                className="overlay-drag-handle"
                onMouseDown={startOverlayDrag('proof')}
                onTouchStart={startOverlayDrag('proof')}
              >
                Drag
              </button>
            </div>
          </div>
          <ProofOfCompliancePreview
            proof={proofCompliance}
            title="Submitted Proof of Compliance"
            showFullCard={false}
            showArrivalPhoto={false}
          />
        </div>
      ) : proofCompliance ? (
        <button
          type="button"
          className="trip-proof-restore-btn fade-in"
          onClick={() => setShowProofPanel(true)}
        >
          Show Compliance
        </button>
      ) : null}

      {tripSummary?.summary && (
        <div className="trip-summary-panel fade-in">
          <h3>Trip Summary</h3>
          <div className="trip-summary-grid">
            <div><span>Locator slip departure</span><strong>{formatStatusDateTime(tripSummary.summary.departureTime)}</strong></div>
            <div><span>Actual trip start</span><strong>{formatStatusDateTime(tripSummary.summary.actualStartTripTime)}</strong></div>
            <div><span>Estimated return</span><strong>{formatStatusDateTime(tripSummary.summary.estimatedReturnTime)}</strong></div>
            <div><span>Actual return</span><strong>{formatStatusDateTime(tripSummary.summary.actualReturnTime)}</strong></div>
            <div><span>Total distance</span><strong>{formatDistance(tripSummary.summary.totalDistanceMeters)}</strong></div>
            <div><span>Total hours</span><strong>{Number(tripSummary.summary.totalTripHours || 0).toFixed(2)} hrs</strong></div>
          </div>
          <p className={`trip-summary-late ${tripSummary.summary.isLateReturn ? 'late' : ''}`}>
            {tripSummary.summary.isLateReturn
              ? `Late return detected: ${tripSummary.summary.minutesLate} minutes late.`
              : 'Returned within the approved timeframe.'}
          </p>
        </div>
      )}

      {activeTrip && (
        <div className={`trip-metrics-panel fade-in ${showTripMetrics ? '' : 'collapsed'}`} style={getOverlayStyle('metrics')}>
          <div className="trip-metrics-head">
            <span>Trip Metrics</span>
            <div className="overlay-card-controls">
              <button type="button" className="overlay-toggle-btn" onClick={() => setShowTripMetrics((currentValue) => !currentValue)}>
                {showTripMetrics ? 'Hide' : 'Show'}
              </button>
              {showTripMetrics && (
                <button
                  type="button"
                  className="overlay-drag-handle"
                  onMouseDown={startOverlayDrag('metrics')}
                  onTouchStart={startOverlayDrag('metrics')}
                >
                  Drag
                </button>
              )}
            </div>
          </div>
          {showTripMetrics && (
            <div className="trip-stats-strip">
              <div className="trip-stat-pill"><span>Distance</span><strong>{formatDistance(routeSummary?.distance_meters || activeTrip?.distance_meters)}</strong></div>
              <div className="trip-stat-pill"><span>ETA</span><strong>{formatDuration(routeSummary?.duration_seconds || activeTrip?.duration_seconds)}</strong></div>
            </div>
          )}
        </div>
      )}

      {(destination || routeSummary || activeTrip) && showRouteTools && (
        <div className="trip-side-actions" style={getOverlayStyle('tools')}>
          <button
            type="button"
            className="overlay-drag-handle small"
            onMouseDown={startOverlayDrag('tools')}
            onTouchStart={startOverlayDrag('tools')}
          >
            Drag
          </button>
          <button type="button" className={`trip-side-btn ${activeRoutePanel === 'summary' ? 'active' : ''}`} onClick={() => toggleRoutePanel('summary')}>
            Best Route
          </button>
          <button type="button" className={`trip-side-btn ${activeRoutePanel === 'alternatives' ? 'active' : ''}`} onClick={() => toggleRoutePanel('alternatives')}>
            Options
          </button>
          <button type="button" className={`trip-side-btn ${activeRoutePanel === 'steps' ? 'active' : ''}`} onClick={() => toggleRoutePanel('steps')}>
            Steps
          </button>
          <button type="button" className="trip-side-btn utility" onClick={() => { setShowRouteTools(false); setActiveRoutePanel(null); }}>
            Hide
          </button>
        </div>
      )}

      {activeTrip && !showRouteTools && (
        <button type="button" className="trip-side-restore-btn fade-in" onClick={() => setShowRouteTools(true)}>
          Show Routes
        </button>
      )}

      {activeRoutePanel && (
        <div className="trip-side-panel fade-in" style={getOverlayStyle('panel')}>
          {activeRoutePanel === 'summary' && (
            <>
              <div className="trip-side-panel-head">
                <span>Best Route</span>
                <div className="overlay-card-controls">
                  <button type="button" onClick={() => setActiveRoutePanel(null)}>Close</button>
                  <button
                    type="button"
                    className="overlay-drag-handle"
                    onMouseDown={startOverlayDrag('panel')}
                    onTouchStart={startOverlayDrag('panel')}
                  >
                    Drag
                  </button>
                </div>
              </div>
              <div className="trip-mode-selector">
                {routeModes.map((mode) => {
                  const estimate = modeEstimates.find((item) => item.profile === mode.key);
                  const isSelected = routeMode === mode.key;

                  return (
                    <button
                      key={mode.key}
                      type="button"
                      className={`trip-mode-chip ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleModeSelection(mode.key)}
                      disabled={mapLoading}
                    >
                      <span>{mode.label}</span>
                      <small>{estimate ? formatDuration(estimate.duration_seconds) : '--'}</small>
                    </button>
                  );
                })}
              </div>
              <div className="trip-guidance-card">
                <span className="trip-guidance-label">{selectedModeMeta.label}</span>
                <h4>{routeMode === 'mapbox/driving-traffic' ? 'Traffic-aware route selected' : 'Step-by-step route ready'}</h4>
                <p>{routeSummary?.summary || activeModeEta?.summary || 'EduRoute will use the latest route guidance for this trip.'}</p>
              </div>
            </>
          )}

          {activeRoutePanel === 'alternatives' && (
            <>
              <div className="trip-side-panel-head">
                <span>Alternative Routes</span>
                <div className="overlay-card-controls">
                  <button type="button" onClick={() => setActiveRoutePanel(null)}>Close</button>
                  <button
                    type="button"
                    className="overlay-drag-handle"
                    onMouseDown={startOverlayDrag('panel')}
                    onTouchStart={startOverlayDrag('panel')}
                  >
                    Drag
                  </button>
                </div>
              </div>
              <div className="trip-guidance-card compact">
                <span className="trip-guidance-label">Other Options</span>
                {activeAlternatives.length ? (
                  activeAlternatives.map((alternative, index) => (
                    <button
                      key={`${alternative.profile}-${index}`}
                      type="button"
                      className={`trip-alt-row ${selectedAlternativeIndex === index ? 'selected' : ''}`}
                      onClick={() => handleAlternativeSelection(index)}
                    >
                      <strong>Option {index + 2}</strong>
                      <span>{formatDuration(alternative.duration_seconds)} • {formatDistance(alternative.distance_meters)}</span>
                    </button>
                  ))
                ) : (
                  <p>No faster alternate route is currently available.</p>
                )}
              </div>
            </>
          )}

          {activeRoutePanel === 'steps' && (
            <>
              <div className="trip-side-panel-head">
                <span>Travel Steps</span>
                <div className="overlay-card-controls">
                  <button type="button" onClick={() => setActiveRoutePanel(null)}>Close</button>
                  <button
                    type="button"
                    className="overlay-drag-handle"
                    onMouseDown={startOverlayDrag('panel')}
                    onTouchStart={startOverlayDrag('panel')}
                  >
                    Drag
                  </button>
                </div>
              </div>
              <div className="trip-steps-panel side">
                <div className="trip-steps-head">
                  <span>Turn-by-turn guidance</span>
                  <small>{activeSteps.length ? `${activeSteps.length} steps` : 'Instructions will appear after routing'}</small>
                </div>
                <div className="trip-steps-list">
                  {activeSteps.length ? activeSteps.map((step, index) => (
                    <button
                      type="button"
                      key={`${step.instruction}-${index}`}
                      className={`trip-step-item ${highlightedStepIndex === index ? 'selected' : ''}`}
                      onClick={() => handleStepSelection(step, index)}
                    >
                      <div className="trip-step-index">{index + 1}</div>
                      <div className="trip-step-copy">
                        <strong>{step.instruction || 'Continue on your current road'}</strong>
                        <span>{step.name || 'Unnamed road'} • {formatDistance(step.distance_meters)}</span>
                      </div>
                    </button>
                  )) : (
                    <div className="trip-step-empty">
                      Select a destination and start a trip to see step-by-step instructions.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <BottomNav active="map" setView={setView} />
    </div>
  );
};

const DEPT_NAMES = {
  CCS: 'College of Computer Studies',
  CBA: 'College of Business and Accountancy',
  CEAS: 'College of Education, Arts and Sciences',
  CHTM: 'College of Hospitality and Tourism Management',
  CAHS: 'College of Allied Health Studies',
};

const ProfileView = ({ setView, profileData, onLogout }) => {
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [facultyProfile, setFacultyProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const formatProfileApiMessage = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(formatProfileApiMessage).filter(Boolean).join('\n');
    if (typeof value === 'object') {
      return Object.values(value).map(formatProfileApiMessage).filter(Boolean).join('\n');
    }
    return String(value);
  };

  useEffect(() => {
    const loadFacultyProfile = async () => {
      setProfileLoading(true);

      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
          },
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(formatProfileApiMessage(data.errors) || formatProfileApiMessage(data.message) || 'Failed to load profile.');
        }

        setFacultyProfile(data.data);
      } catch (error) {
        alert(error.message);
      } finally {
        setProfileLoading(false);
      }
    };

    loadFacultyProfile();
  }, []);

  const displayName = facultyProfile?.full_name || (profileLoading ? 'Loading...' : profileData.fullName);
  const displayDepartment = facultyProfile?.department_name || (profileLoading ? 'Loading...' : profileData.department);
  const displayEmployeeId = facultyProfile?.employee_id || (profileLoading ? 'Loading...' : 'Unavailable');

  return (
    <div className="dashboard-wrapper">
      <div className="content fade-in dash-content profile-content">

        <div className="slip-top-nav">
          <div className="slip-nav-left" onClick={() => setView('dashboard')}>
            <BackArrowIcon color="var(--green)" />
            <span className="dash-logo-text">EduRoute</span>
          </div>
          <div className="dash-avatar">
            <img src={profileData.image} alt="Faculty Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>

        <div className="profile-header-card">
          <div className="profile-bg-wrapper">
            <div className="profile-bg-shape"></div>
          </div>
          <div className="profile-image-container">
            <div className="profile-image-wrapper">
              <img src={profileData.image} alt="Faculty Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div className="faculty-badge">FACULTY</div>
          </div>

          <h1 className="profile-name">{displayName}</h1>
          <p className="profile-dept">{displayDepartment}</p>

          <div className="profile-id-pill">
            <IdBadgeIcon color="currentColor" />
            <span>ID: {displayEmployeeId}</span>
          </div>
        </div>

        <div className="profile-section-title">
          ACCOUNT ADMINISTRATION
        </div>

        <div className="profile-menu-list">
          <div className="profile-menu-item" onClick={() => setView('edit-profile')}>
            <div className="profile-menu-icon" style={{ background: 'rgba(162, 218, 115, 0.2)' }}>
              <ProfileEditIcon color="var(--green)" />
            </div>
            <span className="profile-menu-text">Edit Profile</span>
            <ChevronRightIcon color="var(--text-light)" />
          </div>

          <div className="profile-menu-item" onClick={() => setView('change-password')}>
            <div className="profile-menu-icon" style={{ background: 'rgba(162, 218, 115, 0.2)' }}>
              <PasswordIcon color="var(--green)" />
            </div>
            <span className="profile-menu-text">Change Password</span>
            <ChevronRightIcon color="var(--text-light)" />
          </div>

          <div className="profile-menu-item" onClick={() => setView('notification-settings')}>
            <div className="profile-menu-icon" style={{ background: 'rgba(162, 218, 115, 0.2)' }}>
              <NotificationIcon color="var(--green)" />
            </div>
            <span className="profile-menu-text">Notifications Settings</span>
            <ChevronRightIcon color="var(--text-light)" />
          </div>

          <div className="profile-menu-item" onClick={() => setView('privacy-security')}>
            <div className="profile-menu-icon" style={{ background: 'rgba(162, 218, 115, 0.2)' }}>
              <PrivacyIcon color="var(--green)" />
            </div>
            <span className="profile-menu-text">Privacy</span>
            <ChevronRightIcon color="var(--text-light)" />
          </div>
        </div>

        <button type="button" className="session-logout-btn" onClick={() => setShowLogoutModal(true)}>
          <LogoutIcon color="white" /> LOGOUT SESSION
        </button>

        <div className="profile-version-text">
          VERSION 2.4.0 • BUILT FOR EXCELLENCE
        </div>

      </div>
      <BottomNav active="profile" setView={setView} />

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="modal-overlay fade-in">
          <div className="logout-modal-card">
            <div className="logout-icon-container">
              <LogoutIcon color="var(--green)" />
              <div className="logout-cap-badge">
                <GraduationCapIcon color="#1A202C" />
              </div>
            </div>

            <h2 className="logout-modal-title">Are you sure you want<br />to logout?</h2>
            <p className="logout-modal-desc">
              You will be securely logged out of the <span className="text-green">EduRoute Faculty Portal</span>. Any unsaved academic progress may be lost.
            </p>

            <button className="logout-confirm-btn" onClick={onLogout}>
              Yes, Logout <ArrowRightIcon color="white" />
            </button>
            <button className="logout-cancel-btn" onClick={() => setShowLogoutModal(false)}>
              Cancel
            </button>

            <div className="modal-dots">
              <div className="dot green-dot-pill"></div>
              <div className="dot grey-dot"></div>
              <div className="dot yellow-dot"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ScanView = ({ setView, profileData, selectedSlip }) => {
  const targetLocation = selectedSlip?.destination || 'Select an approved locator slip from Status';
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const verificationFileInputRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraMode, setCameraMode] = useState('idle');
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [capturedPreview, setCapturedPreview] = useState('');
  const [submittedPhotoUrl, setSubmittedPhotoUrl] = useState('');
  const [cameraMessage, setCameraMessage] = useState('');
  const [verificationUploading, setVerificationUploading] = useState(false);

  useEffect(() => {
    if (selectedSlip && selectedSlip.status !== 'approved') {
      localStorage.removeItem('edurouteVerifySlipId');
      localStorage.setItem('edurouteLastView', 'locator-slip-detail');
      setView('locator-slip-detail');
    }
  }, [selectedSlip, setView]);

  const formatScanApiMessage = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(formatScanApiMessage).filter(Boolean).join('\n');
    if (typeof value === 'object') return Object.values(value).map(formatScanApiMessage).filter(Boolean).join('\n');
    return String(value);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
      if (capturedPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(capturedPreview);
      }
    };
  }, [capturedPreview]);

  const startCamera = async () => {
    setCameraMessage('');

    if (!selectedSlip) {
      setCameraMessage('Open an approved locator slip from Status before verifying your location.');
      return;
    }

    if (selectedSlip.status !== 'approved') {
      setCameraMessage('Only approved locator slips can be verified by location photo.');
      return;
    }

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraMessage('Live camera preview requires HTTPS on phones. Opening your device camera as a secure fallback.');
      localStorage.setItem('edurouteVerifySlipId', selectedSlip.id);
      localStorage.setItem('edurouteLastView', 'scan');
      verificationFileInputRef.current?.click();
      return;
    }

    try {
      setCameraMode('requesting');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraMode('camera');
    } catch (error) {
      setCameraMode('idle');

      if (error.name === 'NotAllowedError') {
        setCameraMessage('Camera permission was denied. Enable camera access in your browser settings to verify this location.');
      } else if (error.name === 'NotFoundError') {
        setCameraMessage('No camera was found on this device.');
      } else {
        setCameraMessage('Unable to open the camera. Please try again.');
      }
    }
  };

  const captureLocationPhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      setCameraMessage('Camera preview is not ready yet.');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraMessage('Failed to capture photo. Please try again.');
        return;
      }

      const file = new File([blob], `location-verification-${selectedSlip.id}.jpg`, {
        type: 'image/jpeg',
      });

      stopCamera();

      if (capturedPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(capturedPreview);
      }

      setCapturedPhoto(file);
      setCapturedPreview(URL.createObjectURL(file));
      setCameraMode('preview');
      setCameraMessage('Review the photo. Retake it if the location is unclear.');
    }, 'image/jpeg', 0.92);
  };

  const retakeLocationPhoto = async () => {
    if (capturedPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(capturedPreview);
    }

    setCapturedPhoto(null);
    setCapturedPreview('');
    await startCamera();
  };

  const handleVerificationFile = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setCameraMessage('Please capture or choose a valid image file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setCameraMessage('Image is too large. Maximum file size is 10MB.');
      return;
    }

    stopCamera();

    if (capturedPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(capturedPreview);
    }

    setCapturedPhoto(file);
    setCapturedPreview(URL.createObjectURL(file));
    setCameraMode('preview');
    setCameraMessage('Review the photo. Retake it if the location is unclear.');
    event.target.value = '';
  };

  const cancelCamera = () => {
    stopCamera();
    setCameraMode('idle');
    setCameraMessage('');
  };

  const uploadLocationPhoto = async () => {
    if (!capturedPhoto || !selectedSlip) return;

    setVerificationUploading(true);
    setCameraMessage('');

    try {
      const formData = new FormData();
      formData.append('verification_photo', capturedPhoto);

      const response = await fetch(`${API_BASE_URL}/api/locator-slips/${selectedSlip.id}/verify-location`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(formatScanApiMessage(data.errors) || formatScanApiMessage(data.message) || 'Failed to upload location verification photo.');
      }

      setCameraMode('uploaded');
      setSubmittedPhotoUrl(data.data?.verification?.image_url || capturedPreview);
      localStorage.removeItem('edurouteVerifySlipId');
      setCameraMessage(formatScanApiMessage(data.message) || 'Location verification photo uploaded successfully.');
    } catch (error) {
      setCameraMessage(error.message);
    } finally {
      setVerificationUploading(false);
    }
  };

  return (
    <div className="dashboard-wrapper scan-wrapper">
      <div className="content fade-in dash-content scan-content">

        <div className="slip-top-nav scan-top-nav">
          <div className="slip-nav-left" onClick={() => setView('status')}>
            <BackArrowIcon color="var(--green)" />
            <span className="dash-logo-text">EduRoute</span>
          </div>
          <div className="dash-avatar" onClick={() => setView('profile')} style={{ cursor: 'pointer' }}>
            <img src={profileData.image} alt="Faculty Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>

        <div className="location-verification-header">
          <h1>Location Verification</h1>
          <p>Capture a photo of your current location to verify your locator slip.</p>
          <div className="target-location-card">
            <LocationPinIcon color="#6ee07a" />
            <span>TARGET LOCATION: {targetLocation.toUpperCase()}</span>
          </div>
        </div>

        <div className="location-camera-stage">
          <div className="location-camera-frame">
            {cameraMode === 'idle' && (
              <button type="button" className="camera-open-btn" onClick={startCamera}>
                Use Camera
              </button>
            )}
            {cameraMode === 'requesting' && (
              <div className="camera-state-text">Requesting camera permission...</div>
            )}
            {cameraMode === 'camera' && (
              <video ref={videoRef} className="location-camera-video" playsInline muted />
            )}
            {['preview', 'uploaded'].includes(cameraMode) && capturedPreview && (
              <img src={capturedPreview} alt="Captured location preview" className="location-camera-preview" />
            )}
            {cameraMode === 'uploaded' && (
              <div className="camera-uploaded-badge">Submitted</div>
            )}
            <div className="scanner-corner top-left"></div>
            <div className="scanner-corner top-right"></div>
            <div className="scanner-corner bottom-left"></div>
            <div className="scanner-corner bottom-right"></div>
          </div>
        </div>

        {cameraMessage && <div className="location-camera-message">{cameraMessage}</div>}

        <div className="location-camera-text-actions">
          {cameraMode === 'idle' && (
            <button type="button" onClick={startCamera}>
              Open Phone Camera
            </button>
          )}
          {cameraMode === 'camera' && (
            <>
              <button type="button" onClick={captureLocationPhoto}>
                Capture Photo
              </button>
              <button type="button" className="secondary" onClick={cancelCamera}>
                Cancel
              </button>
            </>
          )}
          {cameraMode === 'preview' && (
            <>
              <button type="button" onClick={uploadLocationPhoto} disabled={verificationUploading}>
                {verificationUploading ? 'Uploading...' : 'Upload Image'}
              </button>
              <button type="button" className="secondary" onClick={retakeLocationPhoto} disabled={verificationUploading}>
                Retake
              </button>
            </>
          )}
          {cameraMode === 'uploaded' && (
            <span>Verification photo submitted</span>
          )}
        </div>

        {cameraMode === 'uploaded' && (
          <div className="location-submitted-card">
            <span className="location-submitted-kicker">UPLOADED PHOTO</span>
            <h2>Location Verification Submitted</h2>
            <p>Your photo has been uploaded and attached to this locator slip for review.</p>
            {submittedPhotoUrl && (
              <img src={submittedPhotoUrl} alt="Uploaded location verification" />
            )}
            <div className="location-submitted-actions">
              <button type="button" onClick={() => setView('status')}>
                Back to Status
              </button>
              <button type="button" className="secondary" onClick={() => setView('dashboard')}>
                Dashboard
              </button>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} hidden />
        <input
          ref={verificationFileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={handleVerificationFile}
        />
      </div>
      <BottomNav active="status" setView={setView} />
    </div>
  );
};

const SlipSubmittedView = ({ setView, profileData }) => (
  <div className="dashboard-wrapper submitted-wrapper">
    <div className="content fade-in dash-content">

      <div className="slip-top-nav">
        <div className="slip-nav-left" onClick={() => setView('dashboard')}>
          <BackArrowIcon color="var(--green)" />
          <span className="dash-logo-text">EduRoute</span>
        </div>
        <div className="dash-avatar" onClick={() => setView('profile')} style={{ cursor: 'pointer' }}>
          <img src={profileData.image} alt="Faculty Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </div>

      <div className="submitted-graphic-container">
        <div className="graphic-circle-dashed">
          <div className="graphic-circle-solid">
            <HourglassIcon color="var(--green)" />
          </div>
          <div className="graphic-shield-badge">
            <ShieldCheckSmallIcon color="white" />
          </div>
        </div>
      </div>

      <div className="submitted-status-text">
        <div className="status-pill-yellow">
          STATUS: PENDING APPROVAL
        </div>
        <h2>Verification in <span className="text-green">Progress</span></h2>
        <p>Your request is being reviewed. The EduRoute administration is currently verifying your faculty credentials.</p>
      </div>

      <div className="progress-bar-container">
        <div className="progress-track">
          <div className="progress-fill"></div>
        </div>
        <div className="progress-points">
          <div className="progress-point active">
            <div className="point-dot green-dot-solid"></div>
            <span className="point-label">APPLIED</span>
          </div>
          <div className="progress-point current">
            <div className="point-icon-wrapper yellow-bg">
              <ProgressReviewIcon color="var(--text-dark)" />
            </div>
            <span className="point-label green-label">REVIEW</span>
          </div>
          <div className="progress-point pending">
            <div className="point-dot grey-dot-solid"></div>
            <span className="point-label">ACTIVE</span>
          </div>
        </div>
      </div>

      <div className="info-cards-container">
        <div className="info-card">
          <div className="info-icon green-light-bg">
            <FilledClockIcon color="var(--green)" />
          </div>
          <div className="info-text">
            <h4>Estimated Time</h4>
            <p>Typically verified within 20-60 business minutes.</p>
          </div>
        </div>

        <div className="info-card">
          <div className="info-icon yellow-light-bg">
            <HelpIcon color="#B88A00" />
          </div>
          <div className="info-text">
            <h4>Need Help?</h4>
            <p>Contact support at faculty@eduroute.edu</p>
          </div>
        </div>
      </div>

      <button className="cancel-request-btn" onClick={() => setView('dashboard')}>
        CANCEL REQUEST
      </button>

      <div className="referral-id">
        REFERRAL ID: FAC-9921-XPR
      </div>

    </div>
    <BottomNav active="slips" setView={setView} />
  </div>
);

const PolicyCheckIcon = ({ met }) => (
  met ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="11" fill="var(--green)" />
      <path d="M7 12L10.5 15L17 8.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="11" fill="#E5E7EB" />
      <path d="M8 8L16 16M16 8L8 16" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
);

const LinkIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-light)' }}>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
  </svg>
);

const ChangePasswordView = ({ setView, profileData, backView = 'profile' }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const isDesktopViewport = useDesktopWorkspaceViewport();
  const accountRole = profileData?.accountRole || '';
  const position = getPortalPositionLabel(profileData);
  const metaLabel = getPortalMetaLabel(profileData);
  const badgeLabel = getPortalBadgeLabel(accountRole);

  const personalInfo = ['alex', 'nilo', 'eduroute', 'edu-2024', '8891'];

  const policy = useMemo(() => {
    const pw = newPassword.toLowerCase();
    return {
      minLength: newPassword.length >= 10,
      symbolsNumbers: /[0-9]/.test(newPassword) && /[^a-zA-Z0-9\s]/.test(newPassword),
      noPersonal: newPassword.length > 0 && !personalInfo.some(info => pw.includes(info)),
    };
  }, [newPassword]);

  const allPoliciesMet = policy.minLength && policy.symbolsNumbers && policy.noPersonal;
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canUpdatePassword = allPoliciesMet && passwordsMatch && currentPassword.length > 0 && !changePasswordLoading;

  const formatChangePasswordApiMessage = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(formatChangePasswordApiMessage).filter(Boolean).join('\n');
    if (typeof value === 'object') {
      return Object.values(value).map(formatChangePasswordApiMessage).filter(Boolean).join('\n');
    }
    return String(value);
  };

  const handleChangePassword = async () => {
    if (!canUpdatePassword) return;

    setChangePasswordLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(formatChangePasswordApiMessage(data.errors) || formatChangePasswordApiMessage(data.message) || 'Failed to change password.');
      }

      alert(formatChangePasswordApiMessage(data.message) || 'Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setView(backView);
    } catch (error) {
      alert(error.message);
    } finally {
      setChangePasswordLoading(false);
    }
  };

  const desktopChangePasswordContent = (
    <section className="portal-settings-desktop">
      <div className="portal-settings-desktop-header">
        <div>
          <button type="button" className="portal-settings-back-btn" onClick={() => setView(backView)}>
            <BackArrowIcon color="var(--green)" />
            <span>Back to Profile</span>
          </button>
          <span className="portal-settings-desktop-kicker">Security Credentials</span>
          <h1>Change Password</h1>
          <p>Refresh your account credentials and keep your portal access protected.</p>
        </div>
      </div>

      <div className="portal-settings-desktop-grid">
        <aside className="portal-settings-desktop-profile-card">
          <div className="portal-settings-desktop-profile-avatar">
            <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt={profileData?.fullName || 'Profile'} />
          </div>
          <div className="portal-settings-desktop-profile-badge">{badgeLabel}</div>
          <h2>{profileData?.fullName || 'Portal User'}</h2>
          <p>{position}</p>
          <span>{metaLabel}</span>
        </aside>

        <div className="portal-settings-desktop-form-card">
          <div className="portal-settings-desktop-section-title">
            <strong>Password Policy</strong>
            <span>Use a strong password that follows the institutional security policy.</span>
          </div>

          <div className="portal-settings-policy-card">
            <div className={`chpw-policy-item ${newPassword.length === 0 ? '' : policy.minLength ? 'met' : 'unmet'}`}>
              <PolicyCheckIcon met={newPassword.length === 0 ? true : policy.minLength} />
              <span>Minimum 10 characters</span>
            </div>
            <div className={`chpw-policy-item ${newPassword.length === 0 ? '' : policy.symbolsNumbers ? 'met' : 'unmet'}`}>
              <PolicyCheckIcon met={newPassword.length === 0 ? true : policy.symbolsNumbers} />
              <span>Include symbols & numbers</span>
            </div>
            <div className={`chpw-policy-item ${newPassword.length === 0 ? '' : policy.noPersonal ? 'met' : 'unmet'}`}>
              <PolicyCheckIcon met={newPassword.length === 0 ? true : policy.noPersonal} />
              <span>No personal information</span>
            </div>
          </div>

          <div className="portal-settings-desktop-fields">
            <div className="portal-settings-desktop-field">
              <label>Current Password</label>
              <div className="chpw-input-wrapper portal-settings-input-wrapper">
                <input
                  type={showCurrentPw ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                />
                <button type="button" className="icon-btn chpw-eye-btn" onClick={() => setShowCurrentPw(!showCurrentPw)}>
                  {showCurrentPw ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div className="portal-settings-desktop-field">
              <label>New Password</label>
              <div className="chpw-card-input-wrapper portal-settings-input-wrapper">
                <input
                  type={showNewPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter complex password"
                />
                <button type="button" className="icon-btn chpw-eye-btn" onClick={() => setShowNewPw(!showNewPw)}>
                  {showNewPw ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div className="portal-settings-desktop-field">
              <label>Confirm Password</label>
              <div className={`chpw-card-input-wrapper portal-settings-input-wrapper ${confirmPassword.length > 0 ? (passwordsMatch ? 'match' : 'mismatch') : ''}`}>
                <input
                  type={showConfirmPw ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                />
                <button type="button" className="icon-btn chpw-eye-btn" onClick={() => setShowConfirmPw(!showConfirmPw)}>
                  {showConfirmPw ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {confirmPassword.length > 0 && !passwordsMatch && (
                <span className="chpw-mismatch-text">Passwords do not match</span>
              )}
            </div>
          </div>

          <div className="portal-settings-desktop-actions">
            <button
              type="button"
              className={`chpw-update-btn portal-settings-save-btn ${canUpdatePassword ? 'active' : ''}`}
              disabled={!canUpdatePassword}
              onClick={handleChangePassword}
            >
              <LinkIcon /> {changePasswordLoading ? 'UPDATING...' : 'UPDATE PASSWORD'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );

  if ((accountRole === 'hrmu' || accountRole === 'cssu') && isDesktopViewport) {
    if (accountRole === 'hrmu') {
      return (
        <HrmuWorkspaceShell activeKey="" setView={setView} profileData={profileData} onLogout={() => setView(backView)}>
          <section className="cssu-desktop-page">{desktopChangePasswordContent}</section>
        </HrmuWorkspaceShell>
      );
    }

    return (
      <CSSUDesktopPage activeKey="" setView={setView} profileData={profileData} onLogout={() => setView(backView)} hideHeader>
        {desktopChangePasswordContent}
      </CSSUDesktopPage>
    );
  }

  return (
    <div className="dashboard-wrapper">
      <div className="content fade-in dash-content chpw-content">

        <div className="slip-top-nav chpw-top-nav">
          <div className="slip-nav-left" onClick={() => setView(backView)}>
            <BackArrowIcon color="var(--green)" />
            <span className="dash-logo-text chpw-nav-title">Account Settings</span>
          </div>
          <div className="dash-avatar">
            <img src={profileData.image} alt="Faculty Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>

        <div className="chpw-divider-line"></div>

        <div className="chpw-header">
          <h1 className="chpw-title">Security Credentials</h1>
          <p className="chpw-subtitle">Update your password to ensure your faculty account remains secure and private.</p>
        </div>

        {/* Password Policy Card */}
        <div className="chpw-policy-card">
          <div className="chpw-policy-header">
            <ShieldSolidIcon color="var(--green)" size="18" />
            <span>PASSWORD POLICY</span>
          </div>
          <div className="chpw-policy-list">
            <div className={`chpw-policy-item ${newPassword.length === 0 ? '' : policy.minLength ? 'met' : 'unmet'}`}>
              <PolicyCheckIcon met={newPassword.length === 0 ? true : policy.minLength} />
              <span>Minimum 10 characters</span>
            </div>
            <div className={`chpw-policy-item ${newPassword.length === 0 ? '' : policy.symbolsNumbers ? 'met' : 'unmet'}`}>
              <PolicyCheckIcon met={newPassword.length === 0 ? true : policy.symbolsNumbers} />
              <span>Include symbols & numbers</span>
            </div>
            <div className={`chpw-policy-item ${newPassword.length === 0 ? '' : policy.noPersonal ? 'met' : 'unmet'}`}>
              <PolicyCheckIcon met={newPassword.length === 0 ? true : policy.noPersonal} />
              <span>No personal information</span>
            </div>
          </div>
        </div>

        {/* Security Quote Card */}
        <div className="chpw-quote-card">
          <p>"Your security is our priority in the EduRoute academic ecosystem."</p>
          <div className="chpw-quote-shield">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" opacity="0.12">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="var(--green)" />
            </svg>
          </div>
        </div>

        {/* Current Password */}
        <div className="chpw-field-section">
          <label className="chpw-label">CURRENT PASSWORD</label>
          <div className="chpw-input-wrapper">
            <input
              type={showCurrentPw ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••••••"
            />
            <button type="button" className="icon-btn chpw-eye-btn" onClick={() => setShowCurrentPw(!showCurrentPw)}>
              {showCurrentPw ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        {/* New Password + Confirm */}
        <div className="chpw-new-pw-card">
          <div className="chpw-new-pw-field">
            <label className="chpw-label">NEW PASSWORD</label>
            <div className="chpw-card-input-wrapper">
              <input
                type={showNewPw ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter complex password"
              />
              <button type="button" className="icon-btn chpw-eye-btn" onClick={() => setShowNewPw(!showNewPw)}>
                {showNewPw ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div className="chpw-new-pw-field">
            <label className="chpw-label">CONFIRM PASSWORD</label>
            <div className={`chpw-card-input-wrapper ${confirmPassword.length > 0 ? (passwordsMatch ? 'match' : 'mismatch') : ''}`}>
              <input
                type={showConfirmPw ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-type new password"
              />
              <button type="button" className="icon-btn chpw-eye-btn" onClick={() => setShowConfirmPw(!showConfirmPw)}>
                {showConfirmPw ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {confirmPassword.length > 0 && !passwordsMatch && (
              <span className="chpw-mismatch-text">Passwords do not match</span>
            )}
          </div>
        </div>

        <button
          type="button"
          className={`chpw-update-btn ${canUpdatePassword ? 'active' : ''}`}
          disabled={!canUpdatePassword}
          onClick={handleChangePassword}
        >
          <LinkIcon /> {changePasswordLoading ? 'UPDATING...' : 'UPDATE PASSWORD'}
        </button>

        <div className="chpw-lost-access">
          FORGOT CURRENT PASSWORD? <span onClick={() => setView('forgot-password')}>RESET PASSWORD</span>
        </div>

      </div>
      <BottomNav active="profile" setView={setView} />
    </div>
  );
};

const BellRingIcon = ({ color = "currentColor" }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    <path d="M2 8c0-2.2.7-4.3 2-6" />
    <path d="M22 8a10 10 0 0 0-2-6" />
  </svg>
);

const RefreshIcon = ({ color = "currentColor" }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const SaveIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);

const ToggleSwitch = ({ isOn, onToggle }) => (
  <div className={`notif-toggle ${isOn ? 'on' : 'off'}`} onClick={onToggle}>
    <div className="notif-toggle-thumb" />
  </div>
);

const NotificationSettingsView = ({ setView, profileData }) => {
  const [approvalNotifs, setApprovalNotifs] = useState(false);
  const [reminderAlerts, setReminderAlerts] = useState(true);
  const [systemUpdates, setSystemUpdates] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState('unknown');
  const [notificationSettingsLoading, setNotificationSettingsLoading] = useState(false);

  const formatNotificationApiMessage = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(formatNotificationApiMessage).filter(Boolean).join('\n');
    if (typeof value === 'object') {
      return Object.values(value).map(formatNotificationApiMessage).filter(Boolean).join('\n');
    }
    return String(value);
  };

  const notificationAuthHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
  });

  useEffect(() => {
    const loadNotificationPreference = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/permissions/me`, {
          headers: notificationAuthHeaders(),
        });
        const data = await response.json();

        if (!response.ok) return;

        const status = data.data?.notifications_status || 'unknown';
        setNotificationStatus(status);
        setApprovalNotifs(status === 'granted');
      } catch (error) {
        console.error('Failed to load notification preference:', error);
      }
    };

    loadNotificationPreference();
  }, []);

  const saveNotificationStatus = async (status) => {
    const response = await fetch(`${API_BASE_URL}/api/permissions/me`, {
      method: 'PATCH',
      headers: notificationAuthHeaders(),
      body: JSON.stringify({
        notifications_status: status,
        first_login_setup_completed: true,
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(formatNotificationApiMessage(data.errors) || formatNotificationApiMessage(data.message) || 'Failed to update notifications.');
    }

    setNotificationStatus(data.data.notifications_status);
    setApprovalNotifs(data.data.notifications_status === 'granted');
  };

  const handleApprovalNotificationToggle = async () => {
    if (notificationSettingsLoading) return;

    setNotificationSettingsLoading(true);

    try {
      if (approvalNotifs) {
        await saveNotificationStatus('dismissed');
        return;
      }

      let status = 'unsupported';

      if ('Notification' in window) {
        if (Notification.permission === 'granted') {
          status = 'granted';
        } else if (Notification.permission === 'denied') {
          status = 'denied';
        } else {
          const browserPermission = await Notification.requestPermission();
          status = browserPermission === 'default' ? 'dismissed' : browserPermission;
        }
      }

      await saveNotificationStatus(status);

      if (status === 'denied') {
        alert('Notifications are blocked for this browser. Open browser site settings and allow notifications for EduRoute.');
      } else if (status === 'unsupported') {
        alert('This browser does not support web notifications.');
      } else if (status === 'dismissed') {
        alert('Notification permission was not enabled. You can try again later.');
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setNotificationSettingsLoading(false);
    }
  };

  return (
    <div className="dashboard-wrapper">
      <div className="content fade-in dash-content notif-content">

        <div className="slip-top-nav chpw-top-nav">
          <div className="slip-nav-left" onClick={() => setView('profile')}>
            <BackArrowIcon color="var(--green)" />
            <span className="dash-logo-text chpw-nav-title">Account Settings</span>
          </div>
          <div className="dash-avatar">
            <img src={profileData.image} alt="Faculty Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>

        <div className="chpw-divider-line" />

        <div className="notif-header">
          <span className="notif-label-green">PREFERENCES</span>
          <h1 className="notif-title">Notification<br />Control Center</h1>
          <p className="notif-subtitle">Manage how you receive alerts for approvals, schedules, and faculty updates.</p>
        </div>

        {/* Approval Notifications */}
        <div className="notif-card">
          <div className="notif-card-icon notif-icon-green">
            <ShieldCheckIcon color="var(--green)" />
          </div>
          <div className="notif-card-body">
            <h3 className="notif-card-title">Approval Notifications</h3>
            <p className="notif-card-desc">
              {approvalNotifs
                ? 'Enabled from your first-login setup. You will receive approval and request alerts on this device.'
                : `Currently ${notificationStatus}. Enable this to receive approval alerts even when EduRoute is closed.`}
            </p>
          </div>
          <ToggleSwitch isOn={approvalNotifs} onToggle={handleApprovalNotificationToggle} />
        </div>

        {/* Reminder Alerts */}
        <div className="notif-card">
          <div className="notif-card-icon notif-icon-yellow">
            <BellRingIcon color="#B88A00" />
          </div>
          <div className="notif-card-body">
            <h3 className="notif-card-title">Reminder Alerts</h3>
            <p className="notif-card-desc">Receive reminders for upcoming route starts and faculty meetings.</p>
          </div>
          <ToggleSwitch isOn={reminderAlerts} onToggle={() => setReminderAlerts(!reminderAlerts)} />
        </div>

        {/* System Updates */}
        <div className="notif-card">
          <div className="notif-card-icon notif-icon-light">
            <RefreshIcon color="var(--text-gray)" />
          </div>
          <div className="notif-card-body">
            <h3 className="notif-card-title">System Updates</h3>
            <p className="notif-card-desc">Stay informed about new app features and essential system maintenance.</p>
          </div>
          <ToggleSwitch isOn={systemUpdates} onToggle={() => setSystemUpdates(!systemUpdates)} />
        </div>

        {/* Save Changes Button */}
        <button type="button" className="notif-save-btn" onClick={() => setView('profile')}>
          <SaveIcon /> SAVE CHANGES
        </button>

      </div>
      <BottomNav active="profile" setView={setView} />
    </div>
  );
};

const CameraIcon = ({ color = "white" }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const PersonOutlineIcon = ({ color = "currentColor" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const MailIcon = ({ color = "currentColor" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

const CheckCircleIcon = ({ color = "white" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const EditProfileView = ({ setView, profileData, setProfileData, backView = 'profile', useDeanNav = false }) => {
  const [fullName, setFullName] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [departmentsList, setDepartmentsList] = useState([]);
  const [email, setEmail] = useState('');
  const [profileImage, setProfileImage] = useState(profileData.image);
  const [editProfileLoading, setEditProfileLoading] = useState(false);
  const fileInputRef = useRef(null);

  const formatEditProfileApiMessage = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(formatEditProfileApiMessage).filter(Boolean).join('\n');
    if (typeof value === 'object') {
      return Object.values(value).map(formatEditProfileApiMessage).filter(Boolean).join('\n');
    }
    return String(value);
  };

  const editProfileHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
  });

  useEffect(() => {
    const loadEditProfileData = async () => {
      setEditProfileLoading(true);

      try {
        const [profileResponse, departmentsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/auth/me`, {
            headers: editProfileHeaders(),
          }),
          fetch(`${API_BASE_URL}/api/departments`),
        ]);
        const profileJson = await profileResponse.json();
        const departmentsJson = await departmentsResponse.json();

        if (!profileResponse.ok) {
          throw new Error(formatEditProfileApiMessage(profileJson.errors) || formatEditProfileApiMessage(profileJson.message) || 'Failed to load profile.');
        }

        if (!departmentsResponse.ok) {
          throw new Error(formatEditProfileApiMessage(departmentsJson.errors) || formatEditProfileApiMessage(departmentsJson.message) || 'Failed to load departments.');
        }

        setFullName(profileJson.data.full_name || '');
        setDepartmentId(String(profileJson.data.department_id || ''));
        setEmail(profileJson.data.email || '');
        setProfileImage(profileJson.data.profile_image_url || DEFAULT_PROFILE_IMAGE);
        setDepartmentsList(departmentsJson.data || []);
      } catch (error) {
        alert(error.message);
      } finally {
        setEditProfileLoading(false);
      }
    };

    loadEditProfileData();
  }, []);

  const handleSave = async () => {
    setEditProfileLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        method: 'PATCH',
        headers: editProfileHeaders(),
        body: JSON.stringify({
          full_name: fullName,
          department_id: Number(departmentId),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(formatEditProfileApiMessage(data.errors) || formatEditProfileApiMessage(data.message) || 'Failed to update profile.');
      }

      setProfileData((prev) => ({
        ...prev,
        fullName: data.data.full_name,
        employeeId: data.data.employee_id || prev.employeeId,
        department: data.data.department_name,
        email: data.data.email,
        image: profileImage,
        accountRole: data.data.account_role || prev.accountRole,
      }));
      alert(data.message);
      setView(backView);
    } catch (error) {
      alert(error.message);
    } finally {
      setEditProfileLoading(false);
    }
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const uploadProfileImage = async () => {
        setEditProfileLoading(true);

        try {
          const formData = new FormData();
          formData.append('profile_image', file);

          const response = await fetch(`${API_BASE_URL}/api/auth/me/profile-picture`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
            },
            body: formData,
          });
          const data = await response.json();

          if (!response.ok) {
            throw new Error(formatEditProfileApiMessage(data.errors) || formatEditProfileApiMessage(data.message) || 'Failed to upload profile picture.');
          }

          const imageUrl = data.data.profile_image_url;
          setProfileImage(imageUrl);
          setProfileData((prev) => ({
            ...prev,
            image: imageUrl,
          }));
          alert(data.message);
        } catch (error) {
          alert(error.message);
        } finally {
          setEditProfileLoading(false);
          e.target.value = '';
        }
      };

      uploadProfileImage();
    }
  };

  return (
    <div className="dashboard-wrapper">
      <div className="content fade-in dash-content editp-content">

        <div className="slip-top-nav chpw-top-nav">
          <div className="slip-nav-left" onClick={() => setView(backView)}>
            <BackArrowIcon color="var(--green)" />
            <span className="dash-logo-text chpw-nav-title">Account Settings</span>
          </div>
          <div className="dash-avatar">
            <img src={profileImage} alt="Faculty Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>

        <div className="chpw-divider-line" />

        <div className="editp-header">
          <span className="editp-badge">FACULTY IDENTITY</span>
          <h1 className="editp-title">Edit Your Profile</h1>
          <p className="editp-subtitle">Manage your professional presence across the EduRoute academic ecosystem.</p>
        </div>

        {/* Profile Photo */}
        <div className="editp-photo-section">
          <div className="editp-photo-wrapper">
            <img src={profileImage} alt="Profile" />
            <button
              type="button"
              className="editp-camera-btn"
              onClick={() => fileInputRef.current.click()}
            >
              <CameraIcon />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handlePhotoChange}
            />
          </div>
        </div>

        {/* Full Name */}
        <div className="editp-field">
          <label className="editp-label">FULL NAME</label>
          <div className="editp-input-wrapper">
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <PersonOutlineIcon color="var(--text-light)" />
          </div>
        </div>

        {/* Department */}
        <div className="editp-field">
          <label className="editp-label">DEPARTMENT</label>
          <div className="editp-input-wrapper editp-select-wrapper">
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="" disabled>Select Department</option>
              {departmentsList.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.department_name}
                </option>
              ))}
            </select>
            <div className="editp-select-icon">
              <ChevronDownIcon />
            </div>
          </div>
        </div>

        {/* Academic Email */}
        <div className="editp-field">
          <label className="editp-label">ACADEMIC EMAIL</label>
          <div className="editp-input-wrapper">
            <input
              type="email"
              value={email}
              disabled
              readOnly
            />
            <MailIcon color="var(--text-light)" />
          </div>
        </div>

        {/* Save Changes Button */}
        <button
          type="button"
          className="editp-save-btn"
          onClick={handleSave}
          disabled={editProfileLoading || !fullName.trim() || !departmentId}
        >
          {editProfileLoading ? 'SAVING...' : 'SAVE CHANGES'} <CheckCircleIcon />
        </button>

      </div>
      {useDeanNav ? (
        <DeanBottomNav setView={setView} onOpenRequests={() => setView('dean-dashboard')} />
      ) : (
        <BottomNav active="profile" setView={setView} />
      )}
    </div>
  );
};

const LocationPinFilledIcon = ({ color = "var(--green)" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill={color}>
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
  </svg>
);

const PermissionsIcon = ({ color = "var(--green)" }) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const FileTextIcon = ({ color = "currentColor" }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const GlobeSmIcon = ({ color = "currentColor" }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const HelpCircleIcon = ({ color = "currentColor" }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const TrashIcon = ({ color = "currentColor" }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="9" y1="9" x2="15" y2="15" />
    <line x1="15" y1="9" x2="9" y2="15" />
  </svg>
);

const LockPrivIcon = ({ color = "currentColor" }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const PrivacySecurityView = ({ setView, profileData, mode = 'faculty' }) => {
  const [locationTracking, setLocationTracking] = useState(false);
  const [locationPermissionLoading, setLocationPermissionLoading] = useState(false);
  const [permissionPrefs, setPermissionPrefs] = useState(null);
  const [activeLegalDoc, setActiveLegalDoc] = useState(null);
  const isDeanMode = mode === 'dean';
  const backView = isDeanMode ? 'dean-profile' : 'profile';

  const formatPrivacyApiMessage = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(formatPrivacyApiMessage).filter(Boolean).join('\n');
    if (typeof value === 'object') {
      return Object.values(value).map(formatPrivacyApiMessage).filter(Boolean).join('\n');
    }
    return String(value);
  };

  const privacyAuthHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
  });

  useEffect(() => {
    const loadPermissionPrefs = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/permissions/me`, {
          headers: privacyAuthHeaders(),
        });
        const data = await response.json();

        if (!response.ok) return;
        setPermissionPrefs(data.data);
        setLocationTracking(data.data?.location_status === 'granted');
      } catch (error) {
        console.error('Failed to load permission preferences:', error);
      }
    };

    loadPermissionPrefs();
  }, []);

  const persistLocationPreference = async (locationStatus) => {
    const response = await fetch(`${API_BASE_URL}/api/permissions/me`, {
      method: 'PATCH',
      headers: privacyAuthHeaders(),
      body: JSON.stringify({
        location_status: locationStatus,
        first_login_setup_completed: true,
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(formatPrivacyApiMessage(data.errors) || formatPrivacyApiMessage(data.message) || 'Failed to update location permission settings.');
    }

    setPermissionPrefs(data.data);
    setLocationTracking(data.data?.location_status === 'granted');
    return data.data;
  };

  const requestBrowserLocationPermission = async () => {
    if (!navigator.geolocation) {
      return 'unsupported';
    }

    const queryPermissionsApi = async () => {
      if (!navigator.permissions?.query) return null;

      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        return status?.state || null;
      } catch (error) {
        return null;
      }
    };

    const existingState = await queryPermissionsApi();
    if (existingState === 'granted') {
      return 'granted';
    }
    if (existingState === 'denied') {
      return 'denied';
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve('granted'),
        (error) => {
          if (error?.code === 1) {
            resolve('denied');
            return;
          }
          if (error?.code === 2 || error?.code === 3) {
            resolve('dismissed');
            return;
          }
          resolve('dismissed');
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    });
  };

  const handleLocationTrackingToggle = async () => {
    if (locationPermissionLoading) return;

    setLocationPermissionLoading(true);

    try {
      if (locationTracking) {
        await persistLocationPreference('dismissed');
        alert('Location tracking is turned off for EduRoute. You can enable it again anytime from Privacy & Security.');
        return;
      }

      const locationStatus = await requestBrowserLocationPermission();
      await persistLocationPreference(locationStatus);

      if (locationStatus === 'granted') {
        alert('Location services are enabled. EduRoute maps can now use your device location.');
      } else if (locationStatus === 'denied') {
        alert('Location access is blocked on this device or browser. Allow Location for EduRoute in your phone or browser site settings, then try again.');
      } else if (locationStatus === 'unsupported') {
        alert('This device or browser does not support location services.');
      } else {
        alert('Location permission was not fully granted. Maps will stay restricted until location services are enabled.');
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setLocationPermissionLoading(false);
    }
  };

  const updateNotificationPermissionFromSettings = async () => {
    try {
      let notificationStatus = 'unsupported';

      if ('Notification' in window) {
        if (Notification.permission === 'granted') {
          notificationStatus = 'granted';
        } else if (Notification.permission === 'denied') {
          notificationStatus = 'denied';
        } else {
          const browserPermission = await Notification.requestPermission();
          notificationStatus = browserPermission === 'default' ? 'dismissed' : browserPermission;
        }
      }

      const response = await fetch(`${API_BASE_URL}/api/permissions/me`, {
        method: 'PATCH',
        headers: privacyAuthHeaders(),
        body: JSON.stringify({
          notifications_status: notificationStatus,
          first_login_setup_completed: true,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(formatPrivacyApiMessage(data.errors) || formatPrivacyApiMessage(data.message) || 'Failed to update permission settings.');
      }

      setPermissionPrefs(data.data);

      if (notificationStatus === 'denied') {
        alert('Notifications are blocked for this browser. Open your browser site settings for EduRoute/localhost and allow Notifications.');
      } else if (notificationStatus === 'granted') {
        await registerPushNotificationsForCurrentBrowser();
        alert(
          isDeanMode
            ? 'Notifications are enabled for this dean panel. You can now receive faculty locator slip request alerts even when EduRoute is closed.'
            : 'Notifications are enabled for this browser.'
        );
      } else if (notificationStatus === 'unsupported') {
        alert('This browser does not support web notifications.');
      } else {
        alert('Notification permission was not enabled. You can try again later.');
      }
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <div className="dashboard-wrapper">
      <div className="content fade-in dash-content priv-content">

        <div className="slip-top-nav chpw-top-nav">
          <div className="slip-nav-left" onClick={() => setView(backView)}>
            <BackArrowIcon color="var(--green)" />
            <span className="dash-logo-text chpw-nav-title">Account Settings</span>
          </div>
          <div className="dash-avatar">
            <img src={profileData.image} alt="Faculty Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>

        <div className="chpw-divider-line" />

        <div className="priv-header">
          <h1 className="priv-title">Privacy & Security</h1>
          <p className="priv-subtitle">
            {isDeanMode
              ? 'Manage notification access for dean locator slip approvals and request alerts.'
              : 'Manage your digital footprint and data preferences across the EduRoute ecosystem.'}
          </p>
        </div>

        {!isDeanMode && (
          <div className="priv-location-card">
            <div className="priv-location-left">
              <div className="priv-location-icon">
                <LocationPinFilledIcon />
              </div>
              <div className="priv-location-text">
                <h3>Location tracking</h3>
                <p>Allow EduRoute to optimize your route based on real-time transit data.</p>
              </div>
            </div>
            <ToggleSwitch isOn={locationTracking} onToggle={handleLocationTrackingToggle} />
          </div>
        )}

        {/* Permissions Card */}
        <div className="priv-permissions-card">
          <PermissionsIcon color="var(--green)" />
          <h3>Permissions</h3>
          <p>
            {isDeanMode
              ? `Notifications: ${permissionPrefs?.notifications_status || 'unknown'}. Enable alerts so the dean panel can receive locator slip requests even while EduRoute is closed.`
              : `Notifications: ${permissionPrefs?.notifications_status || 'unknown'}. Location: ${permissionPrefs?.location_status || 'unknown'}. Location and camera/photos are requested only when a feature needs them.`}
          </p>
          <button type="button" className="priv-manage-btn" onClick={updateNotificationPermissionFromSettings} disabled={locationPermissionLoading}>
            {locationPermissionLoading ? 'UPDATING...' : 'MANAGE'}
          </button>
        </div>

        {/* Authentication Layer */}
        <div className="priv-auth-section">
          <div className="priv-auth-line-group">
            <div className="priv-auth-row">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="var(--green)" /><path d="M7 12L10.5 15L17 8.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span className="priv-auth-text green">Authentication Layer</span>
            </div>
            <div className="priv-auth-row">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="var(--green)" strokeWidth="2" /><circle cx="12" cy="12" r="5" fill="var(--green)" /></svg>
              <span className="priv-auth-text green">Privacy Tier: Enhanced</span>
            </div>
            <div className="priv-auth-row">
              <LockPrivIcon color="var(--text-gray)" />
              <span className="priv-auth-text gray">Encryption: Quantum-Safe</span>
            </div>
          </div>

          <div className="priv-auth-legal-panel">
            <button type="button" className="priv-legal-item" onClick={() => setActiveLegalDoc('terms')}>
              <FileTextIcon color="var(--text-gray)" />
              <span>Terms and Conditions</span>
              <ChevronRightIcon color="var(--text-light)" />
            </button>
            <button type="button" className="priv-legal-item" onClick={() => setActiveLegalDoc('privacy')}>
              <PrivacyIcon color="var(--text-gray)" />
              <span>Privacy Policy</span>
              <ChevronRightIcon color="var(--text-light)" />
            </button>
            <button type="button" className="priv-legal-item" onClick={() => setActiveLegalDoc('dataFaq')}>
              <HelpCircleIcon color="var(--text-gray)" />
              <span>Data Usage FAQ</span>
              <ChevronRightIcon color="var(--text-light)" />
            </button>
          </div>
        </div>

        {/* Request Data Deletion */}
        <button type="button" className="priv-delete-btn">
          <TrashIcon color="#EF4444" />
          <span>REQUEST DATA DELETION</span>
        </button>

      </div>
      {isDeanMode ? <DeanBottomNav setView={setView} onOpenRequests={() => setView('dean-dashboard')} /> : <BottomNav active="profile" setView={setView} />}

      <LegalDocumentModal
        activeLegalDoc={activeLegalDoc}
        onClose={() => setActiveLegalDoc(null)}
      />
    </div>
  );
};

/* ======================================================== */
/* ADMIN DASHBOARD VIEW (Strategic Oversight)               */
/* ======================================================== */

const AdminBellIcon = ({ color = "currentColor" }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const ClipboardClockIcon = ({ color = "currentColor" }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="18" rx="2" />
    <path d="M9 2v2" /><path d="M15 2v2" />
    <circle cx="12" cy="14" r="4" />
    <path d="M12 12v2l1.5 1" />
  </svg>
);

const CheckCircleAdminIcon = ({ color = "currentColor" }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const XCircleIcon = ({ color = "currentColor" }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

const UsersAdminIcon = ({ color = "currentColor" }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const DashboardNavIcon = ({ color = "currentColor" }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
  </svg>
);

const RequestsNavIcon = ({ color = "currentColor" }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <line x1="9" y1="12" x2="15" y2="12" />
    <line x1="9" y1="16" x2="15" y2="16" />
  </svg>
);

const RegistryNavIcon = ({ color = "currentColor" }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8v13H3V8" />
    <path d="M23 3H1v5h22V3z" />
    <path d="M10 12h4" />
  </svg>
);

const FacultyNavIcon = ({ color = "currentColor" }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const AdminBottomNav = ({ active = 'dashboard', setView }) => (
  <div className="admin-bottom-nav">
    <div className={`admin-nav-item ${active === 'dashboard' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('admin-dashboard')}>
      <DashboardNavIcon color={active === 'dashboard' ? 'var(--green)' : '#9CA3AF'} />
      <span>Dashboard</span>
    </div>
    <div className={`admin-nav-item ${active === 'requests' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('admin-approval-requests')}>
      <RequestsNavIcon color={active === 'requests' ? 'var(--green)' : '#9CA3AF'} />
      <span>Requests</span>
    </div>
    <div className={`admin-nav-item ${active === 'registry' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('admin-registry')}>
      <RegistryNavIcon color={active === 'registry' ? 'var(--green)' : '#9CA3AF'} />
      <span>Registry</span>
    </div>
    <div className={`admin-nav-item ${active === 'faculty' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('admin-faculty')}>
      <FacultyNavIcon color={active === 'faculty' ? 'var(--green)' : '#9CA3AF'} />
      <span>Faculty</span>
    </div>
  </div>
);

const DeanBottomNav = ({ setView, onOpenRequests, active = 'dashboard' }) => (
  <div className="admin-bottom-nav">
    <div className={`admin-nav-item ${active === 'dashboard' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('dean-dashboard')}>
      <DashboardNavIcon color={active === 'dashboard' ? 'var(--green)' : '#9CA3AF'} />
      <span>Dashboard</span>
    </div>
    <div className={`admin-nav-item ${active === 'requests' ? 'admin-nav-active' : ''}`} onClick={onOpenRequests}>
      <RequestsNavIcon color={active === 'requests' ? 'var(--green)' : '#9CA3AF'} />
      <span>Requests</span>
    </div>
    <div className={`admin-nav-item ${active === 'registry' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('dean-registry')}>
      <RegistryNavIcon color={active === 'registry' ? 'var(--green)' : '#9CA3AF'} />
      <span>Registry</span>
    </div>
    <div className={`admin-nav-item ${active === 'faculty' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('dean-faculty')}>
      <FacultyNavIcon color={active === 'faculty' ? 'var(--green)' : '#9CA3AF'} />
      <span>Faculty</span>
    </div>
  </div>
);

const DeanDashboardView = ({ setView, profileData }) => {
  const { summary, setSummary, loading: summaryLoading, error: summaryError } = useDeanDashboardSummary();
  const { notifications, setNotifications, loading: notificationsLoading } = useDeanNotifications(5);
  const { pendingApprovals, setPendingApprovals, loading: approvalsLoading } = useDeanPendingApprovals(5);
  const { toast } = useDeanRealtimeNotifications({ setSummary, setNotifications, setPendingApprovals });
  const [showAllRequests, setShowAllRequests] = useState(false);

  const statCards = [
    { label: 'PENDING REQUESTS', value: summary.pendingRequests, icon: <ClipboardClockIcon color="var(--green)" /> },
    { label: 'APPROVED TODAY', value: summary.approvedToday ?? summary.approvedRequests, icon: <CheckCircleAdminIcon color="var(--green)" /> },
    { label: 'REJECTED REQUESTS', value: summary.rejectedRequests, icon: <XCircleIcon color="#EF4444" /> },
    { label: 'TOTAL FACULTY', value: summary.totalFaculty, icon: <UsersAdminIcon color="var(--green)" /> },
  ];

  return (
    <div className="admin-dash-wrapper dean-dash-wrapper">
      <div className="admin-dash-scroll">
        <div className="admin-header">
          <span className="admin-logo-text">EduRoute</span>
          <div className="admin-header-right">
            <div className="admin-bell-wrapper" onClick={() => setView('dean-notifications')}>
              <AdminBellIcon color="var(--text-dark)" />
              {notifications.some((n) => !n.is_read) && <div className="admin-bell-dot" />}
            </div>
            <div className="admin-avatar" onClick={() => setView('dean-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Dean" />
            </div>
          </div>
        </div>

        <div className="admin-hero dean-hero">
          <h1>Dean Dashboard</h1>
          <p>{summary.college?.name || profileData?.department || 'College'} locator slip oversight</p>
          {summaryError && <p className="dean-error-text">{summaryError}</p>}
        </div>

        <div className="admin-stats-grid">
          {statCards.map((card) => (
            <div className="admin-stat-card" key={card.label}>
              <div className="admin-stat-info">
                <span className="admin-stat-label">{card.label}</span>
                <span className="admin-stat-number">
                  {summaryLoading ? '...' : String(card.value || 0).padStart(2, '0')}
                </span>
              </div>
              {card.icon}
            </div>
          ))}
        </div>

        {toast && <div className="dean-live-toast">{toast}</div>}

        <div className="admin-notif-card">
          <div className="admin-notif-header">
            <h2>Notifications</h2>
            <span className="admin-notif-viewall" onClick={() => setView('dean-notifications')}>VIEW ALL</span>
          </div>

          {notificationsLoading && <p className="dean-empty-text">Loading notifications...</p>}
          {!notificationsLoading && notifications.length === 0 && (
            <p className="dean-empty-text">No locator slip alerts yet.</p>
          )}
          {!notificationsLoading && notifications.map((n, i) => (
            <div key={n.id}>
              <div className="admin-notif-row">
                {!n.is_read && <div className="admin-notif-dot" />}
                <div className={`admin-notif-content ${n.is_read ? 'no-dot' : ''}`}>
                  <p className="admin-notif-text">{n.message}</p>
                  <span className="admin-notif-time">{n.formatted_created_at || n.created_at}</span>
                </div>
              </div>
              {i < notifications.length - 1 && <div className="admin-notif-divider" />}
            </div>
          ))}
        </div>

        <div className="admin-approvals-card">
          <div className="admin-approvals-header">
            <h2>Pending Approvals</h2>
            <button type="button" className="admin-action-queue-btn" onClick={() => setShowAllRequests(true)}>
              Action Queue
            </button>
          </div>

          <div className="admin-approvals-table">
            <div className="admin-approvals-thead">
              <span>RECIPIENT</span>
              <span>PURPOSE</span>
              <span>DATE SUBMITTED</span>
            </div>
            {approvalsLoading && <p className="dean-empty-text">Loading pending approvals...</p>}
            {!approvalsLoading && pendingApprovals.length === 0 && (
              <p className="dean-empty-text">No pending locator slips for your college.</p>
            )}
            {!approvalsLoading && pendingApprovals.map((approval) => (
              <div key={approval.locatorSlipId} className="admin-approvals-row">
                <div className="admin-approval-recipient">
                  <div className="admin-approval-avatar">
                    {approval.facultyInitials}
                  </div>
                  <div className="admin-approval-info">
                    <span className="admin-approval-name">{approval.facultyName}</span>
                    <span className="admin-approval-dept">{approval.collegeName}</span>
                  </div>
                </div>
                <span className="admin-approval-purpose">{approval.purpose}</span>
                <span className="admin-approval-date">{approval.dateSubmitted}</span>
              </div>
            ))}
          </div>

          <div className="admin-approvals-viewall" onClick={() => setView('dean-requests')}>
            View All Locator Slip Requests
          </div>
        </div>
      </div>

      {showAllRequests && <DeanRequestsModal onClose={() => setShowAllRequests(false)} />}
      <DeanBottomNav setView={setView} onOpenRequests={() => setView('dean-requests')} />
    </div>
  );
};

const DeanNotificationDocIcon = ({ tone = 'green' }) => {
  const isPending = tone === 'pending';
  return (
    <div className={`dean-notification-icon ${isPending ? 'pending' : ''}`}>
      {isPending ? <NotifPendingIcon /> : <NotifSlipIcon />}
    </div>
  );
};

const formatNotificationRelativeTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(Math.floor(diffMs / 60000), 0);
  if (diffMinutes < 1) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getNotificationGroupLabel = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Earlier';

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const DeanNotificationsView = ({ setView, profileData }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadNotifications = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getDeanNotifications({ limit: 50 });
        setNotifications(data.items || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadNotifications();
  }, []);

  const handleDismiss = async (notificationId) => {
    try {
      await markDeanNotificationRead(notificationId);
      setNotifications((prev) => prev.filter((item) => item.id !== notificationId));
    } catch (err) {
      alert(err.message);
    }
  };

  const groupedNotifications = notifications.reduce((groups, notification) => {
    const label = getNotificationGroupLabel(notification.created_at);
    return {
      ...groups,
      [label]: [...(groups[label] || []), notification],
    };
  }, {});

  const orderedGroups = Object.entries(groupedNotifications);

  return (
    <div className="admin-dash-wrapper dean-notifications-wrapper">
      <div className="admin-dash-scroll">
        <div className="admin-header dean-notifications-header">
          <div className="anotif-header-left">
            <div className="anotif-back" onClick={() => setView('dean-dashboard')}>
              <BackArrowIcon color="var(--green)" />
            </div>
            <span className="admin-logo-text">EduRoute</span>
          </div>
          <div className="admin-header-right">
            <div className="admin-bell-wrapper">
              <AdminBellIcon color="var(--text-dark)" />
              {notifications.some((item) => !item.is_read) && <div className="admin-bell-dot" />}
            </div>
            <div className="admin-avatar" style={{ border: '3px solid var(--yellow)' }} onClick={() => setView('dean-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Dean" />
            </div>
          </div>
        </div>

        <div className="dean-notification-list">
          {loading && <p className="dean-empty-text">Loading notifications...</p>}
          {error && <p className="dean-error-text">{error}</p>}
          {!loading && !error && notifications.length === 0 && (
            <p className="dean-empty-text">No dean notifications yet.</p>
          )}

          {!loading && orderedGroups.map(([groupLabel, items]) => (
            <div key={groupLabel} className="dean-notification-group">
              {groupLabel !== 'Today' && (
                <div className="dean-notification-divider">
                  <span>{groupLabel}</span>
                  <div />
                </div>
              )}

              {items.map((notification) => {
                const isPendingNotice = /pending|approval|signature/i.test(notification.message || notification.title || '');
                const reviewTarget = notification.type === 'LOCATOR_SLIP_CANCELLED' ? 'dean-registry' : 'dean-dashboard';

                return (
                  <article className="dean-notification-card" key={notification.id}>
                    <DeanNotificationDocIcon tone={isPendingNotice ? 'pending' : 'green'} />
                    <div className="dean-notification-body">
                      <div className="dean-notification-title-row">
                        <h2>{notification.title || 'New locator slip request submitted'}</h2>
                        <time>{formatNotificationRelativeTime(notification.created_at)}</time>
                      </div>
                      <p>{notification.message}</p>
                      <div className="dean-notification-actions">
                        <button type="button" className="review" onClick={() => setView(reviewTarget)}>
                          REVIEW
                        </button>
                        <button type="button" className="dismiss" onClick={() => handleDismiss(notification.id)}>
                          DISMISS
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <DeanBottomNav active="dashboard" setView={setView} onOpenRequests={() => setView('dean-dashboard')} />
    </div>
  );
};

const buildLocatorSlipReference = (request) => {
  if (!request?.locatorSlipId) return 'LS-000-000';

  const yearSource = request.createdAt || request.dateSubmitted;
  const year = yearSource ? new Date(yearSource).getFullYear() : new Date().getFullYear();
  const numericId = String(request.locatorSlipId).padStart(3, '0');

  return `LS-${year}-${numericId}`;
};

const DeanRequestsView = ({ setView, profileData, setSelectedDeanRequest }) => {
  const [requestData, setRequestData] = useState({
    summary: {
      pending: 0,
      onsiteFaculty: 0,
      offsiteFaculty: 0,
      urgent: 0,
    },
    items: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadRequests = async () => {
      setLoading(true);
      setError('');
      try {
        setRequestData(await getDeanPendingRequestsPage());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadRequests();
  }, []);

  const requestStats = [
    { label: 'PENDING', value: requestData.summary.pending, urgent: false },
    { label: 'ON-SITE FACULTY', value: requestData.summary.onsiteFaculty, urgent: false },
    { label: 'OFF-SITE FACULTY', value: requestData.summary.offsiteFaculty, urgent: false },
    { label: 'URGENT', value: requestData.summary.urgent, urgent: true },
  ];

  return (
    <div className="admin-dash-wrapper dean-requests-wrapper">
      <div className="admin-dash-scroll">
        <div className="admin-header dean-requests-header">
          <div className="anotif-header-left">
            <div className="anotif-back" onClick={() => setView('dean-dashboard')}>
              <BackArrowIcon color="var(--green)" />
            </div>
            <span className="admin-logo-text">EduRoute</span>
          </div>
          <div className="admin-header-right">
            <div className="admin-bell-wrapper" onClick={() => setView('dean-notifications')}>
              <AdminBellIcon color="var(--text-dark)" />
              <div className="admin-bell-dot" />
            </div>
            <div className="admin-avatar" style={{ border: '3px solid var(--yellow)' }} onClick={() => setView('dean-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Dean" />
            </div>
          </div>
        </div>

        <div className="dean-requests-hero">
          <h1>Approval Requests</h1>
          <p>Review and manage pending faculty locator slips.</p>
        </div>

        <div className="dean-requests-stats">
          {requestStats.map((stat) => (
            <div className={`dean-request-stat-card ${stat.urgent ? 'urgent' : ''}`} key={stat.label}>
              <span>{stat.label}</span>
              <strong>{loading ? '...' : String(stat.value || 0).padStart(2, '0')}</strong>
            </div>
          ))}
        </div>

        {error && <p className="dean-error-text dean-requests-message">{error}</p>}
        {loading && <p className="dean-empty-text dean-requests-message">Loading pending locator slips...</p>}
        {!loading && !error && requestData.items.length === 0 && (
          <p className="dean-empty-text dean-requests-message">No pending locator slip requests right now.</p>
        )}

        <div className="dean-request-page-list">
          {!loading && requestData.items.map((request) => (
            <article
              className={`dean-request-page-card ${request.isUrgent ? 'urgent' : ''}`}
              key={request.locatorSlipId}
            >
              <div className="dean-request-page-top">
                <div>
                  <h2>
                    {request.facultyName}
                    {request.isUrgent && <span className="urgent-mark">!</span>}
                  </h2>
                  <p>{request.position || 'Instructor'} - {request.dateSubmitted}</p>
                </div>
                <span className="dean-request-pending-pill">PENDING</span>
              </div>

              <div className="dean-request-page-details">
                <div>
                  <span>DESTINATION</span>
                  <strong>{request.destination}</strong>
                </div>
                <div>
                  <span>PURPOSE</span>
                  <strong>{request.purpose}</strong>
                </div>
              </div>

              <button
                type="button"
                className="dean-request-details-btn"
                onClick={() => {
                  setSelectedDeanRequest?.({ ...request, backView: 'dean-requests' });
                  setView('dean-request-detail');
                }}
              >
                View Details
              </button>
            </article>
          ))}
        </div>
      </div>
      <DeanBottomNav active="requests" setView={setView} onOpenRequests={() => setView('dean-requests')} />
    </div>
  );
};

const DeanRequestDetailView = ({ setView, profileData, request }) => {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionRemarks, setRejectionRemarks] = useState('');

  if (!request) {
    return (
      <div className="admin-dash-wrapper dean-requests-wrapper">
        <div className="admin-dash-scroll" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p className="dean-empty-text">No locator slip selected.</p>
        </div>
        <DeanBottomNav active="requests" setView={setView} onOpenRequests={() => setView('dean-requests')} />
      </div>
    );
  }

  const slipReference = buildLocatorSlipReference(request);
  const formattedDeparture = request.formattedDepartureDatetime || request.departureDatetime || 'Not provided';
  const formattedReturn = request.formattedExpectedReturnDatetime || request.expectedReturnDatetime || 'Not provided';

  const normalizedStatus = request.statusLabel || (request.status === 'approved' || request.status === 'completed'
    ? 'verified'
    : request.status);
  const backView = request.backView || 'dean-requests';
  const statusText = normalizedStatus === 'verified'
    ? 'Verified'
    : normalizedStatus
      ? `${normalizedStatus.charAt(0).toUpperCase()}${normalizedStatus.slice(1)}`
      : 'Pending';
  const showActions = request.status === 'pending';
  const openRejectModal = () => {
    setRejectionRemarks(request.additionalRemarks || '');
    setShowRejectModal(true);
  };

  const handleApproveRequest = async () => {
    if (!request?.locatorSlipId || approving) return;

    try {
      setApproving(true);
      await approveDeanLocatorSlipRequest(request.locatorSlipId);
      alert('Locator slip approved successfully.');
      setView('dean-requests');
    } catch (error) {
      alert(error.message || 'Failed to approve locator slip.');
    } finally {
      setApproving(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!request?.locatorSlipId || rejecting) return;
    const trimmedRemarks = rejectionRemarks.trim();

    if (!trimmedRemarks) {
      alert('Please enter the reason for rejecting this locator slip.');
      return;
    }

    try {
      setRejecting(true);
      await rejectDeanLocatorSlipRequest(request.locatorSlipId, trimmedRemarks);
      alert('Locator slip rejected successfully.');
      setShowRejectModal(false);
      setView('dean-requests');
    } catch (error) {
      alert(error.message || 'Failed to reject locator slip.');
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="admin-dash-wrapper dean-requests-wrapper">
      <div className="admin-dash-scroll">
        <div className="admin-header dean-requests-header">
          <div className="anotif-header-left">
            <div className="anotif-back" onClick={() => setView(backView)}>
              <BackArrowIcon color="var(--text-dark)" />
            </div>
            <span className="admin-logo-text">EduRoute</span>
          </div>
          <div className="admin-header-right">
            <div className="admin-bell-wrapper" onClick={() => setView('dean-notifications')}>
              <AdminBellIcon color="var(--text-dark)" />
              <div className="admin-bell-dot" />
            </div>
            <div className="admin-avatar" onClick={() => setView('dean-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Dean" />
            </div>
          </div>
        </div>

        <div className="adet-banner">
          <div className="adet-banner-top">
            <span className="adet-banner-label">APPROVAL REQUEST</span>
            <span className={`adet-status-badge ${request.isUrgent && request.status === 'pending' ? 'urgent' : 'pending'} dean-request-detail-status dean-request-detail-status-${normalizedStatus || 'pending'}`}>
              <span className="adet-status-dot" />
              {statusText}
            </span>
          </div>
          <div className="adet-banner-title-row">
            <h2>Locator Slip #{slipReference}</h2>
            {request.isUrgent && <span className="adet-urgent-mark">!</span>}
          </div>
        </div>

        <div className="adet-section-title">
          <DetailPersonIcon />
          <span>Faculty Information</span>
        </div>
        <div className="adet-info-card">
          <div className="adet-info-row">
            <span className="adet-info-label">FULL NAME</span>
            <span className="adet-info-value">{request.facultyName}</span>
          </div>
          <div className="adet-info-cols">
            <div className="adet-info-col">
              <span className="adet-info-label">DEPARTMENT</span>
              <span className="adet-info-value">{request.collegeName}</span>
            </div>
            <div className="adet-info-col">
              <span className="adet-info-label">FACULTY ID</span>
              <span className="adet-info-value">{request.employeeId || 'Not assigned'}</span>
            </div>
          </div>
        </div>

        <div className="adet-section-title">
          <DetailRouteIcon />
          <span>Locator Slip Details</span>
        </div>
        <div className="adet-details-section">
          <div className="adet-detail-item">
            <DetailPinIcon />
            <div className="adet-detail-text">
              <span className="adet-detail-label">DESTINATION</span>
              <span className="adet-detail-value">{request.destination}</span>
            </div>
          </div>
          <div className="adet-detail-item">
            <DetailDocIcon />
            <div className="adet-detail-text">
              <span className="adet-detail-label">PURPOSE</span>
              <span className="adet-detail-value">{request.purpose}</span>
            </div>
          </div>
          <div className="adet-time-row">
            <div className="adet-detail-item half">
              <DetailClockIcon />
              <div className="adet-detail-text">
                <span className="adet-detail-label">DEPARTURE</span>
                <span className="adet-detail-value">{formattedDeparture}</span>
              </div>
            </div>
            <div className="adet-detail-item half">
              <DetailClockReturnIcon />
              <div className="adet-detail-text">
                <span className="adet-detail-label">EST. RETURN</span>
                <span className="adet-detail-value">{formattedReturn}</span>
              </div>
            </div>
          </div>
        </div>

        {showActions && (
          <div className="adet-actions">
            <button type="button" className="adet-approve-btn" onClick={handleApproveRequest} disabled={approving}>
              <ApproveCheckIcon />
              {approving ? 'Approving...' : 'Approve Request'}
            </button>
            <div className="adet-secondary-actions">
              <button type="button" className="adet-reject-btn" onClick={openRejectModal} disabled={rejecting}>
                <RejectXIcon />
                Reject
              </button>
              <button type="button" className="adet-remarks-btn" onClick={openRejectModal} disabled={rejecting}>
                <RemarksIcon />
                Remarks
              </button>
            </div>
          </div>
        )}

        {showRejectModal && (
          <div className="adet-modal-backdrop" role="presentation" onClick={() => !rejecting && setShowRejectModal(false)}>
            <div className="adet-modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <span className="adet-modal-kicker">REJECT LOCATOR SLIP</span>
              <h3>Reason for rejection</h3>
              <p>Enter the reason so the faculty member can see why this locator slip was rejected.</p>
              <div className="adet-modal-field">
                <label htmlFor="dean-rejection-remarks">Dean remarks</label>
                <textarea
                  id="dean-rejection-remarks"
                  value={rejectionRemarks}
                  onChange={(event) => setRejectionRemarks(event.target.value)}
                  placeholder="Type the reason for rejection..."
                  maxLength={1000}
                  disabled={rejecting}
                />
                <span>{rejectionRemarks.trim().length}/1000</span>
              </div>
              <div className="adet-modal-actions">
                <button type="button" className="adet-modal-secondary" onClick={() => setShowRejectModal(false)} disabled={rejecting}>
                  Back
                </button>
                <button type="button" className="adet-modal-primary" onClick={handleRejectRequest} disabled={rejecting}>
                  {rejecting ? 'Rejecting...' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <DeanBottomNav active="requests" setView={setView} onOpenRequests={() => setView('dean-requests')} />
    </div>
  );
};

const DeanRegistryView = ({ setView, profileData }) => {
  const [registryData, setRegistryData] = useState({ summary: null, items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRegistryItem, setSelectedRegistryItem] = useState(null);

  useEffect(() => {
    let active = true;

    const loadRegistry = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await getDeanRegistryPage();
        if (!active) return;
        setRegistryData(data);
      } catch (requestError) {
        if (!active) return;
        setError(requestError.message || 'Failed to load dean registry.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadRegistry();
    return () => {
      active = false;
    };
  }, []);

  const summary = registryData.summary || {};
  const items = registryData.items || [];

  return (
    <div className="admin-dash-wrapper dean-requests-wrapper">
      <div className="admin-dash-scroll">
        <div className="admin-header dean-requests-header">
          <div className="anotif-header-left">
            <div className="anotif-back" onClick={() => setView('dean-dashboard')}>
              <BackArrowIcon color="var(--text-dark)" />
            </div>
            <span className="admin-logo-text">EduRoute</span>
          </div>
          <div className="admin-header-right">
            <div className="admin-bell-wrapper" onClick={() => setView('dean-notifications')}>
              <AdminBellIcon color="var(--text-dark)" />
              <div className="admin-bell-dot" />
            </div>
            <div className="admin-avatar" onClick={() => setView('dean-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Dean" />
            </div>
          </div>
        </div>

        <div className="areg-hero">
          <h1>Requests</h1>
          <p>Strategic Oversight Registry</p>
        </div>

        <div className="areg-stats-grid">
          <div className="areg-stat-card">
            <span className="areg-stat-label">MONTHLY TOTAL</span>
            <span className="areg-stat-number">{String(summary.monthlyTotal ?? 0).padStart(2, '0')}</span>
          </div>
          <div className="areg-stat-card">
            <span className="areg-stat-label">REGISTRY SIZE</span>
            <span className="areg-stat-number">{summary.registrySize ?? 0}</span>
          </div>
        </div>

        {error && <p className="dean-error-text dean-requests-message">{error}</p>}
        {loading && <p className="dean-empty-text dean-requests-message">Loading request registry...</p>}
        {!loading && !error && items.length === 0 && (
          <p className="dean-empty-text dean-requests-message">No locator slips have been filed for this college yet.</p>
        )}

        <div className="areg-cards">
          {items.map((item) => (
            <div key={item.locatorSlipId} className="areg-card">
              <div className="areg-card-header">
                <div className="areg-card-name-col">
                  <h3>{item.facultyName}</h3>
                  <span className="areg-card-role">{item.position}</span>
                </div>
                <div className={`areg-badge ${item.statusLabel || item.status}`}>
                  {(item.statusLabel || item.status).toUpperCase()}
                </div>
              </div>

              <div className="areg-card-details">
                <div className="areg-detail-col">
                  <span className="areg-detail-label">{item.dateLabel || 'DATE SUBMITTED'}</span>
                  <span className="areg-detail-value">{item.dateValue || item.dateSubmitted || 'Not available'}</span>
                </div>
                <div className="areg-detail-col">
                  <span className="areg-detail-label">DESTINATION</span>
                  <span className="areg-detail-value">{item.destination}</span>
                </div>
              </div>
              {item.status === 'cancelled' && item.cancellationReason && (
                <div className="areg-card-cancel-reason">
                  <span className="areg-detail-label">CANCELLATION REASON</span>
                  <span className="areg-detail-value">{getCancellationReasonLabel(item.cancellationReason)}</span>
                </div>
              )}
              {item.status === 'rejected' && (item.rejectionReason || item.additionalRemarks) && (
                <div className="areg-card-cancel-reason">
                  <span className="areg-detail-label">REJECTION REASON</span>
                  <span className="areg-detail-value">{item.rejectionReason || item.additionalRemarks}</span>
                </div>
              )}

              <div className="areg-card-actions">
                <button
                  type="button"
                  className="areg-view-btn"
                  onClick={() => setSelectedRegistryItem(item)}
                >
                  <RegistryEyeIcon />
                  VIEW DETAILS
                </button>
                <button type="button" className="areg-download-btn" aria-label="Download locator slip">
                  <RegistryDownloadIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <DeanBottomNav active="registry" setView={setView} onOpenRequests={() => setView('dean-requests')} />
      {selectedRegistryItem && (
        <RegistryDetailsModal
          item={selectedRegistryItem}
          onClose={() => setSelectedRegistryItem(null)}
        />
      )}
    </div>
  );
};

const DeanRequestsModal = ({ onClose }) => {
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadRequests = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getDeanLocatorSlips({ status, search, limit: 50 });
        if (active) setRequests(data.items || []);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadRequests();
    return () => {
      active = false;
    };
  }, [status, search]);

  return (
    <div className="dean-modal-backdrop" role="dialog" aria-modal="true">
      <div className="dean-requests-modal">
        <div className="dean-modal-header">
          <div>
            <h2>Locator Slip Requests</h2>
            <p>Only faculty from your assigned college are shown.</p>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>

        <div className="dean-modal-tools">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search faculty, purpose, or destination"
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        {error && <p className="dean-error-text">{error}</p>}
        {loading && <p className="dean-empty-text">Loading requests...</p>}
        {!loading && requests.length === 0 && <p className="dean-empty-text">No matching locator slips.</p>}

        <div className="dean-request-list">
          {requests.map((request) => (
            <div className="dean-request-card" key={request.locatorSlipId}>
              <div>
                <strong>{request.facultyName}</strong>
                <p>{request.purpose}</p>
                <span>{request.destination}</span>
              </div>
              <div className={`dean-status-pill ${request.status}`}>
                {request.status}
              </div>
              <time>{request.formattedCreatedAt}</time>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const HrmuSidebarGridIcon = ({ color = "currentColor" }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="6" height="6" rx="1.2" />
    <rect x="14" y="4" width="6" height="6" rx="1.2" />
    <rect x="4" y="14" width="6" height="6" rx="1.2" />
    <rect x="14" y="14" width="6" height="6" rx="1.2" />
  </svg>
);

const HrmuVerificationIcon = ({ color = "currentColor" }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l7 3v5c0 5-3.4 8.6-7 10-3.6-1.4-7-5-7-10V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

const HrmuChartIcon = ({ color = "currentColor" }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <rect x="7" y="12" width="3" height="5" rx="1" />
    <rect x="12" y="8" width="3" height="9" rx="1" />
    <rect x="17" y="5" width="3" height="12" rx="1" />
  </svg>
);

const HrmuMapRouteIcon = ({ color = "currentColor" }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" />
    <path d="M9 4v14" />
    <path d="M15 6v14" />
  </svg>
);

const HrmuReportIcon = ({ color = "currentColor" }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    <path d="M14 3v5h5" />
    <path d="M10 13h6" />
    <path d="M10 17h4" />
  </svg>
);

const HrmuWarningIcon = ({ color = "#C81E1E" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4l8 15H4L12 4z" />
    <path d="M12 9v4" />
    <circle cx="12" cy="17" r="1" fill={color} stroke="none" />
  </svg>
);

const HrmuSyncIcon = ({ color = "#A27A00" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 15-6l2 2" />
    <path d="M21 12a9 9 0 0 1-15 6l-2-2" />
    <path d="M18 4v4h-4" />
    <path d="M6 20v-4h4" />
  </svg>
);

const HrmuMiniCheckIcon = ({ color = "var(--green)" }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M8.6 12.2l2.2 2.2 4.8-5" />
  </svg>
);

const HrmuFilterIcon = ({ color = "#5F645F" }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16" />
    <path d="M7 12h10" />
    <path d="M10 17h4" />
  </svg>
);

const HrmuExportIcon = ({ color = "white" }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v10" />
    <path d="M8 10l4 4 4-4" />
    <path d="M5 20h14" />
  </svg>
);

const OLONGAPO_CENTER = [120.2822, 14.8386];

const HrmuLiveMapPanel = ({
  faculty = [],
  compact = false,
  className = '',
  center = OLONGAPO_CENTER,
  selectedFacultyUserId = null,
  onMarkerSelect = null,
  focusOnOlongapo = false,
}) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [mapReady, setMapReady] = useState(Boolean(MAPBOX_PUBLIC_TOKEN));

  useEffect(() => {
    if (!MAPBOX_PUBLIC_TOKEN || !mapContainerRef.current || mapRef.current) {
      if (!MAPBOX_PUBLIC_TOKEN) {
        setMapReady(false);
      }
      return;
    }

    mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center,
      zoom: compact ? 13 : 13.5,
      attributionControl: false,
      interactive: true,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false, showCompass: false }), 'top-right');

    map.on('load', () => {
      setMapReady(true);
      map.resize();
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [compact]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const validFaculty = faculty.filter((item) => Number.isFinite(item?.lat) && Number.isFinite(item?.lng));

    validFaculty.forEach((item) => {
      const markerElement = document.createElement('button');
      markerElement.type = 'button';
      markerElement.className = `hrmu-map-live-marker ${item?.marker?.status === 'stale' ? 'stale' : 'active'}${selectedFacultyUserId === item.facultyUserId ? ' selected' : ''}`;
      markerElement.title = item.facultyName || 'Faculty in trip';
      markerElement.setAttribute('aria-label', item.facultyName || 'Faculty in trip');
      markerElement.innerHTML = `
          <span class="hrmu-map-live-marker-pulse"></span>
          <span class="hrmu-map-live-marker-core"></span>
      `;
      markerElement.addEventListener('click', () => {
        if (onMarkerSelect) onMarkerSelect(item);
      });

      const marker = new mapboxgl.Marker({ element: markerElement, anchor: 'center' })
        .setLngLat([item.lng, item.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });

    if (!validFaculty.length) {
      map.easeTo({
        center,
        zoom: compact ? 13 : 13.5,
        duration: 600,
      });
      return;
    }

    if (validFaculty.length === 1) {
      if (focusOnOlongapo) {
        const bounds = new mapboxgl.LngLatBounds(center, center);
        bounds.extend([validFaculty[0].lng, validFaculty[0].lat]);
        map.fitBounds(bounds, {
          padding: compact ? 72 : 104,
          duration: 600,
          maxZoom: compact ? 12.5 : 13.1,
        });
        return;
      }

      map.easeTo({
        center: [validFaculty[0].lng, validFaculty[0].lat],
        zoom: compact ? 12.5 : 13.2,
        duration: 600,
      });
      return;
    }

    const bounds = validFaculty.reduce((acc, item) => {
      acc.extend([item.lng, item.lat]);
      return acc;
    }, new mapboxgl.LngLatBounds(
      focusOnOlongapo ? center : [validFaculty[0].lng, validFaculty[0].lat],
      focusOnOlongapo ? center : [validFaculty[0].lng, validFaculty[0].lat],
    ));

    map.fitBounds(bounds, {
      padding: compact ? 64 : 96,
      duration: 700,
      maxZoom: compact ? 12.8 : 13.4,
    });
  }, [center, faculty, compact, focusOnOlongapo, onMarkerSelect, selectedFacultyUserId]);

  return (
    <div className={`hrmu-live-map-frame ${className}`.trim()}>
      <div ref={mapContainerRef} className="hrmu-live-mapbox-canvas" />
      {!mapReady && (
        <div className="hrmu-live-map-fallback">
          <strong>Map unavailable</strong>
          <span>Add a valid Mapbox public token to display live faculty around Olongapo.</span>
        </div>
      )}
    </div>
  );
};

const TogaLogoIcon = ({ size = 24 }) => (
  <svg width={size} height={Math.round((size * 18) / 22)} viewBox="0 0 22 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M20 14V7.1L11 12L0 6L11 0L22 6V14H20ZM11 18L4 14.2V9.2L11 13L18 9.2V14.2L11 18Z" fill="currentColor" />
  </svg>
);

const REPORT_SEQUENCE_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const HrmuViewRouteIcon = ({ color = 'currentColor' }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 5h5v5" />
    <path d="M10 14 19 5" />
    <path d="M5 19h14" />
  </svg>
);

const HrmuPinMiniIcon = ({ color = 'var(--green)' }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21s-6-4.35-6-10a6 6 0 1 1 12 0c0 5.65-6 10-6 10Z" />
    <circle cx="12" cy="11" r="2.2" />
  </svg>
);

const HrmuEyeMiniIcon = ({ color = 'currentColor' }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const HrmuCheckTinyIcon = ({ color = 'white' }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 12 4 4 10-10" />
  </svg>
);

const HrmuAlertTinyIcon = ({ color = '#3B3B3B' }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
  </svg>
);

const HrmuWorkspaceShell = ({ activeKey = 'dashboard', setView, profileData, onLogout, bellActive = false, children }) => {
  const sidebarItems = [
    { key: 'dashboard', label: 'Dashboard', icon: HrmuSidebarGridIcon, target: 'hrmu-dashboard' },
    { key: 'verification', label: 'Verification', icon: HrmuVerificationIcon, target: 'hrmu-verification' },
    { key: 'analytics', label: 'Analytics', icon: HrmuChartIcon, target: 'hrmu-analytics' },
    { key: 'live', label: 'Live Tracking', icon: HrmuMapRouteIcon, target: 'hrmu-live' },
    { key: 'reports', label: 'Reports', icon: HrmuReportIcon, target: 'hrmu-reports' },
  ];

  return (
    <div className="hrmu-workspace">
      <aside className="hrmu-sidebar">
        <div className="hrmu-sidebar-top">
          <div className="hrmu-brand-lockup">
            <div className="hrmu-brand-badge">
              <TogaLogoIcon size={24} />
            </div>
            <div className="hrmu-brand-text">
              <strong>EduRoute</strong>
              <span>HRMU ADMIN</span>
            </div>
          </div>

          <nav className="hrmu-sidebar-nav">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.key === activeKey;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`hrmu-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => item.target && setView(item.target)}
                >
                  <Icon color={isActive ? 'var(--green)' : '#4B5563'} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="hrmu-sidebar-bottom">
          <button type="button" className="hrmu-logout-btn" onClick={onLogout}>Log Out</button>
          <button type="button" className="hrmu-support-link">
            <HeadsetIcon />
            <span>Support</span>
          </button>
        </div>
      </aside>

      <main className="hrmu-main">
        <header className="hrmu-topbar">
          <span className="hrmu-topbar-logo">EduRoute</span>
          <div className="hrmu-topbar-right">
            <div className={`admin-bell-wrapper hrmu-bell-wrapper ${bellActive ? 'active' : ''}`} onClick={() => setView('hrmu-notifications')}>
              <AdminBellIcon color="var(--text-dark)" />
              <div className="admin-bell-dot" />
            </div>
            <div className="hrmu-manager-copy">
              <strong>{profileData?.fullName || 'HRMU Manager'}</strong>
              <span>HRMU Administrator</span>
            </div>
            <div className="admin-avatar" onClick={() => setView('admin-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="HRMU Manager" />
            </div>
          </div>
        </header>

        <div className="hrmu-main-scroll">
          {children}
        </div>
      </main>
    </div>
  );
};

const HrmuDashboardView = ({ setView, profileData, onLogout }) => {
  const hrmuCollegeOptions = [
    { label: 'All Departments', value: 'all' },
    { label: 'College of Education, Arts and Sciences', value: 'College of Education, Arts and Sciences' },
    { label: 'College of Business and Accountancy', value: 'College of Business and Accountancy' },
    { label: 'College of Allied Health Studies', value: 'College of Allied Health Studies' },
    { label: 'College of Hospitality and Tourism Management', value: 'College of Tourism and Hospitality Management' },
    { label: 'College of Computer Studies', value: 'College of Computer Studies' },
  ];
  const [summary, setSummary] = useState({
    totalFacultyOutside: 0,
    latestActivity: null,
    verifiedLocatorSlips: 0,
    pendingSlips: 0,
  });
  const [selectedCollegeFilter, setSelectedCollegeFilter] = useState('all');
  const [recentActivityRows, setRecentActivityRows] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [notificationRows, setNotificationRows] = useState([]);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [liveFacultyRows, setLiveFacultyRows] = useState([]);
  const [liveFacultyLoading, setLiveFacultyLoading] = useState(false);

  const formatActivityTime = (value) => {
    if (!value) return '--';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';

    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatNotificationMeta = (value) => {
    if (!value) return 'Verification time unavailable';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Verification time unavailable';

    const now = new Date();
    const sameDay = now.toDateString() === date.toDateString();

    const timePart = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    if (sameDay) {
      return `VERIFIED TODAY ${timePart}`;
    }

    const datePart = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return `VERIFIED ${datePart} ${timePart}`;
  };

  const getInitials = (name) => {
    if (!name) return 'HR';

    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('');
  };

  const mapTripStatus = (row) => {
    const normalizedDisplayStatus = String(row.displayStatus || '').toUpperCase();

    if (normalizedDisplayStatus === 'FLAGGED' || row.isFlagged || row.currentStatusLabel === 'flagged') {
      return { label: 'FLAGGED', tone: 'red' };
    }

    if (
      normalizedDisplayStatus === 'PENDING'
      || normalizedDisplayStatus === 'UNVERIFIED'
      ||
      row.currentStatusLabel === 'pending'
      || String(row.verificationStatus || '').toLowerCase() === 'pending'
    ) {
      return { label: 'PENDING', tone: 'yellow' };
    }

    if (
      normalizedDisplayStatus === 'LIVE'
      || row.currentStatusLabel === 'live'
      || row.tripStatus === 'active'
      || row.tripStatus === 'arrived'
    ) {
      return { label: 'LIVE', tone: 'green' };
    }

    if (
      normalizedDisplayStatus === 'RETURNING'
      || row.currentStatusLabel === 'returning'
      || row.tripStatus === 'returning'
    ) {
      return { label: 'RETURNING', tone: 'green' };
    }

    if (
      normalizedDisplayStatus === 'COMPLETED'
      || row.currentStatusLabel === 'completed'
      || row.tripStatus === 'completed'
    ) {
      return { label: 'COMPLETED', tone: 'green' };
    }

    if (
      normalizedDisplayStatus === 'REJECTED'
      || row.currentStatusLabel === 'rejected'
      || String(row.verificationStatus || '').toLowerCase() === 'rejected'
    ) {
      return { label: 'REJECTED', tone: 'red' };
    }

    return { label: 'UNKNOWN', tone: 'yellow' };
  };

  useEffect(() => {
    let isMounted = true;

    const loadSummary = async () => {
      try {
        const data = await getHrmuDashboardSummary();
        if (!isMounted || !data) return;

        setSummary({
          totalFacultyOutside: Number(data.totalFacultyOutside || 0),
          latestActivity: data.latestActivity || null,
          verifiedLocatorSlips: Number(data.verifiedLocatorSlips || 0),
          pendingSlips: Number(data.pendingSlips || data.unverifiedCases || 0),
        });
      } catch (error) {
        console.error('Failed to load HRMU dashboard summary:', error);
      }
    };

    loadSummary();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadLiveFaculty = async () => {
      setLiveFacultyLoading(true);

      try {
        const data = await getHrmuLiveFaculty();
        if (!isMounted || !data) return;

        setLiveFacultyRows(Array.isArray(data.faculty) ? data.faculty : []);
      } catch (error) {
        if (isMounted) {
          console.error('Failed to load HRMU live faculty:', error);
          setLiveFacultyRows([]);
        }
      } finally {
        if (isMounted) {
          setLiveFacultyLoading(false);
        }
      }
    };

    loadLiveFaculty();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadNotifications = async () => {
      setNotificationLoading(true);

      try {
        const data = await getHrmuNotifications({ page: 1, limit: 3 });
        if (!isMounted || !data) return;

        const rows = Array.isArray(data.notifications) ? data.notifications : [];
        const positiveNotificationTypes = new Set([
          'hrmu_location_verification_submitted',
          'hrmu_locator_slip_approved',
          'hrmu_trip_started',
          'hrmu_trip_arrived',
          'hrmu_trip_completed',
          'hrmu_cssu_validated_exit',
          'hrmu_verification_review_successful',
        ]);

        setNotificationRows(rows.map((notification) => {
          const isPositive = positiveNotificationTypes.has(notification.type);
          return {
            id: notification.id,
            title: notification.title || 'HRMU Update',
            body: notification.message || `${notification.facultyName} submitted a trip update.`,
            meta: formatNotificationMeta(notification.createdAt || notification.approvedAt),
            tone: isPositive ? 'green' : 'red',
            icon: isPositive
              ? <HrmuMiniCheckIcon color="var(--green)" />
              : <HrmuWarningIcon color="#C81E1E" />,
          };
        }));
      } catch (error) {
        if (isMounted) {
          console.error('Failed to load HRMU notifications:', error);
          setNotificationRows([]);
        }
      } finally {
        if (isMounted) {
          setNotificationLoading(false);
        }
      }
    };

    loadNotifications();
    const intervalId = window.setInterval(loadNotifications, 15000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadRecentActivity = async () => {
      setActivityLoading(true);

      try {
        const filters = { page: 1, limit: 10 };
        if (selectedCollegeFilter !== 'all') {
          filters.collegeName = selectedCollegeFilter;
        }

        const data = await getHrmuRecentActivity(filters);
        if (!isMounted || !data) return;

        const rows = Array.isArray(data.activities) ? data.activities : [];
        setRecentActivityRows(rows.map((row) => {
          const verificationIsVerified = ['approved', 'completed'].includes(row.verificationStatus);
          const mappedTripStatus = mapTripStatus(row);

          return {
            key: `${row.locatorSlipId}-${row.tripId || 'na'}`,
            initials: getInitials(row.facultyName),
            name: row.facultyName,
            dept: row.collegeName || row.departmentName || 'Unknown college',
            departure: formatActivityTime(row.departureTime),
            returnTime: formatActivityTime(row.expectedReturnTime),
            purpose: row.purpose || 'No purpose provided',
            verification: verificationIsVerified ? 'VERIFIED' : 'UNVERIFIED',
            verificationTone: verificationIsVerified ? 'green' : 'red',
            isFlagged: Boolean(row.isFlagged),
            incidentLabels: Array.isArray(row.incidentLabels) ? row.incidentLabels : [],
            status: mappedTripStatus.label,
            statusTone: mappedTripStatus.tone,
          };
        }));
      } catch (error) {
        if (isMounted) {
          console.error('Failed to load HRMU recent activity:', error);
          setRecentActivityRows([]);
        }
      } finally {
        if (isMounted) {
          setActivityLoading(false);
        }
      }
    };

    loadRecentActivity();

    return () => {
      isMounted = false;
    };
  }, [selectedCollegeFilter]);

  const sidebarItems = [
    { key: 'dashboard', label: 'Dashboard', icon: HrmuSidebarGridIcon, active: true },
    { key: 'verification', label: 'Verification', icon: HrmuVerificationIcon },
    { key: 'analytics', label: 'Analytics', icon: HrmuChartIcon },
    { key: 'live', label: 'Live Tracking', icon: HrmuMapRouteIcon },
    { key: 'reports', label: 'Reports', icon: HrmuReportIcon },
  ];

  const stats = [
    {
      label: 'TOTAL FACULTY OUTSIDE',
      value: String(summary.totalFacultyOutside).padStart(2, '0'),
      accent: 'green',
      meta: 'LIVE UPDATE',
      submeta: summary.latestActivity ? `Last activity ${summary.latestActivity}` : 'No active trips',
    },
    {
      label: 'VERIFIED LOCATOR SLIPS',
      value: String(summary.verifiedLocatorSlips).padStart(2, '0'),
      accent: 'yellow',
    },
    {
      label: 'PENDING SLIPS',
      value: String(summary.pendingSlips).padStart(2, '0'),
      accent: 'red',
      meta: 'NEEDS ATTENTION',
    },
  ];

  return (
    <HrmuWorkspaceShell activeKey="dashboard" setView={setView} profileData={profileData} onLogout={onLogout}>
      <section className="hrmu-stats-grid">
        {stats.map((stat) => (
          <article key={stat.label} className={`hrmu-stat-card ${stat.accent}`}>
            <span className="hrmu-stat-label">{stat.label}</span>
            <strong className="hrmu-stat-value">{stat.value}</strong>
            {stat.meta && (
              <div className="hrmu-stat-meta-row">
                <span className={`hrmu-stat-chip ${stat.accent}`}>{stat.meta}</span>
                {stat.submeta && <small>{stat.submeta}</small>}
              </div>
            )}
          </article>
        ))}
      </section>

      <section className="hrmu-overview-grid">
        <article className="hrmu-route-panel">
          <div className="hrmu-panel-heading">
            <h2>Live Faculty Route</h2>
            <button type="button">↗ View Full Map</button>
          </div>
          <div className="hrmu-map-card">
            <HrmuLiveMapPanel faculty={liveFacultyRows} compact className="hrmu-dashboard-live-map" />
            <div className="hrmu-map-summary">
              <div>
                <span>OLONGAPO ZONE</span>
                <strong>{String(liveFacultyRows.length).padStart(2, '0')}</strong>
                <small>ACTIVE SLIPS</small>
              </div>
              <div>
                <strong>{liveFacultyLoading ? '...' : `${liveFacultyRows.length ? 100 : 0}%`}</strong>
                <small>LIVE COVERAGE</small>
              </div>
            </div>
          </div>
        </article>

        <aside className="hrmu-notifications-panel">
          <div className="hrmu-panel-heading notifications">
            <h2>Notifications</h2>
            <span className="hrmu-alert-pill">{String(notificationRows.length).padStart(2, '0')} ALERTS</span>
          </div>
          <div className="hrmu-notification-list">
            {notificationLoading && (
              <div className="hrmu-notification-empty">Loading verification updates...</div>
            )}
            {!notificationLoading && notificationRows.length === 0 && (
              <div className="hrmu-notification-empty">No verified locator slip notifications yet.</div>
            )}
            {!notificationLoading && notificationRows.map((note) => (
              <article key={note.id} className={`hrmu-notification-card ${note.tone}`}>
                <div className="hrmu-notification-icon">{note.icon}</div>
                <div className="hrmu-notification-copy">
                  <h3>{note.title}</h3>
                  <p>{note.body}</p>
                  <span>{note.meta}</span>
                </div>
              </article>
            ))}
          </div>
          <button type="button" className="hrmu-history-link" onClick={() => setView('hrmu-notifications')}>VIEW ALL HISTORY</button>
        </aside>
      </section>

      <section className="hrmu-log-section">
        <div className="hrmu-log-header">
          <div>
            <h2>Recent Activity Log</h2>
            <p>Detailed record of campus entries and exits</p>
          </div>
          <div className="hrmu-log-actions">
            <label className="hrmu-filter-control">
              <HrmuFilterIcon />
              <select
                value={selectedCollegeFilter}
                onChange={(event) => setSelectedCollegeFilter(event.target.value)}
                aria-label="Filter recent activity by college"
              >
                {hrmuCollegeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="hrmu-export-btn"
              onClick={async () => {
                try {
                  const result = await exportHrmuRecentActivityCsvPlaceholder();
                  window.alert(result?.message || 'CSV export is not implemented yet.');
                } catch (error) {
                  window.alert(error.message || 'CSV export is not available right now.');
                }
              }}
            >
              <HrmuExportIcon />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <div className="hrmu-log-card">
          <div className="hrmu-log-table">
            <div className="hrmu-log-head">
              <span>FACULTY MEMBER</span>
              <span>DEPARTURE</span>
              <span>EXPECTED RETURN</span>
              <span>PURPOSE</span>
              <span>VERIFICATION</span>
              <span>STATUS</span>
            </div>

            {activityLoading && (
              <div className="hrmu-log-empty-state">Loading recent activity...</div>
            )}

            {!activityLoading && recentActivityRows.length === 0 && (
              <div className="hrmu-log-empty-state">No recent activity found for the selected college.</div>
            )}

            {!activityLoading && recentActivityRows.map((row) => (
              <div key={row.key} className="hrmu-log-row">
                <div className="hrmu-faculty-cell">
                  <div className="hrmu-initials-badge">{row.initials}</div>
                  <div>
                    <strong>{row.name}</strong>
                    <span>{row.dept}</span>
                  </div>
                </div>
                <span>{row.departure}</span>
                <span>{row.returnTime}</span>
                <span>{row.purpose}</span>
                <span className={`hrmu-verification ${row.verificationTone}`}>{row.verification}</span>
                <span className={`hrmu-status-pill ${row.statusTone}`}>{row.status}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </HrmuWorkspaceShell>
  );
};

const HrmuVerificationView = ({ setView, profileData, onLogout }) => {
  const [selectedRegistryRow, setSelectedRegistryRow] = useState(null);
  const [selectedProofDetails, setSelectedProofDetails] = useState(null);
  const [summary, setSummary] = useState({
    completedTrips: 0,
    pendingReviews: 0,
    verificationRate: 0,
  });
  const [registryRows, setRegistryRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewLocked, setReviewLocked] = useState(false);

  const buildSlipReference = (locatorSlipId) => {
    const normalized = String(locatorSlipId || '').replace(/-/g, '').slice(0, 8).toUpperCase();
    return normalized ? `LS-${normalized}` : 'Locator Slip';
  };

  const loadVerificationPage = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const proofData = await getHrmuProofComplianceList();
      const proofs = Array.isArray(proofData?.proofs) ? proofData.proofs : [];
      const mappedRows = proofs.map((row) => {
        const normalizedStatus = String(row.verificationStatus || 'submitted').toLowerCase();
        const collegeName = row.collegeName || 'Unknown college';
        const facultyName = row.facultyName || 'Faculty member';
        return {
          key: row.id,
          proofId: row.id,
          tripId: row.tripId,
          locatorSlipId: row.locatorSlipId,
          name: facultyName,
          id: row.facultyId || row.facultyUserId || 'N/A',
          department: collegeName,
          roleLine: `Faculty - ${collegeName}`,
          destination: row.destination || 'No destination provided.',
          status: normalizedStatus === 'verified'
            ? 'SUCCESSFUL'
            : normalizedStatus === 'rejected'
              ? 'FLAGGED'
              : 'PENDING',
          statusTone: normalizedStatus === 'verified' ? 'green' : normalizedStatus === 'rejected' ? 'red' : 'yellow',
          actionTone: 'ghost',
          actionIcon: <HrmuEyeMiniIcon color="#3B3B3B" />,
          slipNumber: buildSlipReference(row.locatorSlipId),
          focalPersonName: row.focalPersonName || 'N/A',
          focalPersonPosition: row.focalPersonPosition || 'N/A',
          proofComplianceImageUrl: row.proofComplianceImageUrl || null,
          arrivalPhotoUrl: row.arrivalPhotoUrl || null,
          verificationStatus: normalizedStatus,
          submittedAt: row.submittedAt || null,
          reviewedAt: row.reviewedAt || null,
          expectedReturnTime: row.expectedReturnTime || null,
          actualReturnTime: row.actualReturnTime || null,
          purpose: row.purpose || 'Official travel',
          timeOut: row.actualReturnTime
            ? new Date(row.actualReturnTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'N/A',
        };
      });

      const successfulTrips = mappedRows.filter((row) => row.verificationStatus === 'verified').length;
      const pendingReviews = mappedRows.filter((row) => row.verificationStatus === 'submitted').length;

      setRegistryRows(mappedRows);
      setSummary({
        completedTrips: mappedRows.length,
        pendingReviews,
        verificationRate: mappedRows.length ? (successfulTrips / mappedRows.length) * 100 : 0,
      });
      setSelectedRegistryRow((current) => {
        if (!current) return null;
        return mappedRows.find((row) => row.key === current.key) || null;
      });
    } catch (error) {
      console.error('Failed to load HRMU verification registry:', error);
      setRegistryRows([]);
      setSelectedRegistryRow(null);
      setSelectedProofDetails(null);
      setSummary({
        completedTrips: 0,
        pendingReviews: 0,
        verificationRate: 0,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const safeLoad = async ({ silent = false } = {}) => {
      if (!isMounted) return;
      await loadVerificationPage({ silent });
    };

    safeLoad();
    const intervalId = window.setInterval(() => safeLoad({ silent: true }), 15000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [loadVerificationPage]);

  const verificationStats = [
    { label: 'COMPLETED TRIPS', value: String(summary.completedTrips).padStart(2, '0'), tone: 'green', decorate: true },
    { label: 'PENDING REVIEWS', value: String(summary.pendingReviews).padStart(2, '0'), tone: 'neutral' },
  ];

  const handleProofReview = async (nextStatus) => {
    if (!selectedRegistryRow?.proofId) {
      setReviewMessage('No uploaded proof is available to review for this trip.');
      return;
    }

    try {
      setReviewing(true);
      setReviewMessage('');
      const result = await reviewHrmuProofCompliance(selectedRegistryRow.proofId, {
        verificationStatus: nextStatus,
      });
      setReviewMessage(nextStatus === 'verified'
        ? 'Trip marked as successful.'
        : 'Trip flagged as unverified location.');
      setReviewLocked(true);
      setSelectedProofDetails(result);
      await loadVerificationPage({ silent: true });
    } catch (error) {
      setReviewMessage(error.message || 'Verification review could not be saved.');
    } finally {
      setReviewing(false);
    }
  };

  const openRegistryRow = async (row) => {
    setReviewLocked(false);
    setReviewMessage('');
    setSelectedRegistryRow(row);
    setSelectedProofDetails(null);
    try {
      const details = await getHrmuProofComplianceDetails(row.proofId);
      setSelectedProofDetails(details);
    } catch (error) {
      setReviewMessage(error.message || 'Failed to load proof details.');
    }
  };

  const closeRegistryRow = () => {
    setReviewLocked(false);
    setReviewMessage('');
    setSelectedRegistryRow(null);
    setSelectedProofDetails(null);
  };

  return (
    <HrmuWorkspaceShell activeKey="verification" setView={setView} profileData={profileData} onLogout={onLogout}>
      <section className="hrmu-verification-hero">
        <span className="hrmu-verification-eyebrow">ACADEMIC LOGISTICS</span>
        <h1>External Faculty Verification</h1>
        <p>Review completed trips, inspect the submitted proof of compliance, and decide whether each trip remains successful or should be flagged as an unverified location.</p>
      </section>

      <section className="hrmu-verification-stats">
        {verificationStats.map((card) => (
          <article key={card.label} className={`hrmu-verify-stat-card ${card.tone}`}>
            <span className="hrmu-verify-stat-label">{card.label}</span>
            <strong className="hrmu-verify-stat-value">{card.value}</strong>
            {card.decorate && <div className="hrmu-verify-card-mark" aria-hidden="true" />}
          </article>
        ))}
        <article className="hrmu-verify-rate-card">
          <span className="hrmu-verify-stat-label inverse">VERIFICATION RATE</span>
          <div className="hrmu-verify-rate-row">
            <strong>{summary.verificationRate.toFixed(1)}%</strong>
            <div className="hrmu-verify-bars" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </article>
      </section>

      <section className="hrmu-verify-registry-card">
        <div className="hrmu-verify-registry-header">
          <div className="hrmu-verify-registry-title">
            <span className="hrmu-verify-registry-accent" aria-hidden="true" />
            <h2>Completed Trips Registry</h2>
          </div>
        </div>

        <ProofComplianceList rows={registryRows} loading={loading} onOpen={openRegistryRow} />

        <button type="button" className="hrmu-verify-footer-link">
          View All {registryRows.length} Submitted Proofs
        </button>
      </section>

      {selectedRegistryRow && (
        <ProofComplianceDetails
          row={selectedRegistryRow}
          details={selectedProofDetails}
          reviewMessage={reviewMessage}
          reviewing={reviewing}
          reviewLocked={reviewLocked || String(selectedProofDetails?.verificationStatus || selectedRegistryRow?.verificationStatus || '').toLowerCase() !== 'submitted'}
          onClose={closeRegistryRow}
          onReview={handleProofReview}
        />
      )}
    </HrmuWorkspaceShell>
  );
};

const HrmuAnalyticsReportsView = ({ setView, profileData, onLogout, activeKey = 'analytics' }) => {
  const {
    filters,
    analytics,
    loading,
    error,
    exportMessage,
    departmentOptions,
    monthOptions,
    updateFilter,
    applyFilters,
    exportCsv,
    exportPdf,
  } = useHrmuAnalytics();

  const numberFormatter = new Intl.NumberFormat('en-PH');
  const percentFormatter = new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  const decimalFormatter = new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });

  const chartLabels = analytics?.dailyFacultyMovement?.labels || ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const chartValues = analytics?.dailyFacultyMovement?.values || [];
  const maxChartValue = chartValues.length ? Math.max(...chartValues, 0) : 0;
  const approvalRate = analytics?.approvalRate || {};
  const frequentDestinations = analytics?.frequentDestinations || [];
  const monthlySummary = analytics?.monthlyPerformanceSummary || {};
  const selectedCollegeLabel = departmentOptions.find((option) => option.value === String(filters.collegeName || ''))?.label || 'All Departments';

  const weeklyDirectionLabel = approvalRate.weeklyChangeDirection === 'decrease'
    ? 'decrease'
    : approvalRate.weeklyChangeDirection === 'increase'
      ? 'increase'
      : 'no change';
  const weeklyDirectionSymbol = approvalRate.weeklyChangeDirection === 'decrease'
    ? 'v'
    : approvalRate.weeklyChangeDirection === 'increase'
      ? '^'
      : '-';
  const tripsDirectionSymbol = monthlySummary.tripsMonthOverMonthDirection === 'decrease'
    ? 'v'
    : monthlySummary.tripsMonthOverMonthDirection === 'increase'
      ? '^'
      : '-';

  const summaryCards = [
    {
      label: 'TOTAL TRIPS',
      value: numberFormatter.format(monthlySummary.totalTripsCompleted || 0),
      note: `${tripsDirectionSymbol} ${percentFormatter.format(monthlySummary.tripsMonthOverMonthPercent || 0)}% MoM`,
      tone: 'green',
    },
    {
      label: 'AVG. DISTANCE',
      value: `${decimalFormatter.format(monthlySummary.averageDistanceKm || 0)} km`,
      note: monthlySummary.averageDistanceLabel || 'Optimized',
      tone: 'yellow',
    },
    {
      label: 'USERS',
      value: numberFormatter.format(monthlySummary.uniqueUsersCompletedTrips || 0),
      note: `${percentFormatter.format(monthlySummary.engagementRatePercent || 0)}% Engaged`,
      tone: 'green',
    },
    {
      label: 'PEAK HOUR',
      value: monthlySummary.peakHour || '--',
      note: monthlySummary.peakHourLabel || 'No peak hour',
      tone: 'dark',
    },
  ];

  const handleExportCsv = async () => {
    try {
      await exportCsv();
    } catch (requestError) {
      console.error('CSV export placeholder failed:', requestError);
    }
  };

  const handleExportPdf = async () => {
    try {
      await exportPdf();
    } catch (requestError) {
      console.error('PDF export placeholder failed:', requestError);
    }
  };

  return (
    <HrmuWorkspaceShell activeKey={activeKey} setView={setView} profileData={profileData} onLogout={onLogout}>
      <section className="hrmu-analytics-hero">
        <div className="hrmu-analytics-copy">
          <span className="hrmu-analytics-tag">RECEIVED FROM CSSU</span>
          <h1>Analytics &amp; Reporting</h1>
          <p>Advanced insights into faculty movement and departmental flow across campus transit routes.</p>
        </div>
        <div className="hrmu-analytics-actions">
          <button type="button" className="hrmu-analytics-export ghost" onClick={handleExportCsv}>
            <HrmuExportIcon color="#5F645F" />
            <span>CSV</span>
          </button>
          <button type="button" className="hrmu-analytics-export primary" onClick={handleExportPdf}>
            <HrmuReportIcon color="white" />
            <span>Export PDF</span>
          </button>
        </div>
      </section>

      <section className="hrmu-analytics-filter-card">
        <div className="hrmu-analytics-filter-group">
          <span>DATE RANGE</span>
          <select
            className="hrmu-analytics-select hrmu-analytics-select-input"
            value={filters.month}
            onChange={(event) => updateFilter('month', event.target.value)}
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="hrmu-analytics-filter-group">
          <span>DEPARTMENT</span>
          <select
            className="hrmu-analytics-select hrmu-analytics-select-input"
            value={filters.collegeName}
            onChange={(event) => updateFilter('collegeName', event.target.value)}
          >
            {departmentOptions.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="hrmu-analytics-apply-btn" onClick={applyFilters}>
          Apply Filters
        </button>
      </section>

      {(error || exportMessage) && (
        <div className="hrmu-analytics-feedback">
          {error ? <span>{error}</span> : null}
          {exportMessage ? <span>{exportMessage}</span> : null}
        </div>
      )}

      <section className="hrmu-analytics-top-grid">
        <article className="hrmu-analytics-chart-card">
          <div className="hrmu-analytics-panel-head">
            <div>
              <h2>Daily Faculty Movement</h2>
              <p>
                {selectedCollegeLabel === 'All Departments'
                  ? 'Tracking locator slip volume across the five HRMU colleges'
                  : `Tracking locator slip volume for ${selectedCollegeLabel}`}
              </p>
            </div>
            <div className="hrmu-analytics-legend">
              <span className="departures">Locator Slips</span>
              <span className="arrivals">{analytics?.dateRange?.label || 'Current Month'}</span>
            </div>
          </div>
          {loading ? (
            <div className="hrmu-analytics-loading">Loading analytics...</div>
          ) : (
            <div className="hrmu-analytics-chart">
              {chartLabels.map((label, index) => {
                const currentValue = Number(chartValues[index] || 0);
                const height = maxChartValue > 0 ? Math.max((currentValue / maxChartValue) * 100, 12) : 12;

                return (
                  <div key={label} className="hrmu-analytics-chart-col">
                    <div className="hrmu-analytics-bar" style={{ height: `${height}%` }} title={`${label}: ${currentValue}`} />
                    <span>{label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <article className="hrmu-analytics-rate-card">
          <h2>Approval Rate</h2>
          <p>Request vs Approval efficiency</p>
          <div className="hrmu-analytics-ring">
            <div>
              <strong>{percentFormatter.format(approvalRate.percentage || 0)}%</strong>
              <span>{(approvalRate.percentage || 0) >= 50 ? 'SUCCESS' : 'IN REVIEW'}</span>
            </div>
          </div>
          <div className="hrmu-analytics-growth">
            {`${weeklyDirectionSymbol} ${percentFormatter.format(approvalRate.weeklyChangePercent || 0)}% ${weeklyDirectionLabel} from last period`}
          </div>
          <small className="hrmu-analytics-rate-meta">
            {`${numberFormatter.format(approvalRate.approvedCount || 0)} approved / ${numberFormatter.format(approvalRate.totalFiledCount || 0)} filed`}
          </small>
        </article>
      </section>

      <section className="hrmu-analytics-bottom-grid">
        <article className="hrmu-analytics-destinations-card">
          <h2>Frequent Destinations</h2>
          <div className="hrmu-analytics-destination-list">
            {frequentDestinations.length ? (
              frequentDestinations.slice(0, 5).map((row) => {
                const topCount = frequentDestinations[0]?.count || 1;
                const width = `${Math.max((Number(row.count || 0) / topCount) * 100, 10)}%`;

                return (
                  <div key={`${row.rank}-${row.label}`} className="hrmu-analytics-destination-item">
                    <div className="hrmu-analytics-rank">{row.rank}</div>
                    <div className="hrmu-analytics-destination-copy">
                      <strong title={row.label}>{row.label}</strong>
                      <div className="hrmu-analytics-destination-bar-track">
                        <div className="hrmu-analytics-destination-bar-fill" style={{ width }} />
                      </div>
                    </div>
                    <span>{numberFormatter.format(row.count || 0)}</span>
                  </div>
                );
              })
            ) : (
              <div className="hrmu-analytics-empty">No destination history found for this month.</div>
            )}
          </div>
        </article>

        <article className="hrmu-analytics-summary-card">
          <h2>Monthly Performance Summary</h2>
          <div className="hrmu-analytics-summary-grid">
            {summaryCards.map((card) => (
              <div key={card.label} className={`hrmu-analytics-mini-card ${card.tone}`}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <small>{card.note}</small>
              </div>
            ))}
          </div>
          <div className="hrmu-analytics-milestone">
            <div className="hrmu-analytics-milestone-track">
              <span className="done">1</span>
              <span className="done">2</span>
              <span className="current">3</span>
              <span>4</span>
              <span>5</span>
            </div>
            <div className="hrmu-analytics-milestone-copy">
              <small>CURRENT MILESTONE</small>
              <strong>HRMU Verification Finalized</strong>
            </div>
          </div>
        </article>
      </section>
    </HrmuWorkspaceShell>
  );
};
const HrmuReportsView = ({ setView, profileData, onLogout }) => {
  const [downloadLoading, setDownloadLoading] = useState(false);
  const {
    monthIndex,
    baseYear,
    report,
    loading,
    error,
    detailLoading,
    selectedDetail,
    setSelectedDetail,
    goPrevious,
    goNext,
    openDetails,
  } = useHrmuMonthlyReport({ initialMonthIndex: 1, initialYear: 2026 });

  const summary = report?.summary || {};
  const reportRows = Array.isArray(report?.locatorSlipLogs) ? report.locatorSlipLogs : [];
  const reportMeta = report?.reportMeta || {};
  const sequenceMonthName = REPORT_SEQUENCE_MONTHS[monthIndex - 1] || 'January';
  const flaggedSummaryNote = `${summary.lateReturns || 0} late | ${summary.unverifiedLocations || 0} unverified | ${summary.disconnectedLocations || 0} disconnected`;

  const summaryCards = [
    { label: 'TOTAL MOVEMENTS', value: String(summary.totalMovements || 0), note: `${summary.successfulTrips || 0} successful trips`, tone: 'green' },
    { label: 'FLAGGED INCIDENTS', value: String(summary.flaggedIncidents || 0), note: `${summary.lateReturns || 0} late • ${summary.unverifiedLocations || 0} unverified • ${summary.disconnectedLocations || 0} disconnected`, tone: 'red' },
    { label: 'COMPLIANCE RATE', value: `${Number(summary.complianceRate || 0).toFixed(1)}%`, note: `${summary.successfulTrips || 0} compliant / ${summary.totalMovements || 0} total`, tone: 'yellow' },
  ];
  summaryCards[1].note = flaggedSummaryNote;

  const mapStatusTone = (status) => {
    if (status === 'VERIFIED') return 'green';
    if (status === 'REJECTED') return 'red';
    return 'red';
  };

  const handleDownloadReport = async () => {
    if (loading || downloadLoading) return;

    setDownloadLoading(true);
    try {
      const { blob, filename } = await downloadHrmuMonthlyReportPdf({ monthIndex, baseYear });
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      window.alert(error.message || 'Unable to download the monthly report.');
    } finally {
      setDownloadLoading(false);
    }
  };

  const handlePrintReport = () => {
    if (loading) return;
    window.print();
  };

  return (
    <HrmuWorkspaceShell activeKey="reports" setView={setView} profileData={profileData} onLogout={onLogout}>
      <section className="hrmu-reports-page">
        <div className="hrmu-reports-toolbar no-print">
          <div className="hrmu-reports-titlebar">
            <button type="button" className="hrmu-reports-back-btn" aria-label="Back to dashboard" onClick={() => setView('hrmu-dashboard')}>
              <BackArrowIcon color="currentColor" />
            </button>
            <strong>{reportMeta.title || 'Monthly Security Report'}</strong>
            <span className="hrmu-reports-badge">CONFIDENTIAL</span>
          </div>

          <div className="hrmu-reports-tools">
            <div className="hrmu-reports-pager">
              <button type="button" aria-label="Previous page" onClick={goPrevious} disabled={reportMeta.isFirst}>
                <span className="hrmu-reports-chevron-prev">
                  <ChevronRightIcon color="currentColor" />
                </span>
              </button>
              <strong>{monthIndex}</strong>
              <span>/ 12</span>
              <button type="button" aria-label="Next page" onClick={goNext} disabled={reportMeta.isLast}>
                <span className="hrmu-reports-chevron-next">
                  <ChevronRightIcon color="currentColor" />
                </span>
              </button>
            </div>
            <div className="hrmu-reports-zoom">
              <button type="button" aria-label="Zoom out">-</button>
              <strong>100%</strong>
              <button type="button" aria-label="Zoom in">+</button>
            </div>
            <button type="button" className="hrmu-reports-icon-btn" aria-label="Download report" onClick={handleDownloadReport} disabled={downloadLoading || loading}>
              <RegistryDownloadIcon />
            </button>
            <button type="button" className="hrmu-reports-icon-btn" aria-label="Print report" onClick={handlePrintReport} disabled={loading}>
              <ReportPrintIcon />
            </button>
          </div>
        </div>

        <div className="hrmu-reports-canvas">
          <article className="hrmu-reports-sheet" id="hrmu-monthly-report-print-area">
            <div className="hrmu-reports-sheet-head">
              <div className="hrmu-reports-brand-block">
                <div className="hrmu-reports-brand-icon">
                  <TogaLogoIcon size={36} />
                </div>
                <div>
                  <strong>EduRoute HRMU</strong>
                  <span>FACULTY MOVEMENT</span>
                </div>
              </div>

              <div className="hrmu-reports-doc-meta">
                <strong>OFFICIAL DOCUMENT</strong>
                <span>{`Report Sequence: ${monthIndex} / 12`}</span>
                <span>{`Coverage: ${reportMeta.monthName || sequenceMonthName}, ${reportMeta.year || baseYear}`}</span>
              </div>
            </div>

            <div className="hrmu-reports-divider" />

            <div className="hrmu-reports-section">
              <h1>Monthly Movement &amp; Violation Summary</h1>
              <div className="hrmu-reports-subdivider" />
              <p>
                This report provides a comprehensive overview of logistical activities, security transitions,
                and flagged trip incidents within the HRMU jurisdiction for month of {reportMeta.monthName || sequenceMonthName}.
              </p>
            </div>

            <div className="hrmu-reports-summary-grid">
              {summaryCards.map((card) => (
                <article key={card.label} className={`hrmu-reports-summary-card ${card.tone}`}>
                  <span>{card.label}</span>
                  <strong>{loading ? '--' : card.value}</strong>
                  <small>{loading ? 'Loading...' : card.note}</small>
                </article>
              ))}
            </div>

            <div className="hrmu-reports-log-head">
              <div className="hrmu-reports-log-title">
                <span className="hrmu-reports-log-icon">
                  <DocumentIcon color="currentColor" width="24" height="24" />
                </span>
                <h2>Key Incident Log</h2>
              </div>
            </div>

            <div className="hrmu-reports-table-wrap">
              <div className="hrmu-reports-table-head">
                <span>TIMESTAMP</span>
                <span>LOCATION</span>
                <span>PERSONNEL</span>
                <span>STATUS</span>
                <span>ACTION</span>
              </div>
              {loading && <div className="hrmu-reports-table-row"><span>Loading...</span><span>Loading...</span><span>Loading...</span><span>Loading...</span><span>Loading...</span></div>}
              {!loading && reportRows.length === 0 && <div className="hrmu-reports-table-row"><span>No data</span><span>No logs found for this month.</span><span>--</span><span>--</span><span>--</span></div>}
              {!loading && reportRows.map((row) => (
                <div key={`${row.timestamp}-${row.personnel}-${row.status}`} className="hrmu-reports-table-row">
                  <span>{row.timestampLabel}</span>
                  <span>{row.location}</span>
                  <span>{row.personnel}</span>
                  <span><em className={`hrmu-reports-status-pill ${mapStatusTone(row.status)}`}>{row.status}</em></span>
                  <button type="button" className="hrmu-reports-detail-link" onClick={() => openDetails(row.locatorSlipId)}>Details</button>
                </div>
              ))}
            </div>
            {error && <p className="hrmu-reports-inline-error">{error}</p>}
          </article>
        </div>

        {selectedDetail && (
          <div className="hrmu-reports-detail-overlay" role="presentation" onClick={() => setSelectedDetail(null)}>
            <div className="hrmu-reports-detail-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <div className="hrmu-reports-detail-head">
                <h3>{selectedDetail.facultyName}</h3>
                <button type="button" className="hrmu-reports-detail-close" onClick={() => setSelectedDetail(null)} aria-label="Close details">
                  <RegistryModalCloseIcon />
                </button>
              </div>
              {detailLoading ? <p>Loading details...</p> : (
                <div className="hrmu-reports-detail-grid">
                  <p><strong>College:</strong> {selectedDetail.collegeName}</p>
                  <p><strong>Destination:</strong> {selectedDetail.destination}</p>
                  <p><strong>Purpose:</strong> {selectedDetail.purpose}</p>
                  <p><strong>Locator Status:</strong> {selectedDetail.locatorStatus}</p>
                  <p><strong>Trip Status:</strong> {selectedDetail.tripStatus || 'No linked trip'}</p>
                  <p><strong>Verification:</strong> {selectedDetail.verificationStatus || 'missing'}</p>
                  <div className="hrmu-reports-detail-reasons">
                    <strong>Flagged Reasons</strong>
                    {Array.isArray(selectedDetail.flaggedReasons) && selectedDetail.flaggedReasons.length > 0 ? selectedDetail.flaggedReasons.map((reason) => (
                      <div key={`${reason.type}-${reason.detectedAt || ''}`} className="hrmu-reports-detail-reason">
                        <span>{reason.label}</span>
                        <small>{reason.severity}</small>
                      </div>
                    )) : <p>No flagged incidents attached.</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </HrmuWorkspaceShell>
  );
};
const HrmuNotificationsView = ({ setView, profileData, onLogout }) => {
  return (
    <HrmuWorkspaceShell activeKey="" setView={setView} profileData={profileData} onLogout={onLogout} bellActive>
      <section className="hrmu-alerts-page">
        <div className="hrmu-alerts-hero">
          <div className="hrmu-alerts-copy">
            <span className="hrmu-alerts-kicker">INTERNAL LOGISTICS</span>
            <h1>System Alerts</h1>
            <p>Real-time monitoring and security notifications for HRMU faculty and campus operations.</p>
          </div>
          <div className="hrmu-alerts-actions">
            <button type="button" className="hrmu-alerts-btn ghost">Mark all read</button>
            <button type="button" className="hrmu-alerts-btn primary"><span aria-hidden="true">⌁</span><span>Filters</span></button>
          </div>
        </div>

        <section className="hrmu-alerts-grid">
          <article className="hrmu-alert-main-card">
            <div className="hrmu-alert-main-accent" aria-hidden="true" />
            <div className="hrmu-alert-main-body">
              <div className="hrmu-alert-main-icon">
                <HrmuWarningIcon />
              </div>
              <div className="hrmu-alert-main-copy">
                <div className="hrmu-alert-main-head">
                  <div className="hrmu-alert-main-badges">
                    <span className="hrmu-alert-critical-pill">CRITICAL</span>
                  </div>
                  <span className="hrmu-alert-main-time">2 mins ago</span>
                </div>
                <h2>Faculty outside without verification</h2>
                <p>System detected Dr. Rey Gun exited Main Gate. No Locator Slip verification found in the last 15 minutes.</p>
                <div className="hrmu-alert-main-actions">
                  <button type="button" className="hrmu-alert-primary-btn">Initiate Contact</button>
                  <button type="button" className="hrmu-alert-text-btn">Review Maps</button>
                </div>
              </div>
            </div>
          </article>

          <aside className="hrmu-alerts-side-column">
            <article className="hrmu-alert-summary-card">
              <span className="hrmu-alert-summary-kicker">INCIDENT SUMMARY</span>
              <div className="hrmu-alert-summary-row">
                <span>Critical Issues</span>
                <strong>01</strong>
              </div>
              <div className="hrmu-alert-summary-row">
                <span>Active Warnings</span>
                <strong>03</strong>
              </div>
              <div className="hrmu-alert-summary-row">
                <span>Verified Cleared</span>
                <strong className="yellow">88%</strong>
              </div>
              <div className="hrmu-alert-summary-mark" aria-hidden="true" />
            </article>

            <article className="hrmu-alert-report-card">
              <div className="hrmu-alert-report-icon">
                <HrmuSyncIcon />
              </div>
              <h3>Monthly Log Report</h3>
              <p>30-days summary is ready for download.</p>
              <button type="button" className="hrmu-alert-download-btn">DOWNLOAD PDF</button>
            </article>
          </aside>
        </section>
      </section>
    </HrmuWorkspaceShell>
  );
};

const HrmuNotificationsRealtimeView = ({ setView, profileData, onLogout }) => {
  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState('');
  const [alertFilter, setAlertFilter] = useState('all');
  const [incidentSummary, setIncidentSummary] = useState({
    lateReturns: 0,
    unverifiedLocations: 0,
    disconnectedLocations: 0,
  });

  useEffect(() => {
    let isMounted = true;

    const formatRelativeAlertTime = (value) => {
      if (!value) return 'Time unavailable';

      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return 'Time unavailable';

      const diffMs = Date.now() - date.getTime();
      const diffMinutes = Math.max(Math.round(diffMs / 60000), 0);

      if (diffMinutes < 1) return 'Just now';
      if (diffMinutes < 60) return `${diffMinutes} min${diffMinutes === 1 ? '' : 's'} ago`;

      const diffHours = Math.round(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;

      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    };

    const loadAlerts = async () => {
      setAlertsLoading(true);
      setAlertsError('');

      try {
        const [notificationData, summaryData, flaggedTripsData] = await Promise.all([
          getHrmuNotifications({ page: 1, limit: 6 }),
          getHrmuVerificationIncidentSummary(),
          getHrmuFlaggedTrips(),
        ]);

        if (!isMounted) return;

        const notificationRows = Array.isArray(notificationData?.notifications) ? notificationData.notifications : [];
        const flaggedRows = Array.isArray(flaggedTripsData?.trips) ? flaggedTripsData.trips : [];
        const positiveNotificationTypes = new Set([
          'hrmu_locator_slip_approved',
          'hrmu_trip_started',
          'hrmu_trip_arrived',
          'hrmu_trip_completed',
          'hrmu_cssu_validated_exit',
          'hrmu_location_verification_submitted',
        ]);

        const verifiedAlerts = notificationRows
          .filter((notification) => positiveNotificationTypes.has(notification.type))
          .map((notification) => {
            const defaultTitle = notification.type === 'hrmu_trip_started'
              ? 'Trip started'
              : notification.type === 'hrmu_trip_completed'
                ? 'Faculty returned on time'
                : notification.type === 'hrmu_cssu_validated_exit'
                  ? 'Exit clearance validated'
                  : notification.type === 'hrmu_trip_arrived'
                    ? 'Faculty arrived at destination'
                    : notification.title || 'Verified activity';
            return {
              id: `verified-${notification.id}`,
              type: 'verified',
              title: defaultTitle,
              body: notification.message || `${notification.facultyName} locator slip approved.`,
              time: formatRelativeAlertTime(notification.createdAt || notification.approvedAt),
              sortDate: notification.createdAt || notification.approvedAt ? new Date(notification.createdAt || notification.approvedAt).getTime() : 0,
              actionLabelPrimary: notification.type === 'hrmu_cssu_validated_exit' ? 'Open Dashboard' : 'Open Dashboard',
              actionLabelSecondary: notification.type === 'hrmu_trip_started' || notification.type === 'hrmu_trip_completed' ? 'Open Reports' : 'Review Verification',
            };
          });

        const violationAlerts = flaggedRows.map((trip) => ({
          id: `violation-${trip.tripId}`,
          type: 'violation',
          title: (trip.incidentLabels?.[0] || 'Trip Incident Detected').replace('detected', '').trim() || 'Trip Incident Detected',
          body: `${trip.facultyName} has active incident conditions${trip.destination ? ` en route to ${trip.destination}` : ''}. Reasons: ${(trip.incidentLabels || []).join(', ') || 'Review required'}.`,
          time: formatRelativeAlertTime(trip.latestDetectedAt),
          sortDate: trip.latestDetectedAt ? new Date(trip.latestDetectedAt).getTime() : 0,
          actionLabelPrimary: 'Review Verification',
          actionLabelSecondary: 'Open Reports',
        }));

        const mergedAlerts = [...violationAlerts, ...verifiedAlerts]
          .sort((left, right) => (right.sortDate || 0) - (left.sortDate || 0));

        setAlerts(mergedAlerts);

        setIncidentSummary({
          lateReturns: Number(summaryData?.lateReturns || 0),
          unverifiedLocations: Number(summaryData?.unverifiedLocations || 0),
          disconnectedLocations: Number(summaryData?.disconnectedLocations || 0),
        });
      } catch (error) {
        if (isMounted) {
          console.error('Failed to load HRMU alerts:', error);
          setAlerts([]);
          setIncidentSummary({
            lateReturns: 0,
            unverifiedLocations: 0,
            disconnectedLocations: 0,
          });
          setAlertsError(error.message || 'Failed to load HRMU alerts.');
        }
      } finally {
        if (isMounted) {
          setAlertsLoading(false);
        }
      }
    };

    loadAlerts();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredAlerts = alerts.filter((alert) => {
    if (alertFilter === 'verified') return alert.type === 'verified';
    if (alertFilter === 'flagged') return alert.type === 'violation';
    return true;
  });

  const featuredAlert = filteredAlerts[0] || null;
  const featuredTone = featuredAlert?.type === 'violation' ? 'incident' : 'verified';
  const featuredPillLabel = alertsLoading
    ? 'LOADING'
    : featuredAlert?.type === 'violation'
      ? 'VIOLATION'
      : featuredAlert
        ? 'VERIFIED'
        : 'NO ALERTS';
  const filterLabel = alertFilter === 'all'
    ? 'All'
    : alertFilter === 'verified'
      ? 'Verified'
      : 'Flagged';

  return (
    <HrmuWorkspaceShell activeKey="" setView={setView} profileData={profileData} onLogout={onLogout} bellActive>
      <section className="hrmu-alerts-page">
        <div className="hrmu-alerts-hero">
          <div className="hrmu-alerts-copy">
            <span className="hrmu-alerts-kicker">INTERNAL LOGISTICS</span>
            <h1>System Alerts</h1>
            <p>Real-time monitoring and security notifications for HRMU faculty and campus operations.</p>
          </div>
          <div className="hrmu-alerts-actions">
            <button type="button" className="hrmu-alerts-btn ghost">Mark all read</button>
            <label className="hrmu-alerts-filter">
              <StatusGraphIcon color="currentColor" />
              <select value={alertFilter} onChange={(event) => setAlertFilter(event.target.value)} aria-label="Filter alerts">
                <option value="all">All</option>
                <option value="verified">Verified</option>
                <option value="flagged">Flagged</option>
              </select>
            </label>
          </div>
        </div>

        <section className="hrmu-alerts-grid">
          <article className={`hrmu-alert-main-card ${featuredTone}`}>
            <div className="hrmu-alert-main-accent" aria-hidden="true" />
            <div className="hrmu-alert-main-body">
              <div className="hrmu-alert-main-icon">
                {featuredAlert?.type === 'violation' ? <HrmuWarningIcon /> : <NotifSlipIcon />}
              </div>
              <div className="hrmu-alert-main-copy">
                <div className="hrmu-alert-main-head">
                  <div className="hrmu-alert-main-badges">
                    <span className={`hrmu-alert-critical-pill ${featuredTone}`}>{featuredPillLabel}</span>
                  </div>
                  <span className="hrmu-alert-main-time">{featuredAlert?.time || 'Awaiting updates'}</span>
                </div>
                <h2>{featuredAlert?.title || 'No HRMU notifications yet'}</h2>
                <p>
                  {featuredAlert
                    ? featuredAlert.body
                    : `No ${filterLabel.toLowerCase()} alerts available right now.`}
                </p>
                <div className="hrmu-alert-main-actions">
                  <button
                    type="button"
                    className={`hrmu-alert-primary-btn ${featuredTone}`}
                    onClick={() => setView(featuredAlert?.type === 'violation' ? 'hrmu-verification' : 'hrmu-dashboard')}
                  >
                    {featuredAlert?.actionLabelPrimary || 'Open Dashboard'}
                  </button>
                  <button
                    type="button"
                    className="hrmu-alert-text-btn"
                    onClick={() => setView(featuredAlert?.type === 'violation' ? 'hrmu-reports' : 'hrmu-verification')}
                  >
                    {featuredAlert?.actionLabelSecondary || 'Review Verification'}
                  </button>
                </div>
              </div>
            </div>
          </article>

          <aside className="hrmu-alerts-side-column">
            <article className="hrmu-alert-summary-card">
              <span className="hrmu-alert-summary-kicker">INCIDENT SUMMARY</span>
              <div className="hrmu-alert-summary-row">
                <span>Late Return</span>
                <strong>{String(incidentSummary.lateReturns || 0).padStart(2, '0')}</strong>
              </div>
              <div className="hrmu-alert-summary-row">
                <span>Unverified Location</span>
                <strong>{String(incidentSummary.unverifiedLocations || 0).padStart(2, '0')}</strong>
              </div>
              <div className="hrmu-alert-summary-row">
                <span>Disconnected Location</span>
                <strong>{String(incidentSummary.disconnectedLocations || 0).padStart(2, '0')}</strong>
              </div>
              <div className="hrmu-alert-summary-mark" aria-hidden="true" />
            </article>

            <article className="hrmu-alert-report-card">
              <div className="hrmu-alert-report-icon">
                <HrmuSyncIcon />
              </div>
              <h3>Monthly Log Report</h3>
              <p>30-days summary is ready for download.</p>
              <button type="button" className="hrmu-alert-download-btn">DOWNLOAD PDF</button>
            </article>
          </aside>
        </section>
        {alertsError ? <p className="hrmu-alerts-inline-error">{alertsError}</p> : null}
      </section>
    </HrmuWorkspaceShell>
  );
};

const HrmuLiveTrackingView = ({ setView, profileData, onLogout }) => {
  const {
    center,
    facultyLocations,
    selectedFaculty,
    selectedFacultyDetail,
    activityItems,
    loading,
    detailLoading,
    activityLoading,
    error,
    selectFaculty,
    reload,
    loadMoreActivity,
  } = useHrmuLiveTracking();

  const mapCenter = useMemo(() => [
    Number(center?.lng || OLONGAPO_CENTER[0]),
    Number(center?.lat || OLONGAPO_CENTER[1]),
  ], [center?.lat, center?.lng]);

  return (
    <HrmuWorkspaceShell activeKey="live" setView={setView} profileData={profileData} onLogout={onLogout}>
      <section className="hrmu-live-page">
        <div className="hrmu-live-map-stage">
          <HrmuLiveMapPanel
            faculty={facultyLocations}
            center={mapCenter}
            selectedFacultyUserId={selectedFaculty?.facultyUserId || null}
            onMarkerSelect={selectFaculty}
            focusOnOlongapo
            className="hrmu-live-stage-map"
          />

          <div className="hrmu-live-controls">
            <button type="button" className="hrmu-live-control-btn" aria-label="Refresh active faculty" onClick={reload}>R</button>
            <button type="button" className="hrmu-live-control-btn" aria-label="Olongapo City focus">{center?.label?.slice(0, 1) || 'O'}</button>
          </div>

          <FacultyActivityLog
            activity={activityItems}
            loading={loading || activityLoading}
            onViewAll={() => loadMoreActivity(20)}
          />

          <FacultyDetailCard
            faculty={selectedFaculty}
            detail={selectedFacultyDetail}
            loading={loading || detailLoading}
          />

          {error && (
            <div className="hrmu-live-inline-alert">
              <strong>Live tracking error</strong>
              <span>{error}</span>
            </div>
          )}
        </div>
      </section>
    </HrmuWorkspaceShell>
  );
};
const AdminDashboardView = ({ setView, profileData }) => {
  if (['assistant_dean', 'college_dean'].includes(profileData?.accountRole)) {
    return <DeanDashboardView setView={setView} profileData={profileData} />;
  }

  const notifications = [
    { id: 1, text: 'New budget proposal from Dept. of Humanities.', time: '2 mins ago', unread: true },
    { id: 2, text: 'Course curriculum revision needs signature.', time: '45 mins ago', unread: true },
    { id: 3, text: 'Monthly faculty meeting reminder.', time: '3 hours ago', unread: false },
  ];

  const pendingApprovals = [
    { initials: 'JA', name: 'Dr. Julian Anderson', dept: 'Dept. of Applied Science', purpose: 'Locator Slip', date: 'June 10, 2026', color: '#16A34A' },
    { initials: 'EM', name: 'Elena Martinez', dept: 'Human Resources', purpose: 'Locator Slip', date: 'June 11, 2026', color: '#8B5CF6' },
    { initials: 'WK', name: 'Prof. William Kent', dept: 'Global Relations', purpose: 'Locator Slip', date: 'June 11, 2026', color: '#F59E0B' },
  ];

  return (
    <div className="admin-dash-wrapper">
      <div className="admin-dash-scroll">

        {/* Header */}
        <div className="admin-header">
          <span className="admin-logo-text">EduRoute</span>
          <div className="admin-header-right">
            <div className="admin-bell-wrapper" onClick={() => setView('admin-notifications')}>
              <AdminBellIcon color="var(--text-dark)" />
              <div className="admin-bell-dot" />
            </div>
            <div className="admin-avatar" onClick={() => setView('admin-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Admin" />
            </div>
          </div>
        </div>

        {/* Hero */}
        <div className="admin-hero">
          <h1>Strategic Oversight</h1>
          <p>Reviewing institutional progress for March 2026</p>
        </div>

        {/* Stats Grid */}
        <div className="admin-stats-grid">
          <div className="admin-stat-card">
            <div className="admin-stat-info">
              <span className="admin-stat-label">PENDING REQUESTS</span>
              <span className="admin-stat-number">05</span>
            </div>
            <ClipboardClockIcon color="var(--green)" />
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-info">
              <span className="admin-stat-label">APPROVED TODAY</span>
              <span className="admin-stat-number">12</span>
            </div>
            <CheckCircleAdminIcon color="var(--green)" />
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-info">
              <span className="admin-stat-label">REJECTED REQUESTS</span>
              <span className="admin-stat-number">03</span>
            </div>
            <XCircleIcon color="#EF4444" />
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-info">
              <span className="admin-stat-label">TOTAL FACULTY</span>
              <span className="admin-stat-number">26</span>
            </div>
            <UsersAdminIcon color="var(--green)" />
          </div>
        </div>

        {/* Notifications */}
        <div className="admin-notif-card">
          <div className="admin-notif-header">
            <h2>Notifications</h2>
            <span className="admin-notif-viewall" onClick={() => setView('admin-notifications')}>VIEW ALL</span>
          </div>
          {notifications.map((n, i) => (
            <div key={n.id}>
              <div className="admin-notif-row">
                {n.unread && <div className="admin-notif-dot" />}
                <div className={`admin-notif-content ${!n.unread ? 'no-dot' : ''}`}>
                  <p className="admin-notif-text">{n.text}</p>
                  <span className="admin-notif-time">{n.time}</span>
                </div>
              </div>
              {i < notifications.length - 1 && <div className="admin-notif-divider" />}
            </div>
          ))}
        </div>

        {/* Pending Approvals */}
        <div className="admin-approvals-card">
          <div className="admin-approvals-header">
            <h2>Pending Approvals</h2>
            <button type="button" className="admin-action-queue-btn">Action Queue</button>
          </div>

          <div className="admin-approvals-table">
            <div className="admin-approvals-thead">
              <span>RECIPIENT</span>
              <span>PURPOSE</span>
              <span>DATE SUBMITTED</span>
            </div>
            {pendingApprovals.map((a) => (
              <div key={a.initials} className="admin-approvals-row">
                <div className="admin-approval-recipient">
                  <div className="admin-approval-avatar" style={{ background: a.color }}>
                    {a.initials}
                  </div>
                  <div className="admin-approval-info">
                    <span className="admin-approval-name">{a.name}</span>
                    <span className="admin-approval-dept">{a.dept}</span>
                  </div>
                </div>
                <span className="admin-approval-purpose">{a.purpose}</span>
                <span className="admin-approval-date">{a.date}</span>
              </div>
            ))}
          </div>

          <div className="admin-approvals-viewall" onClick={() => setView('admin-approval-requests')}>
            View All 24 Requests
          </div>
        </div>

      </div>
      <AdminBottomNav active="dashboard" setView={setView} />
    </div>
  );
};

/* ======================================================== */
/* ADMIN NOTIFICATIONS VIEW                                 */
/* ======================================================== */

const NotifSlipIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const NotifPendingIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-gray)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="18" rx="2" />
    <path d="M9 2v2" /><path d="M15 2v2" />
    <circle cx="12" cy="14" r="4" />
    <path d="M12 12v2l1.5 1" />
  </svg>
);

const AdminNotificationsView = ({ setView, profileData }) => {
  const todayNotifications = [
    {
      id: 1,
      type: 'slip',
      title: 'New locator slip request submitted',
      body: 'Mr. Ken Bau submitted a locator slip for an official event at Olongapo City Civic Center.',
      time: '2m ago',
      hasActions: true,
    },
    {
      id: 2,
      type: 'pending',
      title: 'Request pending for approval',
      body: 'The faculty locator Slip for May 23, 2026 requires your final signature before processing.',
      time: '45m ago',
      hasActions: false,
    },
  ];

  const yesterdayNotifications = [
    {
      id: 3,
      type: 'slip',
      title: 'New locator slip request submitted',
      body: 'Mr. Rey Gun submitted a locator slip for an official event at Tech Hub',
      time: '2m ago',
      hasActions: true,
    },
  ];

  const renderCard = (n) => (
    <div key={n.id} className="anotif-card">
      <div className="anotif-card-top">
        <div className={`anotif-icon-circle ${n.type === 'slip' ? 'green' : 'muted'}`}>
          {n.type === 'slip' ? <NotifSlipIcon /> : <NotifPendingIcon />}
        </div>
        <div className="anotif-card-body">
          <div className="anotif-card-title-row">
            <h3>{n.title}</h3>
            <span className="anotif-card-time">{n.time}</span>
          </div>
          <p>{n.body}</p>
        </div>
      </div>
      {n.hasActions && (
        <div className="anotif-card-actions">
          <button type="button" className="anotif-btn-review">REVIEW</button>
          <button type="button" className="anotif-btn-dismiss">DISMISS</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="admin-dash-wrapper">
      <div className="admin-dash-scroll">

        {/* Header */}
        <div className="admin-header">
          <div className="anotif-header-left">
            <div className="anotif-back" onClick={() => setView('admin-dashboard')}>
              <BackArrowIcon color="var(--text-dark)" />
            </div>
            <span className="admin-logo-text">EduRoute</span>
          </div>
          <div className="admin-header-right">
            <div className="admin-bell-wrapper">
              <AdminBellIcon color="var(--text-dark)" />
              <div className="admin-bell-dot" />
            </div>
            <div className="admin-avatar" onClick={() => setView('admin-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Admin" />
            </div>
          </div>
        </div>

        {/* Today Notifications */}
        <div className="anotif-section">
          {todayNotifications.map(renderCard)}
        </div>

        {/* Yesterday Divider */}
        <div className="anotif-day-divider">
          <span>Yesterday</span>
          <div className="anotif-day-line" />
        </div>

        {/* Yesterday Notifications */}
        <div className="anotif-section">
          {yesterdayNotifications.map(renderCard)}
        </div>

      </div>
      <AdminBottomNav active="dashboard" setView={setView} />
    </div>
  );
};

/* ======================================================== */
/* ADMIN APPROVAL REQUESTS VIEW                             */
/* ======================================================== */

const AdminApprovalRequestsView = ({ setView, profileData, setSelectedAdminRequest }) => {
  const requests = [
    {
      id: 1,
      name: 'Dr. Pul Cor',
      role: 'Instructor',
      date: 'April 27',
      destination: 'James Hospital',
      purpose: 'Paternity Leave',
      status: 'pending',
      urgent: true,
      slipId: 'LS-2024-091',
      department: 'Nursing',
      facultyId: '202312290',
      fullPurpose: 'Paternity Leave at James Hospital',
      departure: '08:00 AM',
      estReturn: '12:00 PM',
    },
    {
      id: 2,
      name: 'Mr. Ken Bau',
      role: 'Instructor',
      date: 'April 24',
      destination: 'Olongapo City Civic Center',
      purpose: 'Research Seminar',
      status: 'pending',
      urgent: false,
      slipId: 'LS-2024-089',
      department: 'Computer Science',
      facultyId: '202312291',
      fullPurpose: 'Research Collaboration & Technical Seminar at Olongapo City Civic Center',
      departure: '09:15 AM',
      estReturn: '01:30 PM',
    },
    {
      id: 3,
      name: 'Mr. Rey Gun',
      role: 'Coordinator',
      date: 'May 25',
      destination: 'Tech Hub',
      purpose: 'Industry Visit',
      status: 'pending',
      urgent: false,
      slipId: 'LS-2024-090',
      department: 'Information Technology',
      facultyId: '202312292',
      fullPurpose: 'Industry Visit at Tech Hub',
      departure: '10:00 AM',
      estReturn: '03:00 PM',
    },
  ];

  return (
    <div className="admin-dash-wrapper">
      <div className="admin-dash-scroll">

        {/* Header */}
        <div className="admin-header">
          <div className="anotif-header-left">
            <div className="anotif-back" onClick={() => setView('admin-dashboard')}>
              <BackArrowIcon color="var(--text-dark)" />
            </div>
            <span className="admin-logo-text">EduRoute</span>
          </div>
          <div className="admin-header-right">
            <div className="admin-bell-wrapper" onClick={() => setView('admin-notifications')}>
              <AdminBellIcon color="var(--text-dark)" />
              <div className="admin-bell-dot" />
            </div>
            <div className="admin-avatar" onClick={() => setView('admin-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Admin" />
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="areq-hero">
          <h1>Approval Requests</h1>
          <p>Review and manage pending faculty locator slips.</p>
        </div>

        {/* Stats Grid */}
        <div className="areq-stats-grid">
          <div className="areq-stat-card">
            <span className="areq-stat-label">PENDING</span>
            <span className="areq-stat-number">12</span>
          </div>
          <div className="areq-stat-card">
            <span className="areq-stat-label">ON-SITE FACULTY</span>
            <span className="areq-stat-number">08</span>
          </div>
          <div className="areq-stat-card">
            <span className="areq-stat-label">OFF-SITE FACULTY</span>
            <span className="areq-stat-number">04</span>
          </div>
          <div className="areq-stat-card">
            <span className="areq-stat-label">URGENT</span>
            <span className="areq-stat-number urgent">02</span>
          </div>
        </div>

        {/* Request Cards */}
        <div className="areq-cards">
          {requests.map((r) => (
            <div
              key={r.id}
              className={`areq-card ${r.urgent ? 'border-urgent' : 'border-pending'}`}
            >
              <div className="areq-card-header">
                <div className="areq-card-name-row">
                  <h3>{r.name}</h3>
                  {r.urgent && <span className="areq-urgent-mark">!</span>}
                </div>
                <span className={`areq-badge ${r.urgent ? 'urgent' : 'pending'}`}>
                  {r.status.toUpperCase()}
                </span>
              </div>
              <p className="areq-card-subtitle">{r.role} • {r.date}</p>

              <div className="areq-card-details">
                <div className="areq-detail-col">
                  <span className="areq-detail-label">DESTINATION</span>
                  <span className="areq-detail-value">{r.destination}</span>
                </div>
                <div className="areq-detail-col">
                  <span className="areq-detail-label">PURPOSE</span>
                  <span className="areq-detail-value">{r.purpose}</span>
                </div>
              </div>

              <button type="button" className="areq-view-btn" onClick={() => {
                setSelectedAdminRequest(r);
                setView('admin-approval-detail');
              }}>View Details</button>
            </div>
          ))}
        </div>

      </div>
      <AdminBottomNav active="requests" setView={setView} />
    </div>
  );
};

/* ======================================================== */
/* ADMIN APPROVAL DETAIL VIEW                               */
/* ======================================================== */

const DetailPersonIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const DetailRouteIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="3" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <circle cx="12" cy="19" r="3" />
  </svg>
);

const DetailPinIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-gray)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const DetailDocIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-gray)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const DetailClockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-gray)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const DetailClockReturnIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-gray)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 8 14" />
  </svg>
);

const ApproveCheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#554400" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const RejectXIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

const RemarksIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-dark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

const AdminApprovalDetailView = ({ setView, profileData, request }) => {
  if (!request) {
    return (
      <div className="admin-dash-wrapper">
        <div className="admin-dash-scroll" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>No request selected.</p>
        </div>
      </div>
    );
  }

  const isUrgent = request.urgent;

  return (
    <div className="admin-dash-wrapper">
      <div className="admin-dash-scroll">

        {/* Header */}
        <div className="admin-header">
          <div className="anotif-header-left">
            <div className="anotif-back" onClick={() => setView('admin-approval-requests')}>
              <BackArrowIcon color="var(--text-dark)" />
            </div>
            <span className="admin-logo-text">EduRoute</span>
          </div>
          <div className="admin-header-right">
            <div className="admin-bell-wrapper" onClick={() => setView('admin-notifications')}>
              <AdminBellIcon color="var(--text-dark)" />
              <div className="admin-bell-dot" />
            </div>
            <div className="admin-avatar" onClick={() => setView('admin-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Admin" />
            </div>
          </div>
        </div>

        {/* Banner */}
        <div className="adet-banner">
          <div className="adet-banner-top">
            <span className="adet-banner-label">APPROVAL REQUEST</span>
            <span className={`adet-status-badge ${isUrgent ? 'urgent' : 'pending'}`}>
              <span className="adet-status-dot" />
              {isUrgent ? 'Urgent' : 'Pending'}
            </span>
          </div>
          <div className="adet-banner-title-row">
            <h2>Locator Slip #{request.slipId}</h2>
            {isUrgent && <span className="adet-urgent-mark">!</span>}
          </div>
        </div>

        {/* Faculty Information */}
        <div className="adet-section-title">
          <DetailPersonIcon />
          <span>Faculty Information</span>
        </div>
        <div className="adet-info-card">
          <div className="adet-info-row">
            <span className="adet-info-label">FULL NAME</span>
            <span className="adet-info-value">{request.name}</span>
          </div>
          <div className="adet-info-cols">
            <div className="adet-info-col">
              <span className="adet-info-label">DEPARTMENT</span>
              <span className="adet-info-value">{request.department}</span>
            </div>
            <div className="adet-info-col">
              <span className="adet-info-label">FACULTY ID</span>
              <span className="adet-info-value">{request.facultyId}</span>
            </div>
          </div>
        </div>

        {/* Locator Slip Details */}
        <div className="adet-section-title">
          <DetailRouteIcon />
          <span>Locator Slip Details</span>
        </div>
        <div className="adet-details-section">
          <div className="adet-detail-item">
            <DetailPinIcon />
            <div className="adet-detail-text">
              <span className="adet-detail-label">DESTINATION</span>
              <span className="adet-detail-value">{request.destination}</span>
            </div>
          </div>
          <div className="adet-detail-item">
            <DetailDocIcon />
            <div className="adet-detail-text">
              <span className="adet-detail-label">PURPOSE</span>
              <span className="adet-detail-value">{request.fullPurpose}</span>
            </div>
          </div>
          <div className="adet-time-row">
            <div className="adet-detail-item half">
              <DetailClockIcon />
              <div className="adet-detail-text">
                <span className="adet-detail-label">DEPARTURE</span>
                <span className="adet-detail-value">{request.departure}</span>
              </div>
            </div>
            <div className="adet-detail-item half">
              <DetailClockReturnIcon />
              <div className="adet-detail-text">
                <span className="adet-detail-label">EST. RETURN</span>
                <span className="adet-detail-value">{request.estReturn}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="adet-actions">
          <button type="button" className="adet-approve-btn">
            <ApproveCheckIcon />
            Approve Request
          </button>
          <div className="adet-secondary-actions">
            <button type="button" className="adet-reject-btn">
              <RejectXIcon />
              Reject
            </button>
            <button type="button" className="adet-remarks-btn">
              <RemarksIcon />
              Remarks
            </button>
          </div>
        </div>

      </div>
      <AdminBottomNav active="requests" setView={setView} />
    </div>
  );
};

/* ======================================================== */
/* ADMIN REGISTRY VIEW                                      */
/* ======================================================== */

const RegistryEyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const RegistryDownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const ReportPrintIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9V3h12v6" />
    <path d="M6 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1" />
    <rect x="6" y="14" width="12" height="7" rx="1" ry="1" />
    <circle cx="18" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const RegistryModalCloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const RegistryModalVerifiedIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const RegistryModalIdIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-gray)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <line x1="15" y1="10" x2="19" y2="10" />
    <line x1="15" y1="14" x2="19" y2="14" />
    <line x1="5" y1="14" x2="13" y2="14" />
  </svg>
);

const RegistryModalDoneIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#554400" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="16 10 11 15 8 12" />
  </svg>
);

const RegistryDetailsModal = ({ item, onClose }) => {
  if (!item) return null;

  const status = item.statusLabel || item.status || 'pending';
  const statusTitle = status === 'verified'
    ? 'VERIFIED REQUEST'
    : status === 'rejected'
      ? 'REJECTED REQUEST'
      : status === 'cancelled'
        ? 'CANCELLED REQUEST'
        : 'PENDING REQUEST';
  const splitDateTime = (formattedValue, rawValue) => {
    if (formattedValue && formattedValue.includes(' ')) {
      const parts = formattedValue.split(' ');
      return {
        date: parts.slice(0, 1).join(' ') || 'Not provided',
        time: parts.slice(1).join(' ') || '--:--'
      };
    }

    if (rawValue) {
      const parsedDate = new Date(rawValue);
      return {
        date: parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        time: parsedDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      };
    }

    return {
      date: 'Not provided',
      time: '--:--'
    };
  };

  const departureSchedule = splitDateTime(item.formattedDepartureDatetime, item.departureDatetime);
  const returnSchedule = splitDateTime(item.formattedExpectedReturnDatetime, item.expectedReturnDatetime);
  const signatureName = item.digitalSignature?.name || item.assignedDean?.name || 'Assigned Dean';
  const signatureRole = item.digitalSignature?.role || item.assignedDean?.role || 'Dean';
  const signatureTimestamp = item.digitalSignature?.signedAt
    ? `${new Date(item.digitalSignature.signedAt).toLocaleString('sv-SE', { hour12: false }).replace(' ', 'T')} UTC+8`
    : '';

  return (
    <div className="rmodal-overlay" onClick={onClose}>
      <div className="rmodal-container" onClick={e => e.stopPropagation()}>
        {/* Header Section */}
        <div className="rmodal-header">
          <button className="rmodal-close-btn" onClick={onClose}>
            <RegistryModalCloseIcon />
          </button>

          <div className="rmodal-header-content">
            <div className={`rmodal-status-pill ${status}`}>
              {status === 'verified' && <RegistryModalVerifiedIcon />}
              <span>{statusTitle}</span>
            </div>
            <h2>Request Details</h2>
            <p className="rmodal-id">ID: {item.referenceNumber || 'LS-000-000'}</p>
          </div>
        </div>

        <div className="rmodal-divider" />

        {/* Profile Section */}
        <div className="rmodal-profile">
          <div className="rmodal-avatar">
            <img src={item.profileImageUrl || DEFAULT_PROFILE_IMAGE} alt={item.facultyName || item.name} />
          </div>
          <h3>{item.facultyName || item.name}</h3>
          <p className="rmodal-department">{item.collegeName || 'College Department'}</p>
          <div className="rmodal-faculty-id">
            <RegistryModalIdIcon />
            <span>ID {item.employeeId || 'Not assigned'}</span>
          </div>
        </div>

        <div className="rmodal-divider subtle" />

        {/* Details Section */}
        <div className="rmodal-details">
          <div className="rmodal-detail-item">
            <DetailPinIcon />
            <div className="rmodal-detail-text">
              <span className="rmodal-detail-label">DESTINATION</span>
              <span className="rmodal-detail-value">{item.destination}</span>
            </div>
          </div>
          <div className="rmodal-detail-item">
            <DetailDocIcon />
            <div className="rmodal-detail-text">
              <span className="rmodal-detail-label">PURPOSE</span>
              <span className="rmodal-detail-value">{item.purpose}</span>
            </div>
          </div>
          {status === 'cancelled' && item.cancellationReason && (
            <div className="rmodal-detail-item">
              <DetailDocIcon />
              <div className="rmodal-detail-text">
                <span className="rmodal-detail-label">CANCELLATION REASON</span>
                <span className="rmodal-detail-value">{getCancellationReasonLabel(item.cancellationReason)}</span>
              </div>
            </div>
          )}
          {status === 'rejected' && (item.rejectionReason || item.additionalRemarks) && (
            <div className="rmodal-detail-item">
              <DetailDocIcon />
              <div className="rmodal-detail-text">
                <span className="rmodal-detail-label">REJECTION REASON</span>
                <span className="rmodal-detail-value">{item.rejectionReason || item.additionalRemarks}</span>
              </div>
            </div>
          )}
        </div>

        {/* Travel Schedule */}
        <div className="rmodal-schedule-wrap">
          <div className="rmodal-schedule">
            <span className="rmodal-schedule-label">TRAVEL SCHEDULE</span>
            <div className="rmodal-schedule-cols">
              <div className="rmodal-schedule-col">
                <span className="rmodal-schedule-type">DEPARTURE</span>
                <span className="rmodal-schedule-date">{departureSchedule.date}</span>
                <span className="rmodal-schedule-time">{departureSchedule.time}</span>
              </div>
              <div className="rmodal-schedule-col right">
                <span className="rmodal-schedule-type">RETURN</span>
                <span className="rmodal-schedule-date">{returnSchedule.date}</span>
                <span className="rmodal-schedule-time">{returnSchedule.time}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rmodal-signature">
          <div className="rmodal-sig-divider" />
          <span className="rmodal-sig-label">AUTHORIZED DIGITAL SIGNATURE</span>
          <h4 className="rmodal-sig-name">{signatureName}</h4>
          <p className="rmodal-sig-role">{signatureRole}</p>
          {item.digitalSignature ? (
            <>
              <div className="rmodal-sig-stamp">DIGITALLY SIGNED</div>
              <p className="rmodal-sig-timestamp">{signatureTimestamp}</p>
            </>
          ) : (
            <p className="rmodal-sig-pending">Signature will appear after the locator slip is approved.</p>
          )}
        </div>

        {/* Actions */}
        <div className="rmodal-actions">
          <button className="rmodal-done-btn" onClick={onClose}>
            <RegistryModalDoneIcon />
            DONE VIEWING
          </button>
          <button className="rmodal-dl-btn">
            <RegistryDownloadIcon />
            DOWNLOAD PDF
          </button>
        </div>

      </div>
    </div>
  );
};

const AdminRegistryView = ({ setView, profileData }) => {
  const registryItems = [
    {
      id: 1,
      name: 'Mr. Ken Bau',
      role: 'Instructor',
      status: 'verified',
      dateLabel: 'DATE APPROVED',
      date: 'April 24, 2026',
      destination: 'Olongapo City Civic Center'
    },
    {
      id: 2,
      name: 'Prof. Marcus Thorne',
      role: 'STEM Research Division',
      status: 'rejected',
      dateLabel: 'DATE REJECTED', // Fixed condition
      date: 'Oct 22, 2023',
      destination: 'MIT Tech Symposium'
    },
    {
      id: 3,
      name: 'Dr. Sarah Jenkins',
      role: 'Medical Sciences',
      status: 'verified',
      dateLabel: 'DATE APPROVED',
      date: 'Oct 19, 2023',
      destination: 'Kyoto Health Forum'
    }
  ];

  const [selectedItem, setSelectedItem] = useState(null);

  return (
    <div className="admin-dash-wrapper">
      <div className="admin-dash-scroll">

        {/* Header */}
        <div className="admin-header">
          <div className="anotif-header-left">
            <div className="anotif-back" onClick={() => setView('admin-dashboard')}>
              <BackArrowIcon color="var(--text-dark)" />
            </div>
            <span className="admin-logo-text">EduRoute</span>
          </div>
          <div className="admin-header-right">
            <div className="admin-bell-wrapper" onClick={() => setView('admin-notifications')}>
              <AdminBellIcon color="var(--text-dark)" />
              <div className="admin-bell-dot" />
            </div>
            <div className="admin-avatar" onClick={() => setView('admin-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Admin" />
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="areg-hero">
          <h1>Requests</h1>
          <p>Strategic Oversight Registry</p>
        </div>

        {/* Stats */}
        <div className="areg-stats-grid">
          <div className="areg-stat-card">
            <span className="areg-stat-label">MONTHLY TOTAL</span>
            <span className="areg-stat-number">142</span>
          </div>
          <div className="areg-stat-card">
            <span className="areg-stat-label">REGISTRY SIZE</span>
            <span className="areg-stat-number">412</span>
          </div>
        </div>

        {/* Cards */}
        <div className="areg-cards">
          {registryItems.map(item => (
            <div key={item.id} className="areg-card">
              <div className="areg-card-header">
                <div className="areg-card-name-col">
                  <h3>{item.name}</h3>
                  <span className="areg-card-role">{item.role}</span>
                </div>
                <div className={`areg-badge ${item.status}`}>
                  {item.status.toUpperCase()}
                </div>
              </div>

              <div className="areg-card-details">
                <div className="areg-detail-col">
                  <span className="areg-detail-label">{item.dateLabel}</span>
                  <span className="areg-detail-value">{item.date}</span>
                </div>
                <div className="areg-detail-col">
                  <span className="areg-detail-label">DESTINATION</span>
                  <span className="areg-detail-value">{item.destination}</span>
                </div>
              </div>

              <div className="areg-card-actions">
                <button type="button" className="areg-view-btn" onClick={() => setSelectedItem(item)}>
                  <RegistryEyeIcon />
                  VIEW DETAILS
                </button>
                <button type="button" className="areg-download-btn">
                  <RegistryDownloadIcon />
                </button>
              </div>
            </div>
          ))}
        </div>

      </div>
      <AdminBottomNav active="registry" setView={setView} />

      {selectedItem && (
        <RegistryDetailsModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
};

/* ======================================================== */
/* ADMIN FACULTY VIEW                                       */
/* ======================================================== */

const FacultySearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const FacultyFilterIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="8" y1="12" x2="16" y2="12" />
    <line x1="10" y1="18" x2="14" y2="18" />
  </svg>
);

const FacultyDocIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const FacultyCheckCircleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="none">
    <circle cx="12" cy="12" r="10" fill="#E8F5E9" />
    <polyline points="8 12 11 15 16 9" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FacultyCrossCircleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="none">
    <circle cx="12" cy="12" r="10" fill="#FEE2E2" />
    <line x1="8" y1="8" x2="16" y2="16" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
    <line x1="16" y1="8" x2="8" y2="16" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const FacultyWaitCircleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="none">
    <circle cx="12" cy="12" r="10" fill="#FEF3C7" />
    <circle cx="8" cy="12" r="1.5" fill="#D97706" />
    <circle cx="12" cy="12" r="1.5" fill="#D97706" />
    <circle cx="16" cy="12" r="1.5" fill="#D97706" />
  </svg>
);

const FacultyChevronRightIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const FacultyIdBadgeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" />
    <circle cx="12" cy="8" r="1.5" />
    <line x1="10" y1="12" x2="14" y2="12" />
  </svg>
);

const FacultyCopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const FacultyProfileModal = ({ profile, onClose }) => {
  if (!profile) return null;

  return (
    <div className="afac-modal-overlay" onClick={onClose}>
      <div className="afac-modal-container" onClick={e => e.stopPropagation()}>
        <div className="afac-modal-hero" />

        <div className="afac-modal-content">
          <div className="afac-modal-avatar">
            <img src={profile.image || DEFAULT_PROFILE_IMAGE} alt={profile.name} />
          </div>

          <h2 className="afac-modal-name">{profile.name}</h2>
          <p className="afac-modal-role">{profile.role}</p>

          <div className="afac-modal-badges">
            <div className="afac-badge-box">
              <span className="afac-badge-label">STATUS</span>
              <div className="afac-badge-value">
                <span className="afac-badge-dot"></span>
                ON-SITE
              </div>
            </div>
            <div className="afac-badge-box">
              <span className="afac-badge-label">TENURE</span>
              <div className="afac-badge-value highlight">{profile.tenure}</div>
            </div>
          </div>

          <div className="afac-modal-id-box">
            <div className="afac-id-left">
              <FacultyIdBadgeIcon />
              <div className="afac-id-texts">
                <span className="afac-id-label">FACULTY ID</span>
                <span className="afac-id-number">{profile.idNumber || '202312291'}</span>
              </div>
            </div>
            <button className="afac-id-copy">
              <FacultyCopyIcon />
            </button>
          </div>

          <button className="afac-modal-close" onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};

const AdminFacultyView = ({ setView, profileData }) => {
  const facultyMembers = [
    {
      id: 1,
      name: 'Mr. Ken Bau',
      role: 'Instructor',
      tenure: 'FULL-TIME',
      totalRequests: 18,
      approvalRate: '92%',
      recentStatus: ['verified', 'waiting', '+12'],
      borderColor: 'green'
    },
    {
      id: 2,
      name: 'Mr. Rey Gun',
      role: 'Instructor',
      tenure: 'PART-TIME',
      totalRequests: '05',
      approvalRate: '60%',
      recentStatus: ['rejected', 'verified'],
      borderColor: 'red'
    },
    {
      id: 3,
      name: 'Mr. Lou Del',
      role: 'Instructor',
      tenure: 'FULL-TIME',
      totalRequests: 12,
      approvalRate: '100%',
      recentStatus: ['verified', 'verified', 'verified'],
      borderColor: 'green'
    }
  ];

  const [selectedProfile, setSelectedProfile] = useState(null);

  return (
    <div className="admin-dash-wrapper" style={{ background: '#F2F6ED' }}>
      <div className="admin-dash-scroll">

        {/* Header */}
        <div className="admin-header">
          <div className="anotif-header-left">
            <div className="anotif-back" onClick={() => setView('admin-dashboard')}>
              <BackArrowIcon color="var(--green)" />
            </div>
            <span className="admin-logo-text">EduRoute</span>
          </div>
          <div className="admin-header-right">
            <div className="admin-bell-wrapper" onClick={() => setView('admin-notifications')}>
              <AdminBellIcon color="var(--text-dark)" />
              <div className="admin-bell-dot" />
            </div>
            <div className="admin-avatar" style={{ border: '3px solid var(--yellow)' }} onClick={() => setView('admin-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Admin" />
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="afac-stats-grid">
          <div className="afac-stat-card">
            <span className="afac-stat-label">TOTAL FACULTY</span>
            <span className="afac-stat-number">24</span>
          </div>
          <div className="afac-stat-card">
            <span className="afac-stat-label">ACTIVE REQUESTS</span>
            <span className="afac-stat-number">12</span>
          </div>
        </div>

        {/* Search */}
        <div className="afac-search-bar">
          <div className="afac-search-input-wrapper">
            <FacultySearchIcon />
            <input type="text" placeholder="Search faculty members..." className="afac-search-input" />
          </div>
          <button className="afac-filter-btn">
            <FacultyFilterIcon />
          </button>
        </div>

        {/* Title */}
        <h2 className="afac-title">Faculty Overview</h2>

        {/* Cards */}
        <div className="afac-cards">
          {facultyMembers.map(member => (
            <div key={member.id} className={`afac-card border-${member.borderColor}`}>
              <div className="afac-card-header">
                <div className="afac-card-profile">
                  <div className="afac-card-avatar-wrapper">
                    <img src={DEFAULT_PROFILE_IMAGE} alt={member.name} />
                  </div>
                  <div className="afac-card-info">
                    <h3>{member.name}</h3>
                    <p>{member.role}</p>
                  </div>
                </div>
                <div className={`afac-tenure ${member.tenure === 'PART-TIME' ? 'part-time' : ''}`}>
                  {member.tenure}
                </div>
              </div>

              <div className="afac-card-stats">
                <div className="afac-stat">
                  <span className="afac-stat-title">TOTAL REQUESTS</span>
                  <div className="afac-stat-val">
                    <FacultyDocIcon />
                    {member.totalRequests}
                  </div>
                </div>
                <div className="afac-stat">
                  <span className="afac-stat-title">APPROVAL RATE</span>
                  <div className="afac-stat-val green">
                    <FacultyCheckCircleIcon />
                    {member.approvalRate}
                  </div>
                </div>
              </div>

              <div className="afac-card-footer">
                <div className="afac-recent-indicators">
                  {member.recentStatus.map((status, idx) => {
                    if (status === 'verified') return <FacultyCheckCircleIcon key={idx} />;
                    if (status === 'rejected') return <FacultyCrossCircleIcon key={idx} />;
                    if (status === 'waiting') return <FacultyWaitCircleIcon key={idx} />;
                    if (status.startsWith('+')) return <div key={idx} className="afac-more-indicator">{status}</div>;
                    return null;
                  })}
                </div>
                <button className="afac-view-profile" onClick={() => setSelectedProfile(member)}>
                  View Profile <FacultyChevronRightIcon />
                </button>
              </div>
            </div>
          ))}
        </div>

      </div>
      <AdminBottomNav active="faculty" setView={setView} />

      {/* Modal */}
      <FacultyProfileModal profile={selectedProfile} onClose={() => setSelectedProfile(null)} />
    </div>
  );
};

const DeanFacultyView = ({ setView, profileData }) => {
  const [search, setSearch] = useState('');
  const [facultyData, setFacultyData] = useState({
    summary: { totalFaculty: 0, activeRequests: 0 },
    items: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProfile, setSelectedProfile] = useState(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getDeanFacultyOverview({ search });
        setFacultyData(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [search]);

  const renderStatusIndicator = (status, idx) => {
    if (status === 'approved') return <FacultyCheckCircleIcon key={`${status}-${idx}`} />;
    if (status === 'rejected') return <FacultyCrossCircleIcon key={`${status}-${idx}`} />;
    if (status === 'pending') return <FacultyWaitCircleIcon key={`${status}-${idx}`} />;
    return null;
  };

  return (
    <div className="admin-dash-wrapper dean-faculty-wrapper">
      <div className="admin-dash-scroll">
        <div className="admin-header">
          <div className="anotif-header-left">
            <div className="anotif-back" onClick={() => setView('dean-dashboard')}>
              <BackArrowIcon color="var(--green)" />
            </div>
            <span className="admin-logo-text">EduRoute</span>
          </div>
          <div className="admin-header-right">
            <div className="admin-bell-wrapper" onClick={() => setView('dean-notifications')}>
              <AdminBellIcon color="var(--text-dark)" />
              <div className="admin-bell-dot" />
            </div>
            <div className="admin-avatar" style={{ border: '3px solid var(--yellow)' }} onClick={() => setView('dean-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Dean" />
            </div>
          </div>
        </div>

        <div className="afac-stats-grid dean-faculty-stats">
          <div className="afac-stat-card">
            <span className="afac-stat-label">TOTAL FACULTY</span>
            <span className="afac-stat-number">{loading ? '...' : String(facultyData.summary?.totalFaculty || 0).padStart(2, '0')}</span>
          </div>
          <div className="afac-stat-card">
            <span className="afac-stat-label">ACTIVE REQUESTS</span>
            <span className="afac-stat-number">{loading ? '...' : String(facultyData.summary?.activeRequests || 0).padStart(2, '0')}</span>
          </div>
        </div>

        <div className="afac-search-bar">
          <div className="afac-search-input-wrapper">
            <FacultySearchIcon />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search faculty members..."
              className="afac-search-input"
            />
          </div>
          <button className="afac-filter-btn" type="button" aria-label="Filter faculty">
            <FacultyFilterIcon />
          </button>
        </div>

        <h2 className="afac-title">Faculty Overview</h2>
        {error && <p className="dean-error-text dean-faculty-message">{error}</p>}
        {loading && <p className="dean-empty-text dean-faculty-message">Loading registered faculty...</p>}
        {!loading && facultyData.items.length === 0 && (
          <p className="dean-empty-text dean-faculty-message">No registered faculty found for your college.</p>
        )}

        <div className="afac-cards dean-faculty-cards">
          {!loading && facultyData.items.map((member) => (
            <div key={member.id} className={`afac-card border-${member.borderColor}`}>
              <div className="afac-card-header">
                <div className="afac-card-profile">
                  <div className="afac-card-avatar-wrapper">
                    <img src={member.profileImageUrl || DEFAULT_PROFILE_IMAGE} alt={member.fullName} />
                  </div>
                  <div className="afac-card-info">
                    <h3>{member.fullName}</h3>
                    <p>{member.position || 'Instructor'}</p>
                  </div>
                </div>
                <div className={`afac-tenure ${member.employmentType === 'part_time' ? 'part-time' : ''}`}>
                  {member.employmentLabel}
                </div>
              </div>

              <div className="afac-card-stats">
                <div className="afac-stat">
                  <span className="afac-stat-title">TOTAL REQUESTS</span>
                  <div className="afac-stat-val">
                    <FacultyDocIcon />
                    {String(member.totalRequests || 0).padStart(2, '0')}
                  </div>
                </div>
                <div className="afac-stat">
                  <span className="afac-stat-title">APPROVAL RATE</span>
                  <div className="afac-stat-val green">
                    <FacultyCheckCircleIcon />
                    {member.approvalRateLabel}
                  </div>
                </div>
              </div>

              <div className="afac-card-footer">
                <div className="afac-recent-indicators">
                  {member.recentStatuses.map(renderStatusIndicator)}
                  {member.remainingStatusCount > 0 && (
                    <div className="afac-more-indicator">+{member.remainingStatusCount}</div>
                  )}
                </div>
                <button
                  className="afac-view-profile"
                  type="button"
                  onClick={() => setSelectedProfile({
                    name: member.fullName,
                    role: member.position || 'Instructor',
                    tenure: member.employmentLabel,
                    idNumber: member.employeeId,
                    image: member.profileImageUrl || DEFAULT_PROFILE_IMAGE,
                  })}
                >
                  View Profile <FacultyChevronRightIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <DeanBottomNav active="faculty" setView={setView} onOpenRequests={() => setView('dean-dashboard')} />
      <FacultyProfileModal profile={selectedProfile} onClose={() => setSelectedProfile(null)} />
    </div>
  );
};

/* ======================================================== */
/* ADMIN PROFILE VIEW                                       */
/* ======================================================== */

const AdminProfileEditIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const AdminProfilePasswordIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2v6h-6" />
    <path d="M21 13a9 9 0 1 1-3-7.7L21 8" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const AdminProfileLogoutIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const AdminProfileIdIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" />
    <circle cx="12" cy="8" r="1.5" />
    <line x1="10" y1="12" x2="14" y2="12" />
  </svg>
);

const AdminProfileChevronIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const getDeanRoleLabel = (accountRole) =>
  accountRole === 'assistant_dean' ? 'Assistant Dean' : 'Dean';

const getDeanBadgeLabel = (department = '', accountRole = '') => {
  const acronym = department
    .replace(/^College of\s+/i, '')
    .split(/\s+|,/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase())
    .join('')
    .slice(0, 4) || 'DEAN';

  return `${acronym} ${accountRole === 'assistant_dean' ? 'ASST' : 'DEAN'}`;
};

const DeanProfileView = ({ setView, profileData, onLogout }) => {
  const roleLabel = getDeanRoleLabel(profileData?.accountRole);
  const department = profileData?.department || 'College of Computer Studies';

  return (
    <div className="admin-dash-wrapper dean-profile-wrapper">
      <div className="admin-dash-scroll">
        <div className="admin-header dean-profile-header">
          <div className="anotif-header-left">
            <div className="anotif-back" onClick={() => setView('dean-dashboard')}>
              <BackArrowIcon color="var(--green)" />
            </div>
            <span className="admin-logo-text">EduRoute</span>
          </div>
          <div className="admin-header-right">
            <div className="admin-bell-wrapper" onClick={() => setView('dean-notifications')}>
              <AdminBellIcon color="var(--text-dark)" />
              <div className="admin-bell-dot" />
            </div>
            <div className="admin-avatar dean-profile-top-avatar">
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Dean profile" />
            </div>
          </div>
        </div>

        <div className="aprof-container dean-profile-container">
          <div className="aprof-hero-card dean-profile-hero-card">
            <div className="aprof-hero-bg-accent" />
            <div className="aprof-hero-content">
              <div className="aprof-avatar-wrapper dean-profile-avatar-wrapper">
                <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt={profileData?.fullName || 'Dean'} />
                <div className="aprof-avatar-badge dean-profile-badge">
                  {getDeanBadgeLabel(department, profileData?.accountRole)}
                </div>
              </div>
              <h2 className="aprof-name dean-profile-name">{profileData?.fullName || 'Dean User'}</h2>
              <p className="aprof-role dean-profile-role">{roleLabel} of {department}</p>
              <div className="aprof-id-pill dean-profile-id-pill">
                <AdminProfileIdIcon />
                <span>ID: {profileData?.employeeId || 'Not assigned'}</span>
              </div>
            </div>
          </div>

          <div className="aprof-section dean-profile-section">
            <h3 className="aprof-section-title">ACCOUNT ADMINISTRATION</h3>

            <div className="aprof-menu">
              <button type="button" className="aprof-menu-item dean-profile-menu-item" onClick={() => setView('dean-edit-profile')}>
                <div className="aprof-menu-icon-box">
                  <AdminProfileEditIcon />
                </div>
                <span className="aprof-menu-text">Edit Profile</span>
                <AdminProfileChevronIcon />
              </button>

              <button type="button" className="aprof-menu-item dean-profile-menu-item" onClick={() => setView('dean-change-password')}>
                <div className="aprof-menu-icon-box">
                  <AdminProfilePasswordIcon />
                </div>
                <span className="aprof-menu-text">Change Password</span>
                <AdminProfileChevronIcon />
              </button>

              <button type="button" className="aprof-menu-item dean-profile-menu-item" onClick={() => setView('dean-privacy-security')}>
                <div className="aprof-menu-icon-box">
                  <PrivacyIcon color="var(--green)" />
                </div>
                <span className="aprof-menu-text">Privacy &amp; Security</span>
                <AdminProfileChevronIcon />
              </button>
            </div>

            <button className="aprof-logout-btn dean-profile-logout-btn" onClick={onLogout}>
              <AdminProfileLogoutIcon />
              LOGOUT SESSION
            </button>
          </div>
        </div>
      </div>
      <DeanBottomNav setView={setView} onOpenRequests={() => setView('dean-dashboard')} />
    </div>
  );
};

// --------------------------------------------------------
// CSSU DASHBOARD COMPONENTS
// --------------------------------------------------------

const CssuExitDoorIcon = ({ color = "currentColor", size = "56" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8" />
    <path d="M10 12h11" />
    <path d="m18 9 3 3-3 3" />
  </svg>
);

const CssuTrendingUpIcon = ({ color = "currentColor", size = "16" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

const CssuRosetteCheckIcon = ({ color = "currentColor", size = "20" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l3.09 3.09L19.46 6.54l-1.45 4.36L22 14l-2.18 3.82-4.36-1.45L12 22l-3.46-5.63-4.36 1.45L2 14l3.91-3.09L4.46 6.54l4.37-1.45L12 2z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const CssuWarningTriangleIcon = ({ color = "#C81E1E", size = "20" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const CssuChartIcon = ({ color = "currentColor", size = "16" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" />
    <rect x="7" y="10" width="4" height="7" rx="1" />
    <rect x="15" y="5" width="4" height="12" rx="1" />
  </svg>
);

const CssuWarningCircleIcon = ({ color = "#C81E1E", size = "24" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const CssuMapNavIcon = ({ color = "currentColor" }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
    <line x1="9" y1="3" x2="9" y2="18" />
    <line x1="15" y1="6" x2="15" y2="21" />
  </svg>
);

const CssuIncidentsNavIcon = ({ color = "currentColor" }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="14" x2="16" y2="14" />
    <line x1="8" y1="18" x2="12" y2="18" />
  </svg>
);

const CssuScanNavIcon = ({ color = "currentColor" }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7V5a2 2 0 0 1 2-2h2" />
    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <rect x="7" y="7" width="10" height="10" />
  </svg>
);

const CssuReportsNavIcon = ({ color = "currentColor" }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 20V10" />
    <path d="M12 20V4" />
    <path d="M6 20v-6" />
    <path d="M3 20h18" />
  </svg>
);

const PlayTriangleIcon = ({ color = "#111827" }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="m10 8 6 4-6 4z" />
  </svg>
);

const CSSUBottomNav = ({ active = 'dashboard', setView }) => (
  <div className="admin-bottom-nav cssu-bottom-nav">
    <div className={`admin-nav-item ${active === 'dashboard' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('cssu-dashboard')}>
      <DashboardNavIcon color={active === 'dashboard' ? 'var(--green)' : '#9CA3AF'} />
      <span>DASHBOARD</span>
    </div>
    <div className={`admin-nav-item ${active === 'map' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('cssu-map')}>
      <CssuMapNavIcon color={active === 'map' ? 'var(--green)' : '#9CA3AF'} />
      <span>MAP</span>
    </div>
    <div className={`admin-nav-item ${active === 'incidents' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('cssu-incidents')}>
      <CssuIncidentsNavIcon color={active === 'incidents' ? 'var(--green)' : '#9CA3AF'} />
      <span>INCIDENTS</span>
    </div>
    <div className={`admin-nav-item ${active === 'scan' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('cssu-scan')}>
      <CssuScanNavIcon color={active === 'scan' ? 'var(--green)' : '#9CA3AF'} />
      <span>SCAN</span>
    </div>
    <div className={`admin-nav-item ${active === 'reports' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('cssu-reports')}>
      <CssuReportsNavIcon color={active === 'reports' ? 'var(--green)' : '#9CA3AF'} />
      <span>REPORTS</span>
    </div>
  </div>
);

const getDesktopWorkspaceViewport = () => (typeof window !== 'undefined' ? window.innerWidth >= 768 : true);

const useDesktopWorkspaceViewport = () => {
  const [isDesktopViewport, setIsDesktopViewport] = useState(getDesktopWorkspaceViewport);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktopViewport(window.innerWidth >= 768);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isDesktopViewport;
};

const CssuWorkspaceShell = ({ activeKey = 'dashboard', setView, profileData, onLogout, children }) => {
  const sidebarItems = [
    { key: 'dashboard', label: 'Dashboard', icon: DashboardNavIcon, target: 'cssu-dashboard' },
    { key: 'scan', label: 'Exit Clearance', icon: CssuScanNavIcon, target: 'cssu-scan' },
    { key: 'map', label: 'Live Tracking', icon: CssuMapNavIcon, target: 'cssu-map' },
    { key: 'incidents', label: 'Incidents', icon: CssuIncidentsNavIcon, target: 'cssu-incidents' },
    { key: 'reports', label: 'Reports', icon: CssuReportsNavIcon, target: 'cssu-reports' },
  ];

  return (
    <div className="cssu-workspace">
      <aside className="cssu-sidebar">
        <div className="cssu-sidebar-top">
          <div className="cssu-brand-lockup">
            <div className="cssu-brand-badge">
              <TogaLogoIcon size={24} />
            </div>
            <div className="cssu-brand-text">
              <strong>EduRoute</strong>
              <span>CSSU ADMIN</span>
            </div>
          </div>

          <nav className="cssu-sidebar-nav">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.key === activeKey;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`cssu-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => item.target && setView(item.target)}
                >
                  <Icon color={isActive ? 'var(--green)' : '#4B5563'} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="cssu-sidebar-bottom">
          <button type="button" className="cssu-logout-btn" onClick={onLogout}>Log Out</button>
          <button type="button" className="cssu-support-link">
            <HeadsetIcon />
            <span>Support</span>
          </button>
        </div>
      </aside>

      <main className="cssu-main">
        <header className="cssu-topbar">
          <span className="cssu-topbar-logo">EduRoute</span>
          <div className="cssu-topbar-right">
            <div className="admin-bell-wrapper hrmu-bell-wrapper" onClick={() => setView('cssu-notifications')}>
              <AdminBellIcon color="var(--green)" />
              <div className="admin-bell-dot" />
            </div>
            <button type="button" className="cssu-topbar-icon">
              <QuestionCircleIcon color="var(--green)" />
            </button>
            <div className="cssu-manager-copy">
              <strong>{profileData?.fullName || 'Admin User'}</strong>
              <span>CSSU Admnistrator</span>
            </div>
            <div className="admin-avatar" onClick={() => setView('admin-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="CSSU Admin" />
            </div>
          </div>
        </header>

        <div className="cssu-main-scroll">
          {children}
        </div>
      </main>
    </div>
  );
};

const CSSUDesktopPage = ({ activeKey, title, subtitle, setView, profileData, onLogout, children, hideHeader = false }) => (
  <CssuWorkspaceShell activeKey={activeKey} setView={setView} profileData={profileData} onLogout={onLogout}>
    <section className="cssu-desktop-page">
      {!hideHeader && (
        <div className="cssu-desktop-page-header">
          <div>
            <span className="cssu-desktop-kicker">Campus Operations</span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </div>
      )}
      {children}
    </section>
  </CssuWorkspaceShell>
);

const CSSUDesktopPlaceholderView = ({ activeKey, title, subtitle, setView, profileData, onLogout }) => (
  <CSSUDesktopPage
    activeKey={activeKey}
    title={title}
    subtitle={subtitle}
    setView={setView}
    profileData={profileData}
    onLogout={onLogout}
  >
    <div className="cssu-desktop-placeholder">
      <div className="cssu-desktop-placeholder-icon">
        {activeKey === 'scan' && <CssuScanNavIcon color="var(--green)" />}
        {activeKey === 'map' && <CssuMapNavIcon color="var(--green)" />}
        {activeKey === 'incidents' && <CssuIncidentsNavIcon color="var(--green)" />}
        {activeKey === 'reports' && <CssuReportsNavIcon color="var(--green)" />}
      </div>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  </CSSUDesktopPage>
);

const CSSUDashboardDesktopViewLegacy = ({ setView, profileData, onLogout }) => (
  <CSSUDesktopPage
    activeKey="dashboard"
    title="CSSU Security Command"
    subtitle="Real-time Faculty Exit & Locator Monitoring"
    setView={setView}
    profileData={profileData}
    onLogout={onLogout}
  >
    <div className="cssu-desktop-actions">
      <div className="cssu-live-pill">
        <span className="cssu-live-dot" />
        <span>LIVE FEED ACTIVE</span>
      </div>
      <button type="button" className="cssu-summary-btn">Generate Summary</button>
    </div>

    <div className="cssu-desktop-stats">
      <article className="cssu-desktop-hero-card">
        <span className="cssu-desktop-card-label">Total Faculty Exiting</span>
        <div className="cssu-desktop-hero-value">142</div>
        <div className="cssu-desktop-trend-chip">
          <CssuTrendingUpIcon color="white" />
          <span>12% from yesterday</span>
        </div>
        <div className="cssu-desktop-hero-mark">
          <CssuExitDoorIcon color="rgba(255,255,255,0.12)" size="96" />
        </div>
      </article>

      <article className="cssu-desktop-mini-card">
        <div className="cssu-desktop-mini-icon ok">
          <CssuRosetteCheckIcon color="var(--green)" />
        </div>
        <span className="cssu-desktop-mini-label">Approved Locator Slips</span>
        <strong>128</strong>
        <small>90.1% success rate</small>
      </article>

      <article className="cssu-desktop-mini-card flagged">
        <div className="cssu-desktop-mini-icon warn">
          <CssuWarningTriangleIcon />
        </div>
        <span className="cssu-desktop-mini-label">Denied / No Slip Cases</span>
        <strong>14</strong>
        <small>Requires intervention</small>
        <button type="button" className="cssu-desktop-inline-btn">Review</button>
      </article>
    </div>

    <div className="cssu-desktop-content-grid">
      <section className="cssu-desktop-log-card">
        <div className="cssu-desktop-log-headline">
          <h2>Live Exit Monitoring</h2>
          <div className="cssu-desktop-toggle-group">
            <button type="button" className="active">Main Gate</button>
            <button type="button">BackGate</button>
          </div>
        </div>

        <div className="cssu-desktop-log-table">
          <div className="cssu-desktop-log-row head">
            <span>Faculty Member</span>
            <span>ID Number</span>
            <span>Status</span>
            <span>Time</span>
            <span>Action</span>
          </div>

          <div className="cssu-desktop-log-row">
            <div className="cssu-desktop-person">
              <img src={DEFAULT_PROFILE_IMAGE} alt="Faculty" />
              <div>
                <strong>Dr. Elena Rodriguez</strong>
                <span>College of Engineering</span>
              </div>
            </div>
            <span>202390890</span>
            <span className="cssu-desktop-status valid">Validated</span>
            <span>10:42 AM</span>
            <button type="button" className="cssu-desktop-action ghost">
              <EyeIcon color="var(--green)" size="18" />
            </button>
          </div>

          <div className="cssu-desktop-log-row">
            <div className="cssu-desktop-person">
              <img src={DEFAULT_PROFILE_IMAGE} alt="Faculty" />
              <div>
                <strong>Prof. Julian Marcus</strong>
                <span>Arts & Humanities</span>
              </div>
            </div>
            <span>202089909</span>
            <span className="cssu-desktop-status flagged">No Slip</span>
            <span>10:40 AM</span>
            <button type="button" className="cssu-desktop-action">Intercept</button>
          </div>
        </div>

        <button type="button" className="cssu-desktop-load-link">Load Full Entry Logs</button>
      </section>

      <aside className="cssu-desktop-side-stack">
        <article className="cssu-desktop-status-card">
          <h3>Security Status: Low</h3>
          <p>Current campus status is stable. 3 upcoming group clearances detected.</p>

          <div className="cssu-desktop-status-note">
            <strong>Maintenance Window</strong>
            <span>Back-gate offline in 15 mins</span>
          </div>

          <div className="cssu-desktop-status-note">
            <strong>Group Exit (12 pax)</strong>
            <span>Seminar Field Trip @ Gate 1</span>
          </div>
        </article>

        <article className="cssu-desktop-manager-card">
          <div className="cssu-desktop-manager-icon">
            <HeadsetIcon />
          </div>
          <div>
            <strong>Duty Manager</strong>
            <span>SGT. MILLER • ACTIVE</span>
          </div>
        </article>
      </aside>
    </div>
  </CSSUDesktopPage>
);

const CSSUDashboardDesktopView = ({ setView, profileData, onLogout }) => {
  const [summary, setSummary] = useState({
    totalFacultyExiting: 0,
    approvedLocatorSlips: 0,
    rejectedLocatorSlips: 0,
    approvalRate: 0,
  });
  const [selectedGate, setSelectedGate] = useState('main_gate');
  const [liveRows, setLiveRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      setLoading(true);
      setLoadError('');

      try {
        const [summaryData, liveData] = await Promise.all([
          getCssuDashboardSummary(),
          getCssuLiveExitMonitoring({ gate: selectedGate, limit: 20 }),
        ]);

        if (!isMounted) return;

        setSummary(summaryData || {
          totalFacultyExiting: 0,
          approvedLocatorSlips: 0,
          rejectedLocatorSlips: 0,
          approvalRate: 0,
        });
        setLiveRows(Array.isArray(liveData?.rows) ? liveData.rows : []);
      } catch (error) {
        if (!isMounted) return;
        setLoadError(error.message || 'Unable to load the CSSU dashboard right now.');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [selectedGate]);

  const approvedRateLabel = summary.totalFacultyExiting
    ? `${summary.approvalRate}% approved today`
    : 'No tracked exits yet';

  return (
    <CSSUDesktopPage
      activeKey="dashboard"
      title="CSSU Security Command"
      subtitle="Real-time Faculty Exit & Locator Monitoring"
      setView={setView}
      profileData={profileData}
      onLogout={onLogout}
      hideHeader
    >
      <div className="cssu-dashboard-hero-row">
        <div className="cssu-dashboard-hero-copy">
          <span className="cssu-desktop-kicker">Campus Operations</span>
          <h1>CSSU Security Command</h1>
          <p>Real-time Faculty Exit & Locator Monitoring</p>
        </div>
        <div className="cssu-desktop-actions">
          <div className="cssu-live-pill">
            <span className="cssu-live-dot" />
            <span>LIVE FEED ACTIVE</span>
          </div>
          <button type="button" className="cssu-summary-btn">Generate Summary</button>
        </div>
      </div>

      <div className="cssu-desktop-stats">
        <article className="cssu-desktop-hero-card">
          <span className="cssu-desktop-card-label">Total Faculty Exiting</span>
          <div className="cssu-desktop-hero-value">{summary.totalFacultyExiting}</div>
          <div className="cssu-desktop-trend-chip">
            <CssuTrendingUpIcon color="white" />
            <span>{approvedRateLabel}</span>
          </div>
          <div className="cssu-desktop-hero-mark">
            <CssuExitDoorIcon color="rgba(255,255,255,0.12)" size="96" />
          </div>
        </article>

        <article className="cssu-desktop-mini-card">
          <div className="cssu-desktop-mini-icon ok">
            <CssuRosetteCheckIcon color="var(--green)" />
          </div>
          <span className="cssu-desktop-mini-label">Approved Locator Slips</span>
          <strong>{summary.approvedLocatorSlips}</strong>
          <small>{approvedRateLabel}</small>
        </article>

        <article className="cssu-desktop-mini-card flagged">
          <div className="cssu-desktop-mini-icon warn">
            <CssuWarningTriangleIcon />
          </div>
          <span className="cssu-desktop-mini-label">Rejected Locator Slips</span>
          <strong>{summary.rejectedLocatorSlips}</strong>
          <small>{summary.rejectedLocatorSlips > 0 ? 'Requires intervention' : 'No rejected slips today'}</small>
          <button type="button" className="cssu-desktop-inline-btn" onClick={() => setView('cssu-incidents')}>Review</button>
        </article>
      </div>

      <div className="cssu-desktop-content-grid">
        <section className="cssu-desktop-log-card">
          <div className="cssu-desktop-log-headline">
            <h2>Live Exit Monitoring</h2>
            <div className="cssu-desktop-toggle-group">
              <button type="button" className={selectedGate === 'main_gate' ? 'active' : ''} onClick={() => setSelectedGate('main_gate')}>Main Gate</button>
              <button type="button" className={selectedGate === 'back_gate' ? 'active' : ''} onClick={() => setSelectedGate('back_gate')}>Back Gate</button>
            </div>
          </div>

          <div className="cssu-desktop-log-table">
            <div className="cssu-desktop-log-row head">
              <span>Faculty Member</span>
              <span>ID Number</span>
              <span>Status</span>
              <span>Time</span>
              <span>Action</span>
            </div>

            {loading && (
              <div className="cssu-desktop-log-empty">Loading live exit monitoring...</div>
            )}

            {!loading && loadError && (
              <div className="cssu-desktop-log-empty error">{loadError}</div>
            )}

            {!loading && !loadError && liveRows.length === 0 && (
              <div className="cssu-desktop-log-empty">No approved locator slips are queued for this gate yet.</div>
            )}

            {!loading && !loadError && liveRows.map((row) => {
              const statusClass = row.status === 'validated'
                ? 'valid'
                : row.status === 'denied'
                  ? 'flagged'
                  : 'approved';

              return (
                <div key={`${row.locatorSlipId}-${row.gate}`} className="cssu-desktop-log-row">
                  <div className="cssu-desktop-person">
                    <img src={DEFAULT_PROFILE_IMAGE} alt={row.facultyName} />
                    <div>
                      <strong>{row.facultyName}</strong>
                      <span>{row.departmentName}</span>
                    </div>
                  </div>
                  <span>{row.facultyId || 'Unavailable'}</span>
                  <span className={`cssu-desktop-status ${statusClass}`}>{row.statusLabel}</span>
                  <span>{row.validatedTimeLabel || '--'}</span>
                  {row.status === 'denied' ? (
                    <button type="button" className="cssu-desktop-action">Intercept</button>
                  ) : (
                    <button type="button" className="cssu-desktop-action ghost">
                      <EyeIcon color="var(--green)" size="18" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <button type="button" className="cssu-desktop-load-link">Load Full Entry Logs</button>
        </section>

        <aside className="cssu-desktop-side-stack">
          <article className="cssu-desktop-status-card">
            <h3>Security Status: Low</h3>
            <p>Current campus status is stable. CSSU is monitoring approved slips and rejected slip interventions in real time.</p>

            <div className="cssu-desktop-status-note">
              <strong>{selectedGate === 'main_gate' ? 'Main Gate Queue' : 'Back Gate Queue'}</strong>
              <span>{liveRows.length} active faculty records visible for this gate.</span>
            </div>

            <div className="cssu-desktop-status-note">
              <strong>Rejected Locator Slips</strong>
              <span>{summary.rejectedLocatorSlips} slips currently need intervention or review.</span>
            </div>
          </article>

          <article className="cssu-desktop-manager-card">
            <div className="cssu-desktop-manager-icon">
              <HeadsetIcon />
            </div>
            <div>
              <strong>Duty Manager</strong>
              <span>SGT. MILLER • ACTIVE</span>
            </div>
          </article>
        </aside>
      </div>
    </CSSUDesktopPage>
  );
};

const CSSUDashboardView = ({ setView, profileData, onLogout }) => {
  const isDesktopViewport = useDesktopWorkspaceViewport();
  const [summary, setSummary] = useState({
    totalFacultyExiting: 0,
    approvedLocatorSlips: 0,
    rejectedLocatorSlips: 0,
    approvalRate: 0,
  });
  const [mobileLiveRows, setMobileLiveRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (isDesktopViewport) {
      return undefined;
    }

    let isMounted = true;

    const loadMobileDashboard = async () => {
      setLoading(true);
      setLoadError('');

      try {
        const [summaryData, mainGateData, backGateData] = await Promise.all([
          getCssuDashboardSummary(),
          getCssuLiveExitMonitoring({ gate: 'main_gate', limit: 10 }),
          getCssuLiveExitMonitoring({ gate: 'back_gate', limit: 10 }),
        ]);

        if (!isMounted) return;

        const combinedRows = [
          ...(Array.isArray(mainGateData?.rows) ? mainGateData.rows : []),
          ...(Array.isArray(backGateData?.rows) ? backGateData.rows : []),
        ]
          .sort((left, right) => {
            const leftTime = left?.validatedAt ? new Date(left.validatedAt).getTime() : 0;
            const rightTime = right?.validatedAt ? new Date(right.validatedAt).getTime() : 0;
            return rightTime - leftTime;
          })
          .slice(0, 6);

        setSummary(summaryData || {
          totalFacultyExiting: 0,
          approvedLocatorSlips: 0,
          rejectedLocatorSlips: 0,
          approvalRate: 0,
        });
        setMobileLiveRows(combinedRows);
      } catch (error) {
        if (!isMounted) return;
        setLoadError(error.message || 'Unable to load the CSSU dashboard right now.');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadMobileDashboard();

    return () => {
      isMounted = false;
    };
  }, [isDesktopViewport]);

  if (isDesktopViewport) {
    return <CSSUDashboardDesktopView setView={setView} profileData={profileData} onLogout={onLogout} />;
  }

  const approvedRateLabel = summary.totalFacultyExiting
    ? `${summary.approvalRate}% approved today`
    : 'No tracked exits yet';
  const commandStatusPercent = Math.max(0, Math.min(100, Number(summary.approvalRate || 0)));
  const gateSummaryLabel = 'Main Gate & Back Gate';

  return (
    <div className="admin-dash-wrapper cssu-wrapper">
      <div className="admin-dash-scroll cssu-scroll">

        {/* Header */}
        <div className="cssu-header">
          <h1>Security Command</h1>
          <div className="cssu-avatar" onClick={() => setView('admin-profile')}>
            <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Admin" />
          </div>
        </div>

        <div className="cssu-content">

          {/* Hero Card */}
          <div className="cssu-hero-card">
            <div className="cssu-hero-left">
              <span className="cssu-hero-label">TOTAL FACULTY EXITING</span>
              <h2 className="cssu-hero-number">{summary.totalFacultyExiting}</h2>
              <div className="cssu-hero-trend">
                <CssuTrendingUpIcon color="#fff" />
                <span>{approvedRateLabel}</span>
              </div>
            </div>
            <div className="cssu-hero-icon">
              <CssuExitDoorIcon color="rgba(255,255,255,0.15)" size="80" />
            </div>
          </div>

          {/* Stat Cards */}
          <div className="cssu-stat-grid">
            <div className="cssu-stat-card active-card">
              <div className="cssu-stat-card-header">
                <CssuRosetteCheckIcon color="var(--green)" />
                <span className="cssu-stat-badge active">ACTIVE</span>
              </div>
              <div className="cssu-stat-card-body">
                <h3>{summary.approvedLocatorSlips}</h3>
                <p>Approved Locator Slips</p>
              </div>
            </div>
            <div className="cssu-stat-card flagged-card">
              <div className="cssu-stat-card-header">
                <CssuWarningTriangleIcon />
                <span className="cssu-stat-badge flagged">FLAGGED</span>
              </div>
              <div className="cssu-stat-card-body">
                <h3>{summary.rejectedLocatorSlips}</h3>
                <p>Rejected Locator Slips</p>
              </div>
            </div>
          </div>

          {/* Summary Card */}
          <div className="cssu-summary-card">
            <div className="cssu-summary-header">
              <CssuChartIcon />
              <span>COMMAND STATUS SUMMARY</span>
            </div>
            <div className="cssu-summary-zone">
              <span className="cssu-sz-label">Active Monitoring Zone</span>
              <span className="cssu-sz-value">{gateSummaryLabel}</span>
            </div>
            <div className="cssu-summary-progress-bg">
              <div className="cssu-summary-progress-fill" style={{ width: `${commandStatusPercent}%` }}></div>
            </div>
            <p className="cssu-summary-desc">
              Current efficiency rating: {commandStatusPercent}% based on CSSU locator slip validation today.
            </p>
          </div>

          {/* Live Exit Monitoring */}
          <div className="cssu-live-section">
            <div className="cssu-live-header">
              <h3>Live Exit Monitoring</h3>
              <span className="cssu-live-view-all" onClick={() => setView('cssu-exit-clearance')}>View All</span>
            </div>
            <div className="cssu-live-list">
              {loading && (
                <div className="cssu-live-item cssu-live-item-empty">
                  <div className="cssu-li-info">
                    <div className="cssu-li-top">
                      <h4>Loading live exits...</h4>
                    </div>
                  </div>
                </div>
              )}

              {!loading && loadError && (
                <div className="cssu-live-item flagged-item cssu-live-item-empty">
                  <div className="cssu-li-info">
                    <div className="cssu-li-top">
                      <h4>Live feed unavailable</h4>
                    </div>
                    <p>{loadError}</p>
                  </div>
                </div>
              )}

              {!loading && !loadError && mobileLiveRows.length === 0 && (
                <div className="cssu-live-item cssu-live-item-empty">
                  <div className="cssu-li-info">
                    <div className="cssu-li-top">
                      <h4>No live exits yet</h4>
                    </div>
                    <p>Approved and validated faculty exits will appear here.</p>
                  </div>
                </div>
              )}

              {!loading && !loadError && mobileLiveRows.map((row) => {
                const isFlagged = row.status === 'denied';
                const badgeClass = isFlagged ? 'flagged' : 'verified';
                const badgeLabel = isFlagged ? 'FLAGGED' : row.statusLabel?.toUpperCase?.() || 'VERIFIED';

                return (
                  <div
                    key={`${row.locatorSlipId}-${row.gate}-${row.status}`}
                    className={`cssu-live-item${isFlagged ? ' flagged-item' : ''}`}
                  >
                    <img src={DEFAULT_PROFILE_IMAGE} alt={row.facultyName} className="cssu-li-avatar" />
                    <div className="cssu-li-info">
                      <div className="cssu-li-top">
                        <h4>{row.facultyName}</h4>
                        <span className={`cssu-li-badge ${badgeClass}`}>{badgeLabel}</span>
                      </div>
                      <p>Exited: {row.validatedTimeLabel || '--'} &bull; {row.gateLabel || row.gateLabel || row.gate || 'Unknown Gate'}</p>
                    </div>
                    {isFlagged ? <CssuWarningCircleIcon /> : <ChevronRightIcon />}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      <button className="cssu-scan-fab" onClick={() => setView('cssu-scan')}>
        <CssuScanNavIcon color="#554400" />
      </button>

      <CSSUBottomNav active="dashboard" setView={setView} />
    </div>
  );
};

const CSSUMapView = ({ setView, profileData, onLogout }) => {
  const isDesktopViewport = useDesktopWorkspaceViewport();
  const [showMobileProfile, setShowMobileProfile] = useState(true);
  const [showMobileActivity, setShowMobileActivity] = useState(true);
  const [mobileOverlayOffsets, setMobileOverlayOffsets] = useState({
    profile: { x: 0, y: 0 },
    activity: { x: 0, y: 0 },
  });
  const mobileDragStateRef = useRef(null);
  const {
    center,
    facultyLocations,
    selectedFaculty,
    selectedFacultyDetail,
    activityItems,
    loading,
    detailLoading,
    activityLoading,
    error,
    selectFaculty,
    reload,
    loadMoreActivity,
  } = useHrmuLiveTracking();

  const mapCenter = useMemo(() => [
    Number(center?.lng || OLONGAPO_CENTER[0]),
    Number(center?.lat || OLONGAPO_CENTER[1]),
  ], [center?.lat, center?.lng]);

  const mobileSelectedFaculty = selectedFacultyDetail?.faculty || selectedFaculty || null;
  const mobileDisplayName = mobileSelectedFaculty?.facultyName || 'No active faculty';
  const mobileDisplayRole = mobileSelectedFaculty?.position || selectedFaculty?.position || selectedFaculty?.facultyRoleOrPosition || 'Faculty';
  const mobileLastSync = selectedFacultyDetail?.latestLocation?.lastUpdatedLabel || selectedFaculty?.lastUpdatedLabel || 'Awaiting update';
  const mobileSpeed = selectedFacultyDetail?.latestLocation?.speedKmh ?? selectedFaculty?.speedKmh ?? null;
  const mobileSignal = selectedFaculty?.markerStatus === 'stale' ? 'Weak' : 'Strong';
  const mobileStatusLabel = selectedFaculty?.markerStatus === 'stale' ? 'STALE' : 'VERIFIED';
  const mobileActivityItems = Array.isArray(activityItems) ? activityItems.slice(0, 2) : [];
  const getMobilePointerPosition = (event) => {
    const point = event.touches?.[0] || event.changedTouches?.[0] || event;
    return { x: point.clientX, y: point.clientY };
  };
  const startMobileOverlayDrag = (overlayKey) => (event) => {
    const { x, y } = getMobilePointerPosition(event);
    const baseOffset = mobileOverlayOffsets[overlayKey] || { x: 0, y: 0 };
    mobileDragStateRef.current = {
      key: overlayKey,
      startX: x,
      startY: y,
      baseX: baseOffset.x,
      baseY: baseOffset.y,
    };
  };
  const getMobileOverlayStyle = (overlayKey) => ({
    transform: `translate(${mobileOverlayOffsets[overlayKey]?.x || 0}px, ${mobileOverlayOffsets[overlayKey]?.y || 0}px)`,
  });

  useEffect(() => {
    if (isDesktopViewport) return undefined;

    const handleMove = (event) => {
      if (!mobileDragStateRef.current) return;
      const { x, y } = getMobilePointerPosition(event);
      const { key, startX, startY, baseX, baseY } = mobileDragStateRef.current;
      setMobileOverlayOffsets((current) => ({
        ...current,
        [key]: {
          x: baseX + (x - startX),
          y: baseY + (y - startY),
        },
      }));
    };

    const handleEnd = () => {
      mobileDragStateRef.current = null;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: true });
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDesktopViewport, mobileOverlayOffsets]);

  if (isDesktopViewport) {
    return (
      <CSSUDesktopPage
        activeKey="map"
        title="Live Tracking"
        subtitle="Central Campus Security Unit"
        setView={setView}
        profileData={profileData}
        onLogout={onLogout}
      >
        <section className="cssu-live-page">
          <div className="hrmu-live-map-stage cssu-live-map-stage">
            <HrmuLiveMapPanel
              faculty={facultyLocations}
              center={mapCenter}
              selectedFacultyUserId={selectedFaculty?.facultyUserId || null}
              onMarkerSelect={selectFaculty}
              focusOnOlongapo
              className="hrmu-live-stage-map"
            />

            <div className="hrmu-live-controls">
              <button type="button" className="hrmu-live-control-btn" aria-label="Refresh active faculty" onClick={reload}>R</button>
              <button type="button" className="hrmu-live-control-btn" aria-label="Olongapo City focus">{center?.label?.slice(0, 1) || 'O'}</button>
            </div>

            <FacultyActivityLog
              activity={activityItems}
              loading={loading || activityLoading}
              onViewAll={() => loadMoreActivity(20)}
            />

            <FacultyDetailCard
              faculty={selectedFaculty}
              detail={selectedFacultyDetail}
              loading={loading || detailLoading}
            />

            {error && (
              <div className="hrmu-live-inline-alert">
                <strong>Live tracking error</strong>
                <span>{error}</span>
              </div>
            )}
          </div>
        </section>
      </CSSUDesktopPage>
    );
  }

  return (
    <div className="admin-dash-wrapper cssu-wrapper">
      <div className="admin-dash-scroll cssu-scroll">
        <div className="cssu-header cssu-map-mobile-header">
          <h1>Security Command</h1>
          <div className="cssu-avatar" onClick={() => setView('admin-profile')}>
            <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Admin" />
          </div>
        </div>

        <div className="cssu-mobile-live-shell">
          <div className="cssu-mobile-live-map">
            <HrmuLiveMapPanel
              faculty={facultyLocations}
              center={mapCenter}
              selectedFacultyUserId={selectedFaculty?.facultyUserId || null}
              onMarkerSelect={selectFaculty}
              focusOnOlongapo
              className="cssu-mobile-live-map-canvas"
            />

            <div className="cssu-mobile-live-controls">
              <button type="button" className="cssu-mobile-live-control" aria-label="Map layers">
                <HrmuMapRouteIcon color="#5B6659" />
              </button>
              <button type="button" className="cssu-mobile-live-control" aria-label="Refresh active faculty" onClick={reload}>
                <HrmuSyncIcon color="#5B6659" />
              </button>
            </div>

            {selectedFaculty && (
              <div className="cssu-mobile-live-selected-pill">
                <span>{String(selectedFaculty.facultyName || 'Faculty').replace(/^Mr\.?\s+|^Ms\.?\s+|^Mrs\.?\s+|^Dr\.?\s+/i, '').toUpperCase()}</span>
              </div>
            )}

            {showMobileProfile ? (
              <section className="cssu-mobile-live-profile-card" style={getMobileOverlayStyle('profile')}>
                <div className="cssu-mobile-live-overlay-head">
                  <span>Active Faculty</span>
                  <div className="overlay-card-controls">
                    <button type="button" className="overlay-toggle-btn" onClick={() => setShowMobileProfile(false)}>
                      Hide
                    </button>
                    <button
                      type="button"
                      className="overlay-drag-handle"
                      onMouseDown={startMobileOverlayDrag('profile')}
                      onTouchStart={startMobileOverlayDrag('profile')}
                    >
                      Drag
                    </button>
                  </div>
                </div>
                <div className="cssu-mobile-live-profile-head">
                  <img src={DEFAULT_PROFILE_IMAGE} alt={mobileDisplayName} className="cssu-mobile-live-avatar" />
                  <div className="cssu-mobile-live-profile-copy">
                    <div className="cssu-mobile-live-profile-top">
                      <h2>{mobileDisplayName}</h2>
                      <span className={`cssu-mobile-live-pill-tag ${selectedFaculty?.markerStatus === 'stale' ? 'stale' : 'verified'}`}>{mobileStatusLabel}</span>
                    </div>
                    <div className="cssu-mobile-live-profile-meta">
                      <span><i /> {selectedFaculty?.markerStatus === 'stale' ? 'STALE' : 'ACTIVE'} • {String(mobileDisplayRole || 'Faculty').toUpperCase()}</span>
                      <span>Last sync: {mobileLastSync}</span>
                    </div>
                  </div>
                </div>

                <div className="cssu-mobile-live-stat-grid">
                  <div className="cssu-mobile-live-stat-card">
                    <span>SPEED</span>
                    <strong>{mobileSpeed !== null ? `${Number(mobileSpeed).toFixed(1)} km/h` : '--'}</strong>
                  </div>
                  <div className="cssu-mobile-live-stat-card">
                    <span>SIGNAL</span>
                    <strong>{mobileSignal}</strong>
                  </div>
                </div>
              </section>
            ) : (
              <button type="button" className="cssu-mobile-live-restore profile" onClick={() => setShowMobileProfile(true)}>
                Show Active Faculty
              </button>
            )}

            {showMobileActivity ? (
              <section className="cssu-mobile-live-activity-sheet" style={getMobileOverlayStyle('activity')}>
                <div className="cssu-mobile-live-sheet-handle" />
                <div className="cssu-mobile-live-sheet-head">
                  <h3>Live Activity</h3>
                  <div className="cssu-mobile-live-sheet-actions">
                    <button type="button" onClick={() => loadMoreActivity(20)}>View All</button>
                    <button type="button" className="overlay-toggle-btn" onClick={() => setShowMobileActivity(false)}>
                      Hide
                    </button>
                    <button
                      type="button"
                      className="overlay-drag-handle"
                      onMouseDown={startMobileOverlayDrag('activity')}
                      onTouchStart={startMobileOverlayDrag('activity')}
                    >
                      Drag
                    </button>
                  </div>
                </div>

                <div className="cssu-mobile-live-activity-list">
                  {(loading || activityLoading) && (
                    <div className="cssu-mobile-live-activity-empty">Loading live activity...</div>
                  )}

                  {!loading && !activityLoading && mobileActivityItems.length === 0 && (
                    <div className="cssu-mobile-live-activity-empty">No activity has been recorded for the selected faculty yet.</div>
                  )}

                  {!loading && !activityLoading && mobileActivityItems.map((item) => {
                    const normalizedType = String(item.type || '').toLowerCase();
                    const tone = [
                      'trip_cancelled',
                      'late_return_detected',
                      'unverified_location_flagged',
                      'trip_flagged_unverified',
                    ].includes(normalizedType) ? 'warning' : 'success';
                    return (
                      <div key={item.id || `${item.type}-${item.occurredAt}`} className="cssu-mobile-live-activity-item">
                        <div className={`cssu-mobile-live-activity-icon ${tone}`}>
                          {tone === 'success' ? <HrmuMiniCheckIcon color="var(--green)" /> : <HrmuWarningIcon color="#8B6B00" />}
                        </div>
                        <div className="cssu-mobile-live-activity-copy">
                          <strong>{item.title}</strong>
                          <p>{item.subtitle}</p>
                        </div>
                        <time>{item.relativeTime || '--'}</time>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : (
              <button type="button" className="cssu-mobile-live-restore activity" onClick={() => setShowMobileActivity(true)}>
                Show Live Activity
              </button>
            )}

            {error && (
              <div className="cssu-mobile-live-error">
                <strong>Live tracking error</strong>
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <CSSUBottomNav active="map" setView={setView} />
    </div>
  );
};

const CSSUIncidentsView = ({ setView, profileData, onLogout }) => {
  const isDesktopViewport = useDesktopWorkspaceViewport();
  const [incidentData, setIncidentData] = useState({
    activeCases: 0,
    resolvedToday: 0,
    incidents: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadIncidents = async () => {
      setLoading(true);
      setLoadError('');

      try {
        const data = await getCssuIncidentsOverview();
        if (!isMounted) return;
        setIncidentData({
          activeCases: Number(data?.activeCases || 0),
          resolvedToday: Number(data?.resolvedToday || 0),
          incidents: Array.isArray(data?.incidents) ? data.incidents : [],
        });
      } catch (error) {
        if (!isMounted) return;
        setLoadError(error.message || 'Unable to load the CSSU incidents right now.');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadIncidents();

    return () => {
      isMounted = false;
    };
  }, []);

  if (isDesktopViewport) {
    const incidentRows = incidentData.incidents;
    const featuredIncident = incidentRows[0] || null;

    return (
      <CSSUDesktopPage
        activeKey="incidents"
        title="Incident Log"
        subtitle="Centralized oversight for campus compliance, track flagged violations, review authorization slips, and manage intervention triggers."
        setView={setView}
        profileData={profileData}
        onLogout={onLogout}
        hideHeader
      >
        <div className="cssu-incident-header-row">
          <div className="cssu-incident-header-copy">
            <span className="cssu-desktop-kicker">Campus Operations</span>
            <h1>Incident Log</h1>
            <p>Centralized oversight for campus compliance, track flagged violations, review authorization slips, and manage intervention triggers.</p>
          </div>
          <div className="cssu-incident-overview">
            <div className="cssu-incident-summary-card active">
              <span>ACTIVE CASES</span>
              <strong>{incidentData.activeCases}</strong>
            </div>
            <div className="cssu-incident-summary-card resolved">
              <span>RESOLVED TODAY</span>
              <strong>{incidentData.resolvedToday}</strong>
            </div>
          </div>
        </div>

        <div className="cssu-incident-grid">
          <section className="cssu-incident-list-panel">
            <div className="cssu-incident-list-head">
              <h2>
                <ExclamationCircleIcon color="var(--green)" size="22" />
                <span>Recent Flagged Activities</span>
              </h2>
              <div className="cssu-incident-filters">
                <button type="button">ALL RECORDS</button>
                <button type="button" className="active">HIGH SEVERITY</button>
              </div>
            </div>

            <div className="cssu-incident-list">
              {loading && <div className="cssu-incident-empty">Loading incident cases...</div>}
              {!loading && loadError && <div className="cssu-incident-empty">{loadError}</div>}
              {!loading && !loadError && incidentRows.length === 0 && (
                <div className="cssu-incident-empty">No CSSU incident cases were recorded today.</div>
              )}
              {incidentRows.map((incident) => (
                <article key={incident.id} className={`cssu-incident-row ${incident.tone}`}>
                  <div className={`cssu-incident-icon ${incident.tone}`}>
                    {incident.tone === 'red' && <ExclamationCircleIcon color="#C81E1E" size="22" />}
                    {incident.tone === 'yellow' && <ClipboardClockIcon color="#A27A00" />}
                    {incident.tone === 'green' && <ShieldCheckSmallIcon color="var(--green)" />}
                  </div>
                  <div className="cssu-incident-copy">
                    <div className="cssu-incident-title-row">
                      <h3>{incident.title}</h3>
                      <span className={`cssu-incident-severity ${incident.severity}`}>{incident.severity}</span>
                    </div>
                    <p>{incident.description}</p>
                    <div className="cssu-incident-meta">
                      <span>{incident.facultyName}</span>
                      <span>{incident.occurredTimeLabel}</span>
                      <span>{incident.destination}</span>
                    </div>
                  </div>
                  <button type="button" className="cssu-incident-row-arrow" aria-label={`Open ${incident.title}`}>
                    <ChevronRightIcon color="#7A807A" />
                  </button>
                </article>
              ))}
            </div>
          </section>

          <aside className="cssu-incident-detail-card">
            <div className="cssu-incident-detail-hero">
              <div>
                <span>INCIDENT REPORT</span>
                <h3>{featuredIncident?.title || 'No Active Incident'}</h3>
                <p>CASE REF: {featuredIncident?.id ? `#${String(featuredIncident.id).toUpperCase()}` : 'N/A'}</p>
              </div>
              <button type="button" className="cssu-incident-detail-close" aria-label="Close incident detail">
                ×
              </button>
            </div>

            <div className="cssu-incident-detail-body">
              <div className="cssu-incident-detail-profile">
                <div className="cssu-incident-detail-profile-copy">
                  <strong>{featuredIncident?.facultyName || 'No faculty selected'}</strong>
                  <span>{featuredIncident?.departmentName || 'No department available'}</span>
                </div>
                <CheckCircleSolidIcon color={featuredIncident?.tone === 'red' ? '#C81E1E' : featuredIncident?.tone === 'yellow' ? '#C28C02' : 'var(--green)'} size="28" />
              </div>

              <div className="cssu-incident-detail-meta">
                <div>
                  <span>TIMESTAMP</span>
                  <strong>{featuredIncident?.occurredAt ? formatStatusDateTime(featuredIncident.occurredAt) : '--'}</strong>
                </div>
                <div>
                  <span>LOCATION</span>
                  <strong>{featuredIncident?.destination || '--'}</strong>
                </div>
                <div>
                  <span>SYSTEM FLAG REASON</span>
                  <blockquote>
                    {featuredIncident?.notes || featuredIncident?.description || 'No incident notes available.'}
                  </blockquote>
                </div>
              </div>

              <div className="cssu-incident-detail-actions">
                <button type="button" className="cssu-incident-detail-btn success">Resolve Case</button>
                <button type="button" className="cssu-incident-detail-btn neutral">Flag For HR</button>
              </div>
            </div>
          </aside>
        </div>
      </CSSUDesktopPage>
    );
  }

  return (
    <div className="admin-dash-wrapper cssu-wrapper">
      <div className="admin-dash-scroll cssu-scroll">
        <div className="cssu-header cssu-map-mobile-header">
          <h1>Security Command</h1>
          <div className="cssu-avatar" onClick={() => setView('admin-profile')}>
            <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Admin" />
          </div>
        </div>

        <div className="cssu-mobile-incidents-shell">
          <div className="cssu-mobile-incidents-head">
            <h2>Recent Flagged Activities</h2>
            <button type="button" className="cssu-mobile-incidents-filter" aria-label="Filter incidents">
              <HrmuFilterIcon color="#5B6659" />
            </button>
          </div>

          <div className="cssu-mobile-incidents-list">
            {loading && (
              <div className="cssu-mobile-incident-empty">Loading incident cases...</div>
            )}

            {!loading && loadError && (
              <div className="cssu-mobile-incident-empty error">{loadError}</div>
            )}

            {!loading && !loadError && incidentData.incidents.length === 0 && (
              <div className="cssu-mobile-incident-empty">No CSSU incident cases were recorded today.</div>
            )}

            {!loading && !loadError && incidentData.incidents.map((incident) => {
              const toneClass = incident.tone === 'red' ? 'critical' : incident.tone === 'yellow' ? 'moderate' : 'low';
              const metaIcon = incident.destination ? <LocationIcon color="#3D4B3E" /> : <ProfileIcon color="#3D4B3E" />;
              const metaText = incident.destination || incident.facultyName || incident.departmentName || 'CSSU logged activity';

              return (
                <article key={incident.id} className={`cssu-mobile-incident-card ${toneClass}`}>
                  <div className="cssu-mobile-incident-top">
                    <span className={`cssu-mobile-incident-badge ${toneClass}`}>{String(incident.severity || toneClass).toUpperCase()}</span>
                    <time>{incident.occurredTimeLabel || '--'}</time>
                  </div>

                  <h3>{incident.title}</h3>
                  <p>{incident.description}</p>

                  <div className="cssu-mobile-incident-meta">
                    {metaIcon}
                    <span>{metaText}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>

      <CSSUBottomNav active="incidents" setView={setView} />
    </div>
  );
};

const CSSUScanViewLegacy = ({ setView, profileData, onLogout }) => {
  const isDesktopViewport = useDesktopWorkspaceViewport();

  if (isDesktopViewport) {
    const [serverTime, setServerTime] = useState(() =>
      new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    );

    useEffect(() => {
      const timer = window.setInterval(() => {
        setServerTime(
          new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          })
        );
      }, 1000);

      return () => window.clearInterval(timer);
    }, []);

    return (
      <CSSUDesktopPage
        activeKey="scan"
        title="Exit Verification"
        subtitle="Central Campus Security Unit"
        setView={setView}
        profileData={profileData}
        onLogout={onLogout}
      >
        <div className="cssu-checkpoint-header">
          <div className="cssu-checkpoint-time">
            <span>LIVE SERVER TIME</span>
            <strong>{serverTime}</strong>
          </div>
        </div>

        <div className="cssu-checkpoint-grid">
          <div className="cssu-checkpoint-left">
            <article className="cssu-checkpoint-scanner-card">
              <span className="cssu-checkpoint-card-kicker">SCANNER INTERFACE</span>
              <div className="cssu-checkpoint-scan-stage">
                <div className="cssu-checkpoint-scan-frame">
                  <div className="cssu-checkpoint-qr-box">
                    <ScanQRIcon color="#79C683" />
                  </div>
                  <span>WAITING FOR SCAN</span>
                </div>
              </div>
            </article>

            <article className="cssu-checkpoint-manual-card">
              <span className="cssu-checkpoint-card-kicker">MANUAL ENTRY</span>
              <div className="cssu-checkpoint-manual-row">
                <input
                  type="text"
                  className="cssu-checkpoint-manual-input"
                  placeholder="Enter Faculty ID (e.g. FAC-2024-001)"
                />
                <button type="button" className="cssu-checkpoint-search-btn" aria-label="Search faculty ID">
                  <FacultySearchIcon />
                </button>
              </div>
            </article>
          </div>

          <div className="cssu-checkpoint-right">
            <article className="cssu-checkpoint-profile-card">
              <div className="cssu-checkpoint-profile-top">
                <div className="cssu-checkpoint-profile-avatar">
                  <img src={DEFAULT_PROFILE_IMAGE} alt="Faculty" />
                </div>
                <div className="cssu-checkpoint-profile-copy">
                  <span className="cssu-checkpoint-card-kicker">FACULTY PROFILE</span>
                  <h2>Dr. Helena Vance</h2>
                  <p>Department of Advanced Bio-Ethics</p>
                </div>
              </div>

              <div className="cssu-checkpoint-profile-meta">
                <div>
                  <span>STAFF ID</span>
                  <strong>CSSU-4491-02</strong>
                </div>
                <div>
                  <span>TYPE</span>
                  <strong>Full-Time Faculty</strong>
                </div>
              </div>

              <div className="cssu-checkpoint-slip-status">
                <div className="cssu-checkpoint-slip-icon">
                  <CssuRosetteCheckIcon color="var(--green)" />
                </div>
                <div className="cssu-checkpoint-slip-copy">
                  <span>LOCATOR SLIP STATUS</span>
                  <strong>APPROVED</strong>
                </div>
                <div className="cssu-checkpoint-slip-done">
                  <CheckCircleSolidIcon color="var(--green)" size="40" />
                </div>
              </div>
            </article>

            <article className="cssu-checkpoint-log-card">
              <span className="cssu-checkpoint-card-kicker">SECURITY VALIDATION LOG</span>
              <div className="cssu-checkpoint-log-list">
                <div className="cssu-checkpoint-log-row success">
                  <div className="cssu-checkpoint-log-message">
                    <span className="dot" />
                    <strong>QR Code Validated</strong>
                  </div>
                  <span className="time">14:41:55</span>
                </div>
                <div className="cssu-checkpoint-log-row success">
                  <div className="cssu-checkpoint-log-message">
                    <span className="dot" />
                    <strong>System Check: No active flags</strong>
                  </div>
                  <span className="time">14:41:58</span>
                </div>
                <div className="cssu-checkpoint-log-row warning">
                  <div className="cssu-checkpoint-log-message">
                    <span className="dot" />
                    <strong>Locator Slip: Verified (Official)</strong>
                  </div>
                  <span className="time">14:42:01</span>
                </div>
              </div>
            </article>
          </div>
        </div>

        <div className="cssu-checkpoint-actions">
          <button type="button" className="cssu-checkpoint-btn ghost-danger">
            <ExclamationCircleIcon color="#D72D2D" size="18" />
            <span>Flag Incident</span>
          </button>
          <button type="button" className="cssu-checkpoint-btn soft-danger">
            <RejectXIcon />
            <span>Deny Exit</span>
          </button>
          <button type="button" className="cssu-checkpoint-btn success">
            <CheckCircleIcon />
            <span>Allow Exit</span>
          </button>
        </div>
      </CSSUDesktopPage>
    );
  }

  return <div className="mobile-container"><div className="content"><div className="header"><h1>Scan</h1></div><CSSUBottomNav active="scan" setView={setView} /></div></div>;
};

const CSSUScanView = ({ setView, profileData, onLogout }) => {
  const isDesktopViewport = useDesktopWorkspaceViewport();
  const qrVideoRef = useRef(null);
  const qrScanFrameRef = useRef(null);
  const qrStreamRef = useRef(null);
  const qrDetectorRef = useRef(null);
  const [serverTime, setServerTime] = useState(() =>
    new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  );
  const [manualFacultyId, setManualFacultyId] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [activeCandidate, setActiveCandidate] = useState(null);
  const [lastLookupMethod, setLastLookupMethod] = useState('manual');
  const [showGatePicker, setShowGatePicker] = useState(false);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [qrScannerError, setQrScannerError] = useState('');
  const [qrScannerStatus, setQrScannerStatus] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setServerTime(
        new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!qrScannerOpen || !qrStreamRef.current || !qrVideoRef.current) return undefined;

    let cancelled = false;

    const attachStream = async () => {
      try {
        const video = qrVideoRef.current;
        if (!video || cancelled) return;

        video.setAttribute('autoplay', 'true');
        video.setAttribute('muted', 'true');
        video.setAttribute('playsinline', 'true');
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.srcObject = qrStreamRef.current;
        await video.play();

        if (!cancelled) {
          setQrScannerStatus('Align the locator slip QR code inside the frame.');
          beginQrDetectionLoop();
        }
      } catch (error) {
        if (cancelled) return;
        setQrScannerError('Camera opened, but the live preview could not start. Please try again.');
        stopQrScanner();
        setQrScannerOpen(false);
        setQrScannerStatus('');
      }
    };

    attachStream();

    return () => {
      cancelled = true;
    };
  }, [qrScannerOpen]);

  const stopQrScanner = () => {
    if (qrScanFrameRef.current) {
      window.cancelAnimationFrame(qrScanFrameRef.current);
      qrScanFrameRef.current = null;
    }

    if (qrStreamRef.current) {
      qrStreamRef.current.getTracks().forEach((track) => track.stop());
      qrStreamRef.current = null;
    }

    if (qrVideoRef.current) {
      qrVideoRef.current.pause?.();
      qrVideoRef.current.srcObject = null;
    }
  };

  useEffect(() => () => {
    stopQrScanner();
  }, []);

  const runLookup = async ({ value, method }) => {
    const trimmedValue = String(value || '').trim();
    if (!trimmedValue) {
      setLookupError('Enter a faculty ID or QR value first.');
      return;
    }

    setLookupLoading(true);
    setLookupError('');
    setActionMessage('');

    try {
      const result = await lookupCssuExitCandidate({
        locatorSlipCode: trimmedValue,
        gate: 'main_gate',
        method,
      });
      setActiveCandidate(result);
      setLastLookupMethod(method);
      setManualFacultyId(result?.locatorSlip?.locatorSlipCode || trimmedValue);
    } catch (error) {
      setActiveCandidate(null);
      setLookupError(error.message || 'Unable to validate this faculty ID right now.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleManualLookup = () => runLookup({ value: manualFacultyId, method: 'manual' });

  const beginQrDetectionLoop = () => {
    const BarcodeDetectorCtor = window.BarcodeDetector;
    if (!BarcodeDetectorCtor || !qrVideoRef.current) return;

    if (!qrDetectorRef.current) {
      qrDetectorRef.current = new BarcodeDetectorCtor({ formats: ['qr_code'] });
    }

    const detector = qrDetectorRef.current;

    const scan = async () => {
      if (!qrVideoRef.current || !qrStreamRef.current) return;

      try {
        const barcodes = await detector.detect(qrVideoRef.current);
        if (Array.isArray(barcodes) && barcodes.length > 0) {
          const rawValue = barcodes[0]?.rawValue?.trim();
          if (rawValue) {
            stopQrScanner();
            setQrScannerOpen(false);
            setQrScannerStatus('QR code captured. Fetching locator slip...');
            await runLookup({ value: rawValue, method: 'qr' });
            setQrScannerStatus('');
            return;
          }
        }
      } catch (error) {
        setQrScannerError(error?.message || 'Unable to scan the QR code right now.');
        stopQrScanner();
        setQrScannerOpen(false);
        return;
      }

      qrScanFrameRef.current = window.requestAnimationFrame(scan);
    };

    qrScanFrameRef.current = window.requestAnimationFrame(scan);
  };

  const handleQrLookup = async () => {
    setLookupError('');
    setActionMessage('');
    setQrScannerError('');
    setQrScannerStatus('Requesting camera access...');

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      const fallbackValue = window.prompt('Camera scanning requires HTTPS. Enter the QR code / locator slip code value.');
      if (!fallbackValue) {
        setQrScannerStatus('');
        return;
      }
      setQrScannerStatus('');
      await runLookup({ value: fallbackValue, method: 'qr' });
      return;
    }

    if (!window.BarcodeDetector) {
      const fallbackValue = window.prompt('QR camera scanning is not available on this browser. Enter the QR code / locator slip code value.');
      if (!fallbackValue) {
        setQrScannerStatus('');
        return;
      }
      setQrScannerStatus('');
      await runLookup({ value: fallbackValue, method: 'qr' });
      return;
    }

    try {
      stopQrScanner();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      });

      qrStreamRef.current = stream;
      setQrScannerOpen(true);
      setQrScannerStatus('Opening camera...');
    } catch (error) {
      setQrScannerOpen(false);
      setQrScannerStatus('');
      setQrScannerError(
        error?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Enable camera access in your browser settings, then try again.'
          : 'Unable to open the camera scanner right now.'
      );
    }
  };

  const handleExitDecision = async (nextStatus, gateOverride = 'main_gate') => {
    if (!activeCandidate?.locatorSlip?.locatorSlipId) {
      setLookupError('No approved locator slip is available for CSSU validation.');
      return;
    }

    setActionLoading(true);
    setLookupError('');
    setActionMessage('');

    try {
      const result = await updateCssuExitStatus(activeCandidate.locatorSlip.locatorSlipId, {
        gate: gateOverride,
        status: nextStatus,
        method: lastLookupMethod,
      });

      const validationTitle = result.status === 'flagged'
        ? 'Locator Slip: Flagged Incident'
        : result.status === 'denied'
          ? 'Locator Slip: Exit Denied'
          : 'Locator Slip: Validated (Official)';

      setActiveCandidate((prev) => ({
        ...prev,
        locatorSlip: {
          ...prev.locatorSlip,
          status: result.status,
          statusLabel: result.statusLabel,
          gate: result.gate,
          gateLabel: result.gateLabel,
          validatedAt: result.validatedAt,
          validatedTimeLabel: result.validatedTimeLabel,
          canAllowExit: false,
          canDenyExit: false,
          canFlagIncident: false,
          isOfficial: result.isOfficial,
        },
        validationLog: [
          ...((prev?.validationLog || []).filter((item) => item.title !== 'Locator Slip: Validated (Official)' && item.title !== 'Locator Slip: Exit Denied' && item.title !== 'Locator Slip: Flagged Incident')),
          {
            type: result.status === 'validated' ? 'success' : 'danger',
            title: validationTitle,
            timeLabel: result.validatedTimeLabel || '--',
          },
        ],
      }));

      setActionMessage(
        result.status === 'validated'
          ? `Locator slip is now officially validated for exit at ${result.gateLabel || 'Main Gate'}.`
          : result.status === 'flagged'
            ? 'Exit attempt has been flagged and logged for CSSU incident review.'
            : 'Exit has been denied and logged for CSSU review.'
      );
    } catch (error) {
      setLookupError(error.message || 'Unable to update the CSSU exit decision right now.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAllowExitClick = () => {
    if (!locatorSlip?.canAllowExit || actionLoading) return;
    setShowGatePicker(true);
  };

  const confirmAllowExit = async (gate) => {
    setShowGatePicker(false);
    await handleExitDecision('validated', gate);
  };

  const faculty = activeCandidate?.faculty;
  const locatorSlip = activeCandidate?.locatorSlip;
  const validationLog = Array.isArray(activeCandidate?.validationLog) ? activeCandidate.validationLog : [];
  const normalizedLocatorSlipStatus = String(locatorSlip?.status || '').toLowerCase();
  const slipVisualState = normalizedLocatorSlipStatus === 'validated'
    ? 'validated'
    : normalizedLocatorSlipStatus === 'flagged' || normalizedLocatorSlipStatus === 'denied' || normalizedLocatorSlipStatus === 'rejected'
      ? 'denied'
      : normalizedLocatorSlipStatus === 'pending'
        ? 'pending'
        : 'approved';

  const renderCheckpointContent = (mobile = false) => (
    <>
      {mobile ? null : (
        <div className="cssu-checkpoint-header">
          <div className="cssu-checkpoint-time">
            <span>LIVE SERVER TIME</span>
            <strong>{serverTime}</strong>
          </div>
        </div>
      )}

      <div className="cssu-checkpoint-grid">
        <div className="cssu-checkpoint-left">
          {!mobile && (
            <article className="cssu-checkpoint-scanner-card">
              <span className="cssu-checkpoint-card-kicker">SCANNER INTERFACE</span>
              <div className="cssu-checkpoint-scan-stage">
                <div className="cssu-checkpoint-scan-frame">
                  <div className="cssu-checkpoint-qr-box">
                    <ScanQRIcon color="#79C683" />
                  </div>
                  <span>{lookupLoading && lastLookupMethod === 'qr' ? 'SCANNING QR...' : 'WAITING FOR SCAN'}</span>
                </div>
              </div>
            </article>
          )}

          <article className="cssu-checkpoint-manual-card">
            <span className="cssu-checkpoint-card-kicker">{mobile ? 'LOOKUP ENTRY' : 'MANUAL ENTRY'}</span>
            <div className="cssu-checkpoint-manual-row">
              <input
                type="text"
                className="cssu-checkpoint-manual-input"
                placeholder="Enter Locator Slip Code (e.g. LS-8F3K2A)"
                value={manualFacultyId}
                onChange={(event) => setManualFacultyId(event.target.value)}
              />
              <button type="button" className="cssu-checkpoint-search-btn" aria-label="Search locator slip code" onClick={handleManualLookup} disabled={lookupLoading}>
                <FacultySearchIcon />
              </button>
            </div>
            {mobile && (
              <button type="button" className="cssu-checkpoint-qr-trigger" onClick={handleQrLookup} disabled={lookupLoading}>
                <ScanQRIcon color="var(--green)" />
                <span>Scan QR</span>
              </button>
            )}
          </article>
        </div>

        <div className="cssu-checkpoint-right">
          <article className="cssu-checkpoint-profile-card">
            <div className="cssu-checkpoint-profile-top">
              <div className="cssu-checkpoint-profile-avatar">
                <img src={DEFAULT_PROFILE_IMAGE} alt={faculty?.facultyName || 'Faculty'} />
              </div>
              <div className="cssu-checkpoint-profile-copy">
                <span className="cssu-checkpoint-card-kicker">FACULTY PROFILE</span>
                <h2>{faculty?.facultyName || 'Awaiting Faculty Lookup'}</h2>
                <p>{faculty?.departmentName || 'Search or scan a faculty ID to fetch the assigned locator slip.'}</p>
              </div>
            </div>

            <div className="cssu-checkpoint-profile-meta">
              <div>
                <span>FACULTY ID</span>
                <strong>{faculty?.facultyId || '--'}</strong>
              </div>
              <div>
                <span>LOCATOR SLIP CODE</span>
                <strong>{locatorSlip?.locatorSlipCode || '--'}</strong>
              </div>
              <div>
                <span>TYPE</span>
                <strong>{faculty?.employmentTypeLabel || '--'}</strong>
              </div>
              <div>
                <span>PURPOSE</span>
                <strong>{locatorSlip?.purpose || '--'}</strong>
              </div>
              <div>
                <span>DESTINATION</span>
                <strong>{locatorSlip?.destination || '--'}</strong>
              </div>
              <div>
                <span>DEPARTURE</span>
                <strong>{locatorSlip?.departureTime ? formatStatusDateTime(locatorSlip.departureTime) : '--'}</strong>
              </div>
              <div>
                <span>EXPECTED RETURN</span>
                <strong>{locatorSlip?.expectedReturnTime ? formatStatusDateTime(locatorSlip.expectedReturnTime) : '--'}</strong>
              </div>
            </div>

            <div className={`cssu-checkpoint-slip-status ${slipVisualState}`}>
              <div className={`cssu-checkpoint-slip-icon ${slipVisualState}`}>
                <CssuRosetteCheckIcon color={slipVisualState === 'denied' ? '#D72D2D' : slipVisualState === 'pending' ? '#C28C02' : 'var(--green)'} />
              </div>
              <div className="cssu-checkpoint-slip-copy">
                <span>LOCATOR SLIP STATUS</span>
                <strong>{locatorSlip?.statusLabel || 'WAITING FOR LOOKUP'}</strong>
              </div>
              <div className={`cssu-checkpoint-slip-done ${slipVisualState}`}>
                <CheckCircleSolidIcon color={slipVisualState === 'pending' ? '#E7B825' : slipVisualState === 'denied' ? '#D72D2D' : 'var(--green)'} size="40" />
              </div>
            </div>
          </article>

          <article className="cssu-checkpoint-log-card">
            <span className="cssu-checkpoint-card-kicker">SECURITY VALIDATION LOG</span>
            <div className="cssu-checkpoint-log-list">
              {validationLog.length === 0 && (
                <div className="cssu-checkpoint-log-empty">Lookup a faculty ID or QR value to begin CSSU exit verification.</div>
              )}

              {validationLog.map((item, index) => (
                <div key={`${item.title}-${index}`} className={`cssu-checkpoint-log-row ${item.type === 'danger' ? 'danger' : item.type === 'warning' ? 'warning' : 'success'}`}>
                  <div className="cssu-checkpoint-log-message">
                    <span className="dot" />
                    <strong>{item.title}</strong>
                  </div>
                  <span className="time">{item.timeLabel}</span>
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>

      {(lookupError || actionMessage) && (
        <div className={`cssu-checkpoint-inline-alert ${lookupError ? 'error' : 'success'}`}>
          {lookupError || actionMessage}
        </div>
      )}

      <div className="cssu-checkpoint-actions">
        <button
          type="button"
          className="cssu-checkpoint-btn ghost-danger"
          onClick={() => handleExitDecision('flagged')}
          disabled={!locatorSlip?.canFlagIncident || actionLoading}
        >
          <ExclamationCircleIcon color="#D72D2D" size="18" />
          <span>{actionLoading ? 'Updating...' : 'Flag Incident'}</span>
        </button>
        <button
          type="button"
          className="cssu-checkpoint-btn soft-danger"
          onClick={() => handleExitDecision('denied')}
          disabled={!locatorSlip?.canDenyExit || actionLoading}
        >
          <RejectXIcon />
          <span>{actionLoading ? 'Updating...' : 'Deny Exit'}</span>
        </button>
        <button
          type="button"
          className="cssu-checkpoint-btn success"
          onClick={handleAllowExitClick}
          disabled={!locatorSlip?.canAllowExit || actionLoading}
        >
          <CheckCircleIcon />
          <span>{actionLoading ? 'Updating...' : 'Allow Exit'}</span>
        </button>
      </div>

      {showGatePicker && (
        <div className="cssu-gate-picker-backdrop" onClick={() => setShowGatePicker(false)}>
          <div className="cssu-gate-picker-modal" onClick={(event) => event.stopPropagation()}>
            <span className="cssu-gate-picker-kicker">EXIT GATE</span>
            <h3>Select faculty exit gate</h3>
            <p>Choose the gate this faculty member will use so CSSU dashboard monitoring records the correct exit point.</p>
            <div className="cssu-gate-picker-actions">
              <button type="button" className="cssu-gate-picker-btn" onClick={() => confirmAllowExit('main_gate')}>
                Main Gate
              </button>
              <button type="button" className="cssu-gate-picker-btn" onClick={() => confirmAllowExit('back_gate')}>
                Back Gate
              </button>
            </div>
            <button type="button" className="cssu-gate-picker-cancel" onClick={() => setShowGatePicker(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {qrScannerOpen && (
        <div className="cssu-qr-scanner-backdrop" onClick={() => { stopQrScanner(); setQrScannerOpen(false); setQrScannerStatus(''); }}>
          <div className="cssu-qr-scanner-modal" onClick={(event) => event.stopPropagation()}>
            <span className="cssu-gate-picker-kicker">QR SCANNER</span>
            <h3>Scan locator slip QR code</h3>
            <p>{qrScannerStatus || 'Align the locator slip QR code in the camera frame. Lookup will begin automatically after detection.'}</p>
            <div className="cssu-qr-scanner-stage">
              <video ref={qrVideoRef} className="cssu-qr-scanner-video" playsInline muted />
              <div className="cssu-qr-scanner-frame" aria-hidden="true">
                <span className="scanner-corner tl" />
                <span className="scanner-corner tr" />
                <span className="scanner-corner bl" />
                <span className="scanner-corner br" />
              </div>
            </div>
            <button
              type="button"
              className="cssu-gate-picker-cancel"
              onClick={() => {
                stopQrScanner();
                setQrScannerOpen(false);
                setQrScannerStatus('');
              }}
            >
              Cancel Scan
            </button>
          </div>
        </div>
      )}
    </>
  );

  if (isDesktopViewport) {
    return (
      <CSSUDesktopPage
        activeKey="scan"
        title="Exit Verification"
        subtitle="Central Campus Security Unit"
        setView={setView}
        profileData={profileData}
        onLogout={onLogout}
      >
        {renderCheckpointContent(false)}
      </CSSUDesktopPage>
    );
  }

  return (
    <div className="mobile-container">
      <div className="content cssu-checkpoint-mobile-content">
        <div className="header">
          <h1>Exit Verification</h1>
          <p className="map-subtitle">Enter a locator slip code manually or use QR lookup on mobile.</p>
        </div>
        <div className="cssu-checkpoint-mobile-shell">
          {renderCheckpointContent(true)}
          {qrScannerError && <div className="cssu-checkpoint-inline-alert error">{qrScannerError}</div>}
        </div>
        <CSSUBottomNav active="scan" setView={setView} />
      </div>
    </div>
  );
};

const CSSUReportsView = ({ setView, profileData, onLogout }) => {
  const isDesktopViewport = useDesktopWorkspaceViewport();
  const getTodayIso = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getMonthStartIso = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  };

  const [startDate, setStartDate] = useState(getMonthStartIso);
  const [endDate, setEndDate] = useState(getTodayIso);
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [visibleRecordCount, setVisibleRecordCount] = useState(6);
  const startDateInputRef = useRef(null);
  const endDateInputRef = useRef(null);

  const cssuDepartmentOptions = [
    { value: 'all', label: 'All Departments' },
    { value: 'College of Education, Arts and Sciences', label: 'College of Education, Arts and Sciences' },
    { value: 'College of Hospitality and Tourism Management', label: 'College of Hospitality and Tourism Management' },
    { value: 'College of Business and Accountancy', label: 'College of Business and Accountancy' },
    { value: 'College of Allied Health Studies', label: 'College of Allied Health Studies' },
    { value: 'College of Computer Studies', label: 'College of Computer Studies' },
  ];

  const formatCssuDate = (value) => {
    if (!value) return 'mm/dd/yyyy';

    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return 'mm/dd/yyyy';

    return date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });
  };

  const openDatePicker = (inputRef) => {
    const input = inputRef?.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    } else {
      input.focus();
      input.click();
    }
  };

  const fetchReportsOverview = async (filters) => {
    setLoading(true);
    setLoadError('');

    try {
      const result = await getCssuReportsOverview(filters);
      setReportData(result);
    } catch (error) {
      setLoadError(error.message || 'Unable to load CSSU reports right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportsOverview({
      startDate,
      endDate,
      department: selectedDepartment,
    });
  }, []);

  const handleGenerateReport = () => {
    setVisibleRecordCount(6);
    fetchReportsOverview({
      startDate,
      endDate,
      department: selectedDepartment,
    });
  };

  const previewRows = useMemo(
    () => Array.isArray(reportData?.movementLogs) ? reportData.movementLogs.slice(0, visibleRecordCount) : [],
    [reportData, visibleRecordCount]
  );

  const hasMoreRecords = Array.isArray(reportData?.movementLogs) && visibleRecordCount < reportData.movementLogs.length;

  const formatReportFooterDate = (value) => {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';

    return date.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isDesktopViewport) {
    return (
      <CSSUDesktopPage
        activeKey="reports"
        setView={setView}
        profileData={profileData}
        onLogout={onLogout}
        hideHeader
      >
        <div className="cssu-reports-hero-row">
          <div className="cssu-reports-hero-copy">
            <span className="cssu-desktop-kicker">Internal Logistics</span>
            <h1>Report Generation</h1>
            <p>Movement data synchronization for Human Resource Management Unit (HRMU).</p>
          </div>

          <div className="cssu-reports-toolbar">
            <button type="button" className="cssu-reports-tool-btn">
              <RegistryDownloadIcon />
              <span>Export PDF</span>
            </button>
            <button type="button" className="cssu-reports-tool-btn">
              <RegistryDownloadIcon />
              <span>Export CSV</span>
            </button>
            <button type="button" className="cssu-reports-send-btn">
              <SendIcon />
              <span>Send to HRMU</span>
            </button>
          </div>
        </div>

        <div className="cssu-reports-filter-row">
          <div className="cssu-reports-filter-field">
            <label>START DATE</label>
            <button type="button" className="cssu-reports-date-toggle" onClick={() => openDatePicker(startDateInputRef)}>
              <ClockIcon color="var(--green)" />
              <span>{formatCssuDate(startDate)}</span>
            </button>
            <input
              ref={startDateInputRef}
              type="date"
              className="cssu-reports-date-native"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              aria-label="Start date"
            />
          </div>

          <div className="cssu-reports-filter-field">
            <label>END DATE</label>
            <button type="button" className="cssu-reports-date-toggle" onClick={() => openDatePicker(endDateInputRef)}>
              <ClockIcon color="var(--green)" />
              <span>{formatCssuDate(endDate)}</span>
            </button>
            <input
              ref={endDateInputRef}
              type="date"
              className="cssu-reports-date-native"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              aria-label="End date"
            />
          </div>

          <div className="cssu-reports-filter-field department">
            <label>DEPARTMENT</label>
            <div className="cssu-reports-select-shell">
              <GlobeSmIcon color="var(--green)" />
              <select
                value={selectedDepartment}
                onChange={(event) => setSelectedDepartment(event.target.value)}
                aria-label="Department"
              >
                {cssuDepartmentOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <ChevronDownIcon />
            </div>
          </div>

          <button type="button" className="cssu-reports-generate-btn" onClick={handleGenerateReport} disabled={loading}>
            <PlayTriangleIcon />
            <span>{loading ? 'Loading...' : 'Generate'}</span>
          </button>
        </div>

        {loadError ? <div className="cssu-reports-error-banner">{loadError}</div> : null}

        <div className="cssu-reports-grid">
          <section className="cssu-reports-preview-card">
            <div className="cssu-reports-preview-head">
              <div>
                <h2>
                  <FileTextIcon color="var(--green)" />
                  <span>Movement Logs Preview</span>
                </h2>
                <p>Displaying data for {reportData?.filters?.dateRangeLabel || `${formatCssuDate(startDate)} - ${formatCssuDate(endDate)}`}</p>
              </div>
              <span className="cssu-reports-draft-pill">DRAFT REPORT</span>
            </div>

            <div className="cssu-reports-preview-list">
              {loading && previewRows.length === 0 ? (
                <div className="cssu-reports-empty-state">Loading movement logs...</div>
              ) : null}

              {!loading && !loadError && previewRows.length === 0 ? (
                <div className="cssu-reports-empty-state">No verified or flagged movements were found in the selected date range.</div>
              ) : null}

              {previewRows.map((row) => (
                <article key={row.id} className={`cssu-reports-preview-row ${row.movementStatus === 'flagged' ? 'flagged' : ''}`}>
                  <div className={`cssu-reports-preview-avatar ${row.movementStatus === 'flagged' ? 'flagged' : ''}`}>
                    {row.movementStatus === 'flagged'
                      ? <ExclamationCircleIcon color="#C81E1E" size="24" />
                      : <PersonOutlineIcon color="var(--green)" />}
                  </div>
                  <div className="cssu-reports-preview-copy">
                    <strong>{row.facultyName}</strong>
                    <p>{row.departmentName} • {row.eventLabel} • {row.occurredTimeLabel}</p>
                  </div>
                  <span className={`cssu-reports-preview-status ${row.movementStatus === 'flagged' ? 'flagged' : 'verified'}`}>
                    {row.movementStatusLabel}
                  </span>
                  <span className={`cssu-reports-preview-place ${row.movementStatus === 'flagged' ? 'flagged' : ''}`}>
                    {row.movementStatus === 'flagged' ? row.investigationLabel || row.locationLabel : row.locationLabel}
                  </span>
                </article>
              ))}
            </div>

            {hasMoreRecords ? (
              <button type="button" className="cssu-reports-load-link" onClick={() => setVisibleRecordCount((current) => current + 6)}>
                LOAD MORE RECORDS
              </button>
            ) : null}
          </section>

          <aside className="cssu-reports-side-stack">
            <article className="cssu-reports-summary-card">
              <span>TOTAL MOVEMENTS</span>
              <strong>{reportData?.summary?.totalMovements ?? 0}</strong>
              <p>Verified and flagged CSSU movement records within the selected report range.</p>

              <div className="cssu-reports-summary-metrics">
                <div><label>Exit Clearances</label><b>{reportData?.summary?.exitClearances ?? 0}</b></div>
                <div className="flagged"><label>Flagged Events</label><b>{reportData?.summary?.flaggedEvents ?? 0}</b></div>
              </div>
            </article>

            <article className="cssu-reports-activity-card">
              <span>ACTIVITY BY DEPT.</span>
              <div className="cssu-reports-activity-list">
                {Array.isArray(reportData?.activityByDepartment) && reportData.activityByDepartment.length > 0 ? reportData.activityByDepartment.map((row) => (
                  <div key={row.departmentName} className="cssu-reports-activity-row">
                    <div className="cssu-reports-activity-labels">
                      <strong>{row.departmentName}</strong>
                      <b>{row.percentage}%</b>
                    </div>
                    <div className="cssu-reports-activity-track">
                      <div style={{ width: `${Math.min(row.percentage, 100)}%` }} />
                    </div>
                  </div>
                )) : (
                  <div className="cssu-reports-empty-state compact">No department locator slip activity was found in the selected range.</div>
                )}
              </div>
            </article>

            <article className="cssu-reports-banner-card">
              <div className="cssu-reports-banner-overlay" />
              <span>SYSTEM INTEGRITY</span>
              <h3>CCSU Security &amp; Movement Hub</h3>
            </article>
          </aside>
        </div>

        <footer className="cssu-reports-footer">
          <div className="cssu-reports-footer-note">
            <CheckCircleSolidIcon color="var(--green)" size="20" />
            <span>ALL DATA IS ENCRYPTED AND COMPLIES WITH GORDON COLLEGE PRIVACY POLICIES.</span>
          </div>
          <div className="cssu-reports-footer-meta">
            <strong>Report ID: {reportData?.reportMeta?.reportId || 'CSSU-REPORT-DRAFT'}</strong>
            <span>Last Generated: {reportData?.reportMeta?.lastGeneratedLabel || formatReportFooterDate(new Date().toISOString())}</span>
          </div>
        </footer>
      </CSSUDesktopPage>
    );
  }

  return (
    <div className="admin-dash-wrapper cssu-wrapper">
      <div className="admin-dash-scroll cssu-scroll">
        <div className="cssu-header cssu-map-mobile-header">
          <h1>Security Command</h1>
          <div className="cssu-avatar" onClick={() => setView('admin-profile')}>
            <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Admin" />
          </div>
        </div>

        <div className="cssu-mobile-reports-shell">
          <div className="cssu-mobile-reports-hero">
            <h2>Report Generation</h2>
            <p>Configure and export logistics data logs</p>
          </div>

          <section className="cssu-mobile-reports-filter-card">
            <div className="cssu-mobile-reports-date-grid">
              <div className="cssu-mobile-reports-field">
                <label>Start Date</label>
                <button type="button" className="cssu-mobile-reports-date-btn" onClick={() => openDatePicker(startDateInputRef)}>
                  <ClockIcon color="#73806E" />
                  <span>{formatCssuDate(startDate)}</span>
                </button>
                <input
                  ref={startDateInputRef}
                  type="date"
                  className="cssu-reports-date-native"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  aria-label="Start date"
                />
              </div>

              <div className="cssu-mobile-reports-field">
                <label>End Date</label>
                <button type="button" className="cssu-mobile-reports-date-btn" onClick={() => openDatePicker(endDateInputRef)}>
                  <ClockIcon color="#73806E" />
                  <span>{formatCssuDate(endDate)}</span>
                </button>
                <input
                  ref={endDateInputRef}
                  type="date"
                  className="cssu-reports-date-native"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  aria-label="End date"
                />
              </div>
            </div>

            <div className="cssu-mobile-reports-field">
              <label>Department</label>
              <div className="cssu-mobile-reports-select">
                <GlobeSmIcon color="#73806E" />
                <select
                  value={selectedDepartment}
                  onChange={(event) => setSelectedDepartment(event.target.value)}
                  aria-label="Department"
                >
                  {cssuDepartmentOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <ChevronDownIcon />
              </div>
            </div>

            <button type="button" className="cssu-mobile-reports-generate" onClick={handleGenerateReport} disabled={loading}>
              <HrmuChartIcon color="#6B5A00" />
              <span>{loading ? 'Loading...' : 'Generate Report'}</span>
            </button>

            <div className="cssu-mobile-reports-actions">
              <button type="button" className="cssu-mobile-reports-action-btn">PDF</button>
              <button type="button" className="cssu-mobile-reports-action-btn">CSV</button>
            </div>
          </section>

          {loadError ? <div className="cssu-reports-error-banner">{loadError}</div> : null}

          <section className="cssu-mobile-reports-preview">
            <div className="cssu-mobile-reports-preview-head">
              <div>
                <h3>Movement Logs Preview</h3>
                <p>{reportData?.filters?.dateRangeLabel || `${formatCssuDate(startDate)} - ${formatCssuDate(endDate)}`}</p>
              </div>
              <strong>{reportData?.summary?.totalMovements ?? 0} Records</strong>
            </div>

            <div className="cssu-mobile-reports-list">
              {loading && previewRows.length === 0 ? (
                <div className="cssu-mobile-reports-empty">Loading movement logs...</div>
              ) : null}

              {!loading && !loadError && previewRows.length === 0 ? (
                <div className="cssu-mobile-reports-empty">No verified or flagged movements were found in the selected date range.</div>
              ) : null}

              {previewRows.map((row) => (
                <article key={row.id} className={`cssu-mobile-reports-row ${row.movementStatus === 'flagged' ? 'flagged' : ''}`}>
                  <img src={DEFAULT_PROFILE_IMAGE} alt={row.facultyName} className="cssu-mobile-reports-avatar" />
                  <div className="cssu-mobile-reports-copy">
                    <strong>{row.facultyName}</strong>
                    <p>{row.occurredTimeLabel} • {row.locationLabel}</p>
                  </div>
                  <span className={`cssu-mobile-reports-status ${row.movementStatus === 'flagged' ? 'flagged' : 'verified'}`}>
                    {row.movementStatusLabel}
                  </span>
                </article>
              ))}
            </div>
          </section>
        </div>

        <CSSUBottomNav active="reports" setView={setView} />
      </div>
    </div>
  );
};

const CSSUNotificationsView = ({ setView, profileData, onLogout }) => {
  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState('');
  const [alertFilter, setAlertFilter] = useState('all');
  const [summary, setSummary] = useState({
    validatedClearances: 0,
    flaggedExits: 0,
    unauthorizedExit: 0,
  });

  useEffect(() => {
    let isMounted = true;

    const formatRelativeAlertTime = (value) => {
      if (!value) return 'Time unavailable';

      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return 'Time unavailable';

      const diffMs = Date.now() - date.getTime();
      const diffMinutes = Math.max(Math.round(diffMs / 60000), 0);

      if (diffMinutes < 1) return 'Just now';
      if (diffMinutes < 60) return `${diffMinutes} min${diffMinutes === 1 ? '' : 's'} ago`;

      const diffHours = Math.round(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;

      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    };

    const loadAlerts = async () => {
      setAlertsLoading(true);
      setAlertsError('');

      try {
        const result = await getCssuNotificationsOverview({ limit: 8 });
        if (!isMounted) return;

        const notificationRows = Array.isArray(result?.notifications) ? result.notifications : [];
        setAlerts(notificationRows.map((notification) => ({
          id: notification.id,
          type: notification.type === 'flagged' ? 'flagged' : 'validated',
          title: notification.title || (notification.type === 'flagged' ? 'Flagged Exit Attempt' : 'Exit Clearance Validated'),
          body: notification.type === 'flagged'
            ? `${notification.facultyName} attempted exit clearance at ${notification.gateLabel} while the locator slip was still ${notification.locatorSlipStatus}.`
            : `${notification.facultyName} was cleared by CSSU for ${notification.purpose}${notification.destination ? ` bound for ${notification.destination}` : ''}.`,
          time: formatRelativeAlertTime(notification.occurredAt),
          sortDate: notification.occurredAt ? new Date(notification.occurredAt).getTime() : 0,
          actionLabelPrimary: notification.type === 'flagged' ? 'Open Incidents' : 'Open Exit Clearance',
          actionLabelSecondary: notification.type === 'flagged' ? 'Open Reports' : 'Open Dashboard',
        })));

        setSummary({
          validatedClearances: Number(result?.summary?.validatedClearances || 0),
          flaggedExits: Number(result?.summary?.flaggedExits || 0),
          unauthorizedExit: Number(result?.summary?.unauthorizedExit || 0),
        });
      } catch (error) {
        if (!isMounted) return;
        setAlerts([]);
        setSummary({
          validatedClearances: 0,
          flaggedExits: 0,
          unauthorizedExit: 0,
        });
        setAlertsError(error.message || 'Failed to load CSSU notifications.');
      } finally {
        if (isMounted) {
          setAlertsLoading(false);
        }
      }
    };

    loadAlerts();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredAlerts = alerts.filter((alert) => {
    if (alertFilter === 'validated') return alert.type === 'validated';
    if (alertFilter === 'flagged') return alert.type === 'flagged';
    return true;
  });

  const featuredAlert = filteredAlerts[0] || null;
  const featuredTone = featuredAlert?.type === 'flagged' ? 'incident' : 'verified';
  const featuredPillLabel = alertsLoading
    ? 'LOADING'
    : featuredAlert?.type === 'flagged'
      ? 'FLAGGED'
      : featuredAlert
        ? 'VALIDATED'
        : 'NO ALERTS';

  return (
    <CSSUDesktopPage
      activeKey=""
      setView={setView}
      profileData={profileData}
      onLogout={onLogout}
      hideHeader
    >
      <section className="hrmu-alerts-page cssu-alerts-page">
        <div className="hrmu-alerts-hero">
          <div className="hrmu-alerts-copy">
            <span className="hrmu-alerts-kicker">INTERNAL LOGISTICS</span>
            <h1>System Alerts</h1>
            <p>Real-time monitoring and clearance notifications for CSSU faculty exit verification.</p>
          </div>
          <div className="hrmu-alerts-actions">
            <button type="button" className="hrmu-alerts-btn ghost">Mark all read</button>
            <label className="hrmu-alerts-filter">
              <StatusGraphIcon color="currentColor" />
              <select value={alertFilter} onChange={(event) => setAlertFilter(event.target.value)} aria-label="Filter CSSU alerts">
                <option value="all">All</option>
                <option value="validated">Validated</option>
                <option value="flagged">Flagged</option>
              </select>
            </label>
          </div>
        </div>

        <section className="hrmu-alerts-grid">
          <article className={`hrmu-alert-main-card ${featuredTone}`}>
            <div className="hrmu-alert-main-accent" aria-hidden="true" />
            <div className="hrmu-alert-main-body">
              <div className="hrmu-alert-main-icon">
                {featuredAlert?.type === 'flagged' ? <HrmuWarningIcon /> : <NotifSlipIcon />}
              </div>
              <div className="hrmu-alert-main-copy">
                <div className="hrmu-alert-main-head">
                  <div className="hrmu-alert-main-badges">
                    <span className={`hrmu-alert-critical-pill ${featuredTone}`}>{featuredPillLabel}</span>
                  </div>
                  <span className="hrmu-alert-main-time">{featuredAlert?.time || 'Awaiting updates'}</span>
                </div>
                <h2>{featuredAlert?.title || 'No CSSU notifications yet'}</h2>
                <p>
                  {featuredAlert
                    ? featuredAlert.body
                    : `No ${alertFilter === 'all' ? 'CSSU' : alertFilter} alerts available right now.`}
                </p>
                <div className="hrmu-alert-main-actions">
                  <button
                    type="button"
                    className={`hrmu-alert-primary-btn ${featuredTone}`}
                    onClick={() => setView(featuredAlert?.type === 'flagged' ? 'cssu-incidents' : 'cssu-scan')}
                  >
                    {featuredAlert?.actionLabelPrimary || 'Open Exit Clearance'}
                  </button>
                  <button
                    type="button"
                    className="hrmu-alert-text-btn"
                    onClick={() => setView(featuredAlert?.type === 'flagged' ? 'cssu-reports' : 'cssu-dashboard')}
                  >
                    {featuredAlert?.actionLabelSecondary || 'Open Dashboard'}
                  </button>
                </div>
              </div>
            </div>
          </article>

          <aside className="hrmu-alerts-side-column">
            <article className="hrmu-alert-summary-card">
              <span className="hrmu-alert-summary-kicker">INCIDENT SUMMARY</span>
              <div className="hrmu-alert-summary-row">
                <span>Unauthorized Exit</span>
                <strong className="yellow">{String(summary.unauthorizedExit).padStart(2, '0')}</strong>
              </div>
              <div className="hrmu-alert-summary-mark" aria-hidden="true" />
            </article>
          </aside>
        </section>

        {alertsError ? <div className="cssu-reports-error-banner">{alertsError}</div> : null}
      </section>
    </CSSUDesktopPage>
  );
};

const AdminProfileView = ({ setView, profileData, onLogout }) => {
  const isDesktopViewport = useDesktopWorkspaceViewport();
  const accountRole = profileData?.accountRole || '';
  const homeView = getPortalHomeViewForRole(accountRole);
  const notificationsView = getPortalNotificationsViewForRole(accountRole);
  const fullName = profileData?.fullName || 'Portal User';
  const department = profileData?.department || 'Portal Department';
  const position = getPortalPositionLabel(profileData);
  const badgeLabel = getPortalBadgeLabel(accountRole);
  const metaLabel = getPortalMetaLabel(profileData);
  const administrationDescription = getPortalAdministrationDescription(profileData);

  const profileContent = (
    <div className="aprof-container">
      <div className="aprof-hero-card">
        <div className="aprof-hero-bg-accent" />
        <div className="aprof-hero-content">
          <div className="aprof-avatar-wrapper">
            <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt={fullName} />
            <div className="aprof-avatar-badge">{badgeLabel}</div>
          </div>
          <h2 className="aprof-name">{fullName}</h2>
          <p className="aprof-role">{position}</p>
          <div className="aprof-id-pill">
            <AdminProfileIdIcon />
            <span>ID: {profileData?.employeeId || 'Not assigned'}</span>
          </div>
        </div>
      </div>

      <div className="aprof-section">
        <h3 className="aprof-section-title">ACCOUNT ADMINISTRATION</h3>

        <div className="aprof-menu">
          <button type="button" className="aprof-menu-item" onClick={() => setView('admin-edit-profile')}>
            <div className="aprof-menu-icon-box">
              <AdminProfileEditIcon />
            </div>
            <span className="aprof-menu-text">Edit Profile</span>
            <AdminProfileChevronIcon />
          </button>

          <button type="button" className="aprof-menu-item" onClick={() => setView('admin-change-password')}>
            <div className="aprof-menu-icon-box">
              <AdminProfilePasswordIcon />
            </div>
            <span className="aprof-menu-text">Change Password</span>
            <AdminProfileChevronIcon />
          </button>
        </div>

        <button className="aprof-logout-btn" onClick={onLogout}>
          <AdminProfileLogoutIcon />
          LOGOUT SESSION
        </button>
      </div>
    </div>
  );

  const desktopProfileContent = (
    <section className="portal-profile-desktop">
      <div className="portal-profile-desktop-hero">
        <div className="portal-profile-desktop-media">
          <div className="portal-profile-desktop-avatar">
            <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt={fullName} />
          </div>
          <div className="portal-profile-desktop-badge">{badgeLabel}</div>
        </div>
        <div className="portal-profile-desktop-copy">
          <span className="portal-profile-desktop-kicker">Profile Overview</span>
          <h1>{fullName}</h1>
          <p>{position}</p>
          <div className="portal-profile-desktop-meta">
            <div className="portal-profile-desktop-meta-pill">
              <AdminProfileIdIcon />
              <span>ID: {profileData?.employeeId || 'Not assigned'}</span>
            </div>
            <div className="portal-profile-desktop-meta-text">{metaLabel}</div>
          </div>
        </div>
      </div>

      <div className="portal-profile-desktop-admin">
        <div className="portal-profile-desktop-admin-header">
          <span>Account Administration</span>
          <p>{administrationDescription}</p>
        </div>
        <div className="portal-profile-desktop-actions">
          <button type="button" className="portal-profile-desktop-action" onClick={() => setView('admin-edit-profile')}>
            <div className="portal-profile-desktop-action-icon">
              <AdminProfileEditIcon />
            </div>
            <div className="portal-profile-desktop-action-copy">
              <strong>Edit Profile</strong>
              <span>Update your display name and account email.</span>
            </div>
            <AdminProfileChevronIcon />
          </button>

          <button type="button" className="portal-profile-desktop-action" onClick={() => setView('admin-change-password')}>
            <div className="portal-profile-desktop-action-icon">
              <AdminProfilePasswordIcon />
            </div>
            <div className="portal-profile-desktop-action-copy">
              <strong>Change Password</strong>
              <span>Refresh your account password and keep access secure.</span>
            </div>
            <AdminProfileChevronIcon />
          </button>
        </div>
      </div>
    </section>
  );

  if (accountRole === 'hrmu' && isDesktopViewport) {
    return (
      <HrmuWorkspaceShell activeKey="" setView={setView} profileData={profileData} onLogout={onLogout}>
        <section className="cssu-desktop-page">{desktopProfileContent}</section>
      </HrmuWorkspaceShell>
    );
  }

  if (accountRole === 'cssu' && isDesktopViewport) {
    return (
      <CSSUDesktopPage activeKey="" setView={setView} profileData={profileData} onLogout={onLogout} hideHeader>
        {desktopProfileContent}
      </CSSUDesktopPage>
    );
  }

  return (
    <div className="admin-dash-wrapper" style={{ background: '#F2F6ED' }}>
      <div className="admin-dash-scroll">
        <div className="admin-header">
          <div className="anotif-header-left">
            <div className="anotif-back" onClick={() => setView(homeView)}>
              <BackArrowIcon color="var(--green)" />
            </div>
            <span className="admin-logo-text">EduRoute</span>
          </div>
          <div className="admin-header-right">
            <div className="admin-bell-wrapper" onClick={() => setView(notificationsView)}>
              <AdminBellIcon color="var(--text-dark)" />
              <div className="admin-bell-dot" />
            </div>
            <div className="admin-avatar" style={{ border: '3px solid var(--yellow)' }} onClick={() => setView('admin-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt={fullName} />
            </div>
          </div>
        </div>

        {profileContent}
      </div>
      {accountRole === 'cssu' ? <CSSUBottomNav active="" setView={setView} /> : <AdminBottomNav active="" setView={setView} />}
    </div>
  );
};

/* ======================================================== */
/* ADMIN EDIT PROFILE VIEW                                  */
/* ======================================================== */

const AdminUserOutlineIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

const AdminEmailOutlineIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
    <polyline points="22,6 12,13 2,6"></polyline>
  </svg>
);

const AdminSaveCheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
    <polyline points="22 4 12 14.01 9 11.01"></polyline>
  </svg>
);

const AdminEditProfileView = ({ setView, profileData }) => {
  const accountRole = profileData?.accountRole || '';
  const notificationsView = getPortalNotificationsViewForRole(accountRole);
  const isDesktopViewport = useDesktopWorkspaceViewport();
  const position = getPortalPositionLabel(profileData);
  const metaLabel = getPortalMetaLabel(profileData);
  const badgeLabel = getPortalBadgeLabel(accountRole);

  const desktopEditContent = (
    <section className="portal-settings-desktop">
      <div className="portal-settings-desktop-header">
        <div>
          <button type="button" className="portal-settings-back-btn" onClick={() => setView('admin-profile')}>
            <BackArrowIcon color="var(--green)" />
            <span>Back to Profile</span>
          </button>
          <span className="portal-settings-desktop-kicker">Officer Identity</span>
          <h1>Edit Your Profile</h1>
          <p>Update the account details displayed across your administrative workspace.</p>
        </div>
      </div>

      <div className="portal-settings-desktop-grid">
        <aside className="portal-settings-desktop-profile-card">
          <div className="portal-settings-desktop-profile-avatar">
            <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt={profileData?.fullName || 'Profile'} />
          </div>
          <div className="portal-settings-desktop-profile-badge">{badgeLabel}</div>
          <h2>{profileData?.fullName || 'Portal User'}</h2>
          <p>{position}</p>
          <span>{metaLabel}</span>
        </aside>

        <div className="portal-settings-desktop-form-card">
          <div className="portal-settings-desktop-section-title">
            <strong>Profile Details</strong>
            <span>Keep your display name and portal email current for all system records.</span>
          </div>

          <div className="portal-settings-desktop-fields">
            <div className="portal-settings-desktop-field">
              <label>Full Name</label>
              <div className="aedit-input-wrapper portal-settings-input-wrapper">
                <input type="text" defaultValue={profileData?.fullName || ''} />
                <AdminUserOutlineIcon />
              </div>
            </div>

            <div className="portal-settings-desktop-field">
              <label>Academic Email</label>
              <div className="aedit-input-wrapper portal-settings-input-wrapper">
                <input type="email" defaultValue={profileData?.email || ''} />
                <AdminEmailOutlineIcon />
              </div>
            </div>
          </div>

          <div className="portal-settings-desktop-actions">
            <button className="aedit-save-btn portal-settings-save-btn" onClick={() => setView('admin-profile')}>
              SAVE CHANGES
              <AdminSaveCheckIcon />
            </button>
          </div>
        </div>
      </div>
    </section>
  );

  if ((accountRole === 'hrmu' || accountRole === 'cssu') && isDesktopViewport) {
    if (accountRole === 'hrmu') {
      return (
        <HrmuWorkspaceShell activeKey="" setView={setView} profileData={profileData} onLogout={() => setView('admin-profile')}>
          <section className="cssu-desktop-page">{desktopEditContent}</section>
        </HrmuWorkspaceShell>
      );
    }

    return (
      <CSSUDesktopPage activeKey="" setView={setView} profileData={profileData} onLogout={() => setView('admin-profile')} hideHeader>
        {desktopEditContent}
      </CSSUDesktopPage>
    );
  }

  return (
    <div className="admin-dash-wrapper" style={{ background: '#F2F6ED' }}>
      <div className="admin-dash-scroll">

        {/* Header */}
        <div className="admin-header">
          <div className="anotif-header-left">
            <div className="anotif-back" onClick={() => setView('admin-profile')}>
              <BackArrowIcon color="var(--green)" />
            </div>
            <span className="admin-logo-text">EduRoute</span>
          </div>
          <div className="admin-header-right">
            <div className="admin-bell-wrapper" onClick={() => setView(notificationsView)}>
              <AdminBellIcon color="var(--text-dark)" />
              <div className="admin-bell-dot" />
            </div>
            <div className="admin-avatar" style={{ border: '3px solid var(--yellow)' }} onClick={() => setView('admin-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Admin" />
            </div>
          </div>
        </div>

        <div className="aedit-container">
          <div className="aedit-officer-pill">OFFICER IDENTITY</div>
          <h2 className="aedit-title">Edit Your Profile</h2>

          <div className="aedit-photo-section">
            <div className="aedit-photo-wrapper">
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Profile" />
              <button className="aedit-camera-btn">
                <CameraIcon color="white" />
              </button>
            </div>
          </div>

          <div className="aedit-form">
            <div className="aedit-input-group">
              <label>FULL NAME</label>
              <div className="aedit-input-wrapper">
                <input type="text" defaultValue={profileData?.fullName || ''} />
                <AdminUserOutlineIcon />
              </div>
            </div>

            <div className="aedit-input-group">
              <label>ACADEMIC EMAIL</label>
              <div className="aedit-input-wrapper">
                <input type="email" defaultValue={profileData?.email || ''} />
                <AdminEmailOutlineIcon />
              </div>
            </div>

            <button className="aedit-save-btn" onClick={() => setView('admin-profile')}>
              SAVE CHANGES
              <AdminSaveCheckIcon />
            </button>
          </div>
        </div>

      </div>
      <AdminBottomNav active="" setView={setView} />
    </div>
  );
};

export default App;
