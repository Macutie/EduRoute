import { useEffect, useMemo, useRef, useState } from "react";
import { AdminBadgeIcon, AdminEmailOutlineIcon, AdminProfileChevronIcon, AdminProfileIdIcon, AdminProfileLogoutIcon, AdminProfilePasswordIcon, AdminRoleIcon, AdminSaveCheckIcon, ApproveCheckIcon, ArrowRightIcon, AtSymbolIcon, BackArrowIcon, BadgeIcon, BatteryIcon, BellRingIcon, BriefcaseIcon, CameraIcon, CapIcon, CheckCircleAdminIcon, CheckCircleIcon, CheckCircleSolidIcon, ChevronDownIcon, ChevronRightIcon, ClipboardCheckIcon, ClipboardClockIcon, ClockIcon, CssuChartIcon, CssuIncidentsNavIcon, CssuMapNavIcon, CssuReportsNavIcon, CssuRoleIcon, CssuRosetteCheckIcon, CssuScanNavIcon, CssuTrendingUpIcon, CssuWarningCircleIcon, CssuWarningTriangleIcon, DashboardNavIcon, DeanNotificationDocIcon, DetailClockIcon, DetailClockReturnIcon, DetailDocIcon, DetailPinIcon, DetailRouteIcon, DocumentIcon, DummySignature, EditPencilIcon, EwanIcon, ExclamationCircleIcon, EyeIcon, EyeOffIcon, FacultyCheckCircleIcon, FacultyChevronRightIcon, FacultyCopyIcon, FacultyCrossCircleIcon, FacultyDocIcon, FacultyFilterIcon, FacultyIdBadgeIcon, FacultyNavIcon, FacultyRoleIcon, FacultyWaitCircleIcon, FileTextIcon, FilledClockIcon, FlashlightIcon, GlobeIcon, GlobeSmIcon, GraduationCapIcon, GridIcon, HeadsetIcon, HelpCircleIcon, HelpIcon, HomeNavIcon, HourglassIcon, HrmuAlertTinyIcon, HrmuChartIcon, HrmuCheckTinyIcon, HrmuExportIcon, HrmuEyeMiniIcon, HrmuFilterIcon, HrmuMapRouteIcon, HrmuMiniCheckIcon, HrmuPinMiniIcon, HrmuReportIcon, HrmuRoleIcon, HrmuSidebarGridIcon, HrmuSyncIcon, HrmuVerificationIcon, HrmuViewRouteIcon, HrmuWarningIcon, IdBadgeIcon, InboxArchiveIcon, InfoIcon, LinkIcon, LocationPinFilledIcon, LocationPinIcon, LockIcon, LockPrivIcon, LockSmallIcon, LoginDoorIcon, LogoutIcon, MailIcon, MapFoldIcon, MapIcon, ModalCloseIcon, NotifPendingIcon, NotificationIcon, PasswordIcon, PermissionsIcon, PersonOutlineIcon, PinIcon, PlayTriangleIcon, PolicyBulbIcon, PolicyCheckIcon, PrivacyIcon, ProfileEditIcon, ProfileNavIcon, ProgressReviewIcon, QuestionCircleIcon, RefreshClockIcon, RefreshIcon, RegistryDownloadIcon, RegistryModalCloseIcon, RegistryModalDoneIcon, RegistryModalIdIcon, RegistryModalVerifiedIcon, RegistryNavIcon, RejectXIcon, RemarksIcon, ReportPrintIcon, RequestsNavIcon, SaveIcon, ScanQRIcon, SendIcon, ShieldCheckIcon, ShieldCheckSmallIcon, ShieldSearchIcon, ShieldSolidIcon, SignalIcon, SignatureNavIcon, SlashedPersonIcon, SlipIcon, StatusGraphIcon, TogaLogoIcon, ToggleSwitch, TrashIcon, UploadIcon, UsersAdminIcon, WifiIcon, XCircleIcon } from "../../components/icons/AppIcons.jsx";
import { LegalDocumentModal } from "../../components/legal/LegalDocuments.jsx";
export const AUTH_ACCOUNT_ROLES = [{
  key: 'faculty',
  label: 'Faculty',
  title: 'Gordon College Faculty Portal',
  icon: FacultyRoleIcon
}];
export const LOGIN_PORTAL_ROLES = [{
  key: 'faculty',
  label: 'Faculty',
  title: 'Gordon College Faculty Portal',
  icon: FacultyRoleIcon,
  portalRole: 'faculty',
  viewports: ['mobile']
}, {
  key: 'dean',
  label: 'Dean',
  title: 'Gordon College Dean Portal',
  icon: AdminRoleIcon,
  portalRole: 'admin',
  viewports: ['mobile']
}, {
  key: 'hrmu',
  label: 'HRMU',
  title: 'Gordon College HRMU Portal',
  icon: HrmuRoleIcon,
  portalRole: 'hrmu',
  viewports: ['desktop']
}, {
  key: 'cssu',
  label: 'CSSU',
  title: 'Gordon College CSSU Portal',
  icon: CssuRoleIcon,
  portalRole: 'cssu',
  viewports: ['mobile', 'desktop']
}];
export const LoginView = ({
  setView,
  loginForm,
  setLoginForm,
  setForgotPasswordBackView,
  onLogin,
  loading,
  showLoginPassword,
  setShowLoginPassword
}) => {
  const getDesktopRoleViewport = () => typeof window !== 'undefined' ? window.innerWidth >= 768 : true;
  const [isDesktopRoleViewport, setIsDesktopRoleViewport] = useState(getDesktopRoleViewport);
  const [selectedRole, setSelectedRole] = useState(() => getDesktopRoleViewport() ? 'hrmu' : 'faculty');
  useEffect(() => {
    const handleResize = () => {
      setIsDesktopRoleViewport(window.innerWidth >= 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const availableRoles = useMemo(() => LOGIN_PORTAL_ROLES.filter(role => role.viewports.includes(isDesktopRoleViewport ? 'desktop' : 'mobile')), [isDesktopRoleViewport]);
  useEffect(() => {
    if (!availableRoles.some(role => role.key === selectedRole) && availableRoles.length > 0) {
      setSelectedRole(availableRoles[0].key);
    }
  }, [availableRoles, selectedRole]);
  const activeRole = availableRoles.find(role => role.key === selectedRole) || availableRoles[0] || LOGIN_PORTAL_ROLES[0];
  const submitPortalRole = activeRole?.portalRole || activeRole?.key || 'faculty';
  return <>
      {/* DESKTOP VIEW */}
      <div className="desktop-view">
        <div className="dlogin-page">
          <div className="dlogin-wrapper fade-in">
            {/* Left Panel */}
            <div className="dlogin-left">
              <div className="dlogin-left-inner">
                <div className="dlogin-logo-section">
                  <div className="dlogin-logo-box auth-brand-logo-box">
                    <TogaLogoIcon size={68} />
                  </div>
                  <h1>EduRoute</h1>
                  <h2>{activeRole.title.toUpperCase()}</h2>
                </div>

                <div className="dlogin-role-section">
                  <p className="dlogin-role-header">SELECT DEPARTMENT ROLE</p>
                  <div className={`dlogin-role-grid dlogin-role-grid--${availableRoles.length}`}>
                    {availableRoles.map(role => {
                    const RoleIcon = role.icon;
                    const isActive = selectedRole === role.key;
                    return <button type="button" key={role.key} className={`dlogin-role-btn ${isActive ? 'active' : ''}`} onClick={() => setSelectedRole(role.key)}>
                          
                          <RoleIcon color={isActive ? 'var(--green)' : '#4B5563'} size="20" />
                          <span>{role.label}</span>
                        </button>;
                  })}
                  </div>
                </div>

              </div>
              <div className="dlogin-bg-circle"></div>
            </div>

            {/* Right Panel */}
            <div className="dlogin-right">
              <div className="dlogin-form-inner">
                <form className="dlogin-form-container" onSubmit={e => onLogin(e, submitPortalRole)}>
                  <div className="dlogin-form-header">
                    <h2>Campus Gateway</h2>
                    <p>Verify your credentials to access the secure administrative environment.</p>
                  </div>

                  <div className="dlogin-form-body">
                    <div className="dlogin-input-group">
                      <label>Staff ID / Email</label>
                      <div className="dlogin-input-wrapper">
                        <BadgeIcon color="#9CA3AF" size="18" />
                        <input type="text" placeholder="e.g. admin.01@gordoncollege.edu.ph" value={loginForm.email_or_employee_id} onChange={e => setLoginForm(prev => ({
                        ...prev,
                        email_or_employee_id: e.target.value
                      }))} />
                        
                      </div>
                    </div>

                    <div className="dlogin-input-group">
                      <div className="dlogin-label-row">
                        <label>Security Passkey</label>
                        <a href="#" className="dlogin-forgot-link" onClick={e => {
                        e.preventDefault();
                        setForgotPasswordBackView('login');
                        setView('forgot-password');
                      }}>
                          
                          Forgot Password
                        </a>
                      </div>
                      <div className="dlogin-input-wrapper">
                        <LockIcon color="#9CA3AF" size="18" />
                        <input type={showLoginPassword ? 'text' : 'password'} placeholder="••••••••••••" value={loginForm.password} onChange={e => setLoginForm(prev => ({
                        ...prev,
                        password: e.target.value
                      }))} />
                        
                        <button type="button" className="dlogin-eye-btn" onClick={() => setShowLoginPassword(prev => !prev)}>
                          
                          <EyeIcon color="#9CA3AF" size="18" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <button type="submit" className="dlogin-submit-btn" disabled={loading}>
                    {loading ? 'Logging in...' : <>Login <ArrowRightIcon color="white" size="18" /></>}
                  </button>

                  <div className="dlogin-divider">
                    <hr />
                    <span>OR</span>
                    <hr />
                  </div>

                  <button type="button" className="dlogin-signup-btn" onClick={() => setView('signup')}>
                    Sign Up
                  </button>

                  <div className="dlogin-security-box">
                    <InfoIcon color="#92400E" size="20" />
                    <p>Security Advisory: Unauthorized access attempts are logged and reported to the institutional security board. Please ensure you are using a secure connection.</p>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE VIEW */}
      <div className="mobile-view">
        <div className="content fade-in login-content">
          <div className="logo-container login-logo-container">
            <div className="logo-box login-logo-box auth-brand-logo-box">
              <TogaLogoIcon size={52} />
            </div>
            <h1>EduRoute</h1>
            <h2 className="login-portal-title">{activeRole.title.toUpperCase()}</h2>
          </div>

          <form className="card login-card" onSubmit={e => onLogin(e, submitPortalRole)}>
            <div className={`role-selector role-selector--${availableRoles.length}`} aria-label="Select portal role">
              {availableRoles.map(role => {
              const RoleIcon = role.icon;
              const isActive = selectedRole === role.key;
              return <button type="button" key={role.key} className={`role-tab ${isActive ? 'active' : ''}`} onClick={() => setSelectedRole(role.key)}>
                    
                    <RoleIcon color={isActive ? 'var(--green)' : '#4e5a4f'} size="23" />
                    <span>{role.label}</span>
                  </button>;
            })}
            </div>

            <div className="login-form-body">
              <div className="input-group">
                <label>EMAIL OR EMPLOYEE ID</label>
                <div className="input-wrapper">
                  <BadgeIcon />
                  <input type="text" placeholder="j.smith@gordoncollege.edu.ph" value={loginForm.email_or_employee_id} onChange={e => setLoginForm(prev => ({
                  ...prev,
                  email_or_employee_id: e.target.value
                }))} />
                  
                </div>
              </div>

              <div className="input-group">
                <div className="label-row">
                  <label>PASSWORD</label>
                  <a href="#" className="forgot-link" onClick={e => {
                  e.preventDefault();
                  setForgotPasswordBackView('login');
                  setView('forgot-password');
                }}>
                    
                    Forgot Password?
                  </a>
                </div>

                <div className="input-wrapper">
                  <LockIcon />
                  <input type={showLoginPassword ? 'text' : 'password'} placeholder="••••••••" value={loginForm.password} onChange={e => setLoginForm(prev => ({
                  ...prev,
                  password: e.target.value
                }))} />
                  

                  <button type="button" className="icon-btn" onClick={() => setShowLoginPassword(prev => !prev)}>
                    
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
      </div>
    </>;
};
export const DesktopAuthShell = ({
  portalLabel,
  sideEyebrow,
  sideTitle,
  sideDescription,
  formTitle,
  formDescription,
  children
}) => <div className="auth-desktop-view fade-in">
    <div className="dlogin-page dauth-page">
      <div className="dlogin-wrapper dauth-wrapper">
        <div className="dlogin-left dauth-left">
          <div className="dlogin-left-inner dauth-left-inner">
            <div className="dlogin-logo-section dauth-logo-section">
              <div className="dlogin-logo-box dauth-logo-box auth-brand-logo-box">
                <TogaLogoIcon size={62} />
              </div>
              <h1>EduRoute</h1>
              <h2>{portalLabel}</h2>
            </div>

            <div className="dauth-side-copy">
              <span className="dauth-side-eyebrow">{sideEyebrow}</span>
              <h3>{sideTitle}</h3>
              <p>{sideDescription}</p>
            </div>

          </div>

          <div className="dlogin-bg-circle dauth-bg-circle" />
        </div>

        <div className="dlogin-right dauth-right">
          <div className="dlogin-form-inner dauth-form-inner">
            <div className="dauth-form-scroll">
              <div className="dlogin-form-header dauth-form-header">
                <h2>{formTitle}</h2>
                <p>{formDescription}</p>
              </div>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>;
export const ForgotPasswordView = ({
  setView,
  forgotForm,
  setForgotForm,
  onForgotPassword,
  loading,
  backView = 'login'
}) => {
  const isProfileRecovery = backView !== 'login';
  const backLabel = isProfileRecovery ? 'Back to Change Password' : 'Back to Login';
  return <>
      <DesktopAuthShell portalLabel="ACCOUNT RECOVERY PORTAL" sideEyebrow="PASSWORD SUPPORT" sideTitle="Recover Access" sideDescription="Use your registered institutional email to receive a secure reset PIN and restore access to your account." formTitle="Account Recovery" formDescription="Enter your registered institutional email to receive a secure password reset PIN.">
        
        <form className="card recovery-card dauth-card dauth-recovery-card" onSubmit={onForgotPassword}>
          <div className="input-group">
            <label>INSTITUTIONAL EMAIL</label>
            <div className="input-wrapper tall-input-wrapper">
              <div className="at-icon-wrapper"><AtSymbolIcon /></div>
              <textarea placeholder="e.g.&#10;professor.name@eduroute.edu" rows={2} spellCheck="false" value={forgotForm.email} onChange={e => setForgotForm(prev => ({
              ...prev,
              email: e.target.value
            }))} />
              
            </div>
          </div>

          <button type="submit" className="primary-btn" disabled={loading}>
            {loading ? 'Sending...' : <>Send Reset PIN <ArrowRightIcon /></>}
          </button>

          <button type="button" className="ghost-btn" onClick={() => setView(backView)}>
            <LoginDoorIcon /> {backLabel}
          </button>
        </form>

        <div className="support-badge dauth-support-badge">
          <div className="support-icon">
            <HeadsetIcon />
          </div>
          <div className="support-text">
            Issue persists? Contact<br />
            <span>IT Support Desk</span>
          </div>
        </div>
      </DesktopAuthShell>

      <div className="auth-mobile-view content fade-in forgot-pw-content">
        <div className="recovery-header">
          {isProfileRecovery && <button type="button" className="recovery-back-btn" onClick={() => setView(backView)} aria-label={backLabel}>
              <BackArrowIcon color="var(--green)" />
            </button>}
          <CapIcon />
          <span>EduRoute Portal</span>
        </div>

        <div className="recovery-title-box">
          <div className="yellow-bar"></div>
          <h1>Account<br />Recovery</h1>
        </div>

        <p className="recovery-desc">
          Enter your registered institutional email to receive a secure password reset PIN.
        </p>

        <form className="card recovery-card" onSubmit={onForgotPassword}>
          <div className="input-group">
            <label>INSTITUTIONAL EMAIL</label>
            <div className="input-wrapper tall-input-wrapper">
              <div className="at-icon-wrapper"><AtSymbolIcon /></div>
              <textarea placeholder="e.g.&#10;professor.name@eduroute.edu" rows={2} spellCheck="false" value={forgotForm.email} onChange={e => setForgotForm(prev => ({
              ...prev,
              email: e.target.value
            }))} />
              
            </div>
          </div>

          <button type="submit" className="primary-btn" disabled={loading}>
            {loading ? 'Sending...' : <>Send Reset PIN <ArrowRightIcon /></>}
          </button>

          <button type="button" className="ghost-btn" onClick={() => setView(backView)}>
            <LoginDoorIcon /> {backLabel}
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
    </>;
};
export const ResetCodeView = ({
  setView,
  resetCode,
  setResetCode,
  onVerifyResetCode,
  onResendResetCode,
  resendCooldown,
  loading
}) => {
  const codeInputRefs = useRef([]);
  const digits = Array.from({
    length: 6
  }, (_, index) => resetCode[index] || '');
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
  const handleCodePaste = e => {
    e.preventDefault();
    const pastedCode = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    setResetCode(pastedCode);
    codeInputRefs.current[Math.min(pastedCode.length, 5)]?.focus();
  };
  return <>
      <DesktopAuthShell portalLabel="ACCOUNT RECOVERY PORTAL" sideEyebrow="VERIFICATION STEP" sideTitle="Confirm Reset PIN" sideDescription="Enter the six-digit reset PIN sent to the registered account so we can verify this password recovery request." formTitle="Enter Reset PIN" formDescription="Type the six-digit verification PIN and continue to set a new password.">
        
        <form className="card recovery-card reset-code-card dauth-card dauth-recovery-card" onSubmit={onVerifyResetCode}>
          <div className="input-group">
            <label>TYPE RESET PIN</label>
            <div className="otp-code-row" onPaste={handleCodePaste}>
              {digits.map((digit, index) => <input key={index} ref={node => {
              codeInputRefs.current[index] = node;
            }} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={1} className="otp-code-box" value={digit} aria-label={`Reset code digit ${index + 1}`} onChange={e => updateDigit(index, e.target.value)} onKeyDown={e => handleCodeKeyDown(index, e)} />)}
            </div>
          </div>

          <button type="button" className="resend-code-btn" disabled={!canResend} onClick={onResendResetCode}>
            
            {canResend ? 'RESEND CODE' : `RESEND IN ${resendCooldown}s`}
          </button>

          <button type="submit" className="primary-btn reset-verify-btn" disabled={loading || resetCode.length !== 6}>
            {loading ? 'Verifying...' : <>Verify <ArrowRightIcon /></>}
          </button>

          <button type="button" className="ghost-btn reset-back-btn" onClick={() => setView('login')}>
            <LoginDoorIcon /> Back to Faculty Login
          </button>
        </form>

        <div className="support-badge dauth-support-badge">
          <div className="support-icon">
            <HeadsetIcon />
          </div>
          <div className="support-text">
            Issue persists? Contact<br />
            <span>IT Support Desk</span>
          </div>
        </div>
      </DesktopAuthShell>

      <div className="auth-mobile-view content fade-in forgot-pw-content reset-code-content">
        <div className="recovery-header">
          <CapIcon />
          <span>EduRoute Faculty</span>
        </div>

        <div className="recovery-title-box reset-code-title-box">
          <div className="yellow-bar"></div>
          <h1>Account<br />Recovery</h1>
        </div>

        <p className="recovery-desc reset-code-desc">
          Enter the six-digit PIN sent to your registered faculty email.
        </p>

        <form className="card recovery-card reset-code-card" onSubmit={onVerifyResetCode}>
          <div className="input-group">
            <label>TYPE RESET PIN</label>
            <div className="otp-code-row" onPaste={handleCodePaste}>
              {digits.map((digit, index) => <input key={index} ref={node => {
              codeInputRefs.current[index] = node;
            }} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={1} className="otp-code-box" value={digit} aria-label={`Reset code digit ${index + 1}`} onChange={e => updateDigit(index, e.target.value)} onKeyDown={e => handleCodeKeyDown(index, e)} />)}
            </div>
          </div>

          <button type="button" className="resend-code-btn" disabled={!canResend} onClick={onResendResetCode}>
            
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
    </>;
};
export const SetNewPasswordView = ({
  newPasswordForm,
  setNewPasswordForm,
  onResetPassword,
  loading
}) => {
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);
  const resetPasswordPolicy = useMemo(() => {
    const password = newPasswordForm.password;
    return {
      minLength: password.length >= 10,
      symbolsNumbers: /[0-9]/.test(password) && /[^a-zA-Z0-9\s]/.test(password),
      noPersonal: password.length > 0 && !['eduroute', 'password', 'faculty'].some(info => password.toLowerCase().includes(info))
    };
  }, [newPasswordForm.password]);
  const passwordsMatch = newPasswordForm.password.length > 0 && newPasswordForm.password === newPasswordForm.confirm_password;
  const policyComplete = resetPasswordPolicy.minLength && resetPasswordPolicy.symbolsNumbers && resetPasswordPolicy.noPersonal;
  const canSavePassword = policyComplete && passwordsMatch && !loading;
  const handleSubmit = e => {
    if (!canSavePassword) {
      e.preventDefault();
      return;
    }
    onResetPassword(e);
  };
  return <>
      <DesktopAuthShell portalLabel="ACCOUNT RECOVERY PORTAL" sideEyebrow="SECURE RESET" sideTitle="Create A New Password" sideDescription="Set a fresh password that meets the institutional policy before access is restored." formTitle="Set New Password" formDescription="Create a strong new password and confirm it to finish the account recovery flow.">
        
        <div className="password-policy-card set-password-policy-card dauth-policy-card">
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

        <form className="card recovery-card set-password-card dauth-card dauth-set-password-card" onSubmit={handleSubmit}>
          <h2 className="set-password-card-title">SET NEW PASSWORD</h2>

          <div className="input-group">
            <label>PASSWORD</label>
            <div className="input-wrapper plain-input-wrapper">
              <input type={showResetPassword ? 'text' : 'password'} placeholder="••••••••" value={newPasswordForm.password} onChange={e => setNewPasswordForm(prev => ({
              ...prev,
              password: e.target.value
            }))} />
              
              <button type="button" className="signup-eye-btn" aria-label={showResetPassword ? 'Hide password' : 'Show password'} onClick={() => setShowResetPassword(prev => !prev)}>
                
                {showResetPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div className="input-group">
            <label>CONFIRM PASSWORD</label>
            <div className="input-wrapper plain-input-wrapper">
              <input type={showResetConfirmPassword ? 'text' : 'password'} placeholder="••••••••" value={newPasswordForm.confirm_password} onChange={e => setNewPasswordForm(prev => ({
              ...prev,
              confirm_password: e.target.value
            }))} />
              
              <button type="button" className="signup-eye-btn" aria-label={showResetConfirmPassword ? 'Hide confirm password' : 'Show confirm password'} onClick={() => setShowResetConfirmPassword(prev => !prev)}>
                
                {showResetConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {newPasswordForm.confirm_password.length > 0 && !passwordsMatch && <span className="set-password-mismatch">Passwords do not match</span>}

          <button type="submit" className={`primary-btn set-password-save-btn ${canSavePassword ? 'ready' : 'disabled'}`} disabled={!canSavePassword}>
            
            {loading ? 'Saving...' : <>Save Password <ArrowRightIcon /></>}
          </button>
        </form>

        <div className="support-badge dauth-support-badge">
          <div className="support-icon">
            <HeadsetIcon />
          </div>
          <div className="support-text">
            Issue persists? Contact<br />
            <span>IT Support Desk</span>
          </div>
        </div>
      </DesktopAuthShell>

      <div className="auth-mobile-view content fade-in forgot-pw-content set-password-content">
        <div className="recovery-header">
          <CapIcon />
          <span>EduRoute Faculty</span>
        </div>

        <div className="recovery-title-box set-password-title-box">
          <div className="yellow-bar"></div>
          <h1>Set New<br />Password</h1>
        </div>

        <p className="recovery-desc set-password-desc">
          Create a new password after verifying your six-digit reset PIN.
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
              <input type={showResetPassword ? 'text' : 'password'} placeholder="••••••••" value={newPasswordForm.password} onChange={e => setNewPasswordForm(prev => ({
              ...prev,
              password: e.target.value
            }))} />
              
              <button type="button" className="signup-eye-btn" aria-label={showResetPassword ? 'Hide password' : 'Show password'} onClick={() => setShowResetPassword(prev => !prev)}>
                
                {showResetPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div className="input-group">
            <label>CONFIRM PASSWORD</label>
            <div className="input-wrapper plain-input-wrapper">
              <input type={showResetConfirmPassword ? 'text' : 'password'} placeholder="••••••••" value={newPasswordForm.confirm_password} onChange={e => setNewPasswordForm(prev => ({
              ...prev,
              confirm_password: e.target.value
            }))} />
              
              <button type="button" className="signup-eye-btn" aria-label={showResetConfirmPassword ? 'Hide confirm password' : 'Show confirm password'} onClick={() => setShowResetConfirmPassword(prev => !prev)}>
                
                {showResetConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {newPasswordForm.confirm_password.length > 0 && !passwordsMatch && <span className="set-password-mismatch">Passwords do not match</span>}

          <button type="submit" className={`primary-btn set-password-save-btn ${canSavePassword ? 'ready' : 'disabled'}`} disabled={!canSavePassword}>
            
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
    </>;
};
export const SignUpView = ({
  setView,
  registerForm,
  setRegisterForm,
  departments,
  onRegister,
  loading
}) => {
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);
  const [activeLegalDoc, setActiveLegalDoc] = useState(null);
  const signupRole = AUTH_ACCOUNT_ROLES[0];
  const signupNeedsDepartment = true;
  const signupPasswordPolicy = useMemo(() => {
    const password = registerForm.password;
    const passwordLower = password.toLowerCase();
    const personalInfo = [registerForm.full_name, registerForm.employee_id, registerForm.email, 'eduroute'].flatMap(value => String(value || '').toLowerCase().split(/[^a-z0-9]+/)).filter(value => value.length >= 3);
    return {
      minLength: password.length >= 10,
      symbolsNumbers: /[0-9]/.test(password) && /[^a-zA-Z0-9\s]/.test(password),
      noPersonal: password.length > 0 && !personalInfo.some(info => passwordLower.includes(info))
    };
  }, [registerForm.email, registerForm.employee_id, registerForm.full_name, registerForm.password]);
  const signupPasswordsMatch = registerForm.password.length > 0 && registerForm.password === registerForm.confirm_password;
  const signupPolicyComplete = signupPasswordPolicy.minLength && signupPasswordPolicy.symbolsNumbers && signupPasswordPolicy.noPersonal;
  const canRegister = signupPolicyComplete && signupPasswordsMatch && registerForm.terms_accepted && registerForm.privacy_accepted && (!signupNeedsDepartment || registerForm.department_id) && !loading;
  const handleSignupSubmit = e => {
    if (!canRegister) {
      e.preventDefault();
      return;
    }
    onRegister(e);
  };
  return <>
      <DesktopAuthShell portalLabel={signupRole.title.toUpperCase()} sideEyebrow="INSTITUTIONAL ONBOARDING" sideTitle={`Create ${signupRole.label} Access`} sideDescription="Set up a secure EduRoute account with institutional details and a compliant password." formTitle={`Create ${signupRole.label} Account`} formDescription="Enter your institutional details to begin and review the password policy before submitting.">
        
        <form className="card signup-card dauth-card dauth-signup-card" onSubmit={handleSignupSubmit}>
          <div className="signup-header">
            <h1>Create {signupRole.label}<br />Account</h1>
            <p>Please enter your institutional details to begin.</p>
          </div>

          <div className="input-group">
            <label>FULL NAME</label>
            <div className="input-wrapper plain-input-wrapper">
              <input type="text" placeholder="Dr. Julian Vane" value={registerForm.full_name} onChange={e => setRegisterForm(prev => ({
              ...prev,
              full_name: e.target.value
            }))} />
              
            </div>
          </div>

          <div className="input-group">
            <label>EMPLOYEE ID</label>
            <div className="input-wrapper plain-input-wrapper">
              <input type="text" placeholder="FAC-88920" value={registerForm.employee_id} onChange={e => setRegisterForm(prev => ({
              ...prev,
              employee_id: e.target.value
            }))} />
              
            </div>
          </div>

          {signupNeedsDepartment && <div className="input-group">
              <label>DEPARTMENT</label>
              <div className="input-wrapper plain-input-wrapper select-wrapper">
                <select value={registerForm.department_id} onChange={e => setRegisterForm(prev => ({
              ...prev,
              department_id: e.target.value
            }))}>
                
                  <option value="" disabled>Select Department</option>
                  {departments.map(dept => <option key={dept.id} value={dept.id}>
                      {dept.department_name}
                    </option>)}
                </select>
                <div className="select-icon">
                  <ChevronDownIcon />
                </div>
              </div>
            </div>}

          <div className="input-group">
            <label>EMAIL ADDRESS</label>
            <div className="input-wrapper plain-input-wrapper">
              <input type="email" placeholder="faculty@gordoncollege.edu.ph" value={registerForm.email} onChange={e => setRegisterForm(prev => ({
              ...prev,
              email: e.target.value
            }))} />
              
            </div>
          </div>

          <div className="password-policy-card dauth-policy-card">
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
              <input type={showSignupPassword ? 'text' : 'password'} placeholder="••••••••" value={registerForm.password} onChange={e => setRegisterForm(prev => ({
              ...prev,
              password: e.target.value
            }))} />
              
              <button type="button" className="signup-eye-btn" aria-label={showSignupPassword ? 'Hide password' : 'Show password'} onClick={() => setShowSignupPassword(prev => !prev)}>
                
                {showSignupPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div className="input-group">
            <label>CONFIRM PASSWORD</label>
            <div className="input-wrapper plain-input-wrapper">
              <input type={showSignupConfirmPassword ? 'text' : 'password'} placeholder="••••••••" value={registerForm.confirm_password} onChange={e => setRegisterForm(prev => ({
              ...prev,
              confirm_password: e.target.value
            }))} />
              
              <button type="button" className="signup-eye-btn" aria-label={showSignupConfirmPassword ? 'Hide confirm password' : 'Show confirm password'} onClick={() => setShowSignupConfirmPassword(prev => !prev)}>
                
                {showSignupConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <label className="checkbox-container">
            <input type="checkbox" checked={registerForm.terms_accepted} onChange={e => setRegisterForm(prev => ({
            ...prev,
            terms_accepted: e.target.checked
          }))} />
            
            <span className="checkmark"></span>
            <span className="checkbox-label">
              I agree to the{' '}
              <button type="button" className="legal-inline-link" onClick={() => setActiveLegalDoc('terms')}>
                Terms of Service
              </button>.
            </span>
          </label>

          <label className="checkbox-container">
            <input type="checkbox" checked={registerForm.privacy_accepted} onChange={e => setRegisterForm(prev => ({
            ...prev,
            privacy_accepted: e.target.checked
          }))} />
            
            <span className="checkmark"></span>
            <span className="checkbox-label">
              I agree to the{' '}
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
      </DesktopAuthShell>

      <div className="auth-mobile-view content fade-in signup-content">
        <form className="card signup-card" onSubmit={handleSignupSubmit}>
          <div className="signup-header">
            <h1>Create {signupRole.label}<br />Account</h1>
            <p>Please enter your institutional details to begin.</p>
          </div>

          <div className="input-group">
            <label>FULL NAME</label>
            <div className="input-wrapper plain-input-wrapper">
              <input type="text" placeholder="Dr. Julian Vane" value={registerForm.full_name} onChange={e => setRegisterForm(prev => ({
              ...prev,
              full_name: e.target.value
            }))} />
              
            </div>
          </div>

          <div className="input-group">
            <label>EMPLOYEE ID</label>
            <div className="input-wrapper plain-input-wrapper">
              <input type="text" placeholder="FAC-88920" value={registerForm.employee_id} onChange={e => setRegisterForm(prev => ({
              ...prev,
              employee_id: e.target.value
            }))} />
              
            </div>
          </div>

          {signupNeedsDepartment && <div className="input-group">
              <label>DEPARTMENT</label>
              <div className="input-wrapper plain-input-wrapper select-wrapper">
                <select value={registerForm.department_id} onChange={e => setRegisterForm(prev => ({
              ...prev,
              department_id: e.target.value
            }))}>
                
                  <option value="" disabled>Select Department</option>
                  {departments.map(dept => <option key={dept.id} value={dept.id}>
                      {dept.department_name}
                    </option>)}
                </select>
                <div className="select-icon">
                  <ChevronDownIcon />
                </div>
              </div>
            </div>}

          <div className="input-group">
            <label>EMAIL ADDRESS</label>
            <div className="input-wrapper plain-input-wrapper">
              <input type="email" placeholder="faculty@gordoncollege.edu.ph" value={registerForm.email} onChange={e => setRegisterForm(prev => ({
              ...prev,
              email: e.target.value
            }))} />
              
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
              <input type={showSignupPassword ? 'text' : 'password'} placeholder="••••••••" value={registerForm.password} onChange={e => setRegisterForm(prev => ({
              ...prev,
              password: e.target.value
            }))} />
              
              <button type="button" className="signup-eye-btn" aria-label={showSignupPassword ? 'Hide password' : 'Show password'} onClick={() => setShowSignupPassword(prev => !prev)}>
                
                {showSignupPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div className="input-group">
            <label>CONFIRM PASSWORD</label>
            <div className="input-wrapper plain-input-wrapper">
              <input type={showSignupConfirmPassword ? 'text' : 'password'} placeholder="••••••••" value={registerForm.confirm_password} onChange={e => setRegisterForm(prev => ({
              ...prev,
              confirm_password: e.target.value
            }))} />
              
              <button type="button" className="signup-eye-btn" aria-label={showSignupConfirmPassword ? 'Hide confirm password' : 'Show confirm password'} onClick={() => setShowSignupConfirmPassword(prev => !prev)}>
                
                {showSignupConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <label className="checkbox-container">
            <input type="checkbox" checked={registerForm.terms_accepted} onChange={e => setRegisterForm(prev => ({
            ...prev,
            terms_accepted: e.target.checked
          }))} />
            
            <span className="checkmark"></span>
            <span className="checkbox-label">
              I agree to the{' '}
              <button type="button" className="legal-inline-link" onClick={() => setActiveLegalDoc('terms')}>
                Terms of Service
              </button>.
            </span>
          </label>

          <label className="checkbox-container">
            <input type="checkbox" checked={registerForm.privacy_accepted} onChange={e => setRegisterForm(prev => ({
            ...prev,
            privacy_accepted: e.target.checked
          }))} />
            
            <span className="checkmark"></span>
            <span className="checkbox-label">
              I agree to the{' '}
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
          <div className="signup-footer-logo auth-brand-logo-box">
            <TogaLogoIcon size={34} />
          </div>
          <div className="footer-text signup-footer-text">
            <span className="footer-developed">DEVELOPED BY</span>
            <span className="footer-brand">ARCHONS</span>
          </div>
        </div>

      </div>

      <LegalDocumentModal activeLegalDoc={activeLegalDoc} onClose={() => setActiveLegalDoc(null)} />
      
    </>;
};
