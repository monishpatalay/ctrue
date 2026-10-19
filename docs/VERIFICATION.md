# Verification — October 13, 2026

## Neon migration update

Auth and data moved from Supabase to Neon after the record below was written; see the [migration contract](NEON-MIGRATION.md). Entries that name Supabase describe the earlier implementation. Local checks were re-run against the Neon code path; no live Neon project has been connected.

- Passed: typecheck and production builds for all three apps, the 15 automated tests, and the demo smoke check.
- Passed: `npm run test:database` on disposable PostgreSQL 14. It applies `database/migrations/001_ctrue.sql`, runs the accounting and desktop-token assertions, then boots the real API against that cluster with a local stand-in for Neon Auth's JWKS: EdDSA JWT accepted, wrong audience rejected, metering through `pg`, handoff, redemption, atomic rotation, reuse and revocation refused.
- Passed against the live Neon project (`production` branch, Postgres and Neon Auth enabled through `neon.ts` and `neon deploy`): the migration applied; metering, profile and desktop-token flows through the pooled URL; email sign-up through the website's `/api/auth` route; the API accepting that session's real EdDSA JWT and rejecting altered-signature, altered-payload and `alg: none` forgeries; handoff, redemption and logout with the real session; signed-out `/dashboard` redirecting to `/login`; Google sign-in start returning Neon's redirect URL.
- Pending: completing a Google sign-in in a browser (needs a person), password reset email delivery, and the desktop app's own handoff click-through.

## Passed

- All three TypeScript checks and production builds.
- 15 automated tests: seven API, six desktop, one website SSE parser, and one real launcher process-tree check.
- Migration and accounting assertions against a disposable PostgreSQL 14 database: lease cap, fractional usage, repeated pauses/starts, one active session and cross-user rejection.
- Isolated HTTP/SSE/WebSocket demo smoke: authentication boundary, account/profile actions, session transitions, single-use handoff, simulated transcription, answer streaming and paused-answer rejection.
- Desktop renderer flow: enable local demo, Start, first question with empty context, streamed answer, Pause, End, Preferences. First-question context rejection was reproduced as a failing smoke check, then fixed in shared API validation.
- Unsigned macOS ARM64 application and ZIP created. Native app launched and displayed its packaged `file://` renderer with Ctrue branding and controls.
- General, TypeScript, and React reviews passed after fixes for isolated desktop auth sessions, credential races, stale network responses, actual ZIP expansion bounds, PCM throughput limits, transcript delta accumulation, modal focus, and keyboard cropping.

## Pending or blocked

- Real AI calls/transcription and latency/cost benchmarks: no API credentials configured.
- Supabase login, independent-session handoff, expiry/refresh, and production RLS integration: local SQL and code checks only; live project configuration pending.
- Real microphone/system audio, screen/window/region capture, device changes, denied permissions, multiple monitors, and meeting sharing/recording behavior: [capture matrix](CAPTURE-MATRIX.md) remains pending. A launched UI does not prove capture works.
- Windows installer: ARM64 unpacked output was generated, but local NSIS compilation failed because its macOS tool could not execute on this host (`Unknown system error -86`). The package script now targets Windows x64 explicitly, with a manual native Windows build workflow. That workflow has not run; no finished Windows installer is claimed.
- Signing, notarization, signed update delivery, and long-session device tests remain release gates.
- Saved session history is optional and not implemented.

The local demo uses simulated provider output and demonstration credits. User will configure env files next. This is a runnable development build, not a validated production release.
