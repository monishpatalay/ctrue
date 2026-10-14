import { createNeonAuth } from '@neondatabase/auth/next/server';
const demo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';
const baseUrl = process.env.NEON_AUTH_BASE_URL;
const secret = process.env.NEON_AUTH_COOKIE_SECRET;
// Null in the local demo and until Neon Auth is configured, so builds and the demo run without credentials.
export const auth = !demo && baseUrl && secret ? createNeonAuth({ baseUrl, cookies: { secret } }) : null;
