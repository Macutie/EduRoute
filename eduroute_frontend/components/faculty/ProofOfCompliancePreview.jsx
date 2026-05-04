const ProofOfCompliancePreview = ({
  proof,
  title = 'Submitted Proof of Compliance',
  showStatus = true,
  showFullCard = true,
  showArrivalPhoto = true,
}) => {
  if (!proof) return null;

  return (
    <div className="proof-preview-card">
      <div className="proof-preview-head">
        <div>
          <span className="proof-form-eyebrow">PROOF STATUS</span>
          <h3>{title}</h3>
        </div>
        {showStatus && (
          <span className={`proof-status-badge ${String(proof.verificationStatus || '').toLowerCase()}`}>
            {String(proof.verificationStatus || 'submitted').toUpperCase()}
          </span>
        )}
      </div>

      {proof.focalPersonSignatureUrl && (
        <div className="proof-preview-signature-card">
          <span>Captured Signature</span>
          <img
            src={proof.focalPersonSignatureUrl}
            alt="Focal person signature"
            className="proof-preview-signature-image"
          />
        </div>
      )}

      <div className="proof-preview-grid">
        <div>
          <span>Focal Person</span>
          <strong>{proof.focalPersonName || 'N/A'}</strong>
        </div>
        <div>
          <span>Position</span>
          <strong>{proof.focalPersonPosition || 'N/A'}</strong>
        </div>
        <div>
          <span>Submitted</span>
          <strong>{proof.submittedAt ? new Date(proof.submittedAt).toLocaleString() : 'N/A'}</strong>
        </div>
      </div>

      {showFullCard && proof.proofComplianceImageUrl && (
        <div className="proof-preview-proof-card">
          <span>Full Compliance Card</span>
          <img
            src={proof.proofComplianceImageUrl}
            alt="Proof of compliance"
            className="proof-preview-image"
          />
        </div>
      )}

      {showArrivalPhoto && proof.arrivalPhotoUrl && (
        <div className="proof-arrival-card">
          <span>Arrival Photo</span>
          <img src={proof.arrivalPhotoUrl} alt="Arrival upload" className="proof-arrival-preview" />
        </div>
      )}
    </div>
  );
};

export default ProofOfCompliancePreview;
