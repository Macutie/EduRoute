import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { SearchBox } from "@mapbox/search-js-react";
import { API_BASE_URL, MAPBOX_PUBLIC_TOKEN } from "../../config";
import { useNotifications } from "../../hooks/useNotifications";
import { useProofOfCompliance } from "../../hooks/useProofOfCompliance";
import { encryptSensitivePayload, withFreshAuthPayloadKeyRetry } from "../../services/authPayloadEncryption";
import { decryptSensitiveResponseJson, getSensitiveResponseHeaders } from "../../services/responseEncryption";
import { getFacultyProofOfCompliance } from "../../services/proofComplianceApi";
import { getApprovedFacultyLocatorSlips, getFacultyLocatorSlipDetails, getFacultyTripSummary, markFacultyTripArrived, markFacultyTripReturned, resolveFacultyLocatorSlipDestination, saveFacultyManualPin, startFacultyTrip, startFacultyTripReturn } from "../../services/facultyTripApi";
import { getTripPathHistory } from "../../services/tripPathHistoryApi";
import ProofOfComplianceForm from "../../components/faculty/ProofOfComplianceForm";
import ProofOfCompliancePreview from "../../components/faculty/ProofOfCompliancePreview";
import { AdminBadgeIcon, AdminBellIcon, AdminEmailOutlineIcon, AdminProfileChevronIcon, AdminProfileIdIcon, AdminProfileLogoutIcon, AdminProfilePasswordIcon, AdminRoleIcon, AdminSaveCheckIcon, ApproveCheckIcon, ArrowRightIcon, AtSymbolIcon, BackArrowIcon, BadgeIcon, BatteryIcon, BellRingIcon, BriefcaseIcon, CameraIcon, CapIcon, CheckCircleAdminIcon, CheckCircleIcon, CheckCircleSolidIcon, ChevronDownIcon, ChevronRightIcon, ClipboardCheckIcon, ClipboardClockIcon, ClockIcon, CssuChartIcon, CssuIncidentsNavIcon, CssuMapNavIcon, CssuReportsNavIcon, CssuRoleIcon, CssuRosetteCheckIcon, CssuScanNavIcon, CssuTrendingUpIcon, CssuWarningCircleIcon, CssuWarningTriangleIcon, DashboardNavIcon, DeanNotificationDocIcon, DetailClockIcon, DetailClockReturnIcon, DetailDocIcon, DetailPinIcon, DetailRouteIcon, DocumentIcon, DummySignature, EditPencilIcon, EwanIcon, ExclamationCircleIcon, EyeIcon, EyeOffIcon, FacultyCheckCircleIcon, FacultyChevronRightIcon, FacultyCopyIcon, FacultyCrossCircleIcon, FacultyDocIcon, FacultyFilterIcon, FacultyIdBadgeIcon, FacultyNavIcon, FacultyRoleIcon, FacultyWaitCircleIcon, FileTextIcon, FilledClockIcon, FlashlightIcon, GlobeIcon, GlobeSmIcon, GraduationCapIcon, GridIcon, HeadsetIcon, HelpCircleIcon, HelpIcon, HomeNavIcon, HourglassIcon, HrmuAlertTinyIcon, HrmuChartIcon, HrmuCheckTinyIcon, HrmuExportIcon, HrmuEyeMiniIcon, HrmuFilterIcon, HrmuMapRouteIcon, HrmuMiniCheckIcon, HrmuPinMiniIcon, HrmuReportIcon, HrmuRoleIcon, HrmuSidebarGridIcon, HrmuSyncIcon, HrmuVerificationIcon, HrmuViewRouteIcon, HrmuWarningIcon, IdBadgeIcon, InboxArchiveIcon, InfoIcon, LinkIcon, LocationPinFilledIcon, LocationPinIcon, LockIcon, LockPrivIcon, LockSmallIcon, LoginDoorIcon, LogoutIcon, MailIcon, MapFoldIcon, MapIcon, ModalCloseIcon, NotifPendingIcon, NotificationIcon, PasswordIcon, PermissionsIcon, PersonOutlineIcon, PinIcon, PlayTriangleIcon, PolicyBulbIcon, PolicyCheckIcon, PrivacyIcon, ProfileEditIcon, ProfileNavIcon, ProgressReviewIcon, QuestionCircleIcon, RefreshClockIcon, RefreshIcon, RegistryDownloadIcon, RegistryModalCloseIcon, RegistryModalDoneIcon, RegistryModalIdIcon, RegistryModalVerifiedIcon, RegistryNavIcon, RejectXIcon, RemarksIcon, ReportPrintIcon, RequestsNavIcon, SaveIcon, ScanQRIcon, SendIcon, ShieldCheckIcon, ShieldCheckSmallIcon, ShieldSearchIcon, ShieldSolidIcon, SignalIcon, SignatureNavIcon, SlashedPersonIcon, SlipIcon, StatusGraphIcon, TogaLogoIcon, ToggleSwitch, TrashIcon, UploadIcon, UsersAdminIcon, WifiIcon, XCircleIcon } from "../../components/icons/AppIcons.jsx";
import { LegalDocumentModal } from "../../components/legal/LegalDocuments.jsx";
import { TripPathHistoryModal } from "../../components/trips/TripPathHistoryModal.jsx";
import { DEFAULT_PROFILE_IMAGE } from "../shared/appUtils.js";

const LOCATOR_SLIP_WORKING_HOURS_START_MINUTES = 7 * 60;
const LOCATOR_SLIP_WORKING_HOURS_END_MINUTES = 21 * 60;
const LOCATOR_SLIP_WORKING_HOURS_MESSAGE = 'Unallowed time input: locator slips can only be scheduled between 7:00 AM and 9:00 PM. Times from 9:01 PM to 6:59 AM are outside working hours.';

const getLocalMinutesFromDateTimeInput = (value) => {
  const normalized = String(value || '').trim();
  const match = normalized.match(/T(\d{2}):(\d{2})/);

  if (match) {
    return Number(match[1]) * 60 + Number(match[2]);
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;

  return date.getHours() * 60 + date.getMinutes();
};

const isLocatorSlipWorkingHour = (value) => {
  const minutes = getLocalMinutesFromDateTimeInput(value);
  if (minutes === null) return true;

  return minutes >= LOCATOR_SLIP_WORKING_HOURS_START_MINUTES && minutes <= LOCATOR_SLIP_WORKING_HOURS_END_MINUTES;
};

export const BottomNav = ({
  active = 'home',
  setView
}) => <div className="bottom-nav">
    <div className={`nav-item ${active === 'home' ? 'active-nav-pill' : ''}`} onClick={() => setView && setView('dashboard')}>
      {active === 'home' ? <div className="nav-pill-bg">
          <HomeNavIcon color="white" />
          <span>HOME</span>
        </div> : <><HomeNavIcon color="var(--text-gray)" /><span>HOME</span></>}
    </div>
    <div className={`nav-item ${active === 'status' ? 'active-nav-pill' : ''}`} onClick={() => setView && setView('status')}>
      {active === 'status' ? <div className="nav-pill-bg">
          <StatusGraphIcon color="white" />
          <span>STATUS</span>
        </div> : <><StatusGraphIcon color="var(--text-gray)" /><span>STATUS</span></>}
    </div>
    <div className={`nav-item ${active === 'slips' ? 'active-nav-pill' : ''}`} onClick={() => setView && setView('locator-slip')}>
      {active === 'slips' ? <div className="nav-pill-bg">
          <DocumentIcon color="white" width="24" height="24" />
          <span>SLIPS</span>
        </div> : <><DocumentIcon color="var(--text-gray)" width="24" height="24" /><span>SLIPS</span></>}
    </div>
    <div className={`nav-item ${active === 'map' ? 'active-nav-pill' : ''}`} onClick={() => setView && setView('map')}>
      {active === 'map' ? <div className="nav-pill-bg">
          <MapFoldIcon color="white" width="24" height="24" />
          <span>MAP</span>
        </div> : <><MapFoldIcon color="var(--text-gray)" width="24" height="24" /><span>MAP</span></>}
    </div>
    <div className={`nav-item ${active === 'profile' ? 'active-nav-pill' : ''}`} onClick={() => setView && setView('profile')}>
      {active === 'profile' ? <div className="nav-pill-bg">
          <ProfileNavIcon color="white" />
          <span>PROFILE</span>
        </div> : <><ProfileNavIcon color="var(--text-gray)" /><span>PROFILE</span></>}
    </div>
  </div>;
export const DashboardView = ({
  setView,
  profileData
}) => {
  const [facultyProfile, setFacultyProfile] = useState(null);
  const [recentLocatorSlips, setRecentLocatorSlips] = useState([]);
  const {
    unreadCount
  } = useNotifications({
    limit: 5
  });
  useEffect(() => {
    const loadDashboardProfile = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
            ...(await getSensitiveResponseHeaders())
          }
        });
        const data = await decryptSensitiveResponseJson(await response.json());
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
            ...(await getSensitiveResponseHeaders())
          }
        });
        const data = await decryptSensitiveResponseJson(await response.json());
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
  const greeting = localHour < 12 ? 'Good morning' : localHour < 18 ? 'Good afternoon' : 'Good evening';
  const registeredName = facultyProfile?.full_name || profileData.fullName || '';
  const firstName = registeredName.replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, '').trim().split(/\s+/)[0] || 'Professor';
  const departmentLabel = facultyProfile?.department_name || profileData.department || 'Faculty Department';
  return <div className="dashboard-wrapper">
      <div className="content fade-in dash-content">

        <div className="dash-top-nav">
          <div className="dash-menu-left">
            <span className="dash-logo-text">EduRoute</span>
          </div>
          <div className="admin-header-right">
            <div className="admin-bell-wrapper" onClick={() => setView('notifications')} style={{
            cursor: 'pointer'
          }}>
              <AdminBellIcon color="var(--green)" />
              {unreadCount > 0 && <div className="admin-bell-dot" />}
            </div>
            <div className="dash-avatar" onClick={() => setView('profile')} style={{
            cursor: 'pointer'
          }}>
              <img src={profileData.image} alt="Faculty Profile" style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }} />
            </div>
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
          <div className="primary-action-card" onClick={() => setView('status')} style={{
          cursor: 'pointer'
        }}>
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
            <div className="secondary-action-card" onClick={() => setView('locator-slip')} style={{
            cursor: 'pointer'
          }}>
              <div className="sec-icon-bg green-bg"><SlipIcon color="var(--green)" /></div>
              <h3>New Slip</h3>
              <p>Create locator</p>
            </div>
            <div className="secondary-action-card" onClick={() => setView('status')} style={{
            cursor: 'pointer'
          }}>
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
            {recentLocatorSlips.length === 0 && <div className="activity-card">
                <div className="act-icon-bg act-gray-bg"><DocumentIcon color="var(--green)" /></div>
                <div className="act-details">
                  <h4>No locator slips yet</h4>
                  <p>Create your first locator slip to see activity here.</p>
                </div>
              </div>}

            {recentLocatorSlips.map(slip => {
            const displayStatus = getSlipDisplayStatus(slip);
            return <div key={slip.id} className="activity-card" onClick={() => setView('status')} style={{
              cursor: 'pointer'
            }}>
                  <div className={`act-icon-bg ${['approved', 'completed'].includes(displayStatus) ? 'act-green-bg' : 'act-gray-bg'} ${displayStatus === 'rejected' ? 'act-red-icon' : ''}`}>
                    {displayStatus === 'rejected' ? <SlashedPersonIcon color="#FF4D4D" /> : <DocumentIcon color="var(--green)" />}
                  </div>
                  <div className="act-details">
                    <h4>{getSlipTitle(slip)}</h4>
                    <p>{slip.destination}</p>
                    <span className={`status-badge badge-${displayStatus}`}>{displayStatus.toUpperCase()}</span>
                  </div>
                  <span className="act-time">{formatActivityFiledTime(slip.created_at)}</span>
                </div>;
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
          <div className="map-floating-element" onClick={() => setView('map')} style={{
          cursor: 'pointer'
        }}>
            <MapFoldIcon color="var(--green)" width="32" height="32" />
            <span>View Live Campus Map</span>
          </div>
        </div>

      </div>
      <BottomNav active="home" setView={setView} />
    </div>;
};
export const LOCATOR_PURPOSE_OPTIONS = ['Official Meeting/Conference', 'Submission/Retrieval of Documents', 'Coordination/Consultation', 'Field Inspection/Monitoring', 'Others'];
export const TRAVEL_PURPOSE_TYPES = [{
  value: 'official',
  label: 'Official Business'
}, {
  value: 'personal',
  label: 'Personal'
}];
export const STATUS_FILTERS = [{
  key: 'all',
  label: 'All'
}, {
  key: 'approved',
  label: 'Approved'
}, {
  key: 'cancelled',
  label: 'Cancelled'
}, {
  key: 'completed',
  label: 'Completed'
}, {
  key: 'pending',
  label: 'Pending'
}, {
  key: 'rejected',
  label: 'Rejected'
}];
export const LOCATOR_SLIP_CANCEL_REASONS = [{
  value: 'change_of_schedule',
  label: 'Change of schedule'
}, {
  value: 'trip_no_longer_needed',
  label: 'Trip no longer needed'
}, {
  value: 'meeting_event_cancelled',
  label: 'Meeting/event cancelled'
}, {
  value: 'incorrect_locator_slip_details',
  label: 'Incorrect locator slip details'
}];
export const getCancellationReasonLabel = reasonValue => {
  if (!reasonValue) return 'Cancelled';
  const matchedReason = LOCATOR_SLIP_CANCEL_REASONS.find(reason => reason.value === reasonValue);
  return matchedReason?.label || String(reasonValue);
};
export const getSlipDisplayStatus = slip => {
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
export const getCssuValidationStatus = slip => {
  const value = String(slip?.cssu_validation_status || slip?.cssuValidationStatus || '').toLowerCase();
  if (value === 'validated') return 'allowed';
  if (['allowed', 'denied', 'flagged'].includes(value)) return value;
  return 'pending';
};
export const getLocatorSlipActionState = (slip, currentTrip = null) => {
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
      cssuValidationStatus
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
      cssuValidationStatus
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
        cssuValidationStatus
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
        cssuValidationStatus
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
        cssuValidationStatus
      };
    }
    return {
      showQr: true,
      viewRoute: false,
      startTrip: false,
      viewUploadedPhoto: true,
      showTripSummaryButton: false,
      helperText: '',
      cssuValidationStatus
    };
  }
  return {
    showQr: false,
    viewRoute: false,
    startTrip: false,
    viewUploadedPhoto: false,
    showTripSummaryButton: false,
    helperText: '',
    cssuValidationStatus
  };
};
export const formatStatusDate = value => {
  if (!value) return 'No date set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date set';
  return date.toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
};
export const formatStatusDateTime = value => {
  if (!value) return 'No date set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date set';
  return date.toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};
export const formatDistanceLabel = meters => {
  const value = Number(meters);
  if (!Number.isFinite(value)) return '0 km';
  return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`;
};
export const formatTripDurationLabel = minutesValue => {
  const totalMinutes = Math.max(Math.round(Number(minutesValue) || 0), 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes} ${minutes === 1 ? 'min' : 'mins'}`;
  }
  if (minutes <= 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  return `${hours} ${hours === 1 ? 'hour' : 'hours'} and ${minutes} ${minutes === 1 ? 'min' : 'mins'}`;
};
export const formatActivityFiledTime = value => {
  if (!value) return 'No time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No time';
  return date.toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};
export const getSlipTitle = slip => {
  if (slip?.purpose_display) return slip.purpose_display;
  if (slip?.purpose_of_travel === 'Personal') {
    return slip?.custom_purpose ? `Personal - ${slip.custom_purpose}` : 'Personal';
  }
  if (slip?.purpose_of_travel === 'Others') {
    return slip?.custom_purpose ? `Official Business - ${slip.custom_purpose}` : 'Official Business - Other Official Travel';
  }
  if (slip?.purpose_of_travel) return `Official Business - ${slip.purpose_of_travel}`;
  if (slip?.custom_purpose) return slip.custom_purpose;
  return 'Locator Slip';
};
export const toDateTimeLocalValue = date => {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
};
export const LocatorSlipView = ({
  setView,
  profileData,
  setSelectedStatusSlip
}) => {
  const [facultyProfile, setFacultyProfile] = useState(null);
  const [locatorSlipLoading, setLocatorSlipLoading] = useState(false);
  const [locatorSlipErrors, setLocatorSlipErrors] = useState({});
  const [activeLegalDoc, setActiveLegalDoc] = useState(null);
  const [showPurposeTypeModal, setShowPurposeTypeModal] = useState(false);
  const [purposeModalStep, setPurposeModalStep] = useState('type');
  const [purposeModalCustomReason, setPurposeModalCustomReason] = useState('');
  const [currentDateTimeLocal, setCurrentDateTimeLocal] = useState(() => toDateTimeLocalValue(new Date()));
  const [locatorSlipForm, setLocatorSlipForm] = useState({
    purpose_type: '',
    destination: '',
    purpose_of_travel: '',
    custom_purpose: '',
    departure_datetime: '',
    expected_return_datetime: '',
    additional_remarks: '',
    is_urgent: false
  });
  const locatorSlipValidation = useMemo(() => {
    const errors = {};
    const now = new Date(currentDateTimeLocal);
    const departureTime = locatorSlipForm.departure_datetime ? new Date(locatorSlipForm.departure_datetime).getTime() : null;
    const returnTime = locatorSlipForm.expected_return_datetime ? new Date(locatorSlipForm.expected_return_datetime).getTime() : null;
    if (!locatorSlipForm.destination.trim()) {
      errors.destination = 'Destination is required.';
    }
    if (!locatorSlipForm.purpose_type) {
      errors.purpose_of_travel = 'Please choose whether this trip is for official business or personal travel.';
    } else if (!locatorSlipForm.purpose_of_travel) {
      errors.purpose_of_travel = 'Purpose of travel is required.';
    }
    if ((locatorSlipForm.purpose_of_travel === 'Others' || locatorSlipForm.purpose_of_travel === 'Personal') && !locatorSlipForm.custom_purpose.trim()) {
      errors.custom_purpose = 'Please specify your purpose.';
    }
    if (!locatorSlipForm.departure_datetime) {
      errors.departure_datetime = 'Departure date and time is required.';
    } else if (Number.isNaN(departureTime)) {
      errors.departure_datetime = 'Departure date and time is invalid.';
    } else if (departureTime < now.getTime()) {
      errors.departure_datetime = 'Unallowed time input: departure time has already passed. Please choose a departure time later than the current time.';
    } else if (!isLocatorSlipWorkingHour(locatorSlipForm.departure_datetime)) {
      errors.departure_datetime = LOCATOR_SLIP_WORKING_HOURS_MESSAGE;
    }
    if (!locatorSlipForm.expected_return_datetime) {
      errors.expected_return_datetime = 'Expected return date and time is required.';
    } else if (Number.isNaN(returnTime)) {
      errors.expected_return_datetime = 'Expected return date and time is invalid.';
    } else if (returnTime < now.getTime()) {
      errors.expected_return_datetime = 'Unallowed time input: expected return time has already passed. Please choose a return time later than the current time.';
    } else if (locatorSlipForm.departure_datetime && !Number.isNaN(departureTime) && returnTime <= departureTime) {
      errors.expected_return_datetime = 'Unallowed time input: expected return is earlier than or equal to the departure time. Please choose a return time after departure.';
    } else if (!isLocatorSlipWorkingHour(locatorSlipForm.expected_return_datetime)) {
      errors.expected_return_datetime = LOCATOR_SLIP_WORKING_HOURS_MESSAGE;
    }
    if (locatorSlipForm.additional_remarks.length > 1000) {
      errors.additional_remarks = 'Additional remarks must not exceed 1000 characters.';
    }
    return errors;
  }, [currentDateTimeLocal, locatorSlipForm]);
  const canSubmitLocatorSlip = facultyProfile && Object.keys(locatorSlipValidation).length === 0 && !locatorSlipLoading;
  const getAuthHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`
  });
  const formatApiError = value => {
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
        ...(await getSensitiveResponseHeaders()),
        ...(options.headers || {})
      }
    });
    const data = await decryptSensitiveResponseJson(await response.json());
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
    setLocatorSlipForm(prev => ({
      ...prev,
      [field]: value,
      ...(field === 'purpose_type' ? value === 'official' ? {
        purpose_of_travel: '',
        custom_purpose: ''
      } : value === 'personal' ? {
        purpose_of_travel: 'Personal',
        custom_purpose: ''
      } : {
        purpose_of_travel: '',
        custom_purpose: ''
      } : {}),
      ...(field === 'purpose_of_travel' && value !== 'Others' && value !== 'Personal' ? {
        custom_purpose: ''
      } : {})
    }));
    setLocatorSlipErrors(prev => ({
      ...prev,
      [field]: undefined,
      ...(field === 'departure_datetime' ? {
        expected_return_datetime: undefined
      } : {})
    }));
  };
  const closePurposeModal = () => {
    setShowPurposeTypeModal(false);
    setPurposeModalStep('type');
    setPurposeModalCustomReason('');
  };
  const openPurposeModal = () => {
    setShowPurposeTypeModal(true);
    setPurposeModalStep('type');
    setPurposeModalCustomReason('');
  };
  const handleLocatorSlipSubmit = async () => {
    setLocatorSlipErrors(locatorSlipValidation);
    if (!canSubmitLocatorSlip) return;
    setLocatorSlipLoading(true);
    try {
      const payload = {
        ...locatorSlipForm,
        departure_datetime: locatorSlipForm.departure_datetime || '',
        expected_return_datetime: locatorSlipForm.expected_return_datetime || ''
      };
      const data = await withFreshAuthPayloadKeyRetry(async () => fetchLocatorSlipJson('/api/locator-slips', {
        method: 'POST',
        body: JSON.stringify(await encryptSensitivePayload(payload))
      }));
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
    ...locatorSlipValidation
  };
  const timeWarningFields = new Set(['departure_datetime', 'expected_return_datetime']);
  const locatorSlipTimeWarnings = [visibleLocatorSlipErrors.departure_datetime && locatorSlipForm.departure_datetime ? visibleLocatorSlipErrors.departure_datetime : null, visibleLocatorSlipErrors.expected_return_datetime && locatorSlipForm.expected_return_datetime ? visibleLocatorSlipErrors.expected_return_datetime : null].filter(Boolean);
  const renderLocatorSlipMessage = field => {
    const message = visibleLocatorSlipErrors[field];
    if (!message) return null;
    return <span className={timeWarningFields.has(field) ? 'field-warning' : 'field-error'}>
        {timeWarningFields.has(field) && <span className="field-warning-icon">!</span>}
        {message}
      </span>;
  };
  return <div className="dashboard-wrapper">
      <div className="content fade-in dash-content slip-content">

        <div className="slip-top-nav">
          <div className="slip-nav-left" onClick={() => setView('dashboard')}>
            <BackArrowIcon color="var(--green)" />
            <span className="dash-logo-text">EduRoute</span>
          </div>
          <div className="dash-avatar" onClick={() => setView('profile')} style={{
          cursor: 'pointer'
        }}>
            <img src={profileData.image} alt="Faculty Profile" style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }} />
          </div>
        </div>

        <div className="slip-page-header">
          <span className="slip-subtitle">INTERNAL LOGISTICS</span>
          <h1>Create Locator Slip</h1>
          <p>Please document your destination and expected return for institutional coordination.</p>
        </div>

        {showPurposeTypeModal && <div className="permission-modal-backdrop locator-purpose-backdrop" onClick={closePurposeModal}>
            <div className="permission-modal-card dean-signature-permission-modal locator-purpose-modal" onClick={e => e.stopPropagation()}>
              <div className="permission-modal-glow" />
              <button type="button" className="locator-purpose-modal-close" onClick={closePurposeModal} aria-label="Close purpose selector">
                <ModalCloseIcon />
              </button>
              <div className="permission-modal-icon">
                <DocumentIcon color="var(--green)" width="28" height="28" />
              </div>
              <span className="permission-modal-kicker">TRAVEL PURPOSE</span>
              {purposeModalStep === 'type' && <>
                  <h3 className="permission-modal-title">Select Purpose Type</h3>
                  <p className="permission-modal-copy">
                    Choose whether this locator slip is for official business or personal travel before setting the specific purpose.
                  </p>
                  <div className="locator-purpose-modal-actions">
                    <button type="button" className="locator-purpose-pill" onClick={() => {
                updateLocatorSlipField('purpose_type', 'official');
                setPurposeModalStep('official');
              }}>
                  
                      Official Business
                    </button>
                    <button type="button" className="locator-purpose-pill" onClick={() => {
                updateLocatorSlipField('purpose_type', 'personal');
                setPurposeModalStep('personal');
              }}>
                  
                      Personal
                    </button>
                  </div>
                </>}
              {purposeModalStep === 'official' && <>
                  <h3 className="permission-modal-title">Choose Official Business Purpose</h3>
                  <p className="permission-modal-copy">
                    Select the official purpose that best matches this trip.
                  </p>
                  <div className="locator-purpose-option-list">
                    {LOCATOR_PURPOSE_OPTIONS.map(option => <button key={option} type="button" className="locator-purpose-pill" onClick={() => {
                updateLocatorSlipField('purpose_of_travel', option);
                if (option !== 'Others') {
                  closePurposeModal();
                }
              }}>
                  
                        {option}
                      </button>)}
                  </div>
                  {locatorSlipForm.purpose_of_travel === 'Others' && <div className="locator-purpose-modal-input">
                      <input type="text" placeholder="Type the official business reason..." value={purposeModalCustomReason} onChange={e => setPurposeModalCustomReason(e.target.value)} />
                
                      <button type="button" className="sig-setting-primary" onClick={() => {
                updateLocatorSlipField('custom_purpose', purposeModalCustomReason);
                closePurposeModal();
              }} disabled={!purposeModalCustomReason.trim()}>
                  
                        Confirm Purpose
                      </button>
                    </div>}
                </>}
              {purposeModalStep === 'personal' && <>
                  <h3 className="permission-modal-title">Specify Personal Reason</h3>
                  <p className="permission-modal-copy">
                    Enter the personal reason for this travel request.
                  </p>
                  <div className="locator-purpose-modal-input">
                    <input type="text" placeholder="Example: Withdrawing" value={purposeModalCustomReason} onChange={e => setPurposeModalCustomReason(e.target.value)} />
                
                    <button type="button" className="sig-setting-primary" onClick={() => {
                updateLocatorSlipField('custom_purpose', purposeModalCustomReason);
                closePurposeModal();
              }} disabled={!purposeModalCustomReason.trim()}>
                  
                      Confirm Purpose
                    </button>
                  </div>
                </>}
              {purposeModalStep !== 'type' && <button type="button" className="sig-setting-secondary" onClick={() => {
            setPurposeModalStep('type');
            setPurposeModalCustomReason('');
            updateLocatorSlipField('purpose_type', '');
            updateLocatorSlipField('purpose_of_travel', '');
          }}>
              
                  Back
                </button>}
            </div>
          </div>}

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
              <input type="text" placeholder="Where are you heading?" value={locatorSlipForm.destination} onChange={e => updateLocatorSlipField('destination', e.target.value)} />
              
            </div>
            {renderLocatorSlipMessage('destination')}
          </div>

          <div className="trip-field">
            <label>Purpose of Travel</label>
            <button type="button" className="trip-input-wrapper trip-select-wrapper trip-purpose-trigger" onClick={openPurposeModal}>
              
              <DocumentIcon color="var(--text-light)" width="18" height="18" />
              <span className={locatorSlipForm.purpose_type ? 'trip-purpose-value' : 'trip-purpose-placeholder'}>
                {locatorSlipForm.purpose_type === 'official' ? locatorSlipForm.purpose_of_travel === 'Others' ? `Official Business - ${locatorSlipForm.custom_purpose || 'Specify reason'}` : locatorSlipForm.purpose_of_travel ? `Official Business - ${locatorSlipForm.purpose_of_travel}` : 'Official Business' : locatorSlipForm.purpose_type === 'personal' ? `Personal - ${locatorSlipForm.custom_purpose || 'Specify reason'}` : 'Choose purpose type...'}
              </span>
              <div className="select-icon trip-chevron">
                <ChevronDownIcon />
              </div>
            </button>
            {renderLocatorSlipMessage('purpose_of_travel')}
            {renderLocatorSlipMessage('custom_purpose')}
          </div>

          <div className="trip-field urgent-toggle-field">
            <div>
              <label>Urgent Matter</label>
              <p>Mark this request urgent if it needs priority dean review.</p>
            </div>
            <button type="button" className={`urgent-toggle ${locatorSlipForm.is_urgent ? 'active' : ''}`} aria-pressed={locatorSlipForm.is_urgent} onClick={() => updateLocatorSlipField('is_urgent', !locatorSlipForm.is_urgent)}>
              
              <span />
            </button>
          </div>

          <div className="trip-field">
            <label>Departure</label>
            <div className={`trip-input-wrapper ${visibleLocatorSlipErrors.departure_datetime && locatorSlipForm.departure_datetime ? 'has-warning' : ''}`}>
              <ClockIcon color="var(--text-light)" />
              <input type="datetime-local" className="datetime-input" value={locatorSlipForm.departure_datetime} onChange={e => updateLocatorSlipField('departure_datetime', e.target.value)} />
              
            </div>
            {renderLocatorSlipMessage('departure_datetime')}
          </div>

          <div className="trip-field">
            <label>Expected Return</label>
            <div className={`trip-input-wrapper ${visibleLocatorSlipErrors.expected_return_datetime && locatorSlipForm.expected_return_datetime ? 'has-warning' : ''}`}>
              <RefreshClockIcon color="var(--text-light)" />
              <input type="datetime-local" className="datetime-input" value={locatorSlipForm.expected_return_datetime} onChange={e => updateLocatorSlipField('expected_return_datetime', e.target.value)} />
              
            </div>
            {renderLocatorSlipMessage('expected_return_datetime')}
          </div>

          <div className="trip-field">
            <label>Additional Remarks (Optional)</label>
            <div className="trip-textarea-wrapper">
              <textarea placeholder="Any specific details or contact info during the trip..." rows={3} value={locatorSlipForm.additional_remarks} onChange={e => updateLocatorSlipField('additional_remarks', e.target.value)} />
              
            </div>
            {renderLocatorSlipMessage('additional_remarks')}
          </div>
        </div>

        <div className="locator-privacy-footnote">
          <span>We protect your data.</span>{' '}
          <button type="button" className="legal-inline-link" onClick={() => setActiveLegalDoc('privacy')}>
            
            Read our privacy policy
          </button>
        </div>

        {locatorSlipTimeWarnings.length > 0 && <div className="locator-time-warning-card" role="alert">
            <div className="locator-time-warning-icon">!</div>
            <div>
              <h4>Time check needed</h4>
              {locatorSlipTimeWarnings.map(warning => <p key={warning}>{warning}</p>)}
            </div>
          </div>}

        <button type="button" className="primary-btn slip-submit-btn" disabled={!canSubmitLocatorSlip} onClick={handleLocatorSlipSubmit}>
          
          <SendIcon /> {locatorSlipLoading ? 'SUBMITTING...' : 'SUBMIT REQUEST'}
        </button>

        <button type="button" className="slip-cancel-btn" onClick={() => setView('dashboard')}>
          Cancel
        </button>

      </div>
      <BottomNav active="slips" setView={setView} />
      <LegalDocumentModal activeLegalDoc={activeLegalDoc} onClose={() => setActiveLegalDoc(null)} />
      
    </div>;
};
export const StatusView = ({
  setView,
  profileData,
  setSelectedStatusSlip
}) => {
  const [activeFilter, setActiveFilter] = useState('all');
  const [locatorSlips, setLocatorSlips] = useState([]);
  const [statusLoading, setStatusLoading] = useState(false);
  const fetchStatusSlips = async filter => {
    setStatusLoading(true);
    try {
      const query = filter === 'all' ? '' : `?status=${encodeURIComponent(filter)}`;
      const response = await fetch(`${API_BASE_URL}/api/locator-slips/my-slips${query}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
          ...(await getSensitiveResponseHeaders())
        }
      });
      const data = await decryptSensitiveResponseJson(await response.json());
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
  const formatApiError = value => {
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
  return <div className="dashboard-wrapper status-wrapper">
      <div className="content fade-in dash-content status-content">
        <div className="status-sticky-header">
          <div className="status-top-nav">
            <div className="slip-nav-left" onClick={() => setView('dashboard')}>
              <BackArrowIcon color="var(--green)" />
              <span className="dash-logo-text">EduRoute</span>
            </div>
            <div className="dash-avatar" onClick={() => setView('profile')} style={{
            cursor: 'pointer'
          }}>
              <img src={profileData.image} alt="Faculty Profile" style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }} />
            </div>
          </div>

          <div className="status-filter-row">
            {STATUS_FILTERS.map(filter => <button key={filter.key} type="button" className={`status-filter-chip ${activeFilter === filter.key ? 'active' : ''}`} onClick={() => setActiveFilter(filter.key)}>
              
                {filter.label}
              </button>)}
          </div>
        </div>

        <div className="status-slip-list">
          {statusLoading && <div className="status-empty-card">Loading locator slips...</div>}

          {!statusLoading && locatorSlips.length === 0 && <div className="status-empty-card">
              No {activeFilter === 'all' ? '' : activeFilter} locator slips found.
            </div>}

          {!statusLoading && locatorSlips.map(slip => {
          const displayStatus = getSlipDisplayStatus(slip);
          return <button key={slip.id} type="button" className={`status-slip-card ${displayStatus}`} onClick={() => {
            if (slip.status !== 'approved') {
              localStorage.removeItem('edurouteVerifySlipId');
            }
            localStorage.setItem('edurouteDetailSlipId', slip.id);
            localStorage.setItem('edurouteLastView', 'locator-slip-detail');
            setSelectedStatusSlip(slip);
            setView('locator-slip-detail');
          }}>
                
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
              </button>;
        })}
        </div>
      </div>
      <BottomNav active="status" setView={setView} />
    </div>;
};
export const LocatorSlipDetailView = ({
  setView,
  profileData,
  selectedSlip
}) => {
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
  const [pathHistoryState, setPathHistoryState] = useState({
    open: false,
    loading: false,
    error: '',
    data: null
  });
  const slip = selectedSlip;
  useEffect(() => {
    setShowLocationProof(false);
    setShowProofCompliance(false);
    setShowTripSummary(false);
    setShowCancelReasonModal(false);
    setPathHistoryState({
      open: false,
      loading: false,
      error: '',
      data: null
    });
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
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`
          }
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
  if (!slip) {
    return <div className="dashboard-wrapper status-wrapper">
        <div className="content fade-in dash-content status-content">
          <div className="status-empty-card">
            <p>No locator slip selected.</p>
            <button type="button" className="primary-btn" onClick={() => setView('status')}>
              Return to Status
            </button>
          </div>
        </div>
        <BottomNav active="status" setView={setView} />
      </div>;
  }
  const isPending = slip.status === 'pending';
  const isCompleted = getSlipDisplayStatus(slip) === 'completed';
  const isApproved = ['approved', 'verified'].includes(String(slip.status || '').toLowerCase()) && !isCompleted;
  const isRejected = slip.status === 'rejected';
  const isCancelled = slip.status === 'cancelled';
  const actionState = getLocatorSlipActionState(slip, slip.currentTrip || null);
  const cssuValidationStatus = getCssuValidationStatus(slip);
  const cssuValidatedByName = slip.cssu_validated_by_name || slip.cssuValidatedByName || '';
  const canShowQrCode = actionState.showQr && Boolean(slip.locator_slip_code);
  const title = isPending ? 'Verification in' : isCompleted ? 'Trip' : isApproved || isRejected || isCancelled ? 'Verification' : `${slip.status.charAt(0).toUpperCase()}${slip.status.slice(1)}`;
  const referralId = `FAC-${String(slip.id).slice(0, 8).toUpperCase()}`;
  const openTripRoute = async () => {
    localStorage.setItem('edurouteMapSlipId', slip.id);
    localStorage.setItem('edurouteDetailSlipId', slip.id);
    localStorage.setItem('edurouteLastView', 'map');
    setView('map');
  };
  const openTripPathHistory = async () => {
    if (!slip?.trip_id) return;
    setPathHistoryState({
      open: true,
      loading: true,
      error: '',
      data: null
    });
    try {
      const data = await getTripPathHistory(slip.trip_id);
      setPathHistoryState({
        open: true,
        loading: false,
        error: '',
        data
      });
    } catch (error) {
      setPathHistoryState({
        open: true,
        loading: false,
        error: error.message || 'Failed to load trip path history.',
        data: null
      });
    }
  };
  const cancelRequest = async () => {
    if (!isPending || cancelLoading) return;
    const reasonLabel = getCancellationReasonLabel(selectedCancelReason);
    setCancelLoading(true);
    try {
      const data = await withFreshAuthPayloadKeyRetry(async () => {
        const response = await fetch(`${API_BASE_URL}/api/locator-slips/${slip.id}/cancel`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
            ...(await getSensitiveResponseHeaders())
          },
          body: JSON.stringify(await encryptSensitivePayload({
            cancellation_reason: selectedCancelReason
          }))
        });
        const payload = await decryptSensitiveResponseJson(await response.json());
        if (!response.ok) {
          throw new Error(payload.message || 'Failed to cancel locator slip.');
        }
        return payload;
      });
      alert(`${data.message || 'Locator slip request cancelled successfully.'} Reason: ${reasonLabel}.`);
      setShowCancelReasonModal(false);
      setView('status');
    } catch (error) {
      alert(error.message);
    } finally {
      setCancelLoading(false);
    }
  };
  return <div className="dashboard-wrapper submitted-wrapper">
      <div className="content fade-in dash-content">
        <div className="slip-top-nav">
          <div className="slip-nav-left" onClick={() => setView('status')}>
            <BackArrowIcon color="var(--green)" />
            <span className="dash-logo-text">EduRoute</span>
          </div>
          <div className="dash-avatar" onClick={() => setView('profile')} style={{
          cursor: 'pointer'
        }}>
            <img src={profileData.image} alt="Faculty Profile" style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }} />
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
            {isPending ? 'Your request is being reviewed. The EduRoute administration is currently verifying your faculty credentials.' : isCompleted ? 'Your approved trip was successfully completed and the generated trip summary is ready to view.' : isApproved ? cssuValidationStatus === 'allowed' ? 'Your request has been reviewed, approved, and cleared by CSSU. You may now view your route and start the trip.' : 'Your request has been reviewed and approved by the dean. CSSU exit validation is still required before you can start the trip.' : isRejected ? 'Your request has been reviewed and rejected. You may submit a corrected locator slip request.' : isCancelled ? 'This locator slip was cancelled by the faculty user before approval.' : `This locator slip request is currently marked as ${slip.status}.`}
          </p>
          {isRejected && slip.additional_remarks && <div className="submitted-reason-card">
              <span>REJECTION REASON</span>
              <strong>{slip.additional_remarks}</strong>
            </div>}
          {isApproved && actionState.helperText && <p className="trip-search-state" style={{
          marginTop: '0.75rem'
        }}>
              {actionState.helperText}
              {cssuValidationStatus === 'pending' ? ' CSSU must allow exit before you can start this trip.' : ''}
            </p>}
          {cssuValidationStatus === 'allowed' && cssuValidatedByName && <div className="submitted-reason-card">
              <span>CSSU VALIDATED BY</span>
              <strong>{cssuValidatedByName}</strong>
            </div>}
        </div>

        {(isPending || isApproved || isCompleted || isRejected || isCancelled) && <div className="progress-bar-container">
            <div className={`progress-track ${isApproved || isCompleted ? 'approved' : ''} ${isRejected || isCancelled ? 'rejected' : ''}`}>
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
              <div className={`progress-point ${isApproved || isCompleted || isRejected || isCancelled ? 'active' : 'pending'}`}>
                <div className={`point-dot ${isApproved || isCompleted || isRejected || isCancelled ? 'green-dot-solid' : 'grey-dot-solid'}`}></div>
                <span className={`point-label ${isApproved || isCompleted ? 'green-label' : ''} ${isRejected || isCancelled ? 'red-label' : ''}`}>
                  {isRejected || isCancelled ? 'INACTIVE' : 'ACTIVE'}
                </span>
              </div>
              {isCompleted && <div className="progress-point active">
                  <div className="point-dot green-dot-solid"></div>
                  <span className="point-label green-label">COMPLETED</span>
                </div>}
            </div>
          </div>}

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

        {isPending && <button className="cancel-request-btn" onClick={() => setShowCancelReasonModal(true)} disabled={cancelLoading}>
            {cancelLoading ? 'CANCELLING...' : 'CANCEL REQUEST'}
          </button>}

        {slip.status === 'cancelled' && slip.cancellation_reason && <div className="cancel-reason-card">
            <span>CANCELLATION REASON</span>
            <strong>{getCancellationReasonLabel(slip.cancellation_reason)}</strong>
          </div>}

        {(isApproved || isCompleted) && <div className="approved-detail-actions">
            {actionState.viewRoute && <button type="button" className="approved-view-route-btn" onClick={openTripRoute}>
            
                {tripSummaryLoading ? 'LOADING ROUTE...' : 'VIEW ROUTE'}
              </button>}
            {!isCompleted && actionState.viewUploadedPhoto && locationVerification?.image_url && <button type="button" className="approved-view-proof-btn" onClick={() => setShowLocationProof(current => !current)}>
            
                {showLocationProof ? 'HIDE UPLOADED LOCATION' : 'VIEW UPLOADED LOCATION'}
              </button>}
            {canShowQrCode && <button type="button" className="approved-view-proof-btn" onClick={() => setShowQrCode(true)}>
            
                SHOW QR CODE
              </button>}
            {isCompleted && locationVerification?.image_url && <button type="button" className="approved-view-proof-btn" onClick={() => setShowLocationProof(current => !current)}>
            
                {showLocationProof ? 'HIDE PROOF OF ARRIVAL' : 'VIEW PROOF OF ARRIVAL'}
              </button>}
            {isCompleted && proofCompliance && <button type="button" className="approved-view-proof-btn" onClick={() => setShowProofCompliance(current => !current)}>
            
                {showProofCompliance ? 'HIDE PROOF OF COMPLIANCE' : 'VIEW PROOF OF COMPLIANCE'}
              </button>}
            {isCompleted && (completedTripSummary?.summary || tripSummaryLoading) && <button type="button" className="approved-view-proof-btn" onClick={() => setShowTripSummary(current => !current)} disabled={tripSummaryLoading && !completedTripSummary?.summary}>
            
                {tripSummaryLoading && !completedTripSummary?.summary ? 'LOADING TRIP SUMMARY...' : showTripSummary ? 'HIDE TRIP SUMMARY' : 'VIEW TRIP SUMMARY'}
              </button>}
            {isCompleted && slip.trip_id && <button type="button" className="approved-view-proof-btn" onClick={openTripPathHistory}>
            
                VIEW PATH HISTORY
              </button>}
          </div>}

        {(isApproved && actionState.viewUploadedPhoto || isCompleted) && showLocationProof && locationVerification?.image_url && <div className="location-proof-card">
            <span className="location-proof-kicker">PROOF OF ARRIVAL</span>
            <h3>{locationVerification.target_location || slip.destination}</h3>
            <p>
              Uploaded {formatStatusDate(locationVerification.created_at)} for this approved locator slip.
            </p>
            <img src={locationVerification.image_url} alt="Uploaded proof of arrival" />
          </div>}

        {isCompleted && showProofCompliance && proofCompliance && <div className="location-proof-card compliance-proof-card">
            <span className="location-proof-kicker">PROOF OF COMPLIANCE</span>
            <h3>{proofCompliance.focalPersonName || 'Focal Person'}</h3>
            <p>
              Submitted {formatStatusDate(proofCompliance.submittedAt)} for this completed trip.
            </p>
            <ProofOfCompliancePreview proof={proofCompliance} title="Completed Trip Compliance" showStatus={false} showFullCard={false} showArrivalPhoto={false} />
          
          </div>}

        {isCompleted && showTripSummary && completedTripSummary?.summary && <div className="location-proof-card trip-summary-status-card">
            <span className="location-proof-kicker">TRIP SUMMARY</span>
            <h3>{completedTripSummary.locatorSlip?.destination || slip.destination}</h3>
            <div className="trip-summary-status-grid">
              <div><span>Locator Slip Departure</span><strong>{formatStatusDateTime(completedTripSummary.summary.departureTime)}</strong></div>
              <div><span>Actual Trip Start</span><strong>{formatStatusDateTime(completedTripSummary.summary.actualStartTripTime)}</strong></div>
              <div><span>Estimated Return</span><strong>{formatStatusDateTime(completedTripSummary.summary.estimatedReturnTime)}</strong></div>
              <div><span>Actual Return</span><strong>{formatStatusDateTime(completedTripSummary.summary.actualReturnTime)}</strong></div>
              <div><span>Total Distance</span><strong>{formatDistanceLabel(completedTripSummary.summary.totalDistanceMeters)}</strong></div>
              <div><span>Trip Duration</span><strong>{formatTripDurationLabel(completedTripSummary.summary.totalTripMinutes)}</strong></div>
            </div>
            <p>
              {completedTripSummary.summary.isLateReturn ? `Late return detected: ${completedTripSummary.summary.minutesLate} minutes late.` : 'Returned within the approved timeframe.'}
            </p>
          </div>}

        {isRejected && <div className="approved-detail-actions">
            <button type="button" className="approved-view-route-btn" onClick={() => setView('locator-slip')}>
              REQUEST AGAIN
            </button>
            <button type="button" className="rejected-dashboard-btn" onClick={() => setView('dashboard')}>
              RETURN TO DASHBOARD
            </button>
          </div>}

        {showCancelReasonModal && <div className="cancel-reason-modal-backdrop" role="presentation" onClick={() => !cancelLoading && setShowCancelReasonModal(false)}>
            <div className="cancel-reason-modal-card" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
              <span className="cancel-reason-modal-kicker">CANCEL LOCATOR SLIP</span>
              <h3>Why are you cancelling this request?</h3>
              <p>Select the reason that best matches the cancellation.</p>
              <div className="cancel-reason-options">
                {LOCATOR_SLIP_CANCEL_REASONS.map(reason => <button key={reason.value} type="button" className={`cancel-reason-option ${selectedCancelReason === reason.value ? 'selected' : ''}`} onClick={() => setSelectedCancelReason(reason.value)} disabled={cancelLoading}>
                
                    {reason.label}
                  </button>)}
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
          </div>}

        <div className="referral-id">
          REFERRAL ID: {referralId}
        </div>

        {showQrCode && canShowQrCode && <div className="qr-modal-overlay" onClick={() => setShowQrCode(false)}>
            <div className="qr-modal-card" onClick={event => event.stopPropagation()}>
              <span className="location-proof-kicker">LOCATOR SLIP QR</span>
              <h3>{slip.locator_slip_code}</h3>
              <p>Present this QR code or locator slip code to CSSU while the locator slip is still pending or approved.</p>
              <img className="qr-modal-image" src={`https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(slip.locator_slip_code)}`} alt={`QR code for ${slip.locator_slip_code}`} />
            
              <div className="qr-modal-code">{slip.locator_slip_code}</div>
              <button type="button" className="approved-view-route-btn" onClick={() => setShowQrCode(false)}>
                CLOSE
              </button>
            </div>
          </div>}

        {pathHistoryState.open && <TripPathHistoryModal history={pathHistoryState.data} loading={pathHistoryState.loading} error={pathHistoryState.error} onClose={() => setPathHistoryState({
        open: false,
        loading: false,
        error: '',
        data: null
      })} />}
      </div>
      <BottomNav active="status" setView={setView} />
    </div>;
};
export const UpdatesView = ({
  setView,
  profileData
}) => <div className="dashboard-wrapper" style={{
  background: '#F9FAFB'
}}>
    <div className="content fade-in dash-content updates-content">
      <div className="slip-top-nav" style={{
      borderBottom: '1px solid #F3F4F6'
    }}>
        <div className="slip-nav-left" onClick={() => setView('dashboard')}>
          <BackArrowIcon color="var(--green)" />
          <span className="dash-logo-text">EduRoute</span>
        </div>
        <div className="dash-avatar">
          <img src={profileData.image} alt="Faculty Profile" style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }} />
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
  </div>;
export const RouteApprovedView = ({
  setView,
  profileData
}) => <div className="dashboard-wrapper" style={{
  background: '#F9FAFB'
}}>
    <div className="content fade-in dash-content">
      <div className="slip-top-nav" style={{
      borderBottom: '1px solid #F3F4F6'
    }}>
        <div className="slip-nav-left" onClick={() => setView('dashboard')}>
          <BackArrowIcon color="var(--green)" />
          <span className="dash-logo-text">EduRoute</span>
        </div>
        <div className="dash-avatar">
          <img src={profileData.image} alt="Faculty Profile" style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }} />
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
  </div>;
export const ApprovedLocatorSlipSelectionView = ({
  setView,
  profileData,
  setSelectedSlip
}) => {
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
  const handleSelectSlip = async slipId => {
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
  const getTripAccessStatus = slip => {
    const normalizedTripStatus = String(slip.tripStatus || '').toLowerCase();
    if (normalizedTripStatus === 'completed' || String(slip.displayStatus || '').toLowerCase() === 'completed') {
      return 'completed';
    }
    if (slip.canStartTrip) {
      return 'approved';
    }
    return 'blocked';
  };
  return <div className="dashboard-wrapper submitted-wrapper">
      <div className="content fade-in dash-content">
        <div className="slip-top-nav">
          <div className="slip-nav-left" onClick={() => setView('dashboard')}>
            <BackArrowIcon color="var(--green)" />
            <span className="dash-logo-text">EduRoute</span>
          </div>
          <div className="dash-avatar" onClick={() => setView('profile')} style={{
          cursor: 'pointer'
        }}>
            <img src={profileData.image} alt="Faculty Profile" style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }} />
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
          {!loading && slips.length === 0 && <div className="map-slip-selection-empty">No approved locator slips are ready for trip access yet.</div>}
          {!loading && slips.map(slip => {
          const tripAccessStatus = getTripAccessStatus(slip);
          const isCompletedTrip = tripAccessStatus === 'completed';
          const isBlockedTrip = tripAccessStatus === 'blocked';
          const tripAccessHelper = slip.actions?.helperText || '';
          const cssuStatusLabel = getCssuValidationStatus(slip).toUpperCase();
          return <button key={slip.id} type="button" className={`map-slip-selection-card ${isCompletedTrip ? 'is-completed' : isBlockedTrip ? 'is-blocked' : 'is-approved'}`} onClick={() => !isCompletedTrip && !isBlockedTrip && handleSelectSlip(slip.id)} disabled={isCompletedTrip || isBlockedTrip}>
                
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
              </button>;
        })}
        </div>
      </div>
    </div>;
};
export const MapTrackingView = ({
  setView,
  profileData,
  selectedSlip,
  setSelectedSlip
}) => {
  const LIVE_TRACKING_MAX_ACCEPTED_ACCURACY_METERS = 30;
  const LIVE_TRACKING_MIN_MOVEMENT_METERS = 18;
  const LIVE_TRACKING_MIN_REROUTE_DISTANCE_METERS = 28;
  const LIVE_TRACKING_MIN_REROUTE_INTERVAL_MS = 5000;
  const LIVE_TRACKING_STATIONARY_SPEED_MPS = 0.8;
  const TRIP_PROGRESS_STORAGE_KEY = 'edurouteActiveTripProgress';
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
  const [actionBoardExpanded, setActionBoardExpanded] = useState(true);
  const [showTripMetrics, setShowTripMetrics] = useState(false);
  const [showRouteTools, setShowRouteTools] = useState(true);
  const [showProofPanel, setShowProofPanel] = useState(true);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState('');
  const [showTrackingConsent, setShowTrackingConsent] = useState(false);
  const [locatorSlip, setLocatorSlip] = useState(selectedSlip || null);
  const [tripSummary, setTripSummary] = useState(null);
  const [overlayOffsets, setOverlayOffsets] = useState({
    search: {
      x: 0,
      y: 0
    },
    action: {
      x: 0,
      y: 0
    },
    metrics: {
      x: 0,
      y: 0
    },
    proof: {
      x: 0,
      y: 0
    },
    tools: {
      x: 0,
      y: 0
    },
    panel: {
      x: 0,
      y: 0
    }
  });
  const dragStateRef = useRef(null);
  const {
    proof: proofCompliance,
    submitting: proofSubmitting,
    error: proofError,
    submitProof,
    loadProof,
    clearProofError
  } = useProofOfCompliance(activeTrip?.id);
  const routeModes = [{
    key: 'mapbox/driving-traffic',
    label: 'Best Route',
    tone: 'green'
  }, {
    key: 'mapbox/driving',
    label: 'Driving',
    tone: 'yellow'
  }, {
    key: 'mapbox/walking',
    label: 'Walking',
    tone: 'gray'
  }];
  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`
  });
  const fetchEncryptedDirections = async (payload, fallbackMessage) =>
    withFreshAuthPayloadKeyRetry(async () => {
      const encryptedPayload = await encryptSensitivePayload(payload);
      const response = await fetch(`${API_BASE_URL}/api/maps/directions`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(encryptedPayload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || fallbackMessage || 'Failed to load trip route.');
      }
      return data.data;
    });
  const readStoredTripProgress = () => {
    try {
      const raw = localStorage.getItem(TRIP_PROGRESS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const writeStoredTripProgress = payload => {
    try {
      localStorage.setItem(TRIP_PROGRESS_STORAGE_KEY, JSON.stringify({
        ...payload,
        savedAt: new Date().toISOString()
      }));
    } catch {

      // Ignore local storage failures and keep backend recovery as fallback.
    }
  };
  const clearStoredTripProgress = () => {
    localStorage.removeItem(TRIP_PROGRESS_STORAGE_KEY);
  };
  const formatDistance = meters => {
    const value = Number(meters);
    if (!Number.isFinite(value)) return '0 km';
    return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`;
  };
  const formatDuration = seconds => {
    const value = Number(seconds);
    if (!Number.isFinite(value)) return '0 min';
    const minutes = Math.max(1, Math.round(value / 60));
    return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;
  };
  const getTripPhase = trip => {
    if (!trip) return !destination ? 'DESTINATION_RESOLVING' : isPinMode ? 'MANUAL_PIN_REQUIRED' : 'READY_TO_START';
    if (trip.returned_at || trip.ended_at || trip.status === 'completed') return 'COMPLETED';
    if (trip.status === 'returning') return 'RETURNING';
    if (trip.arrived_at && (trip.arrival_verified_at || proofCompliance?.proofComplianceImageUrl)) return 'ARRIVAL_VERIFIED';
    if (trip.arrived_at || trip.status === 'arrived') return 'ARRIVED';
    if (trip.status === 'active') return 'ACTIVE';
    return !destination ? 'DESTINATION_RESOLVING' : isPinMode ? 'MANUAL_PIN_REQUIRED' : 'READY_TO_START';
  };
  const activeAlternatives = routeSummary?.alternatives || [];
  const displayedRoute = selectedAlternativeIndex >= 0 ? activeAlternatives[selectedAlternativeIndex] : routeSummary;
  const activeSteps = displayedRoute?.steps || [];
  const tripLifecycleState = getTripPhase(activeTrip);
  const isCompletedSummaryMode = Boolean(tripSummary?.summary) || tripLifecycleState === 'COMPLETED' || locatorSlip?.trip_status === 'completed';
  const selectedModeMeta = routeModes.find(mode => mode.key === routeMode) || routeModes[0];
  const activeModeEta = useMemo(() => modeEstimates.find(estimate => estimate.profile === routeMode) || null, [modeEstimates, routeMode]);
  useEffect(() => {
    if (['ACTIVE', 'ARRIVAL_VERIFIED', 'RETURNING'].includes(tripLifecycleState)) {
      setActionBoardExpanded(false);
      setShowSearchPanel(false);
      setShowProofPanel(false);
      return;
    }
    if (['DESTINATION_RESOLVING', 'MANUAL_PIN_REQUIRED', 'READY_TO_START', 'ARRIVED'].includes(tripLifecycleState)) {
      setActionBoardExpanded(true);
    }
  }, [tripLifecycleState]);
  const toggleRoutePanel = panelKey => {
    setActiveRoutePanel(currentPanel => currentPanel === panelKey ? null : panelKey);
  };
  const getPointerPosition = event => {
    const point = event.touches?.[0] || event.changedTouches?.[0] || event;
    return {
      x: point.clientX,
      y: point.clientY
    };
  };
  const startOverlayDrag = overlayKey => event => {
    const {
      x,
      y
    } = getPointerPosition(event);
    const baseOffset = overlayOffsets[overlayKey] || {
      x: 0,
      y: 0
    };
    dragStateRef.current = {
      key: overlayKey,
      startX: x,
      startY: y,
      baseX: baseOffset.x,
      baseY: baseOffset.y
    };
  };
  const getOverlayStyle = overlayKey => ({
    '--overlay-x': `${overlayOffsets[overlayKey]?.x || 0}px`,
    '--overlay-y': `${overlayOffsets[overlayKey]?.y || 0}px`
  });
  const getDistanceBetweenMeters = (first, second) => {
    if (!first || !second) return Number.POSITIVE_INFINITY;
    const toRadians = degrees => degrees * Math.PI / 180;
    const earthRadiusMeters = 6371000;
    const deltaLatitude = toRadians(second.latitude - first.latitude);
    const deltaLongitude = toRadians(second.longitude - first.longitude);
    const startLatitude = toRadians(first.latitude);
    const endLatitude = toRadians(second.latitude);
    const haversine = Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(deltaLongitude / 2) * Math.sin(deltaLongitude / 2);
    return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  };
  const runWhenMapStyleReady = operation => {
    const map = mapRef.current;
    if (!map) return;
    const runOperation = () => {
      const latestMap = mapRef.current;
      if (!latestMap) return;
      try {
        operation(latestMap);
      } catch (error) {
        const message = String(error?.message || '');
        if (message.includes('Style is not done loading')) {
          latestMap.once('styledata', () => runWhenMapStyleReady(operation));
          return;
        }
        throw error;
      }
    };

    if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) {
      map.once('load', runOperation);
      map.once('styledata', runOperation);
      return;
    }

    runOperation();
  };
  useEffect(() => {
    const slipId = locatorSlip?.id || selectedSlip?.id || localStorage.getItem('edurouteMapSlipId');
    if (!slipId) {
      clearStoredTripProgress();
      return;
    }
    if (!activeTrip) {
      return;
    }
    if (tripLifecycleState === 'COMPLETED') {
      clearStoredTripProgress();
      return;
    }
    writeStoredTripProgress({
      slipId,
      trip: activeTrip,
      tripStartOrigin,
      origin,
      destination,
      routeSummary
    });
  }, [activeTrip, tripLifecycleState, locatorSlip?.id, selectedSlip?.id, tripStartOrigin, origin, destination, routeSummary]);
  const drawRoute = geometry => {
    if (!mapRef.current || !geometry) return;
    runWhenMapStyleReady(map => {
    const routeFeature = {
      type: 'Feature',
      properties: {},
      geometry
    };
    if (map.getSource('active-trip-route')) {
      map.getSource('active-trip-route').setData(routeFeature);
    } else {
      map.addSource('active-trip-route', {
        type: 'geojson',
        data: routeFeature
      });
      map.addLayer({
        id: 'active-trip-route-casing',
        type: 'line',
        source: 'active-trip-route',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#ffffff',
          'line-width': 10,
          'line-opacity': 0.88
        }
      });
      map.addLayer({
        id: 'active-trip-route-line',
        type: 'line',
        source: 'active-trip-route',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#049516',
          'line-width': 6,
          'line-opacity': 0.96
        }
      });
    }
    const coordinates = geometry.coordinates || [];
    if (coordinates.length > 1) {
      const bounds = coordinates.reduce((currentBounds, coordinate) => currentBounds.extend(coordinate), new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
      map.fitBounds(bounds, {
        padding: 56,
        maxZoom: 16,
        duration: 900
      });
    }
    });
  };
  const drawHighlightedStep = geometry => {
    if (!mapRef.current || !geometry) return;
    runWhenMapStyleReady(map => {
    const stepFeature = {
      type: 'Feature',
      properties: {},
      geometry
    };
    if (map.getSource('active-trip-step-highlight')) {
      map.getSource('active-trip-step-highlight').setData(stepFeature);
    } else {
      map.addSource('active-trip-step-highlight', {
        type: 'geojson',
        data: stepFeature
      });
      map.addLayer({
        id: 'active-trip-step-highlight-line',
        type: 'line',
        source: 'active-trip-step-highlight',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#FFD517',
          'line-width': 7,
          'line-opacity': 0.96
        }
      });
    }
    });
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
    if (map.getLayer('active-trip-route-casing')) map.removeLayer('active-trip-route-casing');
    if (map.getSource('active-trip-route')) map.removeSource('active-trip-route');
    clearHighlightedStep();
  };
  const stopLiveLocationWatch = () => {
    if (locationWatchRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    }
  };
  const setOriginMarker = (coordinate, {
    recenter = true
  } = {}) => {
    if (!mapRef.current || !coordinate) return;
    runWhenMapStyleReady(map => {
    const lngLat = [coordinate.longitude, coordinate.latitude];
    if (!originMarkerRef.current) {
      originMarkerRef.current = new mapboxgl.Marker({
        color: '#049516'
      }).setLngLat(lngLat).addTo(map);
    } else {
      originMarkerRef.current.setLngLat(lngLat);
    }
    if (recenter) {
      map.flyTo({
        center: lngLat,
        zoom: 15,
        essential: true
      });
    }
    });
  };
  const setDestinationMarker = coordinate => {
    if (!mapRef.current || !coordinate) return;
    runWhenMapStyleReady(map => {
    const lngLat = [coordinate.longitude, coordinate.latitude];
    if (!destinationMarkerRef.current) {
      destinationMarkerRef.current = new mapboxgl.Marker({
        color: '#FFD517'
      }).setLngLat(lngLat).addTo(map);
    } else {
      destinationMarkerRef.current.setLngLat(lngLat);
    }
    map.flyTo({
      center: lngLat,
      zoom: 15,
      essential: true
    });
    });
  };
  const handleDestinationRetrieve = async result => {
    const feature = result?.features?.[0] || result?.feature || result;
    const coordinates = feature?.geometry?.coordinates;
    if (!coordinates || coordinates.length < 2) {
      setMapError('Selected destination has no coordinates.');
      return;
    }
    const typedDestinationLabel = String(searchValue || locatorSlip?.destination || '').trim();
    const resolvedDestinationLabel = feature.properties?.full_address || feature.properties?.name || feature.properties?.place_formatted || 'Selected destination';
    const displayDestinationLabel = typedDestinationLabel || resolvedDestinationLabel;
    const nextDestination = {
      longitude: coordinates[0],
      latitude: coordinates[1],
      name: displayDestinationLabel
    };
    try {
      if (locatorSlip?.id) {
        await saveFacultyManualPin(locatorSlip.id, {
          lat: nextDestination.latitude,
          lng: nextDestination.longitude,
          label: displayDestinationLabel
        });
      }
      setDestination(nextDestination);
      setSearchValue(displayDestinationLabel);
      setSelectedAlternativeIndex(-1);
      setHighlightedStepIndex(-1);
      setIsPinMode(false);
      setDestinationMarker(nextDestination);
      setMapError('');
    } catch (error) {
      setMapError(error.message);
    }
  };
  const handlePinnedDestination = async lngLat => {
    const nextDestination = {
      longitude: lngLat.lng,
      latitude: lngLat.lat,
      name: `Pinned location (${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)})`,
      isPinned: true
    };
    const originalDestinationLabel = [locatorSlip?.destination, searchValue].map(value => String(value || '').trim()).find(value => value && !/^Pinned location\s*\(/i.test(value));
    try {
      if (locatorSlip?.id) {
        const result = await saveFacultyManualPin(locatorSlip.id, {
          lat: nextDestination.latitude,
          lng: nextDestination.longitude,
          label: nextDestination.name,
          originalDestination: originalDestinationLabel || null
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
    navigator.geolocation.getCurrentPosition(position => {
      const coordinate = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed,
        heading: position.coords.heading,
        timestamp: position.timestamp
      };
      setOrigin(coordinate);
      lastAcceptedOriginRef.current = coordinate;
      lastRouteOriginRef.current = coordinate;
      setOriginMarker(coordinate, {
        recenter: true
      });
      setMapLoading(false);
    }, error => {
      setMapError(error.code === error.PERMISSION_DENIED ? 'Location permission was denied. Enable location access to start a trip from your current location.' : 'Unable to get your current location. Please try again.');
      setMapLoading(false);
    }, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 15000
    });
  };
  const refreshRouteFromOrigin = async (nextOrigin, {
    skipFit = true,
    profile = routeMode,
    alternatives
  } = {}) => {
    if (!destination || !nextOrigin) return null;
    const routeData = await fetchEncryptedDirections({
      origin: nextOrigin,
      destination,
      profile,
      alternatives: alternatives ?? profile === 'mapbox/driving-traffic'
    }, 'Failed to refresh trip route.');
    setRouteSummary(routeData);
    setSelectedAlternativeIndex(-1);
    setHighlightedStepIndex(-1);
    clearHighlightedStep();
    drawRoute(routeData.geometry);
    if (skipFit && mapRef.current && nextOrigin) {
      mapRef.current.easeTo({
        center: [nextOrigin.longitude, nextOrigin.latitude],
        duration: 700,
        zoom: Math.max(mapRef.current.getZoom(), 15),
        essential: true
      });
    }
    return routeData;
  };
  const applyDisplayedRoute = (route, {
    flyTo = false
  } = {}) => {
    if (!route?.geometry) return;
    drawRoute(route.geometry);
    if (flyTo && mapRef.current) {
      const coordinates = route.geometry.coordinates || [];
      if (coordinates.length > 1) {
        const bounds = coordinates.reduce((currentBounds, coordinate) => currentBounds.extend(coordinate), new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
        mapRef.current.fitBounds(bounds, {
          padding: 64,
          maxZoom: 16,
          duration: 800
        });
      }
    }
  };
  const handleModeSelection = async profile => {
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
        alternatives: profile === 'mapbox/driving-traffic'
      });
    } catch (error) {
      setMapError(error.message);
    } finally {
      setMapLoading(false);
    }
  };
  const handleAlternativeSelection = alternativeIndex => {
    const alternativeRoute = activeAlternatives[alternativeIndex];
    if (!alternativeRoute) return;
    setSelectedAlternativeIndex(alternativeIndex);
    setHighlightedStepIndex(-1);
    clearHighlightedStep();
    applyDisplayedRoute(alternativeRoute, {
      flyTo: true
    });
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
        duration: 700
      });
    }
  };
  const startLiveLocationWatch = () => {
    if (!navigator.geolocation || !activeTrip || !destination) return;
    stopLiveLocationWatch();
    locationWatchRef.current = navigator.geolocation.watchPosition(async position => {
      const nextOrigin = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed,
        heading: position.coords.heading,
        timestamp: position.timestamp
      };
      const lastAcceptedOrigin = lastAcceptedOriginRef.current;
      const lastRouteOrigin = lastRouteOriginRef.current;
      const movedDistanceMeters = getDistanceBetweenMeters(lastAcceptedOrigin, nextOrigin);
      const movedSinceRerouteMeters = getDistanceBetweenMeters(lastRouteOrigin, nextOrigin);
      const accuracyMeters = Number(position.coords.accuracy);
      const speedMetersPerSecond = Number.isFinite(position.coords.speed) ? Number(position.coords.speed) : null;
      const hasReliableAccuracy = Number.isFinite(accuracyMeters) ? accuracyMeters <= LIVE_TRACKING_MAX_ACCEPTED_ACCURACY_METERS : true;
      const minimumAcceptedMovement = Math.max(LIVE_TRACKING_MIN_MOVEMENT_METERS, Number.isFinite(accuracyMeters) ? Math.min(accuracyMeters, 24) : LIVE_TRACKING_MIN_MOVEMENT_METERS);
      const hasMeaningfulMovement = movedDistanceMeters >= minimumAcceptedMovement;
      const isStationary = speedMetersPerSecond !== null ? speedMetersPerSecond < LIVE_TRACKING_STATIONARY_SPEED_MPS : !hasMeaningfulMovement;
      if (!lastAcceptedOrigin || hasReliableAccuracy && hasMeaningfulMovement && !isStationary) {
        lastAcceptedOriginRef.current = nextOrigin;
        setOrigin(nextOrigin);
        setOriginMarker(nextOrigin, {
          recenter: false
        });
        if (activeTrip?.id) {
          const encryptedLocationPayload = await encryptSensitivePayload({
            facultyUserId: localStorage.getItem('userId') || undefined,
            lat: nextOrigin.latitude,
            lng: nextOrigin.longitude,
            accuracy: nextOrigin.accuracy,
            speed: nextOrigin.speed,
            heading: nextOrigin.heading,
            recordedAt: new Date(nextOrigin.timestamp || Date.now()).toISOString()
          });
          fetch(`${API_BASE_URL}/api/trips/${activeTrip.id}/location`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(encryptedLocationPayload)
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
    }, error => {
      setMapError(error.code === error.PERMISSION_DENIED ? 'Location permission was denied during live tracking. Re-enable it to keep the trip distance updated.' : 'Unable to refresh your live trip location.');
    }, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    });
  };
  const startTripAfterConsent = async () => {
    setShowTrackingConsent(false);
    setMapLoading(true);
    setMapError('');
    try {
      const data = await startFacultyTrip({
        locatorSlipId: locatorSlip?.id,
        originLat: origin.latitude,
        originLng: origin.longitude,
        originAccuracy: origin.accuracy,
        destinationLat: destination.latitude,
        destinationLng: destination.longitude,
        outboundDistanceMeters: routeSummary?.distance_meters || null,
        profile: routeMode
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
      const errorMessage = String(error.message || '').toLowerCase();
      const isTripConflict = errorMessage.includes('complete the current trip') || errorMessage.includes('trip already exists') || errorMessage.includes('already been completed');

      // If the backend says a trip is already in progress, re-fetch slip details
      // to recover that trip so the user can continue instead of being stuck.
      if (isTripConflict && locatorSlip?.id) {
        try {
          const recoveredSlip = await getFacultyLocatorSlipDetails(locatorSlip.id);
          if (recoveredSlip?.currentTrip) {
            setLocatorSlip(recoveredSlip);
            setActiveTrip(recoveredSlip.currentTrip);
            setMapError('');
            if (recoveredSlip.currentTrip.origin) {
              setTripStartOrigin(recoveredSlip.currentTrip.origin);
            }
            const recoveredPhase = getTripPhase(recoveredSlip.currentTrip);
            if (recoveredPhase === 'RETURNING' && recoveredSlip.currentTrip.origin && recoveredSlip.currentTrip.destination) {
              const returnOrigin = {
                latitude: recoveredSlip.currentTrip.destination.latitude,
                longitude: recoveredSlip.currentTrip.destination.longitude,
                name: recoveredSlip.currentTrip.destination.name || 'Verified destination'
              };
              const returnDestination = {
                latitude: recoveredSlip.currentTrip.origin.latitude,
                longitude: recoveredSlip.currentTrip.origin.longitude,
                name: 'Starting location'
              };
              setOrigin(returnOrigin);
              setDestination(returnDestination);
              setOriginMarker(returnOrigin, {
                recenter: true
              });
              setDestinationMarker(returnDestination);
              lastAcceptedOriginRef.current = returnOrigin;
              lastRouteOriginRef.current = returnOrigin;
            } else {
              if (recoveredSlip.currentTrip.origin) {
                setOrigin(recoveredSlip.currentTrip.origin);
                setOriginMarker(recoveredSlip.currentTrip.origin);
                lastAcceptedOriginRef.current = recoveredSlip.currentTrip.origin;
                lastRouteOriginRef.current = recoveredSlip.currentTrip.origin;
              }
              if (recoveredSlip.currentTrip.destination) {
                setDestination(recoveredSlip.currentTrip.destination);
                setDestinationMarker(recoveredSlip.currentTrip.destination);
              }
            }
            if (recoveredSlip.currentTrip.route_geometry) {
              const nextRouteSummary = {
                distance_meters: recoveredSlip.currentTrip.total_distance_meters || recoveredSlip.currentTrip.route_distance_meters,
                duration_seconds: recoveredSlip.currentTrip.route_duration_seconds,
                geometry: recoveredSlip.currentTrip.route_geometry,
                steps: [],
                alternatives: []
              };
              setRouteSummary(nextRouteSummary);
              drawRoute(nextRouteSummary.geometry);
            }
            return;
          }
        } catch (recoveryError) {
          console.error('Trip recovery attempt failed:', recoveryError);
        }
      }
      setMapError(error.message);
    } finally {
      setMapLoading(false);
    }
  };
  const startTrip = () => {
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
    setMapError('');
    setShowTrackingConsent(true);
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
  const submitProofOfCompliance = async formPayload => {
    if (!activeTrip) {
      setMapError('Trip is missing.');
      return;
    }
    setMapError('');
    clearProofError();
    try {
      const data = await submitProof(formPayload);
      if (data?.trip) {
        setActiveTrip(current => ({
          ...(current || {}),
          ...data.trip
        }));
      }
      setMapError('');
      await loadProof({
        silent: true
      });
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
          name: 'Starting location'
        };
        const returnOrigin = {
          latitude: destination.latitude,
          longitude: destination.longitude,
          name: destination.name || 'Verified destination'
        };
        setDestination(returnDestination);
        setDestinationMarker(returnDestination);
        setOrigin(returnOrigin);
        setOriginMarker(returnOrigin, {
          recenter: true
        });
        lastAcceptedOriginRef.current = returnOrigin;
        lastRouteOriginRef.current = returnOrigin;
        const returnRoute = await fetchEncryptedDirections({
          origin: returnOrigin,
          destination: returnDestination,
          profile: routeMode,
          alternatives: false
        }, 'Failed to prepare the return route.');
        setRouteSummary(returnRoute);
        drawRoute(returnRoute.geometry);
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
        profile: routeMode
      });
      const summaryPayload = await getFacultyTripSummary(activeTrip.id).catch(() => data);
      const completedTrip = data.trip ? {
        ...data.trip,
        status: 'completed',
        trip_status: 'completed'
      } : null;
      const applyCompletedSlipState = current => {
        if (!current) return current;
        return {
          ...current,
          status: 'completed',
          trip_status: 'completed',
          tripStatus: 'completed',
          displayStatus: 'completed',
          currentStatusLabel: 'completed',
          trip: completedTrip || current.trip || null
        };
      };
      setTripSummary(summaryPayload);
      setActiveTrip(completedTrip);
      setTripStartOrigin(null);
      setShowActionBoard(false);
      setShowTripMetrics(false);
      setShowProofPanel(false);
      setShowRouteTools(false);
      setActiveRoutePanel(null);
      stopLiveLocationWatch();
      clearRoute();
      localStorage.removeItem('edurouteMapSlipId');
      clearStoredTripProgress();
      if (completedTrip) {
        setLocatorSlip(current => applyCompletedSlipState(current));
        setSelectedSlip?.(current => applyCompletedSlipState(current));
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
    if (!isCompletedSummaryMode) return;
    setShowActionBoard(false);
    setShowTripMetrics(false);
    setShowProofPanel(false);
    setShowRouteTools(false);
    setActiveRoutePanel(null);
  }, [isCompletedSummaryMode]);
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
        let restoredStoredTrip = null;
        if (slip.currentTrip) {
          setActiveTrip(slip.currentTrip);
          const recoveredPhase = getTripPhase(slip.currentTrip);
          const isReturning = recoveredPhase === 'RETURNING';

          // For a RETURNING trip the faculty is heading back from the trip
          // destination to the original start point, so swap origin/destination.
          if (isReturning && slip.currentTrip.origin && slip.currentTrip.destination) {
            const returnOrigin = {
              latitude: slip.currentTrip.destination.latitude,
              longitude: slip.currentTrip.destination.longitude,
              name: slip.currentTrip.destination.name || 'Verified destination'
            };
            const returnDestination = {
              latitude: slip.currentTrip.origin.latitude,
              longitude: slip.currentTrip.origin.longitude,
              name: 'Starting location'
            };
            setOrigin(returnOrigin);
            setTripStartOrigin(slip.currentTrip.origin);
            lastAcceptedOriginRef.current = returnOrigin;
            lastRouteOriginRef.current = returnOrigin;
            setOriginMarker(returnOrigin, {
              recenter: true
            });
            setDestination(returnDestination);
            setDestinationMarker(returnDestination);

            // Fetch a fresh return route instead of reusing the outbound geometry.
            try {
              const returnRouteData = await fetchEncryptedDirections({
                origin: returnOrigin,
                destination: returnDestination,
                profile: routeMode,
                alternatives: false
              }, 'Failed to restore the return route.');
              if (mounted && returnRouteData?.geometry) {
                setRouteSummary(returnRouteData);
                drawRoute(returnRouteData.geometry);
              }
            } catch (routeErr) {
              // Fall through — the stored outbound geometry (if any) will
              // be used as a fallback below.
              console.warn('Could not fetch return route on recovery:', routeErr);
            }
          } else {
            if (slip.currentTrip.origin) {
              setOrigin(slip.currentTrip.origin);
              setTripStartOrigin(slip.currentTrip.origin);
              lastAcceptedOriginRef.current = slip.currentTrip.origin;
              lastRouteOriginRef.current = slip.currentTrip.origin;
              setOriginMarker(slip.currentTrip.origin);
            }
            if (slip.currentTrip.destination) {
              setDestination(slip.currentTrip.destination);
              setDestinationMarker(slip.currentTrip.destination);
            }
          }
          if (slip.currentTrip.route_geometry && !isReturning) {
            const nextRouteSummary = {
              distance_meters: slip.currentTrip.total_distance_meters || slip.currentTrip.route_distance_meters,
              duration_seconds: slip.currentTrip.route_duration_seconds,
              geometry: slip.currentTrip.route_geometry,
              steps: [],
              alternatives: []
            };
            setRouteSummary(nextRouteSummary);
            drawRoute(nextRouteSummary.geometry);
          }
        } else {
          const storedProgress = readStoredTripProgress();
          const hasMatchingStoredTrip = storedProgress && String(storedProgress.slipId || '') === String(slip.id || '') && storedProgress.trip?.id && storedProgress.trip?.status !== 'completed' && storedProgress.trip?.trip_status !== 'completed';
          if (hasMatchingStoredTrip) {
            restoredStoredTrip = storedProgress.trip;
            setActiveTrip(storedProgress.trip);
            setTripStartOrigin(storedProgress.tripStartOrigin || null);
            if (storedProgress.origin) {
              setOrigin(storedProgress.origin);
              setOriginMarker(storedProgress.origin, {
                recenter: true
              });
              lastAcceptedOriginRef.current = storedProgress.origin;
              lastRouteOriginRef.current = storedProgress.origin;
            }
            if (storedProgress.destination) {
              setDestination(storedProgress.destination);
              setDestinationMarker(storedProgress.destination);
            }
            if (storedProgress.routeSummary?.geometry) {
              setRouteSummary(storedProgress.routeSummary);
              drawRoute(storedProgress.routeSummary.geometry);
              setShowRouteTools(true);
            }
          } else {
            setActiveTrip(null);
            setTripStartOrigin(null);
          }
        }

        // Only resolve the locator slip destination when there is no active
        // trip — an in-progress trip (especially RETURNING) has already set
        // the correct origin/destination pair above and overwriting it here
        // would reset the view back to "Start Trip".
        const effectiveRecoveredTrip = slip.currentTrip || restoredStoredTrip;
        const hasActiveTripLoaded = effectiveRecoveredTrip && ['ACTIVE', 'ARRIVED', 'ARRIVAL_VERIFIED', 'RETURNING'].includes(getTripPhase(effectiveRecoveredTrip));
        if (!hasActiveTripLoaded) {
          if (slip.destination_lat && slip.destination_lng) {
            const nextDestination = {
              latitude: Number(slip.destination_lat),
              longitude: Number(slip.destination_lng),
              name: slip.destination
            };
            setDestination(nextDestination);
            setDestinationMarker(nextDestination);
            setIsPinMode(false);
          } else if (slip.destination) {
            const result = await resolveFacultyLocatorSlipDestination(slip.id, slip.destination);
            if (!mounted) return;
            if (result.resolved) {
              const displayDestinationLabel = String((result.locatorSlip || slip)?.destination || slip.destination || '').trim() || result.destination.label;
              const nextDestination = {
                latitude: Number(result.destination.lat),
                longitude: Number(result.destination.lng),
                name: displayDestinationLabel
              };
              setLocatorSlip(result.locatorSlip || slip);
              setSearchValue(displayDestinationLabel);
              setDestination(nextDestination);
              setDestinationMarker(nextDestination);
              setIsPinMode(false);
            } else {
              setDestination(null);
              setIsPinMode(true);
              setMapError(result.message || 'Destination could not be resolved automatically.');
            }
          }
        } else {
          setIsPinMode(false);
        }
      } catch (error) {
        if (!mounted) return;
        setMapError(error.message);
        const normalizedMessage = String(error.message || '').toLowerCase();
        const shouldRedirectToSelection = normalizedMessage.includes('approved locator slip not found') || normalizedMessage.includes('only approved or verified locator slips') || normalizedMessage.includes('locator slip not found');
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
    if (!MAPBOX_PUBLIC_TOKEN || !mapContainerRef.current || mapRef.current) return;
    mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [120.2828, 14.8386],
      zoom: 13
    });
    map.addControl(new mapboxgl.NavigationControl({
      showCompass: false
    }), 'bottom-right');
    map.on('load', () => {
      setMapReady(true);
      map.resize();
    });
    map.on('error', event => {
      const message = event?.error?.message || 'Mapbox could not load the route map.';
      if (String(message).includes('Style is not done loading')) return;
      setMapError(message);
    });
    window.setTimeout(() => {
      if (mapRef.current === map) map.resize();
    }, 150);
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
    const handleMapClickForPin = event => {
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
        const responses = await Promise.all(profiles.map(async profile => (
          fetchEncryptedDirections({
            origin,
            destination,
            profile,
            alternatives: profile === 'mapbox/driving-traffic'
          }, 'Failed to compare route modes.')
        )));
        if (!cancelled) {
          setModeEstimates(responses);
          const suggestedMode = responses.reduce((bestRoute, nextRoute) => !bestRoute || nextRoute.duration_seconds < bestRoute.duration_seconds ? nextRoute : bestRoute, null);
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
    const handleMove = event => {
      if (!dragStateRef.current) return;
      if (event.cancelable) {
        event.preventDefault();
      }
      const {
        x,
        y
      } = getPointerPosition(event);
      const {
        key,
        startX,
        startY,
        baseX,
        baseY
      } = dragStateRef.current;
      setOverlayOffsets(currentOffsets => ({
        ...currentOffsets,
        [key]: {
          x: baseX + (x - startX),
          y: baseY + (y - startY)
        }
      }));
    };
    const handleEnd = () => {
      dragStateRef.current = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, {
      passive: false
    });
    window.addEventListener('touchend', handleEnd);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [overlayOffsets]);
  return <div className="dashboard-wrapper map-trip-wrapper">
      <div ref={mapContainerRef} className="mapbox-canvas" />

      {!MAPBOX_PUBLIC_TOKEN && <div className="map-token-warning">
          Add VITE_MAPBOX_PUBLIC_TOKEN to .env.local to load the map.
        </div>}

      <div className="map-top-nav trip-map-top-nav">
        <div className="nav-left" onClick={() => setView('dashboard')} style={{
        cursor: 'pointer'
      }}>
          <BackArrowIcon color="var(--green)" />
          <span className="nav-title">Trip Route</span>
        </div>
        <div className="dash-avatar" onClick={() => setView('profile')}>
          <img src={profileData.image} alt="Profile" style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          borderRadius: '50%'
        }} />
        </div>
      </div>

      {showSearchPanel ? <div className={`trip-search-panel ${activeTrip ? 'trip-search-panel-active' : ''}`} style={getOverlayStyle('search')}>
          <div className="overlay-card-head overlay-card-head-search">
            <label>Destination</label>
            <div className="overlay-card-controls">
              <button type="button" className="overlay-toggle-btn" onClick={() => setShowSearchPanel(false)}>
                Hide
              </button>
              <button type="button" className="overlay-drag-handle" onMouseDown={startOverlayDrag('search')} onTouchStart={startOverlayDrag('search')}>
              
                Drag
              </button>
            </div>
          </div>
          {MAPBOX_PUBLIC_TOKEN ? <SearchBox accessToken={MAPBOX_PUBLIC_TOKEN} map={mapRef.current} mapboxgl={mapboxgl} marker={false} value={searchValue} onChange={nextValue => {
        setSearchValue(nextValue);
        setIsPinMode(false);
        if (nextValue.trim()) {
          clearPinnedDestination();
        }
      }} onClear={() => {
        setSearchValue('');
        setIsPinMode(false);
        clearPinnedDestination();
      }} onRetrieve={handleDestinationRetrieve} placeholder="Search destination..." options={{
        language: 'en',
        country: 'PH'
      }} /> : <input disabled placeholder="Mapbox token required" />}
          {locatorSlip && <p className="trip-search-state">
              {tripLifecycleState === 'RETURNING' ? <>Return trip active: <strong>destination is now the original starting location</strong></> : <>Selected locator slip: <strong>{locatorSlip.destination}</strong></>}
            </p>}
          <div className="trip-search-actions">
            <button type="button" className={`trip-pin-btn ${isPinMode ? 'active' : ''}`} onClick={() => {
          const nextPinMode = !isPinMode;
          setIsPinMode(nextPinMode);
          if (nextPinMode) {
            setSearchValue('');
            clearPinnedDestination();
          }
          setMapError('');
        }}>
            
              {isPinMode ? 'Tap Map To Pin' : 'Pin Location'}
            </button>
          </div>
          {destination && <p className="trip-selected-destination">
              {tripLifecycleState === 'RETURNING' ? `Returning to ${destination.name} from the verified destination` : destination.name}
              {destination.isPinned ? ' • custom pin' : ''}
            </p>}
          {isPinMode && <p className="trip-search-state">Tap any point on the map to set a destination when Search Box does not find it.</p>}
        </div> : <button type="button" className="trip-search-restore-btn fade-in" onClick={() => setShowSearchPanel(true)}>
          Show Destination
        </button>}

      {!isCompletedSummaryMode && showActionBoard ? <div className={`trip-action-board fade-in ${actionBoardExpanded ? 'expanded' : 'compact'}`} style={getOverlayStyle('action')}>
          <div className="tb-header">
            <div className="tb-header-left">
              <div className="tb-dot"></div>
              <span>{activeTrip ? 'FACULTY TRIP FLOW' : 'READY TO ROUTE'}</span>
            </div>
            <div className="tb-header-actions">
              <div className="tb-status">{tripLifecycleState.replace(/_/g, ' ')}</div>
              <button type="button" className="overlay-toggle-btn on-green" onClick={() => setActionBoardExpanded(current => !current)}>
                {actionBoardExpanded ? 'Minimize' : 'Expand'}
              </button>
              <button type="button" className="overlay-toggle-btn on-green" onClick={() => setShowActionBoard(false)}>
                Hide
              </button>
              <button type="button" className="overlay-drag-handle on-green" onMouseDown={startOverlayDrag('action')} onTouchStart={startOverlayDrag('action')}>
              
                Drag
              </button>
            </div>
          </div>

          <button type="button" className="trip-action-glance" onClick={() => setActionBoardExpanded(true)}>
            <span>
              <small>{tripLifecycleState === 'RETURNING' ? 'RETURNING TO START' : 'CURRENT DESTINATION'}</small>
              <strong>{destination?.name || locatorSlip?.destination || 'Select a destination'}</strong>
            </span>
            <span className="trip-action-glance-metrics">
              <b>{formatDistance(routeSummary?.distance_meters || activeTrip?.distance_meters)}</b>
              <b>{formatDuration(routeSummary?.duration_seconds || activeTrip?.duration_seconds)}</b>
              <b className="gps-live"><i /> GPS Live</b>
            </span>
          </button>

          {mapError && <div className="trip-map-error">{mapError}</div>}

          <div className="trip-map-actions">
            <button type="button" className="trip-location-btn" onClick={requestCurrentLocation} disabled={mapLoading}>
              Use My Current Location
            </button>
            {tripSummary?.summary || locatorSlip?.trip_status === 'completed' ? <button type="button" className="trip-location-btn" onClick={() => {
          setSelectedSlip?.(null);
          setLocatorSlip(null);
          localStorage.removeItem('edurouteMapSlipId');
          setView('map-slip-selection');
        }}>
            
                Choose Another Slip
              </button> : !activeTrip || tripLifecycleState === 'COMPLETED' ? <button type="button" className="trip-start-btn" onClick={startTrip} disabled={mapLoading}>
            
                {mapLoading ? 'Preparing...' : 'Start Trip'}
              </button> : tripLifecycleState === 'ACTIVE' ? <button type="button" className="trip-start-btn" onClick={markTripArrived} disabled={mapLoading}>
                {mapLoading ? 'Updating...' : 'Arrived'}
              </button> : tripLifecycleState === 'ARRIVED' ? <div className="trip-map-verification-stack">
                <ProofOfComplianceForm initialValues={{
            focalPersonName: '',
            focalPersonPosition: ''
          }} disabled={mapLoading || proofSubmitting} loading={proofSubmitting} error={proofError || mapError} onSubmit={submitProofOfCompliance} />
            
              </div> : tripLifecycleState === 'ARRIVAL_VERIFIED' ? <button type="button" className="trip-start-btn" onClick={beginReturnTrip} disabled={mapLoading}>
                {mapLoading ? 'Preparing...' : 'Start Return Trip'}
              </button> : tripLifecycleState === 'RETURNING' ? <button type="button" className="trip-start-btn" onClick={completeReturnedTrip} disabled={mapLoading}>
                {mapLoading ? 'Saving...' : 'Returned'}
              </button> : <button type="button" className="trip-location-btn" disabled>
                Trip Completed
              </button>}
          </div>
          {proofCompliance?.proofComplianceImageUrl && !isCompletedSummaryMode && tripLifecycleState !== 'RETURNING' && <p className="trip-search-state">Proof of compliance submitted successfully. You can now start the return route back to the original starting location.</p>}
          {tripLifecycleState === 'RETURNING' && <p className="trip-search-state">Destination updated. You are now returning back to the original starting location.</p>}
          {!activeTrip && locatorSlip && getLocatorSlipActionState(locatorSlip, activeTrip).helperText && <p className="trip-search-state">{getLocatorSlipActionState(locatorSlip, activeTrip).helperText}</p>}
          {tripSummary?.summary && <div className="trip-summary-card">
              <strong>Trip Summary Ready</strong>
              <span>Total distance: {formatDistance(tripSummary.summary.totalDistanceMeters)}</span>
              <span>Trip duration: {formatTripDurationLabel(tripSummary.summary.totalTripMinutes)}</span>
              <span>{tripSummary.summary.isLateReturn ? `Late return: ${tripSummary.summary.minutesLate} mins late` : 'Returned within the expected window'}</span>
            </div>}
        </div> : !isCompletedSummaryMode ? <button type="button" className="trip-action-restore-btn fade-in" onClick={() => setShowActionBoard(true)}>
          Trip Controls
        </button> : null}

      {!isCompletedSummaryMode && proofCompliance && showProofPanel ? <div className="trip-proof-panel fade-in" style={getOverlayStyle('proof')}>
          <div className="trip-metrics-head">
            <span>Compliance Proof</span>
            <div className="overlay-card-controls">
              <button type="button" className="overlay-toggle-btn" onClick={() => setShowProofPanel(false)}>
                Hide
              </button>
              <button type="button" className="overlay-drag-handle" onMouseDown={startOverlayDrag('proof')} onTouchStart={startOverlayDrag('proof')}>
              
                Drag
              </button>
            </div>
          </div>
          <ProofOfCompliancePreview proof={proofCompliance} title="Submitted Proof of Compliance" showFullCard={false} showArrivalPhoto={false} />
        
        </div> : !isCompletedSummaryMode && proofCompliance ? <button type="button" className="trip-proof-restore-btn fade-in" onClick={() => setShowProofPanel(true)}>
        
          Show Compliance
        </button> : null}

      {tripSummary?.summary && <div className="trip-summary-panel fade-in">
          <h3>Trip Summary</h3>
          <div className="trip-summary-grid">
            <div><span>Locator slip departure</span><strong>{formatStatusDateTime(tripSummary.summary.departureTime)}</strong></div>
            <div><span>Actual trip start</span><strong>{formatStatusDateTime(tripSummary.summary.actualStartTripTime)}</strong></div>
            <div><span>Estimated return</span><strong>{formatStatusDateTime(tripSummary.summary.estimatedReturnTime)}</strong></div>
            <div><span>Actual return</span><strong>{formatStatusDateTime(tripSummary.summary.actualReturnTime)}</strong></div>
            <div><span>Total distance</span><strong>{formatDistance(tripSummary.summary.totalDistanceMeters)}</strong></div>
            <div><span>Trip duration</span><strong>{formatTripDurationLabel(tripSummary.summary.totalTripMinutes)}</strong></div>
          </div>
          <p className={`trip-summary-late ${tripSummary.summary.isLateReturn ? 'late' : ''}`}>
            {tripSummary.summary.isLateReturn ? `Late return detected: ${tripSummary.summary.minutesLate} minutes late.` : 'Returned within the approved timeframe.'}
          </p>
        </div>}

      {activeTrip && !isCompletedSummaryMode && <div className={`trip-metrics-panel fade-in ${showTripMetrics ? '' : 'collapsed'}`} style={getOverlayStyle('metrics')}>
          <div className="trip-metrics-head">
            <span>Trip Metrics</span>
            <div className="overlay-card-controls">
              <button type="button" className="overlay-toggle-btn" onClick={() => setShowTripMetrics(currentValue => !currentValue)}>
                {showTripMetrics ? 'Hide' : 'Show'}
              </button>
              {showTripMetrics && <button type="button" className="overlay-drag-handle" onMouseDown={startOverlayDrag('metrics')} onTouchStart={startOverlayDrag('metrics')}>
              
                  Drag
                </button>}
            </div>
          </div>
          {showTripMetrics && <div className="trip-stats-strip">
              <div className="trip-stat-pill"><span>Distance</span><strong>{formatDistance(routeSummary?.distance_meters || activeTrip?.distance_meters)}</strong></div>
              <div className="trip-stat-pill"><span>ETA</span><strong>{formatDuration(routeSummary?.duration_seconds || activeTrip?.duration_seconds)}</strong></div>
              <div className="trip-stat-pill tracking"><span>Tracking</span><strong><i /> Live GPS</strong></div>
            </div>}
        </div>}

      {(destination || routeSummary || activeTrip) && showRouteTools && <div className="trip-side-actions" style={getOverlayStyle('tools')}>
          <button type="button" className="overlay-drag-handle small" onMouseDown={startOverlayDrag('tools')} onTouchStart={startOverlayDrag('tools')}>
          
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
          <button type="button" className="trip-side-btn utility" onClick={() => {
        setShowRouteTools(false);
        setActiveRoutePanel(null);
      }}>
            Hide
          </button>
        </div>}

      {activeTrip && !showRouteTools && <button type="button" className="trip-side-restore-btn fade-in" onClick={() => setShowRouteTools(true)}>
          Show Routes
        </button>}

      {activeRoutePanel && <div className="trip-side-panel fade-in" style={getOverlayStyle('panel')}>
          {activeRoutePanel === 'summary' && <>
              <div className="trip-side-panel-head">
                <span>Best Route</span>
                <div className="overlay-card-controls">
                  <button type="button" onClick={() => setActiveRoutePanel(null)}>Close</button>
                  <button type="button" className="overlay-drag-handle" onMouseDown={startOverlayDrag('panel')} onTouchStart={startOverlayDrag('panel')}>
                
                    Drag
                  </button>
                </div>
              </div>
              <div className="trip-mode-selector">
                {routeModes.map(mode => {
            const estimate = modeEstimates.find(item => item.profile === mode.key);
            const isSelected = routeMode === mode.key;
            return <button key={mode.key} type="button" className={`trip-mode-chip ${isSelected ? 'selected' : ''}`} onClick={() => handleModeSelection(mode.key)} disabled={mapLoading}>
                  
                      <span>{mode.label}</span>
                      <small>{estimate ? formatDuration(estimate.duration_seconds) : '--'}</small>
                    </button>;
          })}
              </div>
              <div className="trip-guidance-card">
                <span className="trip-guidance-label">{selectedModeMeta.label}</span>
                <h4>{routeMode === 'mapbox/driving-traffic' ? 'Traffic-aware route selected' : 'Step-by-step route ready'}</h4>
                <p>{routeSummary?.summary || activeModeEta?.summary || 'EduRoute will use the latest route guidance for this trip.'}</p>
              </div>
            </>}

          {activeRoutePanel === 'alternatives' && <>
              <div className="trip-side-panel-head">
                <span>Alternative Routes</span>
                <div className="overlay-card-controls">
                  <button type="button" onClick={() => setActiveRoutePanel(null)}>Close</button>
                  <button type="button" className="overlay-drag-handle" onMouseDown={startOverlayDrag('panel')} onTouchStart={startOverlayDrag('panel')}>
                
                    Drag
                  </button>
                </div>
              </div>
              <div className="trip-guidance-card compact">
                <span className="trip-guidance-label">Other Options</span>
                {activeAlternatives.length ? activeAlternatives.map((alternative, index) => <button key={`${alternative.profile}-${index}`} type="button" className={`trip-alt-row ${selectedAlternativeIndex === index ? 'selected' : ''}`} onClick={() => handleAlternativeSelection(index)}>
              
                      <strong>Option {index + 2}</strong>
                      <span>{formatDuration(alternative.duration_seconds)} • {formatDistance(alternative.distance_meters)}</span>
                    </button>) : <p>No faster alternate route is currently available.</p>}
              </div>
            </>}

          {activeRoutePanel === 'steps' && <>
              <div className="trip-side-panel-head">
                <span>Travel Steps</span>
                <div className="overlay-card-controls">
                  <button type="button" onClick={() => setActiveRoutePanel(null)}>Close</button>
                  <button type="button" className="overlay-drag-handle" onMouseDown={startOverlayDrag('panel')} onTouchStart={startOverlayDrag('panel')}>
                
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
                  {activeSteps.length ? activeSteps.map((step, index) => <button type="button" key={`${step.instruction}-${index}`} className={`trip-step-item ${highlightedStepIndex === index ? 'selected' : ''}`} onClick={() => handleStepSelection(step, index)}>
                
                      <div className="trip-step-index">{index + 1}</div>
                      <div className="trip-step-copy">
                        <strong>{step.instruction || 'Continue on your current road'}</strong>
                        <span>{step.name || 'Unnamed road'} • {formatDistance(step.distance_meters)}</span>
                      </div>
                    </button>) : <div className="trip-step-empty">
                      Select a destination and start a trip to see step-by-step instructions.
                    </div>}
                </div>
              </div>
            </>}
        </div>}

      {showTrackingConsent && <div className="trip-consent-backdrop" role="presentation" onClick={() => setShowTrackingConsent(false)}>
          <div className="trip-consent-modal" role="dialog" aria-modal="true" aria-labelledby="trip-consent-title" onClick={event => event.stopPropagation()}>
            <div className="trip-consent-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </div>
            <span className="trip-consent-kicker">LOCATION PRIVACY</span>
            <h2 id="trip-consent-title">Start official trip tracking?</h2>
            <p>EduRoute will record your location only while this approved trip is active.</p>
            <div className="trip-consent-details">
              <div><span className="trip-consent-check">✓</span><span>Used for route monitoring, arrival, and return verification.</span></div>
              <div><span className="trip-consent-check">✓</span><span>Stops after the trip is returned, completed, cancelled, or expired.</span></div>
              <div><span className="trip-consent-lock">●</span><span>Your location is not intended for continuous personal tracking.</span></div>
            </div>
            <div className="trip-consent-destination">
              <span>TRIP DESTINATION</span>
              <strong>{destination?.name || locatorSlip?.destination || 'Approved destination'}</strong>
            </div>
            <div className="trip-consent-actions">
              <button type="button" className="trip-consent-secondary" onClick={() => setShowTrackingConsent(false)}>Not Now</button>
              <button type="button" className="trip-consent-primary" onClick={startTripAfterConsent} disabled={mapLoading}>
                {mapLoading ? 'Starting...' : 'Allow and Start Trip'}
              </button>
            </div>
          </div>
        </div>}

      <BottomNav active="map" setView={setView} />
    </div>;
};
export const DEPT_NAMES = {
  CCS: 'College of Computer Studies',
  CBA: 'College of Business and Accountancy',
  CEAS: 'College of Education, Arts and Sciences',
  CHTM: 'College of Hospitality and Tourism Management',
  CAHS: 'College of Allied Health Studies'
};
export const ProfileView = ({
  setView,
  profileData,
  onLogout
}) => {
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [facultyProfile, setFacultyProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const formatProfileApiMessage = value => {
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
            ...(await getSensitiveResponseHeaders())
          }
        });
        const data = await decryptSensitiveResponseJson(await response.json());
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
  return <div className="dashboard-wrapper">
      <div className="content fade-in dash-content profile-content">

        <div className="slip-top-nav">
          <div className="slip-nav-left" onClick={() => setView('dashboard')}>
            <BackArrowIcon color="var(--green)" />
            <span className="dash-logo-text">EduRoute</span>
          </div>
          <div className="dash-avatar">
            <img src={profileData.image} alt="Faculty Profile" style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }} />
          </div>
        </div>

        <div className="profile-header-card">
          <div className="profile-bg-wrapper">
            <div className="profile-bg-shape"></div>
          </div>
          <div className="profile-image-container">
            <div className="profile-image-wrapper">
              <img src={profileData.image} alt="Faculty Profile" style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }} />
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
            <div className="profile-menu-icon" style={{
            background: 'rgba(162, 218, 115, 0.2)'
          }}>
              <ProfileEditIcon color="var(--green)" />
            </div>
            <span className="profile-menu-text">Edit Profile</span>
            <ChevronRightIcon color="var(--text-light)" />
          </div>

          <div className="profile-menu-item" onClick={() => setView('change-password')}>
            <div className="profile-menu-icon" style={{
            background: 'rgba(162, 218, 115, 0.2)'
          }}>
              <PasswordIcon color="var(--green)" />
            </div>
            <span className="profile-menu-text">Change Password</span>
            <ChevronRightIcon color="var(--text-light)" />
          </div>

          <div className="profile-menu-item" onClick={() => setView('notification-settings')}>
            <div className="profile-menu-icon" style={{
            background: 'rgba(162, 218, 115, 0.2)'
          }}>
              <NotificationIcon color="var(--green)" />
            </div>
            <span className="profile-menu-text">Notifications Settings</span>
            <ChevronRightIcon color="var(--text-light)" />
          </div>

          <div className="profile-menu-item" onClick={() => setView('privacy-security')}>
            <div className="profile-menu-icon" style={{
            background: 'rgba(162, 218, 115, 0.2)'
          }}>
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
      {showLogoutModal && <div className="modal-overlay fade-in">
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
        </div>}
    </div>;
};
export const ScanView = ({
  setView,
  profileData,
  selectedSlip
}) => {
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
      localStorage.setItem('edurouteDetailSlipId', selectedSlip.id);
      localStorage.setItem('edurouteLastView', 'locator-slip-detail');
      setView('locator-slip-detail');
    }
  }, [selectedSlip, setView]);
  const formatScanApiMessage = value => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(formatScanApiMessage).filter(Boolean).join('\n');
    if (typeof value === 'object') return Object.values(value).map(formatScanApiMessage).filter(Boolean).join('\n');
    return String(value);
  };
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
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
          facingMode: {
            ideal: 'environment'
          },
          width: {
            ideal: 1280
          },
          height: {
            ideal: 1280
          }
        },
        audio: false
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
    canvas.toBlob(blob => {
      if (!blob) {
        setCameraMessage('Failed to capture photo. Please try again.');
        return;
      }
      const file = new File([blob], `location-verification-${selectedSlip.id}.jpg`, {
        type: 'image/jpeg'
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
  const handleVerificationFile = event => {
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
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: formData
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
  return <div className="dashboard-wrapper scan-wrapper">
      <div className="content fade-in dash-content scan-content">

        <div className="slip-top-nav scan-top-nav">
          <div className="slip-nav-left" onClick={() => setView('status')}>
            <BackArrowIcon color="var(--green)" />
            <span className="dash-logo-text">EduRoute</span>
          </div>
          <div className="dash-avatar" onClick={() => setView('profile')} style={{
          cursor: 'pointer'
        }}>
            <img src={profileData.image} alt="Faculty Profile" style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }} />
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
            {cameraMode === 'idle' && <button type="button" className="camera-open-btn" onClick={startCamera}>
                Use Camera
              </button>}
            {cameraMode === 'requesting' && <div className="camera-state-text">Requesting camera permission...</div>}
            {cameraMode === 'camera' && <video ref={videoRef} className="location-camera-video" playsInline muted />}
            {['preview', 'uploaded'].includes(cameraMode) && capturedPreview && <img src={capturedPreview} alt="Captured location preview" className="location-camera-preview" />}
            {cameraMode === 'uploaded' && <div className="camera-uploaded-badge">Submitted</div>}
            <div className="scanner-corner top-left"></div>
            <div className="scanner-corner top-right"></div>
            <div className="scanner-corner bottom-left"></div>
            <div className="scanner-corner bottom-right"></div>
          </div>
        </div>

        {cameraMessage && <div className="location-camera-message">{cameraMessage}</div>}

        <div className="location-camera-text-actions">
          {cameraMode === 'idle' && <button type="button" onClick={startCamera}>
              Open Phone Camera
            </button>}
          {cameraMode === 'camera' && <>
              <button type="button" onClick={captureLocationPhoto}>
                Capture Photo
              </button>
              <button type="button" className="secondary" onClick={cancelCamera}>
                Cancel
              </button>
            </>}
          {cameraMode === 'preview' && <>
              <button type="button" onClick={uploadLocationPhoto} disabled={verificationUploading}>
                {verificationUploading ? 'Uploading...' : 'Upload Image'}
              </button>
              <button type="button" className="secondary" onClick={retakeLocationPhoto} disabled={verificationUploading}>
                Retake
              </button>
            </>}
          {cameraMode === 'uploaded' && <span>Verification photo submitted</span>}
        </div>

        {cameraMode === 'uploaded' && <div className="location-submitted-card">
            <span className="location-submitted-kicker">UPLOADED PHOTO</span>
            <h2>Location Verification Submitted</h2>
            <p>Your photo has been uploaded and attached to this locator slip for review.</p>
            {submittedPhotoUrl && <img src={submittedPhotoUrl} alt="Uploaded location verification" />}
            <div className="location-submitted-actions">
              <button type="button" onClick={() => setView('status')}>
                Back to Status
              </button>
              <button type="button" className="secondary" onClick={() => setView('dashboard')}>
                Dashboard
              </button>
            </div>
          </div>}

        <canvas ref={canvasRef} hidden />
        <input ref={verificationFileInputRef} type="file" accept="image/*" capture="environment" hidden onChange={handleVerificationFile} />
        
      </div>
      <BottomNav active="status" setView={setView} />
    </div>;
};
export const SlipSubmittedView = ({
  setView,
  profileData
}) => <div className="dashboard-wrapper submitted-wrapper">
    <div className="content fade-in dash-content">

      <div className="slip-top-nav">
        <div className="slip-nav-left" onClick={() => setView('dashboard')}>
          <BackArrowIcon color="var(--green)" />
          <span className="dash-logo-text">EduRoute</span>
        </div>
        <div className="dash-avatar" onClick={() => setView('profile')} style={{
        cursor: 'pointer'
      }}>
          <img src={profileData.image} alt="Faculty Profile" style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }} />
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
  </div>;
