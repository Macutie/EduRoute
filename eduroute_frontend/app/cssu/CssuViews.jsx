import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL } from "../../config";
import { useHrmuLiveTracking } from "../../hooks/useHrmuLiveTracking";
import { useNotificationSocket } from "../../hooks/useNotificationSocket";
import { getCssuDashboardSummary, getCssuActivityTimeline, getCssuFacultyExitHistory, getCssuIncidentsOverview, getCssuLiveExitMonitoring, getCssuNotificationsOverview, getCssuReportsOverview, downloadCssuReportsPdf, sendCssuReportToHrmu, lookupCssuExitCandidate, updateCssuExitStatus } from "../../services/cssuApi";
import { getCssuActiveFaculty, getCssuFacultyActivity, getCssuFacultyLiveDetail } from "../../services/cssuLiveTrackingApi";
import FacultyActivityLog from "../../components/hrmu/FacultyActivityLog";
import FacultyDetailCard from "../../components/hrmu/FacultyDetailCard";
import { AdminBadgeIcon, AdminBellIcon, AdminEmailOutlineIcon, AdminProfileChevronIcon, AdminProfileIdIcon, AdminProfileLogoutIcon, AdminProfilePasswordIcon, AdminRoleIcon, AdminSaveCheckIcon, ApproveCheckIcon, ArrowRightIcon, AtSymbolIcon, BackArrowIcon, BadgeIcon, BatteryIcon, BellRingIcon, BriefcaseIcon, CameraIcon, CapIcon, CheckCircleAdminIcon, CheckCircleIcon, CheckCircleSolidIcon, ChevronDownIcon, ChevronRightIcon, ClipboardCheckIcon, ClipboardClockIcon, ClockIcon, CssuChartIcon, CssuExitDoorIcon, CssuIncidentsNavIcon, CssuMapNavIcon, CssuReportsNavIcon, CssuRoleIcon, CssuRosetteCheckIcon, CssuScanNavIcon, CssuTrendingUpIcon, CssuWarningCircleIcon, CssuWarningTriangleIcon, DashboardNavIcon, DeanNotificationDocIcon, DetailClockIcon, DetailClockReturnIcon, DetailDocIcon, DetailPinIcon, DetailRouteIcon, DocumentIcon, DummySignature, EditPencilIcon, EwanIcon, ExclamationCircleIcon, EyeIcon, EyeOffIcon, FacultyCheckCircleIcon, FacultyChevronRightIcon, FacultyCopyIcon, FacultyCrossCircleIcon, FacultyDocIcon, FacultyFilterIcon, FacultyIdBadgeIcon, FacultyNavIcon, FacultyRoleIcon, FacultySearchIcon, FacultyWaitCircleIcon, FileTextIcon, FilledClockIcon, FlashlightIcon, GlobeIcon, GlobeSmIcon, GraduationCapIcon, GridIcon, HeadsetIcon, HelpCircleIcon, HelpIcon, HomeNavIcon, HourglassIcon, HrmuAlertTinyIcon, HrmuChartIcon, HrmuCheckTinyIcon, HrmuExportIcon, HrmuEyeMiniIcon, HrmuFilterIcon, HrmuMapRouteIcon, HrmuMiniCheckIcon, HrmuPinMiniIcon, HrmuReportIcon, HrmuRoleIcon, HrmuSidebarGridIcon, HrmuSyncIcon, HrmuVerificationIcon, HrmuViewRouteIcon, HrmuWarningIcon, IdBadgeIcon, InboxArchiveIcon, InfoIcon, LinkIcon, LocationPinFilledIcon, LocationPinIcon, LockIcon, LockPrivIcon, LockSmallIcon, LoginDoorIcon, LogoutIcon, MailIcon, MapFoldIcon, MapIcon, ModalCloseIcon, NotifPendingIcon, NotifSlipIcon, NotificationIcon, PasswordIcon, PermissionsIcon, PersonOutlineIcon, PinIcon, PlayTriangleIcon, PolicyBulbIcon, PolicyCheckIcon, PrivacyIcon, ProfileEditIcon, ProfileNavIcon, ProgressReviewIcon, QuestionCircleIcon, RefreshClockIcon, RefreshIcon, RegistryDownloadIcon, RegistryModalCloseIcon, RegistryModalDoneIcon, RegistryModalIdIcon, RegistryModalVerifiedIcon, RegistryNavIcon, RejectXIcon, RemarksIcon, ReportPrintIcon, RequestsNavIcon, SaveIcon, ScanQRIcon, SendIcon, ShieldCheckIcon, ShieldCheckSmallIcon, ShieldSearchIcon, ShieldSolidIcon, SignalIcon, SignatureNavIcon, SlashedPersonIcon, SlipIcon, StatusGraphIcon, TogaLogoIcon, ToggleSwitch, TrashIcon, UploadIcon, UsersAdminIcon, WifiIcon, XCircleIcon } from "../../components/icons/AppIcons.jsx";
import { DEFAULT_PROFILE_IMAGE } from "../shared/appUtils.js";
import { HrmuLiveMapPanel, OLONGAPO_CENTER } from "../hrmu/HrmuViews.jsx";
import { formatStatusDateTime } from "../faculty/FacultyViews.jsx";
// --------------------------------------------------------
// CSSU DASHBOARD COMPONENTS
// --------------------------------------------------------

export const CSSUBottomNav = ({
  active = 'dashboard',
  setView
}) => <div className="admin-bottom-nav cssu-bottom-nav">
    <div className={`admin-nav-item ${active === 'dashboard' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('cssu-dashboard')}>
      <DashboardNavIcon color={active === 'dashboard' ? 'var(--green)' : '#9CA3AF'} />
      <span>DASHBOARD</span>
    </div>
    <div className={`admin-nav-item ${active === 'map' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('cssu-map')}>
      <CssuMapNavIcon color={active === 'map' ? 'var(--green)' : '#9CA3AF'} />
      <span>MAP</span>
    </div>
    <div className={`admin-nav-item ${active === 'scan' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('cssu-scan')}>
      <CssuScanNavIcon color={active === 'scan' ? 'var(--green)' : '#9CA3AF'} />
      <span>SCAN</span>
    </div>
    <div className={`admin-nav-item ${active === 'reports' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('cssu-reports')}>
      <CssuReportsNavIcon color={active === 'reports' ? 'var(--green)' : '#9CA3AF'} />
      <span>REPORTS</span>
    </div>
  </div>;
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

const getCssuExitHistoryStatusLabel = (item = {}) => {
  const normalizedStatus = String(item.status || item.statusLabel || '').toLowerCase();

  if (normalizedStatus === 'approved' || normalizedStatus === 'validated') {
    return 'Visited';
  }

  return item.statusLabel || item.status || 'Visited';
};

const normalizeCssuExitHistoryRows = (rows = []) => (
  Array.isArray(rows)
    ? rows.map((item) => ({
      ...item,
      statusLabel: getCssuExitHistoryStatusLabel(item),
    }))
    : []
);

export const CssuWorkspaceShell = ({
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
    label: 'Exit Clearance',
    icon: CssuScanNavIcon,
    target: 'cssu-scan'
  }, {
    key: 'map',
    label: 'Live Tracking',
    icon: CssuMapNavIcon,
    target: 'cssu-map'
  }, {
    key: 'reports',
    label: 'Reports',
    icon: CssuReportsNavIcon,
    target: 'cssu-reports'
  }];
  return <div className="cssu-workspace">
      <aside className="cssu-sidebar">
        <div className="cssu-sidebar-top">
          <div className="cssu-brand-lockup">
            <div className="cssu-brand-badge" />
            <div className="cssu-brand-text">
              <strong>EduRoute</strong>
              <span>CSSU ADMIN</span>
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
    </div>;
};
export const CSSUDesktopPage = ({
  activeKey,
  title,
  subtitle,
  setView,
  profileData,
  onLogout,
  children,
  hideHeader = false
}) => <CssuWorkspaceShell activeKey={activeKey} setView={setView} profileData={profileData} onLogout={onLogout}>
    <section className="cssu-desktop-page">
      {!hideHeader && <div className="cssu-desktop-page-header">
          <div>
            <span className="cssu-desktop-kicker">Campus Operations</span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </div>}
      {children}
    </section>
  </CssuWorkspaceShell>;
export const CSSUDashboardDesktopViewLegacy = ({
  setView,
  profileData,
  onLogout
}) => <CSSUDesktopPage activeKey="dashboard" title="CSSU Security Command" subtitle="Real-time Faculty Exit & Locator Monitoring" setView={setView} profileData={profileData} onLogout={onLogout}>
  
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
            <span>{`${getCssuDutyManagerLabel(profileData)} • ACTIVE`}</span>
          </div>
        </article>
      </aside>
    </div>
  </CSSUDesktopPage>;
export const getCssuDutyManagerLabel = profileData => profileData?.fullName || profileData?.email || 'CSSU Account';
export const CSSUDashboardDesktopView = ({
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
  const [selectedGate, setSelectedGate] = useState('main_gate');
  const [liveRows, setLiveRows] = useState([]);
  const [activityRows, setActivityRows] = useState([]);
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
    let isMounted = true;
    const loadDashboard = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const [summaryData, liveData, timelineData] = await Promise.all([getCssuDashboardSummary(), getCssuLiveExitMonitoring({
          gate: selectedGate,
          limit: 20
        }), getCssuActivityTimeline({
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
  const approvedRateLabel = summary.totalFacultyExiting ? `${summary.approvalRate}% approved today` : 'No tracked exits yet';
  const selectedGateLabel = selectedGate === 'main_gate' ? 'Main Gate' : 'Back Gate';
  const latestActivity = activityRows[0] || null;
  const operationalInsights = [summary.totalFacultyExiting > 0 ? `${summary.totalFacultyExiting} faculty exit record${Number(summary.totalFacultyExiting) === 1 ? '' : 's'} tracked today.` : 'No faculty exits are currently tracked today.', liveRows.length > 0 ? `${liveRows.length} locator slip${liveRows.length === 1 ? '' : 's'} visible in the ${selectedGateLabel} live monitoring queue.` : `${selectedGateLabel} has no queued approved locator slips right now.`, summary.rejectedLocatorSlips > 0 ? `${summary.rejectedLocatorSlips} rejected locator slip${Number(summary.rejectedLocatorSlips) === 1 ? '' : 's'} need CSSU review or intervention.` : 'No rejected locator slips are reported today.', summary.repeatAttempts > 0 ? `${summary.repeatAttempts} repeat scan attempt${Number(summary.repeatAttempts) === 1 ? '' : 's'} detected today.` : 'No repeat scan attempts detected today.', latestActivity ? `Latest gate activity: ${latestActivity.title || 'Activity logged'} for ${latestActivity.facultyName || 'a faculty user'} at ${latestActivity.gateLabel || selectedGateLabel}.` : 'No gate activity has been logged yet.'];
  const openExitClearanceForRow = row => {
    if (!row?.locatorSlipCode) return;
    localStorage.setItem('edurouteCssuPendingLocatorSlipCode', row.locatorSlipCode);
    localStorage.setItem('edurouteCssuPendingLookupSource', 'dashboard-eye');
    setView('cssu-scan');
  };
  const openFacultyHistory = async row => {
    if (!row?.facultyUserId) return;
    setHistoryDrawer({
      open: true,
      loading: true,
      error: '',
      facultyName: row.facultyName || 'Faculty user',
      rows: []
    });
    try {
      const history = await getCssuFacultyExitHistory(row.facultyUserId, {
        limit: 12
      });
      setHistoryDrawer({
        open: true,
        loading: false,
        error: '',
        facultyName: row.facultyName || 'Faculty user',
        rows: normalizeCssuExitHistoryRows(history?.rows)
      });
    } catch (error) {
      setHistoryDrawer({
        open: true,
        loading: false,
        error: error.message || 'Unable to load faculty exit history.',
        facultyName: row.facultyName || 'Faculty user',
        rows: []
      });
    }
  };
  return <CSSUDesktopPage activeKey="dashboard" title="CSSU Security Command" subtitle="Real-time Faculty Exit & Locator Monitoring" setView={setView} profileData={profileData} onLogout={onLogout} hideHeader>
      
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
          <button type="button" className="cssu-summary-btn" onClick={() => setSummaryModalOpen(true)} disabled={loading}>
            Generate Summary
          </button>
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
          <button type="button" className="cssu-desktop-inline-btn" onClick={() => setView('cssu-scan')}>Review</button>
        </article>

        <article className="cssu-desktop-mini-card">
          <div className="cssu-desktop-mini-icon warn">
            <CssuWarningTriangleIcon />
          </div>
          <span className="cssu-desktop-mini-label">Repeat Attempts</span>
          <strong>{summary.repeatAttempts || 0}</strong>
          <small>{summary.suspiciousAttempts ? `${summary.suspiciousAttempts} suspicious scans today` : 'No suspicious scans today'}</small>
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

            {loading && <div className="cssu-desktop-log-empty">Loading live exit monitoring...</div>}

            {!loading && loadError && <div className="cssu-desktop-log-empty error">{loadError}</div>}

            {!loading && !loadError && liveRows.length === 0 && <div className="cssu-desktop-log-empty">No approved locator slips are queued for this gate yet.</div>}

            {!loading && !loadError && liveRows.map(row => {
            const statusClass = row.status === 'validated' ? 'valid' : row.status === 'denied' ? 'flagged' : 'approved';
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
              <strong>Today&apos;s Busiest Gate</strong>
              <span>{summary.busiestGateLabel || 'Main Gate'} with {summary.busiestGateCount || 0} CSSU decisions.</span>
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
              <span>{`${getCssuDutyManagerLabel(profileData)} • ACTIVE`}</span>
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
            <span className="cssu-desktop-kicker">Faculty Exit History</span>
            <h2>{historyDrawer.facultyName}</h2>
            {historyDrawer.loading ? <div className="cssu-desktop-log-empty">Loading history...</div> : historyDrawer.error ? <div className="cssu-desktop-log-empty error">{historyDrawer.error}</div> : historyDrawer.rows.length ? <div className="cssu-history-list">
                {historyDrawer.rows.map(item => <div key={item.id} className={`cssu-history-item ${String(item.status || '').includes('denied') || String(item.status || '').includes('rejected') ? 'danger' : ''}`}>
                    <strong>{item.statusLabel || item.status}</strong>
                    <span>{item.locatorSlipCode} • {item.destination}</span>
                    <small>{item.gateLabel} • {item.occurredTimeLabel}</small>
                  </div>)}
              </div> : <div className="cssu-desktop-log-empty">No previous CSSU exit activity found.</div>}
          </aside>
        </div>}

      {summaryModalOpen && <div className="eduroute-dialog-backdrop" role="presentation" onClick={() => setSummaryModalOpen(false)}>
          <div className="eduroute-dialog-modal info cssu-operational-summary-modal" role="dialog" aria-modal="true" aria-labelledby="cssu-summary-title" onClick={event => event.stopPropagation()}>
            <span className="eduroute-dialog-kicker">CSSU OPERATIONS</span>
            <h2 id="cssu-summary-title">Operational Summary</h2>
            <p>Generated from the current CSSU dashboard data for {selectedGateLabel}.</p>

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
    </CSSUDesktopPage>;
};
export const CSSUDashboardView = ({
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
    if (isDesktopViewport) {
      return undefined;
    }
    let isMounted = true;
    const loadMobileDashboard = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const [summaryData, mainGateData, backGateData, timelineData] = await Promise.all([getCssuDashboardSummary(), getCssuLiveExitMonitoring({
          gate: 'main_gate',
          limit: 10
        }), getCssuLiveExitMonitoring({
          gate: 'back_gate',
          limit: 10
        }), getCssuActivityTimeline({
          limit: 10
        })]);
        if (!isMounted) return;
        const combinedRows = [...(Array.isArray(mainGateData?.rows) ? mainGateData.rows : []), ...(Array.isArray(backGateData?.rows) ? backGateData.rows : [])].sort((left, right) => {
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
        setMobileLiveRows(combinedRows);
        setActivityRows(Array.isArray(timelineData?.rows) ? timelineData.rows : []);
        setShowAllMobileLiveRows(false);
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
  const approvedRateLabel = summary.totalFacultyExiting ? `${summary.approvalRate}% approved today` : 'No tracked exits yet';
  const commandStatusPercent = Math.max(0, Math.min(100, Number(summary.approvalRate || 0)));
  const gateSummaryLabel = 'Main Gate & Back Gate';
  const visibleMobileLiveRows = showAllMobileLiveRows ? mobileLiveRows : mobileLiveRows.slice(0, 3);
  const hasMoreMobileLiveRows = mobileLiveRows.length > 3;
  const latestActivity = activityRows[0] || null;
  const needsMobileReview = Number(summary.rejectedLocatorSlips || 0) > 0 || Number(summary.repeatAttempts || 0) > 0;
  const operationalInsights = [summary.totalFacultyExiting > 0 ? `${summary.totalFacultyExiting} faculty exit record${Number(summary.totalFacultyExiting) === 1 ? '' : 's'} tracked today.` : 'No faculty exits are currently tracked today.', mobileLiveRows.length > 0 ? `${mobileLiveRows.length} live locator slip${mobileLiveRows.length === 1 ? '' : 's'} visible across Main Gate and Back Gate.` : 'Main Gate and Back Gate have no queued approved locator slips right now.', summary.rejectedLocatorSlips > 0 ? `${summary.rejectedLocatorSlips} rejected locator slip${Number(summary.rejectedLocatorSlips) === 1 ? '' : 's'} need CSSU review or intervention.` : 'No rejected locator slips are reported today.', summary.repeatAttempts > 0 ? `${summary.repeatAttempts} repeat scan attempt${Number(summary.repeatAttempts) === 1 ? '' : 's'} detected today.` : 'No repeat scan attempts detected today.', latestActivity ? `Latest gate activity: ${latestActivity.title || 'Activity logged'} for ${latestActivity.facultyName || 'a faculty user'} at ${latestActivity.gateLabel || 'a campus gate'}.` : 'No gate activity has been logged yet.'];
  const closeHistoryDrawer = () => setHistoryDrawer({
    open: false,
    loading: false,
    error: '',
    facultyName: '',
    rows: []
  });
  const openExitClearanceForRow = row => {
    if (!row?.locatorSlipCode) return;
    localStorage.setItem('edurouteCssuPendingLocatorSlipCode', row.locatorSlipCode);
    localStorage.setItem('edurouteCssuPendingLookupSource', 'dashboard-eye');
    setView('cssu-scan');
  };
  const openFacultyHistory = async row => {
    if (!row?.facultyUserId) return;
    setHistoryDrawer({
      open: true,
      loading: true,
      error: '',
      facultyName: row.facultyName || 'Faculty user',
      rows: []
    });
    try {
      const history = await getCssuFacultyExitHistory(row.facultyUserId, {
        limit: 12
      });
      setHistoryDrawer({
        open: true,
        loading: false,
        error: '',
        facultyName: row.facultyName || 'Faculty user',
        rows: normalizeCssuExitHistoryRows(history?.rows)
      });
    } catch (error) {
      setHistoryDrawer({
        open: true,
        loading: false,
        error: error.message || 'Unable to load faculty exit history.',
        facultyName: row.facultyName || 'Faculty user',
        rows: []
      });
    }
  };
  return <div className="admin-dash-wrapper cssu-wrapper">
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
            <div className="cssu-stat-card repeat-card">
              <div className="cssu-stat-card-header">
                <CssuWarningTriangleIcon />
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
              <CssuChartIcon />
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
              Current efficiency rating: {commandStatusPercent}% based on CSSU locator slip validation today.
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
                    <p>Approved and validated faculty exits will appear here.</p>
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
            <span className="cssu-desktop-kicker">Faculty Exit History</span>
            <h2>{historyDrawer.facultyName}</h2>
            {historyDrawer.loading ? <div className="cssu-desktop-log-empty">Loading history...</div> : historyDrawer.error ? <div className="cssu-desktop-log-empty error">{historyDrawer.error}</div> : historyDrawer.rows.length ? <div className="cssu-history-list">
                {historyDrawer.rows.map(item => <div key={item.id} className={`cssu-history-item ${String(item.status || '').includes('denied') || String(item.status || '').includes('rejected') ? 'danger' : ''}`}>
                    <strong>{item.statusLabel || item.status}</strong>
                    <span>{item.locatorSlipCode} &bull; {item.destination}</span>
                    <small>{item.gateLabel} &bull; {item.occurredTimeLabel}</small>
                  </div>)}
              </div> : <div className="cssu-desktop-log-empty">No previous CSSU exit activity found.</div>}
          </aside>
        </div>}

      {summaryModalOpen && <div className="eduroute-dialog-backdrop" role="presentation" onClick={() => setSummaryModalOpen(false)}>
          <div className="eduroute-dialog-modal info cssu-operational-summary-modal" role="dialog" aria-modal="true" aria-labelledby="cssu-mobile-summary-title" onClick={event => event.stopPropagation()}>
            <span className="eduroute-dialog-kicker">CSSU OPERATIONS</span>
            <h2 id="cssu-mobile-summary-title">Operational Summary</h2>
            <p>Generated from the current CSSU dashboard data for {gateSummaryLabel}.</p>

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
        <CssuScanNavIcon color="#554400" />
      </button>

      <CSSUBottomNav active="dashboard" setView={setView} />
    </div>;
};
export const CSSUMapView = ({
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
    getActiveFacultyFn: getCssuActiveFaculty,
    getFacultyActivityFn: getCssuFacultyActivity,
    getFacultyLiveDetailFn: getCssuFacultyLiveDetail
  });
  const mapCenter = useMemo(() => [Number(center?.lng || OLONGAPO_CENTER[0]), Number(center?.lat || OLONGAPO_CENTER[1])], [center?.lat, center?.lng]);
  const [mapFocusRequest, setMapFocusRequest] = useState(0);
  const mobileSelectedFaculty = selectedFacultyDetail?.faculty || selectedFaculty || null;
  const mobileDisplayName = mobileSelectedFaculty?.facultyName || 'No active faculty';
  const mobileDisplayRole = mobileSelectedFaculty?.position || selectedFaculty?.position || selectedFaculty?.facultyRoleOrPosition || 'Faculty';
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
    return <CSSUDesktopPage activeKey="map" title="Live Tracking" subtitle="Central Campus Security Unit" setView={setView} profileData={profileData} onLogout={onLogout}>
        
        <section className="cssu-live-page">
          <div className="hrmu-live-map-stage cssu-live-map-stage">
            <HrmuLiveMapPanel faculty={facultyLocations} center={mapCenter} selectedFacultyUserId={selectedFaculty?.facultyUserId || null} selectedFacultyDetail={selectedFacultyDetail} selectedFaculty={selectedFaculty} onMarkerSelect={selectFaculty} focusOnOlongapo focusRequest={mapFocusRequest} className="hrmu-live-stage-map" />
            

            <div className="hrmu-live-controls">
              <button type="button" className="hrmu-live-control-btn" aria-label="Refresh active faculty" onClick={reload}>
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
      </CSSUDesktopPage>;
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
              <button type="button" className="cssu-mobile-live-control" aria-label="Refresh active faculty" onClick={reload}>
                <HrmuSyncIcon color="#5B6659" />
              </button>
            </div>

            {selectedFaculty && <div className="cssu-mobile-live-selected-pill">
                <span>{String(selectedFaculty.facultyName || 'Faculty').replace(/^Mr\.?\s+|^Ms\.?\s+|^Mrs\.?\s+|^Dr\.?\s+/i, '').toUpperCase()}</span>
              </div>}

            {showMobileProfile ? <section className="cssu-mobile-live-profile-card" style={getMobileOverlayStyle('profile')}>
                <div className="cssu-mobile-live-overlay-head">
                  <span>Active Faculty</span>
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
              </section> : <button type="button" className="cssu-mobile-live-restore profile" onClick={() => setShowMobileProfile(true)}>
                Show Active Faculty
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

                  {!loading && !activityLoading && mobileActivityItems.length === 0 && <div className="cssu-mobile-live-activity-empty">No activity has been recorded for the selected faculty yet.</div>}

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

      <CSSUBottomNav active="map" setView={setView} />
    </div>;
};
export const CSSUIncidentsView = ({
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
        const data = await getCssuIncidentsOverview();
        if (!isMounted) return;
        setIncidentData({
          activeCases: Number(data?.activeCases || 0),
          resolvedToday: Number(data?.resolvedToday || 0),
          incidents: Array.isArray(data?.incidents) ? data.incidents : []
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
    return <CSSUDesktopPage activeKey="incidents" title="Incident Log" subtitle="Centralized oversight for campus compliance, track flagged violations, review authorization slips, and manage intervention triggers." setView={setView} profileData={profileData} onLogout={onLogout} hideHeader>
        
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
              {!loading && !loadError && incidentRows.length === 0 && <div className="cssu-incident-empty">No CSSU incident cases were recorded today.</div>}
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
      </CSSUDesktopPage>;
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

            {!loading && !loadError && incidentData.incidents.length === 0 && <div className="cssu-mobile-incident-empty">No CSSU incident cases were recorded today.</div>}

            {!loading && !loadError && incidentData.incidents.map(incident => {
            const toneClass = incident.tone === 'red' ? 'critical' : incident.tone === 'yellow' ? 'moderate' : 'low';
            const metaIcon = incident.destination ? <LocationIcon color="#3D4B3E" /> : <ProfileIcon color="#3D4B3E" />;
            const metaText = incident.destination || incident.facultyName || incident.departmentName || 'CSSU logged activity';
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

      <CSSUBottomNav active="incidents" setView={setView} />
    </div>;
};
export const CSSUScanViewLegacy = ({
  setView,
  profileData,
  onLogout
}) => {
  const isDesktopViewport = useDesktopWorkspaceViewport();
  const [serverTime, setServerTime] = useState(() => new Date().toLocaleTimeString('en-US', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }));
  useEffect(() => {
    const timer = window.setInterval(() => {
      setServerTime(new Date().toLocaleTimeString('en-US', {
        timeZone: 'Asia/Manila',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (isDesktopViewport) {
    return <CSSUDesktopPage activeKey="scan" title="Exit Verification" subtitle="Central Campus Security Unit" setView={setView} profileData={profileData} onLogout={onLogout}>
        
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
                <input type="text" className="cssu-checkpoint-manual-input" placeholder="Enter Faculty ID (e.g. FAC-2024-001)" />
                
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
      </CSSUDesktopPage>;
  }
  return <div className="mobile-container"><div className="content"><div className="header"><h1>Scan</h1></div><CSSUBottomNav active="scan" setView={setView} /></div></div>;
};
export const CSSUScanView = ({
  setView,
  profileData,
  onLogout
}) => {
  const isDesktopViewport = useDesktopWorkspaceViewport();
  const qrVideoRef = useRef(null);
  const qrScanFrameRef = useRef(null);
  const qrStreamRef = useRef(null);
  const qrDetectorRef = useRef(null);
  const [serverTime, setServerTime] = useState(() => new Date().toLocaleTimeString('en-US', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }));
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
  const [qrManualEntryReason, setQrManualEntryReason] = useState('');
  useEffect(() => {
    const timer = window.setInterval(() => {
      setServerTime(new Date().toLocaleTimeString('en-US', {
        timeZone: 'Asia/Manila',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }));
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
    const pendingLocatorSlipCode = localStorage.getItem('edurouteCssuPendingLocatorSlipCode');
    const pendingLookupSource = localStorage.getItem('edurouteCssuPendingLookupSource');
    if (!pendingLocatorSlipCode) return;
    localStorage.removeItem('edurouteCssuPendingLocatorSlipCode');
    localStorage.removeItem('edurouteCssuPendingLookupSource');
    setManualFacultyId(pendingLocatorSlipCode);
    runLookup({
      value: pendingLocatorSlipCode,
      method: 'manual',
      suppressLookupLog: pendingLookupSource === 'dashboard-eye'
    });
  }, []);
  const runLookup = async ({
    value,
    method,
    suppressLookupLog = false
  }) => {
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
        suppressLookupLog
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
        method: lastLookupMethod
      });
      const validationTitle = result.status === 'flagged' ? 'Locator Slip: Flagged Incident' : result.status === 'denied' ? 'Locator Slip: Exit Denied' : 'Locator Slip: Validated (Official)';
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
          canAllowExit: false,
          canDenyExit: false,
          canFlagIncident: false,
          isOfficial: result.isOfficial
        },
        validationLog: [...(prev?.validationLog || []).filter(item => item.title !== 'Locator Slip: Validated (Official)' && item.title !== 'Locator Slip: Exit Denied' && item.title !== 'Locator Slip: Flagged Incident'), {
          type: result.status === 'validated' ? 'success' : 'danger',
          title: validationTitle,
          timeLabel: result.validatedTimeLabel || '--'
        }]
      }));
      setActionMessage(result.status === 'validated' ? `Locator slip is now officially validated for exit at ${result.gateLabel || 'Main Gate'}.` : result.status === 'flagged' ? 'Exit attempt has been flagged and logged for CSSU incident review.' : 'Exit has been denied and logged for CSSU review.');
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
  const confirmAllowExit = async gate => {
    setShowGatePicker(false);
    await handleExitDecision('validated', gate);
  };
  const faculty = activeCandidate?.faculty;
  const locatorSlip = activeCandidate?.locatorSlip;
  const scanConfidence = activeCandidate?.scanConfidence;
  const validationLog = Array.isArray(activeCandidate?.validationLog) ? activeCandidate.validationLog : [];
  const normalizedLocatorSlipStatus = String(locatorSlip?.status || '').toLowerCase();
  const slipVisualState = normalizedLocatorSlipStatus === 'validated' ? 'validated' : normalizedLocatorSlipStatus === 'flagged' || normalizedLocatorSlipStatus === 'denied' || normalizedLocatorSlipStatus === 'rejected' ? 'denied' : normalizedLocatorSlipStatus === 'pending' ? 'pending' : 'approved';
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
            <span className="cssu-checkpoint-card-kicker">{mobile ? 'LOOKUP ENTRY' : 'MANUAL ENTRY'}</span>
            <div className="cssu-checkpoint-manual-row">
              <input type="text" className="cssu-checkpoint-manual-input" placeholder="Enter Locator Slip Code (e.g. LS-8F3K2A)" value={manualFacultyId} onChange={event => setManualFacultyId(event.target.value)} />
            
              <button type="button" className="cssu-checkpoint-search-btn" aria-label="Search locator slip code" onClick={handleManualLookup} disabled={lookupLoading}>
                <FacultySearchIcon />
              </button>
            </div>
            {mobile && <button type="button" className="cssu-checkpoint-qr-trigger" onClick={handleQrLookup} disabled={lookupLoading}>
                <ScanQRIcon color="var(--green)" />
                <span>Scan QR</span>
              </button>}
          </article>
        </div>

        <div className="cssu-checkpoint-right">
          <article className="cssu-checkpoint-profile-card">
            <div className="cssu-checkpoint-profile-top">
              <div className="cssu-checkpoint-profile-avatar">
                <img src={faculty?.profileImageUrl || DEFAULT_PROFILE_IMAGE} alt={faculty?.facultyName || 'Faculty'} />
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

            {scanConfidence && <div className={`cssu-scan-confidence-panel ${scanConfidence.tone || 'neutral'}`}>
                <div>
                  <span>SCAN CONFIDENCE</span>
                  <strong>{scanConfidence.title}</strong>
                </div>
                <p>{scanConfidence.message}</p>
                {Number(scanConfidence.repeatAttempts || 0) > 0 && <small>{scanConfidence.repeatAttempts} repeated denied scan attempt{Number(scanConfidence.repeatAttempts || 0) === 1 ? '' : 's'} recorded.</small>}
              </div>}
          </article>

          <article className="cssu-checkpoint-log-card">
            <span className="cssu-checkpoint-card-kicker">SECURITY VALIDATION LOG</span>
            <div className="cssu-checkpoint-log-list">
              {validationLog.length === 0 && <div className="cssu-checkpoint-log-empty">Lookup a faculty ID or QR value to begin CSSU exit verification.</div>}

              {validationLog.map((item, index) => <div key={`${item.title}-${index}`} className={`cssu-checkpoint-log-row ${item.type === 'danger' ? 'danger' : item.type === 'warning' ? 'warning' : 'success'}`}>
                  <div className="cssu-checkpoint-log-message">
                    <span className="dot" />
                    <strong>{item.title}</strong>
                  </div>
                  <span className="time">{item.timeLabel}</span>
                </div>)}
            </div>
          </article>
        </div>
      </div>

      {(lookupError || actionMessage) && <div className={`cssu-checkpoint-inline-alert ${lookupError ? 'error' : 'success'}`}>
          {lookupError || actionMessage}
        </div>}

      <div className="cssu-checkpoint-actions">
        <button type="button" className="cssu-checkpoint-btn ghost-danger" onClick={() => handleExitDecision('flagged')} disabled={!locatorSlip?.canFlagIncident || actionLoading}>
        
          <ExclamationCircleIcon color="#D72D2D" size="18" />
          <span>{actionLoading ? 'Updating...' : 'Flag Incident'}</span>
        </button>
        <button type="button" className="cssu-checkpoint-btn soft-danger" onClick={() => handleExitDecision('denied')} disabled={!locatorSlip?.canDenyExit || actionLoading}>
        
          <RejectXIcon />
          <span>{actionLoading ? 'Updating...' : 'Deny Exit'}</span>
        </button>
        <button type="button" className="cssu-checkpoint-btn success" onClick={handleAllowExitClick} disabled={!locatorSlip?.canAllowExit || actionLoading}>
        
          <CheckCircleIcon />
          <span>{actionLoading ? 'Updating...' : 'Allow Exit'}</span>
        </button>
      </div>

      {showGatePicker && <div className="cssu-gate-picker-backdrop" onClick={() => setShowGatePicker(false)}>
          <div className="cssu-gate-picker-modal" onClick={event => event.stopPropagation()}>
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
        </div>}

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
    return <CSSUDesktopPage activeKey="scan" title="Exit Verification" subtitle="Central Campus Security Unit" setView={setView} profileData={profileData} onLogout={onLogout}>
        
        {renderCheckpointContent(false)}
      </CSSUDesktopPage>;
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
            <h2>Exit Verification</h2>
            <p>Enter a locator slip code manually or use QR lookup on mobile.</p>
          </div>

          <div className="cssu-checkpoint-mobile-shell">
            {renderCheckpointContent(true)}
            {qrScannerError && <div className="cssu-checkpoint-inline-alert error">{qrScannerError}</div>}
          </div>
        </div>
      </div>

      <CSSUBottomNav active="scan" setView={setView} />
    </div>;
};
export const CSSUReportsView = ({
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
  const cssuDepartmentOptions = [{
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
  const formatCssuDate = value => {
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
      } = await downloadCssuReportsPdf({
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
      window.alert(error.message || 'Unable to download the CSSU report.');
    } finally {
      setDownloadLoading(false);
    }
  };
  const handleSendToHrmu = async () => {
    if (loading || sendLoading) return;
    setSendLoading(true);
    try {
      const result = await sendCssuReportToHrmu({
        startDate,
        endDate,
        department: selectedDepartment,
        sortOrder: logSortOrder
      });
      setSendModalOpen(false);
      window.alert(`Report sent to HRMU successfully.\nAttachment: ${result?.filename || 'eduroute-cssu-report.pdf'}`);
    } catch (error) {
      window.alert(error.message || 'Unable to send the CSSU report to HRMU.');
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
    return <CSSUDesktopPage activeKey="reports" setView={setView} profileData={profileData} onLogout={onLogout} hideHeader>
        
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
              <span>{formatCssuDate(startDate)}</span>
            </button>
            <input ref={startDateInputRef} type="date" className="cssu-reports-date-native" value={startDate} onChange={event => setStartDate(event.target.value)} aria-label="Start date" />
            
          </div>

          <div className="cssu-reports-filter-field">
            <label>END DATE</label>
            <button type="button" className="cssu-reports-date-toggle" onClick={() => openDatePicker(endDateInputRef)}>
              <ClockIcon color="var(--green)" />
              <span>{formatCssuDate(endDate)}</span>
            </button>
            <input ref={endDateInputRef} type="date" className="cssu-reports-date-native" value={endDate} onChange={event => setEndDate(event.target.value)} aria-label="End date" />
            
          </div>

          <div className="cssu-reports-filter-field department">
            <label>DEPARTMENT</label>
            <div className="cssu-reports-select-shell">
              <GlobeSmIcon color="var(--green)" />
              <select value={selectedDepartment} onChange={event => setSelectedDepartment(event.target.value)} aria-label="Department">
                
                {cssuDepartmentOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
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
                <p>Displaying data for {reportData?.filters?.dateRangeLabel || `${formatCssuDate(startDate)} - ${formatCssuDate(endDate)}`}</p>
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
              <p>Verified and flagged CSSU movement records within the selected report range.</p>

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
            <strong>Report ID: {reportData?.reportMeta?.reportId || 'CSSU-REPORT-DRAFT'}</strong>
            <span>Last Generated: {reportData?.reportMeta?.lastGeneratedLabel || formatReportFooterDate(new Date().toISOString())}</span>
          </div>
        </footer>

        {sendModalOpen ? <div className="cssu-send-report-overlay" onClick={() => !sendLoading && setSendModalOpen(false)}>
            <div className="cssu-send-report-modal" onClick={event => event.stopPropagation()}>
              <span className="cssu-send-report-kicker">PDF ATTACHMENT</span>
              <h3>Send report to HRMU?</h3>
              <p>
                This will send the generated movement report PDF for
                <strong>{` ${formatCssuDate(startDate)} - ${formatCssuDate(endDate)}`}</strong>
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
      </CSSUDesktopPage>;
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
                  <span>{formatCssuDate(startDate)}</span>
                </button>
                <input ref={startDateInputRef} type="date" className="cssu-reports-date-native" value={startDate} onChange={event => setStartDate(event.target.value)} aria-label="Start date" />
                
              </div>

              <div className="cssu-mobile-reports-field">
                <label>End Date</label>
                <button type="button" className="cssu-mobile-reports-date-btn" onClick={() => openDatePicker(endDateInputRef)}>
                  <ClockIcon color="var(--green)" />
                  <span>{formatCssuDate(endDate)}</span>
                </button>
                <input ref={endDateInputRef} type="date" className="cssu-reports-date-native" value={endDate} onChange={event => setEndDate(event.target.value)} aria-label="End date" />
                
              </div>
            </div>

            <div className="cssu-mobile-reports-field">
              <label>Department</label>
              <div className="cssu-mobile-reports-select">
                <GlobeSmIcon color="var(--green)" />
                <select value={selectedDepartment} onChange={event => setSelectedDepartment(event.target.value)} aria-label="Department">
                  
                  {cssuDepartmentOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
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
                <p>{reportData?.filters?.dateRangeLabel || `${formatCssuDate(startDate)} - ${formatCssuDate(endDate)}`}</p>
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
                <strong>{` ${formatCssuDate(startDate)} - ${formatCssuDate(endDate)}`}</strong>
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

        <CSSUBottomNav active="reports" setView={setView} />
      </div>
    </div>;
};
export const CSSUNotificationsView = ({
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
        const result = await getCssuNotificationsOverview({
          limit: 8
        });
        if (!isMounted) return;
        const notificationRows = Array.isArray(result?.notifications) ? result.notifications : [];
        setAlerts(notificationRows.map(notification => ({
          id: notification.id,
          type: notification.type === 'flagged' ? 'flagged' : 'validated',
          title: notification.title || (notification.type === 'flagged' ? 'Flagged Exit Attempt' : 'Exit Clearance Validated'),
          body: notification.type === 'flagged' ? `${notification.facultyName} attempted exit clearance at ${notification.gateLabel} while the locator slip was still ${notification.locatorSlipStatus}.` : `${notification.facultyName} was cleared by CSSU for ${notification.purpose}${notification.destination ? ` bound for ${notification.destination}` : ''}.`,
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
  const filteredAlerts = alerts.filter(alert => {
    if (alertFilter === 'validated') return alert.type === 'validated';
    if (alertFilter === 'flagged') return alert.type === 'flagged';
    return true;
  });
  const featuredAlert = filteredAlerts[0] || null;
  const featuredTone = featuredAlert?.type === 'flagged' ? 'incident' : 'verified';
  const featuredPillLabel = alertsLoading ? 'LOADING' : featuredAlert?.type === 'flagged' ? 'FLAGGED' : featuredAlert ? 'VALIDATED' : 'NO ALERTS';
  if (!isDesktopViewport) {
    return <div className="dashboard-wrapper">
        <div className="content fade-in dash-content notif-content cssu-mobile-notif-content">
          <div className="slip-top-nav chpw-top-nav">
            <div className="slip-nav-left" onClick={() => setView('cssu-dashboard')}>
              <BackArrowIcon color="var(--green)" />
              <span className="dash-logo-text chpw-nav-title">EduRoute</span>
            </div>
            <div className="dash-avatar">
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="CSSU Profile" style={{
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
            <p className="notif-subtitle">Real-time monitoring and clearance notifications after locator slips are validated by CSSU.</p>
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
                  <button type="button" className="cssu-mobile-notif-action primary" onClick={() => setView('cssu-scan')}>
                    
                    {alert.actionLabelPrimary}
                  </button>
                  <button type="button" className="cssu-mobile-notif-action secondary" onClick={() => setView(alert.type === 'flagged' ? 'cssu-reports' : 'cssu-dashboard')}>
                    
                    {alert.actionLabelSecondary}
                  </button>
                </div>
              </div>;
        })}
        </div>
        <CSSUBottomNav active="" setView={setView} />
      </div>;
  }
  return <CSSUDesktopPage activeKey="" setView={setView} profileData={profileData} onLogout={onLogout} hideHeader>
      
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
              <select value={alertFilter} onChange={event => setAlertFilter(event.target.value)} aria-label="Filter CSSU alerts">
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
                No {alertFilter === 'all' ? 'CSSU' : alertFilter} alerts available right now.
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
                            <button type="button" className={`hrmu-alert-primary-btn ${tone}`} onClick={() => setView('cssu-scan')}>
                            
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
    </CSSUDesktopPage>;
};
