import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Eraser, Check, Upload, PenTool } from 'lucide-react';
import { uploadImageFile, uploadSignatureDataUrl } from '../lib/api';

export interface SignaturePadModalProps {
  isOpen?: boolean;
  title: string;
  onClose: () => void;
  onSaved: (url: string) => void | Promise<void>;
}

const SUPPORTED_SIGNATURE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg']);
const SUPPORTED_SIGNATURE_EXT = /\.(png|jpe?g)$/i;

export const SignaturePadModal: React.FC<SignaturePadModalProps> = ({
  isOpen = true,
  title,
  onClose,
  onSaved,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const usingPointerRef = useRef(false);
  const objectUrlRef = useRef<string>('');

  const [hasStrokes, setHasStrokes] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const revokeActiveObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      try {
        URL.revokeObjectURL(objectUrlRef.current);
      } catch (_) {}
      objectUrlRef.current = '';
    }
  }, []);

  useEffect(() => {
    return () => {
      revokeActiveObjectUrl();
    };
  }, [revokeActiveObjectUrl]);

  const configureCanvasContext = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#0f172a';
    return ctx;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    isDrawingRef.current = false;
    revokeActiveObjectUrl();
    setHasStrokes(false);
    setUploadedFile(null);
    setPreviewDataUrl('');
    setSaving(false);
    setError('');

    const canvas = canvasRef.current;
    const ctx = configureCanvasContext(canvas);
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [isOpen, configureCanvasContext, revokeActiveObjectUrl]);

  useEffect(() => {
    if (!isOpen || uploadedFile) return;
    configureCanvasContext(canvasRef.current);
  }, [isOpen, uploadedFile, configureCanvasContext]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, saving, onClose]);

  if (!isOpen) {
    return null;
  }

  const getScaledPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const beginStrokeAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const ctx = configureCanvasContext(canvas);
    if (!canvas || !ctx) return;
    const { x, y } = getScaledPoint(clientX, clientY);
    isDrawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    setHasStrokes(true);
    setError('');
  };

  const continueStrokeAt = (clientX: number, clientY: number) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { x, y } = getScaledPoint(clientX, clientY);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const finishStroke = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        setPreviewDataUrl(canvas.toDataURL('image/png'));
      } catch (_) {
        // Ignore preview snapshot failure if canvas context is restricted
      }
    }
  };

  // Pointer Events (Mouse, Stylus / Pen, Touchscreen)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    usingPointerRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    beginStrokeAt(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    continueStrokeAt(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}
    finishStroke();
  };

  // Fallback Mouse / Touch handlers for environments without PointerEvent dispatch
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (usingPointerRef.current || e.button !== 0) return;
    e.preventDefault();
    beginStrokeAt(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (usingPointerRef.current || !isDrawingRef.current) return;
    e.preventDefault();
    continueStrokeAt(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    if (usingPointerRef.current) return;
    finishStroke();
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (usingPointerRef.current || e.touches.length === 0) return;
    e.preventDefault();
    beginStrokeAt(e.touches[0].clientX, e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (usingPointerRef.current || !isDrawingRef.current || e.touches.length === 0) return;
    e.preventDefault();
    continueStrokeAt(e.touches[0].clientX, e.touches[0].clientY);
  };

  const handleTouchEnd = () => {
    if (usingPointerRef.current) return;
    finishStroke();
  };

  const clearSignature = () => {
    isDrawingRef.current = false;
    revokeActiveObjectUrl();
    setUploadedFile(null);
    setPreviewDataUrl('');
    setHasStrokes(false);
    setError('');
    const canvas = canvasRef.current;
    const ctx = configureCanvasContext(canvas);
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const mime = (file.type || '').toLowerCase();
    const validType = SUPPORTED_SIGNATURE_MIME.has(mime) || SUPPORTED_SIGNATURE_EXT.test(file.name || '');
    if (!validType) {
      setError('Please upload a supported PNG or JPG signature image (.png, .jpg, or .jpeg).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Signature image exceeds the 10 MB size limit. Please select a smaller PNG or JPG file.');
      return;
    }

    setError('');
    revokeActiveObjectUrl();
    const objUrl = URL.createObjectURL(file);
    objectUrlRef.current = objUrl;
    isDrawingRef.current = false;
    setHasStrokes(false);
    setUploadedFile(file);
    setPreviewDataUrl(objUrl);
  };

  const handleConfirmSignature = async () => {
    if (!uploadedFile && !hasStrokes) {
      setError('Please draw a signature on the pad or upload a PNG/JPG signature image first.');
      return;
    }
    if (typeof onSaved !== 'function') {
      setError('Signature save handler is unavailable on this form.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (uploadedFile) {
        const res = await uploadImageFile(uploadedFile);
        await onSaved(res.url);
      } else {
        const canvas = canvasRef.current;
        if (!canvas) {
          throw new Error('Signature drawing pad is not ready.');
        }
        const dataUrl = canvas.toDataURL('image/png');
        const res = await uploadSignatureDataUrl(dataUrl);
        await onSaved(res.url);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to save signature.');
    } finally {
      setSaving(false);
    }
  };

  const readyToConfirm = Boolean(uploadedFile || hasStrokes);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="bg-white rounded-md border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <PenTool className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold">{title}</h3>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Close signature modal"
            className="text-slate-400 hover:text-white p-1 rounded disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-slate-600">
            Draw below using your mouse, stylus, or touchscreen, or upload a PNG/JPG signature image to preview before confirming.
          </p>

          {uploadedFile ? (
            <div className="border-2 border-sky-200 rounded bg-slate-50 p-4 flex flex-col items-center justify-center min-h-[192px] space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-800">
                Uploaded Signature Preview ({uploadedFile.name})
              </div>
              {previewDataUrl && (
                <img
                  src={previewDataUrl}
                  alt="Uploaded signature preview"
                  className="max-h-32 max-w-full bg-white border border-slate-200 rounded px-3 py-2 object-contain"
                />
              )}
              <p className="text-[11px] text-slate-500">
                Click &ldquo;Use Signature&rdquo; to attach this signature, or &ldquo;Clear&rdquo; to draw on the pad instead.
              </p>
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-300 rounded bg-slate-50 p-1">
              <canvas
                ref={canvasRef}
                width={600}
                height={220}
                style={{ touchAction: 'none' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className="w-full h-48 bg-white rounded cursor-crosshair touch-none block"
              />
            </div>
          )}

          {!uploadedFile && hasStrokes && previewDataUrl && (
            <div className="flex items-center justify-between gap-3 px-3 py-2 rounded border border-slate-200 bg-slate-50">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                Signature Preview
              </span>
              <img
                src={previewDataUrl}
                alt="Drawn signature preview"
                className="h-10 max-w-[220px] bg-white border border-slate-200 rounded px-2 py-0.5 object-contain"
              />
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded"
            >
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={clearSignature}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 disabled:opacity-50"
              >
                <Eraser className="w-3.5 h-3.5" />
                Clear
              </button>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 rounded border border-slate-300 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Upload PNG/JPG
                <input
                  type="file"
                  accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                  onChange={handleFileSelect}
                  disabled={saving}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !readyToConfirm}
                onClick={handleConfirmSignature}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-50 rounded"
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Use Signature'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
