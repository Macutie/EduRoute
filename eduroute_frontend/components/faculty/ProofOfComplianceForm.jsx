import { useEffect, useRef, useState } from 'react';

const createCanvasPoint = (event, canvas) => {
  const rect = canvas.getBoundingClientRect();
  const source = event.touches?.[0] || event.changedTouches?.[0] || event;
  const scaleX = rect.width ? canvas.width / rect.width : 1;
  const scaleY = rect.height ? canvas.height / rect.height : 1;
  return {
    x: (source.clientX - rect.left) * scaleX,
    y: (source.clientY - rect.top) * scaleY,
  };
};

const drawSignatureStroke = (ctx, fromPoint, toPoint) => {
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 3.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(fromPoint.x, fromPoint.y);
  ctx.lineTo(toPoint.x, toPoint.y);
  ctx.stroke();
};

const ProofOfComplianceForm = ({
  initialValues,
  disabled = false,
  loading = false,
  error = '',
  onSubmit,
}) => {
  const canvasRef = useRef(null);
  const focalPersonNameRef = useRef(null);
  const focalPersonPositionRef = useRef(null);
  const focalPersonCompanyRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const fileInputRef = useRef(null);
  const [focalPersonName, setFocalPersonName] = useState(initialValues?.focalPersonName || '');
  const [focalPersonPosition, setFocalPersonPosition] = useState(initialValues?.focalPersonPosition || '');
  const [focalPersonCompany, setFocalPersonCompany] = useState(initialValues?.focalPersonCompany || '');
  const [arrivalPhotoFile, setArrivalPhotoFile] = useState(null);
  const [arrivalPhotoPreview, setArrivalPhotoPreview] = useState(initialValues?.arrivalPhotoUrl || '');
  const [hasSignature, setHasSignature] = useState(false);
  const [proofMethods, setProofMethods] = useState({
    signature: false,
    arrivalPhoto: false,
  });
  const [localError, setLocalError] = useState('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  useEffect(() => () => {
    if (arrivalPhotoPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(arrivalPhotoPreview);
    }
  }, [arrivalPhotoPreview]);

  const combinedError = localError || error;
  const toggleProofMethod = (method) => {
    setProofMethods(current => ({ ...current, [method]: !current[method] }));
    setLocalError('');
  };

  const beginDraw = (event) => {
    if (disabled || loading) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    lastPointRef.current = createCanvasPoint(event, canvas);
    setHasSignature(true);
    setLocalError('');
  };

  const continueDraw = (event) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    const nextPoint = createCanvasPoint(event, canvas);
    drawSignatureStroke(context, lastPointRef.current, nextPoint);
    lastPointRef.current = nextPoint;
  };

  const endDraw = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleArrivalPhoto = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setLocalError('Arrival photo must be an image file.');
      return;
    }

    if (arrivalPhotoPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(arrivalPhotoPreview);
    }

    setArrivalPhotoFile(file);
    setArrivalPhotoPreview(URL.createObjectURL(file));
    setLocalError('');
    event.target.value = '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    setHasAttemptedSubmit(true);

    const focusMissingField = (fieldRef) => {
      window.requestAnimationFrame(() => fieldRef.current?.focus());
    };

    if (proofMethods.signature) {
      if (!focalPersonName.trim()) {
        setLocalError('Focal person name is required for a signature.');
        focusMissingField(focalPersonNameRef);
        return;
      }

      if (!focalPersonPosition.trim()) {
        setLocalError('Focal person position is required for a signature.');
        focusMissingField(focalPersonPositionRef);
        return;
      }

      if (!focalPersonCompany.trim()) {
        setLocalError('Focal person company is required for a signature.');
        focusMissingField(focalPersonCompanyRef);
        return;
      }

      if (!canvas || !hasSignature) {
        setLocalError('Please provide the focal person signature.');
        return;
      }
    }

    const hasSelectedProof = (proofMethods.signature && hasSignature)
      || (proofMethods.arrivalPhoto && (arrivalPhotoFile || arrivalPhotoPreview));
    if (!hasSelectedProof) {
      setLocalError('Choose at least one proof method: signature or arrival photo.');
      return;
    }

    setLocalError('');
    await onSubmit({
      focalPersonName: focalPersonName.trim(),
      focalPersonPosition: focalPersonPosition.trim(),
      focalPersonCompany: focalPersonCompany.trim(),
      signatureDataUrl: proofMethods.signature && hasSignature ? canvas.toDataURL('image/png') : null,
      arrivalPhotoFile,
    });
  };

  return (
    <form className="proof-form-card" onSubmit={handleSubmit}>
      <div className="proof-form-header">
        <div>
          <span className="proof-form-eyebrow">ARRIVAL VERIFICATION</span>
          <h3>Proof of Compliance</h3>
        </div>
        <span className="proof-form-pill">Required before return</span>
      </div>

      <div className="proof-method-picker">
        <div className="proof-form-section-head">
          <strong>Choose proof method <span className="proof-required-star" aria-hidden="true">*</span></strong>
          <span>At least one required</span>
        </div>
        <p className="proof-method-help">Use a focal person signature, upload an arrival photo, or provide both.</p>
        <div className="proof-method-options">
          <button type="button" className={`proof-method-option ${proofMethods.signature ? 'selected' : ''}`} onClick={() => toggleProofMethod('signature')} disabled={disabled || loading} aria-pressed={proofMethods.signature}>
            <strong>Focal person signature</strong>
            <span>{proofMethods.signature ? 'Selected' : 'Choose signature'}</span>
          </button>
          <button type="button" className={`proof-method-option ${proofMethods.arrivalPhoto ? 'selected' : ''}`} onClick={() => toggleProofMethod('arrivalPhoto')} disabled={disabled || loading} aria-pressed={proofMethods.arrivalPhoto}>
            <strong>Arrival photo</strong>
            <span>{proofMethods.arrivalPhoto ? 'Selected' : 'Choose photo'}</span>
          </button>
        </div>
      </div>

      {proofMethods.signature && <>
        <div className="proof-form-grid">
          <label className="proof-form-field">
            <span>Focal Person Name <span className="proof-required-star" aria-hidden="true">*</span></span>
            <input ref={focalPersonNameRef} type="text" value={focalPersonName} onChange={(event) => setFocalPersonName(event.target.value)} placeholder="Enter the focal person name" disabled={disabled || loading} aria-required="true" aria-invalid={hasAttemptedSubmit && !focalPersonName.trim()} className={hasAttemptedSubmit && !focalPersonName.trim() ? 'proof-field-invalid' : ''} />
          </label>
          <label className="proof-form-field">
            <span>Focal Person Position <span className="proof-required-star" aria-hidden="true">*</span></span>
            <input ref={focalPersonPositionRef} type="text" value={focalPersonPosition} onChange={(event) => setFocalPersonPosition(event.target.value)} placeholder="Enter the focal person position" disabled={disabled || loading} aria-required="true" aria-invalid={hasAttemptedSubmit && !focalPersonPosition.trim()} className={hasAttemptedSubmit && !focalPersonPosition.trim() ? 'proof-field-invalid' : ''} />
          </label>
          <label className="proof-form-field">
            <span>Focal Person Company <span className="proof-required-star" aria-hidden="true">*</span></span>
            <input ref={focalPersonCompanyRef} type="text" value={focalPersonCompany} onChange={(event) => setFocalPersonCompany(event.target.value)} placeholder="Enter the focal person company" disabled={disabled || loading} aria-required="true" aria-invalid={hasAttemptedSubmit && !focalPersonCompany.trim()} className={hasAttemptedSubmit && !focalPersonCompany.trim() ? 'proof-field-invalid' : ''} />
          </label>
        </div>
        <div className="proof-form-signature">
          <div className="proof-form-section-head">
            <strong>Focal Person Signature <span className="proof-required-star" aria-hidden="true">*</span></strong>
            <button type="button" className="proof-inline-btn" onClick={clearSignature} disabled={disabled || loading}>Clear Signature</button>
          </div>
          <canvas ref={canvasRef} width={960} height={320} className="proof-signature-canvas" onMouseDown={beginDraw} onMouseMove={continueDraw} onMouseUp={endDraw} onMouseLeave={endDraw} onTouchStart={beginDraw} onTouchMove={continueDraw} onTouchEnd={endDraw} />
        </div>
      </>}

      {proofMethods.arrivalPhoto && <div className={`proof-form-upload${hasAttemptedSubmit && !arrivalPhotoFile && !arrivalPhotoPreview ? ' proof-upload-invalid' : ''}`}>
        <div className="proof-form-section-head">
          <strong>Arrival Photo <span className="proof-required-star" aria-hidden="true">*</span></strong>
          <span>Required when selected</span>
        </div>
        <button type="button" className="proof-upload-btn" onClick={() => fileInputRef.current?.click()} disabled={disabled || loading}>
          {arrivalPhotoPreview ? 'Change arrival photo' : 'Upload arrival photo'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="proof-hidden-input"
          onChange={handleArrivalPhoto}
        />
        {arrivalPhotoPreview && (
          <img src={arrivalPhotoPreview} alt="Arrival preview" className="proof-arrival-preview" />
        )}
      </div>}

      {combinedError && (
        <p className="proof-form-error">{combinedError}</p>
      )}

      <button type="submit" className="proof-submit-btn" disabled={disabled || loading}>
        {loading ? 'Submitting proof...' : 'Submit Proof of Compliance'}
      </button>
    </form>
  );
};

export default ProofOfComplianceForm;
