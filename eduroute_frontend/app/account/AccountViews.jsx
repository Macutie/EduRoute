import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL } from "../../config";
import { changePassword } from "../../services/authApi";
import { encryptSensitivePayload } from "../../services/authPayloadEncryption";
import { decryptSensitiveResponseJson, getSensitiveResponseHeaders } from "../../services/responseEncryption";
import { AdminBadgeIcon, AdminEmailOutlineIcon, AdminProfileChevronIcon, AdminProfileIdIcon, AdminProfileLogoutIcon, AdminProfilePasswordIcon, AdminRoleIcon, AdminSaveCheckIcon, ApproveCheckIcon, ArrowRightIcon, AtSymbolIcon, BackArrowIcon, BadgeIcon, BatteryIcon, BellRingIcon, BriefcaseIcon, CameraIcon, CapIcon, CheckCircleAdminIcon, CheckCircleIcon, CheckCircleSolidIcon, ChevronDownIcon, ChevronRightIcon, ClipboardCheckIcon, ClipboardClockIcon, ClockIcon, CssuChartIcon, CssuIncidentsNavIcon, CssuMapNavIcon, CssuReportsNavIcon, CssuRoleIcon, CssuRosetteCheckIcon, CssuScanNavIcon, CssuTrendingUpIcon, CssuWarningCircleIcon, CssuWarningTriangleIcon, DashboardNavIcon, DeanNotificationDocIcon, DetailClockIcon, DetailClockReturnIcon, DetailDocIcon, DetailPinIcon, DetailRouteIcon, DocumentIcon, DummySignature, EditPencilIcon, EwanIcon, ExclamationCircleIcon, EyeIcon, EyeOffIcon, FacultyCheckCircleIcon, FacultyChevronRightIcon, FacultyCopyIcon, FacultyCrossCircleIcon, FacultyDocIcon, FacultyFilterIcon, FacultyIdBadgeIcon, FacultyNavIcon, FacultyRoleIcon, FacultyWaitCircleIcon, FileTextIcon, FilledClockIcon, FlashlightIcon, GlobeIcon, GlobeSmIcon, GraduationCapIcon, GridIcon, HeadsetIcon, HelpCircleIcon, HelpIcon, HomeNavIcon, HourglassIcon, HrmuAlertTinyIcon, HrmuChartIcon, HrmuCheckTinyIcon, HrmuExportIcon, HrmuEyeMiniIcon, HrmuFilterIcon, HrmuMapRouteIcon, HrmuMiniCheckIcon, HrmuPinMiniIcon, HrmuReportIcon, HrmuRoleIcon, HrmuSidebarGridIcon, HrmuSyncIcon, HrmuVerificationIcon, HrmuViewRouteIcon, HrmuWarningIcon, IdBadgeIcon, InboxArchiveIcon, InfoIcon, LinkIcon, LocationPinFilledIcon, LocationPinIcon, LockIcon, LockPrivIcon, LockSmallIcon, LoginDoorIcon, LogoutIcon, MailIcon, MapFoldIcon, MapIcon, ModalCloseIcon, NotifPendingIcon, NotificationIcon, PasswordIcon, PermissionsIcon, PersonOutlineIcon, PinIcon, PlayTriangleIcon, PolicyBulbIcon, PolicyCheckIcon, PrivacyIcon, ProfileEditIcon, ProfileNavIcon, ProgressReviewIcon, QuestionCircleIcon, RefreshClockIcon, RefreshIcon, RegistryDownloadIcon, RegistryModalCloseIcon, RegistryModalDoneIcon, RegistryModalIdIcon, RegistryModalVerifiedIcon, RegistryNavIcon, RejectXIcon, RemarksIcon, ReportPrintIcon, RequestsNavIcon, SaveIcon, ScanQRIcon, SendIcon, ShieldCheckIcon, ShieldCheckSmallIcon, ShieldSearchIcon, ShieldSolidIcon, SignalIcon, SignatureNavIcon, SlashedPersonIcon, SlipIcon, StatusGraphIcon, TogaLogoIcon, ToggleSwitch, TrashIcon, UploadIcon, UsersAdminIcon, WifiIcon, XCircleIcon } from "../../components/icons/AppIcons.jsx";
import { LegalDocumentModal } from "../../components/legal/LegalDocuments.jsx";
import { DEFAULT_PROFILE_IMAGE } from "../shared/appUtils.js";
import { getPortalPositionLabel, getPortalMetaLabel, getPortalBadgeLabel } from "../routing/portalRouting.js";
import { registerPushNotificationsForCurrentBrowser, syncPushTokenForGrantedBrowser } from "../shared/pushNotifications.js";
import { BottomNav } from "../faculty/FacultyViews.jsx";
import { DeanBottomNav } from "../dean/DeanViews.jsx";
import { CSSUBottomNav, CSSUDesktopPage, useDesktopWorkspaceViewport } from "../cssu/CssuViews.jsx";
import { HrmuWorkspaceShell } from "../hrmu/HrmuViews.jsx";
import { AdminBottomNav } from "../admin/AdminViews.jsx";
export const ChangePasswordView = ({
  setView,
  profileData,
  backView = 'profile',
  setForgotPasswordBackView
}) => {
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
      noPersonal: newPassword.length > 0 && !personalInfo.some(info => pw.includes(info))
    };
  }, [newPassword]);
  const allPoliciesMet = policy.minLength && policy.symbolsNumbers && policy.noPersonal;
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canUpdatePassword = allPoliciesMet && passwordsMatch && currentPassword.length > 0 && !changePasswordLoading;
  const formatChangePasswordApiMessage = value => {
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
      const data = await changePassword({
        currentPassword,
        newPassword,
        confirmPassword
      });
      alert(formatChangePasswordApiMessage(data.message) || 'Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setView(backView);
    } catch (error) {
      alert(formatChangePasswordApiMessage(error.errors) || formatChangePasswordApiMessage(error.message) || 'Failed to change password.');
    } finally {
      setChangePasswordLoading(false);
    }
  };
  const desktopChangePasswordContent = <section className="portal-settings-desktop">
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
            <div className={`chpw-policy-item ${policy.minLength ? 'met' : 'unmet'}`}>
              <PolicyCheckIcon met={policy.minLength} unmetTone="danger" />
              <span>Minimum 10 characters</span>
            </div>
            <div className={`chpw-policy-item ${policy.symbolsNumbers ? 'met' : 'unmet'}`}>
              <PolicyCheckIcon met={policy.symbolsNumbers} unmetTone="danger" />
              <span>Include symbols & numbers</span>
            </div>
            <div className={`chpw-policy-item ${policy.noPersonal ? 'met' : 'unmet'}`}>
              <PolicyCheckIcon met={policy.noPersonal} unmetTone="danger" />
              <span>No personal information</span>
            </div>
          </div>

          <div className="portal-settings-desktop-fields">
            <div className="portal-settings-desktop-field">
              <label>Current Password</label>
              <div className="chpw-input-wrapper portal-settings-input-wrapper">
                <input type={showCurrentPw ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Enter your current password" />
              
                <button type="button" className="icon-btn chpw-eye-btn" onClick={() => setShowCurrentPw(!showCurrentPw)}>
                  {showCurrentPw ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div className="portal-settings-desktop-field">
              <label>New Password</label>
              <div className="chpw-card-input-wrapper portal-settings-input-wrapper">
                <input type={showNewPw ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Enter complex password" />
              
                <button type="button" className="icon-btn chpw-eye-btn" onClick={() => setShowNewPw(!showNewPw)}>
                  {showNewPw ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div className="portal-settings-desktop-field">
              <label>Confirm Password</label>
              <div className={`chpw-card-input-wrapper portal-settings-input-wrapper ${confirmPassword.length > 0 ? passwordsMatch ? 'match' : 'mismatch' : ''}`}>
                <input type={showConfirmPw ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-type new password" />
              
                <button type="button" className="icon-btn chpw-eye-btn" onClick={() => setShowConfirmPw(!showConfirmPw)}>
                  {showConfirmPw ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {confirmPassword.length > 0 && !passwordsMatch && <span className="chpw-mismatch-text">Passwords do not match</span>}
            </div>
          </div>

          <div className="portal-settings-desktop-actions">
            <button type="button" className={`chpw-update-btn portal-settings-save-btn ${canUpdatePassword ? 'active' : ''}`} disabled={!canUpdatePassword} onClick={handleChangePassword}>
            
              <LinkIcon /> {changePasswordLoading ? 'UPDATING...' : 'UPDATE PASSWORD'}
            </button>
          </div>
        </div>
      </div>
    </section>;
  if ((accountRole === 'hrmu' || accountRole === 'cssu') && isDesktopViewport) {
    if (accountRole === 'hrmu') {
      return <HrmuWorkspaceShell activeKey="" setView={setView} profileData={profileData} onLogout={() => setView(backView)}>
          <section className="cssu-desktop-page">{desktopChangePasswordContent}</section>
        </HrmuWorkspaceShell>;
    }
    return <CSSUDesktopPage activeKey="" setView={setView} profileData={profileData} onLogout={() => setView(backView)} hideHeader>
        {desktopChangePasswordContent}
      </CSSUDesktopPage>;
  }
  return <div className="dashboard-wrapper">
      <div className="content fade-in dash-content chpw-content">

        <div className="slip-top-nav chpw-top-nav">
          <div className="slip-nav-left" onClick={() => setView(backView)}>
            <BackArrowIcon color="var(--green)" />
            <span className="dash-logo-text chpw-nav-title">Account Settings</span>
          </div>
          <div className="dash-avatar">
            <img src={profileData.image} alt="Faculty Profile" style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }} />
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
            <div className={`chpw-policy-item ${policy.minLength ? 'met' : 'unmet'}`}>
              <PolicyCheckIcon met={policy.minLength} unmetTone="danger" />
              <span>Minimum 10 characters</span>
            </div>
            <div className={`chpw-policy-item ${policy.symbolsNumbers ? 'met' : 'unmet'}`}>
              <PolicyCheckIcon met={policy.symbolsNumbers} unmetTone="danger" />
              <span>Include symbols & numbers</span>
            </div>
            <div className={`chpw-policy-item ${policy.noPersonal ? 'met' : 'unmet'}`}>
              <PolicyCheckIcon met={policy.noPersonal} unmetTone="danger" />
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
            <input type={showCurrentPw ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="••••••••••••" />
            
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
              <input type={showNewPw ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Enter complex password" />
              
              <button type="button" className="icon-btn chpw-eye-btn" onClick={() => setShowNewPw(!showNewPw)}>
                {showNewPw ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div className="chpw-new-pw-field">
            <label className="chpw-label">CONFIRM PASSWORD</label>
            <div className={`chpw-card-input-wrapper ${confirmPassword.length > 0 ? passwordsMatch ? 'match' : 'mismatch' : ''}`}>
              <input type={showConfirmPw ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-type new password" />
              
              <button type="button" className="icon-btn chpw-eye-btn" onClick={() => setShowConfirmPw(!showConfirmPw)}>
                {showConfirmPw ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {confirmPassword.length > 0 && !passwordsMatch && <span className="chpw-mismatch-text">Passwords do not match</span>}
          </div>
        </div>

        <button type="button" className={`chpw-update-btn ${canUpdatePassword ? 'active' : ''}`} disabled={!canUpdatePassword} onClick={handleChangePassword}>
          
          <LinkIcon /> {changePasswordLoading ? 'UPDATING...' : 'UPDATE PASSWORD'}
        </button>

        <div className="chpw-lost-access">
          FORGOT CURRENT PASSWORD? <span onClick={() => {
          setForgotPasswordBackView('change-password');
          setView('forgot-password');
        }}>RESET PASSWORD</span>
        </div>

      </div>
      <BottomNav active="profile" setView={setView} />
    </div>;
};
export const NotificationSettingsView = ({
  setView,
  profileData,
  mode = 'faculty',
  backView = 'profile'
}) => {
  const isDeanMode = mode === 'dean';
  const [approvalNotifs, setApprovalNotifs] = useState(false);
  const [reminderAlerts, setReminderAlerts] = useState(true);
  const [systemUpdates, setSystemUpdates] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState('unknown');
  const [notificationSettingsLoading, setNotificationSettingsLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState(null);
  const [pushTestLoading, setPushTestLoading] = useState(false);
  const formatNotificationApiMessage = value => {
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
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`
  });
  useEffect(() => {
    const loadNotificationPreference = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/permissions/me`, {
          headers: notificationAuthHeaders()
        });
        const data = await response.json();
        if (!response.ok) return;
        const status = data.data?.notifications_status || 'unknown';
        setNotificationStatus(status);
        setApprovalNotifs(status === 'granted');
        if (status === 'granted') {
          const {
            getPushNotificationStatus
          } = await import('../../services/notificationApi');
          setPushStatus(await getPushNotificationStatus().catch(() => null));
        }
      } catch (error) {
        console.error('Failed to load notification preference:', error);
      }
    };
    loadNotificationPreference();
  }, []);
  const saveNotificationStatus = async status => {
    const response = await fetch(`${API_BASE_URL}/api/permissions/me`, {
      method: 'PATCH',
      headers: notificationAuthHeaders(),
      body: JSON.stringify(await encryptSensitivePayload({
        notifications_status: status,
        first_login_setup_completed: true
      }))
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
        try {
          const [{
            requestFirebaseMessagingToken
          }, {
            disablePushToken
          }] = await Promise.all([import('../../lib/firebase'), import('../../services/notificationApi')]);
          const currentToken = await requestFirebaseMessagingToken();
          if (currentToken) await disablePushToken(currentToken);
        } catch (disableError) {
          console.error('Failed to disable this device push token:', disableError);
        }
        await saveNotificationStatus('dismissed');
        setPushStatus(current => current ? {
          ...current,
          activeDeviceCount: Math.max(0, Number(current.activeDeviceCount || 0) - 1)
        } : null);
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
      } else if (status === 'granted') {
        try {
          await registerPushNotificationsForCurrentBrowser();
          const {
            getPushNotificationStatus
          } = await import('../../services/notificationApi');
          setPushStatus(await getPushNotificationStatus());
          alert(isDeanMode ? 'Notifications are enabled for this dean panel. You can now receive locator slip alerts even while EduRoute is closed.' : 'Notifications are enabled for this device. EduRoute can now send approval alerts even while the site is closed.');
        } catch (pushError) {
          console.error('Failed to register push token from notification settings:', pushError);
          alert(pushError.message || 'Notifications were allowed, but EduRoute could not register this device yet.');
        }
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setNotificationSettingsLoading(false);
    }
  };
  const handlePushTest = async () => {
    if (pushTestLoading) return;
    setPushTestLoading(true);
    try {
      await syncPushTokenForGrantedBrowser(isDeanMode ? 'college_dean' : 'faculty');
      const {
        getPushNotificationStatus,
        sendPushTestNotification
      } = await import('../../services/notificationApi');
      const status = await getPushNotificationStatus();
      setPushStatus(status);
      if (!status.firebaseConfigured) {
        throw new Error('Firebase Admin is not configured in the backend deployment.');
      }
      if (Number(status.activeDeviceCount || 0) < 1) {
        throw new Error('No active device token is saved for this account yet.');
      }
      const result = await sendPushTestNotification();
      alert(result?.delivery?.delivered > 0 ? 'Test notification sent. Close or minimize EduRoute and check your phone notification tray.' : 'Firebase accepted no device delivery. Re-enable notifications and try again.');
    } catch (error) {
      alert(error.message || 'Unable to send the test notification.');
    } finally {
      setPushTestLoading(false);
    }
  };
  return <div className="dashboard-wrapper">
      <div className="content fade-in dash-content notif-content">

        <div className="slip-top-nav chpw-top-nav">
          <div className="slip-nav-left" onClick={() => setView(backView)}>
            <BackArrowIcon color="var(--green)" />
            <span className="dash-logo-text chpw-nav-title">Account Settings</span>
          </div>
          <div className="dash-avatar">
            <img src={profileData.image} alt="Faculty Profile" style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }} />
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
              {approvalNotifs ? 'Enabled from your first-login setup. You will receive approval and request alerts on this device.' : `Currently ${notificationStatus}. Enable this to receive approval alerts even when EduRoute is closed.`}
            </p>
          </div>
          <ToggleSwitch isOn={approvalNotifs} onToggle={handleApprovalNotificationToggle} />
        </div>

        {approvalNotifs && <div className="notif-push-test-panel">
            <div className="notif-push-test-copy">
              <span>BACKGROUND DELIVERY</span>
              <strong>
                {Number(pushStatus?.activeDeviceCount || 0)} active device{Number(pushStatus?.activeDeviceCount || 0) === 1 ? '' : 's'}
              </strong>
              <p>Send a real system notification to verify alerts while EduRoute is minimized or closed.</p>
            </div>
            <button type="button" onClick={handlePushTest} disabled={pushTestLoading}>
              {pushTestLoading ? 'SENDING...' : 'SEND TEST'}
            </button>
          </div>}

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
        <button type="button" className="notif-save-btn" onClick={() => setView(backView)}>
          <SaveIcon /> SAVE CHANGES
        </button>

      </div>
      {isDeanMode ? <DeanBottomNav setView={setView} onOpenRequests={() => setView('dean-dashboard')} /> : <BottomNav active="profile" setView={setView} />}
    </div>;
};
export const EditProfileView = ({
  setView,
  profileData,
  setProfileData,
  backView = 'profile',
  useDeanNav = false
}) => {
  const [fullName, setFullName] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [departmentsList, setDepartmentsList] = useState([]);
  const [email, setEmail] = useState('');
  const [profileImage, setProfileImage] = useState(profileData.image);
  const [editProfileLoading, setEditProfileLoading] = useState(false);
  const fileInputRef = useRef(null);
  const formatEditProfileApiMessage = value => {
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
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`
  });
  useEffect(() => {
    const loadEditProfileData = async () => {
      setEditProfileLoading(true);
      try {
        const sensitiveResponseHeaders = await getSensitiveResponseHeaders();
        const [profileResponse, departmentsResponse] = await Promise.all([fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            ...editProfileHeaders(),
            ...sensitiveResponseHeaders
          }
        }), fetch(`${API_BASE_URL}/api/departments`)]);
        const profileJson = await decryptSensitiveResponseJson(await profileResponse.json());
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
      const profilePayload = {
        full_name: fullName
      };
      if (departmentId) {
        profilePayload.department_id = Number(departmentId);
      }
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        method: 'PATCH',
        headers: {
          ...editProfileHeaders(),
          ...(await getSensitiveResponseHeaders())
        },
        body: JSON.stringify(await encryptSensitivePayload(profilePayload))
      });
      const data = await decryptSensitiveResponseJson(await response.json());
      if (!response.ok) {
        throw new Error(formatEditProfileApiMessage(data.errors) || formatEditProfileApiMessage(data.message) || 'Failed to update profile.');
      }
      setProfileData(prev => ({
        ...prev,
        fullName: data.data.full_name,
        employeeId: data.data.employee_id || prev.employeeId,
        department: data.data.department_name,
        email: data.data.email,
        image: profileImage,
        accountRole: data.data.account_role || prev.accountRole
      }));
      alert(data.message);
      setView(backView);
    } catch (error) {
      alert(error.message);
    } finally {
      setEditProfileLoading(false);
    }
  };
  const handlePhotoChange = e => {
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
              ...(await getSensitiveResponseHeaders())
            },
            body: formData
          });
          const data = await decryptSensitiveResponseJson(await response.json());
          if (!response.ok) {
            throw new Error(formatEditProfileApiMessage(data.errors) || formatEditProfileApiMessage(data.message) || 'Failed to upload profile picture.');
          }
          const imageUrl = data.data.profile_image_url;
          setProfileImage(imageUrl);
          setProfileData(prev => ({
            ...prev,
            image: imageUrl
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
  return <div className="dashboard-wrapper">
      <div className="content fade-in dash-content editp-content">

        <div className="slip-top-nav chpw-top-nav">
          <div className="slip-nav-left" onClick={() => setView(backView)}>
            <BackArrowIcon color="var(--green)" />
            <span className="dash-logo-text chpw-nav-title">Account Settings</span>
          </div>
          <div className="dash-avatar">
            <img src={profileImage} alt="Faculty Profile" style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }} />
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
            <button type="button" className="editp-camera-btn" onClick={() => fileInputRef.current.click()}>
              
              <CameraIcon />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{
            display: 'none'
          }} onChange={handlePhotoChange} />
            
          </div>
        </div>

        {/* Full Name */}
        <div className="editp-field">
          <label className="editp-label">FULL NAME</label>
          <div className="editp-input-wrapper">
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} />
            
            <PersonOutlineIcon color="var(--text-light)" />
          </div>
        </div>

        {/* Department */}
        <div className="editp-field">
          <label className="editp-label">DEPARTMENT</label>
          <div className="editp-input-wrapper editp-select-wrapper">
            <select value={departmentId} onChange={e => setDepartmentId(e.target.value)}>
              <option value="" disabled>Select Department</option>
              {departmentsList.map(dept => <option key={dept.id} value={dept.id}>
                  {dept.department_name}
                </option>)}
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
            <input type="email" value={email} disabled readOnly />
            
            <MailIcon color="var(--text-light)" />
          </div>
        </div>

        {/* Save Changes Button */}
        <button type="button" className="editp-save-btn" onClick={handleSave} disabled={editProfileLoading || !fullName.trim() || !departmentId}>
          
          {editProfileLoading ? 'SAVING...' : 'SAVE CHANGES'} <CheckCircleIcon />
        </button>

      </div>
      {useDeanNav ? <DeanBottomNav setView={setView} onOpenRequests={() => setView('dean-dashboard')} /> : <BottomNav active="profile" setView={setView} />}
    </div>;
};
export const PrivacySecurityView = ({
  setView,
  profileData,
  mode = 'faculty'
}) => {
  const [locationTracking, setLocationTracking] = useState(false);
  const [locationPermissionLoading, setLocationPermissionLoading] = useState(false);
  const [permissionPrefs, setPermissionPrefs] = useState(null);
  const [activeLegalDoc, setActiveLegalDoc] = useState(null);
  const isDeanMode = mode === 'dean';
  const backView = isDeanMode ? 'dean-profile' : 'profile';
  const formatPrivacyApiMessage = value => {
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
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`
  });
  useEffect(() => {
    const loadPermissionPrefs = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/permissions/me`, {
          headers: privacyAuthHeaders()
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
  const persistLocationPreference = async locationStatus => {
    const response = await fetch(`${API_BASE_URL}/api/permissions/me`, {
      method: 'PATCH',
      headers: privacyAuthHeaders(),
      body: JSON.stringify(await encryptSensitivePayload({
        location_status: locationStatus,
        first_login_setup_completed: true
      }))
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
        const status = await navigator.permissions.query({
          name: 'geolocation'
        });
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
    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(() => resolve('granted'), error => {
        if (error?.code === 1) {
          resolve('denied');
          return;
        }
        if (error?.code === 2 || error?.code === 3) {
          resolve('dismissed');
          return;
        }
        resolve('dismissed');
      }, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      });
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
        body: JSON.stringify(await encryptSensitivePayload({
          notifications_status: notificationStatus,
          first_login_setup_completed: true
        }))
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
        alert(isDeanMode ? 'Notifications are enabled for this dean panel. You can now receive faculty locator slip request alerts even when EduRoute is closed.' : 'Notifications are enabled for this browser.');
      } else if (notificationStatus === 'unsupported') {
        alert('This browser does not support web notifications.');
      } else {
        alert('Notification permission was not enabled. You can try again later.');
      }
    } catch (error) {
      alert(error.message);
    }
  };
  return <div className="dashboard-wrapper">
      <div className="content fade-in dash-content priv-content">

        <div className="slip-top-nav chpw-top-nav">
          <div className="slip-nav-left" onClick={() => setView(backView)}>
            <BackArrowIcon color="var(--green)" />
            <span className="dash-logo-text chpw-nav-title">Account Settings</span>
          </div>
          <div className="dash-avatar">
            <img src={profileData.image} alt="Faculty Profile" style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }} />
          </div>
        </div>

        <div className="chpw-divider-line" />

        <div className="priv-header">
          <h1 className="priv-title">Privacy & Security</h1>
          <p className="priv-subtitle">
            {isDeanMode ? 'Manage notification access for dean locator slip approvals and request alerts.' : 'Manage your digital footprint and data preferences across the EduRoute ecosystem.'}
          </p>
        </div>

        {!isDeanMode && <div className="priv-location-card">
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
          </div>}

        {/* Permissions Card */}
        <div className="priv-permissions-card">
          <PermissionsIcon color="var(--green)" />
          <h3>Permissions</h3>
          <p>
            {isDeanMode ? `Notifications: ${permissionPrefs?.notifications_status || 'unknown'}. Enable alerts so the dean panel can receive locator slip requests even while EduRoute is closed.` : `Notifications: ${permissionPrefs?.notifications_status || 'unknown'}. Location: ${permissionPrefs?.location_status || 'unknown'}. Location and camera/photos are requested only when a feature needs them.`}
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

      <LegalDocumentModal activeLegalDoc={activeLegalDoc} onClose={() => setActiveLegalDoc(null)} />
      
    </div>;
};

/* ======================================================== */
/* ADMIN DASHBOARD VIEW (Strategic Oversight)               */
/* ======================================================== */
