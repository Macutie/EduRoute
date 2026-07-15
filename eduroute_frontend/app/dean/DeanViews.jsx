import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDeanDashboardSummary, useDeanNotifications, useDeanPendingApprovals, useDeanRealtimeNotifications } from "../../hooks/useDeanDashboard";
import { useNotificationSocket } from "../../hooks/useNotificationSocket";
import { approveDeanLocatorSlipRequest, bulkApproveDeanLocatorSlips, getDeanFacultyOverview, getDeanLocatorSlips, getDeanNotifications, getDeanPendingRequestsPage, getDeanProofComplianceByLocatorSlip, getDeanProofComplianceDetails, getDeanRequestInsights, getDeanRegistryPage, getDeanSignatureSettings, markDeanNotificationRead, rejectDeanLocatorSlipRequest, uploadDeanSignatureFile } from "../../services/deanApi";
import { AdminBadgeIcon, AdminBellIcon, AdminEmailOutlineIcon, AdminProfileChevronIcon, AdminProfileEditIcon, AdminProfileIdIcon, AdminProfileLogoutIcon, AdminProfilePasswordIcon, AdminRoleIcon, AdminSaveCheckIcon, ApproveCheckIcon, ArrowRightIcon, AtSymbolIcon, BackArrowIcon, BadgeIcon, BatteryIcon, BellRingIcon, BriefcaseIcon, CameraIcon, CapIcon, CheckCircleAdminIcon, CheckCircleIcon, CheckCircleSolidIcon, ChevronDownIcon, ChevronRightIcon, ClipboardCheckIcon, ClipboardClockIcon, ClockIcon, CssuChartIcon, CssuIncidentsNavIcon, CssuMapNavIcon, CssuReportsNavIcon, CssuRoleIcon, CssuRosetteCheckIcon, CssuScanNavIcon, CssuTrendingUpIcon, CssuWarningCircleIcon, CssuWarningTriangleIcon, DashboardNavIcon, DeanNotificationDocIcon, DetailClockIcon, DetailClockReturnIcon, DetailDocIcon, DetailPersonIcon, DetailPinIcon, DetailRouteIcon, DocumentIcon, DummySignature, EditPencilIcon, EwanIcon, ExclamationCircleIcon, EyeIcon, EyeOffIcon, FacultyCheckCircleIcon, FacultyChevronRightIcon, FacultyCopyIcon, FacultyCrossCircleIcon, FacultyDocIcon, FacultyFilterIcon, FacultyIdBadgeIcon, FacultyNavIcon, FacultyRoleIcon, FacultySearchIcon, FacultyWaitCircleIcon, FileTextIcon, FilledClockIcon, FlashlightIcon, GlobeIcon, GlobeSmIcon, GraduationCapIcon, GridIcon, HeadsetIcon, HelpCircleIcon, HelpIcon, HomeNavIcon, HourglassIcon, HrmuAlertTinyIcon, HrmuChartIcon, HrmuCheckTinyIcon, HrmuExportIcon, HrmuEyeMiniIcon, HrmuFilterIcon, HrmuMapRouteIcon, HrmuMiniCheckIcon, HrmuPinMiniIcon, HrmuReportIcon, HrmuRoleIcon, HrmuSidebarGridIcon, HrmuSyncIcon, HrmuVerificationIcon, HrmuViewRouteIcon, HrmuWarningIcon, IdBadgeIcon, InboxArchiveIcon, InfoIcon, LinkIcon, LocationPinFilledIcon, LocationPinIcon, LockIcon, LockPrivIcon, LockSmallIcon, LoginDoorIcon, LogoutIcon, MailIcon, MapFoldIcon, MapIcon, ModalCloseIcon, NotifPendingIcon, NotificationIcon, PasswordIcon, PermissionsIcon, PersonOutlineIcon, PinIcon, PlayTriangleIcon, PolicyBulbIcon, PolicyCheckIcon, PrivacyIcon, ProfileEditIcon, ProfileNavIcon, ProgressReviewIcon, QuestionCircleIcon, RefreshClockIcon, RefreshIcon, RegistryDownloadIcon, RegistryEyeIcon, RegistryModalCloseIcon, RegistryModalDoneIcon, RegistryModalIdIcon, RegistryModalVerifiedIcon, RegistryNavIcon, RejectXIcon, RemarksIcon, ReportPrintIcon, RequestsNavIcon, SaveIcon, ScanQRIcon, SendIcon, ShieldCheckIcon, ShieldCheckSmallIcon, ShieldSearchIcon, ShieldSolidIcon, SignalIcon, SignatureNavIcon, SlashedPersonIcon, SlipIcon, StatusGraphIcon, TogaLogoIcon, ToggleSwitch, TrashIcon, UploadIcon, UsersAdminIcon, WifiIcon, XCircleIcon } from "../../components/icons/AppIcons.jsx";
import { DEFAULT_PROFILE_IMAGE, triggerBlobDownload } from "../shared/appUtils.js";
import { useDesktopWorkspaceViewport } from "../cssu/CssuViews.jsx";
import { formatNotificationRelativeTime, getNotificationGroupLabel } from "../shared/dateDisplay.js";
import { generateRegistryLocatorSlipPdf, RegistryDetailsModal } from "../admin/AdminViews.jsx";
import { getCancellationReasonLabel } from "../faculty/FacultyViews.jsx";
import { LegalDocumentModal } from "../../components/legal/LegalDocuments.jsx";
import { FacultyProfileModal } from "../admin/AdminViews.jsx";
import { getTripPathHistory } from "../../services/tripPathHistoryApi.js";
import { TripPathHistoryModal } from "../../components/trips/TripPathHistoryModal.jsx";
export const DeanBottomNav = ({
  setView,
  onOpenRequests,
  active = 'dashboard'
}) => <div className="admin-bottom-nav">
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
    <div className={`admin-nav-item ${active === 'signature' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('dean-signature')}>
      <SignatureNavIcon color={active === 'signature' ? 'var(--green)' : '#9CA3AF'} />
      <span>Signature</span>
    </div>
    <div className={`admin-nav-item ${active === 'faculty' ? 'admin-nav-active' : ''}`} onClick={() => setView && setView('dean-faculty')}>
      <FacultyNavIcon color={active === 'faculty' ? 'var(--green)' : '#9CA3AF'} />
      <span>Faculty</span>
    </div>
  </div>;

const formatDeanProofDateTime = (value) => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';

  return date.toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatDeanAuditDateTime = (value) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';

  return date.toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getDeanProofStatusLabel = (proof) => {
  const normalized = String(proof?.verificationStatus || 'submitted').toLowerCase();
  if (normalized === 'verified') return 'Successful trip';
  if (normalized === 'rejected') return 'Flagged proof';
  if (normalized === 'late_return') return 'Late return';
  return 'Submitted proof';
};

const getDeanProofCheckLabel = (status) => {
  const normalized = String(status || 'submitted').toLowerCase();
  if (normalized === 'verified') return 'SUCCESSFUL';
  if (normalized === 'rejected' || normalized === 'late_return') return 'FLAGGED';
  return 'SUBMITTED';
};

const DeanProofComplianceSheet = ({ proof, onClose, onViewPathHistory }) => {
  if (!proof) return null;

  const proofStatus = getDeanProofStatusLabel(proof);
  const isFlagged = /flagged|late/i.test(proofStatus);
  const arrivalPhoto = proof.arrivalPhotoUrl;
  const focalSignature = proof.focalPersonSignatureUrl;
  const deanSignature = proof.digitalSignature;
  const proofCheckLabel = getDeanProofCheckLabel(proof.verificationStatus);
  const hrmuReviewLabel = getDeanProofCheckLabel(proof.verificationStatus);

  return (
    <div className="dean-proof-sheet-overlay" role="presentation" onClick={onClose}>
      <section className="dean-proof-sheet" role="dialog" aria-modal="true" aria-label="Proof of compliance details" onClick={(event) => event.stopPropagation()}>
        <div className="dean-proof-sheet-grip" />
        <div className="dean-proof-sheet-header">
          <div>
            <span className="dean-proof-eyebrow">Proof of Compliance</span>
            <h2>{proof.facultyName || 'Faculty member'}</h2>
            <p>{proof.collegeName || 'Assigned college'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close proof details">x</button>
        </div>

        <div className={`dean-proof-status-card ${isFlagged ? 'flagged' : ''}`}>
          <span>Status</span>
          <strong>{proofStatus}</strong>
          <p>Submitted {formatDeanProofDateTime(proof.submittedAt)}</p>
        </div>

        <div className="dean-proof-info-grid">
          <div>
            <span>Destination</span>
            <strong>{proof.destination || 'No destination provided'}</strong>
          </div>
          <div>
            <span>Purpose</span>
            <strong>{proof.purpose || 'Official travel'}</strong>
          </div>
          <div>
            <span>Locator Slip</span>
            <strong>{proof.locatorSlipCode || 'Locator Slip'}</strong>
          </div>
        </div>

        <div className="dean-proof-person-card">
          <span>Travel Schedule</span>
          <strong>Departure: {formatDeanProofDateTime(proof.departureTime || proof.departureDatetime || proof.departureDateTime)}</strong>
          <p>Expected return: {formatDeanProofDateTime(proof.expectedReturnTime)}</p>
        </div>

        <div className="dean-proof-media-stack">
          <div className="dean-proof-media-card">
            <span>Focal Person Signature</span>
            {focalSignature ? <img src={focalSignature} alt="Focal person signature" /> : <p>No focal person signature uploaded.</p>}
          </div>
          {deanSignature && (
            <div className="dean-proof-media-card">
              <span>Authorized Digital Signature</span>
              {deanSignature.asset?.mimeType === 'application/pdf' ? (
                <p><a href={deanSignature.asset.url} target="_blank" rel="noreferrer">Open dean signature PDF</a></p>
              ) : deanSignature.asset?.url ? (
                <img src={deanSignature.asset.url} alt={`${deanSignature.name || 'Dean'} digital signature`} />
              ) : (
                <p>No dean signature image available.</p>
              )}
              <strong className="dean-proof-signature-name">{deanSignature.name || 'Assigned Dean'}</strong>
              <p>{deanSignature.role || 'Dean'} • {formatDeanProofDateTime(deanSignature.signedAt)}</p>
            </div>
          )}
          <div className="dean-proof-media-card">
            <span>Arrival Photo</span>
            {arrivalPhoto ? <img src={arrivalPhoto} alt="Arrival proof" /> : <p>No arrival photo uploaded.</p>}
          </div>
        </div>

        <div className="dean-proof-checks">
          <span className="dean-proof-eyebrow">Proof Verification Checks</span>
          <div className="dean-proof-check-grid">
            <div className={isFlagged ? 'flagged' : ''}>
              <span>Proof Status</span>
              <strong>{proofCheckLabel}</strong>
            </div>
            <div>
              <span>Proof of Compliance</span>
              <strong>SUBMITTED</strong>
              <p>{formatDeanProofDateTime(proof.submittedAt)}</p>
            </div>
            <div className={isFlagged ? 'flagged' : ''}>
              <span>HRMU Review</span>
              <strong>{hrmuReviewLabel}</strong>
              <p>{formatDeanProofDateTime(proof.reviewedAt)}</p>
            </div>
            <div>
              <span>Focal Person & Position</span>
              <strong>{proof.focalPersonName || 'Not provided'}</strong>
              <p>{proof.focalPersonPosition || 'Position not provided'}</p>
            </div>
          </div>
        </div>

        {proof.tripId && (
          <button type="button" className="dean-proof-path-btn" onClick={onViewPathHistory}>
            View Path History
          </button>
        )}
      </section>
    </div>
  );
};

export const DeanDashboardView = ({
  setView,
  profileData
}) => {
  const {
    summary,
    setSummary,
    loading: summaryLoading,
    error: summaryError
  } = useDeanDashboardSummary();
  const {
    notifications,
    setNotifications,
    loading: notificationsLoading
  } = useDeanNotifications(5);
  const {
    pendingApprovals,
    setPendingApprovals,
    loading: approvalsLoading
  } = useDeanPendingApprovals(5);
  const {
    toast
  } = useDeanRealtimeNotifications({
    setSummary,
    setNotifications,
    setPendingApprovals
  });
  const [showAllRequests, setShowAllRequests] = useState(false);
  const pendingApprovalRows = Array.isArray(pendingApprovals) ? pendingApprovals : [];
  const statCards = [{
    label: 'PENDING REQUESTS',
    value: summary.pendingRequests,
    icon: <ClipboardClockIcon color="var(--green)" />
  }, {
    label: 'APPROVED TODAY',
    value: summary.approvedToday ?? summary.approvedRequests,
    icon: <CheckCircleAdminIcon color="var(--green)" />
  }, {
    label: 'REJECTED REQUESTS',
    value: summary.rejectedRequests,
    icon: <XCircleIcon color="#EF4444" />
  }, {
    label: 'TOTAL FACULTY',
    value: summary.totalFaculty,
    icon: <UsersAdminIcon color="var(--green)" />
  }];
  return <div className="admin-dash-wrapper dean-dash-wrapper">
      <div className="admin-dash-scroll">
        <div className="admin-header">
          <span className="admin-logo-text">EduRoute</span>
          <div className="admin-header-right">
            <div className="admin-bell-wrapper" onClick={() => setView('dean-notifications')}>
              <AdminBellIcon color="var(--text-dark)" />
              {notifications.some(n => !n.is_read) && <div className="admin-bell-dot" />}
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
          {statCards.map(card => <div className="admin-stat-card" key={card.label}>
              <div className="admin-stat-info">
                <span className="admin-stat-label">{card.label}</span>
                <span className="admin-stat-number">
                  {summaryLoading ? '...' : String(card.value || 0).padStart(2, '0')}
                </span>
              </div>
              {card.icon}
            </div>)}
        </div>

        {!summaryLoading && !summary.signatureReady && <button type="button" className="dean-signature-reminder" onClick={() => setView('dean-signature')}>
            <span>Signature setup required</span>
            <strong>Upload your authorized signature before approving requests.</strong>
          </button>}

        <div className="dean-dashboard-insights">
          <div><span>THIS MONTH</span><strong>{summary.monthlyAnalytics?.requests || 0}</strong><small>filed requests</small></div>
          <div><span>APPROVALS</span><strong>{summary.monthlyAnalytics?.approved || 0}</strong><small>{summary.monthlyAnalytics?.rejected || 0} rejected</small></div>
          <div className="wide"><span>TOP DESTINATION</span><strong>{summary.monthlyAnalytics?.topDestination || 'No trips yet'}</strong><small>Most requested this month</small></div>
        </div>

        {toast && <div className="dean-live-toast">{toast}</div>}

        <div className="admin-notif-card">
          <div className="admin-notif-header">
            <h2>Notifications</h2>
            <span className="admin-notif-viewall" onClick={() => setView('dean-notifications')}>VIEW ALL</span>
          </div>

          {notificationsLoading && <p className="dean-empty-text">Loading notifications...</p>}
          {!notificationsLoading && notifications.length === 0 && <p className="dean-empty-text">No locator slip alerts yet.</p>}
          {!notificationsLoading && notifications.map((n, i) => <div key={n.id}>
              <div className="admin-notif-row">
                {!n.is_read && <div className="admin-notif-dot" />}
                <div className={`admin-notif-content ${n.is_read ? 'no-dot' : ''}`}>
                  <p className="admin-notif-text">{n.message}</p>
                  <span className="admin-notif-time">{n.formatted_created_at || n.created_at}</span>
                </div>
              </div>
              {i < notifications.length - 1 && <div className="admin-notif-divider" />}
            </div>)}
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
            {!approvalsLoading && pendingApprovalRows.length === 0 && <p className="dean-empty-text">No pending locator slips for your college.</p>}
            {!approvalsLoading && pendingApprovalRows.map(approval => <div key={approval.locatorSlipId} className="admin-approvals-row">
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
              </div>)}
          </div>

          <div className="admin-approvals-viewall" onClick={() => setView('dean-requests')}>
            View All Locator Slip Requests
          </div>
        </div>
      </div>

      {showAllRequests && <DeanRequestsModal onClose={() => setShowAllRequests(false)} />}
      <DeanBottomNav setView={setView} onOpenRequests={() => setView('dean-requests')} />
    </div>;
};
export const DeanNotificationsView = ({
  setView,
  profileData,
  setSelectedDeanRequest
}) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProof, setSelectedProof] = useState(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [pathHistoryState, setPathHistoryState] = useState({
    open: false,
    loading: false,
    error: '',
    data: null
  });
  useEffect(() => {
    const loadNotifications = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getDeanNotifications({
          limit: 50
        });
        setNotifications(data.items || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadNotifications();
  }, []);
  const handleDeanInAppNotification = useCallback(payload => {
    if (!payload) return;
    setNotifications(current => {
      const nextItem = {
        id: payload.id,
        recipient_user_id: payload.recipientUserId,
        sender_user_id: payload.senderUserId,
        locator_slip_id: payload.locatorSlipId,
        title: payload.title,
        message: payload.message,
        data: payload.data || {},
        type: payload.type,
        is_read: Boolean(payload.isRead),
        created_at: payload.createdAt
      };
      return [nextItem, ...current.filter(item => item.id !== nextItem.id)];
    });
  }, []);
  useNotificationSocket({
    onNotification: handleDeanInAppNotification
  });
  const handleDismiss = async notificationId => {
    try {
      await markDeanNotificationRead(notificationId);
      setNotifications(prev => prev.filter(item => item.id !== notificationId));
    } catch (err) {
      alert(err.message);
    }
  };
  const handleReviewNotification = async notification => {
    const notificationType = String(notification.type || '').toUpperCase();
    const notificationTitle = String(notification.title || '').toLowerCase();
    const notificationMessage = String(notification.message || '').toLowerCase();
    const notificationData = notification.data || {};
    const locatorSlipId = notificationData.locatorSlipId || notificationData.locator_slip_id || notification.locator_slip_id || notification.locatorSlipId;
    const isTripProofReviewNotification = [
      'PROOF_OF_COMPLIANCE_SUBMITTED',
      'HRMU_PROOF_VERIFICATION_SUCCESSFUL',
      'HRMU_PROOF_VERIFICATION_FLAGGED',
      'HRMU_TRIP_STARTED',
      'HRMU_TRIP_ARRIVED',
      'HRMU_TRIP_COMPLETED',
      'HRMU_TRIP_FLAGGED_LATE_RETURN',
      'HRMU_TRIP_FLAGGED'
    ].includes(notificationType)
      || notificationTitle.includes('proof verified')
      || notificationTitle.includes('proof rejected')
      || notificationTitle.includes('proof of compliance')
      || notificationTitle.includes('faculty returned')
      || notificationTitle.includes('faculty arrived')
      || notificationTitle.includes('faculty started trip')
      || notificationMessage.includes('proof of compliance')
      || notificationMessage.includes('returned on time')
      || notificationMessage.includes('marked the trip as arrived')
      || notificationMessage.includes('started a trip');
    const isProofNotification = notificationType === 'PROOF_OF_COMPLIANCE_SUBMITTED'
      || Boolean(notificationData.proofId || notification.proofId)
      || notificationTitle.includes('proof of compliance')
      || notificationMessage.includes('proof of compliance submitted')
      || isTripProofReviewNotification;

    if (isProofNotification) {
      const proofId = notificationData.proofId || notification.proofId;

      try {
        setProofLoading(true);
        const proof = proofId
          ? await getDeanProofComplianceDetails(proofId)
          : locatorSlipId
            ? await getDeanProofComplianceByLocatorSlip(locatorSlipId)
            : null;

        if (proof) {
          setSelectedProof(proof);
          if (notification.id) {
            await markDeanNotificationRead(notification.id).catch(() => null);
            setNotifications(prev => prev.map(item => item.id === notification.id ? {
              ...item,
              is_read: true
            } : item));
          }
          return;
        }
      } catch (proofError) {
        console.error('Unable to open dean proof notification:', proofError);
      } finally {
        setProofLoading(false);
      }

      if (!locatorSlipId) {
        alert('This notification is missing its locator slip reference.');
        return;
      }
    }

    if (notificationType === 'LOCATOR_SLIP_CANCELLED') {
      setView('dean-registry');
      return;
    }
    if (!locatorSlipId) {
      setView('dean-requests');
      return;
    }
    try {
      const requestDetails = await getDeanRequestInsights(locatorSlipId);
      localStorage.setItem('edurouteDeanRequestId', locatorSlipId);
      localStorage.setItem('edurouteLastView', 'dean-request-detail');
      setSelectedDeanRequest?.({
        ...requestDetails,
        backView: 'dean-notifications'
      });
      setView('dean-request-detail');
    } catch (reviewError) {
      console.error('Failed to open notification request:', reviewError);
      setView('dean-registry');
    }
  };
  const openDeanProofPathHistory = async () => {
    if (!selectedProof?.tripId) {
      setPathHistoryState({
        open: true,
        loading: false,
        error: 'No trip path is linked to this proof yet.',
        data: null
      });
      return;
    }

    setPathHistoryState({
      open: true,
      loading: true,
      error: '',
      data: null
    });

    try {
      const data = await getTripPathHistory(selectedProof.tripId);
      setPathHistoryState({
        open: true,
        loading: false,
        error: '',
        data
      });
    } catch (pathError) {
      setPathHistoryState({
        open: true,
        loading: false,
        error: pathError.message || 'Failed to load trip path history.',
        data: null
      });
    }
  };
  const groupedNotifications = notifications.reduce((groups, notification) => {
    const label = getNotificationGroupLabel(notification.created_at);
    return {
      ...groups,
      [label]: [...(groups[label] || []), notification]
    };
  }, {});
  const orderedGroups = Object.entries(groupedNotifications);
  return <div className="admin-dash-wrapper dean-notifications-wrapper">
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
              {notifications.some(item => !item.is_read) && <div className="admin-bell-dot" />}
            </div>
            <div className="admin-avatar" style={{
            border: '3px solid var(--yellow)'
          }} onClick={() => setView('dean-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Dean" />
            </div>
          </div>
        </div>

        <div className="dean-notification-list">
          {loading && <p className="dean-empty-text">Loading notifications...</p>}
          {error && <p className="dean-error-text">{error}</p>}
          {!loading && !error && notifications.length === 0 && <p className="dean-empty-text">No dean notifications yet.</p>}

          {!loading && orderedGroups.map(([groupLabel, items]) => <div key={groupLabel} className="dean-notification-group">
              {groupLabel !== 'Today' && <div className="dean-notification-divider">
                  <span>{groupLabel}</span>
                  <div />
                </div>}

              {items.map(notification => {
            const isPendingNotice = /pending|approval|signature/i.test(notification.message || notification.title || '');
            return <article className="dean-notification-card" key={notification.id}>
                    <DeanNotificationDocIcon tone={isPendingNotice ? 'pending' : 'green'} />
                    <div className="dean-notification-body">
                      <div className="dean-notification-title-row">
                        <h2>{notification.title || 'New locator slip request submitted'}</h2>
                        <time>{formatNotificationRelativeTime(notification.created_at)}</time>
                      </div>
                      <p>{notification.message}</p>
                      <div className="dean-notification-actions">
                        <button type="button" className="review" onClick={() => handleReviewNotification(notification)} disabled={proofLoading}>
                          {proofLoading ? 'OPENING...' : 'REVIEW'}
                        </button>
                        <button type="button" className="dismiss" onClick={() => handleDismiss(notification.id)}>
                          DISMISS
                        </button>
                      </div>
                    </div>
                  </article>;
          })}
            </div>)}
        </div>
      </div>
      <DeanBottomNav active="dashboard" setView={setView} onOpenRequests={() => setView('dean-dashboard')} />
      {selectedProof && <DeanProofComplianceSheet proof={selectedProof} onClose={() => setSelectedProof(null)} onViewPathHistory={openDeanProofPathHistory} />}
      {pathHistoryState.open && <TripPathHistoryModal history={pathHistoryState.data} loading={pathHistoryState.loading} error={pathHistoryState.error} onClose={() => setPathHistoryState({
        open: false,
        loading: false,
        error: '',
        data: null
      })} />}
    </div>;
};
export const buildLocatorSlipReference = request => {
  if (!request?.locatorSlipId) return 'LS-000-000';
  const yearSource = request.createdAt || request.dateSubmitted;
  const year = yearSource ? new Date(yearSource).getFullYear() : new Date().getFullYear();
  const numericId = String(request.locatorSlipId).padStart(3, '0');
  return `LS-${year}-${numericId}`;
};
export const DeanRequestsView = ({
  setView,
  profileData,
  setSelectedDeanRequest
}) => {
  const defaultRequestData = {
    summary: {
      pending: 0,
      onsiteFaculty: 0,
      offsiteFaculty: 0,
      urgent: 0
    },
    items: []
  };
  const [requestData, setRequestData] = useState({
    summary: {
      pending: 0,
      onsiteFaculty: 0,
      offsiteFaculty: 0,
      urgent: 0
    },
    items: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkApproving, setBulkApproving] = useState(false);
  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getDeanPendingRequestsPage({
        search,
        priority: priorityFilter
      });
      const nextItems = Array.isArray(data?.items) ? data.items : [];
      setRequestData({
        summary: {
          ...defaultRequestData.summary,
          ...(data?.summary || {})
        },
        items: nextItems
      });
      setSelectedIds(current => current.filter(id => nextItems.some(item => item.locatorSlipId === id && item.isLowRisk)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, priorityFilter]);
  useEffect(() => {
    loadRequests();
  }, [loadRequests]);
  const handleBulkApprove = async () => {
    if (!selectedIds.length || bulkApproving) return;
    try {
      setBulkApproving(true);
      const result = await bulkApproveDeanLocatorSlips(selectedIds);
      alert(`${result.approvedCount} request${result.approvedCount === 1 ? '' : 's'} approved.${result.skippedCount ? ` ${result.skippedCount} require individual review.` : ''}`);
      setSelectedIds([]);
      await loadRequests();
    } catch (bulkError) {
      alert(bulkError.message || 'Bulk approval failed.');
    } finally {
      setBulkApproving(false);
    }
  };
  const safeRequestSummary = {
    ...defaultRequestData.summary,
    ...(requestData?.summary || {})
  };
  const requestRows = Array.isArray(requestData?.items) ? requestData.items : [];
  const requestStats = [{
    label: 'PENDING',
    value: safeRequestSummary.pending,
    urgent: false
  }, {
    label: 'ON-SITE FACULTY',
    value: safeRequestSummary.onsiteFaculty,
    urgent: false
  }, {
    label: 'OFF-SITE FACULTY',
    value: safeRequestSummary.offsiteFaculty,
    urgent: false
  }, {
    label: 'URGENT',
    value: safeRequestSummary.urgent,
    urgent: true
  }];
  return <div className="admin-dash-wrapper dean-requests-wrapper">
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
            <div className="admin-avatar" style={{
            border: '3px solid var(--yellow)'
          }} onClick={() => setView('dean-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Dean" />
            </div>
          </div>
        </div>

        <div className="dean-requests-hero">
          <h1>Approval Requests</h1>
          <p>Review and manage pending faculty locator slips.</p>
        </div>

        <div className="dean-requests-stats">
          {requestStats.map(stat => <div className={`dean-request-stat-card ${stat.urgent ? 'urgent' : ''}`} key={stat.label}>
              <span>{stat.label}</span>
              <strong>{loading ? '...' : String(stat.value || 0).padStart(2, '0')}</strong>
            </div>)}
        </div>

        <div className="dean-request-tools">
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search faculty, ID, purpose, or destination" />
          <select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)}>
            <option value="all">All priorities</option>
            <option value="urgent">Urgent only</option>
            <option value="soon">Leaving within 24 hours</option>
          </select>
        </div>

        {selectedIds.length > 0 && <div className="dean-bulk-bar">
            <span>{selectedIds.length} low-risk request{selectedIds.length === 1 ? '' : 's'} selected</span>
            <button type="button" onClick={handleBulkApprove} disabled={bulkApproving}>
              {bulkApproving ? 'Approving...' : 'Approve Selected'}
            </button>
          </div>}

        {error && <p className="dean-error-text dean-requests-message">{error}</p>}
        {loading && <p className="dean-empty-text dean-requests-message">Loading pending locator slips...</p>}
        {!loading && !error && requestRows.length === 0 && <p className="dean-empty-text dean-requests-message">No pending locator slip requests right now.</p>}

        <div className="dean-request-page-list">
          {!loading && requestRows.map(request => <article className={`dean-request-page-card ${request.isUrgent ? 'urgent' : ''} risk-${request.riskLevel || 'low'}`} key={request.locatorSlipId}>
            
              <div className="dean-request-page-top">
                <div>
                  <h2>
                    {request.facultyName}
                    {request.isUrgent && <span className="urgent-mark">!</span>}
                  </h2>
                  <p>{request.position || 'Instructor'} - {request.dateSubmitted}</p>
                </div>
                <div className="dean-request-card-badges">
                  <span className={`dean-priority-pill ${request.priority?.level || 'normal'}`}>{request.priority?.label || 'Normal'}</span>
                  <span className="dean-request-pending-pill">PENDING</span>
                </div>
              </div>

              <div className="dean-risk-row">
                <span className={`dean-risk-pill ${request.riskLevel || 'low'}`}>{request.riskLevel || 'low'} risk</span>
                {request.riskIndicators?.slice(0, 2).map(indicator => <span className="dean-risk-note" key={indicator}>{indicator}</span>)}
                {request.isLowRisk && <label className="dean-low-risk-select">
                    <input type="checkbox" checked={selectedIds.includes(request.locatorSlipId)} onChange={event => setSelectedIds(current => event.target.checked ? [...current, request.locatorSlipId] : current.filter(id => id !== request.locatorSlipId))} />
                
                    Select for bulk approval
                  </label>}
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

              <button type="button" className="dean-request-details-btn" onClick={() => {
            localStorage.setItem('edurouteDeanRequestId', request.locatorSlipId);
            localStorage.setItem('edurouteLastView', 'dean-request-detail');
            setSelectedDeanRequest?.({
              ...request,
              backView: 'dean-requests'
            });
            setView('dean-request-detail');
          }}>
              
                View Details
              </button>
            </article>)}
        </div>
      </div>
      <DeanBottomNav active="requests" setView={setView} onOpenRequests={() => setView('dean-requests')} />
    </div>;
};
export const DeanRequestDetailView = ({
  setView,
  profileData,
  request
}) => {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionRemarks, setRejectionRemarks] = useState(() => request?.locatorSlipId ? localStorage.getItem(`dean-rejection-draft:${request.locatorSlipId}`) || request.additionalRemarks || '' : '');
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(Boolean(request?.locatorSlipId));
  useEffect(() => {
    if (!request?.locatorSlipId) return undefined;
    let active = true;
    getDeanRequestInsights(request.locatorSlipId).then(data => active && setInsights(data)).catch(error => console.error('Failed to load request insights:', error)).finally(() => active && setInsightsLoading(false));
    return () => {
      active = false;
    };
  }, [request?.locatorSlipId]);
  useEffect(() => {
    if (!request?.locatorSlipId) return;
    const draftKey = `dean-rejection-draft:${request.locatorSlipId}`;
    if (rejectionRemarks.trim()) localStorage.setItem(draftKey, rejectionRemarks);else localStorage.removeItem(draftKey);
  }, [request?.locatorSlipId, rejectionRemarks]);
  if (!request) {
    return <div className="admin-dash-wrapper dean-requests-wrapper">
        <div className="admin-dash-scroll" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '16px',
        textAlign: 'center'
      }}>
          <p className="dean-empty-text">No locator slip selected.</p>
          <button type="button" className="dean-request-details-btn" onClick={() => setView('dean-requests')}>
            Return to Requests
          </button>
        </div>
        <DeanBottomNav active="requests" setView={setView} onOpenRequests={() => setView('dean-requests')} />
      </div>;
  }
  const slipReference = buildLocatorSlipReference(request);
  const requestInsights = insights || request;
  const formattedDeparture = request.formattedDepartureDatetime || request.departureDatetime || 'Not provided';
  const formattedReturn = request.formattedExpectedReturnDatetime || request.expectedReturnDatetime || 'Not provided';
  const normalizedStatus = request.statusLabel || (request.status === 'approved' || request.status === 'completed' ? 'verified' : request.status);
  const backView = request.backView || 'dean-requests';
  const statusText = normalizedStatus === 'verified' ? 'Verified' : normalizedStatus ? `${normalizedStatus.charAt(0).toUpperCase()}${normalizedStatus.slice(1)}` : 'Pending';
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
      localStorage.removeItem(`dean-rejection-draft:${request.locatorSlipId}`);
      alert('Locator slip rejected successfully.');
      setShowRejectModal(false);
      setView('dean-requests');
    } catch (error) {
      alert(error.message || 'Failed to reject locator slip.');
    } finally {
      setRejecting(false);
    }
  };
  return <div className="admin-dash-wrapper dean-requests-wrapper">
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

        <div className="dean-intelligence-grid">
          <section className={`dean-intelligence-card risk-${requestInsights.riskLevel || 'low'}`}>
            <span>REQUEST REVIEW</span>
            <strong>{insightsLoading ? 'Checking...' : `${requestInsights.riskLevel || 'Low'} risk`}</strong>
            <p>{requestInsights.riskIndicators?.length ? requestInsights.riskIndicators.join(' • ') : 'No schedule conflicts or recurring incidents detected.'}</p>
          </section>
          <section className="dean-intelligence-card">
            <span>FACULTY SNAPSHOT</span>
            <strong>{requestInsights.recentRequests?.length || 0} recent requests</strong>
            <p>{requestInsights.lateReturns || 0} late returns • {requestInsights.priorRejections || 0} rejected</p>
          </section>
        </div>

        {requestInsights.recentRequests?.length > 0 && <div className="dean-history-card">
            <h3>Recent Faculty Activity</h3>
            {requestInsights.recentRequests.map(item => <div className="dean-history-row" key={item.locatorSlipId}>
                <div><strong>{item.destination}</strong><span>{item.formattedCreatedAt}</span></div>
                <span className={`dean-history-status ${item.status}`}>{item.status}</span>
              </div>)}
          </div>}

        {requestInsights.timeline?.length > 0 && <div className="dean-history-card dean-audit-card">
            <h3>Request Audit Timeline</h3>
            {requestInsights.timeline.map(item => <div className="dean-audit-row" key={`${item.label}-${item.timestamp}`}>
                <span className={`dean-audit-dot ${item.tone}`} />
                <div><strong>{item.label}</strong><span>{formatDeanAuditDateTime(item.timestamp)} • {formatNotificationRelativeTime(item.timestamp)}</span></div>
              </div>)}
          </div>}

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

        {showActions && <div className="adet-actions">
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
          </div>}

        {showRejectModal && <div className="adet-modal-backdrop" role="presentation" onClick={() => !rejecting && setShowRejectModal(false)}>
            <div className="adet-modal-card" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
              <span className="adet-modal-kicker">REJECT LOCATOR SLIP</span>
              <h3>Reason for rejection</h3>
              <p>Enter the reason so the faculty member can see why this locator slip was rejected.</p>
              <div className="adet-modal-field">
                <label htmlFor="dean-rejection-remarks">Dean remarks</label>
                <div className="dean-remarks-templates">
                  {['Schedule conflict', 'Incomplete trip details', 'Official purpose needs clarification'].map(template => <button type="button" key={template} onClick={() => setRejectionRemarks(template)} disabled={rejecting}>{template}</button>)}
                </div>
                <textarea id="dean-rejection-remarks" value={rejectionRemarks} onChange={event => setRejectionRemarks(event.target.value)} placeholder="Type the reason for rejection..." maxLength={1000} disabled={rejecting} />
              
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
          </div>}
      </div>

      <DeanBottomNav active="requests" setView={setView} onOpenRequests={() => setView('dean-requests')} />
    </div>;
};
export const DeanRegistryView = ({
  setView,
  profileData
}) => {
  const [registryData, setRegistryData] = useState({
    summary: null,
    items: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRegistryItem, setSelectedRegistryItem] = useState(null);
  const [registryFilter, setRegistryFilter] = useState('all');
  const [downloadingRegistryItemId, setDownloadingRegistryItemId] = useState(null);
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
  const registryFilterOptions = [{
    key: 'all',
    label: 'All'
  }, {
    key: 'pending',
    label: 'Pending'
  }, {
    key: 'verified',
    label: 'Verified'
  }, {
    key: 'rejected',
    label: 'Rejected'
  }, {
    key: 'cancelled',
    label: 'Cancelled'
  }];
  const filteredItems = items.filter(item => {
    if (registryFilter === 'all') return true;
    const normalizedStatus = String(item.statusLabel || item.status || '').trim().toLowerCase();
    return normalizedStatus === registryFilter;
  });
  const exportPrivacySafeRegistry = () => {
    const escapeCsv = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [['Reference', 'Faculty', 'Faculty ID', 'Destination', 'Purpose', 'Status', 'Date submitted'], ...filteredItems.map(item => [item.referenceNumber || buildLocatorSlipReference(item), item.facultyName, item.employeeId, item.destination, item.purpose, item.statusLabel || item.status, item.dateValue || item.dateSubmitted])];
    const csv = rows.map(row => row.map(escapeCsv).join(',')).join('\n');
    triggerBlobDownload(new Blob([csv], {
      type: 'text/csv;charset=utf-8'
    }), `dean-registry-${new Date().toISOString().slice(0, 10)}.csv`);
  };
  const downloadRegistryPdf = async item => {
    const itemId = item.locatorSlipId || item.referenceNumber;
    try {
      setDownloadingRegistryItemId(itemId);
      setError('');
      await generateRegistryLocatorSlipPdf(item);
    } catch (downloadError) {
      setError(downloadError.message || 'Failed to export locator slip PDF.');
    } finally {
      setDownloadingRegistryItemId(null);
    }
  };
  return <div className="admin-dash-wrapper dean-requests-wrapper">
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
          <div><h1>Requests</h1><p>Strategic Oversight Registry</p></div>
          <button type="button" className="dean-registry-export" onClick={exportPrivacySafeRegistry}>Export CSV</button>
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

        <div className="status-filter-row">
          {registryFilterOptions.map(option => <button key={option.key} type="button" className={`status-filter-chip ${registryFilter === option.key ? 'active' : ''}`} onClick={() => setRegistryFilter(option.key)}>
            
              {option.label}
            </button>)}
        </div>

        {error && <p className="dean-error-text dean-requests-message">{error}</p>}
        {loading && <p className="dean-empty-text dean-requests-message">Loading request registry...</p>}
        {!loading && !error && filteredItems.length === 0 && <p className="dean-empty-text dean-requests-message">No locator slips have been filed for this college yet.</p>}

        <div className="areg-cards">
          {filteredItems.map(item => <div key={item.locatorSlipId} className="areg-card">
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
              {item.status === 'cancelled' && item.cancellationReason && <div className="areg-card-cancel-reason">
                  <span className="areg-detail-label">CANCELLATION REASON</span>
                  <span className="areg-detail-value">{getCancellationReasonLabel(item.cancellationReason)}</span>
                </div>}
              {item.status === 'rejected' && (item.rejectionReason || item.additionalRemarks) && <div className="areg-card-cancel-reason">
                  <span className="areg-detail-label">REJECTION REASON</span>
                  <span className="areg-detail-value">{item.rejectionReason || item.additionalRemarks}</span>
                </div>}

              <div className="areg-card-actions">
                <button type="button" className="areg-view-btn" onClick={() => setSelectedRegistryItem(item)}>
                
                  <RegistryEyeIcon />
                  VIEW DETAILS
                </button>
                <button type="button" className="areg-download-btn" aria-label="Download locator slip PDF" disabled={downloadingRegistryItemId === (item.locatorSlipId || item.referenceNumber)} onClick={() => downloadRegistryPdf(item)}>
                  <RegistryDownloadIcon />
                </button>
              </div>
            </div>)}
        </div>
      </div>

      <DeanBottomNav active="registry" setView={setView} onOpenRequests={() => setView('dean-requests')} />
      {selectedRegistryItem && <RegistryDetailsModal item={selectedRegistryItem} onClose={() => setSelectedRegistryItem(null)} />}
    </div>;
};
export const DeanSignatureView = ({
  setView,
  profileData
}) => {
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  useEffect(() => {
    let active = true;
    const loadSettings = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await getDeanSignatureSettings();
        if (!active) return;
        setSettings(data);
        setConsentChecked(Boolean(data?.consentAccepted));
        setShowPermissionModal(!data?.consentAccepted);
      } catch (requestError) {
        if (!active) return;
        setError(requestError.message || 'Failed to load your digital signature settings.');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadSettings();
    return () => {
      active = false;
    };
  }, []);
  const selectedImagePreview = useMemo(() => {
    if (!selectedFile || !selectedFile.type?.startsWith('image/')) return '';
    return URL.createObjectURL(selectedFile);
  }, [selectedFile]);
  useEffect(() => () => {
    if (selectedImagePreview) {
      URL.revokeObjectURL(selectedImagePreview);
    }
  }, [selectedImagePreview]);
  const currentMimeType = selectedFile?.type || settings?.signatureMimeType || '';
  const currentFileName = selectedFile?.name || settings?.signatureOriginalFilename || 'No signature uploaded yet';
  const hasCurrentPdf = currentMimeType === 'application/pdf' && (selectedFile || settings?.signatureUrl);
  const hasCurrentImage = currentMimeType.startsWith('image/') && (selectedImagePreview || settings?.signatureUrl);
  const handleChooseFile = () => {
    if (!consentChecked && !settings?.consentAccepted) {
      setShowPermissionModal(true);
      return;
    }
    fileInputRef.current?.click();
  };
  const handleApprovePermission = () => {
    setConsentChecked(true);
    setShowPermissionModal(false);
  };
  const handleUpload = async () => {
    if (!selectedFile) {
      alert('Please choose a PDF or image signature file first.');
      return;
    }
    if (!consentChecked && !settings?.consentAccepted) {
      alert('Please confirm the permission statement before uploading your digital signature.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const data = await uploadDeanSignatureFile({
        file: selectedFile,
        consentAccepted: consentChecked
      });
      setSettings(data);
      setConsentChecked(Boolean(data?.consentAccepted));
      setSelectedFile(null);
      alert('Digital signature uploaded successfully. It will now be attached to approved locator slips.');
    } catch (requestError) {
      alert(requestError.message || 'Failed to upload the digital signature.');
    } finally {
      setSaving(false);
    }
  };
  return <div className="admin-dash-wrapper dean-signature-wrapper">
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

        <div className="dean-signature-hero">
          <span className="dean-signature-badge">DEAN CONSENT</span>
          <h1>Digital Signature</h1>
          <p>Upload the official dean signature that EduRoute will attach to approved locator slips for your faculty members.</p>
        </div>

        {loading && <p className="dean-empty-text dean-signature-message">Loading your signature settings...</p>}
        {error && <p className="dean-error-text dean-signature-message">{error}</p>}

        {!loading && <>
            {showPermissionModal && <div className="permission-modal-backdrop" onClick={() => setView('dean-dashboard')}>
                <div className="permission-modal-card dean-signature-permission-modal" onClick={event => event.stopPropagation()}>
                  <div className="permission-modal-glow" />
                  <div className="permission-modal-icon">
                    <SignatureNavIcon color="var(--green)" />
                  </div>
                  <span className="permission-modal-kicker">DEAN CONSENT</span>
                  <h3 className="permission-modal-title">Authorize Your Digital Signature</h3>
                  <p className="permission-modal-copy">{settings?.permissionText}</p>
                  <div className="permission-modal-note">
                    HRMU will be able to see this attached signature as proof that the locator slip was accepted by the respective dean.
                  </div>
                  <button type="button" className="permission-primary-btn" onClick={handleApprovePermission}>
                    Approve and Continue
                  </button>
                  <button type="button" className="permission-ghost-btn" onClick={() => setView('dean-dashboard')}>
                    Back to Dashboard
                  </button>
                </div>
              </div>}

            <div className="dean-signature-card">
              <h3>Signature Authorization</h3>
              <p>
                {settings?.consentAccepted || consentChecked ? 'Permission approved. You can now upload the official signature file that will be attached to approved locator slips for your department.' : 'Please approve the permission statement first. Once approved, you can upload your official digital signature.'}
              </p>
              {settings?.consentedAt && <p className="dean-signature-meta">
                  Permission granted on {new Date(settings.consentedAt).toLocaleString('en-US', {
              timeZone: 'Asia/Manila'
            })}.
                </p>}
              {!settings?.consentAccepted && consentChecked && <p className="dean-signature-meta">
                  Permission approved for this upload session. Finish uploading your signature to save it for future approvals.
                </p>}
            </div>

            <div className={`dean-signature-card ${!settings?.consentAccepted && !consentChecked ? 'locked' : ''}`}>
              <h3>Upload Signature File</h3>
              <p>Accepted file types: PDF, JPG, PNG, and WebP.</p>
              <input ref={fileInputRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" style={{
            display: 'none'
          }} onChange={event => setSelectedFile(event.target.files?.[0] || null)} />
            

              <div className="dean-signature-actions">
                <button type="button" className="dean-signature-secondary-btn" onClick={handleChooseFile}>
                  {selectedFile ? 'Change File' : 'Choose File'}
                </button>
                <button type="button" className="dean-signature-primary-btn" disabled={saving} onClick={handleUpload}>
                  {saving ? 'Uploading...' : 'Upload Signature'}
                </button>
              </div>

              <div className="dean-signature-file-note">
                <span>Current file:</span>
                <strong>{currentFileName}</strong>
              </div>

              {hasCurrentImage && <div className="dean-signature-preview-card">
                  <img src={selectedImagePreview || settings?.signatureUrl} alt="Dean signature preview" className="dean-signature-preview-image" />
                </div>}

              {hasCurrentPdf && <div className="dean-signature-pdf-card">
                  <span>PDF signature on file</span>
                  <a href={selectedFile ? '#' : settings?.signatureUrl} target="_blank" rel="noreferrer" onClick={event => selectedFile && event.preventDefault()}>
                    {selectedFile ? 'Preview after upload' : 'Open PDF'}
                  </a>
                </div>}

              {!selectedFile && settings?.signatureUrl && <p className="dean-signature-meta">
                  Uploaded on {settings.uploadedAt ? new Date(settings.uploadedAt).toLocaleString('en-US', {
              timeZone: 'Asia/Manila'
            }) : 'recently'}.
                </p>}
            </div>
          </>}
      </div>

      <DeanBottomNav active="signature" setView={setView} onOpenRequests={() => setView('dean-requests')} />
    </div>;
};
export const DeanRequestsModal = ({
  onClose
}) => {
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
        const data = await getDeanLocatorSlips({
          status,
          search,
          limit: 50
        });
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
  return <div className="dean-modal-backdrop" role="dialog" aria-modal="true">
      <div className="dean-requests-modal">
        <div className="dean-modal-header">
          <div>
            <h2>Locator Slip Requests</h2>
            <p>Only faculty from your assigned college are shown.</p>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>

        <div className="dean-modal-tools">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search faculty, purpose, or destination" />
          
          <select value={status} onChange={e => setStatus(e.target.value)}>
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
          {requests.map(request => <div className="dean-request-card" key={request.locatorSlipId}>
              <div>
                <strong>{request.facultyName}</strong>
                <p>{request.purpose}</p>
                <span>{request.destination}</span>
              </div>
              <div className={`dean-status-pill ${request.status}`}>
                {request.status}
              </div>
              <time>{request.formattedCreatedAt}</time>
            </div>)}
        </div>
      </div>
    </div>;
};
export const DeanFacultyView = ({
  setView,
  profileData
}) => {
  const [search, setSearch] = useState('');
  const [facultyData, setFacultyData] = useState({
    summary: {
      totalFaculty: 0,
      activeRequests: 0
    },
    items: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProfile, setSelectedProfile] = useState(null);
  const facultySummary = facultyData?.summary || {
    totalFaculty: 0,
    activeRequests: 0
  };
  const facultyRows = Array.isArray(facultyData?.items) ? facultyData.items : [];
  useEffect(() => {
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getDeanFacultyOverview({
          search
        });
        setFacultyData({
          summary: data?.summary || {
            totalFaculty: 0,
            activeRequests: 0
          },
          items: Array.isArray(data?.items) ? data.items : []
        });
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
  return <div className="admin-dash-wrapper dean-faculty-wrapper">
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
            <div className="admin-avatar" style={{
            border: '3px solid var(--yellow)'
          }} onClick={() => setView('dean-profile')}>
              <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Dean" />
            </div>
          </div>
        </div>

        <div className="afac-stats-grid dean-faculty-stats">
          <div className="afac-stat-card">
            <span className="afac-stat-label">TOTAL FACULTY</span>
            <span className="afac-stat-number">{loading ? '...' : String(facultySummary.totalFaculty || 0).padStart(2, '0')}</span>
          </div>
          <div className="afac-stat-card">
            <span className="afac-stat-label">ACTIVE REQUESTS</span>
            <span className="afac-stat-number">{loading ? '...' : String(facultySummary.activeRequests || 0).padStart(2, '0')}</span>
          </div>
        </div>

        <div className="afac-search-bar">
          <div className="afac-search-input-wrapper">
            <FacultySearchIcon />
            <input type="text" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search faculty members..." className="afac-search-input" />
            
          </div>
        </div>

        <h2 className="afac-title">Faculty Overview</h2>
        {error && <p className="dean-error-text dean-faculty-message">{error}</p>}
        {loading && <p className="dean-empty-text dean-faculty-message">Loading registered faculty...</p>}
        {!loading && facultyRows.length === 0 && <p className="dean-empty-text dean-faculty-message">No registered faculty found for your college.</p>}

        <div className="afac-cards dean-faculty-cards">
          {!loading && facultyRows.map(member => <div key={member.id} className={`afac-card border-${member.borderColor}`}>
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
                  {member.remainingStatusCount > 0 && <div className="afac-more-indicator">+{member.remainingStatusCount}</div>}
                </div>
                <button className="afac-view-profile" type="button" onClick={() => setSelectedProfile({
              name: member.fullName,
              role: member.position || 'Instructor',
              tenure: member.employmentLabel,
              idNumber: member.employeeId,
              image: member.profileImageUrl || DEFAULT_PROFILE_IMAGE,
              locatorSlipHistory: member.locatorSlipHistory || member.acceptedLocatorSlips || [],
              acceptedLocatorSlips: member.acceptedLocatorSlips || []
            })}>
                
                  View Profile <FacultyChevronRightIcon />
                </button>
              </div>
            </div>)}
        </div>
      </div>
      <DeanBottomNav active="faculty" setView={setView} onOpenRequests={() => setView('dean-dashboard')} />
      <FacultyProfileModal profile={selectedProfile} onClose={() => setSelectedProfile(null)} />
    </div>;
};

/* ======================================================== */
/* ADMIN PROFILE VIEW                                       */
/* ======================================================== */
export const getDeanRoleLabel = accountRole => accountRole === 'assistant_dean' ? 'Assistant Dean' : 'Dean';
export const DEAN_DEPARTMENT_ABBREVIATIONS = {
  'College of Computer Studies': 'CCS',
  'College of Hospitality and Tourism Management': 'CHTM',
  'College of Education, Arts and Sciences': 'CEAS',
  'College of Allied Health Studies': 'CAHS',
  'College of Business and Accountancy': 'CBA'
};
export const getDeanBadgeLabel = (department = '', accountRole = '') => {
  const normalizedDepartment = String(department || '').trim();
  const acronym = DEAN_DEPARTMENT_ABBREVIATIONS[normalizedDepartment] || normalizedDepartment.replace(/^College of\s+/i, '').split(/\s+|,/).filter(Boolean).map(word => word[0]?.toUpperCase()).join('').slice(0, 4) || 'DEAN';
  return `${acronym} ${accountRole === 'assistant_dean' ? 'ASST' : 'Dean'}`;
};
export const DeanProfileView = ({
  setView,
  profileData,
  onLogout
}) => {
  const isDesktopViewport = useDesktopWorkspaceViewport();
  const roleLabel = getDeanRoleLabel(profileData?.accountRole);
  const department = profileData?.department || 'Assigned College';
  const badgeLabel = getDeanBadgeLabel(department, profileData?.accountRole);
  const fullName = profileData?.fullName || 'Dean Account';
  if (!isDesktopViewport) {
    return <div className="dashboard-wrapper">
        <div className="content fade-in dash-content profile-content">

          <div className="slip-top-nav">
            <div className="slip-nav-left" onClick={() => setView('dean-dashboard')}>
              <BackArrowIcon color="var(--green)" />
              <span className="dash-logo-text">EduRoute</span>
            </div>
            <div className="admin-header-right">
              <div className="admin-bell-wrapper" onClick={() => setView('dean-notifications')}>
                <AdminBellIcon color="var(--text-dark)" />
                <div className="admin-bell-dot" />
              </div>
              <div className="dash-avatar">
                <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt="Dean profile" style={{
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
                <img src={profileData?.image || DEFAULT_PROFILE_IMAGE} alt={fullName} style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }} />
              </div>
              <div className="faculty-badge">{badgeLabel}</div>
            </div>

            <h1 className="profile-name">{fullName}</h1>
            <p className="profile-dept">{roleLabel} of {department}</p>

            <div className="profile-id-pill">
              <IdBadgeIcon color="currentColor" />
              <span>ID: {profileData?.employeeId || 'Not assigned'}</span>
            </div>
          </div>

          <div className="profile-section-title">
            ACCOUNT ADMINISTRATION
          </div>

          <div className="profile-menu-list">
            <div className="profile-menu-item" onClick={() => setView('dean-edit-profile')}>
              <div className="profile-menu-icon" style={{
              background: 'rgba(162, 218, 115, 0.2)'
            }}>
                <ProfileEditIcon color="var(--green)" />
              </div>
              <span className="profile-menu-text">Edit Profile</span>
              <ChevronRightIcon color="var(--text-light)" />
            </div>

            <div className="profile-menu-item" onClick={() => setView('dean-change-password')}>
              <div className="profile-menu-icon" style={{
              background: 'rgba(162, 218, 115, 0.2)'
            }}>
                <PasswordIcon color="var(--green)" />
              </div>
              <span className="profile-menu-text">Change Password</span>
              <ChevronRightIcon color="var(--text-light)" />
            </div>

            <div className="profile-menu-item" onClick={() => setView('dean-notification-settings')}>
              <div className="profile-menu-icon" style={{
              background: 'rgba(162, 218, 115, 0.2)'
            }}>
                <NotificationIcon color="var(--green)" />
              </div>
              <span className="profile-menu-text">Notifications Settings</span>
              <ChevronRightIcon color="var(--text-light)" />
            </div>

            <div className="profile-menu-item" onClick={() => setView('dean-privacy-security')}>
              <div className="profile-menu-icon" style={{
              background: 'rgba(162, 218, 115, 0.2)'
            }}>
                <PrivacyIcon color="var(--green)" />
              </div>
              <span className="profile-menu-text">Privacy &amp; Security</span>
              <ChevronRightIcon color="var(--text-light)" />
            </div>
          </div>

          <button type="button" className="session-logout-btn" onClick={onLogout}>
            <LogoutIcon color="white" /> LOGOUT SESSION
          </button>

        </div>
        <DeanBottomNav setView={setView} onOpenRequests={() => setView('dean-dashboard')} />
      </div>;
  }
  return <div className="admin-dash-wrapper dean-profile-wrapper">
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
              <h2 className="aprof-name dean-profile-name">{fullName}</h2>
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

              <button type="button" className="aprof-menu-item dean-profile-menu-item" onClick={() => setView('dean-notification-settings')}>
                <div className="aprof-menu-icon-box">
                  <NotificationIcon color="var(--green)" />
                </div>
                <span className="aprof-menu-text">Notifications Settings</span>
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
    </div>;
};

// --------------------------------------------------------
// CSSU DASHBOARD COMPONENTS
// --------------------------------------------------------
