const RAW_API_BASE = (
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || ''
)
  .trim()
  .replace(/\/+$/, '');

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

export async function apiFetch<T = any>(
  url: string,
  options: RequestInit & { idempotencyKey?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (options.idempotencyKey) {
    headers['X-Idempotency-Key'] = options.idempotencyKey;
  }
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

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
}

async function normalizeImageForPdfCompatibility(file: File): Promise<File> {
  const lowerName = (file.name || '').toLowerCase();
  const isNativePdfImage =
    ['image/png', 'image/jpeg', 'image/jpg'].includes(file.type.toLowerCase()) &&
    /\.(png|jpe?g)$/.test(lowerName);

  if (isNativePdfImage || typeof document === 'undefined') {
    return file;
  }

  // Convert WEBP / SVG / GIF to lossless PNG so PDFKit embeds logos & photos reliably
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const w = Math.max(1, img.naturalWidth || img.width || 600);
        const h = Math.max(1, img.naturalHeight || img.height || 600);
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
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              resolve(file);
              return;
            }
            const base = (file.name || 'upload').replace(/\.[^.]+$/, '');
            resolve(new File([blob], `${base}.png`, { type: 'image/png' }));
          },
          'image/png',
          1.0
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

export async function uploadImageFile(file: File): Promise<{ url: string; filename: string }> {
  const normalizedFile = await normalizeImageForPdfCompatibility(file);
  const formData = new FormData();
  formData.append('file', normalizedFile);
  return apiFetch('/api/uploads', {
    method: 'POST',
    body: formData,
  });
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
  let res: Response;
  try {
    res = await fetch(resolveApiUrl(url));
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
