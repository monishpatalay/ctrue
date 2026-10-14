import { auth } from '@/lib/auth-server';
// Proxies sign-in to Neon Auth and keeps the session in same-origin HttpOnly cookies.
// Unconfigured (local demo, builds without credentials) answers 503 instead of failing at import.
const unavailable = () => Response.json({ message: 'Account sign-in is unavailable until Neon Auth is connected.' }, { status: 503 });
export const { GET, POST } = auth ? auth.handler() : { GET: unavailable, POST: unavailable };
