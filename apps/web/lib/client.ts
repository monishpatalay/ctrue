import { createAuthClient } from '@neondatabase/auth/next';
export const demo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';
export const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4318';
// The session lives in same-origin HttpOnly cookies behind /api/auth; the local demo creates no Neon session.
export const authClient = demo ? null : createAuthClient();
let cached = { token: '', expires: 0 };
// The API verifies a 15-minute Neon JWT. Reuse it until a minute before expiry rather than minting one per heartbeat.
export async function bearer(): Promise<string | null> {
  if (!authClient) return 'demo';
  if (cached.expires - Date.now() > 60_000) return cached.token;
  // ponytail: @neondatabase/auth 0.6.0-beta's authClient.token() fails in the browser before sending anything
  // (it intercepts /token without a handler), so call the same-origin route directly. Revisit on SDK upgrade.
  const response = await fetch('/api/auth/token', { credentials: 'same-origin' });
  const data: { token?: unknown } | null = response.ok ? await response.json().catch(() => null) : null;
  if (typeof data?.token !== 'string' || !data.token) { cached = { token: '', expires: 0 }; return null; }
  let expires = 0;
  try { expires = JSON.parse(atob(data.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch { /* Unreadable expiry: use the token once, without caching. */ }
  cached = { token: data.token, expires: Number.isFinite(expires) ? expires : 0 };
  return data.token;
}
// Synchronous last-known token for the pagehide keepalive, which cannot await.
export const lastBearer = () => authClient ? cached.token : 'demo';
export async function request<T>(path: string, signedIn: object | null, init: RequestInit = {}): Promise<T> {
  const token = signedIn || demo ? await bearer() : null;
  if (signedIn && !token) throw new Error('Your session expired. Sign in again.');
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  const data = await response.json().catch(() => ({ error: 'The service returned an unreadable response.' }));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as T;
}
export const seconds = (value: number) => `${Math.floor(Math.max(0, value) / 60)}:${String(Math.floor(Math.max(0, value) % 60)).padStart(2, '0')}`;
