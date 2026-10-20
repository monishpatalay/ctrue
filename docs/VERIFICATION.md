# Release 0.1.10 — October 20, 2026

Mac and, for the first time, Windows. Before publishing: typecheck, 42 unit tests (96% lines on the core modules), smoke, the database suite with 22 API contract cases, 60 E2E cases, the load test (p95 137 ms at 150 live users, after sessions are re-checked every 5 s instead of every second), and the real OpenAI run. On Windows (GitHub's windows-latest), the typecheck, the unit tests and all 10 Electron E2E cases passed; that run found and fixed WIN-1, which would have shipped a Windows app that refused every request. After publishing: `npm run verify:release -- --published` passed for both platforms (feeds, file sizes, website links), and the live website loads every page under its new content security policy with no violations. `npm run probe:production` passes except the privacy contact address (LEG-1), which needs your email.


A full test pass of the three apps, the database and the release flow, run against `d01e6a5` (Ctrue 0.1.9) and the fixes that followed it. Every finding is in [TEST-FINDINGS.md](TEST-FINDINGS.md): 111 from a read-only review whose findings were then checked by independent skeptics, plus 2 found by the new tests. 44 are fixed; each fix had a failing test first.

## How to check

| Command | What it covers | Result |
| --- | --- | --- |
| `npm run typecheck` | All three apps | Passed |
| `npm run test:coverage` | 41 unit tests (API core, desktop helpers and release guards, website SSE parser, dev launcher), with coverage | Passed; 96% lines and 92% branches across the core modules |
| `npm run test:smoke` | Demo API over HTTP, SSE and WebSocket; CORS; refusal to start on unsafe settings | Passed |
| `npm run test:database` | Migrations and accounting in disposable PostgreSQL, two-connection races, the live API with local JWKS, and 21 API contract cases against a local OpenAI stand-in | Passed |
| `npm run test:e2e` | 47 Playwright cases: website (16), desktop renderer (17), pop-up (7), the real Electron app (7) | Passed |
| `npm run test:ai` | Real OpenAI (gpt-4.1-mini, gpt-live-transcribe) through the real API, paid by the owner key | Passed. Answers in every mode in 1.5 to 2.2 s (first words after 0.5 to 0.8 s); a Python walkthrough in 4.9 s; the behavioral answer used only the saved facts; a prompt injection in a screenshot was ignored; a spoken question transcribed exactly, 1.2 s after the speech ended; 18 s of silence produced no text. Answers in `test-results/ai-report.md` |
| `npm run test:load` | Live users at a 70 ms database round trip (Render Oregon to Neon us-east-2) | p95 79 ms at 25 users, 185 ms at 75, 2.1 s at 150, no failures |
| `npm run verify:release -- --published` | The 0.1.9 build and what users download | Passed; warns that the app has no hardened runtime and the RunAsNode fuse is on (ELEC-11) |
| `npm run probe:production` | Read-only checks of the live API and website | One failure: the privacy policy still shows the contact placeholder (LEG-1); no CSP, frame, nosniff or referrer headers (SEC-1) |
| `npm audit --workspaces` | Dependencies | 10 moderate, all `sprintf-js` through build tools (electron-builder) and mammoth's command line; none on a request path |
| Secret scan of every build output and the packaged app | Keys, database URLs, cookie secrets | None found |

CI (`check.yml`) now runs coverage and the website and renderer E2E suites. The Electron E2E project and `test:ai` need macOS and run locally.

## Pending

- The [device checklist](CAPTURE-MATRIX.md): capture, permissions, meeting apps, sleep, and a real 0.1.9 → 0.1.10 update. Needs a person and a build with these fixes.
- Open findings that need a decision: the contact address (LEG-1), moving the API next to the database (API-16), and the rest marked *Open* in the findings.
- The device checklist on Windows: a Windows 10 or 11 PC, steps 1–30 where they apply.

# Verification — October 13, 2026 (earlier record)

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
