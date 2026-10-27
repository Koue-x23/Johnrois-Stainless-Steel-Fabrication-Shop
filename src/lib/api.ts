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

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errMsg = `Request failed (${res.status})`;
    let extra: Record<string, any> = {};
    try {
      const data = await res.json();
      if (data?.error) errMsg = data.error;
      extra = data;
    } catch (_) {
      // ignore json parse error
    }
    const err = new Error(errMsg) as Error & { status?: number; data?: any };
    err.status = res.status;
    err.data = extra;
    throw err;
  }

  return res.json();
}

export async function uploadImageFile(file: File): Promise<{ url: string; filename: string }> {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch('/api/uploads', {
    method: 'POST',
    body: formData,
  });
}

export async function uploadSignatureDataUrl(dataUrl: string): Promise<{ url: string; filename: string }> {
  return apiFetch('/api/uploads/data-url', {
    method: 'POST',
    body: JSON.stringify({ data_url: dataUrl }),
  });
}

export async function downloadAuthenticatedFile(url: string, fallbackFilename: string) {
  const res = await fetch(url);
  if (!res.ok) {
    let msg = 'Failed to download file.';
    try {
      const d = await res.json();
      if (d?.error) msg = d.error;
    } catch (_) {
      // ignore
    }
    throw new Error(msg);
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
