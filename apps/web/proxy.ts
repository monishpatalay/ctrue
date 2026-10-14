import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth-server';
// Google returns to /dashboard with a one-time verifier; this exchanges it for the session cookie.
// It also sends signed-out visitors to /login. The local demo and unconfigured builds pass through.
const guard = auth?.middleware({ loginUrl: '/login' });
export function proxy(request: NextRequest) { return guard ? guard(request) : NextResponse.next(); }
export const config = { matcher: '/dashboard' };
