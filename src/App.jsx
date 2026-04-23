import { useState, useMemo, useRef, useEffect } from 'react';
import './App.css';
import { API_BASE_URL } from './config';

const DEFAULT_PROFILE_IMAGE = '/profile_pic.png';

function App() {
  console.log('API_BASE_URL:', API_BASE_URL);
  const [view, setView] = useState('login');
  const [loading, setLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [profileData, setProfileData] = useState({
    fullName: 'Faculty User',
    department: 'Faculty Department',
    email: '',
    image: DEFAULT_PROFILE_IMAGE,
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

        setProfileData((prev) => ({
          ...prev,
          fullName: data.data.full_name || 'Faculty User',
          department: data.data.department_name || 'Faculty Department',
          email: data.data.email || '',
          image: data.data.profile_image_url || DEFAULT_PROFILE_IMAGE,
        }));
      } catch (error) {
        console.error('Failed to sync profile:', error);
      }
    };

    syncProfileFromDatabase();
  }, [view]);

  useEffect(() => {
    const token = localStorage.getItem('token');

    if (!token || view !== 'dashboard') return;

    const loadPermissionSetup = async () => {
      try {
        const data = await fetchPermissionPreferencesApi();
        const preferences = data.data;

        if (!preferences?.first_login_setup_completed) {
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
      setProfileData((prev) => ({
        ...prev,
        fullName: data.data.user?.full_name || 'Faculty User',
        department: data.data.user?.department_name || 'Faculty Department',
        email: data.data.user?.email || '',
        image: data.data.user?.profile_image_url || DEFAULT_PROFILE_IMAGE,
      }));
      alert(formatApiMessage(data.message) || 'Login successful.');
      setView('dashboard');
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('profileImage');
    setShowPermissionSetup(false);
    setPermissionSetupStep('intro');
    setPermissionSetupMessage('');
    setProfileData({
      fullName: 'Faculty User',
      department: 'Faculty Department',
      email: '',
      image: DEFAULT_PROFILE_IMAGE,
    });
    setView('login');
  };

  const finishPermissionSetup = async (notificationsStatus) => {
    setPermissionSetupLoading(true);

    try {
      await updatePermissionPreferencesApi({
        notifications_status: notificationsStatus,
        first_login_setup_completed: true,
      });
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

      if (notificationStatus === 'granted') {
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

  return (
    <div className="mobile-container">
      {isAuthView(view) && (
        <div className="status-bar">
          <span className="time">9:41</span>
          <div className="status-icons">
            <SignalIcon />
            <WifiIcon />
            <BatteryIcon />
          </div>
        </div>
      )}

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
      {view === 'locator-slip' && <LocatorSlipView setView={setView} profileData={profileData} />}
      {view === 'updates' && <UpdatesView setView={setView} profileData={profileData} />}
      {view === 'route-approved' && <RouteApprovedView setView={setView} profileData={profileData} />}
      {view === 'slip-submitted' && <SlipSubmittedView setView={setView} profileData={profileData} />}
      {view === 'map' && <MapTrackingView setView={setView} profileData={profileData} />}
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

      {isAuthView(view) && (
        <div
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

const LOGIN_ROLES = [
  { key: 'faculty', label: 'Faculty', title: 'Gordon College Faculty Portal', icon: FacultyRoleIcon },
  { key: 'hrmu', label: 'HRMU', title: 'Gordon College HRMU Portal', icon: HrmuRoleIcon },
  { key: 'cssu', label: 'CSSU', title: 'Gordon College CSSU Portal', icon: CssuRoleIcon },
  { key: 'admin', label: 'Admin', title: 'Gordon College Admin Portal', icon: AdminRoleIcon },
];

const LoginView = ({ setView, loginForm, setLoginForm, onLogin, loading, showLoginPassword, setShowLoginPassword }) => {
  const [selectedRole, setSelectedRole] = useState('faculty');
  const activeRole = LOGIN_ROLES.find((role) => role.key === selectedRole) || LOGIN_ROLES[0];

  return (
    <div className="content fade-in login-content">
      <div className="logo-container login-logo-container">
        <div className="logo-box login-logo-box">
          <MapIcon />
        </div>
        <h1>EduRoute</h1>
        <h2 className="login-portal-title">{activeRole.title.toUpperCase()}</h2>
      </div>

      <form className="card login-card" onSubmit={(e) => onLogin(e, selectedRole)}>
        <div className="role-selector" aria-label="Select portal role">
          {LOGIN_ROLES.map((role) => {
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
                placeholder="j.smith@gordon.edu"
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
  );
};

const ForgotPasswordView = ({ setView, forgotForm, setForgotForm, onForgotPassword, loading }) => (
  <div className="content fade-in forgot-pw-content">
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
    <div className="content fade-in forgot-pw-content reset-code-content">
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
    <div className="content fade-in forgot-pw-content set-password-content">
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
  );
};

const SignUpView = ({ setView, registerForm, setRegisterForm, departments, onRegister, loading }) => {
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);
  const [activeLegalDoc, setActiveLegalDoc] = useState(null);
  const selectedSignupRole = registerForm.account_role || 'faculty';
  const signupRole = LOGIN_ROLES.find((role) => role.key === selectedSignupRole) || LOGIN_ROLES[0];
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
    <div className="content fade-in signup-content">
      <form className="card signup-card" onSubmit={handleSignupSubmit}>
        <div className="signup-header">
          <h1>Create {signupRole.label}<br />Account</h1>
          <p>Please enter your institutional details to begin.</p>
        </div>

        <div className="signup-role-selector" aria-label="Select account role">
          {LOGIN_ROLES.map((role) => {
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

      <LegalDocumentModal
        activeLegalDoc={activeLegalDoc}
        onClose={() => setActiveLegalDoc(null)}
      />
    </div>
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

  const hour = new Date().getHours();
  const dayPart = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'night';
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
            <GridIcon />
            <span className="dash-logo-text">EduRoute</span>
          </div>
          <div className="dash-avatar" onClick={() => setView('profile')} style={{ cursor: 'pointer' }}>
            <img src={profileData.image} alt="Faculty Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>

        <div className="dash-header">
          <p>Good {dayPart}, Prof. {firstName}</p>
          <h1>Faculty Dashboard</h1>
          <div className="dept-pill">
            <CapIcon color="var(--green)" outline={true} /> {departmentLabel.toUpperCase()}
          </div>
        </div>

        <div className="action-grid">
          <div className="primary-action-card" onClick={() => setView('scan')} style={{ cursor: 'pointer' }}>
            <div className="primary-action-bg-deco">
              <img src="/Translucent Icon.svg" alt="Decoration Layout" />
            </div>
            <div className="primary-icon-wrapper">
              <img src="/QR Icon.svg" alt="Scan QR Icon" />
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

            {recentLocatorSlips.map((slip) => (
              <div key={slip.id} className="activity-card" onClick={() => setView('status')} style={{ cursor: 'pointer' }}>
                <div className={`act-icon-bg ${slip.status === 'approved' ? 'act-green-bg' : 'act-gray-bg'} ${slip.status === 'rejected' ? 'act-red-icon' : ''}`}>
                  {slip.status === 'rejected'
                    ? <SlashedPersonIcon color="#FF4D4D" />
                    : <DocumentIcon color="var(--green)" />}
                </div>
                <div className="act-details">
                  <h4>{getSlipTitle(slip)}</h4>
                  <p>{slip.destination}</p>
                  <span className={`status-badge badge-${slip.status}`}>{slip.status.toUpperCase()}</span>
                </div>
                <span className="act-time">{formatStatusDate(slip.created_at)}</span>
              </div>
            ))}
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
  { key: 'pending', label: 'Pending' },
  { key: 'rejected', label: 'Rejected' },
];

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

const getSlipTitle = (slip) => {
  if (slip.custom_purpose) return slip.custom_purpose;
  if (slip.purpose_of_travel === 'Others') return 'Other Official Travel';
  return slip.purpose_of_travel || 'Locator Slip';
};

const toDateTimeLocalValue = (date) => {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
};

const LocatorSlipView = ({ setView, profileData }) => {
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
      const data = await fetchLocatorSlipJson('/api/locator-slips', {
        method: 'POST',
        body: JSON.stringify(locatorSlipForm),
      });
      alert(data.message);
      setView('updates');
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

        <div className="status-slip-list">
          {statusLoading && <div className="status-empty-card">Loading locator slips...</div>}

          {!statusLoading && locatorSlips.length === 0 && (
            <div className="status-empty-card">
              No {activeFilter === 'all' ? '' : activeFilter} locator slips found.
            </div>
          )}

          {!statusLoading && locatorSlips.map((slip) => (
            <button
              key={slip.id}
              type="button"
              className={`status-slip-card ${slip.status}`}
              onClick={() => {
                setSelectedStatusSlip(slip);
                setView('locator-slip-detail');
              }}
            >
              <div className="status-slip-header">
                <h3>{getSlipTitle(slip)}</h3>
                <span className={`status-badge badge-${slip.status}`}>{slip.status}</span>
              </div>

              <div className="status-slip-meta">
                <div className="status-slip-row">
                  <GlobeSmIcon color="var(--text-gray)" />
                  <span>{slip.destination}</span>
                </div>
                <div className="status-slip-row">
                  <ClockIcon color="var(--text-gray)" />
                  <span>{formatStatusDate(slip.departure_datetime)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
      <BottomNav active="status" setView={setView} />
    </div>
  );
};

const LocatorSlipDetailView = ({ setView, profileData, selectedSlip }) => {
  const [cancelLoading, setCancelLoading] = useState(false);
  const slip = selectedSlip;

  useEffect(() => {
    if (!slip) {
      setView('status');
    }
  }, [slip, setView]);

  if (!slip) return null;

  const isPending = slip.status === 'pending';
  const isApproved = slip.status === 'approved';
  const isRejected = slip.status === 'rejected';
  const title = isPending ? 'Verification in' : (isApproved || isRejected) ? 'Verification' : `${slip.status.charAt(0).toUpperCase()}${slip.status.slice(1)}`;
  const referralId = `FAC-${String(slip.id).slice(0, 8).toUpperCase()}`;

  const cancelRequest = async () => {
    if (!isPending || cancelLoading) return;

    const confirmed = window.confirm('Cancel this pending locator slip request? It will be archived from your active status list.');

    if (!confirmed) return;

    setCancelLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/locator-slips/${slip.id}/cancel`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to cancel locator slip.');
      }

      alert(data.message || 'Locator slip request cancelled successfully.');
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
          <div className={`graphic-circle-dashed ${isRejected ? 'rejected' : ''}`}>
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
            STATUS: {isPending ? 'PENDING APPROVAL' : isApproved ? 'VERIFIED' : slip.status.toUpperCase()}
          </div>
          <h2>
            {title}{' '}
            {isPending && <span className="text-green">Progress</span>}
            {isApproved && <span className="text-green">Approved</span>}
            {isRejected && <span className="text-red">Rejected</span>}
          </h2>
          <p>
            {isPending
              ? 'Your request is being reviewed. The EduRoute administration is currently verifying your faculty credentials.'
              : isApproved
                ? 'Your request has been reviewed and approved. You may now view your route or verify your location.'
                : isRejected
                  ? 'Your request has been reviewed and rejected. You may submit a corrected locator slip request.'
              : `This locator slip request is currently marked as ${slip.status}.`}
          </p>
        </div>

        {(isPending || isApproved || isRejected) && (
          <div className="progress-bar-container">
            <div className={`progress-track ${isApproved ? 'approved' : ''}`}>
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
              <div className={`progress-point ${(isApproved || isRejected) ? 'active' : 'pending'}`}>
                <div className={`point-dot ${(isApproved || isRejected) ? 'green-dot-solid' : 'grey-dot-solid'}`}></div>
                <span className={`point-label ${isApproved ? 'green-label' : ''} ${isRejected ? 'red-label' : ''}`}>
                  {isRejected ? 'INACTIVE' : 'ACTIVE'}
                </span>
              </div>
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
          <button className="cancel-request-btn" onClick={cancelRequest} disabled={cancelLoading}>
            {cancelLoading ? 'CANCELLING...' : 'CANCEL REQUEST'}
          </button>
        )}

        {isApproved && (
          <div className="approved-detail-actions">
            <button type="button" className="approved-view-route-btn" onClick={() => setView('map')}>
              VIEW ROUTE
            </button>
            <button
              type="button"
              className="approved-verify-location-btn"
              onClick={() => {
                setView('scan');
              }}
            >
              VERIFY LOCATION
            </button>
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

        <div className="referral-id">
          REFERRAL ID: {referralId}
        </div>
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

const MapTrackingView = ({ setView, profileData }) => (
  <div className="dashboard-wrapper map-view-wrapper">
    <div className="map-bg-container">
      <img src="/Map view.png" alt="Map Route" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>

    <div className="map-top-nav">
      <div className="nav-left">
        <GridIcon />
        <span className="nav-title">Active Journey</span>
      </div>
      <div className="dash-avatar" onClick={() => setView('profile')} style={{ background: '#E8F5E9', padding: '2px' }}>
        <img src={profileData.image} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
      </div>
    </div>

    <div className="map-marker-container fade-in">
      <div className="map-marker-dot">
        <div className="dot-inner">
          <div className="dot-core"></div>
        </div>
      </div>
      <div className="map-marker-label">YOU ARE HERE</div>
    </div>

    <div className="map-controls fade-in">
      <div className="map-ctrl-btn">
        <PinIcon color="var(--green)" />
      </div>
      <div className="map-ctrl-btn">
        <EwanIcon color="var(--green)" />
      </div>
    </div>

    <div className="tracking-board fade-in">
      <div className="tb-header">
        <div className="tb-header-left">
          <div className="tb-dot"></div>
          <span>TRACKING ACTIVE</span>
        </div>
        <div className="tb-header-right">
          GPS High Accuracy
        </div>
      </div>
      <div className="tb-body">
        <div className="tb-stats-row">
          <div className="tb-stat">
            <label>DURATION</label>
            <div className="tb-val">00:15:42</div>
          </div>
          <div className="tb-stat tb-divider">
            <label>DISTANCE</label>
            <div className="tb-val">1.2<span className="tb-unit">km</span></div>
          </div>
          <div className="tb-stat tb-divider">
            <label>SPEED</label>
            <div className="tb-val">4.8<span className="tb-unit">kph</span></div>
          </div>
        </div>
        <button className="end-trip-btn" onClick={() => setView('dashboard')}>
          <div className="stop-icon"></div>
          End Trip
        </button>
      </div>
    </div>

    <BottomNav active="map" setView={setView} />
  </div>
);

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
            <div className="scanner-corner top-left"></div>
            <div className="scanner-corner top-right"></div>
            <div className="scanner-corner bottom-left"></div>
            <div className="scanner-corner bottom-right"></div>
          </div>
        </div>

        <div className="location-camera-controls">
          <button type="button" className="camera-side-btn">
            <FlashlightIcon color="white" />
          </button>
          <button type="button" className="camera-shutter-btn" aria-label="Capture location photo" />
          <button type="button" className="camera-side-btn">
            <RefreshIcon color="white" />
          </button>
        </div>

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

const ChangePasswordView = ({ setView, profileData }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);

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
      setView('profile');
    } catch (error) {
      alert(error.message);
    } finally {
      setChangePasswordLoading(false);
    }
  };

  return (
    <div className="dashboard-wrapper">
      <div className="content fade-in dash-content chpw-content">

        <div className="slip-top-nav chpw-top-nav">
          <div className="slip-nav-left" onClick={() => setView('profile')}>
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

const EditProfileView = ({ setView, profileData, setProfileData }) => {
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

      setProfileData({
        fullName: data.data.full_name,
        department: data.data.department_name,
        email: data.data.email,
        image: profileImage,
      });
      alert(data.message);
      setView('profile');
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
          <div className="slip-nav-left" onClick={() => setView('profile')}>
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
      <BottomNav active="profile" setView={setView} />
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

const PrivacySecurityView = ({ setView, profileData }) => {
  const [locationTracking, setLocationTracking] = useState(true);
  const [permissionPrefs, setPermissionPrefs] = useState(null);
  const [activeLegalDoc, setActiveLegalDoc] = useState(null);

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
      } catch (error) {
        console.error('Failed to load permission preferences:', error);
      }
    };

    loadPermissionPrefs();
  }, []);

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
        alert('Notifications are enabled for this browser.');
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
          <div className="slip-nav-left" onClick={() => setView('profile')}>
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
          <p className="priv-subtitle">Manage your digital footprint and data preferences across the EduRoute ecosystem.</p>
        </div>

        {/* Location Tracking Card */}
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
          <ToggleSwitch isOn={locationTracking} onToggle={() => setLocationTracking(!locationTracking)} />
        </div>

        {/* Permissions Card */}
        <div className="priv-permissions-card">
          <PermissionsIcon color="var(--green)" />
          <h3>Permissions</h3>
          <p>
            Notifications: {permissionPrefs?.notifications_status || 'unknown'}. Location and camera/photos are requested only when a feature needs them.
          </p>
          <button type="button" className="priv-manage-btn" onClick={updateNotificationPermissionFromSettings}>
            MANAGE
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
      <BottomNav active="profile" setView={setView} />

      <LegalDocumentModal
        activeLegalDoc={activeLegalDoc}
        onClose={() => setActiveLegalDoc(null)}
      />
    </div>
  );
};

export default App;
