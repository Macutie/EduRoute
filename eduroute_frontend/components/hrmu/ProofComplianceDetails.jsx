const ProofComplianceDetails = ({
  row,
  details,
  reviewMessage,
  reviewRemarks,
  setReviewRemarks,
  reviewing,
  reviewLocked,
  onClose,
  onReview,
}) => {
  if (!row) return null;

  const activeProof = details || row;
  const status = String(activeProof.verificationStatus || row.status || 'submitted').toUpperCase();

  return (
    <div className="hrmu-verify-modal-overlay" role="presentation" onClick={onClose}>
      <div className="hrmu-verify-modal" role="dialog" aria-modal="true" aria-labelledby="hrmu-verify-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="hrmu-verify-modal-header">
          <div className="hrmu-verify-modal-person">
            <div className="hrmu-verify-modal-avatar">
              <img src="/profile_pic.png" alt={row.name} />
            </div>
            <div className="hrmu-verify-modal-person-copy">
              <div className="hrmu-verify-modal-topline">
                <h2 id="hrmu-verify-modal-title">{row.name}</h2>
                <span className="hrmu-verify-modal-pill">PROOF OF COMPLIANCE</span>
              </div>
              <p>{row.department}</p>
              <div className="hrmu-verify-modal-times">
                <span>Submitted: {activeProof.submittedAt ? new Date(activeProof.submittedAt).toLocaleString() : 'N/A'}</span>
                <span>Status: {status}</span>
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
            {activeProof.proofComplianceImageUrl && (
              <div className="hrmu-verify-proof-card">
                <span>COMBINED PROOF IMAGE</span>
                <img src={activeProof.proofComplianceImageUrl} alt={`${row.name} proof of compliance`} />
              </div>
            )}

            <div className="hrmu-verify-check-grid">
              <div className="hrmu-verify-check-card positive">
                <span>FOCAL PERSON</span>
                <strong>{activeProof.focalPersonName || 'N/A'}</strong>
              </div>
              <div className="hrmu-verify-check-card positive">
                <span>POSITION</span>
                <strong>{activeProof.focalPersonPosition || 'N/A'}</strong>
              </div>
              <div className={`hrmu-verify-check-card ${status === 'REJECTED' ? 'negative' : 'positive'}`}>
                <span>VERIFICATION STATUS</span>
                <strong>{status}</strong>
                <small>{activeProof.reviewRemarks || 'Awaiting HRMU review remarks.'}</small>
              </div>
            </div>

            {activeProof.arrivalPhotoUrl && (
              <div className="hrmu-verify-proof-card">
                <span>OPTIONAL ARRIVAL PHOTO</span>
                <img src={activeProof.arrivalPhotoUrl} alt={`${row.name} arrival upload`} />
              </div>
            )}
          </div>

          <div className="hrmu-verify-modal-right">
            <div className="hrmu-verify-current-status">
              <div className="hrmu-verify-current-status-row">
                <span>CURRENT STATUS</span>
                <strong>{status}</strong>
              </div>
              <div className="hrmu-verify-status-bar" aria-hidden="true" />
              <p>
                Review the combined proof image, the focal person details, and the optional arrival photo before deciding whether to accept or reject this submission.
              </p>
            </div>

            {reviewMessage && (
              <div className="hrmu-analytics-feedback">
                <span>{reviewMessage}</span>
              </div>
            )}

            <label className="proof-form-field">
              <span>HRMU Remarks</span>
              <textarea
                value={reviewRemarks}
                onChange={(event) => setReviewRemarks(event.target.value)}
                placeholder="Add remarks when needed, especially for rejection."
                rows={5}
                disabled={reviewing || reviewLocked}
              />
            </label>

            <div className="hrmu-verify-review-actions">
              <button
                type="button"
                className="hrmu-verify-request-btn"
                onClick={() => onReview('rejected')}
                disabled={reviewing || reviewLocked}
              >
                {reviewing ? 'Saving...' : 'Reject Proof'}
              </button>
              <button
                type="button"
                className="hrmu-verify-clear-btn"
                onClick={() => onReview('verified')}
                disabled={reviewing || reviewLocked}
              >
                {reviewing ? 'Saving...' : 'Verify Proof'}
              </button>
            </div>

            <button type="button" className="hrmu-verify-return-btn" onClick={onClose}>Return to Registry</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProofComplianceDetails;
