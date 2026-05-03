import { useEffect, useMemo, useRef, useState } from 'react';

const createCanvasPoint = (event, canvas) => {
  const rect = canvas.getBoundingClientRect();
  const source = event.touches?.[0] || event.changedTouches?.[0] || event;
  return {
    x: source.clientX - rect.left,
    y: source.clientY - rect.top,
  };
};

const drawSignatureStroke = (ctx, fromPoint, toPoint) => {
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 2.5;
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
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const fileInputRef = useRef(null);
  const [focalPersonName, setFocalPersonName] = useState(initialValues?.focalPersonName || '');
  const [focalPersonPosition, setFocalPersonPosition] = useState(initialValues?.focalPersonPosition || '');
  const [arrivalPhotoFile, setArrivalPhotoFile] = useState(null);
  const [arrivalPhotoPreview, setArrivalPhotoPreview] = useState(initialValues?.arrivalPhotoUrl || '');
  const [hasSignature, setHasSignature] = useState(false);
  const [localError, setLocalError] = useState('');

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
  const canSubmit = useMemo(() => (
    !disabled
    && !loading
    && focalPersonName.trim()
    && focalPersonPosition.trim()
    && hasSignature
  ), [disabled, loading, focalPersonName, focalPersonPosition, hasSignature]);

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
    if (event.cancelable) {
      event.preventDefault();
    }
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
    if (!canvas) return;

    if (!focalPersonName.trim()) {
      setLocalError('Focal person name is required.');
      return;
    }

    if (!focalPersonPosition.trim()) {
      setLocalError('Focal person position is required.');
      return;
    }

    if (!hasSignature) {
      setLocalError('Focal person signature is required.');
      return;
    }

    setLocalError('');
    await onSubmit({
      focalPersonName: focalPersonName.trim(),
      focalPersonPosition: focalPersonPosition.trim(),
      signatureDataUrl: canvas.toDataURL('image/png'),
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

      <div className="proof-form-grid">
        <label className="proof-form-field">
          <span>Focal Person Name</span>
          <input
            type="text"
            value={focalPersonName}
            onChange={(event) => setFocalPersonName(event.target.value)}
            placeholder="Enter the focal person name"
            disabled={disabled || loading}
          />
        </label>

        <label className="proof-form-field">
          <span>Focal Person Position</span>
          <input
            type="text"
            value={focalPersonPosition}
            onChange={(event) => setFocalPersonPosition(event.target.value)}
            placeholder="Enter the focal person position"
            disabled={disabled || loading}
          />
        </label>
      </div>

      <div className="proof-form-signature">
        <div className="proof-form-section-head">
          <strong>Focal Person Signature</strong>
          <button type="button" className="proof-inline-btn" onClick={clearSignature} disabled={disabled || loading}>
            Clear Signature
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={720}
          height={220}
          className="proof-signature-canvas"
          onMouseDown={beginDraw}
          onMouseMove={continueDraw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={beginDraw}
          onTouchMove={continueDraw}
          onTouchEnd={endDraw}
        />
      </div>

      <div className="proof-form-upload">
        <div className="proof-form-section-head">
          <strong>Arrival Photo</strong>
          <span>Optional</span>
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
      </div>

      {combinedError && (
        <p className="proof-form-error">{combinedError}</p>
      )}

      <button type="submit" className="proof-submit-btn" disabled={!canSubmit}>
        {loading ? 'Submitting proof...' : 'Submit Proof of Compliance'}
      </button>
    </form>
  );
};

export default ProofOfComplianceForm;
