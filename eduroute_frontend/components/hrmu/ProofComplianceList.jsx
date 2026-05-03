const ProofComplianceList = ({ rows, loading, onOpen }) => (
  <div className="hrmu-verify-table">
    <div className="hrmu-verify-table-head">
      <span>FACULTY MEMBER</span>
      <span>DEPARTMENT</span>
      <span>DESTINATION</span>
      <span>FOCAL PERSON</span>
      <span>STATUS</span>
      <span>PROOF</span>
    </div>

    {loading && (
      <div className="hrmu-verify-row hrmu-verify-empty-row">
        <div className="hrmu-verify-faculty"><strong>Loading proofs of compliance...</strong></div>
      </div>
    )}

    {!loading && rows.length === 0 && (
      <div className="hrmu-verify-row hrmu-verify-empty-row">
        <div className="hrmu-verify-faculty"><strong>No submitted proofs are ready for HRMU review.</strong></div>
      </div>
    )}

    {!loading && rows.map((row) => (
      <div key={row.key} className="hrmu-verify-row">
        <div className="hrmu-verify-faculty">
          <div className="hrmu-verify-avatar">
            <img src="/profile_pic.png" alt={row.name} />
          </div>
          <div>
            <strong>{row.name}</strong>
            <span>ID:</span>
            <small>{row.id}</small>
          </div>
        </div>
        <div className="hrmu-verify-dept">{row.department}</div>
        <div className="hrmu-verify-destination">{row.destination}</div>
        <div className="hrmu-verify-dept">
          <strong>{row.focalPersonName}</strong>
          <small>{row.focalPersonPosition}</small>
        </div>
        <span className={`hrmu-verify-status ${row.statusTone}`}>{row.status}</span>
        <div className="hrmu-verify-actions">
          <button
            type="button"
            className={`hrmu-verify-action-btn ${row.actionTone}`}
            onClick={() => onOpen(row)}
            title={`View proof for ${row.name}`}
          >
            {row.actionIcon}
          </button>
        </div>
      </div>
    ))}
  </div>
);

export default ProofComplianceList;
