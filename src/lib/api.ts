import { BusinessSlug } from '../types';

const RAW_API_BASE = (
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || ''
)
  .trim()
  .replace(/\/+$/, '');

export function normalizeBusinessSlug(raw: string | null | undefined): BusinessSlug | null {
  const val = String(raw || '')
    .trim()
    .toLowerCase();
  if (val === 'john-rois' || val === 'johnrois' || val === '1') return 'john-rois';
  if (val === 'jrec' || val === '2') return 'jrec';
  return null;
}

export function parseBusinessSlugFromPathname(pathname: string): BusinessSlug | null {
  const firstSegment = pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)[0];
  return normalizeBusinessSlug(firstSegment);
}

let activeBusinessSlug: BusinessSlug | null =
  typeof window !== 'undefined'
    ? parseBusinessSlugFromPathname(window.location.pathname)
    : null;

let activeMutationCount = 0;

export function setActiveBusinessSlug(slug: BusinessSlug | null): void {
  activeBusinessSlug = slug;
}

export function getActiveBusinessSlug(): BusinessSlug | null {
  if (activeBusinessSlug) return activeBusinessSlug;
  if (typeof window !== 'undefined') {
    const fromPath = parseBusinessSlugFromPathname(window.location.pathname);
    if (fromPath) {
      activeBusinessSlug = fromPath;
      return fromPath;
    }
  }
  return null;
}

export function hasInFlightMutations(): boolean {
  return activeMutationCount > 0;
}

export function buildWorkspacePath(subpath: string, explicitSlug?: BusinessSlug | null): string {
  const slug = explicitSlug || getActiveBusinessSlug();
  const cleanSub = subpath.startsWith('/') ? subpath : `/${subpath}`;
  if (!slug) return cleanSub;
  if (cleanSub === '/') return `/${slug}`;
  return `/${slug}${cleanSub}`;
}

export function getBusinessMonogram(businessName?: string | null, fallback = 'WS'): string {
  const name = String(businessName || '').trim();
  if (!name) return fallback;
  if (/^jrec\b/i.test(name)) return 'JREC';
  if (/^john\s*rois\b/i.test(name)) return 'JR';
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export function resolveApiUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (!RAW_API_BASE) return url;
  return `${RAW_API_BASE}${url.startsWith('/') ? url : `/${url}`}`;
}

export function resolveAssetUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (!RAW_API_BASE) return url;
  return `${RAW_API_BASE}${url.startsWith('/') ? url : `/${url}`}`;
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function apiPublicFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(resolveApiUrl(url), options);
  } catch (_) {
    throw new Error(
      'Unable to connect to the backend server. Please verify your network or server connection and try again.'
    );
  }
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (!res.ok) {
    let errMsg = `Request failed (HTTP ${res.status})`;
    if (contentType.includes('application/json')) {
      try {
        const data = await res.json();
        if (data?.error) errMsg = data.error;
      } catch (_) {}
    }
    throw new Error(errMsg);
  }
  return res.json();
}

export async function apiFetch<T = any>(
  url: string,
  options: RequestInit & { idempotencyKey?: string; businessSlug?: BusinessSlug } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  const resolvedSlug = options.businessSlug || getActiveBusinessSlug();
  if (resolvedSlug && !headers['X-Business-Id']) {
    headers['X-Business-Id'] = resolvedSlug;
  }

  if (options.idempotencyKey) {
    headers['X-Idempotency-Key'] = options.idempotencyKey;
  }
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const method = (options.method || 'GET').toUpperCase();
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (isMutation) activeMutationCount++;

  try {
    let res: Response;
    try {
      res = await fetch(resolveApiUrl(url), {
        ...options,
        headers,
      });
    } catch (_) {
      throw new Error(
        'Unable to connect to the backend server. Please verify your network or server connection and try again.'
      );
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();

    if (!res.ok) {
      let errMsg = `Request failed (HTTP ${res.status})`;
      let extra: Record<string, any> = {};
      if (contentType.includes('application/json')) {
        try {
          const data = await res.json();
          if (data?.error) errMsg = data.error;
          extra = data;
        } catch (_) {
          // ignore json parse error
        }
      } else if (res.status === 413) {
        errMsg =
          'Uploaded image or request exceeds the serverless payload limit (~4 MB). Please try a slightly smaller image.';
      } else if (res.status === 404) {
        errMsg = `API endpoint not found (${url}).`;
      }
      const err = new Error(errMsg) as Error & { status?: number; data?: any };
      err.status = res.status;
      err.data = extra;
      throw err;
    }

    if (!contentType.includes('application/json')) {
      throw new Error(
        'Backend API returned a non-JSON response. Please check that serverless API routing is active.'
      );
    }

    return res.json();
  } finally {
    if (isMutation) {
      activeMutationCount = Math.max(0, activeMutationCount - 1);
    }
  }
}

const MAX_SERVERLESS_IMAGE_BYTES = 2.4 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2000;

async function normalizeImageForPdfCompatibility(file: File): Promise<File> {
  const lowerName = (file.name || '').toLowerCase();
  const lowerType = (file.type || '').toLowerCase();
  const isJpeg =
    lowerType === 'image/jpeg' || lowerType === 'image/jpg' || /\.jpe?g$/.test(lowerName);
  const isNativePdfImage =
    ['image/png', 'image/jpeg', 'image/jpg'].includes(lowerType) &&
    /\.(png|jpe?g)$/.test(lowerName);

  if (
    (isNativePdfImage && file.size <= MAX_SERVERLESS_IMAGE_BYTES) ||
    typeof document === 'undefined'
  ) {
    return file;
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const rawW = Math.max(1, img.naturalWidth || img.width || 600);
        const rawH = Math.max(1, img.naturalHeight || img.height || 600);
        const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(rawW, rawH));
        const w = Math.max(1, Math.round(rawW * scale));
        const h = Math.max(1, Math.round(rawH * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const base = (file.name || 'upload').replace(/\.[^.]+$/, '');
        const preferJpeg = isJpeg || file.size > MAX_SERVERLESS_IMAGE_BYTES;
        const outMime = preferJpeg ? 'image/jpeg' : 'image/png';
        const outExt = preferJpeg ? 'jpg' : 'png';
        if (preferJpeg) {
          const composite = document.createElement('canvas');
          composite.width = w;
          composite.height = h;
          const cctx = composite.getContext('2d');
          if (cctx) {
            cctx.fillStyle = '#ffffff';
            cctx.fillRect(0, 0, w, h);
            cctx.drawImage(canvas, 0, 0);
            composite.toBlob(
              (blob) => {
                URL.revokeObjectURL(objectUrl);
                if (!blob) return resolve(file);
                resolve(new File([blob], `${base}.${outExt}`, { type: outMime }));
              },
              outMime,
              0.86
            );
            return;
          }
        }
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              resolve(file);
              return;
            }
            resolve(new File([blob], `${base}.${outExt}`, { type: outMime }));
          },
          outMime,
          0.92
        );
      } catch (_) {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader !== 'undefined') {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
      return;
    }
    file
      .arrayBuffer()
      .then((ab) => {
        const bytes = new Uint8Array(ab);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const b64 = typeof btoa === 'function' ? btoa(binary) : '';
        resolve(`data:${file.type || 'image/png'};base64,${b64}`);
      })
      .catch(reject);
  });
}

export async function uploadImageFile(file: File): Promise<{ url: string; filename: string }> {
  const normalizedFile = await normalizeImageForPdfCompatibility(file);
  const formData = new FormData();
  formData.append('file', normalizedFile);
  try {
    return await apiFetch('/api/uploads', {
      method: 'POST',
      body: formData,
    });
  } catch (primaryErr: any) {
    if (primaryErr?.status === 503 || primaryErr?.data?.setup_required) {
      throw primaryErr;
    }
    const dataUrl = await fileToDataUrl(normalizedFile);
    return apiFetch('/api/uploads/data-url', {
      method: 'POST',
      body: JSON.stringify({ data_url: dataUrl, filename: normalizedFile.name }),
    });
  }
}

export async function uploadSignatureDataUrl(
  dataUrl: string
): Promise<{ url: string; filename: string }> {
  return apiFetch('/api/uploads/data-url', {
    method: 'POST',
    body: JSON.stringify({ data_url: dataUrl }),
  });
}

export async function downloadAuthenticatedFile(url: string, fallbackFilename: string) {
  const headers: Record<string, string> = {};
  const slug = getActiveBusinessSlug();
  if (slug) {
    headers['X-Business-Id'] = slug;
  }

  let res: Response;
  try {
    res = await fetch(resolveApiUrl(url), { headers });
  } catch (_) {
    throw new Error('Unable to reach server to download file.');
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();

  if (!res.ok) {
    let msg = `Failed to download file (HTTP ${res.status}).`;
    if (contentType.includes('application/json')) {
      try {
        const d = await res.json();
        if (d?.error) msg = d.error;
      } catch (_) {
        // ignore
      }
    }
    throw new Error(msg);
  }

  if (contentType.includes('text/html')) {
    throw new Error('Download failed: server returned HTML instead of a document file.');
  }

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fallbackFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}

export function formatPHP(amount: number | string | null | undefined): string {
  const num = Number(amount) || 0;
  const isNeg = num < -0.004;
  const abs = Math.abs(num);
  const formatted = abs.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return isNeg ? `-₱${formatted}` : `₱${formatted}`;
}

export function round2(val: number | string | null | undefined): number {
  const num = Number(val) || 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function todayYMD(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysYMD(baseYMD: string, days: number): string {
  const d = new Date(`${baseYMD.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return todayYMD();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDate(ymd: string | null | undefined): string {
  if (!ymd) return '—';
  const clean = ymd.slice(0, 10);
  const d = new Date(`${clean}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
