import { useEffect, useMemo, useState } from 'react';
import { TogaLogoIcon } from '../../components/icons/AppIcons.jsx';
import { LEGAL_DOCUMENTS, LegalDocumentModal } from '../../components/legal/LegalDocuments.jsx';
import './landing.css';

const roles = [
  {
    title: 'Employee',
    description: 'Submit slips, track status, and view history in a streamlined mobile interface.',
    icon: 'faculty'
  },
  {
    title: 'Supervisor',
    description: 'Approve or flag department-wide locator slips with high-level oversight.',
    icon: 'dean'
  },
  {
    title: 'ISSU',
    description: 'Live monitoring of entry and exit logs via rapid QR scanning dashboard.',
    icon: 'issu'
  },
  {
    title: 'HRMU',
    description: 'Administer global settings and generate comprehensive compliance reports.',
    icon: 'hrmu'
  }
];

const capabilities = [
  {
    title: 'Digital Locator Slip',
    description: 'Dynamic form submission with real-time field validation and mission tracking.',
    icon: 'document'
  },
  {
    title: 'Approval & Signature',
    description: 'Multi-tier approval hierarchy with digital signature verification.',
    icon: 'signature'
  },
  {
    title: 'QR Code Generation',
    description: 'Time-sensitive, unique QR codes generated instantly upon authorization.',
    icon: 'qr'
  },
  {
    title: 'QR Code Verification',
    description: 'Rapid contactless scanning for security personnel with instant cloud logging.',
    icon: 'scan'
  },
  {
    title: 'Paperless Workflow',
    description: 'Eliminate administrative overhead and environmental waste with digital logs.',
    icon: 'paperless'
  },
  {
    title: 'Reports & Analytics',
    description: 'Comprehensive data visualization for HRMU to monitor institutional movement trends.',
    icon: 'analytics'
  }
];

const interfaceCards = [
  {
    title: 'Create Locator Slip',
    image: '/landing/interface-create-locator.png',
    alt: 'EduRoute mobile screen for creating a employee locator slip'
  },
  {
    title: 'Verification in Progress',
    image: '/landing/interface-verification.png',
    alt: 'EduRoute mobile screen showing verification in progress'
  },
  {
    title: 'Request Status',
    image: '/landing/interface-status.png',
    alt: 'EduRoute mobile screen showing locator slip status list'
  },
  {
    title: 'Request Details',
    image: '/landing/interface-details.png',
    alt: 'EduRoute mobile screen showing verified request details'
  }
];

const LandingIcon = ({ name }) => {
  const commonProps = {
    width: '24',
    height: '24',
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': 'true'
  };
  const paths = {
    faculty: <path d="M12 12.5a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0M8 20.5h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    dean: <path d="m3 8.5 9-4 9 4-9 4-9-4Zm3.5 3v4.2c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3v-4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    issu: <path d="M12 21s7-3.2 7-10.2V5.5L12 3 5 5.5v5.3C5 17.8 12 21 12 21Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    hrmu: <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8.5 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 20a5 5 0 0 1 10 0m1.5 0a4 4 0 0 1 6.5-3.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    document: <path d="M7 3h7l4 4v14H7V3Zm7 0v5h4M9.5 12h5M9.5 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    signature: <path d="M5 17c3-6 5-8 6-7 1.4 1.3-4 8 0 8 2.4 0 4.2-3 6-3 1.1 0 1.7.8 2 2M6 21h12M16.5 4.5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    qr: <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm11 0h1.5v2H19v4h-5v-2.5h2V16h-1v-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    scan: <path d="M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m8 0h3a1 1 0 0 0 1-1v-3M7 12h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    paperless: <path d="M7 4h9l3 3v13H7V4Zm9 0v4h3M5 8H3v13h10v-2M10 13l2 2 4-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    analytics: <path d="M5 19V9m7 10V5m7 14v-7M3 21h18M5 9l7-4 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    phone: <path d="M9 2.8h6a2 2 0 0 1 2 2v14.4a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4.8a2 2 0 0 1 2-2Zm2 15.4h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    monitor: <path d="M4 5h16v10H4V5Zm5 15h6m-3-5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  };

  return <svg {...commonProps}>{paths[name] || paths.document}</svg>;
};

const LandingLogo = () => (
  <a className="landing-logo" href="/" aria-label="EduRoute home">
    <span className="landing-logo-mark" aria-hidden="true">
      <TogaLogoIcon size={34} />
    </span>
    <span className="landing-logo-edu">Edu</span>
    <span className="landing-logo-route">Route</span>
  </a>
);

const usePwaInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installMessage, setInstallMessage] = useState('');

  useEffect(() => {
    const handleBeforeInstallPrompt = event => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const requestInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => null);
      setDeferredPrompt(null);
      setInstallMessage('If EduRoute was installed, you can now open it from your device home screen.');
      return;
    }

    setInstallMessage('To install EduRoute, open your browser menu and choose Add to Home Screen or Install App.');
    document.getElementById('landing-download')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  };

  return {
    installMessage,
    requestInstall
  };
};

const LandingHeader = ({ onInstall }) => (
  <header className="landing-header">
    <nav className="landing-nav" aria-label="Landing page navigation">
      <LandingLogo />
      <div className="landing-nav-actions">
        <a className="landing-login-link" href="/#/login">Portal Login</a>
        <button className="landing-download-btn" type="button" onClick={onInstall}>Download App</button>
      </div>
    </nav>
  </header>
);

const HeroSection = ({ onInstall }) => {
  const scrollToCapabilities = () => {
    document.getElementById('landing-capabilities')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  };

  return <section className="landing-hero" aria-labelledby="landing-hero-title">
    <div className="landing-container landing-hero-grid">
      <div className="landing-hero-copy">
        <span className="landing-badge"><span /> GORDON COLLEGE OFFICIAL SYSTEM</span>
        <h1 id="landing-hero-title">Digitizing Employee Locator Slip Management</h1>
        <p>
          Secure digital requests, QR code verification, and paperless approval workflow. A unified platform for institutional logistics and accountability.
        </p>
        <div className="landing-hero-actions">
          <a className="landing-primary-btn" href="/#/login">Get Started Today</a>
          <button className="landing-outline-btn" type="button" onClick={scrollToCapabilities}>View Documentation</button>
        </div>
      </div>
    </div>
  </section>;
};

const RoleCards = () => (
  <section className="landing-roles" aria-labelledby="landing-roles-title">
    <div className="landing-container">
      <h2 id="landing-roles-title">Integrated Stakeholder Roles</h2>
      <div className="landing-role-grid">
        {roles.map(role => <article className="landing-role-card" key={role.title}>
          <div className="landing-role-icon"><LandingIcon name={role.icon} /></div>
          <h3>{role.title}</h3>
          <p>{role.description}</p>
        </article>)}
      </div>
    </div>
  </section>
);

const CapabilityCards = () => (
  <section className="landing-capabilities" id="landing-capabilities" aria-labelledby="landing-capabilities-title">
    <div className="landing-container">
      <div className="landing-section-heading">
        <h2 id="landing-capabilities-title">Advanced System Capabilities</h2>
        <p>
          EduRoute leverages modern cloud infrastructure to provide a secure and efficient experience for academic institutions.
        </p>
      </div>
      <div className="landing-capability-grid">
        {capabilities.map(capability => <article className="landing-capability-card" key={capability.title}>
          <div className="landing-capability-icon"><LandingIcon name={capability.icon} /></div>
          <h3>{capability.title}</h3>
          <p>{capability.description}</p>
        </article>)}
      </div>
    </div>
  </section>
);

const Checklist = ({ items }) => (
  <ul className="landing-checklist">
    {items.map(item => <li key={item}><span />{item}</li>)}
  </ul>
);

const DownloadPortalSection = ({ installMessage, onInstall }) => (
  <section className="landing-cta-section" id="landing-download" aria-labelledby="landing-download-title">
    <div className="landing-container">
      <h2 id="landing-download-title" className="landing-sr-only">Download and portal access</h2>
      <div className="landing-cta-grid">
        <article className="landing-cta-card landing-cta-card-light">
          <div className="landing-cta-icon"><LandingIcon name="phone" /></div>
          <h3>Employee Users</h3>
          <p>
            Install the EduRoute Progressive Web App directly to your home screen for quick submission and QR code access. Compatible with iOS and Android.
          </p>
          <Checklist items={[
            'Quick slip submission & status tracking',
            'Instant access to approved QR codes',
            'Personalized mission history logs'
          ]} />
          <button className="landing-primary-btn landing-full-btn" type="button" onClick={onInstall}>Download Employee PWA</button>
        </article>
        <article className="landing-cta-card landing-cta-card-green">
          <div className="landing-cta-icon"><LandingIcon name="monitor" /></div>
          <h3>Administrator Portal</h3>
          <p>
            Access the complete portal for Supervisors, ISSU, and HRMU. Full analytics, live tracking, and system configuration.
          </p>
          <Checklist items={[
            'Supervisor approval dashboard & alerts',
            'QR Code Verification',
            'Automated monthly HRMU Report'
          ]} />
          <a className="landing-white-btn landing-full-btn" href="/#/login">Open Web Portal</a>
        </article>
      </div>
      {installMessage && <p className="landing-install-message" role="status">{installMessage}</p>}
    </div>
  </section>
);

const PhoneMockup = ({ card }) => (
  <article className="landing-phone-mockup">
    <img src={card.image} alt={card.alt} loading="lazy" />
    <span>{card.title}</span>
  </article>
);

const InterfaceShowcase = () => (
  <section className="landing-interface" aria-labelledby="landing-interface-title">
    <div className="landing-container">
      <div className="landing-section-heading">
        <h2 id="landing-interface-title">A Modern Interface for Academic Work</h2>
        <p>Visual consistency across all devices, optimized for readability and performance.</p>
      </div>
      <div className="landing-phone-grid">
        {interfaceCards.map(card => <PhoneMockup card={card} key={card.title} />)}
      </div>
    </div>
  </section>
);

const LandingFooter = ({ onOpenLegal }) => (
  <footer className="landing-footer">
    <div className="landing-container landing-footer-inner">
      <LandingLogo />
      <p>© 2026 EduRoute. All rights reserved.</p>
      <div className="landing-footer-links" aria-label="EduRoute legal documents">
        <button type="button" onClick={() => onOpenLegal ? onOpenLegal('privacy') : window.location.assign('/privacy-policy')}>Privacy Policy</button>
        <button type="button" onClick={() => onOpenLegal ? onOpenLegal('terms') : window.location.assign('/terms')}>Terms of Service</button>
      </div>
    </div>
  </footer>
);

export default function LandingPage() {
  const { installMessage, requestInstall } = usePwaInstallPrompt();
  const [activeLegalDoc, setActiveLegalDoc] = useState(null);

  return <main className="landing-page">
    <LandingHeader onInstall={requestInstall} />
    <HeroSection onInstall={requestInstall} />
    <RoleCards />
    <CapabilityCards />
    <DownloadPortalSection installMessage={installMessage} onInstall={requestInstall} />
    <InterfaceShowcase />
    <LandingFooter onOpenLegal={setActiveLegalDoc} />
    <LegalDocumentModal activeLegalDoc={activeLegalDoc} onClose={() => setActiveLegalDoc(null)} />
  </main>;
}

export function PublicLegalPage({ type }) {
  const legalDoc = useMemo(() => {
    if (type === 'terms') return LEGAL_DOCUMENTS.terms;
    return LEGAL_DOCUMENTS.privacy;
  }, [type]);

  return <main className="landing-page landing-legal-page">
    <LandingHeader onInstall={() => {
      document.getElementById('landing-legal-install-note')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }} />
    <section className="landing-legal-section">
      <div className="landing-container landing-legal-card">
        <a className="landing-back-link" href="/">Back to Home</a>
        <span className="landing-badge"><span /> EDUROUTE DATA PRIVACY</span>
        <h1>{legalDoc.title}</h1>
        <p>{legalDoc.body}</p>
        <div className="landing-legal-list">
          {legalDoc.sections.map(section => <article key={section.heading}>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </article>)}
        </div>
        <p id="landing-legal-install-note" className="landing-install-message">
          To install EduRoute, open your browser menu and choose Add to Home Screen or Install App.
        </p>
      </div>
    </section>
    <LandingFooter />
  </main>;
}
