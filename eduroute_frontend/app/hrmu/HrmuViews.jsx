import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { API_BASE_URL, MAPBOX_PUBLIC_TOKEN } from "../../config";
import { encryptSensitivePayload, withFreshAuthPayloadKeyRetry } from "../../services/authPayloadEncryption";
import { useHrmuAnalytics } from "../../hooks/useHrmuAnalytics";
import { useHrmuMonthlyReport } from "../../hooks/useHrmuMonthlyReport";
import { useHrmuLiveTracking } from "../../hooks/useHrmuLiveTracking";
import { useProofOfCompliance } from "../../hooks/useProofOfCompliance";
import { getHrmuDashboardSummary, getHrmuNotifications, getHrmuReportInbox, getHrmuRecentActivity, downloadHrmuReportInboxAttachment } from "../../services/hrmuApi";
import { downloadHrmuMonthlyReportPdf, downloadHrmuNotificationMonthlyLogPdf, getHrmuFlaggedTrips, getHrmuVerificationIncidentSummary } from "../../services/hrmuReportsApi";
import { getHrmuProofComplianceDetails, getHrmuProofComplianceList, reviewHrmuProofCompliance } from "../../services/proofComplianceApi";
import { getHrmuTripPathHistory } from "../../services/tripPathHistoryApi";
import { getHrmuActiveFaculty, getHrmuFacultyActivity, getHrmuFacultyLiveDetail } from "../../services/hrmuLiveTrackingApi";
import { createTripSocketClient, HRMU_LIVE_SOCKET_EVENTS } from "../../services/tripSocket";
import FacultyDetailCard from "../../components/hrmu/FacultyDetailCard";
import FacultyActivityLog from "../../components/hrmu/FacultyActivityLog";
import ProofComplianceList from "../../components/hrmu/ProofComplianceList";
import ProofComplianceDetails from "../../components/hrmu/ProofComplianceDetails";
import { AdminBadgeIcon, AdminBellIcon, AdminEmailOutlineIcon, AdminProfileChevronIcon, AdminProfileIdIcon, AdminProfileLogoutIcon, AdminProfilePasswordIcon, AdminRoleIcon, AdminSaveCheckIcon, ApproveCheckIcon, ArrowRightIcon, AtSymbolIcon, BackArrowIcon, BadgeIcon, BatteryIcon, BellRingIcon, BriefcaseIcon, CameraIcon, CapIcon, CheckCircleAdminIcon, CheckCircleIcon, CheckCircleSolidIcon, ChevronDownIcon, ChevronRightIcon, ClipboardCheckIcon, ClipboardClockIcon, ClockIcon, CssuChartIcon, CssuIncidentsNavIcon, CssuMapNavIcon, CssuReportsNavIcon, CssuRoleIcon, CssuRosetteCheckIcon, CssuScanNavIcon, CssuTrendingUpIcon, CssuWarningCircleIcon, CssuWarningTriangleIcon, DashboardNavIcon, DeanNotificationDocIcon, DetailClockIcon, DetailClockReturnIcon, DetailDocIcon, DetailPinIcon, DetailRouteIcon, DocumentIcon, DummySignature, EditPencilIcon, EwanIcon, ExclamationCircleIcon, EyeIcon, EyeOffIcon, FacultyCheckCircleIcon, FacultyChevronRightIcon, FacultyCopyIcon, FacultyCrossCircleIcon, FacultyDocIcon, FacultyFilterIcon, FacultyIdBadgeIcon, FacultyNavIcon, FacultyRoleIcon, FacultyWaitCircleIcon, FileTextIcon, FilledClockIcon, FlashlightIcon, GlobeIcon, GlobeSmIcon, GraduationCapIcon, GridIcon, HeadsetIcon, HelpCircleIcon, HelpIcon, HomeNavIcon, HourglassIcon, HrmuAlertTinyIcon, HrmuChartIcon, HrmuCheckTinyIcon, HrmuExportIcon, HrmuEyeMiniIcon, HrmuFilterIcon, HrmuMapRouteIcon, HrmuMiniCheckIcon, HrmuPinMiniIcon, HrmuReportIcon, HrmuRoleIcon, HrmuSidebarGridIcon, HrmuSyncIcon, HrmuVerificationIcon, HrmuViewRouteIcon, HrmuWarningIcon, IdBadgeIcon, InboxArchiveIcon, InfoIcon, LinkIcon, LocationPinFilledIcon, LocationPinIcon, LockIcon, LockPrivIcon, LockSmallIcon, LoginDoorIcon, LogoutIcon, MailIcon, MapFoldIcon, MapIcon, ModalCloseIcon, NotifPendingIcon, NotifSlipIcon, NotificationIcon, PasswordIcon, PermissionsIcon, PersonOutlineIcon, PinIcon, PlayTriangleIcon, PolicyBulbIcon, PolicyCheckIcon, PrivacyIcon, ProfileEditIcon, ProfileNavIcon, ProgressReviewIcon, QuestionCircleIcon, RefreshClockIcon, RefreshIcon, RegistryDownloadIcon, RegistryModalCloseIcon, RegistryModalDoneIcon, RegistryModalIdIcon, RegistryModalVerifiedIcon, RegistryNavIcon, RejectXIcon, RemarksIcon, ReportPrintIcon, RequestsNavIcon, SaveIcon, ScanQRIcon, SendIcon, ShieldCheckIcon, ShieldCheckSmallIcon, ShieldSearchIcon, ShieldSolidIcon, SignalIcon, SignatureNavIcon, SlashedPersonIcon, SlipIcon, StatusGraphIcon, TogaLogoIcon, ToggleSwitch, TrashIcon, UploadIcon, UsersAdminIcon, WifiIcon, XCircleIcon } from "../../components/icons/AppIcons.jsx";
import { TripPathHistoryModal } from "../../components/trips/TripPathHistoryModal.jsx";
import { DEFAULT_PROFILE_IMAGE, triggerBlobDownload } from "../shared/appUtils.js";
export const OLONGAPO_CENTER = [120.2822, 14.8386];
export const DEFAULT_HRMU_MAP_CENTER = {
  lat: 14.8386,
  lng: 120.2828,
  label: 'Olongapo City'
};
const HRMU_COLLEGE_OPTIONS = [{
  label: 'All Departments',
  value: 'all'
}, {
  label: 'College of Education, Arts and Sciences',
  value: 'College of Education, Arts and Sciences'
}, {
  label: 'College of Business and Accountancy',
  value: 'College of Business and Accountancy'
}, {
  label: 'College of Allied Health Studies',
  value: 'College of Allied Health Studies'
}, {
  label: 'College of Hospitality and Tourism Management',
  value: 'College of Hospitality and Tourism Management'
}, {
  label: 'College of Computer Studies',
  value: 'College of Computer Studies'
}];
const HRMU_PENDING_VERIFICATION_TARGET_KEY = 'edurouteHrmuPendingVerificationTarget';
const HRMU_PENDING_REPORT_MONTH_KEY = 'edurouteHrmuPendingReportMonth';
const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token') || ''}`
});
export const mergeHrmuLiveFacultyRow = (currentRows, incomingRow) => {
  const nextRows = [...currentRows];
  const targetFacultyUserId = String(incomingRow?.facultyUserId || '');
  const index = nextRows.findIndex(row => String(row?.facultyUserId || '') === targetFacultyUserId);
  if (index >= 0) {
    nextRows[index] = {
      ...nextRows[index],
      ...incomingRow
    };
  } else {
    nextRows.push(incomingRow);
  }
  return nextRows.sort((left, right) => {
    const leftTime = left?.lastUpdatedAt ? new Date(left.lastUpdatedAt).getTime() : 0;
    const rightTime = right?.lastUpdatedAt ? new Date(right.lastUpdatedAt).getTime() : 0;
    return rightTime - leftTime;
  });
};
export const HrmuLiveMapPanel = ({
  faculty = [],
  compact = false,
  className = '',
  center = OLONGAPO_CENTER,
  selectedFacultyUserId = null,
  selectedFacultyDetail = null,
  selectedFaculty = null,
  onMarkerSelect = null,
  focusOnOlongapo = false,
  focusRequest = 0
}) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const mapDisposedRef = useRef(false);
  const [mapReady, setMapReady] = useState(Boolean(MAPBOX_PUBLIC_TOKEN));
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const runMapOperation = useCallback((map, operation) => {
    if (!map || mapDisposedRef.current) return false;
    try {
      operation(map);
      return true;
    } catch {
      return false;
    }
  }, []);
  useEffect(() => {
    if (!MAPBOX_PUBLIC_TOKEN || !mapContainerRef.current || mapRef.current) {
      if (!MAPBOX_PUBLIC_TOKEN) {
        setMapReady(false);
      }
      return;
    }
    mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN;
    mapDisposedRef.current = false;
    setMapLoadFailed(false);
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center,
      zoom: compact ? 13 : 13.5,
      attributionControl: false,
      interactive: true
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({
      visualizePitch: false,
      showCompass: false
    }), 'top-right');
    const resizeMap = () => {
      if (mapDisposedRef.current) return;
      try {
        map.resize();
      } catch {
        /* ignore resize race while navigating between portals */
      }
    };
    map.on('load', () => {
      if (mapDisposedRef.current) return;
      setMapReady(true);
      setMapLoadFailed(false);
      resizeMap();
      window.requestAnimationFrame(resizeMap);
    });
    map.on('error', event => {
      if (mapDisposedRef.current) return;
      if (event?.error) {
        setMapLoadFailed(true);
      }
    });
    const resizeTimers = [window.setTimeout(resizeMap, 60), window.setTimeout(resizeMap, 240), window.setTimeout(resizeMap, 700)];
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resizeMap) : null;
    if (resizeObserver) {
      resizeObserver.observe(mapContainerRef.current);
    }
    return () => {
      mapDisposedRef.current = true;
      resizeTimers.forEach(timer => window.clearTimeout(timer));
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      markersRef.current.forEach(marker => {
        try {
          marker.remove();
        } catch {

          /* ignore map cleanup race */}
      });
      markersRef.current = [];
      try {
        map.remove();
      } catch {

        /* ignore map cleanup race */}
      mapRef.current = null;
    };
  }, [compact]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || mapDisposedRef.current) return;
    markersRef.current.forEach(marker => {
      try {
        marker.remove();
      } catch {

        /* ignore marker cleanup race */}
    });
    markersRef.current = [];
    const validFaculty = faculty.filter(item => Number.isFinite(item?.lat) && Number.isFinite(item?.lng));
    validFaculty.forEach(item => {
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
      const marker = new mapboxgl.Marker({
        element: markerElement,
        anchor: 'center'
      }).setLngLat([item.lng, item.lat]).addTo(map);
      markersRef.current.push(marker);
    });
    if (!validFaculty.length) {
      map.easeTo({
        center,
        zoom: compact ? 13 : 13.5,
        duration: 600
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
          maxZoom: compact ? 12.5 : 13.1
        });
        return;
      }
      map.easeTo({
        center: [validFaculty[0].lng, validFaculty[0].lat],
        zoom: compact ? 12.5 : 13.2,
        duration: 600
      });
      return;
    }
    const bounds = validFaculty.reduce((acc, item) => {
      acc.extend([item.lng, item.lat]);
      return acc;
    }, new mapboxgl.LngLatBounds(focusOnOlongapo ? center : [validFaculty[0].lng, validFaculty[0].lat], focusOnOlongapo ? center : [validFaculty[0].lng, validFaculty[0].lat]));
    map.fitBounds(bounds, {
      padding: compact ? 64 : 96,
      duration: 700,
      maxZoom: compact ? 12.8 : 13.4
    });
  }, [center, faculty, compact, focusOnOlongapo, mapReady, onMarkerSelect, selectedFacultyUserId]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || mapDisposedRef.current || !focusRequest) return;
    const validFaculty = faculty.filter(item => Number.isFinite(item?.lat) && Number.isFinite(item?.lng));
    if (focusOnOlongapo && validFaculty.length) {
      const bounds = validFaculty.reduce((acc, item) => {
        acc.extend([item.lng, item.lat]);
        return acc;
      }, new mapboxgl.LngLatBounds(center, center));
      map.fitBounds(bounds, {
        padding: compact ? 72 : 104,
        duration: 700,
        maxZoom: compact ? 12.8 : 13.4
      });
      return;
    }
    map.easeTo({
      center,
      zoom: compact ? 13 : 13.5,
      duration: 700
    });
  }, [center, compact, faculty, focusOnOlongapo, focusRequest, mapReady]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || mapDisposedRef.current) return;
    const clearSelectedRoute = () => {
      runMapOperation(map, activeMap => {
        if (activeMap.getLayer('hrmu-live-selected-route-line')) activeMap.removeLayer('hrmu-live-selected-route-line');
        if (activeMap.getSource('hrmu-live-selected-route')) activeMap.removeSource('hrmu-live-selected-route');
      });
    };
    const current = selectedFacultyDetail?.latestLocation;
    const target = selectedFacultyDetail?.activeTrip?.destinationCoordinates;
    const savedRouteGeometry = selectedFacultyDetail?.activeTrip?.routeGeometry || selectedFacultyDetail?.routeGeometry || selectedFaculty?.routeGeometry;
    const hasCurrentPoint = Number.isFinite(current?.lng) && Number.isFinite(current?.lat);
    const hasTargetPoint = Number.isFinite(target?.lng) && Number.isFinite(target?.lat);
    let cancelled = false;
    const setRouteGeometry = geometry => {
      if (!geometry || cancelled) return;
      const routeFeature = {
        type: 'Feature',
        properties: {},
        geometry
      };
      const routeRendered = runMapOperation(map, activeMap => {
        if (activeMap.getSource('hrmu-live-selected-route')) {
          activeMap.getSource('hrmu-live-selected-route').setData(routeFeature);
        } else {
          activeMap.addSource('hrmu-live-selected-route', {
            type: 'geojson',
            data: routeFeature
          });
          activeMap.addLayer({
            id: 'hrmu-live-selected-route-line',
            type: 'line',
            source: 'hrmu-live-selected-route',
            layout: {
              'line-cap': 'round',
              'line-join': 'round'
            },
            paint: {
              'line-color': '#049516',
              'line-width': compact ? 4 : 5,
              'line-opacity': 0.85
            }
          });
        }
      });
      if (!routeRendered) return;
      const routeCoordinates = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
      if (routeCoordinates.length > 1) {
        const normalizedCoordinates = routeCoordinates.map(normalizeCoordinate).filter(Boolean);
        if (normalizedCoordinates.length > 1) {
          const bounds = normalizedCoordinates.reduce((acc, coordinate) => acc.extend(coordinate), new mapboxgl.LngLatBounds(normalizedCoordinates[0], normalizedCoordinates[0]));
          runMapOperation(map, activeMap => {
            activeMap.fitBounds(bounds, {
              padding: compact ? 68 : 108,
              duration: 650,
              maxZoom: compact ? 13 : 14
            });
          });
        }
      }
    };
    const normalizeCoordinate = coordinate => {
      if (!coordinate) return null;
      if (Array.isArray(coordinate) && coordinate.length >= 2) {
        const lng = Number(coordinate[0]);
        const lat = Number(coordinate[1]);
        return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
      }
      const lng = Number(coordinate.lng ?? coordinate.longitude ?? coordinate.lon ?? coordinate[0]);
      const lat = Number(coordinate.lat ?? coordinate.latitude ?? coordinate[1]);
      return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
    };
    const normalizeRouteGeometry = value => {
      if (!value) return null;
      let parsedValue = value;
      if (typeof value === 'string') {
        try {
          parsedValue = JSON.parse(value);
        } catch {
          return null;
        }
      }
      if (parsedValue?.type === 'FeatureCollection' && Array.isArray(parsedValue.features)) {
        return normalizeRouteGeometry(parsedValue.features[0]?.geometry || null);
      }
      if (parsedValue?.type === 'Feature' && parsedValue.geometry) {
        return normalizeRouteGeometry(parsedValue.geometry);
      }
      if (Array.isArray(parsedValue)) {
        const coordinates = parsedValue.map(normalizeCoordinate).filter(Boolean);
        return coordinates.length > 1 ? {
          type: 'LineString',
          coordinates
        } : null;
      }
      if (parsedValue?.type === 'LineString' && Array.isArray(parsedValue.coordinates)) {
        const coordinates = parsedValue.coordinates.map(normalizeCoordinate).filter(Boolean);
        return coordinates.length > 1 ? {
          type: 'LineString',
          coordinates
        } : null;
      }
      return null;
    };
    const normalizedSavedRoute = normalizeRouteGeometry(savedRouteGeometry);
    if (normalizedSavedRoute?.coordinates?.length) {
      setRouteGeometry(normalizedSavedRoute);
      return () => {
        cancelled = true;
        clearSelectedRoute();
      };
    }
    if (!hasCurrentPoint || !hasTargetPoint) {
      clearSelectedRoute();
      return;
    }
    const fallbackStraightGeometry = {
      type: 'LineString',
      coordinates: [[Number(current.lng), Number(current.lat)], [Number(target.lng), Number(target.lat)]]
    };
    const loadRoadRoute = async () => {
      try {
        const route = await withFreshAuthPayloadKeyRetry(async () => {
          const encryptedRoadRoutePayload = await encryptSensitivePayload({
            origin: {
              latitude: Number(current.lat),
              longitude: Number(current.lng)
            },
            destination: {
              latitude: Number(target.lat),
              longitude: Number(target.lng)
            },
            profile: 'mapbox/driving-traffic',
            alternatives: false,
            steps: false
          });
          const response = await fetch(`${API_BASE_URL}/api/maps/directions`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(encryptedRoadRoutePayload)
          });
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.message || 'Failed to load the live route.');
          }
          return payload.data;
        });
        const geometry = route?.geometry;
        setRouteGeometry(geometry?.coordinates?.length ? geometry : fallbackStraightGeometry);
      } catch {
        setRouteGeometry(fallbackStraightGeometry);
      }
    };
    loadRoadRoute();
    return () => {
      cancelled = true;
      clearSelectedRoute();
    };
  }, [compact, mapReady, runMapOperation, selectedFaculty, selectedFacultyDetail]);
  return <div className={`hrmu-live-map-frame ${className}`.trim()}>
      <div ref={mapContainerRef} className="hrmu-live-mapbox-canvas" />
      {(!mapReady || mapLoadFailed) && <div className="hrmu-live-map-fallback">
          <strong>{mapLoadFailed ? 'Map failed to load' : 'Map unavailable'}</strong>
          <span>{mapLoadFailed ? 'Check the Mapbox token or connection, then refresh live tracking.' : 'Add a valid Mapbox public token to display live faculty around Olongapo.'}</span>
        </div>}
    </div>;
};
export const REPORT_SEQUENCE_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const HrmuWorkspaceShell = ({
  activeKey = 'dashboard',
  setView,
  profileData,
  onLogout,
  bellActive = false,
  inboxActive = false,
  forceDesktop = false,
  children
}) => {
  const [inboxCount, setInboxCount] = useState(0);
  useEffect(() => {
    let isMounted = true;
    const loadInboxCount = async () => {
      try {
        const data = await getHrmuReportInbox({
          limit: 1
        });
        if (!isMounted) return;
        setInboxCount(Number(data?.total || 0));
      } catch (error) {
        if (isMounted) {
          setInboxCount(0);
        }
      }
    };
    loadInboxCount();
    const intervalId = window.setInterval(loadInboxCount, 20000);
    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);
  const sidebarItems = [{
    key: 'dashboard',
    label: 'Dashboard',
    icon: HrmuSidebarGridIcon,
    target: 'hrmu-dashboard'
  }, {
    key: 'verification',
    label: 'Verification',
    icon: HrmuVerificationIcon,
    target: 'hrmu-verification'
  }, {
    key: 'analytics',
    label: 'Analytics',
    icon: HrmuChartIcon,
    target: 'hrmu-analytics'
  }, {
    key: 'live',
    label: 'Live Tracking',
    icon: HrmuMapRouteIcon,
    target: 'hrmu-live'
  }, {
    key: 'reports',
    label: 'Reports',
    icon: HrmuReportIcon,
    target: 'hrmu-reports'
  }];
  return <div className={`hrmu-workspace ${forceDesktop ? 'force-desktop' : ''}`}>
      <aside className="hrmu-sidebar">
        <div className="hrmu-sidebar-top">
          <div className="hrmu-brand-lockup">
            <div className="hrmu-brand-badge" />
            <div className="hrmu-brand-text">
              <strong>EduRoute</strong>
              <span>HRMU ADMIN</span>
            </div>
          </div>

          <nav className="hrmu-sidebar-nav">
            {sidebarItems.map(item => {
            const Icon = item.icon;
            const isActive = item.key === activeKey;
            return <button key={item.key} type="button" className={`hrmu-nav-item ${isActive ? 'active' : ''}`} onClick={() => item.target && setView(item.target)}>
                  
                  <Icon color={isActive ? 'var(--green)' : '#4B5563'} />
                  <span>{item.label}</span>
                </button>;
          })}
          </nav>
        </div>

        <div className="hrmu-sidebar-bottom">
          <button type="button" className="hrmu-logout-btn" onClick={onLogout}>Log Out</button>
        </div>
      </aside>

      <main className="hrmu-main">
        <header className="hrmu-topbar">
          <span className="hrmu-topbar-logo">EduRoute</span>
          <div className="hrmu-topbar-right">
            <div className={`admin-bell-wrapper hrmu-bell-wrapper ${inboxActive ? 'active' : ''}`} onClick={() => setView('hrmu-inbox')}>
              <InboxArchiveIcon color="var(--text-dark)" />
              {inboxCount > 0 ? <div className="admin-bell-dot" /> : null}
            </div>
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
    </div>;
};
export const HrmuDashboardView = ({
  setView,
  profileData,
  onLogout
}) => {
  const [summary, setSummary] = useState({
    totalFacultyOutside: 0,
    latestActivity: null,
    verifiedLocatorSlips: 0,
    pendingSlips: 0
  });
  const [selectedCollegeFilter, setSelectedCollegeFilter] = useState('all');
  const [recentActivityRows, setRecentActivityRows] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [notificationRows, setNotificationRows] = useState([]);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [liveFacultyRows, setLiveFacultyRows] = useState([]);
  const [liveFacultyLoading, setLiveFacultyLoading] = useState(false);
  const [liveFacultyCenter, setLiveFacultyCenter] = useState(DEFAULT_HRMU_MAP_CENTER);
  const [selectedLiveFacultyUserId, setSelectedLiveFacultyUserId] = useState(null);
  const [selectedLiveFacultyDetail, setSelectedLiveFacultyDetail] = useState(null);
  const formatActivityTime = value => {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('en-US', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };
  const formatNotificationMeta = value => {
    if (!value) return 'Verification time unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Verification time unavailable';
    const now = new Date();
    const sameDay = now.toDateString() === date.toDateString();
    const timePart = date.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    if (sameDay) {
      return `VERIFIED TODAY ${timePart}`;
    }
    const datePart = date.toLocaleDateString('en-US', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    return `VERIFIED ${datePart} ${timePart}`;
  };
  const getInitials = name => {
    if (!name) return 'HR';
    return name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('');
  };
  const mapTripStatus = row => {
    const normalizedDisplayStatus = String(row.displayStatus || '').toUpperCase();
    const normalizedCssuExitStatus = String(row.cssuExitStatus || '').toLowerCase();
    if (normalizedDisplayStatus === 'FLAGGED' || row.isFlagged || row.currentStatusLabel === 'flagged') {
      return {
        label: 'FLAGGED',
        tone: 'red'
      };
    }
    if (normalizedCssuExitStatus === 'denied' || normalizedDisplayStatus === 'REJECTED' || row.currentStatusLabel === 'rejected' || String(row.verificationStatus || '').toLowerCase() === 'rejected') {
      return {
        label: 'REJECTED',
        tone: 'red'
      };
    }
    if (normalizedDisplayStatus === 'PENDING' || normalizedDisplayStatus === 'UNVERIFIED' || row.currentStatusLabel === 'pending' || String(row.verificationStatus || '').toLowerCase() === 'pending') {
      return {
        label: 'PENDING',
        tone: 'yellow'
      };
    }
    if (normalizedDisplayStatus === 'LIVE' || row.currentStatusLabel === 'live' || row.tripStatus === 'active' || row.tripStatus === 'arrived') {
      return {
        label: 'LIVE',
        tone: 'green'
      };
    }
    if (normalizedDisplayStatus === 'RETURNING' || row.currentStatusLabel === 'returning' || row.tripStatus === 'returning') {
      return {
        label: 'RETURNING',
        tone: 'green'
      };
    }
    if (normalizedDisplayStatus === 'COMPLETED' || row.currentStatusLabel === 'completed' || row.tripStatus === 'completed') {
      return {
        label: 'COMPLETED',
        tone: 'green'
      };
    }
    return {
      label: 'UNKNOWN',
      tone: 'yellow'
    };
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
          pendingSlips: Number(data.pendingSlips || data.unverifiedCases || 0)
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
        const data = await getHrmuActiveFaculty();
        if (!isMounted || !data) return;
        setLiveFacultyCenter(data.center || DEFAULT_HRMU_MAP_CENTER);
        setLiveFacultyRows(Array.isArray(data.faculty) ? data.faculty : []);
      } catch (error) {
        if (isMounted) {
          console.error('Failed to load HRMU live faculty:', error);
          setLiveFacultyCenter(DEFAULT_HRMU_MAP_CENTER);
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
    const token = localStorage.getItem('token');
    if (!token) return undefined;
    const socket = createTripSocketClient({
      token
    });
    const handleLiveFacultyUpdate = payload => {
      if (!payload) return;
      if (Array.isArray(payload.faculty)) {
        setLiveFacultyCenter(payload.center || DEFAULT_HRMU_MAP_CENTER);
        setLiveFacultyRows(payload.faculty);
        return;
      }
      setLiveFacultyRows(current => mergeHrmuLiveFacultyRow(current, payload));
    };
    const handleDashboardSummaryUpdate = payload => {
      if (!payload) return;
      setSummary(current => ({
        ...current,
        totalFacultyOutside: Number(payload.totalFacultyOutside ?? current.totalFacultyOutside ?? 0),
        latestActivity: payload.latestActivity ?? current.latestActivity ?? null,
        verifiedLocatorSlips: Number(payload.verifiedLocatorSlips ?? current.verifiedLocatorSlips ?? 0),
        pendingSlips: Number(payload.pendingSlips ?? payload.unverifiedCases ?? current.pendingSlips ?? 0)
      }));
    };
    socket.on('connect', () => {
      socket.emit(HRMU_LIVE_SOCKET_EVENTS.join);
    });
    socket.on(HRMU_LIVE_SOCKET_EVENTS.facultyLocationUpdate, handleLiveFacultyUpdate);
    socket.on('hrmu:dashboard:update', handleDashboardSummaryUpdate);
    socket.connect();
    return () => {
      socket.off(HRMU_LIVE_SOCKET_EVENTS.facultyLocationUpdate, handleLiveFacultyUpdate);
      socket.off('hrmu:dashboard:update', handleDashboardSummaryUpdate);
      socket.disconnect();
    };
  }, []);
  useEffect(() => {
    setSelectedLiveFacultyUserId(current => {
      if (current && liveFacultyRows.some(row => row.facultyUserId === current)) {
        return current;
      }
      return liveFacultyRows[0]?.facultyUserId || null;
    });
  }, [liveFacultyRows]);
  useEffect(() => {
    let isMounted = true;
    const loadSelectedLiveFacultyDetail = async () => {
      if (!selectedLiveFacultyUserId) {
        setSelectedLiveFacultyDetail(null);
        return;
      }
      try {
        const detail = await getHrmuFacultyLiveDetail(selectedLiveFacultyUserId);
        if (!isMounted) return;
        setSelectedLiveFacultyDetail(detail || null);
      } catch (error) {
        if (!isMounted) return;
        console.error('Failed to load HRMU live faculty detail:', error);
        setSelectedLiveFacultyDetail(null);
      }
    };
    loadSelectedLiveFacultyDetail();
    return () => {
      isMounted = false;
    };
  }, [selectedLiveFacultyUserId]);
  useEffect(() => {
    let isMounted = true;
    const loadNotifications = async () => {
      setNotificationLoading(true);
      try {
        const data = await getHrmuNotifications({
          page: 1,
          limit: 2
        });
        if (!isMounted || !data) return;
        const rows = (Array.isArray(data.notifications) ? data.notifications : []).slice().sort((a, b) => {
          const left = new Date(b?.createdAt || b?.approvedAt || 0).getTime();
          const right = new Date(a?.createdAt || a?.approvedAt || 0).getTime();
          return left - right;
        }).slice(0, 2);
        const positiveNotificationTypes = new Set(['hrmu_location_verification_submitted', 'hrmu_locator_slip_approved', 'hrmu_trip_started', 'hrmu_trip_arrived', 'hrmu_trip_completed', 'hrmu_cssu_validated_exit', 'hrmu_verification_review_successful']);
        setNotificationRows(rows.map(notification => {
          const isPositive = positiveNotificationTypes.has(notification.type);
          return {
            id: notification.id,
            title: notification.title || 'HRMU Update',
            body: notification.message || `${notification.facultyName} submitted a trip update.`,
            meta: formatNotificationMeta(notification.createdAt || notification.approvedAt),
            tone: isPositive ? 'green' : 'red',
            icon: isPositive ? <HrmuMiniCheckIcon color="var(--green)" /> : <HrmuWarningIcon color="#C81E1E" />
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
        const filters = {
          page: 1,
          limit: 10
        };
        if (selectedCollegeFilter !== 'all') {
          filters.collegeName = selectedCollegeFilter;
        }
        const data = await getHrmuRecentActivity(filters);
        if (!isMounted || !data) return;
        const rows = Array.isArray(data.activities) ? data.activities : [];
        setRecentActivityRows(rows.map(row => {
          const cssuDenied = String(row.cssuExitStatus || '').toLowerCase() === 'denied';
          const verificationIsVerified = !cssuDenied && ['approved', 'completed'].includes(row.verificationStatus);
          const mappedTripStatus = mapTripStatus(row);
          return {
            key: `${row.locatorSlipId}-${row.tripId || 'na'}`,
            initials: getInitials(row.facultyName),
            name: row.facultyName,
            profileImageUrl: row.facultyProfileImageUrl || null,
            dept: row.collegeName || row.departmentName || 'Unknown college',
            departure: formatActivityTime(row.departureTime),
            returnTime: formatActivityTime(row.expectedReturnTime),
            purpose: row.purpose || 'No purpose provided',
            verification: cssuDenied ? 'DENIED' : verificationIsVerified ? 'VERIFIED' : 'UNVERIFIED',
            verificationTone: verificationIsVerified && !cssuDenied ? 'green' : 'red',
            isFlagged: Boolean(row.isFlagged),
            incidentLabels: Array.isArray(row.incidentLabels) ? row.incidentLabels : [],
            status: mappedTripStatus.label,
            statusTone: mappedTripStatus.tone
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
  const sidebarItems = [{
    key: 'dashboard',
    label: 'Dashboard',
    icon: HrmuSidebarGridIcon,
    active: true
  }, {
    key: 'verification',
    label: 'Verification',
    icon: HrmuVerificationIcon
  }, {
    key: 'analytics',
    label: 'Analytics',
    icon: HrmuChartIcon
  }, {
    key: 'live',
    label: 'Live Tracking',
    icon: HrmuMapRouteIcon
  }, {
    key: 'reports',
    label: 'Reports',
    icon: HrmuReportIcon
  }];
  const stats = [{
    label: 'TOTAL FACULTY ON TRIP',
    value: String(summary.totalFacultyOutside).padStart(2, '0'),
    accent: 'green',
    meta: 'LIVE UPDATE',
    submeta: summary.latestActivity ? `Last activity ${summary.latestActivity}` : 'No active trips'
  }, {
    label: 'VERIFIED LOCATOR SLIPS',
    value: String(summary.verifiedLocatorSlips).padStart(2, '0'),
    accent: 'yellow'
  }, {
    label: 'PENDING SLIPS',
    value: String(summary.pendingSlips).padStart(2, '0'),
    accent: 'red',
    meta: 'NEEDS ATTENTION'
  }];
  const liveMapCenter = useMemo(() => [Number(liveFacultyCenter?.lng || DEFAULT_HRMU_MAP_CENTER.lng), Number(liveFacultyCenter?.lat || DEFAULT_HRMU_MAP_CENTER.lat)], [liveFacultyCenter?.lat, liveFacultyCenter?.lng]);
  const selectedLiveFaculty = useMemo(() => liveFacultyRows.find(row => row.facultyUserId === selectedLiveFacultyUserId) || liveFacultyRows[0] || null, [liveFacultyRows, selectedLiveFacultyUserId]);
  return <HrmuWorkspaceShell activeKey="dashboard" setView={setView} profileData={profileData} onLogout={onLogout}>
      <section className="hrmu-stats-grid">
        {stats.map(stat => <article key={stat.label} className={`hrmu-stat-card ${stat.accent}`}>
            <span className="hrmu-stat-label">{stat.label}</span>
            <strong className="hrmu-stat-value">{stat.value}</strong>
            {stat.meta && <div className="hrmu-stat-meta-row">
                <span className={`hrmu-stat-chip ${stat.accent}`}>{stat.meta}</span>
                {stat.submeta && <small>{stat.submeta}</small>}
              </div>}
          </article>)}
      </section>

      <section className="hrmu-overview-grid">
        <article className="hrmu-route-panel">
          <div className="hrmu-panel-heading">
            <h2>Live Faculty Route</h2>
            <button type="button" onClick={() => setView('hrmu-live')}>↗ View Full Map</button>
          </div>
          <div className="hrmu-map-card">
            <HrmuLiveMapPanel faculty={liveFacultyRows} center={liveMapCenter} focusOnOlongapo compact selectedFacultyUserId={selectedLiveFaculty?.facultyUserId || null} selectedFaculty={selectedLiveFaculty} selectedFacultyDetail={selectedLiveFacultyDetail} onMarkerSelect={faculty => setSelectedLiveFacultyUserId(faculty?.facultyUserId || null)} className="hrmu-dashboard-live-map" />
            
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
            {notificationLoading && <div className="hrmu-notification-empty">Loading verification updates...</div>}
            {!notificationLoading && notificationRows.length === 0 && <div className="hrmu-notification-empty">No verified locator slip notifications yet.</div>}
            {!notificationLoading && notificationRows.map(note => <article key={note.id} className={`hrmu-notification-card ${note.tone}`}>
                <div className="hrmu-notification-icon">{note.icon}</div>
                <div className="hrmu-notification-copy">
                  <h3>{note.title}</h3>
                  <p>{note.body}</p>
                  <span>{note.meta}</span>
                </div>
              </article>)}
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
              <select value={selectedCollegeFilter} onChange={event => setSelectedCollegeFilter(event.target.value)} aria-label="Filter recent activity by college">
                
                {HRMU_COLLEGE_OPTIONS.map(option => <option key={option.value} value={option.value}>
                    {option.label}
                  </option>)}
              </select>
            </label>
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

            {activityLoading && <div className="hrmu-log-empty-state">Loading recent activity...</div>}

            {!activityLoading && recentActivityRows.length === 0 && <div className="hrmu-log-empty-state">No recent activity found for the selected college.</div>}

            {!activityLoading && recentActivityRows.map(row => <div key={row.key} className="hrmu-log-row">
                <div className="hrmu-faculty-cell">
                  {row.profileImageUrl ? <div className="hrmu-faculty-avatar">
                      <img src={row.profileImageUrl} alt={row.name} />
                    </div> : <div className="hrmu-initials-badge">{row.initials}</div>}
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
              </div>)}
          </div>
        </div>
      </section>
    </HrmuWorkspaceShell>;
};
export const HrmuVerificationView = ({
  setView,
  profileData,
  onLogout
}) => {
  const [selectedRegistryRow, setSelectedRegistryRow] = useState(null);
  const [selectedProofDetails, setSelectedProofDetails] = useState(null);
  const [summary, setSummary] = useState({
    completedTrips: 0,
    pendingReviews: 0,
    verificationRate: 0
  });
  const [registryRows, setRegistryRows] = useState([]);
  const [registryDepartmentFilter, setRegistryDepartmentFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewLocked, setReviewLocked] = useState(false);
  const [pathHistoryState, setPathHistoryState] = useState({
    open: false,
    loading: false,
    error: '',
    data: null
  });
  const buildSlipReference = locatorSlipId => {
    const normalized = String(locatorSlipId || '').replace(/-/g, '').slice(0, 8).toUpperCase();
    return normalized ? `LS-${normalized}` : 'Locator Slip';
  };
  const formatRegistryTimeOut = value => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('en-US', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  const loadVerificationPage = useCallback(async ({
    silent = false
  } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const proofData = await getHrmuProofComplianceList();
      const proofs = Array.isArray(proofData?.proofs) ? proofData.proofs : [];
      const mappedRows = proofs.map(row => {
        const normalizedStatus = String(row.verificationStatus || 'submitted').toLowerCase();
        const flaggedReasons = Array.isArray(row.flaggedReasons) ? row.flaggedReasons : [];
        const isLateReturn = flaggedReasons.includes('Late Return');
        const isUnverified = flaggedReasons.includes('Unverified Location/Signature') || normalizedStatus === 'rejected';
        const collegeName = row.collegeName || 'Unknown college';
        const facultyName = row.facultyName || 'Faculty member';
        return {
          key: row.id,
          proofId: row.id,
          tripId: row.tripId,
          locatorSlipId: row.locatorSlipId,
          name: facultyName,
          profileImageUrl: row.profileImageUrl || null,
          id: row.facultyId || row.facultyUserId || 'N/A',
          department: collegeName,
          roleLine: `Faculty - ${collegeName}`,
          destination: row.destination || 'No destination provided.',
          status: isLateReturn ? 'LATE RETURN' : isUnverified ? 'UNVERIFIED LOCATION/SIGNATURE' : normalizedStatus === 'verified' ? 'SUCCESSFUL' : 'PENDING',
          statusTone: isLateReturn || isUnverified ? 'red' : normalizedStatus === 'verified' ? 'green' : 'yellow',
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
          departureTime: row.departureTime || null,
          expectedReturnTime: row.expectedReturnTime || null,
          actualReturnTime: row.actualReturnTime || null,
          flaggedReasons,
          flaggedIncidentTypes: Array.isArray(row.flaggedIncidentTypes) ? row.flaggedIncidentTypes : [],
          isLateReturn,
          purpose: row.purpose || 'Official travel',
          timeOut: formatRegistryTimeOut(row.departureTime || row.tripStartedAt || row.submittedAt)
        };
      });
      const successfulTrips = mappedRows.filter(row => row.status === 'SUCCESSFUL').length;
      const pendingReviews = mappedRows.filter(row => row.status === 'PENDING').length;
      setRegistryRows(mappedRows);
      const pendingVerificationTarget = (() => {
        try {
          const rawTarget = window.localStorage.getItem(HRMU_PENDING_VERIFICATION_TARGET_KEY);
          return rawTarget ? JSON.parse(rawTarget) : null;
        } catch (error) {
          return null;
        }
      })();
      if (pendingVerificationTarget?.locatorSlipId || pendingVerificationTarget?.proofId || pendingVerificationTarget?.tripId) {
        const targetRow = mappedRows.find(row => {
          const targetLocatorSlipId = String(pendingVerificationTarget.locatorSlipId || '');
          const targetProofId = String(pendingVerificationTarget.proofId || '');
          const targetTripId = String(pendingVerificationTarget.tripId || '');
          return targetLocatorSlipId && String(row.locatorSlipId || '') === targetLocatorSlipId || targetProofId && String(row.proofId || '') === targetProofId || targetTripId && String(row.tripId || '') === targetTripId;
        });
        window.localStorage.removeItem(HRMU_PENDING_VERIFICATION_TARGET_KEY);
        if (targetRow) {
          setReviewLocked(false);
          setReviewMessage('');
          setSelectedRegistryRow(targetRow);
          setSelectedProofDetails(null);
          getHrmuProofComplianceDetails(targetRow.proofId).then(details => {
            setSelectedProofDetails(details);
          }).catch(error => {
            setReviewMessage(error.message || 'Failed to load proof details.');
          });
        }
      }
      setSummary({
        completedTrips: mappedRows.length,
        pendingReviews,
        verificationRate: mappedRows.length ? successfulTrips / mappedRows.length * 100 : 0
      });
      setSelectedRegistryRow(current => {
        if (!current) return null;
        return mappedRows.find(row => row.key === current.key) || null;
      });
    } catch (error) {
      console.error('Failed to load HRMU verification registry:', error);
      setRegistryRows([]);
      setSelectedRegistryRow(null);
      setSelectedProofDetails(null);
      setSummary({
        completedTrips: 0,
        pendingReviews: 0,
        verificationRate: 0
      });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let isMounted = true;
    const safeLoad = async ({
      silent = false
    } = {}) => {
      if (!isMounted) return;
      await loadVerificationPage({
        silent
      });
    };
    safeLoad();
    const intervalId = window.setInterval(() => safeLoad({
      silent: true
    }), 15000);
    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [loadVerificationPage]);
  const filteredRegistryRows = useMemo(() => {
    if (registryDepartmentFilter === 'all') return registryRows;
    return registryRows.filter(row => String(row.department || '') === registryDepartmentFilter);
  }, [registryRows, registryDepartmentFilter]);
  const verificationStats = [{
    label: 'COMPLETED TRIPS',
    value: String(summary.completedTrips).padStart(2, '0'),
    tone: 'green',
    decorate: true
  }, {
    label: 'PENDING REVIEWS',
    value: String(summary.pendingReviews).padStart(2, '0'),
    tone: 'neutral'
  }];
  const handleProofReview = async nextStatus => {
    if (!selectedRegistryRow?.proofId) {
      setReviewMessage('No uploaded proof is available to review for this trip.');
      return;
    }
    try {
      setReviewing(true);
      setReviewMessage('');
      const result = await reviewHrmuProofCompliance(selectedRegistryRow.proofId, {
        verificationStatus: nextStatus
      });
      setReviewMessage(nextStatus === 'verified' ? 'Trip marked as successful.' : 'Trip flagged as unverified location/signature.');
      setReviewLocked(true);
      setSelectedProofDetails(result);
      await loadVerificationPage({
        silent: true
      });
    } catch (error) {
      setReviewMessage(error.message || 'Verification review could not be saved.');
    } finally {
      setReviewing(false);
    }
  };
  const openRegistryRow = async row => {
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
    setPathHistoryState({
      open: false,
      loading: false,
      error: '',
      data: null
    });
  };
  const openHrmuPathHistory = async tripId => {
    if (!tripId) {
      setReviewMessage('No trip path is linked to this registry entry yet.');
      return;
    }
    setPathHistoryState({
      open: true,
      loading: true,
      error: '',
      data: null
    });
    try {
      const data = await getHrmuTripPathHistory(tripId);
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
  return <HrmuWorkspaceShell activeKey="verification" setView={setView} profileData={profileData} onLogout={onLogout}>
      <section className="hrmu-verification-hero">
        <span className="hrmu-verification-eyebrow">ACADEMIC LOGISTICS</span>
        <h1>External Faculty Verification</h1>
        <p>Review completed trips, inspect the submitted proof of compliance, and decide whether each trip remains successful or should be flagged as an unverified location/signature.</p>
      </section>

      <section className="hrmu-verification-stats">
        {verificationStats.map(card => <article key={card.label} className={`hrmu-verify-stat-card ${card.tone}`}>
            <span className="hrmu-verify-stat-label">{card.label}</span>
            <strong className="hrmu-verify-stat-value">{card.value}</strong>
            {card.decorate && <div className="hrmu-verify-card-mark" aria-hidden="true" />}
          </article>)}
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
          <div className="hrmu-verify-registry-tools">
            <label className="hrmu-filter-control hrmu-verify-department-filter">
              <HrmuFilterIcon />
              <select value={registryDepartmentFilter} onChange={event => setRegistryDepartmentFilter(event.target.value)}>
                {HRMU_COLLEGE_OPTIONS.map(option => <option key={option.value} value={option.value}>
                    {option.label}
                  </option>)}
              </select>
            </label>
          </div>
        </div>

        <ProofComplianceList rows={filteredRegistryRows} loading={loading} onOpen={openRegistryRow} />

        <button type="button" className="hrmu-verify-footer-link">
          View All {filteredRegistryRows.length} Submitted Proofs
        </button>
      </section>

      {selectedRegistryRow && <ProofComplianceDetails row={selectedRegistryRow} details={selectedProofDetails} reviewMessage={reviewMessage} reviewing={reviewing} reviewLocked={reviewLocked || Boolean(selectedProofDetails?.isLateReturn || selectedRegistryRow?.isLateReturn) || String(selectedProofDetails?.verificationStatus || selectedRegistryRow?.verificationStatus || '').toLowerCase() !== 'submitted'} onClose={closeRegistryRow} onReview={handleProofReview} onViewPathHistory={() => openHrmuPathHistory(selectedRegistryRow.tripId)} />}

      {pathHistoryState.open && <TripPathHistoryModal history={pathHistoryState.data} loading={pathHistoryState.loading} error={pathHistoryState.error} onClose={() => setPathHistoryState({
      open: false,
      loading: false,
      error: '',
      data: null
    })} />}
    </HrmuWorkspaceShell>;
};
export const HrmuAnalyticsReportsView = ({
  setView,
  profileData,
  onLogout,
  activeKey = 'analytics'
}) => {
  const analyticsExportRef = useRef(null);
  const {
    filters,
    appliedFilters,
    analytics,
    loading,
    exporting,
    smartGenerating,
    error,
    exportMessage,
    departmentOptions,
    updateFilter,
    applyFilters,
    exportPdf
  } = useHrmuAnalytics();
  const analyticsStartDateInputRef = useRef(null);
  const analyticsEndDateInputRef = useRef(null);
  const formatAnalyticsFilterDate = value => {
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
  const openAnalyticsDatePicker = inputRef => {
    const input = inputRef?.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    } else {
      input.focus();
      input.click();
    }
  };
  const numberFormatter = new Intl.NumberFormat('en-PH');
  const percentFormatter = new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  });
  const decimalFormatter = new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  });
  const dailyMovementItems = Array.isArray(analytics?.dailyFacultyMovement?.items) ? analytics.dailyFacultyMovement.items : [];
  const weeklyMovementTrend = (() => {
    const startDate = analytics?.dateRange?.startDate ? new Date(`${analytics.dateRange.startDate}T00:00:00`) : null;
    const endDate = analytics?.dateRange?.endDate ? new Date(`${analytics.dateRange.endDate}T00:00:00`) : null;
    if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return {
        labels: ['Week 1'],
        values: [dailyMovementItems.reduce((sum, item) => sum + Number(item.locatorSlipCount || 0), 0)]
      };
    }
    const totalDays = Math.max(1, Math.floor((endDate - startDate) / 86400000) + 1);
    const weekCount = Math.max(1, Math.ceil(totalDays / 7));
    const values = Array.from({
      length: weekCount
    }, () => 0);
    dailyMovementItems.forEach(item => {
      const itemDate = item.date ? new Date(`${String(item.date).slice(0, 10)}T00:00:00`) : null;
      if (!itemDate || Number.isNaN(itemDate.getTime())) return;
      const dayOffset = Math.floor((itemDate - startDate) / 86400000);
      if (dayOffset < 0 || dayOffset >= totalDays) return;
      const weekIndex = Math.min(Math.floor(dayOffset / 7), weekCount - 1);
      values[weekIndex] += Number(item.locatorSlipCount || 0);
    });
    return {
      labels: values.map((_, index) => `Week ${index + 1}`),
      values
    };
  })();
  const chartLabels = weeklyMovementTrend.labels;
  const chartValues = weeklyMovementTrend.values;
  const maxChartValue = chartValues.length ? Math.max(...chartValues, 0) : 0;
  const approvalRate = analytics?.approvalRate || {};
  const frequentDestinations = analytics?.frequentDestinations || [];
  const monthlySummary = analytics?.monthlyPerformanceSummary || {};
  const approvalRatePercentage = Math.min(Math.max(Number(approvalRate.percentage || 0), 0), 100);
  const smartAnalytics = analytics?.smartAnalytics || {};
  const smartSummary = smartAnalytics?.summary || {};
  const smartHighRiskTrips = Array.isArray(smartAnalytics?.highRiskTrips) ? smartAnalytics.highRiskTrips : [];
  const smartIncidents = Array.isArray(smartAnalytics?.incidents) ? smartAnalytics.incidents : [];
  const smartCollegeSummary = Array.isArray(smartAnalytics?.collegeSummary) ? smartAnalytics.collegeSummary : [];
  const lateReturnPredictions = Array.isArray(smartAnalytics?.lateReturnPredictions) ? smartAnalytics.lateReturnPredictions : [];
  const routeDeviationDetections = Array.isArray(smartAnalytics?.routeDeviationDetections) ? smartAnalytics.routeDeviationDetections : [];
  const repeatIncidents = Array.isArray(smartAnalytics?.repeatIncidents) ? smartAnalytics.repeatIncidents : [];
  const peakMovementHeatmap = smartAnalytics?.peakMovementHeatmap || {};
  const collegeRiskScores = Array.isArray(smartAnalytics?.collegeRiskScores) ? smartAnalytics.collegeRiskScores : [];
  const trendComparison = Array.isArray(smartAnalytics?.trendComparison) ? smartAnalytics.trendComparison : [];
  const recommendations = Array.isArray(smartAnalytics?.recommendations) ? smartAnalytics.recommendations : [];
  const selectedCollegeLabel = departmentOptions.find(option => option.value === String(filters.collegeName || ''))?.label || 'All Departments';
  const weeklyDirectionLabel = approvalRate.weeklyChangeDirection === 'decrease' ? 'decrease' : approvalRate.weeklyChangeDirection === 'increase' ? 'increase' : 'no change';
  const weeklyDirectionSymbol = approvalRate.weeklyChangeDirection === 'decrease' ? 'v' : approvalRate.weeklyChangeDirection === 'increase' ? '^' : '-';
  const tripsDirectionSymbol = monthlySummary.tripsMonthOverMonthDirection === 'decrease' ? 'v' : monthlySummary.tripsMonthOverMonthDirection === 'increase' ? '^' : '-';
  const summaryCards = [{
    label: 'TOTAL TRIPS',
    value: numberFormatter.format(monthlySummary.totalTripsCompleted || 0),
    note: `${tripsDirectionSymbol} ${percentFormatter.format(monthlySummary.tripsMonthOverMonthPercent || 0)}% MoM`,
    tone: 'green'
  }, {
    label: 'AVG. DISTANCE',
    value: `${decimalFormatter.format(monthlySummary.averageDistanceKm || 0)} km`,
    note: monthlySummary.averageDistanceLabel || 'Optimized',
    tone: 'yellow'
  }, {
    label: 'USERS',
    value: numberFormatter.format(monthlySummary.uniqueUsersCompletedTrips || 0),
    note: `${percentFormatter.format(monthlySummary.engagementRatePercent || 0)}% Engaged`,
    tone: 'green'
  }, {
    label: 'PEAK HOUR',
    value: monthlySummary.peakHour || '--',
    note: monthlySummary.peakHourLabel || 'No peak hour',
    tone: 'dark'
  }];
  const handleExportPdf = async () => {
    try {
      await exportPdf({
        element: analyticsExportRef.current
      });
    } catch (requestError) {
      console.error('PDF export failed:', requestError);
    }
  };
  const smartTotalTrips = Number(smartSummary.totalFiled || smartSummary.totalTripsThisMonth || 0);
  const smartCompletedTrips = Number(smartSummary.completedTrips || 0);
  const smartRejectedTrips = Number(smartSummary.rejectedCount || 0);
  const smartCancelledTrips = Number(smartSummary.cancelledCount || 0);
  const smartIncidentBars = [{
    label: 'Disconnected Tracking',
    value: Number(smartSummary.disconnectedTracking || 0),
    tone: 'yellow'
  }, {
    label: 'Missing Proof',
    value: Number(smartSummary.missingProof || 0),
    tone: 'red'
  }, {
    label: 'High-Risk Active Trips',
    value: Number(smartSummary.highRiskTrips || 0),
    tone: 'red'
  }];
  const smartTripDistribution = [{
    label: 'Completed',
    value: smartCompletedTrips,
    tone: 'green'
  }, {
    label: 'Rejected',
    value: smartRejectedTrips,
    tone: 'red'
  }, {
    label: 'Cancelled',
    value: smartCancelledTrips,
    tone: 'gray'
  }];
  const completedTripPct = smartTotalTrips > 0 ? smartCompletedTrips / smartTotalTrips * 100 : 0;
  const rejectedTripPct = smartTotalTrips > 0 ? smartRejectedTrips / smartTotalTrips * 100 : 0;
  const cancelledTripPct = smartTotalTrips > 0 ? smartCancelledTrips / smartTotalTrips * 100 : 0;
  const donutRadius = 58;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const tripDonutSegments = [{
    label: 'Completed',
    value: completedTripPct,
    color: '#0A8F19'
  }, {
    label: 'Rejected',
    value: rejectedTripPct,
    color: '#DC2626'
  }, {
    label: 'Cancelled',
    value: cancelledTripPct,
    color: '#6B7280'
  }].filter(segment => segment.value > 0);
  let tripDonutOffset = 0;
  const approvalRingRadius = 72;
  const approvalRingCircumference = 2 * Math.PI * approvalRingRadius;
  const approvalStrokeLength = approvalRatePercentage / 100 * approvalRingCircumference;
  const maxSmartIncidentCount = Math.max(...smartIncidentBars.map(item => item.value), 1);
  const maxCollegeTripCount = Math.max(...smartCollegeSummary.map(college => Number(college.tripCount || 0)), 1);
  const uniqueSmartIncidents = Array.from(smartIncidents.reduce((incidentMap, incident, index) => {
    const keyParts = [String(incident.type || '').trim().toLowerCase(), String(incident.facultyName || '').trim().toLowerCase(), String(incident.destination || '').trim().toLowerCase()];
    const key = keyParts.some(Boolean) ? keyParts.join('|') : `incident-${index}`;
    if (!incidentMap.has(key)) {
      incidentMap.set(key, incident);
    }
    return incidentMap;
  }, new Map()).values());
  const smartLabelRows = [{
    label: 'Most Visited Destination',
    value: smartSummary.mostVisitedDestination || '--'
  }, {
    label: 'College With Most Trips',
    value: smartSummary.collegeWithMostTrips || '--'
  }, {
    label: 'Predicted Late Returns',
    value: numberFormatter.format(smartSummary.predictedLateReturns || 0)
  }, {
    label: 'Route Deviations',
    value: numberFormatter.format(smartSummary.routeDeviations || 0)
  }, {
    label: 'Filed Locator Slips',
    value: numberFormatter.format(smartSummary.totalFiled || 0)
  }, {
    label: 'Approved vs Rejected',
    value: `${numberFormatter.format(smartSummary.approvedCount || 0)} approved / ${numberFormatter.format(smartSummary.rejectedCount || 0)} rejected`
  }];
  const heatmapRows = Array.isArray(peakMovementHeatmap.matrix) ? peakMovementHeatmap.matrix : [];
  const heatmapMax = Math.max(Number(peakMovementHeatmap.maxCount || 0), 1);
  const topRouteDeviations = routeDeviationDetections.filter(row => row.status === 'Deviated').slice(0, 5);
  const topCollegeRiskScores = collegeRiskScores.slice(0, 5);
  const topTrendRows = trendComparison.slice(0, 5);
  const calendarStartDate = analytics?.dateRange?.startDate ? new Date(`${analytics.dateRange.startDate}T00:00:00`) : null;
  const calendarEndDate = analytics?.dateRange?.endDate ? new Date(`${analytics.dateRange.endDate}T00:00:00`) : null;
  const calendarTripCountByDate = dailyMovementItems.reduce((counts, item) => {
    counts[String(item.date).slice(0, 10)] = Number(item.locatorSlipCount || 0);
    return counts;
  }, {});
  const calendarDays = (() => {
    if (!calendarStartDate || !calendarEndDate || Number.isNaN(calendarStartDate.getTime()) || Number.isNaN(calendarEndDate.getTime())) {
      return [];
    }
    const days = [];
    const firstDayOffset = calendarStartDate.getDay();
    const previousMonthDate = new Date(calendarStartDate);
    previousMonthDate.setDate(calendarStartDate.getDate() - firstDayOffset);
    for (let index = 0; index < firstDayOffset; index += 1) {
      const day = new Date(previousMonthDate);
      day.setDate(previousMonthDate.getDate() + index);
      days.push({
        date: day,
        count: 0,
        inMonth: false
      });
    }
    for (let date = new Date(calendarStartDate); date <= calendarEndDate; date.setDate(date.getDate() + 1)) {
      const key = date.toISOString().slice(0, 10);
      days.push({
        date: new Date(date),
        count: calendarTripCountByDate[key] || 0,
        inMonth: true
      });
    }
    while (days.length % 7 !== 0) {
      const nextDate = new Date(days[days.length - 1]?.date || calendarEndDate);
      nextDate.setDate(nextDate.getDate() + 1);
      days.push({
        date: nextDate,
        count: 0,
        inMonth: false
      });
    }
    return days;
  })();
  const maxCalendarTripCount = Math.max(...calendarDays.map(day => Number(day.count || 0)), 1);
  const calendarMonthLabel = calendarStartDate && !Number.isNaN(calendarStartDate.getTime()) ? calendarStartDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  }) : analytics?.dateRange?.label || 'Selected Month';
  const formatAnalyticsDateTime = value => {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  return <HrmuWorkspaceShell activeKey={activeKey} setView={setView} profileData={profileData} onLogout={onLogout}>
      <div ref={analyticsExportRef} className="hrmu-analytics-export-surface">
        <section className="hrmu-analytics-hero">
          <div className="hrmu-analytics-copy">
            <h1>Analytics &amp; Reporting</h1>
            <p>Advanced insights into faculty movement and departmental flow across campus transit routes.</p>
          </div>
          <div className="hrmu-analytics-actions" data-html2canvas-ignore="true">
            <button type="button" className="hrmu-analytics-export primary" onClick={handleExportPdf} disabled={exporting}>
              <HrmuReportIcon color="white" />
              <span>{exporting ? 'Exporting...' : 'Export PDF'}</span>
            </button>
          </div>
        </section>

        <section className="hrmu-analytics-filter-card">
          <div className="hrmu-analytics-filter-group">
            <span>START DATE</span>
            <button type="button" className="hrmu-analytics-date-toggle" onClick={() => openAnalyticsDatePicker(analyticsStartDateInputRef)}>
              <ClockIcon color="var(--green)" />
              <span>{formatAnalyticsFilterDate(filters.startDate)}</span>
            </button>
            <input ref={analyticsStartDateInputRef} type="date" className="hrmu-analytics-date-native" value={filters.startDate} onChange={event => updateFilter('startDate', event.target.value)} aria-label="Analytics start date" />
            
          </div>
          <div className="hrmu-analytics-filter-group">
            <span>END DATE</span>
            <button type="button" className="hrmu-analytics-date-toggle" onClick={() => openAnalyticsDatePicker(analyticsEndDateInputRef)}>
              <ClockIcon color="var(--green)" />
              <span>{formatAnalyticsFilterDate(filters.endDate)}</span>
            </button>
            <input ref={analyticsEndDateInputRef} type="date" className="hrmu-analytics-date-native" value={filters.endDate} onChange={event => updateFilter('endDate', event.target.value)} aria-label="Analytics end date" />
            
          </div>
          <div className="hrmu-analytics-filter-group">
            <span>DEPARTMENT</span>
            <select className="hrmu-analytics-select hrmu-analytics-select-input" value={filters.collegeName} onChange={event => updateFilter('collegeName', event.target.value)}>
              
              {departmentOptions.map(option => <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>)}
            </select>
          </div>
          <button type="button" className="hrmu-analytics-apply-btn" onClick={applyFilters} disabled={loading || smartGenerating}>
            {smartGenerating ? 'Generating...' : 'Generate Analytics'}
          </button>
        </section>

        {(error || exportMessage) && <div className="hrmu-analytics-feedback" data-html2canvas-ignore="true">
            {error ? <span>{error}</span> : null}
            {exportMessage ? <span>{exportMessage}</span> : null}
          </div>}

        <section className="hrmu-analytics-overview-grid">
          <article className="hrmu-smart-panel hrmu-smart-chart-panel">
            <div className="hrmu-smart-panel-title compact">
              <h3>Trip Distribution</h3>
              <span>{numberFormatter.format(smartTotalTrips)} total</span>
            </div>
            <div className="hrmu-smart-donut-row">
              <div className={`hrmu-smart-donut ${smartTotalTrips > 0 ? '' : 'empty'}`}>
                <svg className="hrmu-smart-donut-svg" viewBox="0 0 150 150" aria-hidden="true">
                  <circle cx="75" cy="75" r={donutRadius} className="hrmu-smart-donut-track" />
                  {smartTotalTrips > 0 ? tripDonutSegments.map(segment => {
                  const dashLength = segment.value / 100 * donutCircumference;
                  const dashOffset = -tripDonutOffset;
                  tripDonutOffset += dashLength;
                  return <circle key={segment.label} cx="75" cy="75" r={donutRadius} className="hrmu-smart-donut-progress" stroke={segment.color} strokeDasharray={`${dashLength} ${donutCircumference - dashLength}`} strokeDashoffset={dashOffset} />;
                }) : null}
                </svg>
                <div>
                  <strong>{numberFormatter.format(smartTotalTrips)}</strong>
                  <span>Trips</span>
                </div>
              </div>
              <div className="hrmu-smart-donut-legend">
                {smartTripDistribution.map(item => <div key={item.label} className="hrmu-smart-donut-legend-row">
                    <span className={item.tone} />
                    <strong>{item.label}</strong>
                    <em>{numberFormatter.format(item.value)}</em>
                  </div>)}
              </div>
            </div>
            <div className="hrmu-smart-metric-strip compact">
              <div>
                <span>Late Returns</span>
                <strong>{numberFormatter.format(smartSummary.lateReturns || 0)}</strong>
              </div>
              <div>
                <span>Filed Slips</span>
                <strong>{numberFormatter.format(smartSummary.totalFiled || 0)}</strong>
              </div>
            </div>
          </article>

          <article className="hrmu-analytics-rate-card">
            <h2>Approval Rate</h2>
            <p>Request vs Approval efficiency</p>
            <div className="hrmu-analytics-ring">
              <svg className="hrmu-analytics-ring-svg" viewBox="0 0 180 180" aria-hidden="true">
                <circle cx="90" cy="90" r={approvalRingRadius} className="hrmu-analytics-ring-track" />
                <circle cx="90" cy="90" r={approvalRingRadius} className="hrmu-analytics-ring-progress" strokeDasharray={`${approvalStrokeLength} ${approvalRingCircumference - approvalStrokeLength}`} />
                
              </svg>
              <div>
                <strong>{percentFormatter.format(approvalRatePercentage)}%</strong>
                <span>{approvalRatePercentage >= 50 ? 'SUCCESS' : 'IN REVIEW'}</span>
              </div>
            </div>
            <div className="hrmu-analytics-growth">
              {`${weeklyDirectionSymbol} ${percentFormatter.format(approvalRate.weeklyChangePercent || 0)}% ${weeklyDirectionLabel} from last period`}
            </div>
            <small className="hrmu-analytics-rate-meta">
              {`${numberFormatter.format(approvalRate.approvedCount || 0)} approved / ${numberFormatter.format(approvalRate.totalFiledCount || 0)} filed`}
            </small>
          </article>

          <article className="hrmu-analytics-summary-card">
            <h2>Monthly Performance Summary</h2>
            <div className="hrmu-analytics-summary-grid compact">
              {summaryCards.map(card => <div key={card.label} className={`hrmu-analytics-mini-card ${card.tone}`}>
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                  <small>{card.note}</small>
                </div>)}
            </div>
          </article>
        </section>

        <section className="hrmu-smart-analytics-section">
          <div className="hrmu-smart-analytics-head">
            <div>
              <span>SMART HRMU MONITORING</span>
              <h2>AI Analytics Dashboard</h2>
              <p>Rule-based monitoring for active trips, return risks, tracking gaps, and proof compliance.</p>
            </div>
          </div>

          <div className="hrmu-smart-visual-grid">
            <article className="hrmu-smart-panel hrmu-smart-chart-panel">
              <div className="hrmu-smart-panel-title compact">
                <h3>Monitoring Flags</h3>
                <span>{numberFormatter.format(smartIncidentBars.reduce((sum, item) => sum + item.value, 0))} signals</span>
              </div>
              <div className="hrmu-smart-histogram" aria-label="Monitoring flags histogram">
                {smartIncidentBars.map(item => {
                const height = `${Math.max(item.value / maxSmartIncidentCount * 100, item.value > 0 ? 16 : 5)}%`;
                return <div key={item.label} className="hrmu-smart-histogram-col">
                      <strong>{numberFormatter.format(item.value)}</strong>
                      <div className="hrmu-smart-histogram-track">
                        <div className={`hrmu-smart-histogram-fill ${item.tone}`} style={{
                      height
                    }} />
                      </div>
                      <span>{item.label}</span>
                    </div>;
              })}
              </div>
            </article>

            <article className="hrmu-smart-panel hrmu-smart-chart-panel">
              <div className="hrmu-smart-panel-title compact">
                <h3>Movement Labels</h3>
                <span>{selectedCollegeLabel}</span>
              </div>
              <div className="hrmu-smart-label-table">
                {smartLabelRows.map(row => <div key={row.label} className="hrmu-smart-label-row">
                    <span>{row.label}</span>
                    <strong title={String(row.value)}>{row.value}</strong>
                  </div>)}
              </div>
            </article>
          </div>

          <div className="hrmu-smart-layout secondary">
            <article className="hrmu-smart-panel">
              <div className="hrmu-smart-panel-title">
                <h3>Late Return Prediction</h3>
                <span>{numberFormatter.format(lateReturnPredictions.length)} predicted</span>
              </div>
              <div className="hrmu-smart-prediction-list">
                {lateReturnPredictions.length ? lateReturnPredictions.slice(0, 4).map(trip => <div key={`late-${trip.tripId}`} className="hrmu-smart-prediction-item">
                    <div>
                      <strong>{trip.facultyName}</strong>
                      <span>{trip.destination} • {trip.minutesUntilReturn === null ? 'No expected return' : `${trip.minutesUntilReturn} mins before expected return`}</span>
                    </div>
                    <em className={String(trip.predictionLevel || '').toLowerCase()}>
                      {numberFormatter.format(trip.predictionScore || 0)}%
                    </em>
                  </div>) : <div className="hrmu-smart-empty small">No active trip is predicted to return late yet.</div>}
              </div>
            </article>

            <article className="hrmu-smart-panel">
              <div className="hrmu-smart-panel-title">
                <h3>Route Deviation Detection</h3>
                <span>{numberFormatter.format(topRouteDeviations.length)} deviated</span>
              </div>
              <div className="hrmu-smart-compact-list">
                {topRouteDeviations.length ? topRouteDeviations.map(trip => <div key={`deviation-${trip.tripId}`} className="hrmu-smart-compact-row">
                    <div>
                      <strong>{trip.facultyName}</strong>
                      <span>{trip.destination}</span>
                    </div>
                    <b>{decimalFormatter.format(trip.maxDeviationKm || 0)} km</b>
                  </div>) : <div className="hrmu-smart-empty small">No route deviation was detected from saved GPS paths.</div>}
              </div>
            </article>
          </div>

          <div className="hrmu-smart-layout">
            <article className="hrmu-smart-panel hrmu-smart-risk-panel">
              <div className="hrmu-smart-panel-title">
                <h3>High-Risk Active Trips</h3>
                <span>{numberFormatter.format(smartHighRiskTrips.filter(trip => trip.riskLevel === 'High').length)} high risk</span>
              </div>
              <div className="hrmu-smart-table-wrap">
                <table className="hrmu-smart-table">
                  <thead>
                    <tr>
                      <th>Faculty</th>
                      <th>College</th>
                      <th>Destination</th>
                      <th>Expected Return</th>
                      <th>Last Update</th>
                      <th>Risk</th>
                      <th>Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {smartHighRiskTrips.length ? smartHighRiskTrips.slice(0, 8).map(trip => <tr key={trip.tripId}>
                          <td>{trip.facultyName}</td>
                          <td>{trip.collegeName}</td>
                          <td>{trip.destination}</td>
                          <td>{formatAnalyticsDateTime(trip.expectedReturnTime)}</td>
                          <td>{formatAnalyticsDateTime(trip.lastLocationAt)}</td>
                          <td>
                            <span className={`hrmu-smart-risk-pill ${String(trip.riskLevel || '').toLowerCase()}`}>
                              {trip.riskLevel} {numberFormatter.format(trip.riskScore || 0)}
                            </span>
                          </td>
                          <td>{(trip.reasons || []).join('; ') || 'No risk reasons detected'}</td>
                        </tr>) : <tr>
                        <td colSpan="7" className="hrmu-smart-empty">No active trips currently require elevated HRMU attention.</td>
                      </tr>}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="hrmu-smart-panel">
              <div className="hrmu-smart-panel-title">
                <h3>Generated HRMU Summary</h3>
                <span>{smartAnalytics.generatedAt ? formatAnalyticsDateTime(smartAnalytics.generatedAt) : 'Live preview'}</span>
              </div>
              <p className="hrmu-smart-summary-text">
                {smartAnalytics.generatedSummary || 'Smart summary will appear once analytics data is available.'}
              </p>
              <div className="hrmu-smart-mini-list">
                <h4>Recommendations</h4>
                {recommendations.length ? recommendations.slice(0, 4).map(recommendation => <div key={recommendation} className="hrmu-smart-recommendation-item">
                    {recommendation}
                  </div>) : <div className="hrmu-smart-empty small">Recommendations will appear once analytics data is available.</div>}
              </div>
              <div className="hrmu-smart-mini-list">
                <h4>Incident Signals</h4>
                {uniqueSmartIncidents.length ? uniqueSmartIncidents.slice(0, 5).map((incident, index) => <div key={`${incident.tripId || index}-${incident.type}`} className="hrmu-smart-incident-item">
                    <strong>{incident.type}</strong>
                    <span>{incident.facultyName || 'Faculty user'} - {incident.destination || 'Destination unavailable'}</span>
                  </div>) : <div className="hrmu-smart-empty small">No incident signals found for this period.</div>}
              </div>
            </article>
          </div>

          <div className="hrmu-smart-layout secondary">
            <article className="hrmu-smart-panel">
              <div className="hrmu-smart-panel-title">
                <h3>Calendar Trip Heatmap</h3>
                <span>{calendarMonthLabel}</span>
              </div>
              {calendarDays.length ? <div className="hrmu-smart-calendar-heatmap" aria-label={`Trip counts calendar heatmap for ${calendarMonthLabel}`}>
                  <div className="hrmu-smart-calendar-weekdays">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(dayLabel => <strong key={dayLabel}>{dayLabel}</strong>)}
                  </div>
                  <div className="hrmu-smart-calendar-grid">
                    {calendarDays.map(day => {
                  const intensity = day.inMonth ? Number(day.count || 0) / maxCalendarTripCount : 0;
                  return <div key={day.date.toISOString()} className={`hrmu-smart-calendar-day ${day.inMonth ? '' : 'outside'}`} style={day.inMonth ? {
                    '--calendar-intensity': intensity
                  } : undefined} title={`${day.date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                  })}: ${numberFormatter.format(day.count || 0)} trips`}>
                        
                          <span>{day.date.getDate()}</span>
                          {day.inMonth && day.count > 0 ? <em>{numberFormatter.format(day.count)}</em> : null}
                        </div>;
                })}
                  </div>
                </div> : <div className="hrmu-smart-empty small">No calendar trip data is available for this period.</div>}
            </article>

            <article className="hrmu-smart-panel">
              <div className="hrmu-smart-panel-title">
                <h3>Peak Movement Heatmap</h3>
                <span>{peakMovementHeatmap.peak?.count ? `${peakMovementHeatmap.peak.dayLabel} peak` : 'No peak'}</span>
              </div>
              {heatmapRows.length ? <div className="hrmu-smart-heatmap">
                  <div className="hrmu-smart-heatmap-header" aria-hidden="true">
                    <span />
                    <div>
                      {(peakMovementHeatmap.buckets || []).map(bucket => <strong key={bucket.key}>{bucket.label}</strong>)}
                    </div>
                  </div>
                  {heatmapRows.map(day => <div key={day.dayLabel} className="hrmu-smart-heatmap-row">
                      <strong>{day.dayLabel}</strong>
                      <div>
                        {(day.buckets || []).map(bucket => {
                    const intensity = Math.max(Number(bucket.count || 0) / heatmapMax, 0);
                    return <span key={`${day.dayLabel}-${bucket.key}`} title={`${day.dayLabel} ${bucket.label}: ${bucket.count}`} style={{
                      opacity: 0.18 + intensity * 0.82
                    }}>
                          
                              {numberFormatter.format(bucket.count || 0)}
                            </span>;
                  })}
                      </div>
                    </div>)}
                </div> : <div className="hrmu-smart-empty small">No movement heatmap data is available for this period.</div>}
            </article>

            <article className="hrmu-smart-panel">
              <div className="hrmu-smart-panel-title">
                <h3>Repeat Incident Detection</h3>
                <span>{numberFormatter.format(repeatIncidents.length)} repeat groups</span>
              </div>
              <div className="hrmu-smart-compact-list">
                {repeatIncidents.length ? repeatIncidents.slice(0, 5).map(incident => <div key={`${incident.scope}-${incident.name}-${incident.type}`} className="hrmu-smart-compact-row">
                    <div>
                      <strong>{incident.name}</strong>
                      <span>{incident.scope} • {incident.type}</span>
                    </div>
                    <b>{numberFormatter.format(incident.count)}x</b>
                  </div>) : <div className="hrmu-smart-empty small">No repeated missing proof, late return, or tracking gap pattern was found.</div>}
              </div>
            </article>
          </div>

          <div className="hrmu-smart-layout secondary">
            <article className="hrmu-smart-panel">
              <div className="hrmu-smart-panel-title">
                <h3>College Risk Score</h3>
                <span>{smartSummary.riskiestCollege || 'All clear'}</span>
              </div>
              <div className="hrmu-smart-risk-score-list">
                {topCollegeRiskScores.length ? topCollegeRiskScores.map(college => <div key={`risk-${college.collegeId || college.collegeName}`} className="hrmu-smart-risk-score-row">
                    <div>
                      <strong>{college.collegeName}</strong>
                      <span>{college.lateReturns} late • {college.rejectedSlips} rejected • {college.trackingGaps} gaps</span>
                    </div>
                    <div className="hrmu-smart-risk-score-meter">
                      <span style={{
                    width: `${Math.max(college.riskScore || 0, college.riskScore > 0 ? 6 : 2)}%`
                  }} />
                    </div>
                    <b>{numberFormatter.format(college.riskScore || 0)}</b>
                  </div>) : <div className="hrmu-smart-empty small">No college risk score is available for this period.</div>}
              </div>
            </article>

            <article className="hrmu-smart-panel">
              <div className="hrmu-smart-panel-title">
                <h3>College Trend Comparison</h3>
                <span>Current vs previous</span>
              </div>
              <div className="hrmu-smart-compact-list">
                {topTrendRows.length ? topTrendRows.map(college => <div key={`trend-${college.collegeId || college.collegeName}`} className="hrmu-smart-compact-row">
                    <div>
                      <strong>{college.collegeName}</strong>
                      <span>{numberFormatter.format(college.currentTrips)} current / {numberFormatter.format(college.previousTrips)} previous</span>
                    </div>
                    <b className={college.direction}>{college.direction === 'increase' ? '+' : college.direction === 'decrease' ? '-' : ''}{percentFormatter.format(college.changePercent || 0)}%</b>
                  </div>) : <div className="hrmu-smart-empty small">No college trend comparison is available for this period.</div>}
              </div>
            </article>
          </div>

          <article className="hrmu-smart-panel hrmu-smart-export-summary">
            <div className="hrmu-smart-panel-title">
              <h3>Export-Ready AI Summary</h3>
              <span>PDF interpretation</span>
            </div>
            <p>{smartAnalytics.exportSummary || smartSummary.exportSummary || 'A concise PDF-ready interpretation will appear once analytics data is available.'}</p>
          </article>

          <article className="hrmu-smart-panel">
            <div className="hrmu-smart-panel-title">
              <h3>College-Based Trip Summary</h3>
              <span>{selectedCollegeLabel}</span>
            </div>
            {smartCollegeSummary.length ? <div className="hrmu-smart-college-chart" aria-label="College-based trip summary bar chart">
                {smartCollegeSummary.map(college => {
              const tripCount = Number(college.tripCount || 0);
              const activeCount = Number(college.activeTripCount || 0);
              const completedCount = Number(college.completedTripCount || 0);
              const width = `${Math.max(tripCount / maxCollegeTripCount * 100, tripCount > 0 ? 10 : 2)}%`;
              const activeWidth = tripCount > 0 ? `${Math.min(activeCount / tripCount * 100, 100)}%` : '0%';
              const completedWidth = tripCount > 0 ? `${Math.min(completedCount / tripCount * 100, 100)}%` : '0%';
              return <div key={college.collegeId || college.collegeName} className="hrmu-smart-college-chart-row">
                      <div className="hrmu-smart-college-chart-label">
                        <strong>{college.collegeName}</strong>
                        <span>{numberFormatter.format(tripCount)} trips</span>
                      </div>
                      <div className="hrmu-smart-college-chart-body">
                        <div className="hrmu-smart-college-bar-shell">
                          <div className="hrmu-smart-college-bar-total" style={{
                      width
                    }}>
                            <span className="active" style={{
                        width: activeWidth
                      }} />
                            <span className="completed" style={{
                        width: completedWidth
                      }} />
                          </div>
                        </div>
                        <div className="hrmu-smart-college-chart-meta">
                          <span><i className="active" />{numberFormatter.format(activeCount)} active</span>
                          <span><i className="completed" />{numberFormatter.format(completedCount)} completed</span>
                        </div>
                      </div>
                    </div>;
            })}
              </div> : <div className="hrmu-smart-empty">No college summary is available for this period.</div>}
          </article>
        </section>

        <section className="hrmu-analytics-top-grid">
          <article className="hrmu-analytics-chart-card">
            <div className="hrmu-analytics-panel-head">
              <div>
                <h2>Weekly Movement Trend</h2>
                <p>
                  {selectedCollegeLabel === 'All Departments' ? 'Weekly locator slip volume across the selected date range' : `Weekly locator slip volume for ${selectedCollegeLabel}`}
                </p>
              </div>
              <div className="hrmu-analytics-legend">
                <span className="departures">Locator Slips</span>
                <span className="arrivals">{analytics?.dateRange?.label || 'Current Month'}</span>
              </div>
            </div>
            {loading ? <div className="hrmu-analytics-loading">Loading analytics...</div> : <div className="hrmu-analytics-chart">
                {chartLabels.map((label, index) => {
              const currentValue = Number(chartValues[index] || 0);
              const height = maxChartValue > 0 ? Math.max(currentValue / maxChartValue * 100, 12) : 12;
              return <div key={label} className="hrmu-analytics-chart-col">
                      <strong className="hrmu-analytics-bar-value">{numberFormatter.format(currentValue)}</strong>
                      <div className="hrmu-analytics-bar" style={{
                  height: `${height}%`
                }} title={`${label}: ${currentValue}`} />
                      <span>{label}</span>
                    </div>;
            })}
              </div>}
          </article>

        </section>

        <section className="hrmu-analytics-bottom-grid">
          <article className="hrmu-analytics-destinations-card">
            <h2>Frequent Destinations</h2>
            <div className="hrmu-analytics-destination-list">
              {frequentDestinations.length ? frequentDestinations.slice(0, 5).map(row => {
              const topCount = frequentDestinations[0]?.count || 1;
              const width = `${Math.max(Number(row.count || 0) / topCount * 100, 10)}%`;
              return <div key={`${row.rank}-${row.label}`} className="hrmu-analytics-destination-item">
                      <div className="hrmu-analytics-rank">{row.rank}</div>
                      <div className="hrmu-analytics-destination-copy">
                        <strong title={row.label}>{row.label}</strong>
                        <div className="hrmu-analytics-destination-bar-track">
                          <div className="hrmu-analytics-destination-bar-fill" style={{
                      width
                    }} />
                        </div>
                      </div>
                      <span>{numberFormatter.format(row.count || 0)}</span>
                    </div>;
            }) : <div className="hrmu-analytics-empty">No destination history found for this month.</div>}
            </div>
          </article>
        </section>
      </div>
    </HrmuWorkspaceShell>;
};
export const HrmuReportsView = ({
  setView,
  profileData,
  onLogout
}) => {
  const pendingReportMonth = useMemo(() => {
    try {
      const rawTarget = window.localStorage.getItem(HRMU_PENDING_REPORT_MONTH_KEY);
      window.localStorage.removeItem(HRMU_PENDING_REPORT_MONTH_KEY);
      if (!rawTarget) return null;
      const parsedTarget = JSON.parse(rawTarget);
      const monthIndex = Number(parsedTarget?.monthIndex);
      const year = Number(parsedTarget?.year);
      if (!Number.isInteger(monthIndex) || monthIndex < 1 || monthIndex > 12 || !Number.isInteger(year)) {
        return null;
      }
      return {
        monthIndex,
        year
      };
    } catch (error) {
      return null;
    }
  }, []);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [selectedReportRow, setSelectedReportRow] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewLocked, setReviewLocked] = useState(false);
  const [pathHistoryState, setPathHistoryState] = useState({
    open: false,
    loading: false,
    error: '',
    data: null
  });
  const {
    monthIndex,
    baseYear,
    report,
    loading,
    error,
    detailLoading,
    selectedDetail,
    setSelectedDetail,
    refetch,
    goPrevious,
    goNext,
    openDetails
  } = useHrmuMonthlyReport({
    initialMonthIndex: pendingReportMonth?.monthIndex || 1,
    initialYear: pendingReportMonth?.year || 2026
  });
  const summary = report?.summary || {};
  const reportRows = Array.isArray(report?.locatorSlipLogs) ? report.locatorSlipLogs : [];
  const reportMeta = report?.reportMeta || {};
  const sequenceMonthName = REPORT_SEQUENCE_MONTHS[monthIndex - 1] || 'January';
  const flaggedSummaryNote = `${summary.lateReturns || 0} late | ${summary.unverifiedLocations || 0} unverified | ${summary.disconnectedLocations || 0} disconnected`;
  const summaryCards = [{
    label: 'TOTAL MOVEMENTS',
    value: String(summary.totalMovements || 0),
    note: `${summary.successfulTrips || 0} successful trips`,
    tone: 'green'
  }, {
    label: 'FLAGGED INCIDENTS',
    value: String(summary.flaggedIncidents || 0),
    note: `${summary.lateReturns || 0} late • ${summary.unverifiedLocations || 0} unverified • ${summary.disconnectedLocations || 0} disconnected`,
    tone: 'red'
  }, {
    label: 'COMPLIANCE RATE',
    value: `${Number(summary.complianceRate || 0).toFixed(1)}%`,
    note: `${summary.successfulTrips || 0} compliant / ${summary.totalMovements || 0} total`,
    tone: 'yellow'
  }];
  summaryCards[1].note = flaggedSummaryNote;
  const mapStatusTone = status => {
    if (status === 'VERIFIED') return 'green';
    if (status === 'REJECTED') return 'red';
    return 'red';
  };
  const getReportStatusLabel = status => {
    if (status === 'VERIFIED') return 'SUCCESS';
    return status || '--';
  };
  const handleOpenReportDetails = async row => {
    setSelectedReportRow(row);
    setReviewLocked(false);
    setReviewMessage('');
    await openDetails(row);
  };
  const handleCloseReportDetails = () => {
    setReviewLocked(false);
    setReviewMessage('');
    setSelectedReportRow(null);
    setSelectedDetail(null);
    setPathHistoryState({
      open: false,
      loading: false,
      error: '',
      data: null
    });
  };
  const openReportPathHistory = async tripId => {
    if (!tripId) {
      setReviewMessage('No trip path is linked to this report item yet.');
      return;
    }
    setPathHistoryState({
      open: true,
      loading: true,
      error: '',
      data: null
    });
    try {
      const data = await getHrmuTripPathHistory(tripId);
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
  const handleReportProofReview = async nextStatus => {
    if (!selectedReportRow?.proofId) {
      setReviewMessage('No uploaded proof is available to review for this trip.');
      return;
    }
    try {
      setReviewing(true);
      setReviewMessage('');
      const result = await reviewHrmuProofCompliance(selectedReportRow.proofId, {
        verificationStatus: nextStatus
      });
      setReviewMessage(nextStatus === 'verified' ? 'Trip marked as successful.' : 'Trip flagged as unverified location/signature.');
      setReviewLocked(true);
      setSelectedDetail({
        ...result,
        isProof: true
      });
      await refetch(monthIndex, baseYear);
    } catch (requestError) {
      setReviewMessage(requestError.message || 'Verification review could not be saved.');
    } finally {
      setReviewing(false);
    }
  };
  const handleDownloadReport = async () => {
    if (loading || downloadLoading) return;
    setDownloadLoading(true);
    try {
      const {
        blob,
        filename
      } = await downloadHrmuMonthlyReportPdf({
        monthIndex,
        baseYear
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
      window.alert(error.message || 'Unable to download the monthly report.');
    } finally {
      setDownloadLoading(false);
    }
  };
  const handlePrintReport = async () => {
    if (loading) return;
    try {
      const {
        blob
      } = await downloadHrmuMonthlyReportPdf({
        monthIndex,
        baseYear
      });
      const objectUrl = window.URL.createObjectURL(blob);
      const printFrame = document.createElement('iframe');
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = '0';
      printFrame.src = objectUrl;
      document.body.appendChild(printFrame);
      printFrame.onload = () => {
        const cleanup = () => {
          window.setTimeout(() => {
            window.URL.revokeObjectURL(objectUrl);
            printFrame.remove();
          }, 1200);
        };
        try {
          printFrame.contentWindow?.focus();
          printFrame.contentWindow?.print();
        } finally {
          cleanup();
        }
      };
    } catch (error) {
      window.alert(error.message || 'Unable to print the monthly report.');
    }
  };
  return <HrmuWorkspaceShell activeKey="reports" setView={setView} profileData={profileData} onLogout={onLogout}>
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
            <button type="button" className="hrmu-reports-action-btn primary" aria-label="Download report as PDF" onClick={handleDownloadReport} disabled={downloadLoading || loading}>
              <RegistryDownloadIcon />
              <span>{downloadLoading ? 'Exporting...' : 'Export PDF'}</span>
            </button>
            <button type="button" className="hrmu-reports-action-btn" aria-label="Print report" onClick={handlePrintReport} disabled={loading}>
              <ReportPrintIcon />
              <span>Print</span>
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
              {summaryCards.map(card => <article key={card.label} className={`hrmu-reports-summary-card ${card.tone}`}>
                  <span>{card.label}</span>
                  <strong>{loading ? '--' : card.value}</strong>
                  <small>{loading ? 'Loading...' : card.note}</small>
                </article>)}
            </div>

            <div className="hrmu-reports-log-head">
              <div className="hrmu-reports-log-title">
                <span className="hrmu-reports-log-icon">
                  <DocumentIcon color="currentColor" width="24" height="24" />
                </span>
                <h2>Monthly Faculty Movement Log</h2>
              </div>
            </div>

            <div className="hrmu-reports-table-wrap">
              <div className="hrmu-reports-table-head">
                <span>TIMESTAMP</span>
                <span>DESTINATION</span>
                <span>PERSONNEL</span>
                <span>STATUS</span>
                <span>ACTION</span>
              </div>
              {loading && <div className="hrmu-reports-table-row"><span>Loading...</span><span>Loading...</span><span>Loading...</span><span>Loading...</span><span>Loading...</span></div>}
              {!loading && reportRows.length === 0 && <div className="hrmu-reports-table-row"><span>No data</span><span>No logs found for this month.</span><span>--</span><span>--</span><span>--</span></div>}
              {!loading && reportRows.map(row => <div key={`${row.timestamp}-${row.personnel}-${row.status}`} className="hrmu-reports-table-row">
                  <span>{row.timestampLabel}</span>
                  <span>{row.location}</span>
                  <span>{row.personnel}</span>
                  <span><em className={`hrmu-reports-status-pill ${mapStatusTone(row.status)}`}>{getReportStatusLabel(row.status)}</em></span>
                  <button type="button" className="hrmu-reports-detail-link" onClick={() => handleOpenReportDetails(row)}>Details</button>
                </div>)}
            </div>
            {error && <p className="hrmu-reports-inline-error">{error}</p>}
          </article>
        </div>

        {selectedDetail && selectedDetail.isProof && !detailLoading && <ProofComplianceDetails row={{
        key: selectedReportRow?.proofId || selectedDetail.id,
        proofId: selectedReportRow?.proofId || selectedDetail.id,
        name: selectedDetail.facultyName || selectedReportRow?.personnel || 'Faculty member',
        roleLine: selectedDetail.collegeName ? `Faculty - ${selectedDetail.collegeName}` : 'Faculty',
        slipNumber: `LS-${String(selectedDetail.locatorSlipId || selectedReportRow?.locatorSlipId || '').replace(/-/g, '').slice(0, 8).toUpperCase()}`,
        actualReturnTime: selectedDetail.actualReturnTime || selectedReportRow?.timestamp,
        expectedReturnTime: selectedDetail.expectedReturnTime,
        verificationStatus: String(selectedDetail.verificationStatus || 'submitted').toLowerCase(),
        flaggedReasons: Array.isArray(selectedDetail.flaggedReasons) ? selectedDetail.flaggedReasons : [],
        isLateReturn: Boolean(selectedDetail.isLateReturn),
        purpose: selectedDetail.purpose || 'Official travel',
        profileImageUrl: selectedDetail.profileImageUrl || null,
        submittedAt: selectedDetail.submittedAt || null
      }} details={selectedDetail} reviewMessage={reviewMessage} reviewing={reviewing} reviewLocked={reviewLocked || Boolean(selectedDetail?.isLateReturn) || String(selectedDetail?.verificationStatus || '').toLowerCase() !== 'submitted'} onClose={handleCloseReportDetails} onReview={handleReportProofReview} onViewPathHistory={() => openReportPathHistory(selectedDetail.tripId || selectedReportRow?.tripId)} />}

        {selectedDetail && !selectedDetail.isProof && <div className="hrmu-reports-detail-overlay" role="presentation" onClick={handleCloseReportDetails}>
            <div className="hrmu-reports-detail-modal" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
              <div className="hrmu-reports-detail-head">
                <h3>{selectedDetail.facultyName}</h3>
                <button type="button" className="hrmu-reports-detail-close" onClick={handleCloseReportDetails} aria-label="Close details">
                  <RegistryModalCloseIcon />
                </button>
              </div>
              {detailLoading ? <p>Loading details...</p> : <div className="hrmu-reports-detail-grid">
                  <p><strong>College:</strong> {selectedDetail.collegeName}</p>
                  <p><strong>Destination:</strong> {selectedDetail.destination}</p>
                  <p><strong>Purpose:</strong> {selectedDetail.purpose}</p>
                  <p><strong>Locator Status:</strong> {selectedDetail.locatorStatus}</p>
                  <p><strong>Trip Status:</strong> {selectedDetail.tripStatus || 'No linked trip'}</p>
                  <p><strong>Verification:</strong> {selectedDetail.verificationStatus || 'missing'}</p>
                  <div className="hrmu-reports-detail-reasons">
                    <strong>Flagged Reasons</strong>
                    {Array.isArray(selectedDetail.flaggedReasons) && selectedDetail.flaggedReasons.length > 0 ? selectedDetail.flaggedReasons.map(reason => <div key={`${reason.type}-${reason.detectedAt || ''}`} className="hrmu-reports-detail-reason">
                        <span>{reason.label}</span>
                        <small>{reason.severity}</small>
                      </div>) : <p>No flagged incidents attached.</p>}
                  </div>
                </div>}
            </div>
          </div>}
      </section>

      {pathHistoryState.open && <TripPathHistoryModal history={pathHistoryState.data} loading={pathHistoryState.loading} error={pathHistoryState.error} onClose={() => setPathHistoryState({
      open: false,
      loading: false,
      error: '',
      data: null
    })} />}
    </HrmuWorkspaceShell>;
};
export const HrmuNotificationsView = ({
  setView,
  profileData,
  onLogout
}) => {
  const [downloadBusy, setDownloadBusy] = useState(false);
  const handleDownloadMonthlyLogReport = async () => {
    if (downloadBusy) return;
    setDownloadBusy(true);
    try {
      const file = await downloadHrmuNotificationMonthlyLogPdf();
      triggerBlobDownload(file.blob, file.filename);
    } catch (error) {
      console.error('Failed to download HRMU monthly log report:', error);
    } finally {
      setDownloadBusy(false);
    }
  };
  return <HrmuWorkspaceShell activeKey="" setView={setView} profileData={profileData} onLogout={onLogout} bellActive>
      <section className="hrmu-alerts-page">
        <div className="hrmu-alerts-hero">
          <div className="hrmu-alerts-copy">
            <span className="hrmu-alerts-kicker">INTERNAL LOGISTICS</span>
            <h1>System Alerts</h1>
            <p>Real-time monitoring and security notifications for HRMU faculty and campus operations.</p>
          </div>
          <div className="hrmu-alerts-actions">
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
              <button type="button" className="hrmu-alert-download-btn" onClick={handleDownloadMonthlyLogReport} disabled={downloadBusy}>
                {downloadBusy ? 'DOWNLOADING...' : 'DOWNLOAD PDF'}
              </button>
            </article>
          </aside>
        </section>
      </section>
    </HrmuWorkspaceShell>;
};
export const HrmuReportInboxView = ({
  setView,
  profileData,
  onLogout
}) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewItem, setPreviewItem] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  useEffect(() => {
    let isMounted = true;
    const loadInbox = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getHrmuReportInbox({
          limit: 50
        });
        if (!isMounted) return;
        setItems(Array.isArray(data?.items) ? data.items : []);
      } catch (loadError) {
        if (isMounted) {
          setItems([]);
          setError(loadError.message || 'Unable to load the HRMU report inbox.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    loadInbox();
    return () => {
      isMounted = false;
    };
  }, []);
  useEffect(() => () => {
    if (previewItem?.objectUrl) {
      window.URL.revokeObjectURL(previewItem.objectUrl);
    }
  }, [previewItem]);
  const formatInboxDateTime = value => {
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
  const handlePreviewAttachment = async item => {
    setPreviewLoading(true);
    try {
      const {
        blob,
        filename
      } = await downloadHrmuReportInboxAttachment(item.id);
      const objectUrl = window.URL.createObjectURL(blob);
      setPreviewItem(current => {
        if (current?.objectUrl) {
          window.URL.revokeObjectURL(current.objectUrl);
        }
        return {
          id: item.id,
          title: item.title,
          filename,
          objectUrl,
          createdAt: item.createdAt,
          senderName: item.senderName
        };
      });
      setItems(current => current.map(row => row.id === item.id ? {
        ...row,
        isRead: true
      } : row));
    } catch (previewError) {
      window.alert(previewError.message || 'Unable to preview the HRMU inbox attachment.');
    } finally {
      setPreviewLoading(false);
    }
  };
  const handleDownloadAttachment = async item => {
    try {
      const {
        blob,
        filename
      } = await downloadHrmuReportInboxAttachment(item.id);
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
      setItems(current => current.map(row => row.id === item.id ? {
        ...row,
        isRead: true
      } : row));
    } catch (downloadError) {
      window.alert(downloadError.message || 'Unable to download the HRMU inbox attachment.');
    }
  };
  const closePreview = () => {
    setPreviewItem(current => {
      if (current?.objectUrl) {
        window.URL.revokeObjectURL(current.objectUrl);
      }
      return null;
    });
  };
  const unreadCount = items.filter(item => !item.isRead).length;
  const latestItem = items[0] || null;
  return <HrmuWorkspaceShell activeKey="" setView={setView} profileData={profileData} onLogout={onLogout} inboxActive forceDesktop>
      <section className="hrmu-inbox-page">
        <div className="hrmu-inbox-hero">
          <div className="hrmu-inbox-copy">
            <span className="hrmu-alerts-kicker">HRMU REPORT HUB</span>
            <h1>Inbox</h1>
            <p>Received CSSU report attachments appear here. Open a report to preview it in-app or download the same PDF.</p>
          </div>
          <div className="hrmu-inbox-hero-badges">
            <span className="hrmu-inbox-pill neutral">{items.length} Total Reports</span>
            <span className="hrmu-inbox-pill active">{unreadCount} Unread</span>
          </div>
        </div>

        <div className="hrmu-inbox-layout">
          <section className="hrmu-inbox-feed-panel">
            <div className="hrmu-inbox-feed-head">
              <div>
                <h2>Received Attachments</h2>
                <p>Most recent CSSU submissions are shown first.</p>
              </div>
            </div>

            {loading ? <div className="hrmu-alert-feed-empty">Loading report inbox...</div> : null}
            {!loading && error ? <div className="hrmu-alert-feed-empty">{error}</div> : null}
            {!loading && !error && items.length === 0 ? <div className="hrmu-alert-feed-empty">No CSSU reports have been sent to the HRMU inbox yet.</div> : null}

            {!loading && !error && items.length > 0 ? <div className="hrmu-alert-feed-list">
                {items.map(item => <article key={item.id} className={`hrmu-alert-feed-card verified hrmu-inbox-card ${item.isRead ? 'read' : 'unread'}`}>
                    <div className="hrmu-alert-feed-accent" aria-hidden="true" />
                    <div className="hrmu-alert-feed-body">
                      <div className="hrmu-alert-feed-icon verified">
                        <DocumentIcon color="currentColor" width="24" height="24" />
                      </div>
                      <div className="hrmu-alert-feed-copy">
                        <div className="hrmu-alert-feed-head">
                          <span className="hrmu-alert-critical-pill verified">{item.isRead ? 'RECEIVED' : 'NEW REPORT'}</span>
                          <span className="hrmu-alert-feed-time">{formatInboxDateTime(item.createdAt)}</span>
                        </div>
                        <h2>{item.title || 'CSSU Report Attachment'}</h2>
                        <p>{item.subtitle || 'CSSU sent a movement report PDF to the HRMU inbox.'}</p>
                        <div className="hrmu-inbox-meta-row">
                          <span><strong>From:</strong> {item.senderName || 'CSSU Administrator'}</span>
                          <span><strong>Attachment:</strong> {item.filename}</span>
                        </div>
                        <div className="hrmu-alert-feed-actions">
                          <button type="button" className="hrmu-alert-primary-btn verified" onClick={() => handlePreviewAttachment(item)} disabled={previewLoading}>
                            {previewLoading ? 'Opening...' : 'View PDF'}
                          </button>
                          <button type="button" className="hrmu-alert-text-btn" onClick={() => handleDownloadAttachment(item)}>
                            Download PDF
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>)}
              </div> : null}
          </section>

          <aside className="hrmu-inbox-side-column">
            <article className="hrmu-inbox-summary-card primary">
              <span className="hrmu-inbox-summary-kicker">Inbox Summary</span>
              <strong>{String(items.length).padStart(2, '0')}</strong>
              <p>PDF report attachments currently stored in the HRMU inbox.</p>
            </article>

            <article className="hrmu-inbox-summary-card">
              <span className="hrmu-inbox-summary-kicker">Latest Sender</span>
              <h3>{latestItem?.senderName || 'Awaiting CSSU reports'}</h3>
              <p>{latestItem ? formatInboxDateTime(latestItem.createdAt) : 'No report has been delivered yet.'}</p>
            </article>

            <article className="hrmu-inbox-summary-card">
              <span className="hrmu-inbox-summary-kicker">Quick Note</span>
              <p>Open a report to preview it inside the portal, then download the same PDF if you need an offline copy.</p>
            </article>
          </aside>
        </div>

        {previewItem ? <div className="hrmu-inbox-preview-overlay" onClick={closePreview}>
            <div className="hrmu-inbox-preview-modal" onClick={event => event.stopPropagation()}>
              <div className="hrmu-inbox-preview-head">
                <div>
                  <h3>{previewItem.title}</h3>
                  <p>{previewItem.filename} • {formatInboxDateTime(previewItem.createdAt)}</p>
                </div>
                <div className="hrmu-inbox-preview-tools">
                  <button type="button" className="hrmu-alert-text-btn" onClick={() => handleDownloadAttachment(previewItem)}>
                    Download
                  </button>
                  <button type="button" className="hrmu-reports-detail-close" onClick={closePreview} aria-label="Close preview">
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              </div>
              <iframe title={previewItem.filename} src={previewItem.objectUrl} className="hrmu-inbox-preview-frame" />
            </div>
          </div> : null}
      </section>
    </HrmuWorkspaceShell>;
};
export const HrmuNotificationsRealtimeView = ({
  setView,
  profileData,
  onLogout
}) => {
  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState('');
  const [alertFilter, setAlertFilter] = useState('all');
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [incidentSummary, setIncidentSummary] = useState({
    lateReturns: 0,
    unverifiedLocations: 0,
    disconnectedLocations: 0
  });
  const getReportMonthTargetFromDate = value => {
    const date = value ? new Date(value) : new Date();
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    return {
      monthIndex: safeDate.getMonth() + 1,
      year: safeDate.getFullYear()
    };
  };
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
        const [notificationData, summaryData, flaggedTripsData] = await Promise.all([getHrmuNotifications({
          page: 1,
          limit: 100
        }), getHrmuVerificationIncidentSummary(), getHrmuFlaggedTrips()]);
        if (!isMounted) return;
        const notificationRows = Array.isArray(notificationData?.notifications) ? notificationData.notifications : [];
        const flaggedRows = Array.isArray(flaggedTripsData?.trips) ? flaggedTripsData.trips : [];
        const positiveNotificationTypes = new Set(['hrmu_locator_slip_approved', 'hrmu_trip_started', 'hrmu_trip_arrived', 'hrmu_trip_completed', 'hrmu_cssu_validated_exit', 'hrmu_location_verification_submitted']);
        const rejectedNotificationTypes = new Set(['hrmu_locator_slip_rejected']);
        const decisionAlerts = notificationRows.filter(notification => positiveNotificationTypes.has(notification.type) || rejectedNotificationTypes.has(notification.type)).map(notification => {
          const isRejectedDecision = rejectedNotificationTypes.has(notification.type);
          const defaultTitle = notification.type === 'hrmu_trip_started' ? 'Trip started' : notification.type === 'hrmu_trip_completed' ? 'Faculty returned on time' : notification.type === 'hrmu_cssu_validated_exit' ? 'Exit clearance validated' : notification.type === 'hrmu_locator_slip_rejected' ? 'Locator slip rejected' : notification.type === 'hrmu_trip_arrived' ? 'Faculty arrived at destination' : notification.title || 'Verified activity';
          const reportDate = notification.createdAt || notification.approvedAt;
          return {
            id: `${isRejectedDecision ? 'rejected' : 'verified'}-${notification.id}`,
            type: isRejectedDecision ? 'rejected' : 'verified',
            notificationType: notification.type,
            locatorSlipId: notification.locatorSlipId || null,
            tripId: notification.tripId || null,
            reportTarget: getReportMonthTargetFromDate(reportDate),
            title: defaultTitle,
            body: notification.message || (isRejectedDecision ? `${notification.facultyName} locator slip was rejected.` : `${notification.facultyName} locator slip approved.`),
            time: formatRelativeAlertTime(reportDate),
            sortDate: reportDate ? new Date(reportDate).getTime() : 0,
            actionLabelPrimary: 'Open Dashboard',
            actionLabelSecondary: notification.type === 'hrmu_trip_started' || notification.type === 'hrmu_trip_completed' ? 'Open Reports' : 'Review Verification'
          };
        });
        const violationAlerts = flaggedRows.map(trip => ({
          id: `violation-${trip.tripId}`,
          type: 'violation',
          notificationType: trip.type || trip.incidentType || 'violation',
          locatorSlipId: trip.locatorSlipId || null,
          tripId: trip.tripId || null,
          reportTarget: getReportMonthTargetFromDate(trip.latestDetectedAt),
          title: (trip.incidentLabels?.[0] || 'Trip Incident Detected').replace('detected', '').trim() || 'Trip Incident Detected',
          body: `${trip.facultyName} has active incident conditions${trip.destination ? ` en route to ${trip.destination}` : ''}. Reasons: ${(trip.incidentLabels || []).join(', ') || 'Review required'}.`,
          time: formatRelativeAlertTime(trip.latestDetectedAt),
          sortDate: trip.latestDetectedAt ? new Date(trip.latestDetectedAt).getTime() : 0,
          actionLabelPrimary: 'Review Verification',
          actionLabelSecondary: 'Open Reports'
        }));
        const mergedAlerts = [...violationAlerts, ...decisionAlerts].sort((left, right) => (right.sortDate || 0) - (left.sortDate || 0));
        setAlerts(mergedAlerts);
        setIncidentSummary({
          lateReturns: Number(summaryData?.lateReturns || 0),
          unverifiedLocations: Number(summaryData?.unverifiedLocations || 0),
          disconnectedLocations: Number(summaryData?.disconnectedLocations || 0)
        });
      } catch (error) {
        if (isMounted) {
          console.error('Failed to load HRMU alerts:', error);
          setAlerts([]);
          setIncidentSummary({
            lateReturns: 0,
            unverifiedLocations: 0,
            disconnectedLocations: 0
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
  const filteredAlerts = alerts.filter(alert => {
    if (alertFilter === 'verified') return alert.type === 'verified';
    if (alertFilter === 'flagged') return alert.type === 'violation' || alert.type === 'rejected';
    return true;
  });
  const handleDownloadMonthlyLogReport = async () => {
    if (downloadBusy) return;
    setDownloadBusy(true);
    try {
      const file = await downloadHrmuNotificationMonthlyLogPdf();
      triggerBlobDownload(file.blob, file.filename);
    } catch (error) {
      console.error('Failed to download HRMU monthly log report:', error);
      setAlertsError(error.message || 'Failed to download the monthly log report.');
    } finally {
      setDownloadBusy(false);
    }
  };
  const openAlertVerificationTarget = alert => {
    const target = {
      locatorSlipId: alert?.locatorSlipId || null,
      proofId: alert?.proofId || null,
      tripId: alert?.tripId || null
    };
    if (target.locatorSlipId || target.proofId || target.tripId) {
      window.localStorage.setItem(HRMU_PENDING_VERIFICATION_TARGET_KEY, JSON.stringify(target));
    }
    setView('hrmu-verification');
  };
  const handleAlertAction = (alert, label) => {
    const normalizedLabel = String(label || '').toLowerCase();
    if (normalizedLabel.includes('report')) {
      if (alert?.reportTarget?.monthIndex && alert?.reportTarget?.year) {
        window.localStorage.setItem(HRMU_PENDING_REPORT_MONTH_KEY, JSON.stringify(alert.reportTarget));
      }
      setView('hrmu-reports');
      return;
    }
    if (normalizedLabel.includes('verification')) {
      openAlertVerificationTarget(alert);
      return;
    }
    setView('hrmu-dashboard');
  };
  return <HrmuWorkspaceShell activeKey="" setView={setView} profileData={profileData} onLogout={onLogout} bellActive>
      <section className="hrmu-alerts-page">
        <div className="hrmu-alerts-hero">
          <div className="hrmu-alerts-copy">
            <span className="hrmu-alerts-kicker">INTERNAL LOGISTICS</span>
            <h1>System Alerts</h1>
            <p>Real-time monitoring and security notifications for HRMU faculty and campus operations.</p>
          </div>
          <div className="hrmu-alerts-actions">
            <label className="hrmu-alerts-filter">
              <StatusGraphIcon color="currentColor" />
              <select value={alertFilter} onChange={event => setAlertFilter(event.target.value)} aria-label="Filter alerts">
                <option value="all">All</option>
                <option value="verified">Verified</option>
                <option value="flagged">Flagged</option>
              </select>
            </label>
          </div>
        </div>

        <section className="hrmu-alerts-grid">
          <div className="hrmu-alert-feed-column">
            {alertsLoading ? <div className="hrmu-alert-feed-empty">Loading system alerts...</div> : null}

            {!alertsLoading && !alertsError && filteredAlerts.length === 0 ? <div className="hrmu-alert-feed-empty">No alerts available for this filter right now.</div> : null}

            {!alertsLoading && filteredAlerts.length > 0 ? <div className="hrmu-alert-feed-list">
                {filteredAlerts.map(alert => {
              const tone = alert.type === 'verified' ? 'verified' : 'incident';
              const isViolation = alert.type === 'violation';
              const isRejected = alert.type === 'rejected';
              const primaryTarget = alert.type === 'verified' ? 'hrmu-dashboard' : 'hrmu-verification';
              const secondaryTarget = isViolation ? 'hrmu-reports' : 'hrmu-verification';
              return <article key={alert.id} className={`hrmu-alert-feed-card ${tone}`}>
                      <div className="hrmu-alert-feed-accent" aria-hidden="true" />
                      <div className="hrmu-alert-feed-body">
                        <div className={`hrmu-alert-feed-icon ${tone}`}>
                          {alert.type === 'verified' ? <NotifSlipIcon /> : <HrmuWarningIcon />}
                        </div>
                        <div className="hrmu-alert-feed-copy">
                          <div className="hrmu-alert-feed-head">
                            <span className={`hrmu-alert-critical-pill ${tone}`}>
                              {isViolation ? 'VIOLATION' : isRejected ? 'REJECTED' : 'VERIFIED'}
                            </span>
                            <span className="hrmu-alert-feed-time">{alert.time}</span>
                          </div>
                          <h2>{alert.title}</h2>
                          <p>{alert.body}</p>
                          <div className="hrmu-alert-feed-actions">
                            <button type="button" className={`hrmu-alert-primary-btn ${tone}`} onClick={() => handleAlertAction(alert, alert.actionLabelPrimary || (primaryTarget === 'hrmu-verification' ? 'Review Verification' : 'Open Dashboard'))}>
                            
                              {alert.actionLabelPrimary || 'Open Dashboard'}
                            </button>
                            <button type="button" className="hrmu-alert-text-btn" onClick={() => handleAlertAction(alert, alert.actionLabelSecondary || (secondaryTarget === 'hrmu-reports' ? 'Open Reports' : 'Review Verification'))}>
                            
                              {alert.actionLabelSecondary || 'Review Verification'}
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
                <span>Late Return</span>
                <strong>{String(incidentSummary.lateReturns || 0).padStart(2, '0')}</strong>
              </div>
              <div className="hrmu-alert-summary-row">
                <span>Unverified Location/Signature</span>
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
              <button type="button" className="hrmu-alert-download-btn" onClick={handleDownloadMonthlyLogReport} disabled={downloadBusy}>
                {downloadBusy ? 'DOWNLOADING...' : 'DOWNLOAD PDF'}
              </button>
            </article>
          </aside>
        </section>
        {alertsError ? <p className="hrmu-alerts-inline-error">{alertsError}</p> : null}
      </section>
    </HrmuWorkspaceShell>;
};
export const HrmuLiveTrackingView = ({
  setView,
  profileData,
  onLogout
}) => {
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
    getActiveFacultyFn: getHrmuActiveFaculty,
    getFacultyActivityFn: getHrmuFacultyActivity,
    getFacultyLiveDetailFn: getHrmuFacultyLiveDetail
  });
  const mapCenter = useMemo(() => [Number(center?.lng || OLONGAPO_CENTER[0]), Number(center?.lat || OLONGAPO_CENTER[1])], [center?.lat, center?.lng]);
  const [mapFocusRequest, setMapFocusRequest] = useState(0);
  return <HrmuWorkspaceShell activeKey="live" setView={setView} profileData={profileData} onLogout={onLogout}>
      <section className="hrmu-live-page">
        <div className="hrmu-live-map-stage">
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
    </HrmuWorkspaceShell>;
};
