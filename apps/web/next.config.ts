import type { NextConfig } from 'next';
const api = new URL(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4318').origin;
// Browser safety settings for every page. The content policy applies in production only: the dev server needs eval.
// Next.js bootstraps with inline scripts, hence 'unsafe-inline'; the API is the only other place the page may call.
const headers = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Content-Security-Policy', value: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' ${api}; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'` }] : []),
];
const config: NextConfig = { poweredByHeader: false, headers: async () => [{ source: '/:path*', headers }] };
export default config;
