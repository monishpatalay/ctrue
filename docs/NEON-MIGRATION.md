# Neon migration contract

Use Neon Managed Better Auth for website email/password login and recovery, and Neon PostgreSQL through the Node API for application data. No Supabase dependency or credentials remain in the active implementation. Keep the existing overlay and accounting behavior.

- Backend env: `DATABASE_URL` (pooled PostgreSQL TLS URL), `NEON_AUTH_BASE_URL` (the branch Auth URL), existing OpenAI settings. Node validates Neon JWTs via its fixed JWKS URL, issuer and audience; browser tokens are never treated as signed-in without verification.
- Website env: `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (server-only random 32+ chars), `NEXT_PUBLIC_API_URL`. Use official `@neondatabase/auth` Next.js server handler/client so sessions are same-origin HttpOnly cookies. Obtain a JWT with `authClient.token()` freshly for API/SSE requests. Demo mode creates no real Neon session.
- Authenticated browser -> `POST /auth/handoff {}` -> one-time 60s code; `POST /auth/redeem {code}` returns independent Ctrue `{accessToken,refreshToken}`. Desktop tokens are opaque random values persisted only as hashes in PostgreSQL, with 10-minute access and 30-day refresh expiry. `POST /auth/refresh {refreshToken}` atomically rotates its access/refresh values. `POST /auth/logout {refreshToken}` revokes that desktop credential. Keep single-flight/generation guard and OS safeStorage in Electron. No browser/provider session is cloned.
- API auth supports verified Neon JWTs for the browser and opaque database-backed Ctrue tokens for the desktop; explicit local demo only accepts `demo`. The known identity always becomes the user filter in every SQL query.
- Preserve application tables/accounts, metering functions and lease/fractional usage rules. Auth user IDs are text strings. Do not modify Managed Auth's `neon_auth` tables. App accounts can use verified text identity independently of provider table types. Enable RLS and revoke public writes; only server SQL has privileged access.
- All existing API paths/JSON shapes stay the same except additional refresh/logout paths. Public setup/health information may return configured auth state but never connection strings or secrets.
- Migrations/tests live under `database/`; a local disposable PostgreSQL check must verify the actual functions plus atomic desktop-token rotation/revocation. Remove obsolete Supabase migration/setup instructions from active docs.

Official docs: https://neon.com/docs/auth/quick-start/nextjs-api-only · https://neon.com/docs/auth/guides/plugins/jwt · https://neon.com/docs/reference/javascript-sdk

Cloud provisioning awaits confirmed Neon connection. Do not claim a created or connected cloud project until live tools prove it.
