'use client';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/** Public base URL of the API (for the widget + test chat SSE stream). */
export const API_BASE = BASE;

const TOKEN_KEY = 'cs_admin_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && window.location.pathname !== '/login') {
    setToken(null);
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  if (res.status === 204) return null as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join('; ')
      : (data?.message ?? data?.error ?? `Request failed (${res.status})`);
    const error = new Error(String(message)) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

export const widgetUrl = (publicId: string) => `${BASE}/?bot=${publicId}`;

export const money = (usd: number) =>
  usd >= 1
    ? `$${usd.toFixed(2)}`
    : usd > 0
      ? `$${usd.toFixed(usd < 0.01 ? 5 : 4)}`
      : '$0.00';
