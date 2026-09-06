import { Component } from 'react';
import '../App.css';
import LegacyApp from './legacy/LegacyApp.jsx';
import LandingPage, { PublicLegalPage } from './public/LandingPage.jsx';
import { getViewFromUrlHash } from './routing/portalRouting.js';

class AppRecoveryBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null
    };
  }

  static getDerivedStateFromError(error) {
    return {
      error
    };
  }

  componentDidCatch(error, info) {
    console.error('EduRoute recovered from a render error:', error, info);
  }

  resetSession = () => {
    localStorage.removeItem('edurouteLastView');
    localStorage.removeItem('edurouteVerifySlipId');
    localStorage.removeItem('edurouteMapSlipId');
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    window.location.reload();
  };

  retry = () => {
    this.setState({
      error: null
    });
  };

  render() {
    if (this.state.error) {
      return <div className="eduroute-recovery-screen">
          <div className="eduroute-recovery-card">
            <span className="eduroute-recovery-kicker">EDUROUTE RECOVERY</span>
            <h1>We restored the portal shell</h1>
            <p>
              A saved page failed to render after the frontend split. You can retry the page or return to a clean portal start without clearing your account.
            </p>
            <div className="eduroute-recovery-actions">
              <button type="button" onClick={this.retry}>Retry Page</button>
              <button type="button" className="secondary" onClick={this.resetSession}>Return to Portal Start</button>
            </div>
            <small>{this.state.error?.message || 'Unknown render error'}</small>
          </div>
        </div>;
    }

    return this.props.children;
  }
}

// Transitional root for the ongoing EduRoute frontend split.
// New portal routes should be extracted beside this file instead of growing
// the legacy implementation further.
export default function AppRoot() {
  const normalizedPath = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  const isPortalHashRoute = Boolean(getViewFromUrlHash());
  const isLandingRoute = normalizedPath === '/' && !isPortalHashRoute;
  const isPrivacyRoute = normalizedPath === '/privacy-policy';
  const isTermsRoute = normalizedPath === '/terms';

  return <AppRecoveryBoundary>
      {isLandingRoute && <LandingPage />}
      {isPrivacyRoute && <PublicLegalPage type="privacy" />}
      {isTermsRoute && <PublicLegalPage type="terms" />}
      {!isLandingRoute && !isPrivacyRoute && !isTermsRoute && <LegacyApp />}
    </AppRecoveryBoundary>;
}
