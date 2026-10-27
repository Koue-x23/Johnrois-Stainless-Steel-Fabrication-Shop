import React, { useRef, useState, useEffect } from 'react';
import { X, Eraser, Upload, Check } from 'lucide-react';
import { uploadImageFile, uploadSignatureDataUrl } from '../lib/api';

interface SignaturePadModalProps {
  title: string;
  onClose: () => void;
  onSaved: (url: string) => void;
}

export const SignaturePadModal: React.FC<SignaturePadModalProps> = ({ title, onClose, onSaved }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#0f172a';
  }, []);

  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      return {
        x: (t.clientX - rect.left) * scaleX,
        y: (t.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasStrokes(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => {
    setIsDrawing(false);
  };

  const clearPad = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  const handleSaveDrawn = async () => {
    if (!hasStrokes || !canvasRef.current) {
      setError('Please sign inside the pad or upload a signature image.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const res = await uploadSignatureDataUrl(dataUrl);
      onSaved(res.url);
    } catch (err: any) {
      setError(err.message || 'Failed to save signature.');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setError('');
    try {
      const res = await uploadImageFile(file);
      onSaved(res.url);
    } catch (err: any) {
      setError(err.message || 'Failed to upload signature file.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 no-print">
      <div className="bg-white rounded-lg border border-slate-300 shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 text-white">
          <h3 className="font-semibold text-sm tracking-wide">{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-300 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {error}
            </div>
          )}

          <div>
            <p className="text-xs text-slate-600 mb-2">
              Sign directly below using mouse, stylus, or touchscreen, or upload a transparent PNG/JPG signature image.
            </p>
            <div className="border-2 border-dashed border-slate-300 rounded-md bg-slate-50 overflow-hidden">
              <canvas
                ref={canvasRef}
                width={520}
                height={180}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
                className="w-full h-44 cursor-crosshair touch-none bg-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearPad}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Eraser className="w-3.5 h-3.5" />
                Clear
              </button>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Upload Image
                <input type="file" accept="image/png,image/jpeg" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveDrawn}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-50"
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
