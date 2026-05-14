import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const formatDateTime = (value) => {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString();
};

const formatStatusText = (status) => {
  const normalized = String(status || 'submitted').toLowerCase();
  if (normalized === 'verified') return 'SUCCESSFUL TRIP';
  if (normalized === 'rejected') return 'UNVERIFIED LOCATION';
  return 'PENDING PROOF REVIEW';
};

const formatProofStatus = (status) => {
  const normalized = String(status || 'submitted').toLowerCase();
  if (normalized === 'verified') return 'SUCCESSFUL';
  if (normalized === 'rejected') return 'FLAGGED';
  return 'SUBMITTED';
};

const formatRoleLabel = (value, fallback = 'Dean') => {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  if (normalized === 'college_dean') return 'College Dean';
  if (normalized === 'assistant_dean') return 'Assistant Dean';
  return normalized
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const buildStatusCopy = (proof) => {
  const normalized = String(proof?.verificationStatus || 'submitted').toLowerCase();
  if (normalized === 'verified') {
    return `${proof?.facultyName || 'The faculty member'} submitted a proof of compliance for this completed trip. HRMU marked this as a successful trip.`;
  }

  if (normalized === 'rejected') {
    return `${proof?.facultyName || 'The faculty member'} submitted a proof of compliance for this completed trip. HRMU flagged this trip as an unverified location.`;
  }

  return `${proof?.facultyName || 'The faculty member'} submitted a proof of compliance for this completed trip. Review the signature and focal person details before deciding whether to keep the trip successful or flag it as an unverified location.`;
};

const ProofComplianceDetails = ({
  row,
  details,
  reviewMessage,
  reviewing,
  reviewLocked,
  onClose,
  onReview,
}) => {
  if (!row) return null;

  const activeProof = details || row;
  const normalizedStatus = String(activeProof.verificationStatus || row.verificationStatus || 'submitted').toLowerCase();
  const displayStatus = formatStatusText(normalizedStatus);
  const proofStatus = formatProofStatus(normalizedStatus);
  const statusBarClassName = normalizedStatus === 'rejected'
    ? 'hrmu-verify-status-bar review'
    : 'hrmu-verify-status-bar';
  const focalPersonName = activeProof.focalPersonName || 'N/A';
  const focalPersonPosition = activeProof.focalPersonPosition || 'N/A';
  const deanSignature = activeProof.digitalSignature || null;

  const modalRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportPdf = async () => {
    if (!modalRef.current) return;
    setIsExporting(true);
    
    try {
      // Temporarily hide close button and export button to avoid capturing them
      const closeBtn = modalRef.current.querySelector('.hrmu-verify-modal-close');
      const actionArea = modalRef.current.querySelector('.hrmu-verify-action-buttons');
      
      if (closeBtn) closeBtn.style.display = 'none';
      if (actionArea) actionArea.style.display = 'none';

      const canvas = await html2canvas(modalRef.current, {
        scale: 2, // Higher resolution
        useCORS: true,
        backgroundColor: '#ffffff'
      });

      if (closeBtn) closeBtn.style.display = '';
      if (actionArea) actionArea.style.display = '';

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      const filename = `proof-of-compliance-${row.slipNumber || 'export'}.pdf`;
      pdf.save(filename);
    } catch (err) {
      console.error('Failed to export PDF', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="hrmu-verify-modal-overlay" role="presentation" onClick={onClose}>
      <div className="hrmu-verify-modal" role="dialog" aria-modal="true" aria-labelledby="hrmu-verify-modal-title" onClick={(event) => event.stopPropagation()} ref={modalRef}>
        <div className="hrmu-verify-modal-header">
          <div className="hrmu-verify-modal-person">
            <div className="hrmu-verify-modal-avatar">
              <img src="/profile_pic.png" alt={row.name} />
            </div>
            <div className="hrmu-verify-modal-person-copy">
              <div className="hrmu-verify-modal-topline">
                <h2 id="hrmu-verify-modal-title">{row.name}</h2>
                <span className="hrmu-verify-modal-pill">COMPLETED TRIP</span>
              </div>
              <p>{row.roleLine}</p>
              <div className="hrmu-verify-modal-times">
                <span>Returned: {formatDateTime(activeProof.actualReturnTime || row.actualReturnTime)}</span>
                <span>Est. Return: {formatDateTime(activeProof.expectedReturnTime || row.expectedReturnTime)}</span>
              </div>
            </div>
          </div>
          <button type="button" className="hrmu-verify-modal-close" onClick={onClose} aria-label="Close verification modal">
            x
          </button>
        </div>

        <div className="hrmu-verify-modal-body">
          <div className="hrmu-verify-modal-left">
            <div className="hrmu-verify-modal-label">OFFICIAL LOCATOR SLIP #{row.slipNumber}</div>
            <div className="hrmu-verify-modal-card">
              <div className="hrmu-verify-modal-meta-grid">
                <div>
                  <span>PURPOSE OF TRAVEL</span>
                  <strong>{activeProof.purpose || 'Official travel'}</strong>
                </div>
                <div>
                  <span>REQUESTED BY</span>
                  <strong>{row.name}</strong>
                </div>
              </div>

              <div className="hrmu-verify-modal-signature-block">
                <span>PROOF OF COMPLIANCE</span>
                <div className="hrmu-verify-signature-card">
                  <div className="hrmu-verify-signature-art">
                    {activeProof.focalPersonSignatureUrl ? (
                      <img
                        className="hrmu-verify-signature-image"
                        src={activeProof.focalPersonSignatureUrl}
                        alt={`${row.name} proof of compliance signature`}
                      />
                    ) : (
                      <div className="hrmu-verify-signature-empty">No signature uploaded.</div>
                    )}
                  </div>
                  <div className="hrmu-verify-signature-copy">
                    <strong>Confirmed by focal person</strong>
                    <span>{focalPersonName}</span>
                    <span>{focalPersonPosition}</span>
                    <span>{formatDateTime(activeProof.submittedAt || row.submittedAt)}</span>
                  </div>
                </div>
              </div>

              {deanSignature && (
                <div className="hrmu-verify-modal-signature-block">
                  <span>AUTHORIZED DIGITAL SIGNATURE</span>
                  <div className="hrmu-verify-signature-card">
                    <div className="hrmu-verify-signature-art">
                      {deanSignature.asset?.mimeType === 'application/pdf' ? (
                        <div className="hrmu-verify-signature-empty">
                          <a href={deanSignature.asset?.url} target="_blank" rel="noreferrer">
                            Open Dean Signature PDF
                          </a>
                        </div>
                      ) : deanSignature.asset?.url ? (
                        <img
                          className="hrmu-verify-signature-image"
                          src={deanSignature.asset.url}
                          alt={`${deanSignature.name || 'Dean'} digital signature`}
                        />
                      ) : (
                        <div className="hrmu-verify-signature-empty">No dean signature uploaded.</div>
                      )}
                    </div>
                    <div className="hrmu-verify-signature-copy">
                      <strong>{deanSignature.name || 'Assigned Dean'}</strong>
                      <span>{formatRoleLabel(deanSignature.role, 'Dean')}</span>
                      <span>{deanSignature.signedAt ? formatDateTime(deanSignature.signedAt) : 'Approval time unavailable.'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="hrmu-verify-modal-label">PROOF VERIFICATION CHECKS</div>
            <div className="hrmu-verify-check-grid">
              <div className="hrmu-verify-check-card positive">
                <span>PROOF STATUS</span>
                <strong>{proofStatus}</strong>
              </div>
              <div className="hrmu-verify-check-card positive">
                <span>PROOF OF COMPLIANCE</span>
                <strong>{formatProofStatus('submitted')}</strong>
                <small>{formatDateTime(activeProof.submittedAt || row.submittedAt)}</small>
              </div>
              <div className={`hrmu-verify-check-card ${normalizedStatus === 'rejected' ? 'negative' : 'positive'}`}>
                <span>HRMU REVIEW</span>
                <strong>{normalizedStatus === 'verified' ? 'SUCCESSFUL' : normalizedStatus === 'rejected' ? 'FLAGGED' : 'PENDING'}</strong>
                <small>{activeProof.reviewedAt ? formatDateTime(activeProof.reviewedAt) : 'Awaiting HRMU review.'}</small>
              </div>
              <div className="hrmu-verify-check-card positive">
                <span>FOCAL PERSON</span>
                <strong>{focalPersonName}</strong>
              </div>
              <div className="hrmu-verify-check-card positive">
                <span>POSITION</span>
                <strong>{focalPersonPosition}</strong>
              </div>
            </div>

            {activeProof.arrivalPhotoUrl && (
              <div className="hrmu-verify-proof-card">
                <span>UPLOADED ARRIVAL IMAGE</span>
                <img src={activeProof.arrivalPhotoUrl} alt={`${row.name} uploaded arrival image`} />
              </div>
            )}
          </div>

          <div className="hrmu-verify-modal-right">
            <div className="hrmu-verify-current-status">
              <div className="hrmu-verify-current-status-row">
                <span>CURRENT STATUS</span>
                <strong>{displayStatus}</strong>
              </div>
              <div className={statusBarClassName} aria-hidden="true" />
              <p>{buildStatusCopy(activeProof)}</p>
            </div>

            {reviewMessage && (
              <div className="hrmu-analytics-feedback">
                <span>{reviewMessage}</span>
              </div>
            )}

            <div className="hrmu-verify-review-actions">
              <button
                type="button"
                className="hrmu-verify-request-btn"
                onClick={() => onReview('rejected')}
                disabled={reviewing || reviewLocked}
              >
                {reviewing ? 'Saving...' : 'Flag as Unverified Location'}
              </button>
              <button
                type="button"
                className="hrmu-verify-clear-btn"
                onClick={() => onReview('verified')}
                disabled={reviewing || reviewLocked}
              >
                {reviewing ? 'Saving...' : 'Successful Trip'}
              </button>
            </div>

            <div className="hrmu-verify-action-buttons" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button type="button" className="hrmu-verify-return-btn" onClick={onClose}>Return to Registry</button>
              <button 
                type="button" 
                className="hrmu-verify-return-btn" 
                onClick={handleExportPdf}
                disabled={isExporting}
                style={{ background: 'var(--green)', color: '#fff', border: 'none', opacity: isExporting ? 0.7 : 1 }}
              >
                {isExporting ? 'Exporting...' : 'Export to PDF'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProofComplianceDetails;
