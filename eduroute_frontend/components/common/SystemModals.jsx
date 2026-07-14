import { AdminBadgeIcon, AdminEmailOutlineIcon, AdminProfileChevronIcon, AdminProfileIdIcon, AdminProfileLogoutIcon, AdminProfilePasswordIcon, AdminRoleIcon, AdminSaveCheckIcon, ApproveCheckIcon, ArrowRightIcon, AtSymbolIcon, BackArrowIcon, BadgeIcon, BatteryIcon, BellRingIcon, BriefcaseIcon, CameraIcon, CapIcon, CheckCircleAdminIcon, CheckCircleIcon, CheckCircleSolidIcon, ChevronDownIcon, ChevronRightIcon, ClipboardCheckIcon, ClipboardClockIcon, ClockIcon, CssuChartIcon, CssuIncidentsNavIcon, CssuMapNavIcon, CssuReportsNavIcon, CssuRoleIcon, CssuRosetteCheckIcon, CssuScanNavIcon, CssuTrendingUpIcon, CssuWarningCircleIcon, CssuWarningTriangleIcon, DashboardNavIcon, DeanNotificationDocIcon, DetailClockIcon, DetailClockReturnIcon, DetailDocIcon, DetailPinIcon, DetailRouteIcon, DocumentIcon, DummySignature, EditPencilIcon, EwanIcon, ExclamationCircleIcon, EyeIcon, EyeOffIcon, FacultyCheckCircleIcon, FacultyChevronRightIcon, FacultyCopyIcon, FacultyCrossCircleIcon, FacultyDocIcon, FacultyFilterIcon, FacultyIdBadgeIcon, FacultyNavIcon, FacultyRoleIcon, FacultyWaitCircleIcon, FileTextIcon, FilledClockIcon, FlashlightIcon, GlobeIcon, GlobeSmIcon, GraduationCapIcon, GridIcon, HeadsetIcon, HelpCircleIcon, HelpIcon, HomeNavIcon, HourglassIcon, HrmuAlertTinyIcon, HrmuChartIcon, HrmuCheckTinyIcon, HrmuExportIcon, HrmuEyeMiniIcon, HrmuFilterIcon, HrmuMapRouteIcon, HrmuMiniCheckIcon, HrmuPinMiniIcon, HrmuReportIcon, HrmuRoleIcon, HrmuSidebarGridIcon, HrmuSyncIcon, HrmuVerificationIcon, HrmuViewRouteIcon, HrmuWarningIcon, IdBadgeIcon, InboxArchiveIcon, InfoIcon, LinkIcon, LocationPinFilledIcon, LocationPinIcon, LockIcon, LockPrivIcon, LockSmallIcon, LoginDoorIcon, LogoutIcon, MailIcon, MapFoldIcon, MapIcon, ModalCloseIcon, NotifPendingIcon, NotificationIcon, PasswordIcon, PermissionsIcon, PersonOutlineIcon, PinIcon, PlayTriangleIcon, PolicyBulbIcon, PolicyCheckIcon, PrivacyIcon, ProfileEditIcon, ProfileNavIcon, ProgressReviewIcon, QuestionCircleIcon, RefreshClockIcon, RefreshIcon, RegistryDownloadIcon, RegistryModalCloseIcon, RegistryModalDoneIcon, RegistryModalIdIcon, RegistryModalVerifiedIcon, RegistryNavIcon, RejectXIcon, RemarksIcon, ReportPrintIcon, RequestsNavIcon, SaveIcon, ScanQRIcon, SendIcon, ShieldCheckIcon, ShieldCheckSmallIcon, ShieldSearchIcon, ShieldSolidIcon, SignalIcon, SignatureNavIcon, SlashedPersonIcon, SlipIcon, StatusGraphIcon, TogaLogoIcon, ToggleSwitch, TrashIcon, UploadIcon, UsersAdminIcon, WifiIcon, XCircleIcon } from "../icons/AppIcons.jsx";
import { getEduRouteDialogContent } from "../../app/routing/portalRouting.js";
export const EduRouteNoticeModal = ({
  title,
  message,
  tone = 'info',
  onClose
}) => {
  const dialog = getEduRouteDialogContent({
    title,
    message,
    tone
  });
  return <div className="eduroute-dialog-backdrop" role="presentation" onClick={onClose}>
      <div className={`eduroute-dialog-modal ${dialog.tone}`} role="alertdialog" aria-modal="true" aria-labelledby="eduroute-dialog-title" onClick={event => event.stopPropagation()}>
        <div className="eduroute-dialog-icon" aria-hidden="true">
          {tone === 'success' ? '✓' : tone === 'error' ? '!' : 'i'}
        </div>
        <span className="eduroute-dialog-kicker">EDUROUTE SYSTEM</span>
        <h2 id="eduroute-dialog-title">{dialog.title}</h2>
        <p>{dialog.message}</p>
        <button type="button" className="eduroute-dialog-primary" onClick={onClose}>Continue</button>
      </div>
    </div>;
};
export const PermissionSetupModal = ({
  step,
  message,
  loading,
  onShowExplainer,
  onEnableNotifications,
  onMaybeLater,
  onClose
}) => {
  const isIntro = step === 'intro';
  const isResult = step === 'result';
  return <div className="permission-modal-backdrop" role="dialog" aria-modal="true">
      <div className="permission-modal-card">
        <div className="permission-modal-glow" />
        <div className="permission-modal-icon">
          <NotificationIcon color="var(--green)" />
        </div>

        {isIntro && <>
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
          </>}

        {step === 'notifications' && <>
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
          </>}

        {isResult && <>
            <span className="permission-modal-kicker">SETUP SAVED</span>
            <h2 className="permission-modal-title">Notification Preference Updated</h2>
            <p className="permission-modal-copy">{message}</p>
            <button type="button" className="permission-primary-btn" onClick={onClose}>
              Continue to dashboard
            </button>
          </>}
      </div>
    </div>;
};
/* ======================================================== */
/* ADMIN DASHBOARD VIEW (Strategic Oversight)               */
/* ======================================================== */
