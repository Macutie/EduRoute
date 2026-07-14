import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../../config";
import { encryptSensitivePayload } from "../../services/authPayloadEncryption";
import { decryptSensitiveResponseJson, getSensitiveResponseHeaders } from "../../services/responseEncryption";
import { AdminBadgeIcon, AdminBellIcon, AdminEmailOutlineIcon, AdminProfileChevronIcon, AdminProfileEditIcon, AdminProfileIdIcon, AdminProfileLogoutIcon, AdminProfilePasswordIcon, AdminRoleIcon, AdminSaveCheckIcon, AdminUserOutlineIcon, ApproveCheckIcon, ArrowRightIcon, AtSymbolIcon, BackArrowIcon, BadgeIcon, BatteryIcon, BellRingIcon, BriefcaseIcon, CameraIcon, CapIcon, CheckCircleAdminIcon, CheckCircleIcon, CheckCircleSolidIcon, ChevronDownIcon, ChevronRightIcon, ClipboardCheckIcon, ClipboardClockIcon, ClockIcon, CssuChartIcon, CssuIncidentsNavIcon, CssuMapNavIcon, CssuReportsNavIcon, CssuRoleIcon, CssuRosetteCheckIcon, CssuScanNavIcon, CssuTrendingUpIcon, CssuWarningCircleIcon, CssuWarningTriangleIcon, DashboardNavIcon, DeanNotificationDocIcon, DetailClockIcon, DetailClockReturnIcon, DetailDocIcon, DetailPinIcon, DetailRouteIcon, DocumentIcon, DummySignature, EditPencilIcon, EwanIcon, ExclamationCircleIcon, EyeIcon, EyeOffIcon, FacultyCheckCircleIcon, FacultyChevronRightIcon, FacultyCopyIcon, FacultyCrossCircleIcon, FacultyDocIcon, FacultyFilterIcon, FacultyIdBadgeIcon, FacultyNavIcon, FacultyRoleIcon, FacultySearchIcon, FacultyWaitCircleIcon, FileTextIcon, FilledClockIcon, FlashlightIcon, GlobeIcon, GlobeSmIcon, GraduationCapIcon, GridIcon, HeadsetIcon, HelpCircleIcon, HelpIcon, HomeNavIcon, HourglassIcon, HrmuAlertTinyIcon, HrmuChartIcon, HrmuCheckTinyIcon, HrmuExportIcon, HrmuEyeMiniIcon, HrmuFilterIcon, HrmuMapRouteIcon, HrmuMiniCheckIcon, HrmuPinMiniIcon, HrmuReportIcon, HrmuRoleIcon, HrmuSidebarGridIcon, HrmuSyncIcon, HrmuVerificationIcon, HrmuViewRouteIcon, HrmuWarningIcon, IdBadgeIcon, InboxArchiveIcon, InfoIcon, LinkIcon, LocationPinFilledIcon, LocationPinIcon, LockIcon, LockPrivIcon, LockSmallIcon, LoginDoorIcon, LogoutIcon, MailIcon, MapFoldIcon, MapIcon, ModalCloseIcon, NotifPendingIcon, NotifSlipIcon, NotificationIcon, PasswordIcon, PermissionsIcon, PersonOutlineIcon, PinIcon, PlayTriangleIcon, PolicyBulbIcon, PolicyCheckIcon, PrivacyIcon, ProfileEditIcon, ProfileNavIcon, ProgressReviewIcon, QuestionCircleIcon, RefreshClockIcon, RefreshIcon, RegistryDownloadIcon, RegistryEyeIcon, RegistryModalCloseIcon, RegistryModalDoneIcon, RegistryModalIdIcon, RegistryModalVerifiedIcon, RegistryNavIcon, RejectXIcon, RemarksIcon, ReportPrintIcon, RequestsNavIcon, SaveIcon, ScanQRIcon, SendIcon, ShieldCheckIcon, ShieldCheckSmallIcon, ShieldSearchIcon, ShieldSolidIcon, SignalIcon, SignatureNavIcon, SlashedPersonIcon, SlipIcon, StatusGraphIcon, TogaLogoIcon, ToggleSwitch, TrashIcon, UploadIcon, UsersAdminIcon, WifiIcon, XCircleIcon } from "../../components/icons/AppIcons.jsx";
import { LegalDocumentModal } from "../../components/legal/LegalDocuments.jsx";
import { DEFAULT_PROFILE_IMAGE } from "../shared/appUtils.js";
import { getCancellationReasonLabel } from "../faculty/FacultyViews.jsx";
import { getPortalAdministrationDescription, getPortalHomeViewForRole, getPortalNotificationsViewForRole, getPortalPositionLabel, getPortalMetaLabel, getPortalBadgeLabel, isDeanPortalAccount } from "../routing/portalRouting.js";
import { CSSUBottomNav, CSSUDesktopPage, useDesktopWorkspaceViewport } from "../cssu/CssuViews.jsx";
import { HrmuWorkspaceShell } from "../hrmu/HrmuViews.jsx";
/* ======================================================== */
/* ADMIN DASHBOARD VIEW (Strategic Oversight)               */
/* ======================================================== */

export const AdminBottomNav = ({
  active = 'dashboard',
  setView
}) => <div className="admin-bottom-nav">
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
  </div>;
export const AdminDashboardView = ({
  setView,
  profileData
}) => {
  if (isDeanPortalAccount(profileData)) {
    return <DeanDashboardView setView={setView} profileData={profileData} />;
  }
  const notifications = [{
    id: 1,
    text: 'New budget proposal from Dept. of Humanities.',
    time: '2 mins ago',
    unread: true
  }, {
    id: 2,
    text: 'Course curriculum revision needs signature.',
    time: '45 mins ago',
    unread: true
  }, {
    id: 3,
    text: 'Monthly faculty meeting reminder.',
    time: '3 hours ago',
    unread: false
  }];
  const pendingApprovals = [{
    initials: 'JA',
    name: 'Dr. Julian Anderson',
    dept: 'Dept. of Applied Science',
    purpose: 'Locator Slip',
    date: 'June 10, 2026',
    color: '#16A34A'
  }, {
    initials: 'EM',
    name: 'Elena Martinez',
    dept: 'Human Resources',
    purpose: 'Locator Slip',
    date: 'June 11, 2026',
    color: '#8B5CF6'
  }, {
    initials: 'WK',
    name: 'Prof. William Kent',
    dept: 'Global Relations',
    purpose: 'Locator Slip',
    date: 'June 11, 2026',
    color: '#F59E0B'
  }];
  return <div className="admin-dash-wrapper">
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
          {notifications.map((n, i) => <div key={n.id}>
              <div className="admin-notif-row">
                {n.unread && <div className="admin-notif-dot" />}
                <div className={`admin-notif-content ${!n.unread ? 'no-dot' : ''}`}>
                  <p className="admin-notif-text">{n.text}</p>
                  <span className="admin-notif-time">{n.time}</span>
                </div>
              </div>
              {i < notifications.length - 1 && <div className="admin-notif-divider" />}
            </div>)}
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
            {pendingApprovals.map(a => <div key={a.initials} className="admin-approvals-row">
                <div className="admin-approval-recipient">
                  <div className="admin-approval-avatar" style={{
                background: a.color
              }}>
                    {a.initials}
                  </div>
                  <div className="admin-approval-info">
                    <span className="admin-approval-name">{a.name}</span>
                    <span className="admin-approval-dept">{a.dept}</span>
                  </div>
                </div>
                <span className="admin-approval-purpose">{a.purpose}</span>
                <span className="admin-approval-date">{a.date}</span>
              </div>)}
          </div>

          <div className="admin-approvals-viewall" onClick={() => setView('admin-approval-requests')}>
            View All 24 Requests
          </div>
        </div>

      </div>
      <AdminBottomNav active="dashboard" setView={setView} />
    </div>;
};

/* ======================================================== */
/* ADMIN NOTIFICATIONS VIEW                                 */
/* ======================================================== */
export const AdminNotificationsView = ({
  setView,
  profileData
}) => {
  const todayNotifications = [{
    id: 1,
    type: 'slip',
    title: 'New locator slip request submitted',
    body: 'Mr. Ken Bau submitted a locator slip for an official event at Olongapo City Civic Center.',
    time: '2m ago',
    hasActions: true
  }, {
    id: 2,
    type: 'pending',
    title: 'Request pending for approval',
    body: 'The faculty locator Slip for May 23, 2026 requires your final signature before processing.',
    time: '45m ago',
    hasActions: false
  }];
  const yesterdayNotifications = [{
    id: 3,
    type: 'slip',
    title: 'New locator slip request submitted',
    body: 'Mr. Rey Gun submitted a locator slip for an official event at Tech Hub',
    time: '2m ago',
    hasActions: true
  }];
  const renderCard = n => <div key={n.id} className="anotif-card">
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
      {n.hasActions && <div className="anotif-card-actions">
          <button type="button" className="anotif-btn-review">REVIEW</button>
          <button type="button" className="anotif-btn-dismiss">DISMISS</button>
        </div>}
    </div>;
  return <div className="admin-dash-wrapper">
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
    </div>;
};

/* ======================================================== */
/* ADMIN APPROVAL REQUESTS VIEW                             */
/* ======================================================== */
export const AdminApprovalRequestsView = ({
  setView,
  profileData,
  setSelectedAdminRequest
}) => {
  const requests = [{
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
    estReturn: '12:00 PM'
  }, {
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
    estReturn: '01:30 PM'
  }, {
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
    estReturn: '03:00 PM'
  }];
  return <div className="admin-dash-wrapper">
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
          {requests.map(r => <div key={r.id} className={`areq-card ${r.urgent ? 'border-urgent' : 'border-pending'}`}>
            
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
            </div>)}
        </div>

      </div>
      <AdminBottomNav active="requests" setView={setView} />
    </div>;
};

/* ======================================================== */
/* ADMIN APPROVAL DETAIL VIEW                               */
/* ======================================================== */
export const AdminApprovalDetailView = ({
  setView,
  profileData,
  request
}) => {
  if (!request) {
    return <div className="admin-dash-wrapper">
        <div className="admin-dash-scroll" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
          <p>No request selected.</p>
        </div>
      </div>;
  }
  const isUrgent = request.urgent;
  return <div className="admin-dash-wrapper">
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
    </div>;
};

/* ======================================================== */
/* ADMIN REGISTRY VIEW                                      */
/* ======================================================== */
const formatPdfValue = value => {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return value == null || value === '' ? 'Not provided' : String(value);
};

const formatPdfDateTime = (formattedValue, rawValue) => {
  if (formattedValue) return formattedValue;
  if (!rawValue) return 'Not provided';
  const parsedDate = new Date(rawValue);
  if (Number.isNaN(parsedDate.getTime())) return 'Not provided';
  return parsedDate.toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getImageDataUrl = async url => {
  if (!url) return null;
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) return null;
  const blob = await response.blob();
  return await new Promise(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
};

export const generateRegistryLocatorSlipPdf = async item => {
  const jsPdfModule = await import('jspdf');
  const JsPDF = jsPdfModule.jsPDF || jsPdfModule.default;
  const doc = new JsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  const contentWidth = pageWidth - margin * 2;
  let y = 48;

  const ensureSpace = neededHeight => {
    if (y + neededHeight <= pageHeight - 48) return;
    doc.addPage();
    y = 48;
  };

  const addWrappedText = (text, x, textY, maxWidth, options = {}) => {
    const lines = doc.splitTextToSize(formatPdfValue(text), maxWidth);
    doc.text(lines, x, textY, options);
    return lines.length * 14;
  };

  const addInfoRow = (label, value) => {
    ensureSpace(42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(95, 107, 107);
    doc.text(label.toUpperCase(), margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(26, 35, 50);
    const usedHeight = addWrappedText(value, margin, y + 16, contentWidth, {});
    y += Math.max(38, usedHeight + 24);
  };

  const addSectionTitle = title => {
    ensureSpace(36);
    doc.setDrawColor(0, 150, 35);
    doc.setLineWidth(3);
    doc.line(margin, y, margin + 26, y);
    y += 18;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(0, 150, 35);
    doc.text(title, margin, y);
    y += 20;
  };

  const status = item.statusLabel || item.status || 'pending';
  const statusTitle = status === 'verified' ? 'VERIFIED REQUEST' : status === 'rejected' ? 'REJECTED REQUEST' : status === 'cancelled' ? 'CANCELLED REQUEST' : 'PENDING REQUEST';
  const signatureName = item.digitalSignature?.name || item.assignedDean?.name || 'Assigned Dean';
  const signatureRole = item.digitalSignature?.role || item.assignedDean?.role || 'Dean';
  const signatureAsset = item.digitalSignature?.asset || null;
  const signatureTimestamp = item.digitalSignature?.signedAt ? `${new Date(item.digitalSignature.signedAt).toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })} UTC+8` : 'Not signed yet';

  const logoDataUrl = await getImageDataUrl('/eduroute-logo-512.png?v=pdf-brand-20260518').catch(() => null);
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', margin, y - 8, 34, 34, undefined, 'FAST');
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0, 150, 35);
  doc.text('EduRoute', margin + 42, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(95, 107, 107);
  doc.text('Faculty Movement Locator Slip', margin + 42, y + 22);
  y += 46;

  doc.setFillColor(0, 150, 35);
  doc.roundedRect(margin, y, contentWidth, 88, 14, 14, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(230, 255, 235);
  doc.text(statusTitle, margin + 20, y + 28);
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('Locator Slip Details', margin + 20, y + 56);
  doc.setFontSize(10);
  doc.text(`Reference: ${formatPdfValue(item.referenceNumber || item.locatorSlipId)}`, margin + 20, y + 76);
  y += 118;

  addSectionTitle('Faculty Information');
  addInfoRow('Faculty User', item.facultyName || item.name);
  addInfoRow('Employee ID', item.employeeId);
  addInfoRow('College / Department', item.collegeName);
  addInfoRow('Position', item.position);

  addSectionTitle('Locator Slip Information');
  addInfoRow('Destination', item.destination);
  addInfoRow('Purpose', item.purpose);
  addInfoRow('Urgent Request', item.isUrgent);
  addInfoRow('Date Submitted', item.formattedCreatedAt || item.dateSubmitted || item.dateValue);
  addInfoRow('Departure', formatPdfDateTime(item.formattedDepartureDatetime, item.departureDatetime));
  addInfoRow('Expected Return', formatPdfDateTime(item.formattedExpectedReturnDatetime, item.expectedReturnDatetime));
  addInfoRow('Current Status', statusTitle);

  if (status === 'cancelled' && item.cancellationReason) {
    addInfoRow('Cancellation Reason', getCancellationReasonLabel(item.cancellationReason));
  }
  if (status === 'rejected' && (item.rejectionReason || item.additionalRemarks)) {
    addInfoRow('Rejection Reason', item.rejectionReason || item.additionalRemarks);
  }
  if (item.additionalRemarks && item.additionalRemarks !== item.rejectionReason) {
    addInfoRow('Additional Remarks', item.additionalRemarks);
  }

  addSectionTitle('Authorization');
  addInfoRow('Assigned Dean', signatureName);
  addInfoRow('Role', signatureRole);
  addInfoRow('Signature Status', item.digitalSignature ? 'Digitally signed' : 'Pending approval signature');
  addInfoRow('Signed At', signatureTimestamp);

  if (signatureAsset?.url) {
    ensureSpace(124);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(95, 107, 107);
    doc.text('AUTHORIZED DIGITAL SIGNATURE', margin, y);
    y += 12;
    if (signatureAsset.mimeType === 'application/pdf') {
      addInfoRow('Signature Attachment', signatureAsset.originalFilename || signatureAsset.url);
    } else {
      try {
        const signatureDataUrl = await getImageDataUrl(signatureAsset.url);
        if (signatureDataUrl) {
          doc.setDrawColor(218, 231, 218);
          doc.roundedRect(margin, y, 170, 78, 8, 8);
          doc.addImage(signatureDataUrl, 'PNG', margin + 14, y + 12, 142, 54, undefined, 'FAST');
          y += 96;
        } else {
          addInfoRow('Signature Image', signatureAsset.url);
        }
      } catch {
        addInfoRow('Signature Image', signatureAsset.url);
      }
    }
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 130, 130);
  doc.text(`Generated by EduRoute on ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })} UTC+8`, margin, pageHeight - 28);

  const safeReference = String(item.referenceNumber || item.locatorSlipId || 'locator-slip').replace(/[^a-z0-9-]+/gi, '-');
  doc.save(`${safeReference}-details.pdf`);
};

export const RegistryDetailsModal = ({
  item,
  onClose
}) => {
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  if (!item) return null;
  const status = item.statusLabel || item.status || 'pending';
  const statusTitle = status === 'verified' ? 'VERIFIED REQUEST' : status === 'rejected' ? 'REJECTED REQUEST' : status === 'cancelled' ? 'CANCELLED REQUEST' : 'PENDING REQUEST';
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
        date: parsedDate.toLocaleDateString('en-US', {
          timeZone: 'Asia/Manila',
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }),
        time: parsedDate.toLocaleTimeString('en-US', {
          timeZone: 'Asia/Manila',
          hour: '2-digit',
          minute: '2-digit'
        })
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
  const signatureAsset = item.digitalSignature?.asset || null;
  const signatureTimestamp = item.digitalSignature?.signedAt ? `${new Date(item.digitalSignature.signedAt).toLocaleString('sv-SE', {
    timeZone: 'Asia/Manila',
    hour12: false
  }).replace(' ', 'T')} UTC+8` : '';
  const cancellationReason = item.cancellationReason ? getCancellationReasonLabel(item.cancellationReason) : '';
  const rejectionReason = item.rejectionReason || item.additionalRemarks || '';
  const handleDownloadPdf = async () => {
    try {
      setDownloadBusy(true);
      setDownloadError('');
      await generateRegistryLocatorSlipPdf(item);
    } catch (error) {
      setDownloadError(error?.message || 'Unable to export this locator slip as PDF.');
    } finally {
      setDownloadBusy(false);
    }
  };
  return <div className="rmodal-overlay" onClick={onClose}>
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

        {status === 'cancelled' && <div className="rmodal-reason-panel">
            <span>CANCELLATION REASON</span>
            <strong>{cancellationReason || 'No cancellation reason was provided.'}</strong>
          </div>}

        {status === 'rejected' && <div className="rmodal-reason-panel">
            <span>REJECTION REASON</span>
            <strong>{rejectionReason || 'No rejection reason was provided.'}</strong>
          </div>}

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
          {signatureAsset && (signatureAsset.mimeType === 'application/pdf' ? <div className="rmodal-sig-asset-card pdf">
                <span className="rmodal-sig-asset-title">{signatureAsset.originalFilename || 'Dean signature PDF'}</span>
                <a className="rmodal-sig-asset-link" href={signatureAsset.url} target="_blank" rel="noreferrer">
                  Open PDF Signature
                </a>
              </div> : <div className="rmodal-sig-asset-card">
                <img className="rmodal-sig-image" src={signatureAsset.url} alt="Dean digital signature" />
              </div>)}
          <h4 className="rmodal-sig-name">{signatureName}</h4>
          <p className="rmodal-sig-role">{signatureRole}</p>
          {item.digitalSignature ? <>
              <div className="rmodal-sig-stamp">DIGITALLY SIGNED</div>
              <p className="rmodal-sig-timestamp">{signatureTimestamp}</p>
            </> : <p className="rmodal-sig-pending">Signature will appear after the locator slip is approved.</p>}
        </div>

        {/* Actions */}
        <div className="rmodal-actions">
          <button className="rmodal-done-btn" onClick={onClose}>
            <RegistryModalDoneIcon />
            DONE VIEWING
          </button>
          <button className="rmodal-dl-btn" onClick={handleDownloadPdf} disabled={downloadBusy}>
            <RegistryDownloadIcon />
            {downloadBusy ? 'EXPORTING...' : 'DOWNLOAD PDF'}
          </button>
          {downloadError && <p className="rmodal-download-error">{downloadError}</p>}
        </div>

      </div>
    </div>;
};
export const AdminRegistryView = ({
  setView,
  profileData
}) => {
  const registryItems = [{
    id: 1,
    name: 'Mr. Ken Bau',
    role: 'Instructor',
    status: 'verified',
    dateLabel: 'DATE APPROVED',
    date: 'April 24, 2026',
    destination: 'Olongapo City Civic Center'
  }, {
    id: 2,
    name: 'Prof. Marcus Thorne',
    role: 'STEM Research Division',
    status: 'rejected',
    dateLabel: 'DATE REJECTED',
    // Fixed condition
    date: 'Oct 22, 2023',
    destination: 'MIT Tech Symposium'
  }, {
    id: 3,
    name: 'Dr. Sarah Jenkins',
    role: 'Medical Sciences',
    status: 'verified',
    dateLabel: 'DATE APPROVED',
    date: 'Oct 19, 2023',
    destination: 'Kyoto Health Forum'
  }];
  const [selectedItem, setSelectedItem] = useState(null);
  const [downloadingItemId, setDownloadingItemId] = useState(null);
  const handleCardDownload = async item => {
    const itemId = item.locatorSlipId || item.id || item.referenceNumber;
    try {
      setDownloadingItemId(itemId);
      await generateRegistryLocatorSlipPdf(item);
    } finally {
      setDownloadingItemId(null);
    }
  };
  return <div className="admin-dash-wrapper">
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
          {registryItems.map(item => <div key={item.id} className="areg-card">
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
                <button type="button" className="areg-download-btn" aria-label="Download locator slip PDF" disabled={downloadingItemId === (item.locatorSlipId || item.id || item.referenceNumber)} onClick={() => handleCardDownload(item)}>
                  <RegistryDownloadIcon />
                </button>
              </div>
            </div>)}
        </div>

      </div>
      <AdminBottomNav active="registry" setView={setView} />

      {selectedItem && <RegistryDetailsModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>;
};

/* ======================================================== */
/* ADMIN FACULTY VIEW                                       */
/* ======================================================== */
export const FacultyProfileModal = ({
  profile,
  onClose
}) => {
  if (!profile) return null;
  const locatorSlipHistory = Array.isArray(profile.locatorSlipHistory)
    ? profile.locatorSlipHistory
    : Array.isArray(profile.acceptedLocatorSlips)
      ? profile.acceptedLocatorSlips
      : [];
  return <div className="afac-modal-overlay" onClick={onClose}>
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

          <div className="afac-accepted-slips">
            <div className="afac-accepted-header">
              <span>LOCATOR SLIP HISTORY</span>
              <strong>{locatorSlipHistory.length}</strong>
            </div>
            {locatorSlipHistory.length === 0 ? <p className="afac-accepted-empty">No accepted, rejected, or cancelled locator slips yet.</p> : <div className="afac-accepted-list">
                {locatorSlipHistory.map(slip => <div className={`afac-accepted-item status-${slip.status || 'verified'}`} key={slip.id || slip.referenceNumber || slip.destination}>
                    <div className="afac-accepted-main">
                      <strong>{slip.destination || 'No destination provided'}</strong>
                      <span>{slip.purpose || 'Purpose not provided'}</span>
                    </div>
                    <span className={`afac-history-status ${slip.status || 'verified'}`}>{String(slip.status || 'verified').toUpperCase()}</span>
                    <div className="afac-accepted-meta">
                      <span>{slip.referenceNumber || 'Locator slip'}</span>
                      <span>{slip.formattedDepartureDatetime || slip.formattedDecisionAt || slip.formattedApprovedAt || 'Schedule unavailable'}</span>
                    </div>
                  </div>)}
              </div>}
          </div>

          <button className="afac-modal-close" onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    </div>;
};
export const AdminFacultyView = ({
  setView,
  profileData
}) => {
  const facultyMembers = [{
    id: 1,
    name: 'Mr. Ken Bau',
    role: 'Instructor',
    tenure: 'FULL-TIME',
    totalRequests: 18,
    approvalRate: '92%',
    recentStatus: ['verified', 'waiting', '+12'],
    borderColor: 'green'
  }, {
    id: 2,
    name: 'Mr. Rey Gun',
    role: 'Instructor',
    tenure: 'PART-TIME',
    totalRequests: '05',
    approvalRate: '60%',
    recentStatus: ['rejected', 'verified'],
    borderColor: 'red'
  }, {
    id: 3,
    name: 'Mr. Lou Del',
    role: 'Instructor',
    tenure: 'FULL-TIME',
    totalRequests: 12,
    approvalRate: '100%',
    recentStatus: ['verified', 'verified', 'verified'],
    borderColor: 'green'
  }];
  const [selectedProfile, setSelectedProfile] = useState(null);
  return <div className="admin-dash-wrapper" style={{
    background: '#F2F6ED'
  }}>
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
            <div className="admin-avatar" style={{
            border: '3px solid var(--yellow)'
          }} onClick={() => setView('admin-profile')}>
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
        </div>

        {/* Title */}
        <h2 className="afac-title">Faculty Overview</h2>

        {/* Cards */}
        <div className="afac-cards">
          {facultyMembers.map(member => <div key={member.id} className={`afac-card border-${member.borderColor}`}>
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
            </div>)}
        </div>

      </div>
      <AdminBottomNav active="faculty" setView={setView} />

      {/* Modal */}
      <FacultyProfileModal profile={selectedProfile} onClose={() => setSelectedProfile(null)} />
    </div>;
};

// --------------------------------------------------------
// CSSU DASHBOARD COMPONENTS
// --------------------------------------------------------
export const AdminProfileView = ({
  setView,
  profileData,
  onLogout
}) => {
  const isDesktopViewport = useDesktopWorkspaceViewport();
  const [activeLegalDoc, setActiveLegalDoc] = useState(null);
  const accountRole = profileData?.accountRole || '';
  const homeView = getPortalHomeViewForRole(accountRole);
  const notificationsView = getPortalNotificationsViewForRole(accountRole);
  const fullName = profileData?.fullName || 'Portal User';
  const department = profileData?.department || 'Portal Department';
  const position = getPortalPositionLabel(profileData);
  const badgeLabel = getPortalBadgeLabel(accountRole);
  const metaLabel = getPortalMetaLabel(profileData);
  const administrationDescription = getPortalAdministrationDescription(profileData);
  const showLegalPanel = accountRole === 'hrmu' || accountRole === 'cssu';
  const legalProfileItems = [{
    key: 'terms',
    label: 'Terms and Conditions',
    icon: <FileTextIcon color="var(--green)" />
  }, {
    key: 'privacy',
    label: 'Privacy Policy',
    icon: <ShieldSearchIcon color="var(--green)" />
  }, {
    key: 'dataFaq',
    label: 'Data Usage FAQ',
    icon: <QuestionCircleIcon color="var(--green)" />
  }];
  const profileContent = <div className="aprof-container">
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

        {showLegalPanel && <div className="portal-profile-legal-mobile">
            <h3 className="aprof-section-title">POLICIES &amp; PRIVACY</h3>
            <div className="aprof-menu">
              {legalProfileItems.map(item => <button key={item.key} type="button" className="aprof-menu-item" onClick={() => setActiveLegalDoc(item.key)}>
                  <div className="aprof-menu-icon-box">
                    {item.icon}
                  </div>
                  <span className="aprof-menu-text">{item.label}</span>
                  <AdminProfileChevronIcon />
                </button>)}
            </div>
          </div>}

        <button className="aprof-logout-btn" onClick={onLogout}>
          <AdminProfileLogoutIcon />
          LOGOUT SESSION
        </button>
      </div>
    </div>;
  const desktopProfileContent = <section className="portal-profile-desktop">
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

      {showLegalPanel && <div className="portal-profile-desktop-legal">
          <div className="portal-profile-desktop-admin-header">
            <span>Policies &amp; Privacy</span>
            <p>Review role-relevant legal documents for system use, privacy, and data handling.</p>
          </div>
          <div className="portal-profile-desktop-legal-grid">
            {legalProfileItems.map(item => <button key={item.key} type="button" className="portal-profile-desktop-action legal" onClick={() => setActiveLegalDoc(item.key)}>
                <div className="portal-profile-desktop-action-icon">
                  {item.icon}
                </div>
                <div className="portal-profile-desktop-action-copy">
                  <strong>{item.label}</strong>
                  <span>Open document</span>
                </div>
                <AdminProfileChevronIcon />
              </button>)}
          </div>
        </div>}
    </section>;
  if (accountRole === 'hrmu' && isDesktopViewport) {
    return <>
        <HrmuWorkspaceShell activeKey="" setView={setView} profileData={profileData} onLogout={onLogout}>
          <section className="cssu-desktop-page">{desktopProfileContent}</section>
        </HrmuWorkspaceShell>
        <LegalDocumentModal activeLegalDoc={activeLegalDoc} onClose={() => setActiveLegalDoc(null)} />
        
      </>;
  }
  if (accountRole === 'cssu' && isDesktopViewport) {
    return <>
        <CSSUDesktopPage activeKey="" setView={setView} profileData={profileData} onLogout={onLogout} hideHeader>
          {desktopProfileContent}
        </CSSUDesktopPage>
        <LegalDocumentModal activeLegalDoc={activeLegalDoc} onClose={() => setActiveLegalDoc(null)} />
        
      </>;
  }
  if (accountRole === 'cssu') {
    return <>
        <div className="dashboard-wrapper">
          <div className="content fade-in dash-content profile-content">

            <div className="slip-top-nav">
              <div className="slip-nav-left" onClick={() => setView(homeView)}>
                <BackArrowIcon color="var(--green)" />
                <span className="dash-logo-text">EduRoute</span>
              </div>
              <div className="admin-header-right">
                <div className="admin-bell-wrapper" onClick={() => setView(notificationsView)}>
                  <AdminBellIcon color="var(--text-dark)" />
                  <div className="admin-bell-dot" />
                </div>
                <div className="dash-avatar">
                  <img src={profileData.image} alt="CSSU Profile" style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }} />
                </div>
              </div>
            </div>

            <div className="profile-header-card">
              <div className="profile-bg-wrapper">
                <div className="profile-bg-shape"></div>
              </div>
              <div className="profile-image-container">
                <div className="profile-image-wrapper">
                  <img src={profileData.image} alt="CSSU Profile" style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }} />
                </div>
                <div className="faculty-badge">{badgeLabel}</div>
              </div>

              <h1 className="profile-name">{fullName}</h1>
              <p className="profile-dept">{position}</p>

              <div className="profile-id-pill">
                <IdBadgeIcon color="currentColor" />
                <span>ID: {profileData?.employeeId || 'Not assigned'}</span>
              </div>
            </div>

            <div className="profile-section-title">
              ACCOUNT ADMINISTRATION
            </div>

            <div className="profile-menu-list">
              <div className="profile-menu-item" onClick={() => setView('admin-edit-profile')}>
                <div className="profile-menu-icon" style={{
                background: 'rgba(162, 218, 115, 0.2)'
              }}>
                  <ProfileEditIcon color="var(--green)" />
                </div>
                <span className="profile-menu-text">Edit Profile</span>
                <ChevronRightIcon color="var(--text-light)" />
              </div>

              <div className="profile-menu-item" onClick={() => setView('admin-change-password')}>
                <div className="profile-menu-icon" style={{
                background: 'rgba(162, 218, 115, 0.2)'
              }}>
                  <PasswordIcon color="var(--green)" />
                </div>
                <span className="profile-menu-text">Change Password</span>
                <ChevronRightIcon color="var(--text-light)" />
              </div>
            </div>

            <div className="profile-section-title">
              POLICIES &amp; PRIVACY
            </div>

            <div className="profile-menu-list">
              {legalProfileItems.map(item => <div key={item.key} className="profile-menu-item" onClick={() => setActiveLegalDoc(item.key)}>
                  <div className="profile-menu-icon" style={{
                background: 'rgba(162, 218, 115, 0.2)'
              }}>
                    {item.icon}
                  </div>
                  <span className="profile-menu-text">{item.label}</span>
                  <ChevronRightIcon color="var(--text-light)" />
                </div>)}
            </div>

            <button type="button" className="session-logout-btn" onClick={onLogout}>
              <LogoutIcon color="white" /> LOGOUT SESSION
            </button>

          </div>
          <CSSUBottomNav active="" setView={setView} />
        </div>
        <LegalDocumentModal activeLegalDoc={activeLegalDoc} onClose={() => setActiveLegalDoc(null)} />
        
      </>;
  }
  return <>
      <div className="admin-dash-wrapper" style={{
      background: '#F2F6ED'
    }}>
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
              <div className="admin-avatar" style={{
              border: '3px solid var(--yellow)'
            }} onClick={() => setView('admin-profile')}>
                <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt={fullName} />
              </div>
            </div>
          </div>

          {profileContent}
        </div>
        {accountRole === 'cssu' ? <CSSUBottomNav active="" setView={setView} /> : <AdminBottomNav active="" setView={setView} />}
      </div>
      <LegalDocumentModal activeLegalDoc={activeLegalDoc} onClose={() => setActiveLegalDoc(null)} />
      
    </>;
};

/* ======================================================== */
/* ADMIN EDIT PROFILE VIEW                                  */
/* ======================================================== */
export const AdminEditProfileView = ({
  setView,
  profileData,
  setProfileData
}) => {
  const accountRole = profileData?.accountRole || '';
  const notificationsView = getPortalNotificationsViewForRole(accountRole);
  const isDesktopViewport = useDesktopWorkspaceViewport();
  const position = getPortalPositionLabel(profileData);
  const metaLabel = getPortalMetaLabel(profileData);
  const badgeLabel = getPortalBadgeLabel(accountRole);
  const [fullName, setFullName] = useState(profileData?.fullName || '');
  const [departmentId, setDepartmentId] = useState('');
  const [email, setEmail] = useState(profileData?.email || '');
  const [profileImage, setProfileImage] = useState(profileData?.image || DEFAULT_PROFILE_IMAGE);
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
    if (accountRole !== 'cssu') return undefined;
    let isMounted = true;
    const loadProfile = async () => {
      setEditProfileLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            ...editProfileHeaders(),
            ...(await getSensitiveResponseHeaders())
          }
        });
        const data = await decryptSensitiveResponseJson(await response.json());
        if (!response.ok) {
          throw new Error(formatEditProfileApiMessage(data.errors) || formatEditProfileApiMessage(data.message) || 'Failed to load profile.');
        }
        if (!isMounted) return;
        setFullName(data.data.full_name || '');
        setDepartmentId(String(data.data.department_id || ''));
        setEmail(data.data.email || '');
        setProfileImage(data.data.profile_image_url || DEFAULT_PROFILE_IMAGE);
      } catch (error) {
        if (isMounted) {
          alert(error.message);
        }
      } finally {
        if (isMounted) {
          setEditProfileLoading(false);
        }
      }
    };
    loadProfile();
    return () => {
      isMounted = false;
    };
  }, [accountRole]);
  const handleCssuSave = async () => {
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
      setProfileData?.(prev => ({
        ...prev,
        fullName: data.data.full_name,
        employeeId: data.data.employee_id || prev.employeeId,
        department: data.data.department_name,
        email: data.data.email,
        image: profileImage,
        accountRole: data.data.account_role || prev.accountRole
      }));
      alert(data.message);
      setView('admin-profile');
    } catch (error) {
      alert(error.message);
    } finally {
      setEditProfileLoading(false);
    }
  };
  const handlePortalProfileSave = async () => {
    setEditProfileLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        method: 'PATCH',
        headers: {
          ...editProfileHeaders(),
          ...(await getSensitiveResponseHeaders())
        },
        body: JSON.stringify(await encryptSensitivePayload({
          full_name: fullName
        }))
      });
      const data = await decryptSensitiveResponseJson(await response.json());
      if (!response.ok) {
        throw new Error(formatEditProfileApiMessage(data.errors) || formatEditProfileApiMessage(data.message) || 'Failed to update profile.');
      }
      setProfileData?.(prev => ({
        ...prev,
        fullName: data.data.full_name,
        email: data.data.email,
        image: profileImage,
        accountRole: data.data.account_role || prev.accountRole
      }));
      alert(data.message);
      setView('admin-profile');
    } catch (error) {
      alert(error.message);
    } finally {
      setEditProfileLoading(false);
    }
  };
  const handleCssuPhotoChange = event => {
    const file = event.target.files?.[0];
    if (!file) return;
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
        setProfileData?.(prev => ({
          ...prev,
          image: imageUrl
        }));
        alert(data.message);
      } catch (error) {
        alert(error.message);
      } finally {
        setEditProfileLoading(false);
        event.target.value = '';
      }
    };
    uploadProfileImage();
  };
  const desktopEditContent = <section className="portal-settings-desktop">
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
                <input type="text" value={fullName} onChange={event => setFullName(event.target.value)} />
                <AdminUserOutlineIcon />
              </div>
            </div>

            <div className="portal-settings-desktop-field">
              <label>Academic Email</label>
              <div className="aedit-input-wrapper portal-settings-input-wrapper portal-settings-readonly-email">
                <input type="email" value={email} disabled readOnly />
                <AdminEmailOutlineIcon />
              </div>
            </div>
          </div>

          <div className="portal-settings-desktop-actions">
            <button type="button" className="aedit-save-btn portal-settings-save-btn" onClick={handlePortalProfileSave} disabled={editProfileLoading || !fullName.trim()}>
            
              {editProfileLoading ? 'SAVING...' : 'SAVE CHANGES'}
              <AdminSaveCheckIcon />
            </button>
          </div>
        </div>
      </div>
    </section>;
  if ((accountRole === 'hrmu' || accountRole === 'cssu') && isDesktopViewport) {
    if (accountRole === 'hrmu') {
      return <HrmuWorkspaceShell activeKey="" setView={setView} profileData={profileData} onLogout={() => setView('admin-profile')}>
          <section className="cssu-desktop-page">{desktopEditContent}</section>
        </HrmuWorkspaceShell>;
    }
    return <CSSUDesktopPage activeKey="" setView={setView} profileData={profileData} onLogout={() => setView('admin-profile')} hideHeader>
        {desktopEditContent}
      </CSSUDesktopPage>;
  }
  if (accountRole === 'cssu') {
    return <div className="dashboard-wrapper">
        <div className="content fade-in dash-content editp-content">

          <div className="slip-top-nav chpw-top-nav">
            <div className="slip-nav-left" onClick={() => setView('admin-profile')}>
              <BackArrowIcon color="var(--green)" />
              <span className="dash-logo-text chpw-nav-title">Account Settings</span>
            </div>
            <div className="dash-avatar">
              <img src={profileImage} alt="CSSU Profile" style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }} />
            </div>
          </div>

          <div className="chpw-divider-line" />

          <div className="editp-header">
            <span className="editp-badge">OFFICER IDENTITY</span>
            <h1 className="editp-title">Edit Your Profile</h1>
            <p className="editp-subtitle">Manage your professional presence across the EduRoute security ecosystem.</p>
          </div>

          <div className="editp-photo-section">
            <div className="editp-photo-wrapper">
              <img src={profileImage} alt="Profile" />
              <button type="button" className="editp-camera-btn" onClick={() => fileInputRef.current?.click()}>
                
                <CameraIcon />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" style={{
              display: 'none'
            }} onChange={handleCssuPhotoChange} />
              
            </div>
          </div>

          <div className="editp-field">
            <label className="editp-label">FULL NAME</label>
            <div className="editp-input-wrapper">
              <input type="text" value={fullName} onChange={event => setFullName(event.target.value)} />
              
              <PersonOutlineIcon color="var(--text-light)" />
            </div>
          </div>

          <div className="editp-field">
            <label className="editp-label">ACADEMIC EMAIL</label>
            <div className="editp-input-wrapper">
              <input type="email" value={email} disabled readOnly />
              
              <MailIcon color="var(--text-light)" />
            </div>
          </div>

          <button type="button" className="editp-save-btn" onClick={handleCssuSave} disabled={editProfileLoading || !fullName.trim() || !departmentId}>
            
            {editProfileLoading ? 'SAVING...' : 'SAVE CHANGES'} <CheckCircleIcon />
          </button>

        </div>
        <CSSUBottomNav active="" setView={setView} />
      </div>;
  }
  return <div className="admin-dash-wrapper" style={{
    background: '#F2F6ED'
  }}>
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
            <div className="admin-avatar" style={{
            border: '3px solid var(--yellow)'
          }} onClick={() => setView('admin-profile')}>
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
    </div>;
};
