import { ArrowRightIcon, FileTextIcon, QuestionCircleIcon, ShieldSearchIcon } from "../icons/AppIcons.jsx";
import { decodeJwtPayload } from "../../app/routing/portalRouting.js";
export const LEGAL_DOCUMENTS = {
  terms: {
    title: 'Terms and Conditions',
    body: 'By using EduRoute, you agree to use the system only for official faculty locator slip processing, trip validation, monitoring, and reporting.',
    sections: [{
      heading: '1. Authorized Use',
      body: 'EduRoute is intended for authorized users only, including Faculty, Deans, CSSU, HRMU, and approved system administrators.'
    }, {
      heading: '2. User Responsibility',
      body: 'Users must provide accurate locator slip details, follow institutional policies, and use their own account only. Sharing login credentials or submitting false information is prohibited.'
    }, {
      heading: '3. Role-Based Access',
      body: 'Each user can only access features and records allowed for their role. Faculty may access their own locator slips and trips. Deans may review requests from their assigned college. CSSU may validate exits. HRMU may monitor, verify, and generate reports.'
    }, {
      heading: '4. Location and Trip Monitoring',
      body: 'Location tracking is used only for approved official trips and monitoring purposes. Users must allow location access when starting and completing trips.'
    }, {
      heading: '5. Proof of Compliance',
      body: 'Uploaded signatures, photos, focal person details, and related records must be truthful and submitted only for official verification.'
    }, {
      heading: '6. System Availability',
      body: 'EduRoute may be affected by internet connection, device settings, server maintenance, or third-party services such as maps, notifications, and storage providers.'
    }, {
      heading: '7. Data Privacy',
      body: 'Personal and trip-related information will be processed according to the EduRoute Privacy Policy and applicable data privacy laws.'
    }, {
      heading: '8. Misuse of the System',
      body: 'The institution may review, restrict, or suspend access if a user misuses EduRoute, tampers with records, submits false data, or violates institutional rules.'
    }, {
      heading: '9. Acceptance',
      body: 'By continuing to use EduRoute, you confirm that you have read, understood, and agreed to these Terms and Conditions.'
    }]
  },
  privacy: {
    title: 'Privacy Policy',
    body: 'EduRoute processes personal and trip-related information only for official locator slip management, trip monitoring, reporting, and institutional compliance.',
    sections: [{
      heading: '1. Information We Collect',
      body: 'EduRoute may collect account information such as the user’s name, email address, role, college, department, and position. It may also collect locator slip details, including the purpose of travel, destination, departure time, expected return time, locator slip code, and approval status. During official trips, EduRoute may process trip and location data such as current location, route records, trip start time, arrival time, return time, and completion timestamps. The system may also collect validation records, including QR or manual validation status, CSSU validation time, and validator details. For proof of compliance, EduRoute may collect the focal person’s name, position, signature, arrival photo, proof image, and verification remarks. It may also process notification data such as in-app alerts, push notification tokens, and device or browser information, as well as system logs related to login activity, record updates, approvals, rejections, and audit trail actions.'
    }, {
      heading: '2. Purpose of Collection',
      body: 'The information is used to: process locator slip requests; approve or reject official trips; validate campus exit; monitor active faculty trips; verify arrival and proof of compliance; detect late return, disconnected location, or unverified proof; generate reports, analytics, and audit trails; and send system notifications.'
    }, {
      heading: '3. Location Data Use',
      body: 'EduRoute uses location data only for official trip monitoring, route tracking, arrival verification, return confirmation, and HRMU reporting. Location access is required during active trip functions.'
    }, {
      heading: '4. Who Can Access the Data',
      body: 'Access to EduRoute data is limited according to user roles. Faculty members may access only their own locator slips, QR codes, trip records, and proof of compliance records. Deans may access locator slips submitted by faculty members under their assigned college. CSSU users may access locator slip validation records needed for exit checking. HRMU users may access monitoring records, proof verification records, reports, analytics, and incident records. System administrators may access necessary records only for technical maintenance and authorized account management.'
    }, {
      heading: '5. Data Sharing',
      body: 'EduRoute does not sell personal information. Data may be processed through authorized service providers used for hosting, database, maps, notifications, and file storage, only for system operation and maintenance.'
    }, {
      heading: '6. Data Protection',
      body: 'EduRoute applies role-based access, password protection, secure database storage, HTTPS deployment, protected credentials, and audit logs to help safeguard user information.'
    }, {
      heading: '7. Data Retention',
      body: 'Records are kept only as long as needed for official monitoring, reporting, audit, legal, or institutional purposes. Older records may be archived or deleted according to school policy.'
    }, {
      heading: '8. User Rights',
      body: 'Under the Data Privacy Act of 2012, data subjects have privacy rights over their personal information, including rights related to access, correction, objection, and other lawful requests.'
    }, {
      heading: '9. Consent',
      body: 'By using EduRoute, you consent to the collection and processing of your information for official locator slip management, trip monitoring, reporting, and institutional compliance.'
    }, {
      heading: '10. Contact for Privacy Concerns',
      body: 'For privacy concerns, correction requests, or data-related inquiries, contact: Mr. Neil Marc Biron | DPO (Room 415 - Gordon College Main Building) | biron.neilmarc@gordoncollege.edu.ph'
    }]
  },
  dataFaq: {
    title: 'Data Usage FAQ',
    body: 'Frequently asked questions about how EduRoute collects, uses, protects, and retains institutional trip and locator slip data.',
    sections: [{
      heading: '1. Why does EduRoute collect my information?',
      body: 'EduRoute collects information to process faculty locator slips, approve requests, validate campus exits, monitor official trips, verify proof of compliance, generate reports, and maintain institutional records.'
    }, {
      heading: '2. What personal information does EduRoute collect?',
      body: 'EduRoute may collect your name, email address, role, college, department, position, locator slip details, trip records, proof of compliance, and system activity logs.'
    }, {
      heading: '3. Does EduRoute collect my location?',
      body: 'Yes. EduRoute collects location data only during official trip-related functions, such as starting a trip, route monitoring, arrival verification, return confirmation, and HRMU reporting.'
    }, {
      heading: '4. Is EduRoute always tracking my location?',
      body: 'No. EduRoute should only use location access during official approved trips and related trip actions. It is not intended for continuous personal tracking outside EduRoute trip activities.'
    }, {
      heading: '5. Who can see my data?',
      body: 'Access depends on user role. Faculty can view their own records. Deans can view locator slips from their assigned college. CSSU can view validation details. HRMU can view monitoring, proof, reports, and incident records. Admins can access records only for authorized system maintenance.'
    }, {
      heading: '6. What proof of compliance data is collected?',
      body: 'EduRoute may collect the focal person’s name, position, signature, optional arrival photo, proof image, verification status, and HRMU remarks.'
    }, {
      heading: '7. Why does EduRoute use QR codes?',
      body: 'QR codes help CSSU quickly verify if a locator slip is valid and if the faculty member is allowed to exit for an approved official trip.'
    }, {
      heading: '8. Are my records shared outside the institution?',
      body: 'EduRoute does not sell personal data. Records may only be processed through authorized system services for hosting, database, maps, notifications, and file storage.'
    }, {
      heading: '9. How long are my records kept?',
      body: 'Records are kept only as long as needed for official monitoring, reporting, audit, legal, or institutional purposes, based on school policy.'
    }, {
      heading: '10. How does EduRoute protect my data?',
      body: 'EduRoute uses role-based access, account authentication, secure database handling, protected credentials, HTTPS deployment, and audit logs to help protect user data.'
    }, {
      heading: '11. Can I correct my information?',
      body: 'Yes. You may request correction of inaccurate personal information through the authorized system administrator, HRMU, or designated data privacy contact.'
    }, {
      heading: '12. What happens if I do not allow location access?',
      body: 'Some trip features may not work properly, including route monitoring, arrival verification, return confirmation, and HRMU live tracking.'
    }, {
      heading: '13. Is my data used for disciplinary action?',
      body: 'EduRoute is mainly used for official locator slip processing, monitoring, reporting, and compliance verification. Any administrative action based on records should follow institutional policy and due process.'
    }, {
      heading: '14. Who should I contact for privacy concerns?',
      body: 'You may contact the designated EduRoute system administrator, HRMU office, or Data Protection Officer for questions about data use, correction, privacy rights, or record handling.'
    }, {
      heading: '15. What law protects my data?',
      body: 'EduRoute follows the principles of the Data Privacy Act of 2012, including transparency, legitimate purpose, proportionality, security, and respect for data subject rights.'
    }]
  }
};
export const getPermissionSetupStorageKey = () => {
  const token = localStorage.getItem('token') || '';
  const payload = decodeJwtPayload(token);
  return payload?.sub ? `eduroutePermissionSetupSeen:${payload.sub}` : 'eduroutePermissionSetupSeen';
};
export const LegalDocumentModal = ({
  activeLegalDoc,
  onClose
}) => {
  if (!activeLegalDoc) return null;
  const legalDoc = LEGAL_DOCUMENTS[activeLegalDoc];
  return <div className="priv-legal-modal-backdrop" role="dialog" aria-modal="true">
      <div className={`priv-legal-modal-card priv-legal-modal-${activeLegalDoc}`}>
        <div className="priv-legal-modal-header">
          <div className="priv-legal-modal-icon">
            {activeLegalDoc === 'privacy' && <ShieldSearchIcon color="var(--green)" />}
            {activeLegalDoc === 'dataFaq' && <QuestionCircleIcon color="var(--green)" />}
            {activeLegalDoc === 'terms' && <FileTextIcon color="var(--green)" />}
          </div>
          <div className="priv-legal-modal-heading">
            <span>EDUROUTE POLICIES &amp; PRIVACY</span>
            <h2>{legalDoc.title}</h2>
          </div>
        </div>
        <div className="priv-legal-modal-scroll">
          <p className="priv-legal-modal-intro">{legalDoc.body}</p>
          {Array.isArray(legalDoc.sections) ? <div className="priv-legal-modal-sections">
              {legalDoc.sections.map(section => <section className="priv-legal-modal-section" key={section.heading}>
                  <h3>{section.heading}</h3>
                  <p>{section.body}</p>
                </section>)}
            </div> : <>
              <p>
                Authorized access is limited to registered Gordon College faculty users. Keep your password secure, submit accurate account and locator slip information, and use EduRoute only for official school-related coordination.
              </p>
              <p>
                EduRoute may update these guidelines as the academic portal grows. Continued use of the portal means you agree to follow current faculty data, security, and acceptable-use rules.
              </p>
            </>}
        </div>
        <button type="button" className="priv-legal-modal-btn" onClick={onClose}>
          Go Back <ArrowRightIcon />
        </button>
        <div className="priv-legal-modal-pager">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>;
};
