/** Thin fetch client: bearer access token kept in memory, refresh token lives in an httpOnly cookie. */
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onAuthLost: (() => void) | null = null;

export const setAccessToken = (t: string | null) => { accessToken = t; };
export const setAuthLostHandler = (fn: () => void) => { onAuthLost = fn; };

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: any) { super(message); }
}

function toMessage(body: any, fallback: string): string {
  if (!body) return fallback;
  const m = body.message;
  if (Array.isArray(m)) return m.join('; ');
  if (m && typeof m === 'object') return m.message ?? fallback;
  return m ?? fallback;
}

export async function refreshSession(): Promise<{ accessToken: string; user: any } | null> {
  const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
  if (!res.ok) return null;
  const data = await res.json();
  accessToken = data.accessToken;
  return data;
}

async function raw(path: string, init: RequestInit & { json?: unknown } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch('/api' + path, { ...init, headers, credentials: 'include', body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  let res = await raw(path, init);
  if (res.status === 401 && !path.startsWith('/auth/')) {
    refreshing ??= refreshSession().then((r) => !!r).finally(() => { refreshing = null; });
    if (await refreshing) res = await raw(path, init);
    else { accessToken = null; onAuthLost?.(); }
  }
  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch { /* not json */ }
    throw new ApiError(res.status, toMessage(body, `Request failed (${res.status})`), body);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  return (ct.includes('application/json') ? res.json() : res.text()) as Promise<T>;
}

export const get = <T = any>(p: string) => api<T>(p);
export const post = <T = any>(p: string, json?: unknown) => api<T>(p, { method: 'POST', json: json ?? {} });
export const patch = <T = any>(p: string, json?: unknown) => api<T>(p, { method: 'PATCH', json: json ?? {} });
export const put = <T = any>(p: string, json?: unknown) => api<T>(p, { method: 'PUT', json: json ?? {} });
export const del = <T = any>(p: string) => api<T>(p, { method: 'DELETE' });

/** Download a file (CSV/XLSX/PDF) through the authenticated API. */
export async function download(path: string, fallbackName: string) {
  const res = await raw(path);
  if (!res.ok) throw new ApiError(res.status, 'Export failed');
  const blob = await res.blob();
  const name = /filename="?([^";]+)"?/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export function qs(params: Record<string, unknown>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : '';
}
