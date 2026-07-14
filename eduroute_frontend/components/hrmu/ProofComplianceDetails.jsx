import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const formatDateTime = (value) => {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString();
};

const formatStatusText = (status) => {
  const normalized = String(status || 'submitted').toLowerCase();
  if (normalized === 'late_return') return 'LATE RETURN';
  if (normalized === 'verified') return 'SUCCESSFUL TRIP';
  if (normalized === 'rejected') return 'UNVERIFIED LOCATION/SIGNATURE';
  return 'PENDING PROOF REVIEW';
};

const formatProofStatus = (status) => {
  const normalized = String(status || 'submitted').toLowerCase();
  if (normalized === 'late_return') return 'FLAGGED';
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
  if (proof?.isLateReturn) {
    return 'The system automatically identified this trip as late return.';
  }

  const normalized = String(proof?.verificationStatus || 'submitted').toLowerCase();
  if (normalized === 'verified') {
    return `${proof?.facultyName || 'The faculty member'} submitted a proof of compliance for this completed trip. HRMU marked this as a successful trip.`;
  }

  if (normalized === 'rejected') {
    return `${proof?.facultyName || 'The faculty member'} submitted a proof of compliance for this completed trip. HRMU flagged this trip as an unverified location/signature.`;
  }

  return `${proof?.facultyName || 'The faculty member'} submitted a proof of compliance for this completed trip. Review the signature and focal person details before deciding whether to keep the trip successful or flag it as an unverified location/signature.`;
};

const ProofComplianceDetails = ({
  row,
  details,
  reviewMessage,
  reviewing,
  reviewLocked,
  onClose,
  onReview,
  onViewPathHistory,
}) => {
  const modalRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);

  if (!row) return null;

  const activeProof = details || row;
  const flaggedReasons = Array.isArray(activeProof.flaggedReasons) ? activeProof.flaggedReasons : Array.isArray(row.flaggedReasons) ? row.flaggedReasons : [];
  const isLateReturn = Boolean(activeProof.isLateReturn || row.isLateReturn || flaggedReasons.includes('Late Return'));
  const isUnverified = flaggedReasons.includes('Unverified Location/Signature')
    || String(activeProof.verificationStatus || row.verificationStatus || '').toLowerCase() === 'rejected';
  const normalizedStatus = isLateReturn
    ? 'late_return'
    : isUnverified
      ? 'rejected'
      : String(activeProof.verificationStatus || row.verificationStatus || 'submitted').toLowerCase();
  const displayStatus = formatStatusText(normalizedStatus);
  const proofStatus = formatProofStatus(normalizedStatus);
  const statusBarClassName = normalizedStatus === 'rejected' || normalizedStatus === 'late_return'
    ? 'hrmu-verify-status-bar review'
    : 'hrmu-verify-status-bar';
  const statusRowClassName = normalizedStatus === 'rejected' || normalizedStatus === 'late_return'
    ? 'hrmu-verify-current-status-row review'
    : 'hrmu-verify-current-status-row';
  const isFlaggedProof = normalizedStatus === 'rejected' || normalizedStatus === 'late_return';
  const focalPersonName = activeProof.focalPersonName || 'N/A';
  const focalPersonPosition = activeProof.focalPersonPosition || 'N/A';
  const deanSignature = activeProof.digitalSignature || null;
  const isAutoLateReturn = isLateReturn;
  const effectiveReviewLocked = reviewLocked || isAutoLateReturn;
  const canReviewProof = typeof onReview === 'function';

  const handleExportPdf = async () => {
    if (!modalRef.current) return;
    setIsExporting(true);
    
    try {
      const exportNode = modalRef.current.cloneNode(true);
      exportNode.classList.add('hrmu-verify-export-snapshot');

      exportNode.querySelector('.hrmu-verify-modal-close')?.remove();
      exportNode.querySelector('.hrmu-verify-proof-card')?.remove();
      exportNode.querySelector('.hrmu-analytics-feedback')?.remove();
      exportNode.querySelector('.hrmu-verify-review-actions')?.remove();
      exportNode.querySelector('.hrmu-verify-action-buttons')?.remove();

      Object.assign(exportNode.style, {
        position: 'fixed',
        left: '-10000px',
        top: '0',
        width: '1046px',
        maxHeight: 'none',
        overflow: 'visible',
        transform: 'none',
        background: '#ffffff',
      });

      document.body.appendChild(exportNode);

      const canvas = await html2canvas(exportNode, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        windowWidth: exportNode.scrollWidth,
        windowHeight: exportNode.scrollHeight,
        width: exportNode.scrollWidth,
        height: exportNode.scrollHeight,
      });

      exportNode.remove();

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
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
              <img src={activeProof.profileImageUrl || row.profileImageUrl || '/profile_pic.png'} alt={row.name} />
            </div>
            <div className="hrmu-verify-modal-person-copy">
              <div className="hrmu-verify-modal-topline">
                <h2 id="hrmu-verify-modal-title">{row.name}</h2>
                <span className="hrmu-verify-modal-pill">COMPLETED TRIP</span>
              </div>
              <p>{row.roleLine}</p>
              <div className="hrmu-verify-modal-times">
                <span className={isLateReturn ? 'hrmu-verify-modal-time-late' : ''}>Returned: {formatDateTime(activeProof.actualReturnTime || row.actualReturnTime)}</span>
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
              <div className={`hrmu-verify-check-card ${isFlaggedProof ? 'negative' : 'positive'}`}>
                <span>PROOF STATUS</span>
                <strong>{proofStatus}</strong>
              </div>
              <div className="hrmu-verify-check-card positive">
                <span>PROOF OF COMPLIANCE</span>
                <strong>{formatProofStatus('submitted')}</strong>
                <small>{formatDateTime(activeProof.submittedAt || row.submittedAt)}</small>
              </div>
              <div className={`hrmu-verify-check-card ${isFlaggedProof ? 'negative' : 'positive'}`}>
                <span>HRMU REVIEW</span>
                <strong>{normalizedStatus === 'verified' ? 'SUCCESSFUL' : isFlaggedProof ? 'FLAGGED' : 'PENDING'}</strong>
                <small>{isLateReturn ? formatDateTime(activeProof.actualReturnTime || row.actualReturnTime) : activeProof.reviewedAt ? formatDateTime(activeProof.reviewedAt) : 'Awaiting HRMU review.'}</small>
              </div>
              <div className="hrmu-verify-check-card positive focal-summary">
                <span>FOCAL PERSON & POSITION</span>
                <strong>{focalPersonName}</strong>
                <small>{focalPersonPosition}</small>
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
              <div className={statusRowClassName}>
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

            {canReviewProof && (
              <div className="hrmu-verify-review-actions">
                <button
                  type="button"
                  className="hrmu-verify-request-btn"
                  onClick={() => onReview('rejected')}
                  disabled={reviewing || effectiveReviewLocked}
                >
                  {reviewing ? 'Saving...' : 'Flag as Unverified Location/Signature'}
                </button>
                <button
                  type="button"
                  className="hrmu-verify-clear-btn"
                  onClick={() => onReview('verified')}
                  disabled={reviewing || effectiveReviewLocked}
                >
                  {reviewing ? 'Saving...' : 'Successful Trip'}
                </button>
              </div>
            )}

            <div className="hrmu-verify-action-buttons" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {onViewPathHistory && (
                <button type="button" className="hrmu-verify-return-btn" onClick={onViewPathHistory}>
                  View Path History
                </button>
              )}
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
