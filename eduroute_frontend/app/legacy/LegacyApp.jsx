import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { SearchBox } from '@mapbox/search-js-react';
import { API_BASE_URL, MAPBOX_PUBLIC_TOKEN } from '../../config';
import { useDeanDashboardSummary, useDeanNotifications, useDeanPendingApprovals, useDeanRealtimeNotifications } from '../../hooks/useDeanDashboard';
import { useNotificationSocket } from '../../hooks/useNotificationSocket';
import { useNotifications } from '../../hooks/useNotifications';
import { useHrmuAnalytics } from '../../hooks/useHrmuAnalytics';
import { useHrmuMonthlyReport } from '../../hooks/useHrmuMonthlyReport';
import { approveDeanLocatorSlipRequest, bulkApproveDeanLocatorSlips, getDeanFacultyOverview, getDeanLocatorSlips, getDeanNotifications, getDeanPendingRequestsPage, getDeanRequestInsights, getDeanRegistryPage, getDeanSignatureSettings, markDeanNotificationRead, rejectDeanLocatorSlipRequest, uploadDeanSignatureFile } from '../../services/deanApi';
import { getHrmuDashboardSummary, getHrmuNotifications, getHrmuReportInbox, getHrmuRecentActivity, downloadHrmuReportInboxAttachment } from '../../services/hrmuApi';
import { getCssuDashboardSummary, getCssuActivityTimeline, getCssuFacultyExitHistory, getCssuIncidentsOverview, getCssuLiveExitMonitoring, getCssuNotificationsOverview, getCssuReportsOverview, downloadCssuReportsPdf, sendCssuReportToHrmu, lookupCssuExitCandidate, updateCssuExitStatus } from '../../services/cssuApi';
import { getCssuActiveFaculty, getCssuFacultyActivity, getCssuFacultyLiveDetail } from '../../services/cssuLiveTrackingApi';
import { getHrmuActiveFaculty, getHrmuFacultyActivity, getHrmuFacultyLiveDetail } from '../../services/hrmuLiveTrackingApi';
import { createTripSocketClient, HRMU_LIVE_SOCKET_EVENTS } from '../../services/tripSocket';
import { useHrmuLiveTracking } from '../../hooks/useHrmuLiveTracking';
import { useProofOfCompliance } from '../../hooks/useProofOfCompliance';
import FacultyDetailCard from '../../components/hrmu/FacultyDetailCard';
import FacultyActivityLog from '../../components/hrmu/FacultyActivityLog';
import ProofOfComplianceForm from '../../components/faculty/ProofOfComplianceForm';
import ProofOfCompliancePreview from '../../components/faculty/ProofOfCompliancePreview';
import ProofComplianceList from '../../components/hrmu/ProofComplianceList';
import ProofComplianceDetails from '../../components/hrmu/ProofComplianceDetails';
import { downloadHrmuMonthlyReportPdf, downloadHrmuNotificationMonthlyLogPdf, getHrmuFlaggedTrips, getHrmuVerificationIncidentSummary } from '../../services/hrmuReportsApi';
import { getHrmuProofComplianceDetails, getHrmuProofComplianceList, getFacultyProofOfCompliance, reviewHrmuProofCompliance } from '../../services/proofComplianceApi';
import { getApprovedFacultyLocatorSlips, getFacultyLocatorSlipDetails, getFacultyTripSummary, markFacultyTripArrived, markFacultyTripReturned, resolveFacultyLocatorSlipDestination, saveFacultyManualPin, startFacultyTrip, startFacultyTripReturn } from '../../services/facultyTripApi';
import { getHrmuTripPathHistory, getTripPathHistory } from '../../services/tripPathHistoryApi';
import { clearAuthPayloadPublicKeyCache, encryptAuthPayload, encryptSensitivePayload } from '../../services/authPayloadEncryption';
import { decryptSensitiveResponseJson, getSensitiveResponseHeaders, resetSensitiveResponseKeyPair } from '../../services/responseEncryption';
import { AdminBadgeIcon, AdminBellIcon, AdminEmailOutlineIcon, AdminProfileChevronIcon, AdminProfileEditIcon, AdminProfileIdIcon, AdminProfileLogoutIcon, AdminProfilePasswordIcon, AdminRoleIcon, AdminSaveCheckIcon, AdminUserOutlineIcon, ApproveCheckIcon, ArrowRightIcon, AtSymbolIcon, BackArrowIcon, BadgeIcon, BatteryIcon, BellRingIcon, BriefcaseIcon, CameraIcon, CapIcon, CheckCircleAdminIcon, CheckCircleIcon, CheckCircleSolidIcon, ChevronDownIcon, ChevronRightIcon, ClipboardCheckIcon, ClipboardClockIcon, ClockIcon, CssuChartIcon, CssuExitDoorIcon, CssuIncidentsNavIcon, CssuMapNavIcon, CssuReportsNavIcon, CssuRoleIcon, CssuRosetteCheckIcon, CssuScanNavIcon, CssuTrendingUpIcon, CssuWarningCircleIcon, CssuWarningTriangleIcon, DashboardNavIcon, DeanNotificationDocIcon, DetailClockIcon, DetailClockReturnIcon, DetailDocIcon, DetailPersonIcon, DetailPinIcon, DetailRouteIcon, DocumentIcon, DummySignature, EditPencilIcon, EwanIcon, ExclamationCircleIcon, EyeIcon, EyeOffIcon, FacultyCheckCircleIcon, FacultyChevronRightIcon, FacultyCopyIcon, FacultyCrossCircleIcon, FacultyDocIcon, FacultyFilterIcon, FacultyIdBadgeIcon, FacultyNavIcon, FacultyRoleIcon, FacultySearchIcon, FacultyWaitCircleIcon, FileTextIcon, FilledClockIcon, FlashlightIcon, GlobeIcon, GlobeSmIcon, GraduationCapIcon, GridIcon, HeadsetIcon, HelpCircleIcon, HelpIcon, HomeNavIcon, HourglassIcon, HrmuAlertTinyIcon, HrmuChartIcon, HrmuCheckTinyIcon, HrmuExportIcon, HrmuEyeMiniIcon, HrmuFilterIcon, HrmuMapRouteIcon, HrmuMiniCheckIcon, HrmuPinMiniIcon, HrmuReportIcon, HrmuRoleIcon, HrmuSidebarGridIcon, HrmuSyncIcon, HrmuVerificationIcon, HrmuViewRouteIcon, HrmuWarningIcon, IdBadgeIcon, InboxArchiveIcon, InfoIcon, LinkIcon, LocationPinFilledIcon, LocationPinIcon, LockIcon, LockPrivIcon, LockSmallIcon, LoginDoorIcon, LogoutIcon, MailIcon, MapFoldIcon, MapIcon, ModalCloseIcon, NotifPendingIcon, NotifSlipIcon, NotificationIcon, PasswordIcon, PermissionsIcon, PersonOutlineIcon, PinIcon, PlayTriangleIcon, PolicyBulbIcon, PolicyCheckIcon, PrivacyIcon, ProfileEditIcon, ProfileNavIcon, ProgressReviewIcon, QuestionCircleIcon, RefreshClockIcon, RefreshIcon, RegistryDownloadIcon, RegistryEyeIcon, RegistryModalCloseIcon, RegistryModalDoneIcon, RegistryModalIdIcon, RegistryModalVerifiedIcon, RegistryNavIcon, RejectXIcon, RemarksIcon, ReportPrintIcon, RequestsNavIcon, SaveIcon, ScanQRIcon, SendIcon, ShieldCheckIcon, ShieldCheckSmallIcon, ShieldSearchIcon, ShieldSolidIcon, SignalIcon, SignatureNavIcon, SlashedPersonIcon, SlipIcon, StatusGraphIcon, TogaLogoIcon, ToggleSwitch, TrashIcon, UploadIcon, UsersAdminIcon, WifiIcon, XCircleIcon } from "../../components/icons/AppIcons.jsx";
import { LEGAL_DOCUMENTS, LegalDocumentModal, getPermissionSetupStorageKey } from "../../components/legal/LegalDocuments.jsx";
import { DEFAULT_PROFILE_IMAGE, GORDON_COLLEGE_EMAIL_DOMAIN, isEmailIdentifier, isGordonCollegeEmail, triggerBlobDownload } from "../shared/appUtils.js";
import { APP_VIEWS, decodeJwtPayload, getDefaultViewForRole, getEduRouteDialogContent, getHashForView, getPortalAdministrationDescription, getPortalBadgeLabel, getPortalHomeViewForRole, getPortalMetaLabel, getPortalNotificationsViewForRole, getPortalPositionLabel, getViewFromUrlHash, isCollegeDeanDepartment, isDeanPortalAccount, supportsPortalPushNotifications } from "../routing/portalRouting.js";
import { TripPathHistoryModal, formatPathHistoryDateTime } from "../../components/trips/TripPathHistoryModal.jsx";
import { AUTH_ACCOUNT_ROLES, DesktopAuthShell, ForgotPasswordView, LOGIN_PORTAL_ROLES, LoginView, ResetCodeView, SetNewPasswordView, SignUpView } from "../auth/AuthViews.jsx";
import { formatNotificationRelativeTime, getNotificationGroupLabel } from "../shared/dateDisplay.js";
import { DEAN_DEPARTMENT_ABBREVIATIONS, DeanBottomNav, DeanDashboardView, DeanFacultyView, DeanNotificationsView, DeanProfileView, DeanRegistryView, DeanRequestDetailView, DeanRequestsModal, DeanRequestsView, DeanSignatureView, buildLocatorSlipReference, getDeanBadgeLabel, getDeanRoleLabel } from "../dean/DeanViews.jsx";
import { ApprovedLocatorSlipSelectionView, BottomNav, DEPT_NAMES, DashboardView, LOCATOR_PURPOSE_OPTIONS, LOCATOR_SLIP_CANCEL_REASONS, LocatorSlipDetailView, LocatorSlipView, MapTrackingView, ProfileView, RouteApprovedView, STATUS_FILTERS, ScanView, SlipSubmittedView, StatusView, TRAVEL_PURPOSE_TYPES, UpdatesView, formatActivityFiledTime, formatDistanceLabel, formatStatusDate, formatStatusDateTime, formatTripDurationLabel, getCancellationReasonLabel, getCssuValidationStatus, getLocatorSlipActionState, getSlipDisplayStatus, getSlipTitle, toDateTimeLocalValue } from "../faculty/FacultyViews.jsx";
import { DEFAULT_HRMU_MAP_CENTER, HrmuAnalyticsReportsView, HrmuDashboardView, HrmuLiveMapPanel, HrmuLiveTrackingView, HrmuNotificationsRealtimeView, HrmuNotificationsView, HrmuReportInboxView, HrmuReportsView, HrmuVerificationView, HrmuWorkspaceShell, OLONGAPO_CENTER, REPORT_SEQUENCE_MONTHS, mergeHrmuLiveFacultyRow } from "../hrmu/HrmuViews.jsx";
import { CSSUBottomNav, CSSUDashboardDesktopView, CSSUDashboardDesktopViewLegacy, CSSUDashboardView, CSSUDesktopPage, CSSUIncidentsView, CSSUMapView, CSSUNotificationsView, CSSUReportsView, CSSUScanView, CSSUScanViewLegacy, CssuWorkspaceShell, getCssuDutyManagerLabel, getDesktopWorkspaceViewport, useDesktopWorkspaceViewport } from "../cssu/CssuViews.jsx";
import { AdminApprovalDetailView, AdminApprovalRequestsView, AdminBottomNav, AdminDashboardView, AdminEditProfileView, AdminFacultyView, AdminNotificationsView, AdminProfileView, AdminRegistryView, FacultyProfileModal, RegistryDetailsModal } from "../admin/AdminViews.jsx";
import { registerPushNotificationsForCurrentBrowser, syncPushTokenForGrantedBrowser } from "../shared/pushNotifications.js";
import { ChangePasswordView, EditProfileView, NotificationSettingsView, PrivacySecurityView } from "../account/AccountViews.jsx";
import { EduRouteNoticeModal, PermissionSetupModal } from "../../components/common/SystemModals.jsx";
import { FacultyNotificationsView } from "../faculty/FacultyNotificationsView.jsx";
function App() {
  console.log('API_BASE_URL:', API_BASE_URL);
  const [view, setView] = useState(() => {
    const routedView = getViewFromUrlHash();
    if (routedView) return routedView;
    const token = localStorage.getItem('token');
    const savedView = localStorage.getItem('edurouteLastView');
    const tokenRole = decodeJwtPayload(token || '')?.role || '';
    return token ? savedView || getDefaultViewForRole(tokenRole) : 'login';
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
    accountRole: ''
  });
  const [loginForm, setLoginForm] = useState({
    email_or_employee_id: '',
    password: ''
  });
  const [forgotForm, setForgotForm] = useState({
    email: ''
  });
  useEffect(() => {
    if (view === 'cssu-incidents') {
      setView('cssu-dashboard');
    }
  }, [view]);
  const [forgotPasswordBackView, setForgotPasswordBackView] = useState('login');
  const [resetCode, setResetCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [selectedStatusSlip, setSelectedStatusSlip] = useState(null);
  const [logoutModalPortal, setLogoutModalPortal] = useState(null);
  const [appDialog, setAppDialog] = useState(null);
  const [selectedDeanRequest, setSelectedDeanRequest] = useState(null);
  const [selectedAdminRequest, setSelectedAdminRequest] = useState(null);
  const [newPasswordForm, setNewPasswordForm] = useState({
    password: '',
    confirm_password: ''
  });
  const [registerForm, setRegisterForm] = useState({
    account_role: 'faculty',
    full_name: '',
    employee_id: '',
    department_id: '',
    email: '',
    password: '',
    confirm_password: '',
    terms_accepted: false,
    privacy_accepted: false
  });
  const [showPermissionSetup, setShowPermissionSetup] = useState(false);
  const [permissionSetupStep, setPermissionSetupStep] = useState('intro');
  const [permissionSetupMessage, setPermissionSetupMessage] = useState('');
  const [permissionSetupLoading, setPermissionSetupLoading] = useState(false);
  const permissionSetupSeenRef = useRef(false);
  const syncingViewFromHashRef = useRef(false);
  const initializedUrlSyncRef = useRef(false);
  useEffect(() => {
    const nativeAlert = window.alert;
    window.alert = message => {
      const text = String(message ?? '');
      const isError = /failed|unable|error|denied|blocked|required|invalid|missing|not available|not support/i.test(text);
      const isSuccess = /success|approved|updated|sent|saved|completed|allowed|enabled|verified/i.test(text);
      const isLocatorSlipApproved = /locator slip/i.test(text) && /approved/i.test(text);
      const isLocatorSlipRejected = /locator slip/i.test(text) && /rejected/i.test(text);
      const isLocatorSlipSubmitted = /locator slip/i.test(text) && /submitted/i.test(text);
      setAppDialog(getEduRouteDialogContent({
        message: text,
        tone: isError ? 'error' : isSuccess ? 'success' : 'info',
        title: isError ? 'Action needed' : isLocatorSlipApproved ? 'Locator Slip Approved' : isLocatorSlipRejected ? 'Locator Slip Rejected' : isLocatorSlipSubmitted ? 'Locator Slip Submitted' : isSuccess ? 'Success' : 'EduRoute notice'
      }));
    };
    return () => {
      window.alert = nativeAlert;
    };
  }, []);
  const isAuthView = v => ['login', 'forgot-password', 'reset-code', 'set-new-password', 'signup'].includes(v);
  const formatApiMessage = value => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(formatApiMessage).filter(Boolean).join('\n');
    if (typeof value === 'object') {
      return Object.values(value).map(formatApiMessage).filter(Boolean).join('\n');
    }
    return String(value);
  };
  useEffect(() => {
    const syncViewFromHash = () => {
      const routedView = getViewFromUrlHash();
      if (!routedView || routedView === view) return;
      syncingViewFromHashRef.current = true;
      setView(routedView);
    };
    window.addEventListener('hashchange', syncViewFromHash);
    return () => window.removeEventListener('hashchange', syncViewFromHash);
  }, [view]);
  useEffect(() => {
    const targetHash = getHashForView(view);
    const currentHash = window.location.hash || '';
    if (syncingViewFromHashRef.current) {
      syncingViewFromHashRef.current = false;
      initializedUrlSyncRef.current = true;
      return;
    }
    if (!initializedUrlSyncRef.current) {
      initializedUrlSyncRef.current = true;
      if (currentHash !== targetHash) {
        const nextUrl = `${window.location.pathname}${window.location.search}${targetHash}`;
        window.history.replaceState(null, '', nextUrl);
      }
      return;
    }
    if (currentHash !== targetHash) {
      if (!targetHash) {
        window.history.pushState(null, '', `${window.location.pathname}${window.location.search}`);
      } else {
        window.location.hash = targetHash;
      }
    }
  }, [view]);
  useEffect(() => {
    if (!isDeanPortalAccount(profileData)) return;
    const legacyDeanViewMap = {
      'admin-dashboard': 'dean-dashboard',
      'admin-notifications': 'dean-notifications',
      'admin-approval-requests': 'dean-requests',
      'admin-approval-detail': 'dean-request-detail',
      'admin-registry': 'dean-registry',
      'admin-faculty': 'dean-faculty',
      'admin-profile': 'dean-profile',
      'admin-change-password': 'dean-change-password',
      'admin-edit-profile': 'dean-edit-profile'
    };
    const nextView = legacyDeanViewMap[view];
    if (nextView && nextView !== view) {
      setView(nextView);
    }
  }, [profileData, setView, view]);
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
  const registerApi = async payload => apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(await encryptAuthPayload(payload))
  });
  const loginApi = async payload => apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(await encryptAuthPayload(payload))
  });
  const forgotPasswordApi = async payload => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      return await apiRequest('/api/auth/forgot-password', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify(await encryptAuthPayload(payload))
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('Password recovery is taking too long. Please try again in a moment or contact the IT Support Desk.');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  };
  const verifyResetCodeApi = async payload => apiRequest('/api/auth/verify-reset-code', {
    method: 'POST',
    body: JSON.stringify(await encryptAuthPayload(payload))
  });
  const resetPasswordApi = async payload => apiRequest('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(await encryptAuthPayload(payload))
  });
  const isEncryptedPayloadDecryptError = error => /encrypted payload could not be decrypted|payload could not be decrypted|decryption failed/i.test(String(error?.message || error || ''));
  const forgotPasswordApiWithKeyRetry = async payload => {
    try {
      return await forgotPasswordApi(payload);
    } catch (error) {
      if (!isEncryptedPayloadDecryptError(error)) {
        throw error;
      }

      clearAuthPayloadPublicKeyCache();
      return forgotPasswordApi(payload);
    }
  };
  const permissionApiHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`
  });
  const fetchPermissionPreferencesApi = () => apiRequest('/api/permissions/me', {
    headers: permissionApiHeaders()
  });
  const updatePermissionPreferencesApi = async payload => apiRequest('/api/permissions/me', {
    method: 'PATCH',
    headers: permissionApiHeaders(),
    body: JSON.stringify(await encryptSensitivePayload(payload))
  });
  const markPermissionSetupSeen = () => {
    permissionSetupSeenRef.current = true;
    localStorage.setItem(getPermissionSetupStorageKey(), '1');
  };
  const clearPermissionSetupSeen = () => {
    permissionSetupSeenRef.current = false;
    localStorage.removeItem(getPermissionSetupStorageKey());
  };
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
            ...(await getSensitiveResponseHeaders())
          }
        });
        const data = await decryptSensitiveResponseJson(await response.json());
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
    const token = localStorage.getItem('token');
    const detailSlipId = localStorage.getItem('edurouteDetailSlipId');
    const savedView = localStorage.getItem('edurouteLastView');
    const shouldRestoreDetailSlip = savedView === 'locator-slip-detail' || view === 'locator-slip-detail';
    if (!token || !detailSlipId || !shouldRestoreDetailSlip || selectedStatusSlip?.id === detailSlipId) return;

    const restoreDetailSlip = async () => {
      try {
        const slip = await getFacultyLocatorSlipDetails(detailSlipId);
        setSelectedStatusSlip(slip);
        setView('locator-slip-detail');
      } catch (error) {
        console.error('Failed to restore locator slip detail:', error);
        localStorage.removeItem('edurouteDetailSlipId');
        if (view === 'locator-slip-detail') {
          setView('status');
        }
      }
    };

    restoreDetailSlip();
  }, [selectedStatusSlip, view]);
  useEffect(() => {
    const token = localStorage.getItem('token');
    const deanRequestId = localStorage.getItem('edurouteDeanRequestId');
    const savedView = localStorage.getItem('edurouteLastView');
    const shouldRestoreDeanRequest = savedView === 'dean-request-detail' || view === 'dean-request-detail';
    if (!token || !deanRequestId || !shouldRestoreDeanRequest || selectedDeanRequest?.locatorSlipId === deanRequestId) return;

    const restoreDeanRequest = async () => {
      try {
        const request = await getDeanRequestInsights(deanRequestId);
        setSelectedDeanRequest({
          ...request,
          backView: 'dean-requests'
        });
        setView('dean-request-detail');
      } catch (error) {
        console.error('Failed to restore dean request detail:', error);
        localStorage.removeItem('edurouteDeanRequestId');
        if (view === 'dean-request-detail') {
          setView('dean-requests');
        }
      }
    };

    restoreDeanRequest();
  }, [selectedDeanRequest, view]);
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
        const fetchEncryptedProfile = async () => {
          const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
            headers: {
              Authorization: `Bearer ${token}`,
              ...(await getSensitiveResponseHeaders())
            }
          });
          return {
            response,
            json: await response.json()
          };
        };

        let {
          response,
          json
        } = await fetchEncryptedProfile();
        let data;

        try {
          data = await decryptSensitiveResponseJson(json);
        } catch (decryptError) {
          if (!json?.data?.encryptedResponse) throw decryptError;

          resetSensitiveResponseKeyPair();
          ({
            response,
            json
          } = await fetchEncryptedProfile());
          data = await decryptSensitiveResponseJson(json);
        }

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
        setProfileData(prev => ({
          ...prev,
          fullName: data.data.full_name || 'Faculty User',
          employeeId: data.data.employee_id || '',
          department: data.data.department_name || 'Faculty Department',
          position: data.data.position || data.data.department_position || data.data.job_title || '',
          email: data.data.email || '',
          image: data.data.profile_image_url || DEFAULT_PROFILE_IMAGE,
          accountRole: databaseRole
        }));
        const isDeanLikeAdmin = ['assistant_dean', 'college_dean'].includes(databaseRole) || databaseRole === 'admin' && isCollegeDeanDepartment(data.data.department_name);
        if (isDeanLikeAdmin && ['dashboard', 'admin-dashboard', 'profile', 'admin-profile'].includes(view)) {
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
    const alreadyHandled = localStorage.getItem(getPermissionSetupStorageKey()) === '1';
    if (!token) return;
    if (permissionSetupSeenRef.current || alreadyHandled) {
      permissionSetupSeenRef.current = true;
      setShowPermissionSetup(false);
      return;
    }
    const role = String(profileData?.accountRole || '').toLowerCase();
    const currentView = String(view || '').toLowerCase();
    const isFacultyLanding = role === 'faculty' && currentView === 'dashboard';
    const isDeanLanding = (['assistant_dean', 'college_dean'].includes(role) || role === 'admin' && isCollegeDeanDepartment(profileData?.department)) && currentView === 'dean-dashboard';
    if (!isFacultyLanding && !isDeanLanding) return;
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
          markPermissionSetupSeen();
          setShowPermissionSetup(false);
        }
      } catch (error) {
        console.error('Failed to load permission setup:', error);
      }
    };
    loadPermissionSetup();
  }, [view, profileData?.accountRole, profileData?.department]);
  useEffect(() => {
    const token = localStorage.getItem('token');
    const accountRole = String(profileData?.accountRole || '').toLowerCase();
    let isCancelled = false;
    const syncExistingPushPermission = async () => {
      if (!token) return;

      try {
        await syncPushTokenForGrantedBrowser({
          accountRole,
          department: profileData?.department || ''
        });
      } catch (error) {
        if (!isCancelled) {
          console.error('Failed to sync push notifications for current browser:', error);
        }
      }
    };
    syncExistingPushPermission();
    return () => {
      isCancelled = true;
    };
  }, [profileData?.accountRole, profileData?.department]);
  const handleRegister = async e => {
    e.preventDefault();
    const email = registerForm.email.trim();
    if (!isGordonCollegeEmail(email)) {
      setAppDialog({
        title: 'Institutional Email Required',
        message: 'Please use your official @gordoncollege.edu.ph email address to create an EduRoute account.',
        tone: 'error'
      });
      return;
    }
    setLoading(true);
    try {
      const data = await registerApi({
        ...registerForm,
        email,
        department_id: ['faculty', 'admin'].includes(registerForm.account_role) ? Number(registerForm.department_id) : null
      });
      alert(formatApiMessage(data.message) || 'Registration successful.');
      setView('login');
    } catch (error) {
      const message = String(error.message || '');
      if (message.toLowerCase().includes('invalid credentials')) {
        setAppDialog({
          title: 'Wrong password',
          message: 'The password or account detail you entered does not match our records. Please check your credentials and try again, or use Forgot Password if you need to reset it.',
          tone: 'error'
        });
      } else {
        setAppDialog({
          title: 'Action needed',
          message: message || 'EduRoute could not complete the login request. Please try again.',
          tone: 'error'
        });
      }
    } finally {
      setLoading(false);
    }
  };
  const handleLogin = async (e, portalRole = 'faculty') => {
    e.preventDefault();
    const identifier = loginForm.email_or_employee_id.trim();
    if (isEmailIdentifier(identifier) && !isGordonCollegeEmail(identifier)) {
      setAppDialog({
        title: 'Institutional Email Required',
        message: 'Only @gordoncollege.edu.ph email addresses are accepted for EduRoute login. You may also use your employee ID if your account supports it.',
        tone: 'error'
      });
      return;
    }
    setLoading(true);
    try {
      const data = await loginApi({
        ...loginForm,
        email_or_employee_id: identifier,
        portal_role: portalRole
      });
      localStorage.setItem('token', data.data.token);
      localStorage.removeItem('edurouteLastView');
      permissionSetupSeenRef.current = false;
      const accountRole = data.data.user?.account_role || decodeJwtPayload(data.data.token)?.role || portalRole;
      setProfileData(prev => ({
        ...prev,
        accountRole
      }));
      if (supportsPortalPushNotifications(accountRole || portalRole, '')) {
        syncPushTokenForGrantedBrowser({
          accountRole: accountRole || portalRole,
          department: ''
        })
          .catch((pushError) => {
            console.error('Failed to register device push token after login:', pushError);
          });
      }
      setAppDialog({
        message: 'Welcome to EduRoute!',
        tone: 'success',
        title: 'Login Successful'
      });
      setView(getDefaultViewForRole(accountRole || portalRole));
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };
  const resetAuthFlowState = () => {
    setLoginForm({
      email_or_employee_id: '',
      password: ''
    });
    setForgotForm({
      email: ''
    });
    setForgotPasswordBackView('login');
    setResetCode('');
    setResetToken('');
    setResendCooldown(0);
    setNewPasswordForm({
      password: '',
      confirm_password: ''
    });
    setLoading(false);
    setShowLoginPassword(false);
  };
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('profileImage');
    localStorage.removeItem('edurouteLastView');
    localStorage.removeItem('edurouteVerifySlipId');
    localStorage.removeItem('edurouteMapSlipId');
    localStorage.removeItem('edurouteDetailSlipId');
    localStorage.removeItem('edurouteDeanRequestId');
    resetAuthFlowState();
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
      accountRole: ''
    });
    setView('login');
  };
  const getLogoutPortalLabel = portalKey => {
    if (portalKey === 'cssu') return 'EduRoute CSSU Portal';
    if (portalKey === 'hrmu') return 'EduRoute HRMU Portal';
    if (portalKey === 'dean') return 'EduRoute Dean Portal';
    return 'EduRoute Portal';
  };
  const requestPortalLogout = portalKey => {
    setLogoutModalPortal(portalKey);
  };
  const finishPermissionSetup = async notificationsStatus => {
    setPermissionSetupLoading(true);
    markPermissionSetupSeen();
    try {
      await updatePermissionPreferencesApi({
        notifications_status: notificationsStatus,
        first_login_setup_completed: true
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
    markPermissionSetupSeen();
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
        first_login_setup_completed: true
      });
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
      clearPermissionSetupSeen();
      alert(error.message);
    } finally {
      setPermissionSetupLoading(false);
    }
  };
  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setTimeout(() => {
      setResendCooldown(seconds => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);
  const sendForgotPasswordCode = async ({
    goToCode = false
  } = {}) => {
    setLoading(true);
    try {
      const email = forgotForm.email.trim();
      const data = await forgotPasswordApiWithKeyRetry({
        email
      });
      alert(formatApiMessage(data.message) || 'Reset code sent.');
      setForgotForm(prev => ({
        ...prev,
        email
      }));
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
  const handleForgotPassword = async e => {
    e.preventDefault();
    await sendForgotPasswordCode({
      goToCode: true
    });
  };
  const handleResendResetCode = async () => {
    if (resendCooldown > 0 || loading) return;
    await sendForgotPasswordCode();
  };
  const handleVerifyResetCode = e => {
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
          reset_code: resetCode.trim()
        });
        setResetToken(data.data?.token || data.data?.reset_token || data.reset_token || data.token || '');
        alert(formatApiMessage(data.message) || 'Reset code verified.');
        setNewPasswordForm({
          password: '',
          confirm_password: ''
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
  const handleResetPassword = async e => {
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
        new_password_confirmation: newPasswordForm.confirm_password
      });
      alert(formatApiMessage(data.message) || 'Password updated successfully.');
      setResetCode('');
      setResetToken('');
      setNewPasswordForm({
        password: '',
        confirm_password: ''
      });
      setView('login');
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };
  const desktopWorkspaceViews = ['hrmu-dashboard', 'hrmu-verification', 'hrmu-analytics', 'hrmu-reports', 'hrmu-live', 'hrmu-notifications', 'hrmu-inbox', 'admin-profile', 'admin-edit-profile', 'admin-change-password', 'cssu-dashboard', 'cssu-map', 'cssu-incidents', 'cssu-scan', 'cssu-reports', 'cssu-notifications'];
  return <div className={`mobile-container ${isAuthView(view) ? 'login-shell' : ''} ${desktopWorkspaceViews.includes(view) ? 'workspace-shell' : ''}`}>
      {view === 'login' && <LoginView setView={setView} loginForm={loginForm} setLoginForm={setLoginForm} setForgotPasswordBackView={setForgotPasswordBackView} onLogin={handleLogin} loading={loading} showLoginPassword={showLoginPassword} setShowLoginPassword={setShowLoginPassword} />}

      {view === 'forgot-password' && <ForgotPasswordView setView={setView} forgotForm={forgotForm} setForgotForm={setForgotForm} onForgotPassword={handleForgotPassword} loading={loading} backView={forgotPasswordBackView} />}

      {view === 'reset-code' && <ResetCodeView setView={setView} resetCode={resetCode} setResetCode={setResetCode} onVerifyResetCode={handleVerifyResetCode} onResendResetCode={handleResendResetCode} resendCooldown={resendCooldown} loading={loading} />}

      {view === 'set-new-password' && <SetNewPasswordView newPasswordForm={newPasswordForm} setNewPasswordForm={setNewPasswordForm} onResetPassword={handleResetPassword} loading={loading} />}

      {view === 'signup' && <SignUpView setView={setView} registerForm={registerForm} setRegisterForm={setRegisterForm} departments={departments} onRegister={handleRegister} loading={loading} />}

      {view === 'dashboard' && <DashboardView setView={setView} profileData={profileData} />}
      {view === 'scan' && <ScanView setView={setView} profileData={profileData} selectedSlip={selectedStatusSlip} />}
      {view === 'status' && <StatusView setView={setView} profileData={profileData} setSelectedStatusSlip={setSelectedStatusSlip} />}
      {view === 'locator-slip-detail' && <LocatorSlipDetailView setView={setView} profileData={profileData} selectedSlip={selectedStatusSlip} />}
      {view === 'locator-slip' && <LocatorSlipView setView={setView} profileData={profileData} setSelectedStatusSlip={setSelectedStatusSlip} />}
      {view === 'updates' && <UpdatesView setView={setView} profileData={profileData} />}
      {view === 'route-approved' && <RouteApprovedView setView={setView} profileData={profileData} />}
      {view === 'slip-submitted' && <SlipSubmittedView setView={setView} profileData={profileData} />}
      {view === 'map-slip-selection' && <ApprovedLocatorSlipSelectionView setView={setView} profileData={profileData} setSelectedSlip={setSelectedStatusSlip} />}
      {view === 'map' && <MapTrackingView setView={setView} profileData={profileData} selectedSlip={selectedStatusSlip} setSelectedSlip={setSelectedStatusSlip} />}
      {view === 'profile' && <ProfileView setView={setView} profileData={profileData} onLogout={handleLogout} />}
      {view === 'change-password' && <ChangePasswordView setView={setView} profileData={profileData} setForgotPasswordBackView={setForgotPasswordBackView} />}
      {view === 'notifications' && <FacultyNotificationsView setView={setView} profileData={profileData} setSelectedStatusSlip={setSelectedStatusSlip} />}
      {view === 'notification-settings' && <NotificationSettingsView setView={setView} profileData={profileData} />}
      {view === 'dean-notification-settings' && <NotificationSettingsView setView={setView} profileData={profileData} mode="dean" backView="dean-profile" />}
      {view === 'edit-profile' && <EditProfileView setView={setView} profileData={profileData} setProfileData={setProfileData} />}
      {view === 'privacy-security' && <PrivacySecurityView setView={setView} profileData={profileData} />}
      {view === 'dean-privacy-security' && <PrivacySecurityView setView={setView} profileData={profileData} mode="dean" />}
      {view === 'dean-dashboard' && <DeanDashboardView setView={setView} profileData={profileData} />}
      {view === 'dean-notifications' && <DeanNotificationsView setView={setView} profileData={profileData} setSelectedDeanRequest={setSelectedDeanRequest} />}
      {view === 'dean-requests' && <DeanRequestsView setView={setView} profileData={profileData} setSelectedDeanRequest={setSelectedDeanRequest} />}
      {view === 'dean-request-detail' && <DeanRequestDetailView setView={setView} profileData={profileData} request={selectedDeanRequest} />}
      {view === 'dean-profile' && <DeanProfileView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('dean')} />}
      {view === 'dean-faculty' && <DeanFacultyView setView={setView} profileData={profileData} />}
      {view === 'dean-signature' && <DeanSignatureView setView={setView} profileData={profileData} />}
      {view === 'dean-registry' && <DeanRegistryView setView={setView} profileData={profileData} setSelectedDeanRequest={setSelectedDeanRequest} />}
      {view === 'dean-change-password' && <ChangePasswordView setView={setView} profileData={profileData} backView="dean-profile" setForgotPasswordBackView={setForgotPasswordBackView} />}
      {view === 'dean-edit-profile' && <EditProfileView setView={setView} profileData={profileData} setProfileData={setProfileData} backView="dean-profile" useDeanNav />}
      {view === 'hrmu-dashboard' && <HrmuDashboardView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('hrmu')} />}
      {view === 'hrmu-verification' && <HrmuVerificationView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('hrmu')} />}
      {view === 'hrmu-analytics' && <HrmuAnalyticsReportsView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('hrmu')} activeKey="analytics" />}
      {view === 'hrmu-reports' && <HrmuReportsView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('hrmu')} />}
      {view === 'hrmu-live' && <HrmuLiveTrackingView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('hrmu')} />}
      {view === 'hrmu-notifications' && <HrmuNotificationsRealtimeView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('hrmu')} />}
      {view === 'hrmu-inbox' && <HrmuReportInboxView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('hrmu')} />}
      {view === 'admin-dashboard' && <AdminDashboardView setView={setView} profileData={profileData} />}
      {view === 'cssu-dashboard' && <CSSUDashboardView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('cssu')} />}
      {view === 'cssu-map' && <CSSUMapView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('cssu')} />}
      {view === 'cssu-scan' && <CSSUScanView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('cssu')} />}
      {view === 'cssu-reports' && <CSSUReportsView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('cssu')} />}
      {view === 'cssu-notifications' && <CSSUNotificationsView setView={setView} profileData={profileData} onLogout={() => requestPortalLogout('cssu')} />}
      {view === 'admin-notifications' && <AdminNotificationsView setView={setView} profileData={profileData} />}
      {view === 'admin-approval-requests' && <AdminApprovalRequestsView setView={setView} profileData={profileData} setSelectedAdminRequest={setSelectedAdminRequest} />}
      {view === 'admin-approval-detail' && <AdminApprovalDetailView setView={setView} profileData={profileData} request={selectedAdminRequest} />}
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
      handleLogout();
    }} />}
      {view === 'admin-change-password' && <ChangePasswordView setView={setView} profileData={profileData} backView="admin-profile" setForgotPasswordBackView={setForgotPasswordBackView} />}
      {view === 'admin-edit-profile' && <AdminEditProfileView setView={setView} profileData={profileData} setProfileData={setProfileData} />}


      {logoutModalPortal && <div className="modal-overlay fade-in">
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
        </div>}

      {isAuthView(view) && <div className={`auth-bottom-accent ${isAuthView(view) ? 'auth-view-bottom-accent' : ''}`} style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      width: '100%',
      height: '36px',
      zIndex: 1,
      pointerEvents: 'none'
    }}>
        
          <div style={{
        width: '100%',
        height: '100%',
        left: 0,
        top: 0,
        position: 'absolute',
        opacity: 0.4,
        background: 'linear-gradient(90deg, #049516 0%, #FFD517 50%, #036E10 100%)'
      }} />
        
        </div>}

      {showPermissionSetup && <PermissionSetupModal step={permissionSetupStep} message={permissionSetupMessage} loading={permissionSetupLoading} onShowExplainer={() => {
      markPermissionSetupSeen();
      setPermissionSetupStep('notifications');
    }} onEnableNotifications={handleEnableNotificationPermission} onMaybeLater={handleMaybeLaterPermissions} onClose={() => setShowPermissionSetup(false)} />}

      {appDialog && <EduRouteNoticeModal title={appDialog.title} message={appDialog.message} tone={appDialog.tone} onClose={() => setAppDialog(null)} />}

    </div>;
}
export default App;
