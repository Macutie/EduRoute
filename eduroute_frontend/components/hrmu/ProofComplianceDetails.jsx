import React, { useRef, useState } from 'react';
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

const getImageDataUrl = async (url) => {
  if (!url) return null;
  if (String(url).startsWith('data:')) return url;

  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();

    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
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
    setIsExporting(true);
    
    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 42;
      const contentWidth = pageWidth - margin * 2;
      const green = [0, 150, 35];
      const yellow = [255, 199, 33];
      const red = [217, 45, 32];
      const dark = [26, 35, 50];
      const muted = [94, 107, 103];
      let y = 42;

      const ensureSpace = (heightNeeded) => {
        if (y + heightNeeded <= pageHeight - 42) return;
        pdf.addPage();
        y = 42;
      };

      const writeText = (text, x, textY, options = {}) => {
        const {
          size = 10,
          color = dark,
          weight = 'normal',
          maxWidth = contentWidth,
          lineGap = 12,
        } = options;
        pdf.setFont('helvetica', weight);
        pdf.setFontSize(size);
        pdf.setTextColor(...color);
        const lines = pdf.splitTextToSize(String(text || 'N/A'), maxWidth);
        pdf.text(lines, x, textY);
        return lines.length * lineGap;
      };

      const sectionTitle = (title) => {
        ensureSpace(34);
        pdf.setFillColor(...yellow);
        pdf.circle(margin + 4, y - 4, 3, 'F');
        writeText(title.toUpperCase(), margin + 14, y, {
          size: 9,
          color: green,
          weight: 'bold',
          maxWidth: contentWidth - 14,
          lineGap: 10,
        });
        y += 22;
      };

      const infoRow = (label, value, x = margin, width = contentWidth) => {
        ensureSpace(48);
        writeText(label.toUpperCase(), x, y, {
          size: 8,
          color: muted,
          weight: 'bold',
          maxWidth: width,
          lineGap: 9,
        });
        const used = writeText(value || 'N/A', x, y + 16, {
          size: 11,
          color: dark,
          weight: 'bold',
          maxWidth: width,
          lineGap: 13,
        });
        y += Math.max(42, used + 24);
      };

      const checkCard = (x, cardY, width, label, value, subValue, tone = 'positive') => {
        const isNegative = tone === 'negative';
        pdf.setFillColor(246, 248, 246);
        pdf.setDrawColor(226, 232, 226);
        pdf.roundedRect(x, cardY, width, 78, 12, 12, 'FD');
        writeText(label.toUpperCase(), x + 16, cardY + 24, {
          size: 8,
          color: muted,
          weight: 'bold',
          maxWidth: width - 32,
          lineGap: 9,
        });
        writeText(value, x + 16, cardY + 44, {
          size: 14,
          color: isNegative ? red : green,
          weight: 'bold',
          maxWidth: width - 32,
          lineGap: 14,
        });
        if (subValue) {
          writeText(subValue, x + 16, cardY + 62, {
            size: 8,
            color: muted,
            weight: 'normal',
            maxWidth: width - 32,
            lineGap: 9,
          });
        }
      };

      const drawImageBox = async (title, imageUrl, captionLines = []) => {
        ensureSpace(170);
        writeText(title.toUpperCase(), margin, y, {
          size: 8,
          color: muted,
          weight: 'bold',
          maxWidth: contentWidth,
          lineGap: 9,
        });
        y += 12;
        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(226, 232, 226);
        pdf.roundedRect(margin, y, 190, 92, 10, 10, 'FD');
        const dataUrl = await getImageDataUrl(imageUrl);
        if (dataUrl) {
          const imageType = dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg') ? 'JPEG' : 'PNG';
          pdf.addImage(dataUrl, imageType, margin + 18, y + 16, 154, 58, undefined, 'FAST');
        } else {
          writeText('No image available.', margin + 22, y + 48, {
            size: 9,
            color: muted,
            weight: 'bold',
            maxWidth: 146,
            lineGap: 10,
          });
        }
        captionLines.forEach((line, index) => {
          writeText(line, margin + 220, y + 24 + (index * 16), {
            size: index === 0 ? 12 : 9,
            color: index === 0 ? dark : muted,
            weight: index === 0 ? 'bold' : 'normal',
            maxWidth: contentWidth - 220,
            lineGap: 12,
          });
        });
        y += 112;
      };

      const profileDataUrl = await getImageDataUrl(activeProof.profileImageUrl || row.profileImageUrl || '/profile_pic.png');
      if (profileDataUrl) {
        const imageType = profileDataUrl.includes('image/jpeg') || profileDataUrl.includes('image/jpg') ? 'JPEG' : 'PNG';
        pdf.addImage(profileDataUrl, imageType, margin, y, 54, 54, undefined, 'FAST');
      }
      writeText(row.name, margin + 68, y + 20, {
        size: 21,
        color: dark,
        weight: 'bold',
        maxWidth: contentWidth - 190,
        lineGap: 21,
      });
      pdf.setFillColor(...green);
      pdf.roundedRect(pageWidth - margin - 104, y + 4, 104, 24, 12, 12, 'F');
      writeText('COMPLETED TRIP', pageWidth - margin - 88, y + 20, {
        size: 8,
        color: [255, 255, 255],
        weight: 'bold',
        maxWidth: 90,
        lineGap: 9,
      });
      writeText(row.roleLine || 'Faculty', margin + 68, y + 38, {
        size: 10,
        color: muted,
        weight: 'bold',
        maxWidth: contentWidth - 68,
        lineGap: 11,
      });
      y += 76;

      infoRow('Returned', formatDateTime(activeProof.actualReturnTime || row.actualReturnTime), margin, contentWidth / 2 - 8);
      y -= 42;
      infoRow('Estimated Return', formatDateTime(activeProof.expectedReturnTime || row.expectedReturnTime), margin + contentWidth / 2 + 8, contentWidth / 2 - 8);
      y += 12;

      sectionTitle(`Official Locator Slip #${row.slipNumber || 'N/A'}`);
      infoRow('Purpose of Travel', activeProof.purpose || 'Official travel');
      infoRow('Requested By', row.name);
      infoRow('Current Status', displayStatus);
      writeText(buildStatusCopy(activeProof), margin, y, {
        size: 10,
        color: muted,
        weight: 'normal',
        maxWidth: contentWidth,
        lineGap: 13,
      });
      y += 44;

      sectionTitle('Proof of Compliance');
      await drawImageBox('Focal Person Signature', activeProof.focalPersonSignatureUrl, [
        'Confirmed by focal person',
        focalPersonName,
        focalPersonPosition,
        formatDateTime(activeProof.submittedAt || row.submittedAt),
      ]);

      if (deanSignature) {
        await drawImageBox('Authorized Digital Signature', deanSignature.asset?.url, [
          deanSignature.name || 'Assigned Dean',
          formatRoleLabel(deanSignature.role, 'Dean'),
          deanSignature.signedAt ? formatDateTime(deanSignature.signedAt) : 'Approval time unavailable.',
        ]);
      }

      if (activeProof.arrivalPhotoUrl) {
        await drawImageBox('Uploaded Arrival Image', activeProof.arrivalPhotoUrl, [
          'Arrival photo submitted by faculty',
        ]);
      }

      sectionTitle('Proof Verification Checks');
      ensureSpace(178);
      const cardGap = 14;
      const cardWidth = (contentWidth - cardGap) / 2;
      checkCard(margin, y, cardWidth, 'Proof Status', proofStatus, '', isFlaggedProof ? 'negative' : 'positive');
      checkCard(margin + cardWidth + cardGap, y, cardWidth, 'Proof of Compliance', formatProofStatus('submitted'), formatDateTime(activeProof.submittedAt || row.submittedAt));
      y += 92;
      checkCard(
        margin,
        y,
        cardWidth,
        'HRMU Review',
        normalizedStatus === 'verified' ? 'SUCCESSFUL' : isFlaggedProof ? 'FLAGGED' : 'PENDING',
        isLateReturn ? formatDateTime(activeProof.actualReturnTime || row.actualReturnTime) : activeProof.reviewedAt ? formatDateTime(activeProof.reviewedAt) : 'Awaiting HRMU review.',
        isFlaggedProof ? 'negative' : 'positive'
      );
      checkCard(margin + cardWidth + cardGap, y, cardWidth, 'Focal Person & Position', focalPersonName, focalPersonPosition);
      y += 104;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(120, 130, 130);
      pdf.text(`Generated by EduRoute on ${formatDateTime(new Date())}`, margin, pageHeight - 24);

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
