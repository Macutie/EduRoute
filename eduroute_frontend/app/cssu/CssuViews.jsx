import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./cssu.css";
import { API_BASE_URL } from "../../config";
import { useHrmuLiveTracking } from "../../hooks/useHrmuLiveTracking";
import { useNotificationSocket } from "../../hooks/useNotificationSocket";
import { getISSUDashboardSummary, getISSUActivityTimeline, getISSUFacultyExitHistory, getISSUIncidentsOverview, getISSULiveExitMonitoring, getISSUNotificationsOverview, getISSUReportsOverview, downloadISSUReportsPdf, sendISSUReportToHrmu, lookupISSUExitCandidate, updateISSUExitStatus } from "../../services/cssuApi";
import { getISSUActiveFaculty, getISSUFacultyActivity, getISSUFacultyLiveDetail } from "../../services/cssuLiveTrackingApi";
import FacultyActivityLog from "../../components/hrmu/FacultyActivityLog";
import FacultyDetailCard from "../../components/hrmu/FacultyDetailCard";
import { AdminBadgeIcon, AdminBellIcon, AdminEmailOutlineIcon, AdminProfileChevronIcon, AdminProfileIdIcon, AdminProfileLogoutIcon, AdminProfilePasswordIcon, AdminRoleIcon, AdminSaveCheckIcon, ApproveCheckIcon, ArrowRightIcon, AtSymbolIcon, BackArrowIcon, BadgeIcon, BatteryIcon, BellRingIcon, BriefcaseIcon, CameraIcon, CapIcon, CheckCircleAdminIcon, CheckCircleIcon, CheckCircleSolidIcon, ChevronDownIcon, ChevronRightIcon, ClipboardCheckIcon, ClipboardClockIcon, ClockIcon, ISSUChartIcon, ISSUExitDoorIcon, ISSUIncidentsNavIcon, ISSUMapNavIcon, ISSUReportsNavIcon, ISSURoleIcon, ISSURosetteCheckIcon, ISSUScanNavIcon, ISSUTrendingUpIcon, ISSUWarningCircleIcon, ISSUWarningTriangleIcon, DashboardNavIcon, DeanNotificationDocIcon, DetailClockIcon, DetailClockReturnIcon, DetailDocIcon, DetailPinIcon, DetailRouteIcon, DocumentIcon, DummySignature, EditPencilIcon, EwanIcon, ExclamationCircleIcon, EyeIcon, EyeOffIcon, FacultyCheckCircleIcon, FacultyChevronRightIcon, FacultyCopyIcon, FacultyCrossCircleIcon, FacultyDocIcon, FacultyFilterIcon, FacultyIdBadgeIcon, FacultyNavIcon, FacultyRoleIcon, FacultySearchIcon, FacultyWaitCircleIcon, FileTextIcon, FilledClockIcon, FlashlightIcon, GlobeIcon, GlobeSmIcon, GraduationCapIcon, GridIcon, HeadsetIcon, HelpCircleIcon, HelpIcon, HomeNavIcon, HourglassIcon, HrmuAlertTinyIcon, HrmuChartIcon, HrmuCheckTinyIcon, HrmuExportIcon, HrmuEyeMiniIcon, HrmuFilterIcon, HrmuMapRouteIcon, HrmuMiniCheckIcon, HrmuPinMiniIcon, HrmuReportIcon, HrmuRoleIcon, HrmuSidebarGridIcon, HrmuSyncIcon, HrmuVerificationIcon, HrmuViewRouteIcon, HrmuWarningIcon, IdBadgeIcon, InboxArchiveIcon, InfoIcon, LinkIcon, LocationPinFilledIcon, LocationPinIcon, LockIcon, LockPrivIcon, LockSmallIcon, LoginDoorIcon, LogoutIcon, MailIcon, MapFoldIcon, MapIcon, ModalCloseIcon, NotifPendingIcon, NotifSlipIcon, NotificationIcon, PasswordIcon, PermissionsIcon, PersonOutlineIcon, PinIcon, PlayTriangleIcon, PolicyBulbIcon, PolicyCheckIcon, PrivacyIcon, ProfileEditIcon, ProfileNavIcon, ProgressReviewIcon, QuestionCircleIcon, RefreshClockIcon, RefreshIcon, RegistryDownloadIcon, RegistryModalCloseIcon, RegistryModalDoneIcon, RegistryModalIdIcon, RegistryModalVerifiedIcon, RegistryNavIcon, RejectXIcon, RemarksIcon, ReportPrintIcon, RequestsNavIcon, SaveIcon, ScanQRIcon, SendIcon, ShieldCheckIcon, ShieldCheckSmallIcon, ShieldSearchIcon, ShieldSolidIcon, SignalIcon, SignatureNavIcon, SlashedPersonIcon, SlipIcon, StatusGraphIcon, TogaLogoIcon, ToggleSwitch, TrashIcon, UploadIcon, UsersAdminIcon, WifiIcon, XCircleIcon } from "../../components/icons/AppIcons.jsx";
import { DEFAULT_PROFILE_IMAGE } from "../shared/appUtils.js";
import { HrmuLiveMapPanel, OLONGAPO_CENTER } from "../hrmu/HrmuViews.jsx";
import { formatStatusDateTime } from "../faculty/FacultyViews.jsx";
// --------------------------------------------------------
// ISSU DASHBOARD COMPONENTS
// --------------------------------------------------------

export const ISSUBottomNav = ({
  active = 'dashboard',
  setView
}) => {
  return <div className="admin-bottom-nav cssu-bottom-nav">
    <div className={`admin-nav-item ${active === 'dashboard' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('cssu-dashboard')}>
      <DashboardNavIcon color={active === 'dashboard' ? 'var(--green)' : '#9CA3AF'} />
      <span>DASHBOARD</span>
    </div>
    <div className={`admin-nav-item ${active === 'scan' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('cssu-scan')}>
      <ISSUScanNavIcon color={active === 'scan' ? 'var(--green)' : '#9CA3AF'} />
      <span>EXIT</span>
    </div>
    <div className={`admin-nav-item ${active === 'return' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('cssu-return')}>
      <RefreshClockIcon color={active === 'return' ? 'var(--green)' : '#9CA3AF'} />
      <span>RETURN</span>
    </div>
    <div className={`admin-nav-item ${active === 'reports' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('cssu-reports')}>
      <ISSUReportsNavIcon color={active === 'reports' ? 'var(--green)' : '#9CA3AF'} />
      <span>REPORTS</span>
    </div>
  </div>;
};
export const getDesktopWorkspaceViewport = () => typeof window !== 'undefined' ? window.innerWidth >= 768 : true;
export const useDesktopWorkspaceViewport = () => {
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

const getISSUExitHistoryStatusLabel = (item = {}) => {
  const normalizedStatus = String(item.status || item.statusLabel || '').toLowerCase();

  if (normalizedStatus === 'approved' || normalizedStatus === 'validated') {
    return 'Visited';
  }

  return item.statusLabel || item.status || 'Visited';
};

const normalizeISSUExitHistoryRows = (rows = []) => (
  Array.isArray(rows)
    ? rows.map((item) => ({
      ...item,
      statusLabel: getISSUExitHistoryStatusLabel(item),
    }))
    : []
);

const formatISSUServerTime = () => new Date().toLocaleTimeString('en-US', {
  timeZone: 'Asia/Manila',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true
});

const ISSU_GATE_ASSIGNMENT_STORAGE_KEY = 'eduroute:issu:daily-gate-assignment';
const ISSU_GATE_ASSIGNMENT_COOKIE = 'eduroute_issu_gate_assignment';

const getISSUTodayKey = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date());

const isISSUGate = gate => gate === 'main_gate' || gate === 'back_gate';

const getISSUGateLabel = gate => gate === 'back_gate' ? 'Back Gate' : 'Main Gate';

const isReturnEntryLookupValue = value => /^(?:EDU-ENTRY-[A-F0-9]{48}|RE-[A-Z0-9]{6})$/i.test(String(value || '').trim().replace(/\s+/g, ''));

const getISSUGateOfficerKey = profileData => {
  const raw = profileData?.id || profileData?.userId || profileData?.user_id || profileData?.employeeId || profileData?.employee_id || profileData?.email || profileData?.fullName || profileData?.full_name || 'shared';
  return String(raw || 'shared').trim().toLowerCase().replace(/[^a-z0-9@._-]+/g, '-');
};

const getISSUGateOfficerKeys = profileData => Array.from(new Set([
  profileData?.id,
  profileData?.userId,
  profileData?.user_id,
  profileData?.employeeId,
  profileData?.employee_id,
  profileData?.email,
  profileData?.fullName,
  profileData?.full_name,
].filter(Boolean).map(value => String(value).trim().toLowerCase().replace(/[^a-z0-9@._-]+/g, '-'))));

const getISSUGateAssignmentStorageKey = profileData => `${ISSU_GATE_ASSIGNMENT_STORAGE_KEY}:${getISSUGateOfficerKey(profileData)}`;

const readISSUDailyGateAssignment = (profileData = null) => {
  if (typeof window === 'undefined') return null;
  const todayKey = getISSUTodayKey();
  try {
    const cookie = document.cookie.split('; ').find(item => item.startsWith(`${ISSU_GATE_ASSIGNMENT_COOKIE}=`));
    const [cookieDate, cookieGate] = decodeURIComponent(cookie?.split('=').slice(1).join('=') || '').split('|');
    if (cookieDate === todayKey && isISSUGate(cookieGate)) return cookieGate;
  } catch (error) {
    // Continue with local storage when cookies are unavailable.
  }
  const keys = [
    ...getISSUGateOfficerKeys(profileData).map(key => `${ISSU_GATE_ASSIGNMENT_STORAGE_KEY}:${key}`),
    getISSUGateAssignmentStorageKey(profileData),
    ISSU_GATE_ASSIGNMENT_STORAGE_KEY,
  ];
  for (const key of keys) {
    try {
      const saved = JSON.parse(window.localStorage.getItem(key) || 'null');
      if (saved?.dateKey === todayKey && isISSUGate(saved.gate)) {
        return saved.gate;
      }
    } catch (error) {
      // Ignore corrupted local gate assignment data.
    }
  }
  return null;
};

const writeISSUDailyGateAssignment = (gate, profileData = null) => {
  if (typeof window === 'undefined' || !isISSUGate(gate)) return;
  try {
    const assignment = JSON.stringify({
      dateKey: getISSUTodayKey(),
      gate,
      officerKey: getISSUGateOfficerKey(profileData),
    });
    window.localStorage.setItem(getISSUGateAssignmentStorageKey(profileData), assignment);
    window.localStorage.setItem(ISSU_GATE_ASSIGNMENT_STORAGE_KEY, assignment);
    document.cookie = `${ISSU_GATE_ASSIGNMENT_COOKIE}=${encodeURIComponent(`${getISSUTodayKey()}|${gate}`)}; max-age=172800; path=/; SameSite=Lax`;
  } catch (error) {
    // Ignore storage failures so verification can continue.
  }
};

const ISSUGateAssignmentModal = ({
  open,
  onSelect,
  onCancel
}) => {
  if (!open) return null;
  return <div className="cssu-gate-picker-backdrop" onClick={onCancel}>
      <div className="cssu-gate-picker-modal" role="dialog" aria-modal="true" aria-labelledby="issu-gate-assignment-title" onClick={event => event.stopPropagation()}>
        <span className="cssu-gate-picker-kicker">ISSU GATE ASSIGNMENT</span>
        <h3 id="issu-gate-assignment-title">Select your assigned gate</h3>
        <p>Choose the gate where you are assigned today. All scans and validations you process will automatically use this ISSU gate.</p>
        <div className="cssu-gate-picker-actions">
          <button type="button" className="cssu-gate-picker-btn" onClick={() => onSelect?.('main_gate')}>
            Main Gate
          </button>
          <button type="button" className="cssu-gate-picker-btn" onClick={() => onSelect?.('back_gate')}>
            Back Gate
          </button>
        </div>
        <button type="button" className="cssu-gate-picker-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>;
};

export const ISSUWorkspaceShell = ({
  activeKey = 'dashboard',
  setView,
  profileData,
  onLogout,
  children
}) => {
  const sidebarItems = [{
    key: 'dashboard',
    label: 'Dashboard',
    icon: DashboardNavIcon,
    target: 'cssu-dashboard'
  }, {
    key: 'scan',
    label: 'Exit Verification',
    icon: ISSUScanNavIcon,
    target: 'cssu-scan'
  }, {
    key: 'return',
    label: 'Return Verification',
    icon: RefreshClockIcon,
    target: 'cssu-return'
  }, {
    key: 'reports',
    label: 'Reports',
    icon: ISSUReportsNavIcon,
    target: 'cssu-reports'
  }];
  return <div className="cssu-workspace">
      <aside className="cssu-sidebar">
        <div className="cssu-sidebar-top">
          <div className="cssu-brand-lockup">
            <div className="cssu-brand-badge" />
            <div className="cssu-brand-text">
              <strong>EduRoute</strong>
              <span>ISSU ADMIN</span>
            </div>
          </div>

          <nav className="cssu-sidebar-nav">
            {sidebarItems.map(item => {
            const Icon = item.icon;
            const isActive = item.key === activeKey;
            return <button key={item.key} type="button" className={`cssu-nav-item ${isActive ? 'active' : ''}`} onClick={() => item.target && setView(item.target)}>
                  
                  <Icon color={isActive ? 'var(--green)' : '#4B5563'} />
                  <span>{item.label}</span>
                </button>;
          })}
          </nav>
        </div>

        <div className="cssu-sidebar-bottom">
          <button type="button" className="cssu-logout-btn" onClick={onLogout}>Log Out</button>
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
            <div className="cssu-manager-copy">
              <strong>{profileData?.fullName || 'Admin User'}</strong>
              <span>ISSU Administrator</span>
            </div>
            <div className="admin-avatar" onClick={() => setView('admin-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="ISSU Admin" />
            </div>
          </div>
        </header>

        <div className="cssu-main-scroll">
          {children}
        </div>
      </main>
    </div>;
};
export const ISSUDesktopPage = ({
  activeKey,
  title,
  subtitle,
  setView,
  profileData,
  onLogout,
  children,
  hideHeader = false
}) => <ISSUWorkspaceShell activeKey={activeKey} setView={setView} profileData={profileData} onLogout={onLogout}>
    <section className="cssu-desktop-page">
      {!hideHeader && <div className="cssu-desktop-page-header">
          <div>
            <span className="cssu-desktop-kicker">Campus Operations</span>
            <h1 className={title === 'Exit Verification' || title === 'Return Verification' ? 'cssu-one-line-title' : undefined}>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </div>}
      {children}
    </section>
  </ISSUWorkspaceShell>;
export const ISSUDashboardDesktopViewLegacy = ({
  setView,
  profileData,
  onLogout
}) => <ISSUDesktopPage activeKey="dashboard" title="ISSU Security Command" subtitle="Gate-based Employee Exit & Entry Verification" setView={setView} profileData={profileData} onLogout={onLogout}>
  
    <div className="cssu-desktop-actions">
      <div className="cssu-live-pill">
        <span className="cssu-live-dot" />
        <span>GATE FEED ACTIVE</span>
      </div>
      <button type="button" className="cssu-summary-btn">Generate Summary</button>
    </div>

    <div className="cssu-desktop-stats">
      <article className="cssu-desktop-hero-card">
        <span className="cssu-desktop-card-label">Total Employees Exiting</span>
        <div className="cssu-desktop-hero-value">142</div>
        <div className="cssu-desktop-trend-chip">
          <ISSUTrendingUpIcon color="white" />
          <span>12% from yesterday</span>
        </div>
        <div className="cssu-desktop-hero-mark">
          <ISSUExitDoorIcon color="rgba(255,255,255,0.12)" size="96" />
        </div>
      </article>

      <article className="cssu-desktop-mini-card">
        <div className="cssu-desktop-mini-icon ok">
          <ISSURosetteCheckIcon color="var(--green)" />
        </div>
        <span className="cssu-desktop-mini-label">Approved Locator Slips</span>
        <strong>128</strong>
        <small>90.1% success rate</small>
      </article>

      <article className="cssu-desktop-mini-card flagged">
        <div className="cssu-desktop-mini-icon warn">
          <ISSUWarningTriangleIcon />
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
            <span>Employee</span>
            <span>ID Number</span>
            <span>Status</span>
            <span>Time</span>
            <span>Action</span>
          </div>

          <div className="cssu-desktop-log-row">
            <div className="cssu-desktop-person">
              <img src={DEFAULT_PROFILE_IMAGE} alt="Employee" />
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
              <img src={DEFAULT_PROFILE_IMAGE} alt="Employee" />
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
            <span>{`${getISSUDutyManagerLabel(profileData)} • ACTIVE`}</span>
          </div>
        </article>
      </aside>
    </div>
  </ISSUDesktopPage>;
export const getISSUDutyManagerLabel = profileData => profileData?.fullName || profileData?.email || 'ISSU Account';
export const ISSUDashboardDesktopView = ({
  setView,
  profileData,
  onLogout
}) => {
  const [summary, setSummary] = useState({
    totalFacultyExiting: 0,
    approvedLocatorSlips: 0,
    rejectedLocatorSlips: 0,
    approvalRate: 0
  });
  const gateOfficerKey = getISSUGateOfficerKey(profileData);
  const [gateAssignment, setGateAssignment] = useState(() => {
    const assignedGate = readISSUDailyGateAssignment(profileData);
    return {
      assignedGate,
      selectedGate: assignedGate || 'main_gate'
    };
  });
  const [showGateAssignmentPrompt, setShowGateAssignmentPrompt] = useState(false);
  const selectedGate = gateAssignment.selectedGate;
  const assignedGate = gateAssignment.assignedGate;
  const [liveRows, setLiveRows] = useState([]);
  const [activityRows, setActivityRows] = useState([]);
  const [monitorMode, setMonitorMode] = useState('exit');
  const [historyDrawer, setHistoryDrawer] = useState({
    open: false,
    loading: false,
    error: '',
    facultyName: '',
    rows: []
  });
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    const assignedGate = readISSUDailyGateAssignment(profileData);
    setGateAssignment(previous => ({
      assignedGate,
      selectedGate: assignedGate || previous.selectedGate || 'main_gate'
    }));
    setShowGateAssignmentPrompt(!assignedGate);
  }, [gateOfficerKey]);
  useEffect(() => {
    let isMounted = true;
    const loadDashboard = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const [summaryData, liveData, timelineData] = await Promise.all([getISSUDashboardSummary(), getISSULiveExitMonitoring({
          gate: selectedGate,
          limit: 20
        }), getISSUActivityTimeline({
          limit: 10
        })]);
        if (!isMounted) return;
        setSummary(summaryData || {
          totalFacultyExiting: 0,
          approvedLocatorSlips: 0,
          rejectedLocatorSlips: 0,
          approvalRate: 0
        });
        setLiveRows(Array.isArray(liveData?.rows) ? liveData.rows : []);
        setActivityRows(Array.isArray(timelineData?.rows) ? timelineData.rows : []);
      } catch (error) {
        if (!isMounted) return;
        setLoadError(error.message || 'Unable to load the ISSU dashboard right now.');
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
  const assignDailyGate = gate => {
    if (!isISSUGate(gate)) return;
    writeISSUDailyGateAssignment(gate, profileData);
    setGateAssignment({
      assignedGate: gate,
      selectedGate: gate
    });
    setShowGateAssignmentPrompt(false);
  };
  const approvedRateLabel = summary.totalFacultyExiting ? `${summary.approvalRate}% approved today` : 'No tracked exits yet';
  const rejectedRate = summary.totalLocatorSlipsFiled > 0
    ? Math.round((Number(summary.rejectedLocatorSlips || 0) / Number(summary.totalLocatorSlipsFiled)) * 100)
    : 0;
  const selectedGateLabel = getISSUGateLabel(selectedGate);
  const returnMonitoringRows = activityRows
    .filter(activity => activity.status === 'entry_validated' && liveRows.some(row => String(row.locatorSlipId) === String(activity.locatorSlipId)))
    .map(activity => ({
      locatorSlipId: activity.locatorSlipId,
      locatorSlipCode: activity.locatorSlipCode,
      returnEntryCode: liveRows.find(row => String(row.locatorSlipId) === String(activity.locatorSlipId))?.returnEntryCode || null,
      facultyUserId: activity.facultyUserId,
      facultyName: activity.facultyName,
      profileImageUrl: activity.profileImageUrl,
      facultyId: activity.facultyId,
      departmentName: activity.departmentName,
      status: 'entry_validated',
      statusLabel: 'Allowed Entry',
      gate: activity.gate,
      gateLabel: activity.gateLabel,
      validatedTimeLabel: activity.occurredTimeLabel,
    }));
  const monitoringRows = monitorMode === 'return' ? returnMonitoringRows : liveRows;
  const latestActivity = activityRows[0] || null;
  const operationalInsights = [summary.totalFacultyExiting > 0 ? `${summary.totalFacultyExiting} employee exit record${Number(summary.totalFacultyExiting) === 1 ? '' : 's'} tracked today.` : 'No employee exits are currently tracked today.', liveRows.length > 0 ? `${liveRows.length} locator slip${liveRows.length === 1 ? '' : 's'} visible in the ${selectedGateLabel} live monitoring queue.` : `${selectedGateLabel} has no queued approved locator slips right now.`, summary.rejectedLocatorSlips > 0 ? `${summary.rejectedLocatorSlips} rejected locator slip${Number(summary.rejectedLocatorSlips) === 1 ? '' : 's'} need ISSU review or intervention.` : 'No rejected locator slips are reported today.', summary.repeatAttempts > 0 ? `${summary.repeatAttempts} repeat scan attempt${Number(summary.repeatAttempts) === 1 ? '' : 's'} detected today.` : 'No repeat scan attempts detected today.', latestActivity ? `Latest gate activity: ${latestActivity.title || 'Activity logged'} for ${latestActivity.facultyName || 'an employee'} at ${latestActivity.gateLabel || selectedGateLabel}.` : 'No gate activity has been logged yet.'];
  const openExitClearanceForRow = row => {
    if (monitorMode === 'return') {
      if (!row?.returnEntryCode) return;
      localStorage.setItem('edurouteISSUPendingReturnEntryCode', row.returnEntryCode);
      localStorage.setItem('edurouteISSUPendingLookupSource', 'dashboard-return-eye');
      setView('cssu-return');
      return;
    }
    if (!row?.locatorSlipCode) return;
    localStorage.setItem('edurouteISSUPendingLocatorSlipCode', row.locatorSlipCode);
    localStorage.setItem('edurouteISSUPendingLookupSource', 'dashboard-eye');
    setView('cssu-scan');
  };
  const openFacultyHistory = async row => {
    if (!row?.facultyUserId) return;
    setHistoryDrawer({
      open: true,
      loading: true,
      error: '',
      facultyName: row.facultyName || 'Employee',
      rows: []
    });
    try {
      const history = await getISSUFacultyExitHistory(row.facultyUserId, {
        limit: 12
      });
      setHistoryDrawer({
        open: true,
        loading: false,
        error: '',
        facultyName: row.facultyName || 'Employee',
        rows: normalizeISSUExitHistoryRows(history?.rows)
      });
    } catch (error) {
      setHistoryDrawer({
        open: true,
        loading: false,
        error: error.message || 'Unable to load employee exit history.',
        facultyName: row.facultyName || 'Employee',
        rows: []
      });
    }
  };
  return <ISSUDesktopPage activeKey="dashboard" title="ISSU Security Command" subtitle="Gate-based Employee Exit & Entry Verification" setView={setView} profileData={profileData} onLogout={onLogout} hideHeader>
      <ISSUGateAssignmentModal open={showGateAssignmentPrompt && gateOfficerKey !== 'shared'} onSelect={assignDailyGate} onCancel={() => setShowGateAssignmentPrompt(false)} />
      
      <div className="cssu-dashboard-hero-row">
        <div className="cssu-dashboard-hero-copy">
          <span className="cssu-desktop-kicker">Campus Operations</span>
          <h1>ISSU Security Command</h1>
          <p>Gate-based Employee Exit & Entry Verification</p>
        </div>
        <div className="cssu-desktop-actions">
          <div className="cssu-live-pill">
            <span className="cssu-live-dot" />
            <span>GATE FEED ACTIVE</span>
          </div>
          <button type="button" className="cssu-summary-btn" onClick={() => setSummaryModalOpen(true)} disabled={loading}>
            Generate Summary
          </button>
        </div>
      </div>

      <div className="cssu-desktop-stats">
        <article className="cssu-desktop-hero-card">
          <span className="cssu-desktop-card-label">Total Employees Exiting</span>
          <div className="cssu-desktop-hero-value">{summary.totalFacultyExiting}</div>
          <div className="cssu-desktop-trend-chip">
            <ISSUTrendingUpIcon color="white" />
            <span>{approvedRateLabel}</span>
          </div>
          <div className="cssu-desktop-hero-mark">
            <ISSUExitDoorIcon color="rgba(255,255,255,0.12)" size="96" />
          </div>
        </article>

        <article className="cssu-desktop-mini-card">
          <div className="cssu-desktop-mini-icon ok">
            <RefreshClockIcon color="var(--green)" />
          </div>
          <span className="cssu-desktop-mini-label">Employees Returned</span>
          <strong>{summary.totalEmployeesReturned || 0}</strong>
          <small>Allowed entry today</small>
        </article>

        <article className="cssu-desktop-mini-card">
          <div className="cssu-desktop-mini-icon ok">
            <ISSURosetteCheckIcon color="var(--green)" />
          </div>
          <span className="cssu-desktop-mini-label">Approved Locator Slips</span>
          <strong>{summary.approvedLocatorSlips}</strong>
          <small>{approvedRateLabel}</small>
        </article>

        <article className="cssu-desktop-mini-card flagged">
          <div className="cssu-desktop-mini-icon warn">
            <ISSUWarningTriangleIcon />
          </div>
          <span className="cssu-desktop-mini-label">Rejected Locator Slips</span>
          <strong>{summary.rejectedLocatorSlips}</strong>
          <small>Rejected {rejectedRate}% of filed locator slips</small>
        </article>

        <article className="cssu-desktop-mini-card repeat-card">
          <div className="cssu-desktop-mini-icon warn">
            <ISSUWarningTriangleIcon />
          </div>
          <span className="cssu-desktop-mini-label">Repeat Attempts</span>
          <strong>{summary.repeatAttempts || 0}</strong>
          <small>{summary.suspiciousAttempts ? `${summary.suspiciousAttempts} suspicious scans today` : 'No suspicious scans today'}</small>
        </article>
      </div>

      <div className="cssu-desktop-content-grid">
        <section className="cssu-desktop-log-card">
          <div className="cssu-desktop-log-headline">
            <h2>{monitorMode === 'return' ? 'Live Return Monitoring' : 'Live Exit Monitoring'}</h2>
            <div className="cssu-desktop-toggle-group cssu-gate-assignment-toggle">
              <button type="button" className={monitorMode === 'exit' ? 'active' : ''} onClick={() => setMonitorMode('exit')}>Exit</button>
              <button type="button" className={monitorMode === 'return' ? 'active' : ''} onClick={() => setMonitorMode('return')}>Return</button>
              {assignedGate ? <>
                  <span className="cssu-assigned-gate-pill">Assigned today: {selectedGateLabel}</span>
                  <button type="button" className="active" disabled>{selectedGateLabel}</button>
                </> : <>
                  <button type="button" onClick={() => assignDailyGate('main_gate')}>Assign Main Gate</button>
                  <button type="button" onClick={() => assignDailyGate('back_gate')}>Assign Back Gate</button>
                </>}
            </div>
          </div>

          <div className="cssu-desktop-log-table">
            <div className="cssu-desktop-log-row head">
              <span>Employee</span>
              <span>ID Number</span>
              <span>Status</span>
              <span>Time</span>
              <span>Action</span>
            </div>

            {loading && <div className="cssu-desktop-log-empty">Loading {monitorMode} monitoring...</div>}

            {!loading && loadError && <div className="cssu-desktop-log-empty error">{loadError}</div>}

            {!loading && !loadError && monitoringRows.length === 0 && <div className="cssu-desktop-log-empty">{monitorMode === 'return' ? 'No return entries have been allowed today.' : 'No approved locator slips are queued for this gate yet.'}</div>}

            {!loading && !loadError && monitoringRows.map(row => {
            const statusClass = ['validated', 'entry_validated'].includes(row.status) ? 'valid' : row.status === 'denied' ? 'flagged' : 'approved';
            return <div key={`${row.locatorSlipId}-${row.gate}`} className="cssu-desktop-log-row">
                  <div className="cssu-desktop-person">
                    <img src={row.profileImageUrl || DEFAULT_PROFILE_IMAGE} alt={row.facultyName} />
                    <div>
                      <strong>{row.facultyName}</strong>
                      <span>{row.departmentName}</span>
                    </div>
                  </div>
                  <span>{row.facultyId || 'Unavailable'}</span>
                  <span className={`cssu-desktop-status ${statusClass}`}>{row.statusLabel}</span>
                  <span>{row.validatedTimeLabel || '--'}</span>
                  <div className="cssu-desktop-action-group">
                    <button type="button" className="cssu-desktop-action ghost" onClick={() => openExitClearanceForRow(row)} title={`Open exit clearance for ${row.facultyName}`}>
                      
                      <EyeIcon color="var(--green)" size="18" />
                    </button>
                    <button type="button" className="cssu-desktop-action history" onClick={() => openFacultyHistory(row)} title={`View exit history for ${row.facultyName}`}>
                      
                      History
                    </button>
                  </div>
                </div>;
          })}
          </div>

          <button type="button" className="cssu-desktop-load-link">Load Full {monitorMode === 'return' ? 'Return' : 'Exit'} Logs</button>
        </section>

        <aside className="cssu-desktop-side-stack">
          <article className="cssu-desktop-status-card">
            <h3>Security Status: Low</h3>
            <p>Current campus status is stable. ISSU is monitoring approved slips and rejected slip interventions in real time.</p>

            <div className="cssu-desktop-status-note">
              <strong>{selectedGateLabel} Queue</strong>
              <span>{liveRows.length} active employee records visible for this gate.</span>
            </div>

            <div className="cssu-desktop-status-note">
              <strong>Today&apos;s Busiest Gate</strong>
              <span>{summary.busiestGateLabel || 'Main Gate'} with {summary.busiestGateCount || 0} ISSU decisions.</span>
            </div>

            <div className="cssu-desktop-status-note">
              <strong>Rejected Locator Slips</strong>
              <span>{summary.rejectedLocatorSlips} slips currently need intervention or review.</span>
            </div>
          </article>

          <article className="cssu-desktop-status-card">
            <h3>Gate Activity Timeline</h3>
            <div className="cssu-activity-timeline">
              {activityRows.length ? activityRows.slice(0, 6).map(activity => <div key={activity.id} className={`cssu-activity-timeline-row ${String(activity.status || '').includes('denied') || String(activity.status || '').includes('rejected') ? 'danger' : ''}`}>
                  <span />
                  <div>
                    <strong>{activity.title}</strong>
                    <small>{activity.facultyName} • {activity.gateLabel} • {activity.occurredTimeLabel}</small>
                  </div>
                </div>) : <div className="cssu-desktop-log-empty compact">No gate activity has been logged yet.</div>}
            </div>
          </article>

          <article className="cssu-desktop-manager-card">
            <div className="cssu-desktop-manager-icon">
              <HeadsetIcon />
            </div>
            <div>
              <strong>Duty Manager</strong>
              <span>{`${getISSUDutyManagerLabel(profileData)} • ACTIVE`}</span>
            </div>
          </article>
        </aside>
      </div>

      {historyDrawer.open && <div className="cssu-history-drawer-backdrop" onClick={() => setHistoryDrawer({
      open: false,
      loading: false,
      error: '',
      facultyName: '',
      rows: []
    })}>
          <aside className="cssu-history-drawer" onClick={event => event.stopPropagation()}>
            <button type="button" className="cssu-history-close" onClick={() => setHistoryDrawer({
          open: false,
          loading: false,
          error: '',
          facultyName: '',
          rows: []
        })}>X</button>
            <span className="cssu-desktop-kicker">Employee Exit History</span>
            <h2>{historyDrawer.facultyName}</h2>
            {historyDrawer.loading ? <div className="cssu-desktop-log-empty">Loading history...</div> : historyDrawer.error ? <div className="cssu-desktop-log-empty error">{historyDrawer.error}</div> : historyDrawer.rows.length ? <div className="cssu-history-list">
                {historyDrawer.rows.map(item => <div key={item.id} className={`cssu-history-item ${String(item.status || '').includes('denied') || String(item.status || '').includes('rejected') ? 'danger' : ''}`}>
                    <strong>{item.statusLabel || item.status}</strong>
                    <span>{item.locatorSlipCode} • {item.destination}</span>
                    <small>{item.gateLabel} • {item.occurredTimeLabel}</small>
                  </div>)}
              </div> : <div className="cssu-desktop-log-empty">No previous ISSU exit activity found.</div>}
          </aside>
        </div>}

      {summaryModalOpen && <div className="eduroute-dialog-backdrop" role="presentation" onClick={() => setSummaryModalOpen(false)}>
          <div className="eduroute-dialog-modal info cssu-operational-summary-modal" role="dialog" aria-modal="true" aria-labelledby="cssu-summary-title" onClick={event => event.stopPropagation()}>
            <span className="eduroute-dialog-kicker">ISSU OPERATIONS</span>
            <h2 id="cssu-summary-title">Operational Summary</h2>
            <p>Generated from the current ISSU dashboard data for {selectedGateLabel}.</p>

            <div className="cssu-operational-summary-grid">
              <div>
                <span>Total Exits</span>
                <strong>{summary.totalFacultyExiting || 0}</strong>
              </div>
              <div>
                <span>Total Returned</span>
                <strong>{summary.totalEmployeesReturned || 0}</strong>
              </div>
              <div>
                <span>Approved Slips</span>
                <strong>{summary.approvedLocatorSlips || 0}</strong>
              </div>
              <div className={summary.rejectedLocatorSlips > 0 ? 'danger' : ''}>
                <span>Rejected Slips</span>
                <strong>{summary.rejectedLocatorSlips || 0}</strong>
              </div>
              <div className={summary.repeatAttempts > 0 ? 'danger' : ''}>
                <span>Repeat Attempts</span>
                <strong>{summary.repeatAttempts || 0}</strong>
              </div>
            </div>

            <div className="cssu-operational-summary-section">
              <strong>Briefing Notes</strong>
              <ul>
                {operationalInsights.map(insight => <li key={insight}>{insight}</li>)}
              </ul>
            </div>

            <div className="cssu-operational-summary-section recommendation">
              <strong>Recommended Action</strong>
              <p>
                {summary.rejectedLocatorSlips > 0 || summary.repeatAttempts > 0 ? 'Review denied or repeated scan records before clearing the next exit attempt.' : 'Continue monitoring the live gate queue and validate locator slips as they arrive.'}
              </p>
            </div>

            <div className="eduroute-dialog-actions">
              <button type="button" className="eduroute-dialog-secondary" onClick={() => setSummaryModalOpen(false)}>Close</button>
              <button type="button" className="eduroute-dialog-primary" onClick={() => {
            setSummaryModalOpen(false);
            setView(summary.rejectedLocatorSlips > 0 || summary.repeatAttempts > 0 ? 'cssu-scan' : 'cssu-dashboard');
          }}>
              
                {summary.rejectedLocatorSlips > 0 || summary.repeatAttempts > 0 ? 'Review Records' : 'Continue Monitoring'}
              </button>
            </div>
          </div>
        </div>}
    </ISSUDesktopPage>;
};
export const ISSUDashboardView = ({
  setView,
  profileData,
  onLogout
}) => {
  const isDesktopViewport = useDesktopWorkspaceViewport();
  const [summary, setSummary] = useState({
    totalFacultyExiting: 0,
    approvedLocatorSlips: 0,
    rejectedLocatorSlips: 0,
    approvalRate: 0
  });
  const gateOfficerKey = getISSUGateOfficerKey(profileData);
  const [mobileGateAssignment, setMobileGateAssignment] = useState(() => readISSUDailyGateAssignment(profileData) || 'main_gate');
  const [showGateAssignmentPrompt, setShowGateAssignmentPrompt] = useState(false);
  const [mobileLiveRows, setMobileLiveRows] = useState([]);
  const [activityRows, setActivityRows] = useState([]);
  const [showAllMobileLiveRows, setShowAllMobileLiveRows] = useState(false);
  const [historyDrawer, setHistoryDrawer] = useState({
    open: false,
    loading: false,
    error: '',
    facultyName: '',
    rows: []
  });
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    const assignedGate = readISSUDailyGateAssignment(profileData);
    setMobileGateAssignment(assignedGate || 'main_gate');
    setShowGateAssignmentPrompt(!assignedGate);
  }, [gateOfficerKey]);
  useEffect(() => {
    if (isDesktopViewport) {
      return undefined;
    }
    let isMounted = true;
    const loadMobileDashboard = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const assignedGate = readISSUDailyGateAssignment(profileData) || mobileGateAssignment || 'main_gate';
        const [summaryData, gateData, timelineData] = await Promise.all([getISSUDashboardSummary(), getISSULiveExitMonitoring({
          gate: assignedGate,
          limit: 10
        }), getISSUActivityTimeline({
          limit: 10
        })]);
        if (!isMounted) return;
        const assignedRows = (Array.isArray(gateData?.rows) ? gateData.rows : []).sort((left, right) => {
          const leftTime = left?.validatedAt ? new Date(left.validatedAt).getTime() : 0;
          const rightTime = right?.validatedAt ? new Date(right.validatedAt).getTime() : 0;
          return rightTime - leftTime;
        }).slice(0, 6);
        setSummary(summaryData || {
          totalFacultyExiting: 0,
          approvedLocatorSlips: 0,
          rejectedLocatorSlips: 0,
          approvalRate: 0
        });
        setMobileGateAssignment(assignedGate);
        setMobileLiveRows(assignedRows);
        setActivityRows(Array.isArray(timelineData?.rows) ? timelineData.rows : []);
        setShowAllMobileLiveRows(false);
      } catch (error) {
        if (!isMounted) return;
        setLoadError(error.message || 'Unable to load the ISSU dashboard right now.');
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
  }, [isDesktopViewport, mobileGateAssignment, gateOfficerKey]);
  if (isDesktopViewport) {
    return <ISSUDashboardDesktopView setView={setView} profileData={profileData} onLogout={onLogout} />;
  }
  const approvedRateLabel = summary.totalFacultyExiting ? `${summary.approvalRate}% approved today` : 'No tracked exits yet';
  const commandStatusPercent = Math.max(0, Math.min(100, Number(summary.approvalRate || 0)));
  const gateSummaryLabel = getISSUGateLabel(mobileGateAssignment);
  const visibleMobileLiveRows = showAllMobileLiveRows ? mobileLiveRows : mobileLiveRows.slice(0, 3);
  const hasMoreMobileLiveRows = mobileLiveRows.length > 3;
  const latestActivity = activityRows[0] || null;
  const needsMobileReview = Number(summary.rejectedLocatorSlips || 0) > 0 || Number(summary.repeatAttempts || 0) > 0;
  const operationalInsights = [summary.totalFacultyExiting > 0 ? `${summary.totalFacultyExiting} employee exit record${Number(summary.totalFacultyExiting) === 1 ? '' : 's'} tracked today.` : 'No employee exits are currently tracked today.', mobileLiveRows.length > 0 ? `${mobileLiveRows.length} live locator slip${mobileLiveRows.length === 1 ? '' : 's'} visible in ${gateSummaryLabel}.` : `${gateSummaryLabel} has no queued approved locator slips right now.`, summary.rejectedLocatorSlips > 0 ? `${summary.rejectedLocatorSlips} rejected locator slip${Number(summary.rejectedLocatorSlips) === 1 ? '' : 's'} need ISSU review or intervention.` : 'No rejected locator slips are reported today.', summary.repeatAttempts > 0 ? `${summary.repeatAttempts} repeat scan attempt${Number(summary.repeatAttempts) === 1 ? '' : 's'} detected today.` : 'No repeat scan attempts detected today.', latestActivity ? `Latest gate activity: ${latestActivity.title || 'Activity logged'} for ${latestActivity.facultyName || 'an employee'} at ${latestActivity.gateLabel || 'a campus gate'}.` : 'No gate activity has been logged yet.'];
  const closeHistoryDrawer = () => setHistoryDrawer({
    open: false,
    loading: false,
    error: '',
    facultyName: '',
    rows: []
  });
  const openExitClearanceForRow = row => {
    if (!row?.locatorSlipCode) return;
    localStorage.setItem('edurouteISSUPendingLocatorSlipCode', row.locatorSlipCode);
    localStorage.setItem('edurouteISSUPendingLookupSource', 'dashboard-eye');
    setView('cssu-scan');
  };
  const openFacultyHistory = async row => {
    if (!row?.facultyUserId) return;
    setHistoryDrawer({
      open: true,
      loading: true,
      error: '',
      facultyName: row.facultyName || 'Employee',
      rows: []
    });
    try {
      const history = await getISSUFacultyExitHistory(row.facultyUserId, {
        limit: 12
      });
      setHistoryDrawer({
        open: true,
        loading: false,
        error: '',
        facultyName: row.facultyName || 'Employee',
        rows: normalizeISSUExitHistoryRows(history?.rows)
      });
    } catch (error) {
      setHistoryDrawer({
        open: true,
        loading: false,
        error: error.message || 'Unable to load employee exit history.',
        facultyName: row.facultyName || 'Employee',
        rows: []
      });
    }
  };
  const assignMobileDailyGate = gate => {
    if (!isISSUGate(gate)) return;
    writeISSUDailyGateAssignment(gate, profileData);
    setMobileGateAssignment(gate);
    setShowGateAssignmentPrompt(false);
  };
  return <div className="admin-dash-wrapper cssu-wrapper">
      <ISSUGateAssignmentModal open={showGateAssignmentPrompt && gateOfficerKey !== 'shared'} onSelect={assignMobileDailyGate} onCancel={() => setShowGateAssignmentPrompt(false)} />
      <div className="admin-dash-scroll cssu-scroll">

        {/* Header */}
        <div className="cssu-header">
          <h1>Security Command</h1>
          <div className="cssu-header-actions">
            <div className="admin-bell-wrapper hrmu-bell-wrapper" onClick={() => setView('cssu-notifications')}>
              <AdminBellIcon color="var(--green)" />
              <div className="admin-bell-dot" />
            </div>
            <div className="cssu-avatar" onClick={() => setView('admin-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Admin" />
            </div>
          </div>
        </div>

        <div className="cssu-content">

          {/* Hero Card */}
          <div className="cssu-hero-card">
            <div className="cssu-hero-left">
              <span className="cssu-hero-label">TOTAL EMPLOYEES EXITING</span>
              <h2 className="cssu-hero-number">{summary.totalFacultyExiting}</h2>
              <div className="cssu-hero-trend">
                <ISSUTrendingUpIcon color="#fff" />
                <span>{approvedRateLabel}</span>
              </div>
            </div>
            <div className="cssu-hero-icon">
              <ISSUExitDoorIcon color="rgba(255,255,255,0.15)" size="80" />
            </div>
          </div>

          {/* Stat Cards */}
          <div className="cssu-stat-grid">
            <div className="cssu-stat-card active-card">
              <div className="cssu-stat-card-header">
                <ISSURosetteCheckIcon color="var(--green)" />
                <span className="cssu-stat-badge active">ACTIVE</span>
              </div>
              <div className="cssu-stat-card-body">
                <h3>{summary.approvedLocatorSlips}</h3>
                <p>Approved Locator Slips</p>
              </div>
            </div>
            <div className="cssu-stat-card flagged-card">
              <div className="cssu-stat-card-header">
                <ISSUWarningTriangleIcon />
                <span className="cssu-stat-badge flagged">FLAGGED</span>
              </div>
              <div className="cssu-stat-card-body">
                <h3>{summary.rejectedLocatorSlips}</h3>
                <p>Rejected Locator Slips</p>
              </div>
            </div>
            <div className="cssu-stat-card repeat-card">
              <div className="cssu-stat-card-header">
                <ISSUWarningTriangleIcon />
                <span className="cssu-stat-badge repeat">WATCH</span>
              </div>
              <div className="cssu-stat-card-body">
                <h3>{summary.repeatAttempts || 0}</h3>
                <p>Repeat Attempts</p>
              </div>
            </div>
          </div>

          {/* Summary Card */}
          <div className="cssu-summary-card">
            <div className="cssu-summary-header">
              <ISSUChartIcon />
              <span>COMMAND STATUS SUMMARY</span>
            </div>
            <div className="cssu-summary-zone">
              <span className="cssu-sz-label">Active Monitoring Zone</span>
              <span className="cssu-sz-value">{gateSummaryLabel}</span>
            </div>
            <div className="cssu-summary-progress-bg">
              <div className="cssu-summary-progress-fill" style={{
              width: `${commandStatusPercent}%`
            }}></div>
            </div>
            <p className="cssu-summary-desc">
              Current efficiency rating: {commandStatusPercent}% based on ISSU locator slip validation today.
            </p>
          </div>

          <button type="button" className="cssu-mobile-summary-btn" onClick={() => setSummaryModalOpen(true)} disabled={loading}>
            Generate Summary
          </button>

          {/* Live Exit Monitoring */}
          <div className="cssu-live-section">
            <div className="cssu-live-header">
              <h3>Live Exit Monitoring</h3>
              <span className="cssu-live-view-all" onClick={() => {
              if (!hasMoreMobileLiveRows) return;
              setShowAllMobileLiveRows(current => !current);
            }}>
                
                {hasMoreMobileLiveRows ? showAllMobileLiveRows ? 'Show Less' : 'View All' : 'View All'}
              </span>
            </div>
            <div className="cssu-live-list">
              {loading && <div className="cssu-live-item cssu-live-item-empty">
                  <div className="cssu-li-info">
                    <div className="cssu-li-top">
                      <h4>Loading live exits...</h4>
                    </div>
                  </div>
                </div>}

              {!loading && loadError && <div className="cssu-live-item flagged-item cssu-live-item-empty">
                  <div className="cssu-li-info">
                    <div className="cssu-li-top">
                      <h4>Live feed unavailable</h4>
                    </div>
                    <p>{loadError}</p>
                  </div>
                </div>}

              {!loading && !loadError && mobileLiveRows.length === 0 && <div className="cssu-live-item cssu-live-item-empty">
                  <div className="cssu-li-info">
                    <div className="cssu-li-top">
                      <h4>No live exits yet</h4>
                    </div>
                    <p>Approved and validated employee exits will appear here.</p>
                  </div>
                </div>}

              {!loading && !loadError && visibleMobileLiveRows.map(row => {
              const isFlagged = row.status === 'denied';
              const badgeClass = isFlagged ? 'flagged' : 'verified';
              const badgeLabel = isFlagged ? 'FLAGGED' : row.statusLabel?.toUpperCase?.() || 'VERIFIED';
              return <div key={`${row.locatorSlipId}-${row.gate}-${row.status}`} className={`cssu-live-item${isFlagged ? ' flagged-item' : ''}`}>
                    
                    <img src={row.profileImageUrl || DEFAULT_PROFILE_IMAGE} alt={row.facultyName} className="cssu-li-avatar" />
                    <div className="cssu-li-info">
                      <div className="cssu-li-top">
                        <h4>{row.facultyName}</h4>
                        <span className={`cssu-li-badge ${badgeClass}`}>{badgeLabel}</span>
                      </div>
                      <p>Exited: {row.validatedTimeLabel || '--'} &bull; {row.gateLabel || row.gateLabel || row.gate || 'Unknown Gate'}</p>
                    </div>
                    <div className="cssu-mobile-live-actions">
                      <button type="button" className="cssu-mobile-live-action eye" onClick={() => openExitClearanceForRow(row)} aria-label={`View scan details for ${row.facultyName}`}>
                        <EyeIcon color="var(--green)" size="16" />
                      </button>
                      <button type="button" className="cssu-mobile-live-action history" onClick={() => openFacultyHistory(row)}>
                        History
                      </button>
                    </div>
                  </div>;
            })}
            </div>
          </div>

        </div>
      </div>

      {historyDrawer.open && <div className="cssu-history-drawer-backdrop" onClick={closeHistoryDrawer}>
          <aside className="cssu-history-drawer cssu-mobile-history-drawer" onClick={event => event.stopPropagation()}>
            <button type="button" className="cssu-history-close" onClick={closeHistoryDrawer}>X</button>
            <span className="cssu-desktop-kicker">Employee Exit History</span>
            <h2>{historyDrawer.facultyName}</h2>
            {historyDrawer.loading ? <div className="cssu-desktop-log-empty">Loading history...</div> : historyDrawer.error ? <div className="cssu-desktop-log-empty error">{historyDrawer.error}</div> : historyDrawer.rows.length ? <div className="cssu-history-list">
                {historyDrawer.rows.map(item => <div key={item.id} className={`cssu-history-item ${String(item.status || '').includes('denied') || String(item.status || '').includes('rejected') ? 'danger' : ''}`}>
                    <strong>{item.statusLabel || item.status}</strong>
                    <span>{item.locatorSlipCode} &bull; {item.destination}</span>
                    <small>{item.gateLabel} &bull; {item.occurredTimeLabel}</small>
                  </div>)}
              </div> : <div className="cssu-desktop-log-empty">No previous ISSU exit activity found.</div>}
          </aside>
        </div>}

      {summaryModalOpen && <div className="eduroute-dialog-backdrop" role="presentation" onClick={() => setSummaryModalOpen(false)}>
          <div className="eduroute-dialog-modal info cssu-operational-summary-modal" role="dialog" aria-modal="true" aria-labelledby="cssu-mobile-summary-title" onClick={event => event.stopPropagation()}>
            <span className="eduroute-dialog-kicker">ISSU OPERATIONS</span>
            <h2 id="cssu-mobile-summary-title">Operational Summary</h2>
            <p>Generated from the current ISSU dashboard data for {gateSummaryLabel}.</p>

            <div className="cssu-operational-summary-grid">
              <div>
                <span>Total Exits</span>
                <strong>{summary.totalFacultyExiting || 0}</strong>
              </div>
              <div>
                <span>Approved Slips</span>
                <strong>{summary.approvedLocatorSlips || 0}</strong>
              </div>
              <div className={summary.rejectedLocatorSlips > 0 ? 'danger' : ''}>
                <span>Rejected Slips</span>
                <strong>{summary.rejectedLocatorSlips || 0}</strong>
              </div>
              <div className={summary.repeatAttempts > 0 ? 'danger' : ''}>
                <span>Repeat Attempts</span>
                <strong>{summary.repeatAttempts || 0}</strong>
              </div>
            </div>

            <div className="cssu-operational-summary-section">
              <strong>Briefing Notes</strong>
              <ul>
                {operationalInsights.map(insight => <li key={insight}>{insight}</li>)}
              </ul>
            </div>

            <div className="cssu-operational-summary-section recommendation">
              <strong>Recommended Action</strong>
              <p>
                {needsMobileReview ? 'Review denied or repeated scan records before clearing the next exit attempt.' : 'Continue monitoring the live gate queue and validate locator slips as they arrive.'}
              </p>
            </div>

            <div className="eduroute-dialog-actions">
              <button type="button" className="eduroute-dialog-secondary" onClick={() => setSummaryModalOpen(false)}>Close</button>
              <button type="button" className="eduroute-dialog-primary" onClick={() => {
            setSummaryModalOpen(false);
            setView(needsMobileReview ? 'cssu-scan' : 'cssu-dashboard');
          }}>
              
                {needsMobileReview ? 'Review Records' : 'Continue Monitoring'}
              </button>
            </div>
          </div>
        </div>}

      <button className="cssu-scan-fab" onClick={() => setView('cssu-scan')}>
        <ISSUScanNavIcon color="#554400" />
      </button>

      <ISSUBottomNav active="dashboard" setView={setView} />
    </div>;
};
export const ISSUMapView = ({
  setView,
  profileData,
  onLogout
}) => {
  const isDesktopViewport = useDesktopWorkspaceViewport();
  const [showMobileProfile, setShowMobileProfile] = useState(true);
  const [showMobileActivity, setShowMobileActivity] = useState(true);
  const [mobileOverlayOffsets, setMobileOverlayOffsets] = useState({
    profile: {
      x: 0,
      y: 0
    },
    activity: {
      x: 0,
      y: 0
    }
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
    loadMoreActivity
  } = useHrmuLiveTracking({
    getActiveFacultyFn: getISSUActiveFaculty,
    getFacultyActivityFn: getISSUFacultyActivity,
    getFacultyLiveDetailFn: getISSUFacultyLiveDetail
  });
  const mapCenter = useMemo(() => [Number(center?.lng || OLONGAPO_CENTER[0]), Number(center?.lat || OLONGAPO_CENTER[1])], [center?.lat, center?.lng]);
  const [mapFocusRequest, setMapFocusRequest] = useState(0);
  const mobileSelectedFaculty = selectedFacultyDetail?.faculty || selectedFaculty || null;
  const mobileDisplayName = mobileSelectedFaculty?.facultyName || 'No active employee';
  const mobileDisplayRole = mobileSelectedFaculty?.position || selectedFaculty?.position || selectedFaculty?.facultyRoleOrPosition || 'Employee';
  const mobileLastSync = selectedFacultyDetail?.latestLocation?.lastUpdatedLabel || selectedFaculty?.lastUpdatedLabel || 'Awaiting update';
  const mobileSpeed = selectedFacultyDetail?.latestLocation?.speedKmh ?? selectedFaculty?.speedKmh ?? null;
  const mobileSignal = selectedFaculty?.markerStatus === 'stale' ? 'Weak' : 'Strong';
  const mobileStatusLabel = selectedFaculty?.markerStatus === 'stale' ? 'STALE' : 'VERIFIED';
  const mobileActivityItems = Array.isArray(activityItems) ? activityItems.slice(0, 2) : [];
  const getMobilePointerPosition = event => {
    const point = event.touches?.[0] || event.changedTouches?.[0] || event;
    return {
      x: point.clientX,
      y: point.clientY
    };
  };
  const startMobileOverlayDrag = overlayKey => event => {
    const {
      x,
      y
    } = getMobilePointerPosition(event);
    const baseOffset = mobileOverlayOffsets[overlayKey] || {
      x: 0,
      y: 0
    };
    mobileDragStateRef.current = {
      key: overlayKey,
      startX: x,
      startY: y,
      baseX: baseOffset.x,
      baseY: baseOffset.y
    };
  };
  const getMobileOverlayStyle = overlayKey => ({
    transform: `translate(${mobileOverlayOffsets[overlayKey]?.x || 0}px, ${mobileOverlayOffsets[overlayKey]?.y || 0}px)`
  });
  useEffect(() => {
    if (isDesktopViewport) return undefined;
    const handleMove = event => {
      if (!mobileDragStateRef.current) return;
      const {
        x,
        y
      } = getMobilePointerPosition(event);
      const {
        key,
        startX,
        startY,
        baseX,
        baseY
      } = mobileDragStateRef.current;
      setMobileOverlayOffsets(current => ({
        ...current,
        [key]: {
          x: baseX + (x - startX),
          y: baseY + (y - startY)
        }
      }));
    };
    const handleEnd = () => {
      mobileDragStateRef.current = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, {
      passive: true
    });
    window.addEventListener('touchend', handleEnd);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDesktopViewport, mobileOverlayOffsets]);
  if (isDesktopViewport) {
    return <ISSUDesktopPage activeKey="map" title="Live Tracking" subtitle="Information Security Services Unit" setView={setView} profileData={profileData} onLogout={onLogout}>
        
        <section className="cssu-live-page">
          <div className="hrmu-live-map-stage cssu-live-map-stage">
            <HrmuLiveMapPanel faculty={facultyLocations} center={mapCenter} selectedFacultyUserId={selectedFaculty?.facultyUserId || null} selectedFacultyDetail={selectedFacultyDetail} selectedFaculty={selectedFaculty} onMarkerSelect={selectFaculty} focusOnOlongapo focusRequest={mapFocusRequest} className="hrmu-live-stage-map" />
            

            <div className="hrmu-live-controls">
              <button type="button" className="hrmu-live-control-btn" aria-label="Refresh active employee" onClick={reload}>
                <span className="hrmu-live-control-label">Refresh</span>
                <span className="hrmu-live-control-subtext">Live data</span>
              </button>
              <button type="button" className="hrmu-live-control-pill" aria-label={`Focus map on ${center?.label || 'Olongapo City'}`} onClick={() => setMapFocusRequest(value => value + 1)}>
                
                <span className="hrmu-live-control-label">Focus</span>
                <span className="hrmu-live-control-subtext">Olongapo</span>
              </button>
            </div>

            <FacultyActivityLog activity={activityItems} loading={loading || activityLoading} onViewAll={() => loadMoreActivity(20)} />
            

            <FacultyDetailCard faculty={selectedFaculty} detail={selectedFacultyDetail} loading={loading || detailLoading} />
            

            {error && <div className="hrmu-live-inline-alert">
                <strong>Live tracking error</strong>
                <span>{error}</span>
              </div>}
          </div>
        </section>
      </ISSUDesktopPage>;
  }
  return <div className="admin-dash-wrapper cssu-wrapper">
      <div className="admin-dash-scroll cssu-scroll">
        <div className="cssu-header cssu-map-mobile-header">
          <h1>Security Command</h1>
          <div className="cssu-header-actions">
            <div className="admin-bell-wrapper hrmu-bell-wrapper" onClick={() => setView('cssu-notifications')}>
              <AdminBellIcon color="var(--green)" />
              <div className="admin-bell-dot" />
            </div>
            <div className="cssu-avatar" onClick={() => setView('admin-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Admin" />
            </div>
          </div>
        </div>

        <div className="cssu-mobile-live-shell">
          <div className="cssu-mobile-live-map">
            <HrmuLiveMapPanel faculty={facultyLocations} center={mapCenter} selectedFacultyUserId={selectedFaculty?.facultyUserId || null} selectedFacultyDetail={selectedFacultyDetail} selectedFaculty={selectedFaculty} onMarkerSelect={selectFaculty} focusOnOlongapo className="cssu-mobile-live-map-canvas" />
            

            <div className="cssu-mobile-live-controls">
              <button type="button" className="cssu-mobile-live-control" aria-label="Map layers">
                <HrmuMapRouteIcon color="#5B6659" />
              </button>
              <button type="button" className="cssu-mobile-live-control" aria-label="Refresh active employee" onClick={reload}>
                <HrmuSyncIcon color="#5B6659" />
              </button>
            </div>

            {selectedFaculty && <div className="cssu-mobile-live-selected-pill">
                <span>{String(selectedFaculty.facultyName || 'Employee').replace(/^Mr\.?\s+|^Ms\.?\s+|^Mrs\.?\s+|^Dr\.?\s+/i, '').toUpperCase()}</span>
              </div>}

            {showMobileProfile ? <section className="cssu-mobile-live-profile-card" style={getMobileOverlayStyle('profile')}>
                <div className="cssu-mobile-live-overlay-head">
                  <span>Active Employee</span>
                  <div className="overlay-card-controls">
                    <button type="button" className="overlay-toggle-btn" onClick={() => setShowMobileProfile(false)}>
                      Hide
                    </button>
                    <button type="button" className="overlay-drag-handle" onMouseDown={startMobileOverlayDrag('profile')} onTouchStart={startMobileOverlayDrag('profile')}>
                    
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
                      <span><i /> {selectedFaculty?.markerStatus === 'stale' ? 'STALE' : 'ACTIVE'} • {String(mobileDisplayRole || 'Employee').toUpperCase()}</span>
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
              </section> : <button type="button" className="cssu-mobile-live-restore profile" onClick={() => setShowMobileProfile(true)}>
                Show Active Employee
              </button>}

            {showMobileActivity ? <section className="cssu-mobile-live-activity-sheet" style={getMobileOverlayStyle('activity')}>
                <div className="cssu-mobile-live-sheet-handle" />
                <div className="cssu-mobile-live-sheet-head">
                  <h3>Live Activity</h3>
                  <div className="cssu-mobile-live-sheet-actions">
                    <button type="button" onClick={() => loadMoreActivity(20)}>View All</button>
                    <button type="button" className="overlay-toggle-btn" onClick={() => setShowMobileActivity(false)}>
                      Hide
                    </button>
                    <button type="button" className="overlay-drag-handle" onMouseDown={startMobileOverlayDrag('activity')} onTouchStart={startMobileOverlayDrag('activity')}>
                    
                      Drag
                    </button>
                  </div>
                </div>

                <div className="cssu-mobile-live-activity-list">
                  {(loading || activityLoading) && <div className="cssu-mobile-live-activity-empty">Loading live activity...</div>}

                  {!loading && !activityLoading && mobileActivityItems.length === 0 && <div className="cssu-mobile-live-activity-empty">No activity has been recorded for the selected employee yet.</div>}

                  {!loading && !activityLoading && mobileActivityItems.map(item => {
                const normalizedType = String(item.type || '').toLowerCase();
                const tone = ['trip_cancelled', 'late_return_detected', 'unverified_location_flagged', 'trip_flagged_unverified'].includes(normalizedType) ? 'warning' : 'success';
                return <div key={item.id || `${item.type}-${item.occurredAt}`} className="cssu-mobile-live-activity-item">
                        <div className={`cssu-mobile-live-activity-icon ${tone}`}>
                          {tone === 'success' ? <HrmuMiniCheckIcon color="var(--green)" /> : <HrmuWarningIcon color="#8B6B00" />}
                        </div>
                        <div className="cssu-mobile-live-activity-copy">
                          <strong>{item.title}</strong>
                          <p>{item.subtitle}</p>
                        </div>
                        <time>{item.relativeTime || '--'}</time>
                      </div>;
              })}
                </div>
              </section> : <button type="button" className="cssu-mobile-live-restore activity" onClick={() => setShowMobileActivity(true)}>
                Show Live Activity
              </button>}

            {error && <div className="cssu-mobile-live-error">
                <strong>Live tracking error</strong>
                <span>{error}</span>
              </div>}
          </div>
        </div>
      </div>

      <ISSUBottomNav active="map" setView={setView} />
    </div>;
};
export const ISSUIncidentsView = ({
  setView,
  profileData,
  onLogout
}) => {
  const isDesktopViewport = useDesktopWorkspaceViewport();
  const [incidentData, setIncidentData] = useState({
    activeCases: 0,
    resolvedToday: 0,
    incidents: []
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    let isMounted = true;
    const loadIncidents = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const data = await getISSUIncidentsOverview();
        if (!isMounted) return;
        setIncidentData({
          activeCases: Number(data?.activeCases || 0),
          resolvedToday: Number(data?.resolvedToday || 0),
          incidents: Array.isArray(data?.incidents) ? data.incidents : []
        });
      } catch (error) {
        if (!isMounted) return;
        setLoadError(error.message || 'Unable to load the ISSU incidents right now.');
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
    return <ISSUDesktopPage activeKey="incidents" title="Incident Log" subtitle="Centralized oversight for campus compliance, track flagged violations, review authorization slips, and manage intervention triggers." setView={setView} profileData={profileData} onLogout={onLogout} hideHeader>
        
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
              {!loading && !loadError && incidentRows.length === 0 && <div className="cssu-incident-empty">No ISSU incident cases were recorded today.</div>}
              {incidentRows.map(incident => <article key={incident.id} className={`cssu-incident-row ${incident.tone}`}>
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
                </article>)}
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
                  <strong>{featuredIncident?.facultyName || 'No employee selected'}</strong>
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
      </ISSUDesktopPage>;
  }
  return <div className="admin-dash-wrapper cssu-wrapper">
      <div className="admin-dash-scroll cssu-scroll">
        <div className="cssu-header cssu-map-mobile-header">
          <h1>Security Command</h1>
          <div className="cssu-header-actions">
            <div className="admin-bell-wrapper hrmu-bell-wrapper" onClick={() => setView('cssu-notifications')}>
              <AdminBellIcon color="var(--green)" />
              <div className="admin-bell-dot" />
            </div>
            <div className="cssu-avatar" onClick={() => setView('admin-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Admin" />
            </div>
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
            {loading && <div className="cssu-mobile-incident-empty">Loading incident cases...</div>}

            {!loading && loadError && <div className="cssu-mobile-incident-empty error">{loadError}</div>}

            {!loading && !loadError && incidentData.incidents.length === 0 && <div className="cssu-mobile-incident-empty">No ISSU incident cases were recorded today.</div>}

            {!loading && !loadError && incidentData.incidents.map(incident => {
            const toneClass = incident.tone === 'red' ? 'critical' : incident.tone === 'yellow' ? 'moderate' : 'low';
            const metaIcon = incident.destination ? <LocationIcon color="#3D4B3E" /> : <ProfileIcon color="#3D4B3E" />;
            const metaText = incident.destination || incident.facultyName || incident.departmentName || 'ISSU logged activity';
            return <article key={incident.id} className={`cssu-mobile-incident-card ${toneClass}`}>
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
                </article>;
          })}
          </div>
        </div>
      </div>

      <ISSUBottomNav active="incidents" setView={setView} />
    </div>;
};
export const ISSUScanViewLegacy = ({
  setView,
  profileData,
  onLogout
}) => {
  const isDesktopViewport = useDesktopWorkspaceViewport();
  const [serverTime, setServerTime] = useState(formatISSUServerTime);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setServerTime(formatISSUServerTime());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (isDesktopViewport) {
    return <ISSUDesktopPage activeKey="scan" title="Exit Verification" subtitle="Information Security Services Unit" setView={setView} profileData={profileData} onLogout={onLogout}>
        
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
                <input type="text" className="cssu-checkpoint-manual-input" placeholder="Enter Employee ID (e.g. FAC-2024-001)" />
                
                <button type="button" className="cssu-checkpoint-search-btn" aria-label="Search employee ID">
                  <FacultySearchIcon />
                </button>
              </div>
            </article>
          </div>

          <div className="cssu-checkpoint-right">
            <article className="cssu-checkpoint-profile-card">
              <div className="cssu-checkpoint-profile-top">
                <div className="cssu-checkpoint-profile-avatar">
                  <img src={DEFAULT_PROFILE_IMAGE} alt="Employee" />
                </div>
                <div className="cssu-checkpoint-profile-copy">
                  <span className="cssu-checkpoint-card-kicker">EMPLOYEE PROFILE</span>
                  <h2>Dr. Helena Vance</h2>
                  <p>Department of Advanced Bio-Ethics</p>
                </div>
              </div>

              <div className="cssu-checkpoint-profile-meta">
                <div>
                  <span>STAFF ID</span>
                  <strong>cssu-4491-02</strong>
                </div>
                <div>
                  <span>TYPE</span>
                  <strong>Full-Time Employee</strong>
                </div>
              </div>

              <div className="cssu-checkpoint-slip-status">
                <div className="cssu-checkpoint-slip-icon">
                  <ISSURosetteCheckIcon color="var(--green)" />
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
      </ISSUDesktopPage>;
  }
  return <div className="mobile-container"><div className="content"><div className="header"><h1>Scan</h1></div><ISSUBottomNav active="scan" setView={setView} /></div></div>;
};
export const ISSUScanView = ({
  setView,
  profileData,
  onLogout,
  mode = 'exit'
}) => {
  const isReturnVerification = mode === 'entry';
  const isDesktopViewport = useDesktopWorkspaceViewport();
  const qrVideoRef = useRef(null);
  const qrScanFrameRef = useRef(null);
  const qrStreamRef = useRef(null);
  const qrDetectorRef = useRef(null);
  const [serverTime, setServerTime] = useState(formatISSUServerTime);
  const [manualFacultyId, setManualFacultyId] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [activeCandidate, setActiveCandidate] = useState(null);
  const [lastLookupMethod, setLastLookupMethod] = useState('manual');
  const [showGatePicker, setShowGatePicker] = useState(false);
  const gateOfficerKey = getISSUGateOfficerKey(profileData);
  const [showGateAssignmentPrompt, setShowGateAssignmentPrompt] = useState(false);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [qrScannerError, setQrScannerError] = useState('');
  const [qrScannerStatus, setQrScannerStatus] = useState('');
  const [qrManualEntryReason, setQrManualEntryReason] = useState('');
  useEffect(() => {
    const timer = window.setInterval(() => {
      setServerTime(formatISSUServerTime());
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
      qrStreamRef.current.getTracks().forEach(track => track.stop());
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
  useEffect(() => {
    if (!isReturnVerification) return;
    const pendingReturnEntryCode = localStorage.getItem('edurouteISSUPendingReturnEntryCode');
    const pendingLookupSource = localStorage.getItem('edurouteISSUPendingLookupSource');
    if (!pendingReturnEntryCode) return;
    localStorage.removeItem('edurouteISSUPendingReturnEntryCode');
    localStorage.removeItem('edurouteISSUPendingLookupSource');
    setManualFacultyId(pendingReturnEntryCode);
    runLookup({
      value: pendingReturnEntryCode,
      method: 'manual',
      suppressLookupLog: true,
      historyLookup: pendingLookupSource === 'dashboard-return-eye'
    });
  }, [isReturnVerification]);
  useEffect(() => {
    const pendingLocatorSlipCode = localStorage.getItem('edurouteISSUPendingLocatorSlipCode');
    const pendingLookupSource = localStorage.getItem('edurouteISSUPendingLookupSource');
    if (!pendingLocatorSlipCode) return;
    localStorage.removeItem('edurouteISSUPendingLocatorSlipCode');
    localStorage.removeItem('edurouteISSUPendingLookupSource');
    setManualFacultyId(pendingLocatorSlipCode);
    runLookup({
      value: pendingLocatorSlipCode,
      method: 'manual',
      suppressLookupLog: pendingLookupSource === 'dashboard-eye' || pendingLookupSource === 'notification-exit-clearance'
    });
  }, []);
  useEffect(() => {
    setShowGateAssignmentPrompt(!readISSUDailyGateAssignment(profileData));
  }, [gateOfficerKey]);
  const runLookup = async ({
    value,
    method,
    suppressLookupLog = false,
    historyLookup = false
  }) => {
    const trimmedValue = String(value || '').trim().replace(/\s+/g, '').toUpperCase();
    if (!trimmedValue) {
      setLookupError(isReturnVerification ? 'Enter the Return Entry QR or RE code first.' : 'Enter a locator slip code or QR value first.');
      return;
    }
    if (isReturnVerification && !isReturnEntryLookupValue(trimmedValue)) {
      setLookupError('Return Verification accepts only the active Return Entry QR or RE code.');
      return;
    }
    if (!isReturnVerification && isReturnEntryLookupValue(trimmedValue)) {
      setLookupError('Return Entry QR codes can only be used in Return Verification.');
      return;
    }
    setLookupLoading(true);
    setLookupError('');
    setActionMessage('');
    try {
      const lookupGate = readISSUDailyGateAssignment(profileData);
      if (!lookupGate) {
        setLookupLoading(false);
        setLookupError('Select your assigned ISSU gate before scanning or entering a locator slip.');
        setShowGateAssignmentPrompt(true);
        return;
      }
      const result = await lookupISSUExitCandidate({
        locatorSlipCode: trimmedValue,
        gate: lookupGate,
        method,
        suppressLookupLog,
        history: historyLookup ? 'history' : undefined
      });
      const resultIsReturnEntry = Boolean(result?.locatorSlip?.isReturnEntry || result?.locatorSlip?.checkpointMode === 'entry');
      if (resultIsReturnEntry !== isReturnVerification) {
        setActiveCandidate(null);
        setLookupError(isReturnVerification
          ? 'This is not an active Return Entry QR or code. Scan the QR shown after Confirm Return.'
          : 'This is a Return Entry QR. Use the Return Verification page.');
        return;
      }
      setActiveCandidate(result);
      setLastLookupMethod(method);
      setManualFacultyId(isReturnVerification
        ? trimmedValue
        : result?.locatorSlip?.locatorSlipCode || trimmedValue);
    } catch (error) {
      setActiveCandidate(null);
      setLookupError(error.message || 'Unable to validate this employee ID right now.');
    } finally {
      setLookupLoading(false);
    }
  };
  const handleManualLookup = () => runLookup({
    value: manualFacultyId,
    method: 'manual'
  });
  const beginQrDetectionLoop = () => {
    const BarcodeDetectorCtor = window.BarcodeDetector;
    if (!BarcodeDetectorCtor || !qrVideoRef.current) return;
    if (!qrDetectorRef.current) {
      qrDetectorRef.current = new BarcodeDetectorCtor({
        formats: ['qr_code']
      });
    }
    const detector = qrDetectorRef.current;
    const scan = async () => {
      if (!qrVideoRef.current || !qrStreamRef.current) return;
      try {
        const barcodes = await detector.detect(qrVideoRef.current);
        if (Array.isArray(barcodes) && barcodes.length > 0) {
          const rawValue = barcodes[0]?.rawValue?.trim();
          if (rawValue) {
            if (isReturnVerification !== isReturnEntryLookupValue(rawValue)) {
              stopQrScanner();
              setQrScannerOpen(false);
              setQrScannerStatus('');
              setLookupError(isReturnVerification
                ? 'This is not a Return Entry QR. Scan the QR shown after Confirm Return.'
                : 'Return Entry QR codes can only be scanned from Return Verification.');
              return;
            }
            stopQrScanner();
            setQrScannerOpen(false);
            setQrScannerStatus('QR code captured. Fetching locator slip...');
            await runLookup({
              value: rawValue,
              method: 'qr'
            });
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
      setQrScannerStatus('');
      setQrManualEntryReason('Camera scanning requires a secure HTTPS connection. Enter the locator slip code manually instead.');
      return;
    }
    if (!window.BarcodeDetector) {
      setQrScannerStatus('');
      setQrManualEntryReason('QR camera scanning is not available on this browser. Enter the locator slip code manually instead.');
      return;
    }
    try {
      stopQrScanner();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: 'environment'
          }
        },
        audio: false
      });
      qrStreamRef.current = stream;
      setQrScannerOpen(true);
      setQrScannerStatus('Opening camera...');
    } catch (error) {
      setQrScannerOpen(false);
      setQrScannerStatus('');
      setQrScannerError(error?.name === 'NotAllowedError' ? 'Camera permission was denied. Enable camera access in your browser settings, then try again.' : 'Unable to open the camera scanner right now.');
    }
  };
  const handleExitDecision = async (nextStatus, gateOverride = null) => {
    if (!activeCandidate?.locatorSlip?.locatorSlipId) {
      setLookupError('No approved locator slip is available for ISSU validation.');
      return;
    }
    setActionLoading(true);
    setLookupError('');
    setActionMessage('');
    try {
      const effectiveGate = isISSUGate(gateOverride) ? gateOverride : readISSUDailyGateAssignment(profileData) || 'main_gate';
      if (nextStatus === 'validated') {
        writeISSUDailyGateAssignment(effectiveGate, profileData);
      }
      const checkpointMode = activeCandidate?.locatorSlip?.checkpointMode || (activeCandidate?.locatorSlip?.isReturnEntry ? 'entry' : 'exit');
      const result = await updateISSUExitStatus(activeCandidate.locatorSlip.locatorSlipId, {
        gate: effectiveGate,
        status: nextStatus,
        method: lastLookupMethod,
        checkpoint: checkpointMode,
        returnEntryToken: activeCandidate?.locatorSlip?.returnEntryToken || null,
        returnEntryCode: activeCandidate?.locatorSlip?.returnEntryCode || null
      });
      const isEntryValidation = result.checkpoint === 'entry' || result.status === 'entry_validated';
      const validationTitle = isEntryValidation ? 'Locator Slip: Entry Validated' : result.status === 'flagged' ? 'Locator Slip: Flagged Incident' : result.status === 'denied' ? 'Locator Slip: Exit Denied' : 'Locator Slip: Validated (Official)';
      setActiveCandidate(prev => ({
        ...prev,
        locatorSlip: {
          ...prev.locatorSlip,
          status: result.status,
          statusLabel: result.statusLabel,
          gate: result.gate,
          gateLabel: result.gateLabel,
          validatedAt: result.validatedAt,
          validatedTimeLabel: result.validatedTimeLabel,
          checkpointMode: result.checkpoint || checkpointMode,
          isReturnEntry: false,
          canAllowExit: false,
          canDenyExit: false,
          canFlagIncident: false,
          isOfficial: result.isOfficial,
          locked: true
        },
        validationLog: [...(prev?.validationLog || []).filter(item => item.title !== 'Locator Slip: Validated (Official)' && item.title !== 'Locator Slip: Entry Validated' && item.title !== 'Locator Slip: Exit Denied' && item.title !== 'Locator Slip: Flagged Incident'), {
          type: ['validated', 'entry_validated'].includes(result.status) ? 'success' : 'danger',
          title: validationTitle,
          timeLabel: result.validatedTimeLabel || '--',
          // Keep the optimistic log entry in the same full date/time format
          // as entries returned by the validation-log API.
          occurredAt: result.validatedAt || new Date().toISOString()
        }]
      }));
      setActionMessage(isEntryValidation ? `Return entry has been validated at ${result.gateLabel || 'Main Gate'}. The trip is now completed.` : result.status === 'validated' ? `Locator slip is now officially validated for exit at ${result.gateLabel || 'Main Gate'}.` : result.status === 'flagged' ? 'Exit attempt has been flagged and logged for ISSU incident review.' : 'Exit has been denied and logged for ISSU review.');
    } catch (error) {
      setLookupError(error.message || 'Unable to update the ISSU exit decision right now.');
    } finally {
      setActionLoading(false);
    }
  };
  const handleAllowExitClick = () => {
    if (!locatorSlip?.canAllowExit || actionLoading) return;
    const assignedGate = readISSUDailyGateAssignment(profileData);
    if (assignedGate) {
      confirmAllowExit(assignedGate);
      return;
    }
    setShowGatePicker(true);
  };
  const confirmAllowExit = async gate => {
    writeISSUDailyGateAssignment(gate, profileData);
    setShowGatePicker(false);
    await handleExitDecision('validated', gate);
  };
  const assignScanDailyGate = gate => {
    if (!isISSUGate(gate)) return;
    writeISSUDailyGateAssignment(gate, profileData);
    setShowGateAssignmentPrompt(false);
  };
  const faculty = activeCandidate?.faculty;
  const locatorSlip = activeCandidate?.locatorSlip;
  const scanConfidence = activeCandidate?.scanConfidence;
  const validationLog = Array.isArray(activeCandidate?.validationLog) ? activeCandidate.validationLog : [];
  const normalizedLocatorSlipStatus = String(locatorSlip?.status || '').toLowerCase();
  const isReturnEntryCheckpoint = locatorSlip?.checkpointMode === 'entry' || locatorSlip?.isReturnEntry || normalizedLocatorSlipStatus === 'returning_entry';
  const allowDecisionLabel = isReturnEntryCheckpoint ? 'Allow Entry' : 'Allow Exit';
  const checkpointTitle = isReturnVerification ? 'Return Verification' : 'Exit Verification';
  const checkpointDescription = isReturnVerification
    ? 'Verify the employee’s one-time return-entry QR before completing the trip.'
    : 'Verify an approved locator slip before allowing campus exit.';
  const slipVisualState = ['validated', 'returning_entry', 'entry_validated'].includes(normalizedLocatorSlipStatus) ? 'validated' : normalizedLocatorSlipStatus === 'flagged' || normalizedLocatorSlipStatus === 'denied' || normalizedLocatorSlipStatus === 'rejected' ? 'denied' : normalizedLocatorSlipStatus === 'pending' ? 'pending' : 'approved';
  const renderCheckpointContent = (mobile = false) => <>
      {mobile ? null : <div className="cssu-checkpoint-header">
          <div className="cssu-checkpoint-time">
            <span>LIVE SERVER TIME</span>
            <strong>{serverTime}</strong>
          </div>
        </div>}

      <div className="cssu-checkpoint-grid">
        <div className="cssu-checkpoint-left">
          {!mobile && <article className="cssu-checkpoint-scanner-card">
              <span className="cssu-checkpoint-card-kicker">SCANNER INTERFACE</span>
              <div className="cssu-checkpoint-scan-stage">
                <div className="cssu-checkpoint-scan-frame">
                  <div className="cssu-checkpoint-qr-box">
                    <ScanQRIcon color="#79C683" />
                  </div>
                  <span>{lookupLoading && lastLookupMethod === 'qr' ? 'SCANNING QR...' : 'WAITING FOR SCAN'}</span>
                </div>
              </div>
            </article>}

          <article className="cssu-checkpoint-manual-card">
            <span className="cssu-checkpoint-card-kicker">{mobile ? 'LOOKUP CODE' : 'MANUAL LOOKUP'}</span>
            <div className="cssu-checkpoint-manual-row">
              <input type="text" className="cssu-checkpoint-manual-input" placeholder={isReturnVerification ? 'Enter Return Entry QR or RE code' : 'Enter locator slip code or QR value'} value={manualFacultyId} onChange={event => setManualFacultyId(event.target.value)} onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleManualLookup();
                }
              }} />
            
              <button type="button" className="cssu-checkpoint-search-btn" aria-label="Search locator slip code" onClick={handleManualLookup} disabled={lookupLoading}>
                <FacultySearchIcon />
              </button>
            </div>
            {mobile && <button type="button" className="cssu-checkpoint-qr-trigger" onClick={handleQrLookup} disabled={lookupLoading}>
                <ScanQRIcon color="var(--green)" />
                <span>{isReturnVerification ? 'Scan Return QR' : 'Scan QR'}</span>
              </button>}
          </article>
        </div>

        <div className="cssu-checkpoint-right">
          <article className="cssu-checkpoint-profile-card">
            <div className="cssu-checkpoint-profile-top">
              <div className="cssu-checkpoint-profile-avatar">
                <img src={faculty?.profileImageUrl || DEFAULT_PROFILE_IMAGE} alt={faculty?.facultyName || 'Employee'} />
              </div>
              <div className="cssu-checkpoint-profile-copy">
                <span className="cssu-checkpoint-card-kicker">EMPLOYEE PROFILE</span>
                <h2>{faculty?.facultyName || 'Awaiting Employee Lookup'}</h2>
                <p>{faculty?.departmentName || 'Search or scan an employee ID to fetch the assigned locator slip.'}</p>
              </div>
            </div>

            <div className="cssu-checkpoint-profile-meta">
              <div>
                <span>EMPLOYEE ID</span>
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
                <ISSURosetteCheckIcon color={slipVisualState === 'denied' ? '#D72D2D' : slipVisualState === 'pending' ? '#C28C02' : 'var(--green)'} />
              </div>
              <div className="cssu-checkpoint-slip-copy">
                <span>LOCATOR SLIP STATUS</span>
                <strong>{locatorSlip?.statusLabel || 'WAITING FOR LOOKUP'}</strong>
              </div>
              <div className={`cssu-checkpoint-slip-done ${slipVisualState}`}>
                <CheckCircleSolidIcon color={slipVisualState === 'pending' ? '#E7B825' : slipVisualState === 'denied' ? '#D72D2D' : 'var(--green)'} size="40" />
              </div>
            </div>

            {scanConfidence && <div className={`cssu-scan-confidence-panel ${scanConfidence.tone || 'neutral'}`}>
                <div>
                  <span>SCAN CONFIDENCE</span>
                  <strong>{scanConfidence.title}</strong>
                </div>
                <p>{scanConfidence.message}</p>
                {Number(scanConfidence.repeatAttempts || 0) > 0 && <small>{scanConfidence.repeatAttempts} repeated denied scan attempt{Number(scanConfidence.repeatAttempts || 0) === 1 ? '' : 's'} recorded.</small>}
              </div>}
          </article>

          {isReturnVerification && <article className="cssu-return-timeline-card">
              <span className="cssu-checkpoint-card-kicker">RETURN TIMELINE</span>
              <p className="cssu-return-timeline-note">Review these recorded times before allowing the employee back in.</p>
              <div className="cssu-return-timeline-list">
                <div><span>Locator slip started</span><strong>{locatorSlip?.tripStartedAt ? formatStatusDateTime(locatorSlip.tripStartedAt) : '--'}</strong></div>
                <div><span>Proof of compliance submitted</span><strong>{locatorSlip?.proofSubmittedAt ? formatStatusDateTime(locatorSlip.proofSubmittedAt) : '--'}</strong></div>
                <div><span>Confirm return clicked</span><strong>{locatorSlip?.returnEntryConfirmedAt ? formatStatusDateTime(locatorSlip.returnEntryConfirmedAt) : '--'}</strong></div>
              </div>
            </article>}

          <article className="cssu-checkpoint-log-card">
            <span className="cssu-checkpoint-card-kicker">SECURITY VALIDATION LOG</span>
            <div className="cssu-checkpoint-log-list">
              {validationLog.length === 0 && <div className="cssu-checkpoint-log-empty">{checkpointDescription}</div>}

              {validationLog.map((item, index) => <div key={`${item.title}-${index}`} className={`cssu-checkpoint-log-row ${item.type === 'danger' ? 'danger' : item.type === 'warning' ? 'warning' : 'success'}`}>
                  <div className="cssu-checkpoint-log-message">
                    <span className="dot" />
                    <strong>{item.title}</strong>
                  </div>
                  <span className="time">{item.occurredAt ? formatStatusDateTime(item.occurredAt) : item.timeLabel}</span>
                </div>)}
            </div>
          </article>
        </div>
      </div>

      {(lookupError || actionMessage) && <div className={`cssu-checkpoint-inline-alert ${lookupError ? 'error' : 'success'}`}>
          {lookupError || actionMessage}
        </div>}

      <div className="cssu-checkpoint-actions">
        {!isReturnEntryCheckpoint && <button type="button" className="cssu-checkpoint-btn ghost-danger" onClick={() => handleExitDecision('flagged')} disabled={!locatorSlip?.canFlagIncident || actionLoading}>
        
          <ExclamationCircleIcon color="#D72D2D" size="18" />
          <span>{actionLoading ? 'Updating...' : 'Flag Incident'}</span>
        </button>}
        {!isReturnEntryCheckpoint && <button type="button" className="cssu-checkpoint-btn soft-danger" onClick={() => handleExitDecision('denied')} disabled={!locatorSlip?.canDenyExit || actionLoading}>
        
          <RejectXIcon />
          <span>{actionLoading ? 'Updating...' : 'Deny Exit'}</span>
        </button>}
        <button type="button" className="cssu-checkpoint-btn success" onClick={handleAllowExitClick} disabled={!locatorSlip?.canAllowExit || actionLoading}>
        
          <CheckCircleIcon />
          <span>{actionLoading ? 'Updating...' : allowDecisionLabel}</span>
        </button>
      </div>

      <ISSUGateAssignmentModal open={showGateAssignmentPrompt && gateOfficerKey !== 'shared' && !showGatePicker} onSelect={assignScanDailyGate} onCancel={() => setShowGateAssignmentPrompt(false)} />
      <ISSUGateAssignmentModal open={showGatePicker} onSelect={confirmAllowExit} onCancel={() => setShowGatePicker(false)} />

      {qrScannerOpen && <div className="cssu-qr-scanner-backdrop" onClick={() => {
      stopQrScanner();
      setQrScannerOpen(false);
      setQrScannerStatus('');
    }}>
          <div className="cssu-qr-scanner-modal" onClick={event => event.stopPropagation()}>
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
            <button type="button" className="cssu-gate-picker-cancel" onClick={() => {
          stopQrScanner();
          setQrScannerOpen(false);
          setQrScannerStatus('');
        }}>
          
              Cancel Scan
            </button>
          </div>
        </div>}

      {qrManualEntryReason && <div className="eduroute-dialog-backdrop" role="presentation" onClick={() => setQrManualEntryReason('')}>
          <form className="eduroute-dialog-modal info cssu-manual-code-modal" role="dialog" aria-modal="true" aria-labelledby="cssu-manual-code-title" onClick={event => event.stopPropagation()} onSubmit={async event => {
        event.preventDefault();
        const code = manualFacultyId.trim();
        if (!code) {
          setQrScannerError('Enter the locator slip code before continuing.');
          return;
        }
        setQrManualEntryReason('');
        await runLookup({
          value: code,
          method: 'qr'
        });
      }}>
        
            <div className="eduroute-dialog-icon" aria-hidden="true">#</div>
            <span className="eduroute-dialog-kicker">QR FALLBACK</span>
            <h2 id="cssu-manual-code-title">Enter locator slip code</h2>
            <p>{qrManualEntryReason}</p>
            <label className="eduroute-dialog-field">
              <span>LOCATOR SLIP CODE</span>
              <input value={manualFacultyId} onChange={event => setManualFacultyId(event.target.value)} placeholder="Example: LS-2026-001" autoFocus />
          
            </label>
            <div className="eduroute-dialog-actions">
              <button type="button" className="eduroute-dialog-secondary" onClick={() => setQrManualEntryReason('')}>Cancel</button>
              <button type="submit" className="eduroute-dialog-primary">Verify Code</button>
            </div>
          </form>
        </div>}
    </>;
  if (isDesktopViewport) {
    return <ISSUDesktopPage activeKey={isReturnVerification ? 'return' : 'scan'} title={checkpointTitle} subtitle="Information Security Services Unit" setView={setView} profileData={profileData} onLogout={onLogout}>
        
        {renderCheckpointContent(false)}
      </ISSUDesktopPage>;
  }
  return <div className="admin-dash-wrapper cssu-wrapper">
      <div className="admin-dash-scroll cssu-scroll cssu-checkpoint-mobile-scroll">
        <div className="cssu-header">
          <h1>Security Command</h1>
          <div className="cssu-header-actions">
            <div className="admin-bell-wrapper hrmu-bell-wrapper" onClick={() => setView('cssu-notifications')}>
              <AdminBellIcon color="var(--green)" />
              <div className="admin-bell-dot" />
            </div>
            <div className="cssu-avatar" onClick={() => setView('admin-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Admin" />
            </div>
          </div>
        </div>

        <div className="cssu-content cssu-checkpoint-mobile-layout">
          <div className="cssu-checkpoint-mobile-intro">
            <h2>{checkpointTitle}</h2>
            <p>{checkpointDescription}</p>
          </div>

          <div className="cssu-checkpoint-mobile-shell">
            {renderCheckpointContent(true)}
            {qrScannerError && <div className="cssu-checkpoint-inline-alert error">{qrScannerError}</div>}
          </div>
        </div>
      </div>

      <ISSUBottomNav active={isReturnVerification ? 'return' : 'scan'} setView={setView} />
    </div>;
};
export const ISSUExitVerificationView = props => <ISSUScanView {...props} mode="exit" />;
export const ISSUReturnVerificationView = props => <ISSUScanView {...props} mode="entry" />;
export const ISSUReportsView = ({
  setView,
  profileData,
  onLogout
}) => {
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
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [visibleRecordCount, setVisibleRecordCount] = useState(6);
  const [logSortOrder, setLogSortOrder] = useState('desc');
  const startDateInputRef = useRef(null);
  const endDateInputRef = useRef(null);
  const ISSUDepartmentOptions = [{
    value: 'all',
    label: 'All Departments'
  }, {
    value: 'College of Education, Arts and Sciences',
    label: 'College of Education, Arts and Sciences'
  }, {
    value: 'College of Hospitality and Tourism Management',
    label: 'College of Hospitality and Tourism Management'
  }, {
    value: 'College of Business and Accountancy',
    label: 'College of Business and Accountancy'
  }, {
    value: 'College of Allied Health Studies',
    label: 'College of Allied Health Studies'
  }, {
    value: 'College of Computer Studies',
    label: 'College of Computer Studies'
  }];
  const formatISSUDate = value => {
    if (!value) return 'mm/dd/yyyy';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return 'mm/dd/yyyy';
    return date.toLocaleDateString('en-US', {
      timeZone: 'Asia/Manila',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    });
  };
  const openDatePicker = inputRef => {
    const input = inputRef?.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    } else {
      input.focus();
      input.click();
    }
  };
  const fetchReportsOverview = async filters => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await getISSUReportsOverview(filters);
      setReportData(result);
    } catch (error) {
      setLoadError(error.message || 'Unable to load ISSU reports right now.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchReportsOverview({
      startDate,
      endDate,
      department: selectedDepartment
    });
  }, []);
  const handleGenerateReport = () => {
    setVisibleRecordCount(6);
    fetchReportsOverview({
      startDate,
      endDate,
      department: selectedDepartment
    });
  };
  const handleDownloadPdf = async () => {
    if (loading || downloadLoading) return;
    setDownloadLoading(true);
    try {
      const {
        blob,
        filename
      } = await downloadISSUReportsPdf({
        startDate,
        endDate,
        department: selectedDepartment,
        sortOrder: logSortOrder
      });
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      window.alert(error.message || 'Unable to download the ISSU report.');
    } finally {
      setDownloadLoading(false);
    }
  };
  const handleSendToHrmu = async () => {
    if (loading || sendLoading) return;
    setSendLoading(true);
    try {
      const result = await sendISSUReportToHrmu({
        startDate,
        endDate,
        department: selectedDepartment,
        sortOrder: logSortOrder
      });
      setSendModalOpen(false);
      window.alert(`Report sent to HRMU successfully.\nAttachment: ${result?.filename || 'eduroute-cssu-report.pdf'}`);
    } catch (error) {
      window.alert(error.message || 'Unable to send the ISSU report to HRMU.');
    } finally {
      setSendLoading(false);
    }
  };
  const previewRows = useMemo(() => {
    if (!Array.isArray(reportData?.movementLogs)) return [];
    return [...reportData.movementLogs].sort((left, right) => {
      const leftTime = left?.occurredAt ? new Date(left.occurredAt).getTime() : 0;
      const rightTime = right?.occurredAt ? new Date(right.occurredAt).getTime() : 0;
      return logSortOrder === 'asc' ? leftTime - rightTime : rightTime - leftTime;
    }).slice(0, visibleRecordCount);
  }, [reportData, visibleRecordCount, logSortOrder]);
  const hasMoreRecords = Array.isArray(reportData?.movementLogs) && visibleRecordCount < reportData.movementLogs.length;
  const formatReportFooterDate = value => {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('en-US', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  if (isDesktopViewport) {
    return <ISSUDesktopPage activeKey="reports" setView={setView} profileData={profileData} onLogout={onLogout} hideHeader>
        
        <div className="cssu-reports-hero-row">
          <div className="cssu-reports-hero-copy">
            <span className="cssu-desktop-kicker">Internal Logistics</span>
            <h1>Report Generation</h1>
            <p>Movement data synchronization for Human Resource Management Unit (HRMU).</p>
          </div>

          <div className="cssu-reports-toolbar">
            <button type="button" className="cssu-reports-tool-btn" onClick={handleDownloadPdf} disabled={loading || downloadLoading}>
              <RegistryDownloadIcon />
              <span>{downloadLoading ? 'Exporting...' : 'Export PDF'}</span>
            </button>
            <button type="button" className="cssu-reports-send-btn" onClick={() => setSendModalOpen(true)} disabled={loading || sendLoading}>
              <SendIcon />
              <span>{sendLoading ? 'Sending...' : 'Send to HRMU'}</span>
            </button>
          </div>
        </div>

        <div className="cssu-reports-filter-row">
          <div className="cssu-reports-filter-field">
            <label>START DATE</label>
            <button type="button" className="cssu-reports-date-toggle" onClick={() => openDatePicker(startDateInputRef)}>
              <ClockIcon color="var(--green)" />
              <span>{formatISSUDate(startDate)}</span>
            </button>
            <input ref={startDateInputRef} type="date" className="cssu-reports-date-native" value={startDate} onChange={event => setStartDate(event.target.value)} aria-label="Start date" />
            
          </div>

          <div className="cssu-reports-filter-field">
            <label>END DATE</label>
            <button type="button" className="cssu-reports-date-toggle" onClick={() => openDatePicker(endDateInputRef)}>
              <ClockIcon color="var(--green)" />
              <span>{formatISSUDate(endDate)}</span>
            </button>
            <input ref={endDateInputRef} type="date" className="cssu-reports-date-native" value={endDate} onChange={event => setEndDate(event.target.value)} aria-label="End date" />
            
          </div>

          <div className="cssu-reports-filter-field department">
            <label>DEPARTMENT</label>
            <div className="cssu-reports-select-shell">
              <GlobeSmIcon color="var(--green)" />
              <select value={selectedDepartment} onChange={event => setSelectedDepartment(event.target.value)} aria-label="Department">
                
                {ISSUDepartmentOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <ChevronDownIcon />
            </div>
          </div>

          <button type="button" className="cssu-reports-generate-btn" onClick={handleGenerateReport} disabled={loading}>
            <HrmuChartIcon color="#111827" />
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
                <p>Displaying data for {reportData?.filters?.dateRangeLabel || `${formatISSUDate(startDate)} - ${formatISSUDate(endDate)}`}</p>
              </div>
              <div className="cssu-reports-preview-controls">
                <div className="cssu-reports-sort-toggle" aria-label="Movement log sort order">
                  <button type="button" className={logSortOrder === 'desc' ? 'active' : ''} onClick={() => setLogSortOrder('desc')}>
                    
                    Descending
                  </button>
                  <button type="button" className={logSortOrder === 'asc' ? 'active' : ''} onClick={() => setLogSortOrder('asc')}>
                    
                    Ascending
                  </button>
                </div>
                <span className="cssu-reports-draft-pill">DRAFT REPORT</span>
              </div>
            </div>

            <div className="cssu-reports-preview-list">
              {loading && previewRows.length === 0 ? <div className="cssu-reports-empty-state">Loading movement logs...</div> : null}

              {!loading && !loadError && previewRows.length === 0 ? <div className="cssu-reports-empty-state">No verified or flagged movements were found in the selected date range.</div> : null}

              {previewRows.map(row => <article key={row.id} className={`cssu-reports-preview-row ${row.movementStatus === 'flagged' ? 'flagged' : ''}`}>
                  <div className={`cssu-reports-preview-avatar ${row.movementStatus === 'flagged' ? 'flagged' : ''}`}>
                    {row.movementStatus === 'flagged' ? <ExclamationCircleIcon color="#C81E1E" size="24" /> : <PersonOutlineIcon color="var(--green)" />}
                  </div>
                  <div className="cssu-reports-preview-copy">
                    <strong>{row.facultyName}</strong>
                    <p>{row.departmentName} • {row.eventLabel} • {row.occurredDateTimeLabel || row.occurredTimeLabel}</p>
                  </div>
                  <span className={`cssu-reports-preview-status ${row.movementStatus === 'flagged' ? 'flagged' : 'verified'}`}>
                    {row.movementStatusLabel}
                  </span>
                  <span className={`cssu-reports-preview-place ${row.movementStatus === 'flagged' ? 'flagged' : ''}`}>
                    {row.movementStatus === 'flagged' ? row.investigationLabel || row.locationLabel : row.locationLabel}
                  </span>
                </article>)}
            </div>

            {hasMoreRecords ? <button type="button" className="cssu-reports-load-link" onClick={() => setVisibleRecordCount(current => current + 6)}>
                LOAD MORE RECORDS
              </button> : null}
          </section>

          <aside className="cssu-reports-side-stack">
            <article className="cssu-reports-summary-card">
              <span>TOTAL MOVEMENTS</span>
              <strong>{reportData?.summary?.totalMovements ?? 0}</strong>
              <p>Verified and flagged ISSU movement records within the selected report range.</p>

              <div className="cssu-reports-summary-metrics">
                <div><label>Exit Clearances</label><b>{reportData?.summary?.exitClearances ?? 0}</b></div>
                <div className="flagged"><label>Flagged Events</label><b>{reportData?.summary?.flaggedEvents ?? 0}</b></div>
              </div>
            </article>

            <article className="cssu-reports-activity-card">
              <span>ACTIVITY BY DEPT.</span>
              <div className="cssu-reports-activity-list">
                {Array.isArray(reportData?.activityByDepartment) && reportData.activityByDepartment.length > 0 ? reportData.activityByDepartment.map(row => <div key={row.departmentName} className="cssu-reports-activity-row">
                    <div className="cssu-reports-activity-labels">
                      <strong>{row.departmentName}</strong>
                      <b>{row.percentage}%</b>
                    </div>
                    <div className="cssu-reports-activity-track">
                      <div style={{
                    width: `${Math.min(row.percentage, 100)}%`
                  }} />
                    </div>
                  </div>) : <div className="cssu-reports-empty-state compact">No department locator slip activity was found in the selected range.</div>}
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
            <strong>Report ID: {reportData?.reportMeta?.reportId || 'cssu-REPORT-DRAFT'}</strong>
            <span>Last Generated: {reportData?.reportMeta?.lastGeneratedLabel || formatReportFooterDate(new Date().toISOString())}</span>
          </div>
        </footer>

        {sendModalOpen ? <div className="cssu-send-report-overlay" onClick={() => !sendLoading && setSendModalOpen(false)}>
            <div className="cssu-send-report-modal" onClick={event => event.stopPropagation()}>
              <span className="cssu-send-report-kicker">PDF ATTACHMENT</span>
              <h3>Send report to HRMU?</h3>
              <p>
                This will send the generated movement report PDF for
                <strong>{` ${formatISSUDate(startDate)} - ${formatISSUDate(endDate)}`}</strong>
                {' '}to the HRMU inbox.
              </p>
              <div className="cssu-send-report-attachment">
                <DocumentIcon color="var(--green)" width="20" height="20" />
                <div>
                  <strong>{`eduroute-cssu-movement-${startDate.replace(/-/g, '')}-${endDate.replace(/-/g, '')}.pdf`}</strong>
                  <span>{selectedDepartment === 'all' ? 'All Departments' : selectedDepartment}</span>
                </div>
              </div>
              <div className="cssu-send-report-actions">
                <button type="button" className="cssu-send-report-cancel" onClick={() => setSendModalOpen(false)} disabled={sendLoading}>
                  Cancel
                </button>
                <button type="button" className="cssu-send-report-primary" onClick={handleSendToHrmu} disabled={sendLoading}>
                  {sendLoading ? 'Sending...' : 'Send PDF'}
                </button>
              </div>
            </div>
          </div> : null}
      </ISSUDesktopPage>;
  }
  return <div className="admin-dash-wrapper cssu-wrapper">
      <div className="admin-dash-scroll cssu-scroll">
        <div className="cssu-header cssu-map-mobile-header">
          <h1>Security Command</h1>
          <div className="cssu-header-actions">
            <div className="admin-bell-wrapper hrmu-bell-wrapper" onClick={() => setView('cssu-notifications')}>
              <AdminBellIcon color="var(--green)" />
              <div className="admin-bell-dot" />
            </div>
            <div className="cssu-avatar" onClick={() => setView('admin-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Admin" />
            </div>
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
                  <ClockIcon color="var(--green)" />
                  <span>{formatISSUDate(startDate)}</span>
                </button>
                <input ref={startDateInputRef} type="date" className="cssu-reports-date-native" value={startDate} onChange={event => setStartDate(event.target.value)} aria-label="Start date" />
                
              </div>

              <div className="cssu-mobile-reports-field">
                <label>End Date</label>
                <button type="button" className="cssu-mobile-reports-date-btn" onClick={() => openDatePicker(endDateInputRef)}>
                  <ClockIcon color="var(--green)" />
                  <span>{formatISSUDate(endDate)}</span>
                </button>
                <input ref={endDateInputRef} type="date" className="cssu-reports-date-native" value={endDate} onChange={event => setEndDate(event.target.value)} aria-label="End date" />
                
              </div>
            </div>

            <div className="cssu-mobile-reports-field">
              <label>Department</label>
              <div className="cssu-mobile-reports-select">
                <GlobeSmIcon color="var(--green)" />
                <select value={selectedDepartment} onChange={event => setSelectedDepartment(event.target.value)} aria-label="Department">
                  
                  {ISSUDepartmentOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <ChevronDownIcon />
              </div>
            </div>

            <button type="button" className="cssu-mobile-reports-generate" onClick={handleGenerateReport} disabled={loading}>
              <HrmuChartIcon color="#111827" />
              <span>{loading ? 'Loading...' : 'Generate'}</span>
            </button>

            <div className="cssu-mobile-reports-actions">
              <button type="button" className="cssu-mobile-reports-action-btn pdf" onClick={handleDownloadPdf} disabled={loading || downloadLoading}>
                
                <RegistryDownloadIcon />
                <span>{downloadLoading ? 'Exporting...' : 'Export PDF'}</span>
              </button>
              <button type="button" className="cssu-mobile-reports-send-btn" onClick={() => setSendModalOpen(true)} disabled={loading || sendLoading}>
                
                <SendIcon />
                <span>{sendLoading ? 'Sending...' : 'Send to HRMU'}</span>
              </button>
            </div>
          </section>

          {loadError ? <div className="cssu-reports-error-banner">{loadError}</div> : null}

          <section className="cssu-mobile-reports-preview">
            <div className="cssu-mobile-reports-preview-head">
              <div>
                <h3>Movement Logs Preview</h3>
                <p>{reportData?.filters?.dateRangeLabel || `${formatISSUDate(startDate)} - ${formatISSUDate(endDate)}`}</p>
              </div>
              <strong>{reportData?.summary?.totalMovements ?? 0} Records</strong>
            </div>

            <div className="cssu-mobile-reports-sort-toggle" aria-label="Movement log sort order">
              <button type="button" className={logSortOrder === 'desc' ? 'active' : ''} onClick={() => setLogSortOrder('desc')}>
                
                Descending
              </button>
              <button type="button" className={logSortOrder === 'asc' ? 'active' : ''} onClick={() => setLogSortOrder('asc')}>
                
                Ascending
              </button>
            </div>

            <div className="cssu-mobile-reports-list">
              {loading && previewRows.length === 0 ? <div className="cssu-mobile-reports-empty">Loading movement logs...</div> : null}

              {!loading && !loadError && previewRows.length === 0 ? <div className="cssu-mobile-reports-empty">No verified or flagged movements were found in the selected date range.</div> : null}

              {previewRows.map(row => <article key={row.id} className={`cssu-mobile-reports-row ${row.movementStatus === 'flagged' ? 'flagged' : ''}`}>
                  <img src={DEFAULT_PROFILE_IMAGE} alt={row.facultyName} className="cssu-mobile-reports-avatar" />
                  <div className="cssu-mobile-reports-copy">
                    <strong>{row.facultyName}</strong>
                    <p>{row.occurredDateTimeLabel || row.occurredTimeLabel} • {row.locationLabel}</p>
                  </div>
                  <span className={`cssu-mobile-reports-status ${row.movementStatus === 'flagged' ? 'flagged' : 'verified'}`}>
                    {row.movementStatusLabel}
                  </span>
                </article>)}
            </div>

            {hasMoreRecords ? <button type="button" className="cssu-mobile-reports-load-more" onClick={() => setVisibleRecordCount(current => current + 6)}>
              
                Load More Records
              </button> : null}
          </section>
        </div>

        {sendModalOpen ? <div className="cssu-send-report-overlay" onClick={() => !sendLoading && setSendModalOpen(false)}>
            <div className="cssu-send-report-modal" onClick={event => event.stopPropagation()}>
              <span className="cssu-send-report-kicker">PDF ATTACHMENT</span>
              <h3>Send report to HRMU?</h3>
              <p>
                This will send the generated movement report PDF for
                <strong>{` ${formatISSUDate(startDate)} - ${formatISSUDate(endDate)}`}</strong>
                {' '}to the HRMU inbox.
              </p>
              <div className="cssu-send-report-attachment">
                <DocumentIcon color="var(--green)" width="20" height="20" />
                <div>
                  <strong>{`eduroute-cssu-movement-${startDate.replace(/-/g, '')}-${endDate.replace(/-/g, '')}.pdf`}</strong>
                  <span>{selectedDepartment === 'all' ? 'All Departments' : selectedDepartment}</span>
                </div>
              </div>
              <div className="cssu-send-report-actions">
                <button type="button" className="cssu-send-report-cancel" onClick={() => setSendModalOpen(false)} disabled={sendLoading}>
                  Cancel
                </button>
                <button type="button" className="cssu-send-report-primary" onClick={handleSendToHrmu} disabled={sendLoading}>
                  {sendLoading ? 'Sending...' : 'Send PDF'}
                </button>
              </div>
            </div>
          </div> : null}

        <ISSUBottomNav active="reports" setView={setView} />
      </div>
    </div>;
};
export const ISSUNotificationsView = ({
  setView,
  profileData,
  onLogout
}) => {
  const isDesktopViewport = useDesktopWorkspaceViewport();
  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState('');
  const [alertFilter, setAlertFilter] = useState('all');
  const [summary, setSummary] = useState({
    validatedClearances: 0,
    flaggedExits: 0,
    unauthorizedExit: 0
  });
  useEffect(() => {
    let isMounted = true;
    const formatRelativeAlertTime = value => {
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
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric'
      });
    };
    const loadAlerts = async () => {
      setAlertsLoading(true);
      setAlertsError('');
      try {
        const result = await getISSUNotificationsOverview({
          limit: 8
        });
        if (!isMounted) return;
        const notificationRows = Array.isArray(result?.notifications) ? result.notifications : [];
        setAlerts(notificationRows.map(notification => ({
          id: notification.id,
          type: notification.type === 'flagged' ? 'flagged' : 'validated',
          locatorSlipCode: notification.locatorSlipCode || null,
          title: notification.title || (notification.type === 'flagged' ? 'Flagged Exit Attempt' : 'Exit Clearance Validated'),
          body: notification.type === 'flagged' ? `${notification.facultyName} attempted exit clearance at ${notification.gateLabel} while the locator slip was still ${notification.locatorSlipStatus}.` : `${notification.facultyName} was cleared by ISSU for ${notification.purpose}${notification.destination ? ` bound for ${notification.destination}` : ''}.`,
          time: formatRelativeAlertTime(notification.occurredAt),
          sortDate: notification.occurredAt ? new Date(notification.occurredAt).getTime() : 0,
          actionLabelPrimary: notification.type === 'flagged' ? 'Open Incidents' : 'Open Exit Clearance',
          actionLabelSecondary: notification.type === 'flagged' ? 'Open Reports' : 'Open Dashboard'
        })));
        setSummary({
          validatedClearances: Number(result?.summary?.validatedClearances || 0),
          flaggedExits: Number(result?.summary?.flaggedExits || 0),
          unauthorizedExit: Number(result?.summary?.unauthorizedExit || 0)
        });
      } catch (error) {
        if (!isMounted) return;
        setAlerts([]);
        setSummary({
          validatedClearances: 0,
          flaggedExits: 0,
          unauthorizedExit: 0
        });
        setAlertsError(error.message || 'Failed to load ISSU notifications.');
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
  const filteredAlerts = alerts.filter(alert => {
    if (alertFilter === 'validated') return alert.type === 'validated';
    if (alertFilter === 'flagged') return alert.type === 'flagged';
    return true;
  });
  const featuredAlert = filteredAlerts[0] || null;
  const featuredTone = featuredAlert?.type === 'flagged' ? 'incident' : 'verified';
  const featuredPillLabel = alertsLoading ? 'LOADING' : featuredAlert?.type === 'flagged' ? 'FLAGGED' : featuredAlert ? 'VALIDATED' : 'NO ALERTS';
  const openAlertExitClearance = alert => {
    if (alert?.type === 'flagged') {
      setView('cssu-incidents');
      return;
    }
    if (alert?.locatorSlipCode) {
      localStorage.setItem('edurouteISSUPendingLocatorSlipCode', alert.locatorSlipCode);
      localStorage.setItem('edurouteISSUPendingLookupSource', 'notification-exit-clearance');
    }
    setView('cssu-scan');
  };
  if (!isDesktopViewport) {
    return <div className="dashboard-wrapper">
        <div className="content fade-in dash-content notif-content cssu-mobile-notif-content">
          <div className="slip-top-nav chpw-top-nav">
            <div className="slip-nav-left" onClick={() => setView('cssu-dashboard')}>
              <BackArrowIcon color="var(--green)" />
              <span className="dash-logo-text chpw-nav-title">EduRoute</span>
            </div>
            <div className="dash-avatar">
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="ISSU Profile" style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }} />
            </div>
          </div>

          <div className="chpw-divider-line" />

          <div className="notif-header">
            <span className="notif-label-green">INTERNAL LOGISTICS</span>
            <h1 className="notif-title">System Alerts</h1>
            <p className="notif-subtitle">Real-time monitoring and clearance notifications after locator slips are validated by ISSU.</p>
          </div>

          <div className="cssu-mobile-notif-sticky-header">
            <div className="cssu-mobile-notif-filter-row">
              <button type="button" className={`status-filter-chip ${alertFilter === 'all' ? 'active' : ''}`} onClick={() => setAlertFilter('all')}>
                
                All
              </button>
              <button type="button" className={`status-filter-chip ${alertFilter === 'validated' ? 'active' : ''}`} onClick={() => setAlertFilter('validated')}>
                
                Validated
              </button>
              <button type="button" className={`status-filter-chip ${alertFilter === 'flagged' ? 'active' : ''}`} onClick={() => setAlertFilter('flagged')}>
                
                Flagged
              </button>
            </div>

            <div className="cssu-mobile-notif-summary">
              <div className="cssu-mobile-notif-summary-card">
                <span>Validated</span>
                <strong>{String(summary.validatedClearances || 0).padStart(2, '0')}</strong>
              </div>
              <div className="cssu-mobile-notif-summary-card">
                <span>Flagged</span>
                <strong>{String(summary.flaggedExits || 0).padStart(2, '0')}</strong>
              </div>
              <div className="cssu-mobile-notif-summary-card">
                <span>Unauthorized</span>
                <strong>{String(summary.unauthorizedExit || 0).padStart(2, '0')}</strong>
              </div>
            </div>
          </div>

          {alertsError ? <div className="cssu-mobile-incident-empty error">{alertsError}</div> : null}
          {alertsLoading ? <div className="cssu-mobile-incident-empty">Loading system alerts...</div> : null}
          {!alertsLoading && filteredAlerts.length === 0 ? <div className="cssu-mobile-incident-empty">No {alertFilter === 'all' ? '' : alertFilter} alerts available right now.</div> : null}

          {!alertsLoading && filteredAlerts.map(alert => {
          const tone = alert.type === 'flagged' ? 'moderate' : 'low';
          return <div key={alert.id} className={`cssu-mobile-incident-card ${tone}`}>
                <div className="cssu-mobile-incident-top">
                  <span className={`cssu-mobile-incident-badge ${tone}`}>
                    {alert.type === 'flagged' ? 'FLAGGED' : 'VALIDATED'}
                  </span>
                  <time>{alert.time}</time>
                </div>
                <h3>{alert.title}</h3>
                <p>{alert.body}</p>
                <div className="cssu-mobile-notif-actions">
                  <button type="button" className="cssu-mobile-notif-action primary" onClick={() => openAlertExitClearance(alert)}>
                    
                    {alert.actionLabelPrimary}
                  </button>
                  <button type="button" className="cssu-mobile-notif-action secondary" onClick={() => setView(alert.type === 'flagged' ? 'cssu-reports' : 'cssu-dashboard')}>
                    
                    {alert.actionLabelSecondary}
                  </button>
                </div>
              </div>;
        })}
        </div>
        <ISSUBottomNav active="" setView={setView} />
      </div>;
  }
  return <ISSUDesktopPage activeKey="" setView={setView} profileData={profileData} onLogout={onLogout} hideHeader>
      
      <section className="hrmu-alerts-page cssu-alerts-page">
        <div className="hrmu-alerts-hero">
          <div className="hrmu-alerts-copy">
            <span className="hrmu-alerts-kicker">INTERNAL LOGISTICS</span>
            <h1>System Alerts</h1>
            <p>Real-time monitoring and clearance notifications for ISSU employee exit verification.</p>
          </div>
          <div className="hrmu-alerts-actions">
            <button type="button" className="hrmu-alerts-btn ghost">Mark all read</button>
            <label className="hrmu-alerts-filter">
              <StatusGraphIcon color="currentColor" />
              <select value={alertFilter} onChange={event => setAlertFilter(event.target.value)} aria-label="Filter ISSU alerts">
                <option value="all">All</option>
                <option value="validated">Validated</option>
                <option value="flagged">Flagged</option>
              </select>
            </label>
          </div>
        </div>

        <section className="hrmu-alerts-grid">
          <div className="hrmu-alert-feed-column">
            {alertsLoading ? <div className="hrmu-alert-feed-empty">Loading system alerts...</div> : null}

            {!alertsLoading && !alertsError && filteredAlerts.length === 0 ? <div className="hrmu-alert-feed-empty">
                No {alertFilter === 'all' ? 'ISSU' : alertFilter} alerts available right now.
              </div> : null}

            {!alertsLoading && filteredAlerts.length > 0 ? <div className="hrmu-alert-feed-list">
                {filteredAlerts.map(alert => {
              const tone = alert.type === 'flagged' ? 'incident' : 'verified';
              return <article key={alert.id} className={`hrmu-alert-feed-card ${tone}`}>
                      <div className="hrmu-alert-feed-accent" aria-hidden="true" />
                      <div className="hrmu-alert-feed-body">
                        <div className={`hrmu-alert-feed-icon ${tone}`}>
                          {alert.type === 'flagged' ? <HrmuWarningIcon /> : <NotifSlipIcon />}
                        </div>
                        <div className="hrmu-alert-feed-copy">
                          <div className="hrmu-alert-feed-head">
                            <span className={`hrmu-alert-critical-pill ${tone}`}>
                              {alert.type === 'flagged' ? 'FLAGGED' : 'VALIDATED'}
                            </span>
                            <span className="hrmu-alert-feed-time">{alert.time}</span>
                          </div>
                          <h2>{alert.title}</h2>
                          <p>{alert.body}</p>
                          <div className="hrmu-alert-feed-actions">
                            <button type="button" className={`hrmu-alert-primary-btn ${tone}`} onClick={() => openAlertExitClearance(alert)}>
                            
                              {alert.actionLabelPrimary || 'Open Exit Clearance'}
                            </button>
                            <button type="button" className="hrmu-alert-text-btn" onClick={() => setView(alert.type === 'flagged' ? 'cssu-reports' : 'cssu-dashboard')}>
                            
                              {alert.actionLabelSecondary || 'Open Dashboard'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>;
            })}
              </div> : null}
          </div>

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
    </ISSUDesktopPage>;
};

