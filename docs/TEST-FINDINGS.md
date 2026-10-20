# Test findings

Read-only risk sweep run on 2026-10-19 against Ctrue 0.1.9 (`d01e6a5`). Four reviewers each covered one area (API and database, Electron main process, renderer, website and release), and four independent skeptics then tried to refute each finding by re-reading the code.

113 findings: 67 confirmed, 44 plausible, 2 refuted (ELEC-25, ELEC-26). Severity below is the verifier's corrected rating.

**Status:** *Fixed (commit)* means a test failed before the fix and passes after it; *Open* means reported only: it needs a device check (docs/CAPTURE-MATRIX.md), a product decision, or is low priority. API-31 and A11Y-2 were found by the new test suites, after the sweep.

| ID | Severity | Verdict | Finding | Status |
|---|---|---|---|---|
| [API-31](#api-31) | high | confirmed | PDF resume import fails for every PDF on Node 24 (production) | Fixed (aa23087) |
| [REN-1](#ren-1) | high | confirmed | isNewProblem uses the /i flag, so [A-Z] matches any letter and ordinary follow-ups wipe the on-screen walkthrough | Fixed (21f9de4) |
| [API-1](#api-1) | medium | confirmed | Unauthenticated requests reach the DB and 5 MB JSON parse with no per-IP limit; 10-connection pool has no timeouts | Fixed (e31d91a) |
| [API-7](#api-7) | medium | confirmed | AudioTurns commits 15 s of pure silence, so silence is transcribed and can leak the transcription prompt as text | Fixed (bd6f5c8) |
| [API-8](#api-8) | medium | plausible | PDF and DOCX import parse untrusted files in-process, with no page cap, timeout or concurrency limit, on one small instance | Open |
| [API-13](#api-13) | medium | plausible | No WS ping/pong: a half-open socket keeps the `transcribing` guard, so reconnect is refused 409 while the lease stays alive | Fixed (c86a297) |
| [API-14](#api-14) | medium | plausible | Transcription provider failures are fatal and there is no seam to test the provider path | Fixed (e31d91a) (test seam and provider-path contract cases added; failures still end capture (no auto-reconnect)) |
| [API-17](#api-17) | medium | confirmed | Web dashboard 'Generate answer' never sends the OpenAI key, so it returns 402 for every non-owner and starts a session first | Fixed (5163666) |
| [API-18](#api-18) | medium | plausible | Node keepAliveTimeout (5 s default) coincides with the 5 s heartbeat; a single transient failure makes the desktop stop capture | Open |
| [CI-1](#ci-1) | medium | confirmed | No browser E2E for the website: the 43-line dashboard component holds all session, handoff, resume and answer logic with zero tests | Fixed (5163666) |
| [ELEC-1](#elec-1) | medium | confirmed | Release signing silently falls back to ad hoc; nothing pins the self-signed identity | Fixed (c0609be) |
| [ELEC-2](#elec-2) | medium | confirmed | Expired or rotated-away refresh token leaves the UI looking signed in, with no Sign-in button | Fixed (8021583) |
| [ELEC-7](#elec-7) | medium | plausible | Permission handler denies clipboard-sanitized-write, so the 'Copy' buttons are likely dead (verify on device) | Fixed (8021583) |
| [ELEC-12](#elec-12) | medium | confirmed | Desktop opens /login?desktop=1 but the website ignores the flag and drops it from the callback | Open |
| [ELEC-13](#elec-13) | medium | confirmed | All credential, deep-link and updater logic lives in main.ts with top-level Electron side effects, so none of it can be tested | Fixed (8021583) |
| [REL-1](#rel-1) | medium | plausible | Mac release, self-signed identity and auto-update feed have no automated check anywhere | Fixed (c0609be) |
| [REN-2](#ren-2) | medium | confirmed | Retry on a walkthrough that failed before its first step drops the problem and screenshots and re-reads the textbox or stale speech | Fixed (8e96f4c) |
| [REN-3](#ren-3) | medium | confirmed | Pop-up renders the step explanation twice, and shows another step's explanation under the current step | Fixed (efd8717) |
| [REN-5](#ren-5) | medium | confirmed | A rejected refresh (revoked or 30-day-idle credential) leaves the app in a zombie 'signed in' state with no sign-in prompt | Fixed (8021583) |
| [REN-8](#ren-8) | medium | confirmed | Automatic questions answer any 2+ word utterance (fillers, 'Thank you.', silence hallucinations), replacing the on-screen answer and spending the user's OpenAI quota | Open |
| [REN-9](#ren-9) | medium | confirmed | Client tolerates ~8 s of buffered audio but the server budget accepts a 2 s burst, so a 2-8 s network stall ends capture with 'Audio exceeds realtime speed' | Fixed (2d308c5) |
| [REN-13](#ren-13) | medium | confirmed | The 'answer' shortcut in walkthrough mode restarts the whole walkthrough from stale input, and the guard that claims otherwise is dead code | Fixed (8e96f4c) |
| [WEB-1](#web-1) | medium | confirmed | Dashboard practice answers always fail for non-owner users because the web never sends X-OpenAI-Key | Fixed (5163666) |
| [A11Y-1](#a11y-1) | low | confirmed | Accessibility gaps on the dashboard: unannounced stream and status, unsupported aria-labels, duplicate titles | Open |
| [A11Y-2](#a11y-2) | low | confirmed | Home page label below WCAG AA contrast | Fixed (5163666) |
| [API-2](#api-2) | low | confirmed | Client cancel before listeners are registered leaves a zombie OpenAI generation holding the `answering` lock | Fixed (e31d91a) |
| [API-3](#api-3) | low | plausible | Check-then-add across an await defeats the one-answer and one-transcription guards | Fixed (e31d91a) |
| [API-4](#api-4) | low | confirmed | Lease pollers treat any error as lease loss; the answers poller has no in-flight guard; no DB timeouts | Open |
| [API-5](#api-5) | low | confirmed | Render runs NODE_ENV=development, so the fail-fast config guard is off and /health stays green with auth unconfigured | Open |
| [API-6](#api-6) | low | confirmed | The API's own 429 is rewritten as 'Your OpenAI account hit its rate limit or has no credit left' | Fixed (e31d91a) |
| [API-9](#api-9) | low | plausible | Import path is never run on a real PDF or DOCX; the strict ZIP validator is only tested on handcrafted single-entry archives | Fixed (aa23087) |
| [API-10](#api-10) | low | confirmed | Handoff code is a bare bearer with no binding to the requesting desktop; ctrue:// deep link redeems silently (login CSRF) | Open |
| [API-11](#api-11) | low | plausible | Refresh rotation: a lost response forces a browser re-login; expiry is sliding with no cap and no reuse detection | Open |
| [API-12](#api-12) | low | confirmed | JOSE error classification: a malformed JWKS (HTTP 200, not a key set) is a 401, and the 503 path has no test | Fixed (c86a297) |
| [API-15](#api-15) | low | confirmed | Model refusals are dropped, so the client sees a successful empty answer; upstream event handling is untested | Open |
| [API-16](#api-16) | low | plausible | 1 s lease polling writes to the DB on every call and, with pool=10 and cross-region RTT, caps concurrency near ~50 active users | Open (measured by npm run test:load: p95 79 ms at 25 live users, 185 ms at 75, 2.1 s at 150) |
| [API-19](#api-19) | low | confirmed | sql() reports DB data errors as an outage (503) and maps RAISE messages by substring | Open |
| [API-20](#api-20) | low | confirmed | docs/API.md contradicts the code in several places | Fixed (622c602) |
| [API-21](#api-21) | low | confirmed | Config files drift from what the code reads | Open |
| [API-22](#api-22) | low | confirmed | Status-code and JSON contract gaps, and unexpected 500s are not logged | Open |
| [API-23](#api-23) | low | confirmed | Wrong user-facing text on lease loss and in free mode | Open |
| [API-24](#api-24) | low | confirmed | Shutdown drains for 2 s while Render allows 30 s; deploys drop live audio and in-memory sign-in codes | Open |
| [API-25](#api-25) | low | confirmed | Server logs can contain fragments of users' OpenAI keys and org IDs | Open |
| [API-26](#api-26) | low | confirmed | CORS and WS origin rules have no automated check | Fixed (9529464) |
| [API-27](#api-27) | low | plausible | TRUST_PROXY=1 correctness behind Render's edge is unverified; per-IP limits can collapse into shared buckets | Open |
| [API-28](#api-28) | low | confirmed | DB test harness depends on the public OpenAI API, a hard-coded migration list and fixed ports | Fixed (e31d91a) |
| [API-29](#api-29) | low | plausible | No schema-version guard: code deployed before a manual migration turns every request into a generic 503 | Open |
| [API-30](#api-30) | low | confirmed | Money and token RPCs claim row-lock safety but are only tested sequentially on one connection | Fixed (9529464) |
| [CONTRACT-1](#contract-1) | low | plausible | No test ties the API handoff code format to the desktop link validator | Open |
| [DEP-1](#dep-1) | low | plausible | Render runs NODE_ENV=development, so the production start gate is bypassed and /health returns 200 even when unconfigured | Open |
| [DEP-2](#dep-2) | low | confirmed | render.yaml drift: dead WEB_URL, lockfile-triggered restarts, unverified TRUST_PROXY hop count | Open |
| [DEP-3](#dep-3) | low | plausible | CORS and WebSocket origin policy is untested and unforgiving (exact-match, no normalisation, previews and www blocked) | Fixed (9529464) |
| [DEP-PIN](#dep-pin) | low | plausible | next, react, react-dom, typescript and @types/* are 'latest' on top of a beta Neon Auth SDK that the code works around | Open |
| [DOC-1](#doc-1) | low | confirmed | docs/API.md no longer matches the API (walkthrough mode, key header, metering, credits) | Fixed (622c602) |
| [DOC-2](#doc-2) | low | confirmed | Stale or contradicting claims in README, VERIFICATION.md, NEON-MIGRATION.md and the landing page | Open |
| [ELEC-3](#elec-3) | low | plausible | `quitting=true` is set before quitAndInstall and never reset when the install fails | Open |
| [ELEC-4](#elec-4) | low | confirmed | Later failing update check hides 'Restart to update' for an already-downloaded update, and the fallback flag is sticky | Fixed (8e96f4c) |
| [ELEC-5](#elec-5) | low | confirmed | Pop-up window can invoke every privileged IPC channel (plaintext OpenAI key, credentials, signout, protect(false), quit) | Open |
| [ELEC-6](#elec-6) | low | plausible | captureGrant is one boolean plus an uncleared timer, so concurrent or back-to-back captures lose the grant | Open |
| [ELEC-8](#elec-8) | low | confirmed | Default global shortcuts steal system-wide keys and stay armed while the window is 'closed'; Shift-only or Alt-only combos are accepted | Fixed (5895240) |
| [ELEC-9](#elec-9) | low | plausible | Any startup failure quits silently with no dialog or log; no renderer-crash recovery | Open |
| [ELEC-10](#elec-10) | low | confirmed | Release env bake has no guard: .env fallback can ship localhost, a missing feed, or a bad website URL | Fixed (c0609be) |
| [ELEC-11](#elec-11) | low | confirmed | Shipped build has no hardened runtime or entitlements, and default Electron fuses, so local processes can ride Ctrue's TCC grants | Open (reported as warnings by npm run verify:release) |
| [ELEC-14](#elec-14) | low | plausible | Refresh rotation is not crash- or timeout-safe: a lost response, an aborted request or a truncated write forces re-login | Open |
| [ELEC-15](#elec-15) | low | plausible | handleLink bumps credentialVersion before the code is redeemed, so a failed or duplicate link discards an in-flight refresh | Open |
| [ELEC-16](#elec-16) | low | confirmed | Deep link silently replaces the signed-in account and steals focus; desktop code regex is looser than the server's | Open |
| [ELEC-17](#elec-17) | low | confirmed | 'Check for updates' reports 'You have the latest version' when the check actually failed | Fixed (9ada226) |
| [ELEC-18](#elec-18) | low | plausible | restore()/emit() are unguarded before the window exists or after it is destroyed | Open |
| [ELEC-19](#elec-19) | low | plausible | assertSender builds the expected file URL by string concatenation instead of pathToFileURL | Open |
| [ELEC-20](#elec-20) | low | plausible | Undecryptable credential files and sign-out edge cases are not recoverable or fully revoked | Open |
| [ELEC-21](#elec-21) | low | plausible | popup-state has no shape validation, and the 200 KB cap drops silently | Open |
| [ELEC-22](#elec-22) | low | plausible | Default Electron application menu is left in the packaged app; Cmd+R, Cmd+W, Cmd+Q and DevTools act inside the shortcut recorder | Open |
| [ELEC-23](#elec-23) | low | plausible | Running `npm run dev` re-registers the ctrue:// handler to the dev Electron bundle | Open |
| [ELEC-24](#elec-24) | low | confirmed | Two independent CSPs drift: the runtime header (not applied to file://) and the build-time meta tag | Open |
| [ELEC-27](#elec-27) | low | confirmed | README and .env.example do not match the real release flow; website download link depends on an undocumented asset rename | Open |
| [LEG-1](#leg-1) | low | plausible | Privacy and Terms promise data-access and deletion via 'contact details below', but the contact is an env-driven placeholder | Open (confirmed live by npm run probe:production) |
| [MD-1](#md-1) | low | plausible | Website Markdown renderer is an unexported, untested copy of the desktop parser with no parity check | Fixed (2e7853d) |
| [REL-2](#rel-2) | low | plausible | Build-time public env is unchecked: a missing value silently degrades the site (API URL becomes localhost, download CTA, contact, sign-in) | Open |
| [REN-4](#ren-4) | low | confirmed | One failed heartbeat (503, 429, timeout) stops live capture and pauses the session, although the server lease tolerates three misses | Open |
| [REN-6](#ren-6) | low | confirmed | 'Sign out & clear context' and 'Clear session context' leave the walkthrough, problem screenshots, question and pop-up question in memory | Fixed (8e96f4c) |
| [REN-7](#ren-7) | low | plausible | Pop-up state over 200 KB is rejected by main and the renderer swallows the error, so the pop-up silently freezes | Open |
| [REN-10](#ren-10) | low | plausible | Profile 'Save reviewed facts' is enabled before the profile has loaded, so a failed or slow load followed by Save overwrites stored facts with the textbox contents | Fixed (8e96f4c) |
| [REN-11](#ren-11) | low | confirmed | A transient updater error after the update has downloaded replaces 'Restart to update' with a manual-download banner | Fixed (8e96f4c) |
| [REN-12](#ren-12) | low | confirmed | 'Check for updates' says 'You have the latest version' when the check failed | Fixed (9ada226) |
| [REN-14](#ren-14) | low | plausible | Preempting generate() can orphan an in-flight request and race the server's per-user answering lock | Open |
| [REN-15](#ren-15) | low | confirmed | Screenshot shortcut clears collected screenshots before the answer succeeds, and the 5 MB body limit has no client-side guard | Open |
| [REN-16](#ren-16) | low | confirmed | Screenshot shortcut with no recent speech forces 'coding' mode, ignoring the selected Technical, Behavioral or System design mode | Open |
| [REN-17](#ren-17) | low | confirmed | Walkthrough topic auto-switch to 'system-design' is one-way and sticky, and 'system design' anywhere in the problem text triggers it | Open |
| [REN-18](#ren-18) | low | confirmed | buildCode uses String.replace with code as the replacement, so '$&', "$'", '$`' and '$$' in step code corrupt the rebuilt solution and trigger a false 'solution differs' warning | Fixed (dd705ab) |
| [REN-19](#ren-19) | low | confirmed | controlSession pause/end mutates sessionRef before the server call and never rolls back on failure, so UI state and ref diverge | Open |
| [REN-20](#ren-20) | low | plausible | A desktop 'auth' event (deep link sign-in) does not reset session, capture or context when it replaces an existing sign-in | Open |
| [REN-21](#ren-21) | low | confirmed | The pop-up webContents gets the full privileged preload API and every IPC channel (OpenAI key, tokens, shortcuts, quit) | Open |
| [REN-22](#ren-22) | low | plausible | No React error boundary: any render exception blanks the window while the session, shortcuts and capture keep running | Open |
| [REN-23](#ren-23) | low | confirmed | Stale 'credits' copy in a free, bring-your-own-key product | Open |
| [REN-24](#ren-24) | low | confirmed | Pop-up shortcut hint never refreshes after rebinding, and a partially failed Save leaves an action unbound yet persisted | Open |
| [REN-25](#ren-25) | low | plausible | Every transcript delta re-renders the whole App and re-sends the full history through IPC to the pop-up | Open |
| [REN-26](#ren-26) | low | confirmed | Resume size limits drift (UI '10 MB', API 8,000,000 bytes) and the 15 s default fetch timeout also covers upload plus parsing | Fixed (9ada226) |
| [REN-27](#ren-27) | low | confirmed | The saved OpenAI key survives sign-out, so the next account on the same Mac silently uses the previous user's key | Open |
| [REN-28](#ren-28) | low | confirmed | Auto questions semantics: the capture shortcut forces Auto on (even when it was turned off), and ticking Auto later answers old, unanswered speech | Open |
| [REN-29](#ren-29) | low | plausible | mic-off relisten flag can stay set when the microphone was already off, causing a surprise capture start later | Open |
| [REN-30](#ren-30) | low | plausible | WebSocket start uses tokenRef without the 401-refresh path, but access tokens live only 10 minutes | Open |
| [REN-31](#ren-31) | low | confirmed | capture.ts lifecycle (abort during connect, server error before and after ready, track ended, backpressure, bad provider JSON) has no automated test | Fixed (8e96f4c) (listening path covered end to end in e2e/desktop.spec.ts; abort and backpressure branches still untested) |
| [REN-32](#ren-32) | low | plausible | Renderer-to-API contract constants are duplicated and unpinned (images, sizes, languages, step schema, SSE and WS shapes) | Open |
| [SEC-1](#sec-1) | low | plausible | Website sends no CSP, frame-ancestors, nosniff or referrer policy, yet exposes a bearer JWT to page JS | Open (confirmed live by npm run probe:production) |
| [SEC-2](#sec-2) | low | plausible | Catch-all /api/auth proxy exposes every Neon Auth endpoint, including email/password sign-up, though the UI is Google-only | Open |
| [SEC-3](#sec-3) | low | plausible | Desktop tokens ignore Neon account state and are renewed forever; there is no revoke-all or account-deletion path despite the privacy promise | Open |
| [SEC-4](#sec-4) | low | plausible | ctrue://auth link signs the desktop into any account without confirmation (login CSRF) | Open |
| [WEB-2](#web-2) | low | confirmed | Dashboard shows a sawtooth 'remaining' countdown in free (METERING=false) mode | Open |
| [WEB-3](#web-3) | low | confirmed | Sign out is blocked whenever ending the session fails (API down, 429, 404, token fetch failure) | Fixed (9ada226) (needs a signed-in browser; device checklist step 30) |
| [WEB-4](#web-4) | low | confirmed | Web dashboard adopts and then ends the same session the desktop is using, killing live transcription | Open |
| [WEB-5](#web-5) | low | plausible | bearer() cache is never invalidated on a 401 and trusts the client clock | Open |

## Details

### API-31

**PDF resume import fails for every PDF on Node 24 (production)** · high · confirmed · `apps/api/src/index.ts:147`

- **Status:** Fixed (aa23087)
- **What happens:** pdf-parse's bundled pdf.js fails with "bad XRef entry" when handed a Buffer on Node 24 and later (Node 22 works). Render runs Node 24, so every PDF upload returned "Could not extract this document". Found while writing the web E2E import test; reproduced with a macOS-generated PDF and an Apple product PDF.
- **Verifier:** Found and reproduced by the new test suites during this run.
- **Test (integration):** scripts/api-contract.mjs imports e2e/fixtures/resume.pdf and resume.docx through the real API; e2e/web.spec.ts imports both from the dashboard.

### REN-1

**isNewProblem uses the /i flag, so [A-Z] matches any letter and ordinary follow-ups wipe the on-screen walkthrough** · high · confirmed · `apps/desktop/src/api.ts:43`

- **Status:** Fixed (21f9de4)
- **What happens:** Walkthrough mode with 6 steps on screen. Auto questions are on, because the capture shortcut calls setAutomatic(true) at App.tsx:401. The interviewer says 'Why did you write it that way?', 'What does this code do?', 'How would you solve it with less memory?' or 'Can you build on that?'. The regex /\b(design|build|create|implement|write|code|solve)\s+(an?\s|[A-Z])/i matches 'write it', 'code do', 'solve it' and 'build on', because the i flag lets [A-Z] match lowercase. The only strip is design|build + this|it|that. isNewProblem returns true, so App.tsx:390 takes the generate(..., preempt=true) branch. walk(false) then runs stepsRef.current=[] and setSteps([]) at App.tsx:344, and the user's whole solution is replaced by a walkthrough of a non-problem. It also spends an OpenAI call. The existing test passes only because its negative phrases ('How would you scale this?', 'What is the time complexity?') contain none of the trigger verbs.
- **Verifier:** api.ts:43 regex has the /i flag, so [A-Z] matches lowercase. 'write it', 'code do', 'solve it', 'build on', 'write the', 'implement this' all match. Only 'design|build + this|it|that' is stripped. App.tsx:390 then calls generate(..., preempt=true). generate() passes the line-304 guard, walk(false) runs, and line 344 clears stepsRef/setSteps([]). The existing test only uses negatives with no trigger verb (core.test.ts:121). Follow-ups about code are the commonest walkthrough interjections, so this is reachable in normal use and wipes the on-screen solution mid-call.
- **Test (unit):** In apps/desktop/tests/core.test.ts add negatives to the isNewProblem test: 'Why did you write it that way?', 'What does this code do?', 'How would you solve it with less memory?', 'Can you build on that?', 'Walk me through the code once more'. All must be false. Also assert 'Design Uber' stays true. Then fix the regex by dropping the i flag on the capital-letter branch.

### API-1

**Unauthenticated requests reach the DB and 5 MB JSON parse with no per-IP limit; 10-connection pool has no timeouts** · medium · confirmed · `apps/api/src/index.ts:77`

- **Status:** Fixed (e31d91a)
- **What happens:** One client with no account loops `Authorization: Bearer <random 64-hex>` against /account at 150+ req/s. Every request passes express.json (line 115, up to 5 MB parsed before auth) and reaches authenticate(), which runs `select ... from desktop_tokens` (line 64). Any string without a dot is sent to the DB, with no shape check against the exact 64-hex token format. rate() runs only after a successful authenticate (line 78), and the per-IP limits exist only on /auth/redeem|refresh|logout. The pool is `max:10` with no connectionTimeoutMillis or statement_timeout (line 24). Legitimate heartbeats, WS lease polls and answer polls queue FIFO behind the flood. The desktop's 15 s fetch timeout then fires, and App.tsx:199-206 stops capture and pauses the session for every user. Posting 5 MB bodies to any path burns CPU on a single-instance Node process before any auth check.
- **Verifier:** index.ts:77-78 and 64: auth() runs authenticate() before rate(). Any dot-free string up to 8000 chars goes to `select ... from desktop_tokens`. Per-IP limits exist only on redeem/refresh/logout. express.json (115) parses 5 MB bodies before auth. Pool is `max:10` with no connectionTimeoutMillis or statement_timeout (24), so waiters queue forever. App.tsx:199-206 stops capture on a single failed or timed-out heartbeat, so queueing does reach live users. Whether an attack saturates the pool depends on DB RTT (~150 qps at 65 ms), but ~300 req/s is trivial for one client. Availability only, no data exposure, so high is overstated. A 64-hex shape check before the DB is the cheap fix.
- **Test (security):** In scripts/test-database.mjs, with the live API on the disposable cluster, fire ~300 req/s of bad-token requests for 10 s while one legitimate session heartbeats. Assert legit p95 < 1 s and that bad-token requests get 429 after N/min per IP. Add a core.test.ts case that tokens which are not 64-hex and not a 3-part JWT are rejected 401 without a DB call.

### API-7

**AudioTurns commits 15 s of pure silence, so silence is transcribed and can leak the transcription prompt as text** · medium · confirmed · `apps/api/src/core.ts:117`

- **Status:** Fixed (bd6f5c8)
- **What happens:** The commit condition is `(voiced && silence>=...) || samples>=24*15000`. The second clause does not require `voiced`. During any 15 s with no speech (waiting for the interviewer, muted call), the server sends input_audio_buffer.commit for 15 s of silence. That is transcribed and billed on the user's key. Short-silence hallucinations are common, and the session prompt 'The speakers use English. Write the transcript in English only.' (index.ts:226) can come back as a final transcript. Those finals flow into `context` (App.tsx:325, last 8 finals) and pollute answers. The existing unit test (core.test.ts:27) covers only speech followed by silence.
- **Verifier:** core.ts:117: `(voiced&&silence>=...)||samples>=24*15000`. The second clause has no `voiced` check, so every 15 s of silence is committed. The desktop sends all audio unconditionally (capture.ts:68-70). The test title says commits happen 'only after voiced speech', which the code contradicts. Committing silence is certain. The leak or hallucination is plausible but unproven: VERIFICATION.md says real transcription was never run. In automatic mode (App.tsx:379-392) any multi-word final that passes isEnglish triggers generate(), so a hallucinated final becomes an unsolicited AI answer. Billing cost is trivial. Medium rests on the number of silent commits per call.
- **Test (unit):** In apps/api/test/core.test.ts, feed 75 chunks of 9600 zero bytes (15 s at 24 kHz PCM16) to `new AudioTurns()` and assert append never returns true, or returns true only once real speech was seen. Also assert that speech held continuously for 15 s still commits.

### API-8

**PDF and DOCX import parse untrusted files in-process, with no page cap, timeout or concurrency limit, on one small instance** · medium · plausible · `apps/api/src/index.ts:147`

- **Status:** Open
- **What happens:** Any signed-in user (Google sign-up is open) can POST /profile/import (8 MB multer memory buffer, line 143). pdf-parse 1.1.4 bundles pdf.js v1.10.100 (2018) with `max:0` (all pages), `disableWorker=true` and no timeout (line 147 passes no options), so the parse blocks the single event loop. An 8 MB PDF with thousands of pages or a pathological xref stalls every WS lease check and SSE stream. For DOCX, docxSize allows 32 MB of inflation (core.ts:81), and mammoth builds a DOM from it. On a Render starter instance (512 MB) that is an OOM risk that kills all live sessions. The inflate in docxSize is synchronous as well. The general limit is 120 req/min per user, so 8 MB x concurrent requests is unbounded memory.
- **Verifier:** index.ts:147 calls `pdf(file.buffer)` with default options (pdf-parse max:0 = all pages, in-process, no timeout). docxSize allows 32 MB of inflation, and the inflate is synchronous. Mammoth then parses it, with no import-specific limit or concurrency cap, on a single instance. Any Google sign-up can reach the route, and the 120/min limit does not bound memory. Event-loop stall and OOM are reachable in principle, but actual stall time and RSS for a crafted file are unmeasured. Authenticated-only, so medium.
- **Test (performance):** Against the demo API (the import route does not need the DB), post (a) an 8 MB PDF of ~20k blank pages and (b) a DOCX with a ~31 MB document.xml of nested paragraphs. Sample perf_hooks.monitorEventLoopDelay and RSS. Assert event-loop delay < 200 ms and RSS < 300 MB, or an early 400. Pass `{max: N}` to pdf-parse, add a per-user 3/min import limit and a concurrency cap of 1.

### API-13

**No WS ping/pong: a half-open socket keeps the `transcribing` guard, so reconnect is refused 409 while the lease stays alive** · medium · plausible · `apps/api/src/index.ts:219`

- **Status:** Fixed (c86a297)
- **What happens:** The server never pings (grep: none). After a wifi switch or laptop sleep the old TCP connection stays 'open' from the server's view. The desktop keeps heartbeating over a new connection, so the lease check at line 211 passes for the dead socket and nothing kills it. The user presses Resume capture, the new `start` hits `transcribing.has(uid)` and gets 'Transcription is already active' until the proxy or TCP layer eventually drops the old socket. Also, fail() only calls socket.close() (line 210), and the guard is cleared in the 'close' handler (line 239), which waits up to ws's 30 s closeTimeout on an unresponsive peer. The duration depends on Render's proxy idle behaviour and is unverified.
- **Verifier:** No ping/pong/terminate anywhere in apps/api/src. The `transcribing` guard is cleared only in the socket 'close' handler (239). On a Wi-Fi switch the desktop keeps heartbeating over HTTP, so the lease check passes for the dead socket. The desktop stops capture itself (bufferedAmount > 512000, capture.ts:69). Resume then hits `transcribing.has` and gets 409. The sleep case self-heals, because heartbeats stop, the lease poller fails the socket, and ws closeTimeout is 30 s. The Wi-Fi-switch case depends on Render's proxy idle behaviour, which is unverified. Server-side ping is cheap standard hardening. Medium because it hits a live reconnect.
- **Test (integration):** Route a WS client through a TCP proxy that can stop forwarding without sending FIN. Start transcription, freeze the proxy while heartbeats continue on another connection, then open a second WS and send `start`. Assert the second is accepted within ~35 s (server ping/pong terminates the first, or a new start supersedes the old one). Currently 409 persists.

### API-14

**Transcription provider failures are fatal and there is no seam to test the provider path** · medium · plausible · `apps/api/src/index.ts:227`

- **Status:** Fixed (e31d91a) — test seam and provider-path contract cases added; failures still end capture (no auto-reconnect)
- **What happens:** A single `conversation.item.input_audio_transcription.failed` event or any provider `error` event calls fail() and ends the user's live transcription (line 227). The desktop reacts by stopping capture and pausing the session. Provider session caps are another risk: if the realtime transcription session ends at its maximum duration (30/60 min is unverified for intent=transcription), `provider.on('close')` ends the call, with no server-side or client-side transparent reconnect. A 60 min or longer interview loses transcription abruptly. The provider URL is hard-coded (`wss://api.openai.com/...`, line 224) and the model name `gpt-live-transcribe` is never verified, so none of this path is testable offline. VERIFICATION.md confirms real transcription was never run.
- **Verifier:** index.ts:227 sends every provider `error` and every transcription.failed to fail(). The provider close handler (228) does the same. capture.ts:61 then stops capture with 'Resume capture to reconnect', so there is no auto-reconnect. The realtime URL is hard-coded (224), so the provider path cannot be tested offline. docs/VERIFICATION.md:24 says real transcription was never run. A session cap or a non-fatal provider error ending a long interview is credible but unverified against real provider behaviour. Medium as a long-call resilience risk.
- **Test (integration):** Make the realtime URL configurable (e.g. OPENAI_REALTIME_URL) and add a fake provider in test-database.mjs. Table-driven cases: session.updated -> ready; delta/completed -> partial/final; transcription.failed -> assert the session survives and the segment is skipped; error code invalid_api_key -> specific message; unexpected-response 401; close after N s -> reconnect or clear error; no response -> start timeout. Add a manual-device 65-minute soak with a real key.

### API-17

**Web dashboard 'Generate answer' never sends the OpenAI key, so it returns 402 for every non-owner and starts a session first** · medium · confirmed · `apps/web/app/dashboard/page.tsx:30`

- **Status:** Fixed (5163666)
- **What happens:** In production (METERING=false, BYO key) aiKey() requires X-OpenAI-Key unless plan==='owner' (index.ts:91-92). The dashboard's generate() POSTs /answers with no key header, and the key lives only in the desktop's safeStorage. Every non-owner gets 'Add your OpenAI API key in the Ctrue desktop app...' after the page has already created and begun heartbeating a session (the UI says 'Starts a session for you'). The same page's Service status shows 'AI assistance: Not connected' when the owner key is unset (/health.configured.ai, index.ts:21), although BYO works.
- **Verifier:** dashboard/page.tsx:30 generate() starts or resumes a session, then POSTs /answers with only Content-Type and Authorization. There is no X-OpenAI-Key, and the web app has no key field. index.ts:91-92 returns 402 for every non-owner, so in BYO production the panel can never succeed. The error text points to the desktop app, which does not help because the dashboard never sends a key. Line 39 shows 'AI assistance: Not connected' when OPENAI_API_KEY is unset, although BYO works. A deterministic broken feature on a secondary surface, so medium.
- **Test (e2e-browser):** Playwright against apps/web with the API in test-database mode (OPENAI_API_KEY unset) and a non-owner JWT. Click 'Generate answer' and assert it is either disabled with an explanation or there is a key field. Assert no session is started when /answers cannot succeed, and that the Service status copy does not say 'Not connected' in BYO mode.

### API-18

**Node keepAliveTimeout (5 s default) coincides with the 5 s heartbeat; a single transient failure makes the desktop stop capture** · medium · plausible · `apps/api/src/index.ts:241`

- **Status:** Open
- **What happens:** server.keepAliveTimeout and headersTimeout are never raised. Node closes idle keep-alive sockets after 5 s, which equals the desktop and web heartbeat interval. Behind Render's proxy this is the classic race: the proxy reuses a socket Node just closed, giving an intermittent 502/ECONNRESET. Whether this occurs on Render is unverified and needs a soak. The consequence is certain, though: App.tsx:199-206 treats any single heartbeat failure as 'Connection lost', stops capture and pauses, even though the lease allows two missed beats.
- **Verifier:** No keepAliveTimeout or headersTimeout is set (grep: none), so Node's 5 s default applies, matching the 5 s heartbeat interval. Intermittent proxy/upstream-reset 502s from this mismatch are a known Node-behind-proxy pattern, but nothing here shows Render's upstream reuse behaviour. The consequence is confirmed: App.tsx:199-206 treats any single heartbeat failure as fatal and stops capture, aborts the answer and pauses. Setting keepAliveTimeout above the proxy idle time is cheap.
- **Test (release):** Soak: from outside Render run a 30-60 min script that POSTs /sessions/:id/heartbeat every 5 s, plus a variant with 4-6 s jitter, through the production URL. Count non-2xx and resets and compare after setting server.keepAliveTimeout=120000 and headersTimeout=125000. Add a smoke assertion on those values. Cross-file follow-up: desktop should tolerate 1-2 failed heartbeats.

### CI-1

**No browser E2E for the website: the 43-line dashboard component holds all session, handoff, resume and answer logic with zero tests** · medium · confirmed · `.github/workflows/check.yml:18`

- **Status:** Fixed (5163666)
- **What happens:** apps/web test is `node --test lib/*.test.mjs`, which only reaches the SSE parser. client.ts (bearer cache, request headers) and dashboard/page.tsx (heartbeat, pagehide keepalive, handoff link, upload validation, profile save/delete, sign-out) are TS/TSX that no runner imports. check.yml only typechecks and builds them. Examples that can regress unnoticed: the heartbeat effect deps, the busy guard, 'Connect desktop' no longer navigating to ctrue://auth?code=, the 8,000,000-byte client limit drifting from the API multer limit, and the 'demo' bearer leaking into a production bundle. The demo API plus NEXT_PUBLIC_DEMO_MODE=true (scripts/dev.mjs --demo) already gives a credential-free target.
- **Verifier:** apps/web test is node --test lib/*.test.mjs, which reaches only events.mjs. client.ts and dashboard/page.tsx have no tests, and check.yml only typechecks and builds. No Playwright or other browser runner is in the repo. This file holds the whole web session, handoff and profile logic, and the 'Connect desktop' handoff is the only way to sign the desktop in. This review found concrete bugs in exactly the untested code (WEB-1, WEB-3, WEB-4, WEB-2). Medium is justified.
- **Test (e2e-browser):** Add Playwright (apps/web/e2e/*.spec.ts) run in check.yml after build, using `npm run dev:demo` or next start with the demo API. Cover: start, heartbeat, pause, resume and end; the Generate answer stream renders markdown; import rejects a .txt and a >8,000,000-byte file; Save and Delete profile; Connect desktop is intercepted by page.on('framenavigated') or a route and the href matches /^ctrue:\/\/auth\?code=[a-f0-9]{64}$/; and a production build contains no demo path.

### ELEC-1

**Release signing silently falls back to ad hoc; nothing pins the self-signed identity** · medium · confirmed · `apps/desktop/scripts/adhoc-sign.cjs:12`

- **Status:** Fixed (c0609be)
- **What happens:** Operator runs `npm run package:mac` with CTRUE_SIGNED_RELEASE=true and the https feed, but CTRUE_SIGN_IDENTITY is unset or mistyped, or the self-signed cert has expired. The hook runs `codesign --sign '-'` (ad hoc), the --verify passes, and the build ships. Ad hoc designated requirement is a cdhash, so Squirrel.Mac refuses the update on every installed 0.1.x (their running DR is the cert leaf). It also resets Screen Recording/Microphone TCC grants and breaks access to the 'Ctrue Safe Storage' Keychain item, so credentials.enc and openai-key.enc fail to decrypt. Nothing checks the identity. The cert lives only in one login keychain, with no recorded expiry and no backup. Keychain Access defaults to 365 days, and v0.1.6 was cut on 2026-10-14.
- **Verifier:** adhoc-sign.cjs:12 does `process.env.CTRUE_SIGN_IDENTITY || '-'`, then verifies, so an unset variable silently ships an ad hoc build. Nothing else checks the identity or CTRUE_SIGNED_RELEASE. Parts of the scenario are wrong. A mistyped identity makes `codesign --sign <bad>` fail, so the build breaks loudly. The cert was created around 2026-10-14 per the release memory, so expiry is not near. The real trigger is an omitted env var, and the documented release command already lists CTRUE_SIGN_IDENTITY. The effects are real: Squirrel refuses the update, TCC grants reset and the Keychain item changes. Users get the download-link fallback and are not bricked, so 'high' is overstated.
- **Test (release):** Add apps/desktop/scripts/verify-release.mjs, run right after package:mac. It must assert `codesign -dr - Ctrue.app` contains `certificate leaf = H"CEEFE3EC7734E8C8DDA6293FBC4F6FE94709EC3F"`, that `codesign -dvv` does not report `Signature=adhoc`, and that appId and productName are unchanged. It should also warn when `security find-certificate -c 'Ctrue Self-Signed Code Signing' -p | openssl x509 -noout -enddate` is under 60 days away. Make adhoc-sign.cjs throw when CTRUE_SIGNED_RELEASE==='true' and CTRUE_SIGN_IDENTITY is empty.

### ELEC-2

**Expired or rotated-away refresh token leaves the UI looking signed in, with no Sign-in button** · medium · confirmed · `apps/desktop/electron/main.ts:90`

- **Status:** Fixed (8021583)
- **What happens:** The user is idle more than 30 days (sliding refresh_expires), or the refresh token was rotated away. performRefresh throws 'Login expired. Sign in again.' for any non-OK response. App.tsx:125-128 only clears the token when refresh() returns null, and authenticate(null) exists only in signout (App.tsx:441). The sidebar keeps showing 'Securely connected', the connect panel (!token) never appears, and every request, heartbeat and capture fails with the same banner. The dead credentials.enc is never removed, so this repeats on every launch. The only escape is Preferences > Sign out. The same 'Login expired' text is also shown for 503, 429 and network failures, which are transient.
- **Verifier:** performRefresh (main.ts:90) throws on any non-OK response, and the API returns 401 for an expired or rotated refresh token (index.ts:128). App.tsx:125-128 only clears the token when refresh() resolves null, which happens only when tokenPair is null. A throw propagates to run() and shows a banner. token stays truthy, so the sidebar says 'Securely connected', the `!token` connect panel never renders, and credentials.enc is never deleted. The only exit is Preferences > Sign out, or a manual 'Connect desktop' from the website. The refresh token has a sliding 30-day expiry (migration 001), so a monthly user hits this. Overstated detail: a network failure gives a raw fetch error, not 'Login expired', and a non-JSON 502/503 throws a SyntaxError at response.json() first. 429 and JSON 5xx do show the 'Login expired' text.
- **Test (integration):** Pull the refresh logic out of main.ts and add apps/desktop/tests/credentials.test.ts with a fake fetch. For 401, assert refresh resolves null and the stored credentials are deleted. For 503, 429 and fetch rejection, assert the credentials are kept and the error is retryable. Add a renderer test or an e2e-electron check that a null refresh shows the 'Connect your Ctrue account' panel.

### ELEC-7

**Permission handler denies clipboard-sanitized-write, so the 'Copy' buttons are likely dead (verify on device)** · medium · plausible · `apps/desktop/electron/main.ts:147`

- **Status:** Fixed (8021583)
- **What happens:** setPermissionRequestHandler and setPermissionCheckHandler grant only 'media' and 'display-capture', and only to the main window. Popup.tsx:38 and App.tsx 'Copy answer' call navigator.clipboard.writeText, which Electron routes through the 'clipboard-sanitized-write' permission. With deny-by-default handlers this is commonly rejected ('Write permission denied'). The pop-up swallows the error with .catch(() => {}), so Copy appears to do nothing; the main window shows an error banner. Not confirmed here; this needs a device check.
- **Verifier:** Both handlers (L147-152) allow only 'media' and 'display-capture' for window.webContents. 'clipboard-sanitized-write' is a permission in electron.d.ts (L13036/13045), so it is denied in both handlers, and the pop-up is never trusted. Popup.tsx:38, Walkthrough.tsx:29 and App.tsx:464 call navigator.clipboard.writeText. In Electron, deny-by-default handlers are widely reported to produce 'Write permission denied' for this API. I could not confirm the runtime behaviour statically, and the author flagged it as unverified. The popup swallows the error, so Copy would silently do nothing. If it is dead, 'Copy code' matters for a coding assistant. Needs a device check.
- **Test (manual-device):** Manual, then e2e-electron: in a packaged build click Copy in the pop-up and in the main window, then read `clipboard.readText()` in the main process. If it fails, allow 'clipboard-sanitized-write' for both trusted windows and add that assertion to the spec.

### ELEC-12

**Desktop opens /login?desktop=1 but the website ignores the flag and drops it from the callback** · medium · confirmed · `apps/desktop/electron/main.ts:237`

- **Status:** Open
- **What happens:** 'Sign in' in Ctrue opens `${website}/login?desktop=1`. apps/web/app/login/page.tsx never reads `desktop`, and signIn.social uses callbackURL `${origin}/dashboard` (L9), which drops the query. After Google sign-in the user lands on the dashboard and nothing happens in Ctrue. They must find and click 'Connect desktop' (dashboard/page.tsx:28) within the 60 s code lifetime of that click. This will read as 'sign-in is broken' to first-time users.
- **Verifier:** main.ts:237 opens `${website}/login?desktop=1`. In apps/web, login/page.tsx never reads a query parameter, and a grep for searchParams or `desktop=1` finds nothing. signIn.social uses a fixed callbackURL of `/dashboard`. After Google sign-in nothing hands off to the app. The user must find 'Connect desktop' (dashboard/page.tsx:28, which calls /auth/handoff and then assigns ctrue://auth?code=...). The desktop shows no waiting state. One detail in the finding is wrong: the 60 s code is minted when the user clicks Connect desktop, so there is no race against the earlier click. The first-run friction is real.
- **Test (e2e-browser):** Playwright e2e-browser in apps/web/e2e/desktop-login.spec.ts with Neon Auth stubbed: GET /login?desktop=1, complete sign-in, and assert POST /auth/handoff is called and navigation to ctrue://auth?code=<64 hex> is attempted. If the flow is intentionally manual, assert a prominent 'Connect desktop' state on the dashboard and drop the dead parameter.

### ELEC-13

**All credential, deep-link and updater logic lives in main.ts with top-level Electron side effects, so none of it can be tested** · medium · confirmed · `apps/desktop/electron/main.ts:58`

- **Status:** Fixed (8021583)
- **What happens:** Only security.ts is importable. The credentialVersion/single-flight machinery (L58-100), the handleLink/pendingLink/open-url/second-instance flow (L74-84, L121-122), signout (L177-182), the update gating and fallback (L24-40, L241-259) and assertSender have no test. The code is race-prone, and every race described in this report ships untested. Any future edit can reintroduce lost-rotation or lost-link bugs unnoticed.
- **Verifier:** apps/desktop/tests/core.test.ts imports only electron/security.ts and src/*. main.ts imports electron at the top level and has no extracted credential, link or updater module. The credentialVersion/single-flight/handleLink/signout logic (L58-100, L177-182) and the update gating are untested. This is a coverage gap, not a runtime bug. The credential machinery is the most intricate code in the app, and ELEC-14 and ELEC-15 show real edge cases there.
- **Test (unit):** Extract electron/credentials.ts (createCredentialStore with injected fs, safeStorage, fetch and clock) and electron/updates.ts. Write apps/desktop/tests/credentials.test.ts to cover: concurrent refresh() returns one fetch; signout during refresh leaves no file; link during refresh; storeTokens refuses basic_text and unavailable encryption; the second version check; ENOENT versus decrypt error on load. Run it in the existing `node --import tsx --test` suite.

### REL-1

**Mac release, self-signed identity and auto-update feed have no automated check anywhere** · medium · plausible · `apps/desktop/scripts/adhoc-sign.cjs:12`

- **Status:** Fixed (c0609be)
- **What happens:** Every release is hand-built from one laptop keychain (CTRUE_SIGN_IDENTITY, CTRUE_UPDATE_FEED_URL, DMG renamed to Ctrue-mac-arm64.dmg, three assets uploaded by hand). check.yml (ubuntu only) never runs `package:mac`, and desktop-build.yml is workflow_dispatch and Windows only. If a build is made with an unset CTRUE_SIGN_IDENTITY (falls back to ad hoc '-' at line 12), a different cert, or without latest-mac.yml or the zip, the app still builds. Every installed copy then either refuses to update (Squirrel.Mac requirement mismatch) or loses its Screen Recording permission (the README promises permissions carry over), and the only fix is a manual reinstall. A wrong version, sha512 or size in latest-mac.yml, or a missing zip, fails the same way. Nothing detects any of this before users do.
- **Verifier:** The gap is real. adhoc-sign.cjs:12 falls back to '-' when CTRUE_SIGN_IDENTITY is unset. check.yml is ubuntu-only and never runs package:mac, and the release is a hand process (see the release memory note: nine env vars, a DMG rename, three hand-uploaded assets). Nothing checks the designated requirement, latest-mac.yml or the asset URLs. Two things shrink the stated impact. (1) electron-builder generates latest-mac.yml itself, with version, sha512 and size, when a publish config is present, so a wrong sha512 or size mostly needs a hand-edited or re-signed zip. (2) A wrong-identity build fails safe for existing users. Squirrel.Mac and electron-updater refuse to install it, so they keep the old signed copy and the next correct release heals them. Only people who download the DMG from the website, or who are on a bad build, get a new identity and lose Screen Recording permission. Likelihood is low (one maintainer with a documented process) and the damage is recoverable, so 'high' is overstated.
- **Test (release):** Add scripts/verify-release.mjs, run by hand after `package:mac` and in a post-publish workflow. It reads `codesign -dr -` from the built .app and compares the designated requirement with a committed expected value (the cert SHA1). It checks that latest-mac.yml version equals apps/desktop/package.json, and that the sha512 and size match the zip. It then HEADs releases/latest/download/{latest-mac.yml, Ctrue-mac-arm64.dmg, zip} and expects 200 with plausible sizes. Pair it with a manual-device checklist: install N-1, publish N, confirm Restart-to-update and that Screen Recording stays granted.

### REN-2

**Retry on a walkthrough that failed before its first step drops the problem and screenshots and re-reads the textbox or stale speech** · medium · confirmed · `apps/desktop/src/App.tsx:366`

- **Status:** Fixed (8e96f4c)
- **What happens:** Walkthrough mode. The user presses the screenshot shortcut, so generate('Read and solve…', [shot], 'walkthrough') runs and the screenshot exists only in walkProblem.current.pictures. The request fails before any step arrives (402 no key, 429, network, 5xx). The walkError banner shows 'Retry'. retryWalk calls walk(stepsRef.current.length > 0), which is walk(false). walk(false) rebuilds the problem from question.trim() || image || the last two final transcript fragments (App.tsx:337-341). The screenshot is not in the `image` state. The retry therefore sends either 'Add the problem first…', or the interviewer's last spoken sentence as the new 'problem' with no images, and overwrites walkProblem.current. Second case: the stream breaks after the 'final' step but before 'done'. 'Retry from here' then asks the model to continue after an already-complete solution, and nothing in the client stops duplicate steps.
- **Verifier:** retryWalk (App.tsx:366) calls walk(stepsRef.current.length>0). With zero steps that is walk(false), which rebuilds the problem from question.trim() || image || the last two final fragments (337-341). The screenshot shortcut never sets `image`; the shot lives only in walkProblem.current. Retry therefore either shows 'Add the problem first' or overwrites walkProblem with unrelated speech and no pictures. The post-final-step stream-break case is speculative, but the first case is clear in the code.
- **Test (integration):** New apps/desktop/tests/app.test.tsx (jsdom, fake window.ctrue, stubbed fetch/MediaDevices). Trigger the screenshot action in walkthrough mode, make /answers return 402, click Retry, and assert the second POST body has the same question and images. Add a unit check that walk(false) for a retry reuses walkProblem.current.

### REN-3

**Pop-up renders the step explanation twice, and shows another step's explanation under the current step** · medium · confirmed · `apps/desktop/src/Popup.tsx:56`

- **Status:** Fixed (efd8717)
- **What happens:** Walkthrough mode, user asks 'Explain this step' or sends a follow-up on step 3. App.tsx:426 sends answer unconditionally and also walk.explanation (= answer while explainedIndex===stepIndex). Popup.tsx:54 renders walk.explanation inside the step article, and Popup.tsx:56 renders state.answer again, so the explanation appears twice. The user then presses Next to step 4. walk.explanation becomes '' but state.answer still holds step 3's explanation, which the pop-up shows under step 4 as if it belonged there. Switching mode from technical to walkthrough with an old answer also shows that old answer under the steps. The pop-up is the surface used during the call.
- **Verifier:** The popup-state effect (App.tsx:426) sends `answer` unconditionally and walk.explanation = answer when explainedIndex===stepIndex. Popup.tsx:54 renders walk.explanation and :56 renders state.answer, so the text shows twice. After Next, explanation becomes '' but state.answer is unchanged, so step 3's explanation shows under step 4. walk(false) also never clears `answer`. The main window is fine because it passes only the gated explanation.
- **Test (integration):** apps/desktop/tests/popup.test.tsx (jsdom): render <Popup/> and dispatch a popup-state event with {walk:{index:3,explanation:'X',...},answer:'X'}. Assert 'X' is rendered once. Dispatch {walk:{index:4,explanation:''},answer:'X'} and assert 'X' is not rendered.

### REN-5

**A rejected refresh (revoked or 30-day-idle credential) leaves the app in a zombie 'signed in' state with no sign-in prompt** · medium · confirmed · `apps/desktop/src/App.tsx:125`

- **Status:** Fixed (8021583)
- **What happens:** The refresh token has expired (refresh_expires is 30 days, database/migrations/001_ctrue.sql:21), was rotated by another desktop, or had its rotation response lost. performRefresh (electron/main.ts:90) throws 'Login expired. Sign in again.' but keeps tokenPair and the credentials file. request() only clears the token when refresh() returns null (App.tsx:128). On a rejection the exception propagates and token stays truthy. After a restart, credentials() returns the dead access token, so the avatar says 'Securely connected', the !token connect panel and Sign-in button never render, and every call fails with 'Login expired. Sign in again.' The only exit is Preferences, then 'Sign out & clear context'.
- **Verifier:** performRefresh (main.ts:90) throws on a non-OK response and keeps tokenPair and the credentials file. request() (App.tsx:125-128) only clears the token when refresh() returns null, which happens only when tokenPair is absent. A rejection propagates as an error and token stays truthy. After 30 days idle (refresh_expires, 001:21) or a lost rotation response (the API ponytail comment at index.ts:124), the user gets 'Login expired. Sign in again.' with no Sign in button, because the `!token` panel never renders. The exit is Preferences, then Sign out, or redoing Connect desktop on the web.
- **Test (integration):** apps/desktop/tests/app.test.tsx: fake window.ctrue.credentials returns 'stale', fetch returns 401, ctrue.refresh rejects 'Login expired'. Assert the 'Connect your Ctrue account' panel and the Sign in button appear. Add an e2e-electron case against a real API that rejects the refresh token.

### REN-8

**Automatic questions answer any 2+ word utterance (fillers, 'Thank you.', silence hallucinations), replacing the on-screen answer and spending the user's OpenAI quota** · medium · confirmed · `apps/desktop/src/App.tsx:387`

- **Status:** Open
- **What happens:** The lone-word filter is the only guard. 'Okay, great.', 'Got it', 'Thank you.' or 'Sounds good' are 2+ words, so after 1.8 s the timer sets question, calls generate() and POSTs /answers. The previous answer moves into history and the pop-up flips to 'Working on it…' while the user is still reading it. In walkthrough mode it fires explainStep for chit-chat, which is a paid call. The server commits 15 s of silence (AudioTurns, core.ts:117), and speech-to-text models commonly emit short phrases such as 'Thank you.' for silence, which would take the same path. Bursts also eat the 12/min answers rate limit (index.ts:167), then 429. The ponytail ceiling (one word) is exceeded by everyday small talk.
- **Verifier:** App.tsx:387 skips only a single-word utterance. 'Okay, great.', 'Got it' and 'Thank you.' pass after 1.8 s quiet and call generate/explainStep. That replaces the answer being read and spends the user's own OpenAI quota. In walkthrough mode with steps on screen it runs explainStep for chit-chat. The ponytail ceiling (one word) is exceeded by everyday small talk, so it is reachable in normal use. The silence-hallucination claim is conjecture. The 12/min limit (index.ts:167) is real.
- **Test (unit):** Extract the decision at App.tsx:384-392 into a pure shouldAutoAnswer(text) in apps/desktop/src/api.ts. In apps/desktop/tests/core.test.ts assert false for 'Okay great', 'Thank you.', 'Got it', 'Mm-hmm yeah', and true for 'What is a hash map?'. A fake-timer test then asserts exactly one generate() per 1.8 s quiet window.

### REN-9

**Client tolerates ~8 s of buffered audio but the server budget accepts a 2 s burst, so a 2-8 s network stall ends capture with 'Audio exceeds realtime speed'** · medium · confirmed · `apps/desktop/src/capture.ts:69`

- **Status:** Fixed (2d308c5)
- **What happens:** The client sends 9,600 PCM bytes (about 12.9 KB JSON) every 200 ms and stops only when ws.bufferedAmount > 512000, which is about 8 s of audio. AudioBudget (apps/api/src/core.ts:95-104) holds at most 96,000 bytes (2 s) and refills at realtime. A 3 s stall (Wi-Fi roam, VPN reconnect, Render proxy hiccup, main-thread pause) makes the backlog arrive as one burst of about 144 KB. The server throws 429 and fail() closes the socket. The user sees the API's wording ('Audio exceeds realtime speed') in the error banner, capture stops, and the session is paused. The client's 512000 rule never gets a chance to apply.
- **Verifier:** pcm-worklet posts 4800 samples (9600 PCM bytes, about 12.8 KB JSON) every 200 ms, so client bufferedAmount 512000 is about 8 s. AudioBudget (core.ts:95-104) holds 96000 bytes (2 s). A stall over about 2 s that is later flushed arrives as more than 10 chunks within milliseconds. The server then throws 429 'Audio exceeds realtime speed', fail() closes the socket, and the client's onclose/onError stops capture and pauses the session. The client cap never applies. Needs a 2 s or longer uplink stall, so occasional but real in long calls.
- **Test (integration):** scripts/smoke.mjs (or a new scripts/test-capture.mjs): open /transcription on the demo API, send 3 s of 200 ms PCM frames back-to-back. Assert either the stream survives or a documented, user-friendly error comes back. Decide one ceiling and assert client bufferedAmount cap <= server burst allowance in a unit test.

### REN-13

**The 'answer' shortcut in walkthrough mode restarts the whole walkthrough from stale input, and the guard that claims otherwise is dead code** · medium · confirmed · `apps/desktop/src/App.tsx:419`

- **Status:** Fixed (8e96f4c)
- **What happens:** Walkthrough on screen. The user presses CommandOrControl+Enter ('Answer what was just said') or the Start button. generate() runs with as='walkthrough' and preempt=true, which calls walk(false). That re-reads question (still holding the last auto-heard utterance because line 388 setQuestion) or the last two spoken fragments. It then runs stepsRef.current=[] / setSteps([]) (App.tsx:344), discarding every displayed step, and regenerates, sometimes from a different 'problem'. The guard at line 304 ('never restarts one already on screen') is unreachable: its only automatic caller passes preempt = (mode==='walkthrough') at line 391, so !preempt && as==='walkthrough' is never true.
- **Verifier:** The 'answer' action calls generate(), so as='walkthrough' and preempt=true. The guard at 304 (!preempt && walkthrough) is unreachable: the only automatic caller passes preempt = (mode==='walkthrough'), and all other callers use the default true. walk(false) then builds the problem from question.trim(), which holds the last auto-heard utterance because of setQuestion at 388, or from the last two fragments. It clears every step at 344. The auto and pop-up paths use explainStep for follow-ups, so this shortcut is inconsistent and destructive. Only the 'intended replace' reading keeps it from being higher.
- **Test (integration):** apps/desktop/tests/app.test.tsx: with 3 steps rendered in walkthrough mode, trigger the 'answer' action and assert the existing steps are kept (or an explicit confirmation is asked). Remove or fix the dead branch at line 304 and assert it with a generate() unit test.

### WEB-1

**Dashboard practice answers always fail for non-owner users because the web never sends X-OpenAI-Key** · medium · confirmed · `apps/web/app/dashboard/page.tsx:30`

- **Status:** Fixed (5163666)
- **What happens:** Production runs METERING=false with bring-your-own-key. aiKey() (apps/api/src/index.ts:88-94) returns 402 'Add your OpenAI API key in the Ctrue desktop app' for any non-owner unless the X-OpenAI-Key header is sent. generate() builds its /answers request with only Content-Type and Authorization, and there is no key field anywhere in the dashboard. Any normal signed-in user types a practice question and clicks Generate. The page silently starts a session first (leaving it active and heartbeating), then shows the 402 text pointing at a desktop Preferences screen. Only the owner account works. scripts/test-database.mjs lines 85-86 already asserts the 402, and the demo smoke can never see the problem because aiKey returns '' in demo.
- **Verifier:** generate() (dashboard/page.tsx:30) POSTs /answers with only Content-Type and Authorization, and the dashboard has no key input (grep of apps/web finds no X-OpenAI-Key). In index.ts /answers calls active() and then aiKey(). aiKey (88-94) returns 402 for any non-owner when the header is absent. Before that, generate() has already called request('/sessions') and applySession, so the session stays active and the heartbeat effect keeps running. The user sees the 402 text (it is not fully silent) and gets an error on every attempt. Only the owner plan works. test-database.mjs:85-86 asserts the same 402, and demo mode returns '' from aiKey, so no existing test sees the problem. The practice panel is a secondary surface, but it fails for every ordinary user, so medium is fair.
- **Test (e2e-browser):** Playwright spec apps/web/e2e/practice.spec.ts. Run the API against the disposable DB with METERING=false and a non-owner JWT, with no X-OpenAI-Key. Click Generate and assert that either the UI asks for a key or the panel is hidden, and that no session was left active as a side effect. Add the same case to scripts/test-database.mjs: POST /sessions then /answers with no key must not leave the dashboard in an unexplained error.

### A11Y-1

**Accessibility gaps on the dashboard: unannounced stream and status, unsupported aria-labels, duplicate titles** · low · confirmed · `apps/web/app/dashboard/page.tsx:40`

- **Status:** Open
- **What happens:** The streamed answer (line 40) and the 'Active / Connection interrupted / Paused' badge (line 38) are not in an aria-live region, so a screen-reader user hears nothing while tokens stream or when the lease drops. aria-label is put on a <p class=timer> and a <div class=answer-output>, where naming is prohibited or ignored, so VoiceOver reads the bare digits. /login, /dashboard and /downloads all share the layout title 'Ctrue - Clarity, in the moment' (no metadata export), which fails the page-titled criterion. Good already: the skip link, main#main, labelled controls, role=alert and status messages, focus-visible styles and the reduced-motion rule.
- **Verifier:** The dashboard code matches. The streamed answer div (line 40) and the status badge (line 38) are not in aria-live regions. aria-label is placed on a <p class=timer> and on a plain <div class=answer-output>, where naming is not supported. Only layout.tsx and the privacy/terms pages define titles, and /login, /dashboard and /downloads are client or plain components with no metadata export, so they share the layout title. The positives the finding lists (skip link, role=alert, role=status) are present. Low.
- **Test (e2e-browser):** Add @axe-core/playwright scans of /, /login, /dashboard (demo), /downloads, /privacy and /terms to the Playwright suite, failing on serious or critical issues. Add per-route title assertions. Then do a manual VoiceOver pass: start a session, stream an answer and pause the network.

### A11Y-2

**Home page label below WCAG AA contrast** · low · confirmed · `apps/web/app/globals.css:1`

- **Status:** Fixed (5163666)
- **What happens:** The "YOUR THINKING, WITH CONTEXT" label was #6f7965 on #10120f, 4.12:1 for 9 px text (AA needs 4.5:1). Found by the axe scan in e2e/web.spec.ts.
- **Verifier:** Found and reproduced by the new test suites during this run.
- **Test (e2e-browser):** axe scan of every page in e2e/web.spec.ts.

### API-2

**Client cancel before listeners are registered leaves a zombie OpenAI generation holding the `answering` lock** · low · confirmed · `apps/api/src/index.ts:178`

- **Status:** Fixed (e31d91a)
- **What happens:** POST /answers does `await active()` (line 176) and `await aiKey()` (line 177), two DB round trips of roughly 150 ms or more cross-region, before `res.on('close')` and `req.on('aborted')` are registered at line 178. A shortcut double-press or a desktop preempt (App.tsx:305 aborts then immediately re-sends) disconnects the client inside that window. The 'close' event has already fired, so the abort never triggers. The handler still flushes headers, calls OpenAI with a signal that never aborts, and generates the whole answer (up to 8000 tokens for walkthrough) on the user's key. `answering` stays set the whole time, so the user's next request gets 409 'Cancel the current answer first' and cannot cancel it.
- **Verifier:** index.ts:176-178: `res.on('close')` and `req.on('aborted')` are registered after await authenticate, active and aiKey, and EventEmitter does not replay. A client that aborts in that ~3-RTT window leaves a never-aborted OpenAI call. `send()` only guards writes, and the lease poller checks session state, not the connection. `answering` stays set, so the next /answers gets 409 (a desktop preempt re-POSTs immediately, App.tsx:305). Real, but the window is narrow and the effect is transient: wasted tokens on the user's own key plus a lockout until generation ends. Pausing the session also aborts it via the lease poller. Low.
- **Test (integration):** In scripts/test-database.mjs, start a local fake SSE upstream and set OPENAI_BASE_URL (the SDK honours it). POST /answers over a raw socket and destroy it immediately. Assert the fake upstream receives no request, or that its connection is closed within 1 s. Assert a follow-up /answers is not 409. Fix hint: check `res.destroyed` right after registering the listeners.

### API-3

**Check-then-add across an await defeats the one-answer and one-transcription guards** · low · plausible · `apps/api/src/index.ts:176`

- **Status:** Fixed (e31d91a)
- **What happens:** For /answers, `answering.has()` is checked at line 176 but `answering.add()` happens at line 178, after `await aiKey()` (a DB query). Two concurrent POSTs for one user (double submit, or a Retry racing the original) both pass the check and both stream from OpenAI on the user's key. The first to finish runs `answering.delete(u.id)` and removes the guard while the second is still running. WS start has the same shape: `transcribing.has` at line 219, `await aiKey` at line 220, `add` at line 221. Two sockets then open two realtime provider sessions. When one closes, `transcribing.delete(uid)` (line 239) unguards the other. The smoke test cannot catch this because in demo mode microtasks drain before the second request is parsed.
- **Verifier:** The race is real in code. For /answers, `has` is checked at 176, then `await aiKey` (DB), then `add` at 178. For WS, `has` is at 219, `await aiKey` at 220, `add` at 221. The first finisher's delete unguards the other. But the desktop serializes its own requests (inflight await at App.tsx:305; capturePending guards audio start). It needs two near-simultaneous requests for one user, e.g. dashboard plus desktop, or a modified client. The only cost is double generation on the user's own key. Low.
- **Test (integration):** In scripts/test-database.mjs, issue two /answers requests with Promise.all for one session and assert exactly one returns 409 'Cancel the current answer first'. Open two WS sockets and send `start` back to back. Assert exactly one gets 'Transcription is already active'; this works with a fake key because the 409 happens before the provider connects.

### API-4

**Lease pollers treat any error as lease loss; the answers poller has no in-flight guard; no DB timeouts** · low · confirmed · `apps/api/src/index.ts:182`

- **Status:** Open
- **What happens:** The WS lease check (line 211) calls fail('Session paused, expired, or exhausted') for every error from active(). That includes the HttpError 503 'Database unavailable' from a Neon pooler blip, pool exhaustion, or a scale-from-zero cold start. One bad second ends the user's transcription mid-call, with a message blaming the session. The answers poller (line 182) does `.catch(()=>abort.abort())` on the same errors, so one transient failure kills an in-flight answer. It also lacks the `checking` guard the WS poller has. A slow DB makes the 1 s intervals stack overlapping queries per answer, which worsens pool starvation. Conversely, with no query timeout, a hung query leaves `checking=true` forever (line 211), so lease enforcement silently stops for that socket.
- **Verifier:** index.ts:211 has a bare `catch{fail('Session paused, expired, or exhausted')}`, so a 503 from sql() ends transcription with a misleading message. Line 182 is `.catch(()=>abort.abort())` with no in-flight guard, so slow queries stack, unlike the WS `checking` flag. pg has no query timeout, so a hung query pins `checking=true`. All of this is as described. It only triggers on a DB blip, which is infrequent with 1 s polling keeping connections hot. The desktop already treats any single heartbeat failure as fatal, so this is consistent but fragile. There is no security impact because lease enforcement lives in the DB. Low.
- **Test (integration):** In the test-database harness, open an SSE answer against a slow fake upstream and `pg_ctl restart -m fast` the cluster for ~2 s. Assert the stream and WS survive (or fail with a distinct 'service unavailable' message). Assert at most one in-flight active() per answer using a pg_sleep wrapper or pool.waitingCount.

### API-5

**Render runs NODE_ENV=development, so the fail-fast config guard is off and /health stays green with auth unconfigured** · low · confirmed · `render.yaml:29`

- **Status:** Open
- **What happens:** index.ts:23 throws on missing Neon or OpenAI settings only when NODE_ENV=production. render.yaml sets development to avoid the OPENAI_API_KEY requirement (BYO-key app). DATABASE_URL and OPENAI_API_KEY are `sync: false`, so a blueprint re-sync, a typo or a rotated secret can leave DATABASE_URL empty. The service then boots with pool=null, /health returns 200 with configured.auth=false, and Render's healthCheckPath (/health) passes, so the deploy is promoted. Every authenticated call returns 503 'Authentication is not configured'. The inverse trap: setting NODE_ENV=production as the render.yaml comment implies refuses to boot because the owner key is optional.
- **Verifier:** render.yaml:28-29 sets NODE_ENV=development. The only fail-fast guard is index.ts:23, under NODE_ENV=production, and it requires OPENAI_API_KEY, which is optional in BYO mode. /health (114) returns 200 regardless of configured.auth. So a missing DATABASE_URL would be promoted green and then 503 every authenticated call. The trigger needs operator error: Render does not clear existing `sync:false` secrets on blueprint re-sync, and a typo'd URL still passes the guard. Defense-in-depth gap, not an active defect. Low.
- **Test (release):** Post-deploy smoke step (CI or manual script) that GETs https://api.ctrue.monishpatalay.dev/health and fails unless configured.auth===true and mode==='live'. Add a core/spawn test that the API exits non-zero with DATABASE_URL missing unless DEMO_MODE. Split the guard into 'auth required in non-demo' and 'owner key optional'.

### API-6

**The API's own 429 is rewritten as 'Your OpenAI account hit its rate limit or has no credit left'** · low · confirmed · `apps/api/src/index.ts:96`

- **Status:** Fixed (e31d91a)
- **What happens:** rate('answers:uid',12) at line 167 throws HttpError(429,'Too many requests; retry in one minute') inside the try. The catch at line 197 passes every error through providerError(). That function checks `'status' in e` and maps any status 429 to the OpenAI-quota message, and HttpError carries `status`. A user who sends more than 12 answers in a minute (chatty auto-answers, repeated Retry) is told to check their OpenAI billing instead of waiting a minute.
- **Verifier:** rate('answers:uid',12) at line 167 throws HttpError(429) inside the try. The catch calls providerError(caught), which matches any object with status 429 (HttpError has `status`) and returns 'Your OpenAI account hit its rate limit or has no credit left'. The user sees a billing message for the API's own limit. The global rate(user.id) in auth() goes through next() and is unaffected. Reachable at more than 12 answers a minute. Cosmetic.
- **Test (integration):** In scripts/smoke.mjs (demo mode takes the same catch path), send 13 /answers in a row and assert the 13th is 429 with a body matching /Too many requests/ and not /OpenAI/. Better, move providerError to core.ts and unit-test it: HttpError passes through unchanged, and an OpenAI APIError with status 429 maps to the quota message.

### API-9

**Import path is never run on a real PDF or DOCX; the strict ZIP validator is only tested on handcrafted single-entry archives** · low · plausible · `apps/api/test/core.test.ts:38`

- **Status:** Fixed (aa23087)
- **What happens:** docxSize rejects anything whose EOCD, central directory, local-header method or bit flags differ from its assumptions (core.ts:72-93). No test feeds it a genuine Word, Google Docs, Pages or LibreOffice export (data descriptors, extra fields, many entries, empty deflate entries). A producer quirk would make 'Import resume' fail with 'Invalid DOCX archive' for real users. The pdf-parse call (index.ts:147), the 'empty/scanned/too long' rule (line 151), the extension-vs-magic checks (lines 147-148) and multer's 8 MB limit are not exercised by any test. smoke.mjs and test-database.mjs never POST multipart.
- **Verifier:** This is a true test gap. core.test.ts:38-53 only uses a handcrafted single-entry archive, and smoke.mjs and test-database.mjs never POST multipart. Reading docxSize against typical Word, Google Docs and LibreOffice layouts (data descriptors, extra fields, central-directory sizes) does not show a concrete rejection. Only exotic cases such as a zero-length method-8 entry or trailing archive data would fail. So this is unproven risk to the resume-import feature, not a demonstrated bug. Low.
- **Test (integration):** Add apps/api/test/fixtures (word.docx, gdocs.docx, pages.docx, libreoffice.docx, text.pdf, scanned.pdf, and a .pdf-named zip). Unit-test docxSize on each. In scripts/smoke.mjs POST them as multipart and assert the extracted text, plus 400s for wrong extension, magic mismatch, empty PDF, more than 50k chars, and a 8,000,001-byte file. Check which status the oversize case returns; it is currently 400 'File exceeds upload limits'.

### API-10

**Handoff code is a bare bearer with no binding to the requesting desktop; ctrue:// deep link redeems silently (login CSRF)** · low · confirmed · `apps/api/src/index.ts:118`

- **Status:** Open
- **What happens:** An attacker signs in on the website with their own account, calls /auth/handoff and gets a 60 s single-use code. They host a page that navigates a victim to `ctrue://auth?code=<code>`. The desktop's open-url handler (main.ts:122 -> handleLink) calls /auth/redeem immediately, with no confirmation and no nonce tying the code to a desktop-initiated request. The victim's desktop is silently signed in as the attacker, replacing its stored credentials. The victim's later PUT /profile (resume facts) is written to the attacker's account, readable from the attacker's dashboard. The attacker can mint 6 codes a minute (the handoff rate limit).
- **Verifier:** main.ts:121-122 and 74-83: open-url calls handleLink -> parseHandoff -> immediate /auth/redeem -> storeTokens, replacing credentials with no confirmation or desktop-bound state. A code is a bare bearer for whichever account minted it, so login CSRF is real. The chain is long: the victim must accept the browser's ctrue:// protocol prompt, ignore the 'Signed in securely.' notice and the changed account, and then approve and save resume facts for the attacker to read. The OpenAI key is never stored server-side, so it does not leak. A `state` binding or a confirmation dialog is the right fix. Low.
- **Test (e2e-electron):** Manual or Electron test: open `ctrue://auth?code=<code from account B>` while signed in as account A and assert a 'Sign in as B?' confirmation, or that redeem fails without a desktop-generated `state`. API-level test in test-database.mjs once a state parameter exists: redeem with a wrong or missing state -> 401.

### API-11

**Refresh rotation: a lost response forces a browser re-login; expiry is sliding with no cap and no reuse detection** · low · plausible · `apps/api/src/index.ts:125`

- **Status:** Open
- **What happens:** The 'ponytail' ceiling is reachable in normal use. Access tokens live 10 minutes (001:21), so an active desktop refreshes about every 10 minutes. If the response to /auth/refresh is lost (laptop wake on flaky wifi; the desktop times out at 15 s, main.ts:88), the server has already replaced the hash. The retry with the old refresh token gets 401 'Login expired', and the user must redo the website handoff, possibly mid-interview. Separately, rotation sets refresh_expires=now()+30 days every time (001:86), so a stolen refresh token that keeps rotating never expires. Presenting the old token only signs out the legitimate user and does not revoke the attacker's pair. Revoking a banned or deleted Neon user means manual SQL.
- **Verifier:** This is the documented ponytail at index.ts:124. A refresh happens only reactively after a 401, roughly every 10 minutes of use. It needs the response lost after the server rotated (rotate is a single UPDATE, 001:86). That is a mid-flight network failure, which is possible on flaky Wi-Fi but not common, so the ponytail ceiling is not shown reachable in normal use. Sliding 30-day expiry with no cap or reuse detection is a design choice, not a defect. Low.
- **Test (integration):** In test-database.mjs: call /auth/refresh, discard the response, then refresh again with the same token. Assert the documented outcome (currently 401). If a one-time grace window is added, assert the previous token works exactly once within N seconds. Add an accounting.sql assertion for an absolute lifetime cap if one is added.

### API-12

**JOSE error classification: a malformed JWKS (HTTP 200, not a key set) is a 401, and the 503 path has no test** · low · confirmed · `apps/api/src/index.ts:60`

- **Status:** Fixed (c86a297)
- **What happens:** Only ERR_JOSE_GENERIC, JWKSTimeout and non-JOSE errors become 503. In jose 6.2.12 (jwks/remote.js, local.js), a 200 response whose body is not a valid key set (`{}`, a maintenance JSON) throws JWKSInvalid, which is a JOSEError with code ERR_JWKS_INVALID, so it is classified 401 'Sign in again'. During a Neon Auth incident, web users are told to sign in again in a loop instead of 'service unavailable'. The test double already returns `{}` for non-JWKS paths (test-database.mjs:33). There is also no stale-while-error: after cacheMaxAge (10 min) a JWKS outage fails all JWT verification. Existing tests cover only a valid JWT and a wrong audience. Expired, wrong-alg (HS256 or none), missing-sub, kid-rotation (30 s cooldown) and JWKS-down cases are not covered.
- **Verifier:** Verified in jose 6.2.12. local.js:30 throws JWKSInvalid, a JOSEError with code ERR_JWKS_INVALID, when a 200 response is not a key set. The index.ts:60 predicate excludes only JWKSTimeout and ERR_JOSE_GENERIC, so this becomes 401 'Sign in again'. HTTP non-200, non-JSON body and network errors do map to 503. remote.js:66 reloads after the 10-minute cacheMaxAge with no stale fallback. The mis-mapping needs a valid-JSON-but-wrong-shape 200 from Neon Auth, which is rare, and it affects browser JWTs only. The other cases are test gaps, as stated. Low.
- **Test (integration):** In test-database.mjs, start a fresh API process per case with the stub JWKS server returning 500, `{}`, or closed. Assert 503 for each with a valid JWT. Assert 401 for an expired JWT, an HS256 or alg:none token, a token without sub, and an unknown kid. Currently the `{}` case yields 401.

### API-15

**Model refusals are dropped, so the client sees a successful empty answer; upstream event handling is untested** · low · confirmed · `apps/api/src/index.ts:189`

- **Status:** Open
- **What happens:** The loop handles only response.output_text.delta, response.completed/incomplete/failed and error. With strict json_schema (walkthrough) or plain text, an OpenAI refusal arrives as response.refusal.delta/done followed by response.completed. `completed` becomes true, no token or step is sent, and the server emits `event: done`. The user gets a blank answer or empty walkthrough with no error, and nothing is logged. The incomplete paths (max_output_tokens text vs walkthrough, other reasons), the failed and error events, and EOF without completion (line 194) are also untested. The live script only reaches OpenAI with a fake key.
- **Verifier:** The loop at 189-193 handles only response.output_text.delta, completed, incomplete, failed and error. Responses API refusals stream as response.refusal.delta/done, then response.completed. So `completed=true`, nothing is sent, and the server emits `done`, giving the client a blank answer or empty walkthrough with no error. Refusals are rare for interview prompts, so impact is low. The other untested event paths are fair test-gap notes.
- **Test (integration):** Point OPENAI_BASE_URL at a fake SSE server in test-database.mjs and replay event sequences. Cover: refusal then completed -> expect an error event; incomplete(max_output_tokens) non-walk -> token then done; the same for walk -> error; incomplete(content_filter) -> error; response.failed -> error; EOF without completed -> error; a malformed step JSON -> 502 'malformed step' with earlier steps already delivered.

### API-16

**1 s lease polling writes to the DB on every call and, with pool=10 and cross-region RTT, caps concurrency near ~50 active users** · low · plausible · `database/migrations/002_unmetered.sql:17`

- **Status:** Open — measured by npm run test:load: p95 79 ms at 25 live users, 185 ms at 75, 2.1 s at 150
- **What happens:** Each live user generates a WS lease check (1/s), an answer lease check (1/s while answering) and a heartbeat (0.2/s). Each call is one RPC that always runs `update accounts set balance_seconds=balance_seconds-0` (002:17) and `update sessions set elapsed_seconds=...` (002:18) even when elapsed is 0, so that is about 4 row writes/s/user of dead-tuple and WAL churn on Neon. /answers also runs action('account') plus a select just to read facts (index.ts:179). All calls serialize on the account row lock. The pool has max 10 (line 24). Render is in Oregon while the Neon Auth host is us-east-2 (render.yaml:39), so if DATABASE_URL is in the same project each query adds roughly 60 ms or more of RTT. At roughly 100 ms per call, 10 connections give about 100 qps, i.e. roughly 40-50 concurrent users before queueing, which then trips API-4.
- **Verifier:** 002:14-19 runs two UPDATEs (accounts, sessions) on every call when an active session exists, even with elapsed=0 and charge=0, plus the FOR UPDATE locks. Each live user generates a WS poll at 1/s, a heartbeat at 0.2/s, and an answers poll at 1/s while answering. Pool max is 10. But the ~50-user ceiling rests on an assumed ~100 ms per call, and DATABASE_URL's region is not in the repo. Each call is a single round trip. It is a scale concern that has not been reached, not a current failure. Low.
- **Test (performance):** Load script on the disposable cluster with injected 60 ms latency: N simulated users each polling `session_action(...,'get')` at 1-2 Hz plus 0.2 Hz heartbeats. Record p95 latency, pool.waitingCount and the pg_stat_user_tables n_tup_upd delta. Ramp N to 20/50/100 and assert p95 < 300 ms at the target N. Re-run after skipping zero-charge updates and sharing one poller per user.

### API-19

**sql() reports DB data errors as an outage (503) and maps RAISE messages by substring** · low · confirmed · `apps/api/src/index.ts:37`

- **Status:** Open
- **What happens:** Anything that is not SQLSTATE P0001 returns 503 'Database unavailable' and is logged as an outage. PUT /profile {facts:'a\u0000b'} is valid JSON, but Postgres rejects NUL in text (22021). The user sees 'Database unavailable' on save. PDF-extracted text can plausibly contain NUL, so import then approve-and-save fails. An FK violation in desktop_token_issue (23503) is reported the same way. Within P0001 the mapping uses message.includes('Credits'|'not found'|'Another'), so any new RAISE wording silently becomes 400.
- **Verifier:** sql() (index.ts:36-37) maps every non-P0001 error to 503 'Database unavailable', logged as an outage. PUT /profile accepts any string up to 50k chars. Postgres rejects NUL in text (22021), so the save returns 503. PDF-extracted text can contain NUL. The substring mapping on message.includes('Credits'|'not found'|'Another') works today but is brittle. Minor.
- **Test (integration):** In test-database.mjs, PUT /profile with a NUL character and assert 400 (strip or reject in the API). Add a table test of each RAISE message in 001/002 to its HTTP status: 'Credits exhausted' -> 402, 'Session not found' -> 404, 'Another session is active' -> 409, 'Invalid action' -> 400. Run it with METERING=true as well.

### API-20

**docs/API.md contradicts the code in several places** · low · confirmed · `docs/API.md:19`

- **Status:** Fixed (622c602)
- **What happens:** (1) Line 19 says 'Credit grants are atomic and idempotent by invoice ID' and 'positive balance' is required for billable paths, but grant_invoice and credit_grants were dropped in 003 and METERING=false skips the balance check. (2) POST /answers (line 14) lists modes without 'walkthrough', omits topic, language and the SSE `step` event, and omits the X-OpenAI-Key header. Without that header any non-owner gets 402. (3) The WS `start` (line 15) omits `openaiKey`, required for non-owners (index.ts:220), and the audio limits (<=48000 bytes per message, real-time budget). (4) GET /account omits `metered` (index.ts:137). (5) Nothing documents the 402 'key rejected' semantics, the 5 MB JSON cap against 'up to four images', or that errors after headers flush arrive as 200 + `event: error`.
- **Verifier:** docs/API.md matches every claimed drift. Line 19 still says credit grants are idempotent by invoice ID (grant_invoice dropped in 003). Line 14 lists modes without walkthrough and omits topic, language, the `step` event and X-OpenAI-Key. Line 15 omits `openaiKey`. Line 8 omits `metered`. Documentation only.
- **Test (unit):** scripts/docs.test.mjs: regex the `app.(get|post|put|delete)('...')` routes and WS message types out of apps/api/src/index.ts and assert each appears in docs/API.md. Assert the doc does not contain 'invoice' or 'Credit grants'. Assert `X-OpenAI-Key`, `walkthrough` and `openaiKey` are documented.

### API-21

**Config files drift from what the code reads** · low · confirmed · `render.yaml:36`

- **Status:** Open
- **What happens:** WEB_URL is set in render.yaml and .env.example but never read by any source file (grep). apps/api/.env.example defaults METERING=true while production is false, so a contributor runs the credit-metered path locally that production never executes and that CI exercises only in SQL. ALLOWED_ORIGINS is exact-string matched (index.ts:41), so a trailing slash, a `www.` host or a Vercel preview URL silently gets 403 'Origin denied' with no startup warning.
- **Verifier:** WEB_URL appears only in render.yaml:36 and .env.example:6, and no source reads it. .env.example:22 defaults METERING=true while production is false. ALLOWED_ORIGINS is exact-matched through a Set (41, 44) with no startup validation. Config hygiene only.
- **Test (unit):** Unit test that every key in .env.example and render.yaml envVars appears as `env.KEY` in apps/api/src/index.ts (flags WEB_URL), and that ALLOWED_ORIGINS entries parse via `new URL(x).origin === x`. Decide whether .env.example should default METERING=false.

### API-22

**Status-code and JSON contract gaps, and unexpected 500s are not logged** · low · confirmed · `apps/api/src/index.ts:200`

- **Status:** Open
- **What happens:** (a) A missing or malformed Authorization header returns 400 'Invalid access token' (string() at line 78), not 401, so clients keyed on 401 (App.tsx:122 refresh) do not recover. (b) Unknown routes for authenticated callers get Express's HTML 404, not {error}. (c) `images` given as a non-array string is silently ignored (line 172). (d) A multer MulterError of any kind, including a wrong field name or extra field, returns 'File exceeds upload limits'. (e) The 5 MB express.json cap (line 115) makes 'up to four images' (4 MB each in imageData) unreachable beyond about 5 MB total. (f) The final error handler maps unknown errors to 500 'Request failed' without logging anything, so Render logs show nothing for a TypeError.
- **Verifier:** Each sub-claim holds. (a) string(undefined,'access token') gives 400. (b) No 404 handler after `app.use(auth)`, so Express 5's HTML 404 is used. (c) A non-array `images` is ignored (172). (d) Any MulterError returns 'File exceeds upload limits' (200). (e) express.json's 5 MB cap is below four 4 MB images (115). (f) The final handler at 200 maps unknown errors to 500 without console.error, so a TypeError leaves no log. The missing logging is the most useful to fix. Low.
- **Test (integration):** Table-driven contract test in scripts/smoke.mjs: for each route send no/garbled auth, malformed JSON, an array body, a 5 MB + 1 body, `images:'x'`, a wrong multipart field name, and an unknown path. Assert status plus a JSON {error} body, and that the 500 path writes one console.error line.

### API-23

**Wrong user-facing text on lease loss and in free mode** · low · confirmed · `apps/api/src/index.ts:196`

- **Status:** Open
- **What happens:** (a) The 'Answer stopped; check session status' message (line 196) is effectively dead in live mode. When the lease poller aborts, the openai SDK's Stream swallows the abort and ends the iteration without throwing (node_modules/openai/core/streaming.js:74-75), `completed` is false, and line 194 sends 'The AI stream ended before the answer finished. Try again.' instead. That tells the user to retry a paused session. (b) With METERING=false the user still sees 'Start or resume a session with available credits' (line 86) and the desktop's 'Session stopped. Check your remaining credits.' (App.tsx:198).
- **Verifier:** (a) openai/core/streaming.js:74-75 swallows abort errors inside the iterator, so for-await ends silently with completed=false. Line 194 then reports 'The AI stream ended before the answer finished. Try again.' and the 'Answer stopped; check session status' message at 196 is effectively unreachable for live mid-stream aborts. (b) Line 86 and App.tsx:198 still say 'credits' in free mode. Copy only.
- **Test (integration):** With the fake upstream from API-15, stream tokens slowly, pause the session over HTTP mid-stream, and assert the last SSE event is an `error` with the session-stopped message. Add an assertion that no credit wording appears when METERING=false.

### API-24

**Shutdown drains for 2 s while Render allows 30 s; deploys drop live audio and in-memory sign-in codes** · low · confirmed · `apps/api/src/index.ts:242`

- **Status:** Open
- **What happens:** On SIGTERM, all WS clients are closed with 1001 and setTimeout(...,2000) force-exits, cutting in-flight SSE answers (the desktop shows 'Answer stream disconnected before completion'). There is no auto-reconnect for transcription ('Resume capture to reconnect'). autoDeploy on every apps/api change (render.yaml:13-19) therefore interrupts any live interview. Handoff codes live in memory (Handoffs), so a code issued in the last 60 s is lost on deploy, or when it is redeemed on the new instance during overlap, giving 'Sign-in code expired or already used'.
- **Verifier:** index.ts:242 closes WS clients with 1001 and force-exits after 2 s, cutting in-flight SSE answers. Handoff codes are in memory, and render.yaml autoDeploy rebuilds on any apps/api change. These are the stated consequences. It is mostly an inherent trade-off for live sockets, and a deploy is under the maintainer's control. Low.
- **Test (integration):** Spawn the API, start a slow fake-upstream SSE answer and a WS, send SIGTERM, and assert the WS gets close code 1001 and the SSE ends with an explicit retryable error event within the drain window, then the process exits. Release checklist item: do not deploy while sessions are live.

### API-25

**Server logs can contain fragments of users' OpenAI keys and org IDs** · low · confirmed · `apps/api/src/index.ts:197`

- **Status:** Open
- **What happens:** Non-HttpError provider failures are logged with `console.error('Answer failed:', caught.message)`. OpenAI 401 messages contain the masked key including its last four characters ('Incorrect API key provided: sk-proj-****abcd'), and 429 messages contain the organization ID. Because providerError() converts the error to an HttpError only after the instanceof check, the original message is what gets logged. This contradicts the product's 'never stored' key promise for Render's retained logs.
- **Verifier:** index.ts:197 logs `caught.message` before providerError converts it. OpenAI SDK 401 messages embed the masked key (prefix plus last 4 characters), and 429 messages include the org ID. The 401 case is by definition an invalid key, and the data is already masked by OpenAI, so real exposure is minimal. It is still avoidable by logging status and type only. Low.
- **Test (security):** Fake upstream returns 401 with a masked-key body and 429 with an org-id body. Capture the API's stderr and assert it contains no `sk-` substring and no `org-` id; log only status and error type.

### API-26

**CORS and WS origin rules have no automated check** · low · confirmed · `apps/api/src/index.ts:44`

- **Status:** Fixed (9529464)
- **What happens:** originAllowed accepts a missing Origin, the literal 'null', 'file://' and the configured list. Nothing tests: allowed origin gets Access-Control-Allow-Origin; a disallowed origin gets 403 and no ACAO; a preflight with Authorization and X-OpenAI-Key succeeds; the packaged app's real Origin 'null' (fetch) and 'file://' (WS) work. WS Origin denial (line 205, close 1008) is also untested. Origin 'null' is also what sandboxed iframes and data: pages send. It is acceptable only because all protected routes need a bearer token, and that assumption is unasserted. A regression in cors config would break either the website or every desktop request, and neither would be caught before release.
- **Verifier:** smoke.mjs and test-database.mjs have no Origin/CORS/preflight assertions and no WS-origin test (205). originAllowed at 44 accepts a missing Origin, 'null' and 'file://' by design, relying on bearer auth. That assumption is untested. Test gap only.
- **Test (integration):** Add to scripts/smoke.mjs: OPTIONS and GET with Origin in {allowed, https://evil.example, null} and assert status and headers. Open a WS with Origin https://evil.example and assert close code 1008. Assert protected routes still return 401/400 for Origin null without a token.

### API-27

**TRUST_PROXY=1 correctness behind Render's edge is unverified; per-IP limits can collapse into shared buckets** · low · plausible · `apps/api/src/index.ts:110`

- **Status:** Open
- **What happens:** redeem (15/min), refresh (30/min) and logout (30/min) are keyed on req.ip. If Render's path has more than one trusted hop (edge plus load balancer), `trust proxy 1` makes req.ip a shared proxy address, so unrelated users share one bucket. A launch-day burst of new desktops then gets 429 'Too many requests'. If the setting were too large, X-Forwarded-For spoofing would bypass the limits. The rate() cleanup also scans the whole map on every call once it exceeds 10k keys (line 72), which is cheap but unbounded with IPv6 churn. No local test can show which applies in production.
- **Verifier:** redeem, refresh and logout limits key on req.ip with `trust proxy` = 1 (110-112, 119, 126, 132). Whether Render's chain (edge plus load balancer) makes the first untrusted hop a shared address cannot be determined from the repo. The finding admits it needs a production check. If true, it affects only unauthenticated auth endpoints, as 429s during bursts. The 10k-key scan is cheap. Low.
- **Test (release):** Release check against production from two different networks: hit /auth/refresh (junk token) 31 times from network A and confirm network B still gets 401 rather than 429. Add a unit test with TRUST_PROXY=1 that the key is the right-most X-Forwarded-For entry and a spoofed left-most entry does not reset the bucket.

### API-28

**DB test harness depends on the public OpenAI API, a hard-coded migration list and fixed ports** · low · confirmed · `scripts/test-database.mjs:88`

- **Status:** Fixed (e31d91a)
- **What happens:** (a) The `rejected` case sends a fake sk- key to the real api.openai.com and asserts OpenAI's 401 maps to a message. The CI check goes red during an OpenAI outage or on a no-network machine, with SDK retries inside the 20 s timeout. (b) Lines 101-104 list migrations 001-003 explicitly, so a new 004_*.sql is silently never applied or tested. (c) Ports 55432 and 55433 are fixed (collision between concurrent runs), and the finally block's `pg_ctl stop` can throw and mask the original assertion failure. (d) The harness runs `tsx` on src, so the `dist/index.js` that Render actually runs (tsc output, ESM specifiers) is never booted by any check.
- **Verifier:** test-database.mjs:88 sends a fake key to the real api.openai.com, so offline or an OpenAI outage fails the check. Lines 101-104 hard-code migrations 001-003. Ports 55432/55433 are fixed. `finally` runs pg_ctl stop through run(), which throws and can mask the original failure. check.yml builds but never boots dist/index.js. Test hygiene only.
- **Test (integration):** Replace the real-OpenAI case with the fake upstream via OPENAI_BASE_URL. Read database/migrations/*.sql in sorted order via readdirSync. Pick free ports dynamically. Add a CI step `npm run build -w @ctrue/api && DEMO_MODE=true node apps/api/dist/index.js` followed by a /health probe.

### API-29

**No schema-version guard: code deployed before a manual migration turns every request into a generic 503** · low · plausible · `apps/api/src/index.ts:83`

- **Status:** Open
- **What happens:** Migrations are applied by hand (`psql -f`), while Render auto-deploys on push and its buildFilter ignores database/** (render.yaml:14-19). If the API that calls the 5-argument session_action ships before 002 is applied, Postgres returns 42883 (function does not exist), which sql() maps to 503 'Database unavailable', and /health is still 200. Sessions rows are also never cleaned up: each start after a paused or expired session adds a row.
- **Verifier:** sql() maps 42883 to 503, and there is no schema-version probe. The specific 002 scenario cannot recur, since production already works with the 5-argument function. The risk applies to future manual migrations: render.yaml's buildFilter ignores database/**. The unbounded sessions-row growth is true but trivial. Process hardening only.
- **Test (integration):** In test-database.mjs, apply only 001 and boot the API. Expect startup failure, or /health.configured.schema=false, instead of a silently running service. Add a startup `to_regprocedure('public.session_action(text,uuid,text,bigint,boolean)')` check.

### API-30

**Money and token RPCs claim row-lock safety but are only tested sequentially on one connection** · low · confirmed · `database/tests/accounting.sql:1`

- **Status:** Fixed (9529464)
- **What happens:** Comments in 001/002 assert correctness under concurrency: 'Reconcile ... under the same account lock', 'a concurrent caller waits on the row'. accounting.sql runs every call in one session, so a lock-order or isolation regression would pass. Untested: two simultaneous `start`s for one user create exactly one active session; two simultaneous rotate calls on the same refresh token succeed exactly once (a security property, since a second success would mean two valid token pairs); a concurrent heartbeat and pause; `get` must not extend lease_until (otherwise the 1 s pollers keep a dead session alive forever); 'Invalid trial' bounds; the HTTP mapping of 'Credits exhausted' to 402 with METERING=true. `stamp` is taken at function entry (002:6), before the row lock wait.
- **Verifier:** accounting.sql runs every call sequentially in one DO block, so there is no concurrency test. The design appears sound on reading: account `FOR UPDATE` serializes callers, the one_active_session partial unique index is a backstop, and desktop_token_rotate is a single UPDATE. `stamp` is indeed taken at function entry (002:6) but is harmless because charges are clamped with greatest(0,...). So this is a valid coverage gap rather than a bug. Prod runs METERING=false, so no money path is live. Low.
- **Test (integration):** Add database/tests/concurrency.mjs, run from test-database.mjs, using pg with 20 parallel connections: Promise.all of 20 session_action(uid,null,'start') -> 1 distinct active id; 10 parallel desktop_token_rotate with the same refresh hash -> exactly one true; a heartbeat/pause race leaves a consistent state; a 'get' called 100 times does not move lease_until.

### CONTRACT-1

**No test ties the API handoff code format to the desktop link validator** · low · plausible · `apps/desktop/electron/security.ts:7`

- **Status:** Open
- **What happens:** The API issues a code of 64 hex characters (Handoffs.issue, core.ts:29) and redeem insists on /^[a-f0-9]{64}$/. The desktop accepts only host 'auth', a single `code` parameter and /^[a-zA-Z0-9_-]{43,128}$/. The website builds ctrue://auth?code=<encodeURIComponent(code)> (dashboard line 28). They agree today, but each side is tested only against its own fixtures. Changing the code encoding, adding a `state` parameter on the web, or tightening either regex would break 'Connect desktop' for everyone with no failing test, and the real click-through is listed as pending in VERIFICATION.md.
- **Verifier:** The two sides are tested only against their own fixtures. core.test.ts in apps/api asserts the code matches /^[a-f0-9]{64}$/, and the desktop test parses 'a'.repeat(43). The shapes are compatible today: 64 hex characters sit inside the desktop's /^[a-zA-Z0-9_-]{43,128}$/ and the dashboard builds ctrue://auth?code=encodeURIComponent(code). A break would need a deliberate change to one regex or to the code format. The handoff works in production. The missing cross-package test is a small hardening gap.
- **Test (unit):** In apps/desktop/tests/core.test.ts import Handoffs from '../../api/src/core.ts' and assert parseHandoff(`ctrue://auth?code=${encodeURIComponent(new Handoffs().issue({id:'u'}).code)}`) returns that code. Add the exact string produced by the dashboard as a fixture.

### DEP-1

**Render runs NODE_ENV=development, so the production start gate is bypassed and /health returns 200 even when unconfigured** · low · plausible · `render.yaml:28`

- **Status:** Open
- **What happens:** The API's 'Production requires Neon and OpenAI credentials' throw (apps/api/src/index.ts:23) only fires when NODE_ENV=production, and render.yaml sets development on purpose. A deploy with DATABASE_URL or NEON_AUTH_BASE_URL missing or mistyped still boots. /health (line 114) returns 200 with configured.auth=false, so healthCheckPath passes and Render swaps the broken instance in. Every authenticated call then returns 503 and the site looks down, while the previous good deploy has been retired. The comment says 'production refuses to start without the Neon and OpenAI settings', but OPENAI_API_KEY is optional in BYO mode. The development value is also load-bearing for the build: `npm ci --workspace=@ctrue/api` needs devDependencies for tsc, so flipping to production breaks the build.
- **Verifier:** The mechanism checks out. render.yaml:29 sets NODE_ENV=development, so the production throw at index.ts:23 never fires. /health (114) always returns 200 with configured flags, and healthCheckPath is /health. A deploy missing DATABASE_URL or NEON_AUTH_BASE_URL would therefore pass the health check and replace the working instance. The trigger needs an operator mistake. sync:false secrets persist across deploys and the Blueprint form prompts for them. A mistyped but non-empty value would also pass the production gate, since it only tests that the values are set. The NODE_ENV=development value is load-bearing: npm ci omits devDependencies under production, so tsc would be missing. Low likelihood and recoverable by rollback.
- **Test (integration):** Smoke variant in scripts/smoke.mjs: boot the API with NODE_ENV=development, no DATABASE_URL and DEMO_MODE=false. Assert that /health is not 200 (or add a REQUIRE_AUTH=true flag that makes startup throw), then run the same check as the Render post-deploy step. Add a CI step that runs the render.yaml buildCommand with NODE_ENV=production to prove the build works either way.

### DEP-2

**render.yaml drift: dead WEB_URL, lockfile-triggered restarts, unverified TRUST_PROXY hop count** · low · confirmed · `render.yaml:36`

- **Status:** Open
- **What happens:** WEB_URL is not read anywhere in apps/api/src (dead config copied into .env.example). buildFilter includes package-lock.json (line 18), so a website-only dependency bump redeploys the API, which closes live SSE and WebSocket sessions and wipes the in-memory handoff codes, rate limits and answering sets (a code issued just before a deploy returns 401 'expired'). TRUST_PROXY=1 (line 33) assumes a single hop. If Render's edge adds a second proxy, req.ip is a shared edge address and the per-address limits on /auth/redeem (15/min), /auth/refresh and /auth/logout (30/min) throttle unrelated users together. Nothing verifies this.
- **Verifier:** WEB_URL appears only in render.yaml:36 and apps/api/.env.example and is not read anywhere in apps/api/src, so it is dead config. buildFilter lists package-lock.json (render.yaml:19), so a web-only dependency bump redeploys the API, drops live SSE and WebSocket connections and clears the in-memory handoff codes, rate limits and answering set. This is a deliberate tradeoff, since npm ci needs the lockfile. The TRUST_PROXY=1 hop count is unverified and is only an assumption, not a demonstrated defect. Impact is cosmetic or a brief interruption.
- **Test (release):** Post-deploy probe: call POST /auth/refresh with a bogus token from two different networks and compare which `rate:` bucket they hit (log req.ip and X-Forwarded-For once at /health in a staging deploy). Drop WEB_URL from render.yaml and .env.example, or add a config-drift test that every key in render.yaml envVars is referenced in apps/api/src.

### DEP-3

**CORS and WebSocket origin policy is untested and unforgiving (exact-match, no normalisation, previews and www blocked)** · low · plausible · `apps/api/src/index.ts:41`

- **Status:** Fixed (9529464)
- **What happens:** ALLOWED_ORIGINS is split on commas and compared with exact strings (lines 41-44). A trailing slash ('https://ctrue.monishpatalay.dev/'), a www host, or a Vercel *.vercel.app preview or alias is silently rejected with 403 'Origin denied'. Every dashboard call, including the /health banner, then fails with 'Cannot reach Ctrue service. Failed to fetch'. Origin 'null' and 'file://' are accepted for the packaged desktop, but no test covers any of it. scripts/smoke.mjs and test-database.mjs send no Origin header (Node's fetch and WebSocket omit it), so a regression in originAllowed or cors would ship green.
- **Verifier:** The test gap is real. No script or API test sends an Origin header (a grep of scripts/ and apps/api/test finds none), so originAllowed and the cors callback (index.ts:41-44, 113, 205) have zero coverage. These paths matter: a regression would break the packaged desktop's Origin 'null' and 'file://' handling. The exact-match behaviour is deliberate allowlisting, and the production value in render.yaml (https://ctrue.monishpatalay.dev, no trailing slash) matches the one site users use. The www, preview and trailing-slash failures need a config change or an unused hostname. This is a coverage hole, not a live bug.
- **Test (integration):** Extend scripts/smoke.mjs with ALLOWED_ORIGINS=https://site.example. Check an OPTIONS /sessions preflight with Origin https://site.example and Access-Control-Request-Headers: authorization,content-type,x-openai-key returns 204 with a matching ACAO, and Origin https://evil.example returns 403. Check Origin null and file:// are accepted. Check a WebSocket opened with headers {Origin:'https://evil.example'} closes with 1008, and that the trailing-slash variant is rejected or normalised (decide and pin it).

### DEP-PIN

**next, react, react-dom, typescript and @types/* are 'latest' on top of a beta Neon Auth SDK that the code works around** · low · plausible · `apps/web/package.json:14`

- **Status:** Open
- **What happens:** package.json says latest for seven packages (the lock currently pins next 16.4.0, react 19.3.0 and TS 5.9.3). Any `npm update`, lock regeneration or fresh install of a new dependency can jump a major. apps/web/AGENTS.md already warns this is not the Next.js the team knows. lib/client.ts:11-13 hard-codes a workaround for @neondatabase/auth 0.6.0-beta's broken authClient.token(), and the whole sign-in path (route.ts, proxy.ts) depends on its undocumented behaviour. No test touches that path, so an SDK or Next bump breaks sign-in and CI stays green. The root `engines` says node >=22.19 while README and CI only exercise 24.
- **Verifier:** apps/web/package.json does use 'latest' for next, react, react-dom, typescript and the three @types packages, which is seven entries. client.ts:11-13 does carry a deliberate ponytail workaround for the beta SDK's token(). package-lock.json pins next 16.4.0, react 19.3.0 and typescript 5.9.3, so builds that honour the lockfile are stable. Drift needs an npm update or a lock regeneration. No CI canary covers the sign-in path. It is a hygiene risk, not a current defect.
- **Test (e2e-browser):** Pin exact versions (or ^ ranges) in apps/web/package.json. Add a CI canary that boots `next start` with a stub Neon Auth server (like the JWKS stub in scripts/test-database.mjs) and drives /login to Google redirect, /dashboard guard, and /api/auth/token shape, so SDK or Next upgrades are caught.

### DOC-1

**docs/API.md no longer matches the API (walkthrough mode, key header, metering, credits)** · low · confirmed · `docs/API.md:14`

- **Status:** Fixed (622c602)
- **What happens:** Line 14 lists four modes, but the code also accepts 'walkthrough' with topic and language (index.ts:168-170) and emits `step` events, none of which are documented. The X-OpenAI-Key header on /answers and the openaiKey field on the WS start message (index.ts:177, 220), without which non-owners get 402, are missing at lines 14-15. /account omits `metered` (index.ts:137). Line 19 says 'All billable AI paths require ... positive balance. Credit grants are atomic and idempotent by invoice ID', but grant_invoice and credit_grants were dropped in migration 003, and with METERING=false no positive balance is required. Rate limits (120/min per user, 12/min for answers, 6/min for handoff) are undocumented even though the dashboard heartbeat shares the 120/min bucket.
- **Verifier:** Every claim checks against the source. docs/API.md:14 lists four modes, but index.ts:168 also accepts 'walkthrough' with topic and language. Neither X-OpenAI-Key nor the WS openaiKey field is documented. /account omits metered (index.ts:137). Line 19 still promises idempotent credit grants by invoice ID, but migration 003 dropped grant_invoice and credit_grants, and with METERING=false no positive balance is required. Rate limits are undocumented. Documentation drift only.
- **Test (integration):** Add scripts/docs-contract.test.mjs that parses the bullet list in docs/API.md and asserts every documented route exists in apps/api/src/index.ts and that each accepted `mode` string in the code appears in the doc. Cheaper: a review checklist item in the release process.

### DOC-2

**Stale or contradicting claims in README, VERIFICATION.md, NEON-MIGRATION.md and the landing page** · low · confirmed · `docs/VERIFICATION.md:15`

- **Status:** Open
- **What happens:** VERIFICATION.md says '15 automated tests: seven API, six desktop, one website SSE parser, one launcher' and lists a pending 'Supabase login' item after the Neon move; the suite is far larger now. NEON-MIGRATION.md describes email/password login and obtaining the JWT with authClient.token(), but the app is Google-only and client.ts:11-13 deliberately avoids that call. README line 3 calls Ctrue 'a macOS assistant' and the downloads page says Windows is coming soon, yet app/page.tsx line 3 says 'Built for macOS & Windows' and no Windows installer has ever been produced. The README says 'copy each app's .env.example', but apps/desktop/.env.example sets VITE_DEMO_MODE=true (a demo button in a real build). README says Node 24 is required while the engines field allows >=22.19.
- **Verifier:** VERIFICATION.md:7,15 cite '15 automated tests' and line 25 still lists a pending 'Supabase login'. NEON-MIGRATION.md:3 describes email/password login, while the UI is Google-only. app/page.tsx:3 says 'Built for macOS & Windows', but the downloads page says Windows is 'Coming soon' and README.md:3 says macOS. apps/desktop/.env.example sets VITE_DEMO_MODE=true, and the README tells users to copy it. root package.json engines is >=22.19 against README's 'Node 24'. All trivially stale. The mismatches are minor.
- **Test (manual-device):** Release checklist item reviewed per tag: README and landing claims vs the shipped assets (platform list, update behaviour). Optional lint in scripts/docs-contract.test.mjs: fail if any docs mention 'Supabase' outside the history section, or if the landing copy contains 'Windows' while NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL is empty.

### ELEC-3

**`quitting=true` is set before quitAndInstall and never reset when the install fails** · low · plausible · `apps/desktop/electron/main.ts:241`

- **Status:** Open
- **What happens:** The user clicks 'Restart to update'. quitting becomes true, then Squirrel.Mac rejects the bundle (signature or DR mismatch, a translocated or DMG-mounted read-only copy, or the update not staged). electron-updater emits 'error', which sends update-fallback (L255), but the app does not quit and `quitting` stays true. The next click on the red close button now destroys the main window instead of hiding it. After that, restore() (L45), emit() (L44), the tray 'Show Ctrue', the Dock activate handler, and every global shortcut handler throw 'Object has been destroyed'. The app cannot be brought back without a manual quit.
- **Verifier:** The mechanism is real. install-update sets `quitting=true` (main.ts:241) and nothing resets it. The error handler (L255) only emits update-fallback, and window.on('close') then stops preventing close. After a destroyed window, restore() and emit() throw. A reachable path exists in MacUpdater.js: 'update-downloaded' is dispatched before Squirrel stages the bundle (L219-223). If the user clicks Restart in that window, quitAndInstall only registers a listener (L247). A later Squirrel error then does not quit the app. The trigger needs a failing Squirrel install (identity mismatch or translocated/read-only copy) plus a click within seconds of the banner. Signature failures usually surface before the click. The impact is a broken window state, not data loss, so the likelihood is low.
- **Test (e2e-electron):** In an e2e-electron harness (Playwright _electron against a packaged build with CTRUE_UPDATE_FEED_URL=http://127.0.0.1:<port> and a deliberately mis-signed zip), click install, wait for the updater error, then close the window. Assert the window is still alive and restorable. Unit level: reset quitting=false in the autoUpdater 'error' handler and test it with a fake updater.

### ELEC-4

**Later failing update check hides 'Restart to update' for an already-downloaded update, and the fallback flag is sticky** · low · confirmed · `apps/desktop/electron/main.ts:255`

- **Status:** Fixed (8e96f4c)
- **What happens:** Update 0.1.10 downloads and the renderer shows 'Restart to update'. Hours later the 6-hourly checkForUpdates (L259) fails because the laptop is offline or GitHub returned a 5xx. electron-updater emits 'error', the handler sends update-fallback, and App.tsx:158 runs setUpdateReady(false); setUpdateFallback(true). The banner flips to 'Download it, then drag it into Applications' and the restart button disappears, though the update is staged. updateFallback is never reset, so a later successful check still shows the manual-download text.
- **Verifier:** AppUpdater.js:269-272 emits 'error' whenever checkForUpdates fails (offline, 5xx). main.ts:255 turns every 'error' into update-fallback, and App.tsx:158 sets updateReady=false and updateFallback=true. updateFallback is never reset. The 6-hourly check (L259) can fire offline, for example on wake before Wi-Fi is back. So 'Restart to update' (banner and Preferences button) disappears and the text becomes 'Download it, then drag it into Applications', even though the update is staged. Offline-at-launch also pre-sets the sticky flag. Impact is UX only. autoInstallOnAppQuit defaults to true, so the staged update still installs on quit. Low rather than medium.
- **Test (unit):** Extract the update-event handling into a pure reducer over {newVersion, ready, fallback}. Unit-test the sequence update-ready followed by error: ready must stay true, and fallback may only be set for failures during download or install. Add a mock-feed e2e (127.0.0.1 http feed, which the gating regex allows) that serves one good check, then a 500.

### ELEC-5

**Pop-up window can invoke every privileged IPC channel (plaintext OpenAI key, credentials, signout, protect(false), quit)** · low · confirmed · `apps/desktop/electron/main.ts:53`

- **Status:** Open
- **What happens:** assertSender accepts either window.webContents or popup.webContents for all channels. A renderer compromise in the pop-up gets `ctrue:openai-key` (decrypts and returns the saved sk- key), `ctrue:credentials` and `ctrue:refresh` (access token and rotation), `ctrue:signout`, `ctrue:set-openai-key`, `ctrue:shortcuts`, `ctrue:protect(false)` (drops capture exclusion on both windows), `ctrue:relaunch`, `ctrue:quit`, and `ctrue:popup-state` to itself. The pop-up needs only config, popup-ask, popup-hide, popup-mic-off and popup-step. Exposure today is limited: Markdown.tsx builds React elements only and the packaged CSP is script-src 'self'. This is defence in depth, but the pop-up renders model output derived from screen and audio content.
- **Verifier:** assertSender (L55) accepts either window.webContents or popup.webContents for every ipc() channel. The pop-up shares the same `webPreferences.preload`, so it can call openaiKey, credentials, refresh, signout, protect, relaunch and quit. Popup.tsx only uses config, popupAsk, popupHide, popupMicOff and popupStep. This is a least-privilege gap, but exploiting it needs a separate renderer compromise. Markdown.tsx and Popup.tsx contain no innerHTML, dangerouslySetInnerHTML or href sinks, and model output is rendered as React elements. The finding itself calls it defence in depth, so medium is overstated.
- **Test (security):** Replace the single check with a per-channel allowlist, e.g. `const popupChannels = new Set([...])`. Test it in an e2e-electron spec that evaluates `window.ctrue.openaiKey()`, `signout()` and `protect(false)` inside the #popup page and expects rejection. Also assert the main window cannot call the popup-only channels.

### ELEC-6

**captureGrant is one boolean plus an uncleared timer, so concurrent or back-to-back captures lose the grant** · low · plausible · `apps/desktop/electron/main.ts:153`

- **Status:** Open
- **What happens:** Shortcuts 'collect' then 'screenshot' (or 'capture' then 'screenshot') fire within the ~150 ms that select-source takes. Both IPC calls set captureGrant=true. The first getDisplayMedia consumes it (L155), the second hits `!captureGrant` and gets callback({}), which surfaces as a red 'NotSupportedError: Not supported' banner and a missed screenshot. Separately, the setTimeout at L196 is never cleared. A grant issued 9.9 s after an earlier select-source is cancelled by the earlier timer 0.1 s later, before the renderer's getDisplayMedia runs. chooseSource in App.tsx has no mutex for screenshots.
- **Verifier:** captureGrant is a single boolean and the 10 s timer is never cleared (L195-196), and chooseSource/capture has no mutex for screenshots (App.tsx:244-299). The failure window is much smaller than described. A flow loses only if a second select-source sets the grant between the first select-source resolving and its getDisplayMedia request being handled, a few ms. The ~150 ms getSources time does not matter, because the grant is set synchronously at the end. The stale-timer variant needs a grant issued within a few ms of the old timer firing. A realistic trigger is pressing screenshot while audio capture is still connecting (ensureSession latency). The failure is a transient 'NotSupportedError' that a retry fixes.
- **Test (e2e-electron):** e2e-electron spec that calls `ctrue.selectSource(id)` plus `navigator.mediaDevices.getDisplayMedia` twice concurrently and expects both streams. Unit-testable after extraction: replace the boolean with a per-request token or counter, clear the timer, and assert that two grants yield two streams while an unused grant expires after 10 s.

### ELEC-8

**Default global shortcuts steal system-wide keys and stay armed while the window is 'closed'; Shift-only or Alt-only combos are accepted** · low · confirmed · `apps/desktop/electron/security.ts:21`

- **Status:** Fixed (5895240)
- **What happens:** Defaults (L1) register Cmd+H (macOS Hide), Cmd+L, Cmd+J and Cmd+Enter globally. Pressing Cmd+Enter in Slack, Gmail or a code runner now triggers Ctrue and the focused app never sees it, and Cmd+H no longer hides apps. Closing the window only hides it (main.ts:142), so the process, the tray and these hijacks persist. The validator and acceleratorFrom (src/api.ts:85-88) accept a single non-Cmd modifier, so a user recording Shift+K makes every capital K typed anywhere trigger Ctrue. On macOS, Ctrl+K is also recorded as CommandOrControl+K, which registers Cmd+K.
- **Verifier:** The facts hold. Defaults (security.ts:1) register Cmd+H, Cmd+L, Cmd+J, Cmd+Enter and Cmd+Shift+J globally via globalShortcut, and they stay armed while the window is hidden because close only hides it (L142). The validator regex (security.ts:21) accepts a single Alt or Shift modifier. acceleratorFrom (api.ts:87) maps Ctrl or Meta to CommandOrControl, so Ctrl+K becomes Cmd+K on macOS. Cmd+H is a deliberate panic-hide, and everything is user-rebindable, so this is a product tradeoff more than a bug. The real nuisance is global Cmd+Enter stolen from mail and chat apps. Shift-only combos may simply fail to register on newer macOS. Low.
- **Test (manual-device):** Unit test in apps/desktop/tests/core.test.ts: validateShortcuts({capture:'Shift+K'}) and 'Alt+K' should throw, which needs a product decision to require Command or Control. Manual-device checklist: with Ctrue hidden, verify Cmd+H, Cmd+Enter and Cmd+L in Safari, Slack and Terminal. Decide on a less collision-prone default set.

### ELEC-9

**Any startup failure quits silently with no dialog or log; no renderer-crash recovery** · low · plausible · `apps/desktop/electron/main.ts:260`

- **Status:** Open
- **What happens:** Any rejection in the whenReady chain (window.loadFile or popup.loadFile failing, a Tray error, a registerShortcuts TypeError) goes to `console.error; app.quit()`. A Finder-launched app has no console, so the user sees the Dock icon bounce and vanish, which matches the 'packaged app exits immediately' symptom. A bad baked website URL makes trustedService throw at module load (L7-8) before ready. There is no render-process-gone, unresponsive or did-fail-load handler: if the main renderer dies (large base64 screenshots), the window goes blank while global shortcuts still emit into a dead page.
- **Verifier:** The code matches. The whenReady chain ends in `.catch(error => { console.error(error); app.quit(); })` (L260), with no dialog or log file. There is no render-process-gone, unresponsive or did-fail-load handler anywhere in main.ts. No concrete trigger exists, though. loadFile of a packaged dist/index.html, Tray with a bundled png, and caught shortcut-parse errors rarely reject. A bad CTRUE_WEBSITE_URL throws at module load, which Electron reports with its default main-process error dialog, so that sub-claim is not silent. The link to the 'exits immediately from agent shell' symptom is unsupported, since the release memory attributes that to the environment. Hardening gap, not a demonstrated bug.
- **Test (e2e-electron):** Add an e2e-electron smoke test in apps/desktop/e2e/launch.spec.ts (Playwright _electron on the packaged app, run by a human or on a macOS CI runner). Assert a window opens and shows the app shell, then call `webContents.forcefullyCrashRenderer()` and assert recovery. Make failures call dialog.showErrorBox and write a log file under userData.

### ELEC-10

**Release env bake has no guard: .env fallback can ship localhost, a missing feed, or a bad website URL** · low · confirmed · `apps/desktop/scripts/build-electron.mjs:3`

- **Status:** Fixed (c0609be)
- **What happens:** README tells users to `cp .env.example .env`. build-electron.mjs merges loadEnv('production') with process.env, so an unset shell variable falls back to .env and bakes CTRUE_API_URL=http://localhost:4318 and an empty CTRUE_UPDATE_FEED_URL. trustedService accepts loopback http, so typecheck, build and CI (check.yml runs `npm run build` with no env) all pass. A packaged release then points at localhost, or autoUpdate silently stays false and users only get the download link. Only API_URL is validated at build (vite.config.ts:5); a malformed CTRUE_WEBSITE_URL passes the build and throws at launch (main.ts:8). dist-electron is shared with `npm run dev`.
- **Verifier:** build-electron.mjs:3 and vite.config.ts:4 both merge loadEnv('production') with process.env and fall back to localhost and an empty feed. apps/desktop/.env exists locally and holds http://localhost:4318, http://localhost:3000, an empty CTRUE_UPDATE_FEED_URL and SIGNED_RELEASE=false. trustedService accepts loopback http, so a forgotten shell variable bakes localhost or leaves autoUpdate false with no error. Only API_URL is validated at build time. CTRUE_WEBSITE_URL is not validated until launch (main.ts:8). The documented release command sets all variables, and a localhost-baked build fails visibly on first launch of the packaged app. Updates degrade to the download link. This needs operator error, so low.
- **Test (release):** Add a release assertion to scripts/verify-release.mjs. After build, require dist-electron/main.cjs to contain the https api and website origins, `updateFeed = "https://…"` and the signed-release flag, and require dist/index.html's meta CSP connect-src to list the same api origin plus its wss form and no localhost. Fail the release if the build env lacks CTRUE_SIGNED_RELEASE/FEED/API/WEBSITE.

### ELEC-11

**Shipped build has no hardened runtime or entitlements, and default Electron fuses, so local processes can ride Ctrue's TCC grants** · low · confirmed · `apps/desktop/scripts/adhoc-sign.cjs:12`

- **Status:** Open — reported as warnings by npm run verify:release
- **What happens:** package.json sets hardenedRuntime and entitlements, but CSC_IDENTITY_AUTO_DISCOVERY=false skips electron-builder signing and the afterSign hook re-signs with `codesign --force --deep --sign <id>`. That call has no `--options runtime` and no `--entitlements`, so both are dropped. No @electron/fuses and no electronFuses config means RunAsNode, NODE_OPTIONS and --inspect stay enabled. Any same-user process can run `ELECTRON_RUN_AS_NODE=1 Ctrue.app/Contents/MacOS/Ctrue script.js` or DYLD-inject into the non-hardened binary and use Ctrue's Screen Recording and Microphone grants. The entitlement plist and the CSC_LINK/hardened path (hook returns early) have never been exercised, so the first Developer-ID build is untested.
- **Verifier:** The facts are accurate. The afterSign hook runs `codesign --force --deep --sign <id>` with no `--options runtime` and no `--entitlements` (adhoc-sign.cjs:12). With CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder skips its own signing, so package.json hardenedRuntime/entitlements never apply. package.json has no electronFuses config, so RunAsNode and the inspect options stay at Electron defaults. This is the known class where a same-user process abuses an unhardened Electron app's TCC grants, for example via `open --env ELECTRON_RUN_AS_NODE=1`. It needs code already running as the user, and it only avoids a TCC prompt. For a free, self-signed app that is a hardening gap rather than a vulnerability, so low.
- **Test (release):** In verify-release.mjs run `codesign -dvv --entitlements :- Ctrue.app` and expect the `runtime` flag and the audio-input and allow-jit entitlements, and run `npx @electron/fuses read --app Ctrue.app` expecting RunAsNode, NodeOptions and NodeCliInspect off. Pass `--options runtime --entitlements build/entitlements.mac.plist` in the hook, and test that a build launches and records audio with the hardened flag on.

### ELEC-14

**Refresh rotation is not crash- or timeout-safe: a lost response, an aborted request or a truncated write forces re-login** · low · plausible · `apps/desktop/electron/main.ts:88`

- **Status:** Open
- **What happens:** The API rotates the refresh token in the DB (the old one dies at once), but the desktop aborts at 15 s (L88), for example on a slow or cold Render instance, or the process is killed between the response and storeTokens. writeFile (L69) truncates then writes in place, so a crash mid-write leaves a corrupt credentials.enc. Either way the desktop holds a dead refresh token: next launch gives 'Login expired' (see ELEC-2) or a safeStorage decrypt error. api/index.ts:124 acknowledges the lost-rotation case, but the desktop's discard-on-version-change logic makes it more likely. Also, `mode: 0o600` applies only when the file is created.
- **Verifier:** The mechanics are real. The server rotates and kills the old refresh token (database/migrations 001 `desktop_token_rotate`). The client aborts at 15 s (L88). storeTokens uses writeFile, which truncates in place (L69). A lost response, a crash between response and write, or a failed write leaves a dead refresh token or a corrupt credentials.enc. Both lead to 'Login expired' or a decrypt error, and a fresh sign-in recovers. index.ts:124 acknowledges the lost-rotation case with a ponytail note ('if that proves common'). It requires a server-side commit with a client-side loss, which needs a slow API or a crash in a tiny window. The finding gives no normal-use trigger. Recoverable annoyance, not data loss.
- **Test (integration):** In credentials.test.ts, simulate a fetch whose server-side rotation commits but whose client promise rejects (timeout), and a writeFile that throws midway. Assert the previous refresh token is retained until the new pair is durably stored (write temp file, then rename). Consider a server-side reuse grace window for the old token.

### ELEC-15

**handleLink bumps credentialVersion before the code is redeemed, so a failed or duplicate link discards an in-flight refresh** · low · plausible · `apps/desktop/electron/main.ts:77`

- **Status:** Open
- **What happens:** A refresh (version N) is in flight when any ctrue:// link arrives (an expired code, a double click firing the same code twice, a forged link). `++credentialVersion` runs before the redeem fetch. The redeem fails with 401, but storeTokens(…, N) now throws 'Sign-in changed while credentials were being refreshed.' The rotated pair is dropped, and disk and memory both keep the dead refresh token, which leads to 'Login expired'. For a duplicate code, link #1's tokens are issued server-side but rejected locally by link #2's version bump, and #2 fails with 'already used', so neither link signs the user in. The error text also says 'refreshed' for a sign-in.
- **Verifier:** Code trace is correct. handleLink bumps `++credentialVersion` (L77) before the redeem fetch. If the redeem fails, an in-flight refresh's storeTokens(…, N) throws at L68 and drops the rotated pair. The old refresh token stays in memory and on disk, so the next refresh gives 'Login expired'. Two links with the same code would also cancel each other. A refresh must be in flight (<1 s window) when a failing link arrives. Duplicate same-code delivery is unlikely, because the dashboard's busy flag blocks double clicks and each click mints a new code. A forged or expired link only costs one forced re-login.
- **Test (unit):** credentials.test.ts: interleave refresh() and handleLink() with a failing redeem. Assert the refreshed pair is stored. Two links with the same code must still end up signed in. Fix by bumping the version only after a successful redeem, or by capturing it at the point of storage.

### ELEC-16

**Deep link silently replaces the signed-in account and steals focus; desktop code regex is looser than the server's** · low · confirmed · `apps/desktop/electron/security.ts:7`

- **Status:** Open
- **What happens:** Any web page can navigate to ctrue://auth?code=<43-128 chars of [A-Za-z0-9_-]>. There is no state or nonce binding to a desktop-initiated login and no confirmation. handleLink restore()s and focuses the main window, POSTs /auth/redeem, and shows an error banner. If the attacker supplies a valid code from their own account (60 s lifetime), the victim's desktop is swapped to the attacker's account, whose profile facts are then injected into the victim's prompts. Impact is limited because the API stores no transcripts. The server accepts only ^[a-f0-9]{64}$ (core.ts:34), so the desktop spends a redeem call, a version bump and a focus steal on codes the server can never accept.
- **Verifier:** parseHandoff (security.ts:7) accepts /^[a-zA-Z0-9_-]{43,128}$/ while the server only accepts ^[a-f0-9]{64}$ (core.ts:34), so the mismatch is real but harmless. handleLink restores and focuses the window, redeems the code, and storeTokens overwrites the stored pair, with no state or nonce binding and no confirmation. An attacker's page that holds a valid 60 s code from the attacker's own account could swap the victim's signed-in account. This is a login-CSRF. The browser's external-protocol prompt is a speed bump, and the impact is limited because no transcripts are stored and the OpenAI key stays on the Mac. Low.
- **Test (unit):** Extend the parseHandoff test in apps/desktop/tests/core.test.ts with the 43-char base64url code (expect throw if tightened to 64 hex), user:pass@, a #fragment, a duplicate code param, 513-char input and uppercase CTRUE://. Add an e2e-electron test that a link while signed in asks before replacing the account.

### ELEC-17

**'Check for updates' reports 'You have the latest version' when the check actually failed** · low · confirmed · `apps/desktop/electron/main.ts:34`

- **Status:** Fixed (9ada226)
- **What happens:** checkForNewRelease returns null on !response.ok (GitHub 403 rate limit, 5xx) and on any thrown error (offline). The autoUpdate path also returns null after catching (L29). App.tsx's button treats any falsy result as success and shows 'You have the latest version of Ctrue (0.1.9).', so an offline or rate-limited user is told they are current.
- **Verifier:** checkForNewRelease returns null on !response.ok and on any catch (L34, L39). The autoUpdate path returns null after catching (L29). App.tsx:468 treats any falsy result as 'You have the latest version of Ctrue (x)'. So an offline or rate-limited user is told they are current.
- **Test (unit):** Unit-test the extracted updates module with a fake fetch: 403, a rejection and an old tag must each return distinct results ({status:'error'} versus {status:'current'}), and the UI must show 'Could not check' for the error case. Also cover tags like v0.2.0-beta.1 (regex rejects) and 'v0.1.10' vs '0.1.9'.

### ELEC-18

**restore()/emit() are unguarded before the window exists or after it is destroyed** · low · plausible · `apps/desktop/electron/main.ts:121`

- **Status:** Open
- **What happens:** On Windows (and macOS when a second process is launched explicitly), a second launch or link during the first instance's startup fires 'second-instance' before `window` is assigned. restore() throws on `window.isMinimized()` and Electron shows a main-process error dialog. The 'activate' handler is guarded with `window &&`; this one is not. After a destroyed window (ELEC-3), the same call throws 'Object has been destroyed'.
- **Verifier:** `let window: BrowserWindow` is unassigned until the whenReady chain runs. The second-instance handler (L121) calls restore() unguarded, and restore() calls window.isMinimized(). The 'activate' (L125) and 'open-url' (L122) handlers do guard with `window`. Electron emits second-instance on macOS only when a second process is started from the command line. On Windows a link click during startup could trigger it. The window is created within the first few hundred ms after ready, so the window is tiny. After a destroyed window (ELEC-3) it throws too. Low.
- **Test (unit):** With electron mocked in a unit test of the extracted lifecycle module, call the second-instance handler before whenReady resolves and with a destroyed window, and assert no throw and that the link is queued in pendingLink.

### ELEC-19

**assertSender builds the expected file URL by string concatenation instead of pathToFileURL** · low · plausible · `apps/desktop/electron/main.ts:55`

- **Status:** Open
- **What happens:** `new URL(`file://${path.join(__dirname,'../dist/index.html')}`)` does not percent-encode '#', '?' or '%' in the install path. The NSIS installer lets users pick any directory (allowToChangeInstallationDirectory), and a macOS user can run from a folder like '/Users/me/Apps #2/'. The real senderFrame.url is encoded while this string is not, so every ipc() call throws 'Untrusted application frame.' and the app renders with no config or credentials.
- **Verifier:** L55 builds the expected URL with `new URL(`file://${path.join(...)}`)` instead of pathToFileURL. Spaces and non-ASCII characters are percent-encoded identically on both sides, and Windows drive-letter paths parse correctly. The comparison only breaks for a literal '#' or '?' in the install path, because Electron's loadFile encodes them and the string-built URL treats them as fragment or query. Default install paths (/Applications, Program Files) never contain them. Very rare, but it would make every IPC call throw. Low.
- **Test (unit):** Unit-test the extracted check with paths containing space, '#', '%' and a Windows drive letter against senderFrame.url computed via pathToFileURL. Then switch to pathToFileURL(...).href.

### ELEC-20

**Undecryptable credential files and sign-out edge cases are not recoverable or fully revoked** · low · plausible · `apps/desktop/electron/main.ts:164`

- **Status:** Open
- **What happens:** If the Keychain item changes (signing identity change, keychain reset, Migration Assistant to a new Mac), decryptString throws. ctrue:credentials rethrows a raw 'Error while decrypting the ciphertext…' at every launch and never removes the unreadable file. openai-key silently becomes 'not added'. On sign-out (L177-182), if unlink fails with EPERM the IPC throws before the server revoke, so the file survives and the next launch signs the user back in. If tokenPair was never loaded, `revoked` is undefined and nothing is revoked server-side. A refresh rotated mid-signout leaves an orphan 30-day server row.
- **Verifier:** Partly overstated. A decryptString failure is rethrown by ctrue:credentials (L174). The init effect catches it and shows a raw error banner each launch, and the file is not deleted. The state is recoverable, though: token stays null, so the connect panel shows, and a fresh sign-in overwrites the file. The signout EPERM branch and 'tokenPair never loaded' are hypothetical. In the decrypt-failure case there is no token to revoke anyway. The real defects are the raw error text and the lack of cleanup. Keychain identity changes are a real trigger, since the app has already changed signing identity once.
- **Test (unit):** credentials.test.ts with a fake safeStorage whose decryptString throws: expect null plus a cleaned file plus a friendly message. Signout with unlink failing must still revoke and report. Signout before the credential load must still revoke by reading the file.

### ELEC-21

**popup-state has no shape validation, and the 200 KB cap drops silently** · low · plausible · `apps/desktop/electron/main.ts:200`

- **Status:** Open
- **What happens:** Any non-null object passes if JSON.stringify(...).length <= 200000. The sender is the whole app state: up to 10 answers of ~2500 tokens each, plus walk steps, resent on every streamed token and transcript delta (a full stringify plus structured clone each time). If the cap is ever exceeded (long code answers, multibyte text), the invoke rejects and the renderer's `.catch(() => {})` swallows it, so the pop-up freezes on stale content with no error. There is also no test of the cap.
- **Verifier:** The L200 check is only `typeof object` plus a 200000-character stringify limit, and App.tsx:426 swallows rejection with `.catch(() => {})`. The state carries up to 10 answer history entries, each with a question and text. Walkthrough explain-step prompts can reach about 12-14k characters (4000 problem + 8000 step JSON), so ten long entries approach the cap. Normal sessions sit well below it, at roughly 50-80k. If it is exceeded, the pop-up would freeze on stale content for the rest of the session, since history stays at 10 entries. Reachable only in extreme sessions. Low.
- **Test (unit):** Unit-test the validator (extracted) with 199,999 and 200,001 character payloads, arrays, and cyclic or BigInt values. Add a renderer check that a rejected popupState surfaces an error. Consider sending diffs, or capping history in the sender.

### ELEC-22

**Default Electron application menu is left in the packaged app; Cmd+R, Cmd+W, Cmd+Q and DevTools act inside the shortcut recorder** · low · plausible · `apps/desktop/electron/main.ts:211`

- **Status:** Open
- **What happens:** No Menu.setApplicationMenu call. While a shortcut field is focused, `recording(true)` unregisters all global shortcuts (L211), and `recording(false)` is only sent on blur. Pressing Cmd+R (menu Reload) reloads the page with no blur, so all global shortcuts stay unregistered until the app restarts. The same happens if the renderer crashes. Cmd+W hides the window and Cmd+Q quits mid-capture. Reload mid-session also ends the session via pagehide.
- **Verifier:** No Menu.setApplicationMenu exists (Menu is used only for the tray), so Electron's default menu with Reload and DevTools remains in the packaged app. recording(true) unregisters all shortcuts and only blur re-registers them (L211, App.tsx:468). A reload or renderer crash while a shortcut field is focused would leave them unregistered. The specific Cmd+R-in-recorder trigger is weak, though. The recorder's onKeyDown calls preventDefault on every key except Tab, and on macOS the web contents see the key equivalent before the menu, so Cmd+R should be recorded as a shortcut rather than reload. The remaining paths (clicking View > Reload with the field focused, a renderer crash) are rare.
- **Test (e2e-electron):** e2e-electron: focus a shortcut input, send Cmd+R, and assert globalShortcut.isRegistered(capture) after reload. Fix by re-registering on did-finish-load and render-process-gone, and by replacing the default menu with a minimal one that omits Reload and DevTools in packaged builds.

### ELEC-23

**Running `npm run dev` re-registers the ctrue:// handler to the dev Electron bundle** · low · plausible · `apps/desktop/electron/main.ts:128`

- **Status:** Open
- **What happens:** With process.defaultApp, setAsDefaultProtocolClient('ctrue', execPath, [script]) on macOS binds the scheme to the Electron.app dev bundle (the args are ignored by LaunchServices). After any dev session on the same Mac, the website's 'Connect desktop' opens a bare Electron welcome screen instead of Ctrue until the packaged app is launched again. The packaged app and a DMG-mounted or Downloads copy can also hold the registration. This will confuse deep-link testing.
- **Verifier:** L128 registers the ctrue scheme from the dev process. On macOS, setAsDefaultProtocolClient ignores path and args and binds to the current main bundle id, which in dev is the Electron.app bundle. Launching the packaged app re-registers it at startup (L127). The effect is limited to the maintainer's machine after a dev session, and end users never run the dev path. It is a test-environment prerequisite, not a product bug.
- **Test (manual-device):** Test-plan prerequisite and manual step: before the deep-link scenarios, run `/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -dump | grep -A3 ctrue`, confirm only /Applications/Ctrue.app, then click 'Connect desktop'. Optionally skip registration in dev unless CTRUE_REGISTER_PROTOCOL=1.

### ELEC-24

**Two independent CSPs drift: the runtime header (not applied to file://) and the build-time meta tag** · low · confirmed · `apps/desktop/vite.config.ts:6`

- **Status:** Open
- **What happens:** Packaged builds load file://, so the policy that matters is the meta tag from vite.config.ts (script-src 'self', frame-src 'none', form-action 'none', and always `ws://127.0.0.1:5173` in connect-src, even in production). The onHeaderReceived policy in main.ts:146 lacks frame-src and form-action and adds unsafe-inline only in dev, where the meta tag intersects it away. Editing one without the other changes nothing visibly. A baked API origin that differs between meta and main would silently block all renderer fetches or WebSockets. Neither policy is tested.
- **Verifier:** The two policies already differ. vite.config.ts:6 bakes frame-src 'none', form-action 'none' and an unconditional ws://127.0.0.1:5173 into the meta tag, while main.ts:146 builds a header policy without frame-src or form-action and adds 'unsafe-inline' and the 5173 websocket only in dev. Both derive the API origin from the same env merge today, so there is no functional break now. This is a maintenance and test-gap issue. The production meta CSP carrying a localhost dev websocket is cosmetic.
- **Test (release):** Release/unit check that parses dist/index.html after `vite build`: assert the meta CSP exists, connect-src contains exactly the baked https API origin and wss form, no unsafe-inline or unsafe-eval in script-src, and (decision) no ws://127.0.0.1:5173 in a production build. Add one e2e-electron assertion of the effective CSP via a blocked fetch to a foreign origin.

### ELEC-27

**README and .env.example do not match the real release flow; website download link depends on an undocumented asset rename** · low · confirmed · `apps/desktop/README.md:9`

- **Status:** Open
- **What happens:** README says package:mac 'creates an unsigned directory/zip', but the script also builds a dmg and signs it ad hoc or with CTRUE_SIGN_IDENTITY. CTRUE_SIGN_IDENTITY, the required cert, the three-asset GitHub release, and renaming the DMG to Ctrue-mac-arm64.dmg (needed by the website NEXT_PUBLIC_MAC_DOWNLOAD_URL) are documented only in a private memory note. `.env.example` omits CTRUE_SIGN_IDENTITY and CSC_IDENTITY_AUTO_DISCOVERY. VITE_DEMO_MODE in .env.example is read by nothing in apps/desktop/src. Forget the rename and the website download 404s, while the in-app updater still works.
- **Verifier:** README.md:9 says package:mac 'creates an unsigned directory/zip'. The script builds dir, zip and dmg and the afterSign hook signs it. CTRUE_SIGN_IDENTITY and CSC_IDENTITY_AUTO_DISCOVERY appear nowhere in .env.example or README. They are used only in adhoc-sign.cjs and desktop-build.yml, and documented only in the private memory note. The DMG rename and the three-asset release are not in the repo, and the website link comes from NEXT_PUBLIC_MAC_DOWNLOAD_URL. VITE_DEMO_MODE in .env.example is read by nothing in apps/desktop/src. scripts/dev.mjs sets it itself. Documentation drift only.
- **Test (release):** Post-publish release script: HEAD https://github.com/monishpatalay/ctrue/releases/latest/download/{latest-mac.yml,Ctrue-mac-arm64.dmg,Ctrue-<ver>-arm64-mac.zip} and expect 200 after redirects, and compare latest-mac.yml's sha512 and size with the uploaded zip. Move the release steps into the README.

### LEG-1

**Privacy and Terms promise data-access and deletion via 'contact details below', but the contact is an env-driven placeholder** · low · plausible · `apps/web/lib/legal.ts:2`

- **Status:** Open — confirmed live by npm run probe:production
- **What happens:** contactEmail defaults to '' and .env.example leaves NEXT_PUBLIC_CONTACT_EMAIL blank. privacy/page.tsx lines 47-51 and 63 tell users to ask for a copy of their data or deletion 'using the contact details below'. With the env unset (the repo's .env.local has no such key), the page prints 'Contact details will be published here before launch' while 0.1.9 is public. The users who hold stored resume text have no channel to exercise the rights the policy grants. lastUpdated is also a hard-coded string (October 13, 2026) that nothing ties to content changes.
- **Verifier:** The code is as described. legal.ts:2 defaults contactEmail to '', and privacy/page.tsx:50,63 and terms/page.tsx:55 fall back to 'Contact details will be published here before launch.' The 'contact details below' promise sits next to that fallback. apps/web/.env.local has no NEXT_PUBLIC_CONTACT_EMAIL key, but that is a local file. The production value is set in Vercel and cannot be seen from the repo, so the live page may already be fine. Facts deletion is self-serve on the dashboard. Only data copies and account deletion depend on the contact. The hard-coded lastUpdated is a minor nit.
- **Test (release):** Include the mailto assertion on /privacy and /terms in scripts/verify-site.mjs (see REL-2). Add a unit test that fails the build when NODE_ENV=production and contactEmail is empty (a throw in lib/legal.ts at module load).

### MD-1

**Website Markdown renderer is an unexported, untested copy of the desktop parser with no parity check** · low · plausible · `apps/web/components/markdown.tsx:4`

- **Status:** Fixed (2e7853d)
- **What happens:** The file says the two apps 'share no package, so keep them in step'. Today parseMarkdown and inline are textually identical to apps/desktop/src/api.ts:55-79 and Markdown.tsx. Only the desktop copy has tests (desktop core.test.ts). The web copy is a module-private function that cannot be imported by any test. A fix made to one side only (for example the **bold**/backtick regex, the '1)' ordered-list handling or the unclosed-fence rule for streaming) makes the same model answer render differently on the website and in the pop-up, and nothing flags it.
- **Verifier:** apps/web/components/markdown.tsx parseMarkdown and inline are line-for-line the same as apps/desktop/src/api.ts:55-79 and Markdown.tsx today. The web copy's comment tells maintainers to keep them in step. Only the desktop copy is exported and tested. Drift needs a future one-sided edit, and the web consumer is the little-used practice panel, which WEB-1 limits to the owner account. Low impact, cosmetic.
- **Test (unit):** scripts/markdown-parity.test.mjs: read both source files, extract the parseMarkdown and inline function bodies by regex, and assert they are equal after whitespace and type-annotation stripping. Better: export parseMarkdown from apps/web/components/markdown.tsx and run the same fixture table (streaming unclosed fence, '1)' lists, '* * *' rule, **bold** next to `code`, raw <script> text) against both implementations.

### REL-2

**Build-time public env is unchecked: a missing value silently degrades the site (API URL becomes localhost, download CTA, contact, sign-in)** · low · plausible · `apps/web/lib/client.ts:3`

- **Status:** Open
- **What happens:** NEXT_PUBLIC_API_URL falls back to http://localhost:4318. NEXT_PUBLIC_MAC_DOWNLOAD_URL unset or non-https makes the downloads page show a 'Build locally' badge instead of the DMG. NEXT_PUBLIC_CONTACT_EMAIL unset prints 'Contact details will be published here before launch'. If only one of NEON_AUTH_BASE_URL or NEON_AUTH_COOKIE_SECRET is set, auth-server.ts returns null: /api/auth/* answers 503, proxy.ts lets /dashboard through unguarded, and Google sign-in shows 'unavailable'. check.yml builds with none of these set, so CI is green for every one of these broken configurations. If the release DMG is not renamed to Ctrue-mac-arm64.dmg, the CTA 404s.
- **Verifier:** The code matches the description. client.ts:3 falls back to localhost:4318. downloads/page.tsx shows 'Build locally' when the URL is unset or not https. auth-server.ts returns null unless both Neon vars are set, route.ts then answers 503, and proxy.ts passes /dashboard through. check.yml builds with none of these set. The production site is evidently configured, though, since people sign in and download. The risk is a future misconfiguration or a DMG that is not renamed. Auth is not weakened when the proxy passes through, because the dashboard is client-gated and the API enforces JWTs. It is a post-deploy verification gap for a single-maintainer release, so low.
- **Test (release):** scripts/verify-site.mjs run after each Vercel deploy. It fetches /downloads and asserts an https href that returns 200 and a plausible Content-Length via HEAD. It fetches /privacy and asserts a mailto link. It fetches /_next chunks or the dashboard HTML and asserts they reference the production API origin and not localhost. It asserts GET /api/auth/get-session returns 200 JSON, not 503, and GET /dashboard without a cookie returns a redirect to /login.

### REN-4

**One failed heartbeat (503, 429, timeout) stops live capture and pauses the session, although the server lease tolerates three misses** · low · confirmed · `apps/desktop/src/App.tsx:199`

- **Status:** Open
- **What happens:** Live capture during a call. A heartbeat at the 5 s tick gets 'Database unavailable' (503, Neon wake-up), 429, a 15 s request timeout, or a transient network blip. The catch block at 199-207 immediately runs stopCapture(), aborts any answer in flight, sets the session to paused locally and shows 'Connection lost'. The server lease is 15 s (database/migrations/002_unmetered.sql:26,31) and production runs METERING=false, so there is no billing reason to stop. The user loses transcription mid-call and must press the capture shortcut again. Any error is treated the same way, including non-fatal ones.
- **Verifier:** The catch at App.tsx:199-207 stops capture, aborts the answer and pauses locally on any heartbeat error. The behaviour is as described. It is deliberate fail-closed ('Connection lost. Capture stopped...'). It is also mostly redundant: the WS server lease check (index.ts:211) calls active() every 1 s and closes the socket on any DB error, and a network-level failure kills the WS anyway. 429 is implausible at 12 heartbeats a minute. Only a REST-only glitch, such as one 15 s timeout, is newly harmful. Downgraded to low.
- **Test (integration):** apps/desktop/tests/app.test.tsx with fake timers: start a session and a fake capture, make the second heartbeat return 503 and the third 200. Assert capture is still live (or, if one miss is meant to stop it, that the behaviour is documented). Add a case where heartbeats fail for more than 15 s and assert the local pause.

### REN-6

**'Sign out & clear context' and 'Clear session context' leave the walkthrough, problem screenshots, question and pop-up question in memory** · low · confirmed · `apps/desktop/src/App.tsx:441`

- **Status:** Fixed (8e96f4c)
- **What happens:** signout() (line 441) clears answers, answer, transcript, image and facts. It does not clear steps/stepsRef, walkProblem.current (problem text plus up to 4 screenshot data URLs), question, shots, activeQuestion.current, walkError or explainedIndex. 'Clear session context' (line 468) misses steps, walkProblem and activeQuestion. After either, the main window still shows the previous walkthrough code. The popup-state effect (line 426) keeps sending question: activeQuestion.current and walk: steps[stepIndex], so the pop-up still shows the last problem and solution. The next account on a shared Mac sees it, while the UI says 'Session context cleared.' The README privacy text and the 'Sign out & clear context' label promise otherwise.
- **Verifier:** signout() (441) and 'Clear session context' (468) do not touch steps/stepsRef, walkProblem, activeQuestion, explainedIndex or walkError. Clear context also leaves question's walk state, and sign-out leaves question and shots. The popup-state effect keeps sending the old question and walk step, so the walkthrough stays visible in both windows after 'Session context cleared.' The data is in-memory only and the README does not explicitly promise a full wipe. A shared Mac is the only privacy angle, so low.
- **Test (integration):** apps/desktop/tests/app.test.tsx: run a walkthrough, then click 'Clear session context' and 'Sign out & clear context'. Assert steps, question, shots and the last window.ctrue.popupState payload (question '', walk null, history []) are empty and walkProblem pictures are released.

### REN-7

**Pop-up state over 200 KB is rejected by main and the renderer swallows the error, so the pop-up silently freezes** · low · plausible · `apps/desktop/src/App.tsx:426`

- **Status:** Open
- **What happens:** popupState sends the whole history (up to 10 answers, each stored with its full question) plus the current walk step (code up to 20,000 chars, details up to 8,000). Stored questions can be large: explainStep prompts carry up to 4,000 chars of problem plus 8,000 of step JSON (App.tsx:376), and typed questions go up to 12,000. Ten entries of about 20 KB, or a few big Explain-step rounds with a long pasted problem, push JSON.stringify(value).length past 200000. electron/main.ts:200 throws and App.tsx:426 does .catch(() => {}). The pop-up stops updating, with no new answers, no listening state and no errors. It stays broken until history is cleared, because the oversized entries stay among the last 10.
- **Verifier:** Mechanism is real: main.ts:200 throws above 200000 chars and App.tsx:426 swallows it with .catch(() => {}). But it needs about 20 KB per history entry on average across 10 entries. Typical entries are 3-8 KB (problem text 1-2 KB, answer at most 2500 tokens), so about 50-80 KB total. Only pathological pasted problems or repeated long Explain-step rounds reach it.
- **Test (integration):** Unit-test a pure buildPopupState(...) extracted from the effect: with 10 answers whose question is 12,000 chars and text is 10,000 chars, plus a max-size walk step, assert JSON.stringify(state).length < 200000 (truncate history or questions). Add a main-process test that ctrue:popup-state rejects at 200001 and that the renderer surfaces the failure.

### REN-10

**Profile 'Save reviewed facts' is enabled before the profile has loaded, so a failed or slow load followed by Save overwrites stored facts with the textbox contents** · low · plausible · `apps/desktop/src/App.tsx:467`

- **Status:** Fixed (8e96f4c)
- **What happens:** The profile tab fetches GET /profile (lines 171-177). The textarea starts empty and Save is enabled by token and busy only, not by profileLoaded. If the GET fails (offline, 503) an error banner shows and facts stays ''. A click on Save sends PUT {facts:''}, wiping the verified facts the user saved earlier. Typing before the response arrives is also overwritten silently by setFacts(profile.facts). Resume import likewise replaces unsaved edits without confirmation.
- **Verifier:** Save is disabled only by token/busy (467), not profileLoaded, so after a failed GET /profile, Save sends PUT {facts:''}. But the user sees an error banner and an empty textarea and must deliberately click Save. The late-GET overwrite of typed text needs a slow response. Delete is guarded by !facts, Save is not. Low likelihood, so downgraded from medium.
- **Test (integration):** apps/desktop/tests/app.test.tsx: make GET /profile fail, open the Profile tab, click 'Save reviewed facts', and assert no PUT is sent (or the button is disabled) until profileLoaded. Another case: type text, resolve GET late, assert the typed text is kept.

### REN-11

**A transient updater error after the update has downloaded replaces 'Restart to update' with a manual-download banner** · low · confirmed · `apps/desktop/src/App.tsx:158`

- **Status:** Fixed (8e96f4c)
- **What happens:** 'update-ready' sets updateReady and shows the Restart button. The app is tray-resident and electron/main.ts:259 re-checks every 6 h. Any updater 'error' (offline laptop, GitHub or feed blip) emits 'update-fallback', which runs setUpdateReady(false) and setUpdateFallback(true). The banner (line 451) switches to 'Download it, then drag it into Applications' and the Restart button disappears, although the update is downloaded. In Preferences the 'Restart and update' button also disappears. If the error comes before any 'update-available', updateFallback stays true for the whole run, so a later real update shows manual-download text instead of 'Downloading…'. The README promises that Ctrue 'shows Restart to update'.
- **Verifier:** main.ts:255 emits 'update-fallback' on any updater 'error'. electron-updater AppUpdater.js:271 emits 'error' whenever checkForUpdates fails, and the 6 h interval (main.ts:259), often firing right after wake before Wi-Fi is up, can do this after update-downloaded. App.tsx:158 then does setUpdateReady(false), which removes the Restart button in the banner and in Preferences. Impact is limited to UI and wording; the downloaded update is still applied on quit. Downgraded to low.
- **Test (integration):** apps/desktop/tests/app.test.tsx: fire onEvent 'update-ready' (0.2.0), then 'update-fallback'. Assert 'Restart to update' is still rendered. Fire 'update-fallback' first, then 'update-available', and assert the 'Downloading…' text.

### REN-12

**'Check for updates' says 'You have the latest version' when the check failed** · low · confirmed · `apps/desktop/src/App.tsx:468`

- **Status:** Fixed (9ada226)
- **What happens:** checkUpdate() returns string|null, and electron/main.ts:28-29 and 34-39 return null for 'up to date', network errors, GitHub non-200 (60/h unauthenticated rate limit) and updater exceptions alike. The renderer treats null as up to date and shows 'You have the latest version of Ctrue (0.1.9)'. Offline or rate-limited users are told they are current.
- **Verifier:** main.ts:28-29 and 34-39 return null for up-to-date, a non-200 response, a network error and an updater exception alike. App.tsx:468 treats null as 'You have the latest version'. Offline or rate-limited users are told they are current.
- **Test (unit):** In a main-process test with fetch stubbed to reject or return 403, assert checkForUpdates() distinguishes failure from up-to-date (throws or returns a status). The renderer test then asserts the error banner, not the 'latest' notice.

### REN-14

**Preempting generate() can orphan an in-flight request and race the server's per-user answering lock** · low · plausible · `apps/desktop/src/App.tsx:305`

- **Status:** Open
- **What happens:** (a) Two preempting calls, such as a double press of the answer shortcut or a shortcut plus a pop-up follow-up while an answer streams, both see inflight.current=A, abort it and await it. Both then start. abortRef.current is overwritten by the second controller, so the first request can no longer be cancelled from the UI. The first task's finally nulls abortRef (respond and walk both do it unconditionally), inflight.current points at only one task, and the server returns 409 'Cancel the current answer first' to one of them. (b) Even a single preempt aborts locally and POSTs at once, while the server only frees `answering` after it sees the socket close (apps/api/src/index.ts:176-178,198). Behind the Render proxy this can still return 409 for a deliberate preempt such as screenshot mid-answer.
- **Verifier:** (a) Two concurrent preempting generate() calls both await the same inflight task, then both start. abortRef is overwritten and each task's finally nulls it. The code supports this, but it needs a double press while a task is in flight. Server-side the answering check at index.ts:176 and add at 178 are separated by awaits, so either 409 or two parallel answers is possible. (b) The 409 after a single preempt depends on proxy and close timing and is unproven.
- **Test (integration):** apps/desktop/tests/app.test.tsx: stub /answers with a hanging stream, fire the answer action twice back-to-back, and assert only one request is in flight and the Cancel button aborts it. In scripts/smoke.mjs, abort an /answers stream and immediately POST again, expecting no 409.

### REN-15

**Screenshot shortcut clears collected screenshots before the answer succeeds, and the 5 MB body limit has no client-side guard** · low · confirmed · `apps/desktop/src/App.tsx:407`

- **Status:** Open
- **What happens:** The user scrolls and collects 3 parts with the collect shortcut, then presses the screenshot shortcut. setShots([]) runs before generate(). If generate() fails (no OpenAI key 402, OpenAI 429, network, or 413 'Request exceeds size limit' for four photo-heavy 1920 px JPEGs against the 5 MB express.json limit, apps/api/src/index.ts:115), all collected screenshots are gone and the user must scroll and collect again. A fifth collect silently drops the oldest because of slice(-3). A shot taken while `collect` is still in flight is missed, because shots is a stale closure value, and is then cleared anyway.
- **Verifier:** App.tsx:411 calls setShots([]) before generate(). Any failure (402, 429, network) loses the collected shots, and Regenerate does not re-attach images. slice(-3) silently drops the oldest. The 413 case is unlikely: four compact 1920 px JPEGs at q0.7 are about 2-3 MB against the 5 MB limit. Minor UX.
- **Test (integration):** apps/desktop/tests/app.test.tsx: stub acquireScreen to return a canvas, collect 3 shots, make /answers return 429, trigger screenshot, and assert shots count is still 3 (or the popup tells the user they were discarded). Add a body-size assertion with 4 maximally sized compact images against the 5 MB cap.

### REN-16

**Screenshot shortcut with no recent speech forces 'coding' mode, ignoring the selected Technical, Behavioral or System design mode** · low · confirmed · `apps/desktop/src/App.tsx:414`

- **Status:** Open
- **What happens:** Mode is 'system-design' and the user screenshots a design prompt. Without speech in the last 20 s, line 414 passes mode==='walkthrough' ? 'walkthrough' : 'coding'. The API answers with the coding prompt (code, complexity, edge cases) instead of components and tradeoffs. Behavioral and Technical screenshots are also answered as coding. The README says only that the shortcut 'answers' the screenshot.
- **Verifier:** App.tsx:414 passes 'coding' for every non-walkthrough mode when no recent speech exists, so system-design, technical and behavioral screenshots get the coding prompt. The prompt text 'Read and solve the problem' suggests a coding assumption, so it may be a design choice, but it ignores the selected mode.
- **Test (integration):** apps/desktop/tests/app.test.tsx: set mode to system-design, trigger the screenshot action with an empty transcript, and assert the /answers body has mode 'system-design' (or document that it is coding).

### REN-17

**Walkthrough topic auto-switch to 'system-design' is one-way and sticky, and 'system design' anywhere in the problem text triggers it** · low · confirmed · `apps/desktop/src/App.tsx:343`

- **Status:** Open
- **What happens:** A problem containing 'system design' ('This is not a system design question: implement an LRU cache') sets topic to 'system-design' for the request and permanently in state (not persisted). The next coding screenshot, 'Read the problem in the screenshot.', carries no keyword, so kind=topic is still 'system-design'. A coding problem is planned as a system design until the user flips the toggle back. Nothing switches back to 'coding'.
- **Verifier:** App.tsx:343 sets topic to 'system-design' with setTopic and never reverts it. It is not persisted. Nothing switches back, so later keyword-free coding screenshots stay planned as system design until the visible toggle is flipped. The trigger phrase appearing in a coding problem is uncommon. The ponytail comment covers the keyword match but not the stickiness.
- **Test (unit):** Extract topicFor(text, current) into apps/desktop/src/steps.ts and test: the keyword flips only for that request, never persists, and text without the keyword keeps the user's explicit toggle.

### REN-18

**buildCode uses String.replace with code as the replacement, so '$&', "$'", '$`' and '$$' in step code corrupt the rebuilt solution and trigger a false 'solution differs' warning** · low · confirmed · `apps/desktop/src/steps.ts:15`

- **Status:** Fixed (dd705ab)
- **What happens:** A replace step whose code contains "print('Total: $' + t)" or '$$("sel")' or '$&': current.replace(target, normalize(step.code)) interprets $-patterns, inserting text from the match or the rest of the string. stepsMatchFinal then returns false and Walkthrough.tsx:34 tells the user 'The complete solution differs slightly from the steps above'. The final code itself is unaffected, so this is a false alarm, but a confusing one in languages that use $.
- **Verifier:** steps.ts:15 uses current.replace(target, normalize(step.code)) with a string replacement, so $&, $', $` and $$ are interpreted. A common case is JS/TS code containing a quoted '$' such as print('Total: $' + t) or a regex string 'x$'. That yields wrong rebuilt code, stepsMatchFinal returns false and Walkthrough.tsx:34 shows a false warning. The final code is unaffected. The add branch is not affected.
- **Test (unit):** apps/desktop/tests/core.test.ts: buildCode with an add step followed by a replace step whose code contains "'$'" and '$$'. Assert the output equals a literal concatenation and stepsMatchFinal is true. Fix with a replacer function.

### REN-19

**controlSession pause/end mutates sessionRef before the server call and never rolls back on failure, so UI state and ref diverge** · low · confirmed · `apps/desktop/src/App.tsx:237`

- **Status:** Open
- **What happens:** Pause or End is clicked while the network is down. Line 237 stops capture, aborts the answer and sets sessionRef.current.status to 'paused' or 'ended' before the request. The request fails, the catch sets an error, and setSession is never called, so the UI still shows 'SESSION ACTIVE' and a Pause button. The heartbeat effect still runs (it keys on session state) but every result is dropped by isCurrent(), so heartbeats keep renewing the lease while the client believes it is paused, and heartbeat failures no longer pause anything. A later ensureSession() sees 'ended' and POSTs /sessions for a fresh start. Also, setAccount(await json('/account')) failing after a successful pause reports an error for an action that worked.
- **Verifier:** App.tsx:237 mutates sessionRef before the request. If the request fails, setSession never runs, so the UI shows ACTIVE with a Pause button while the ref says paused/ended. The heartbeat effect is keyed on state, keeps sending, and isCurrent() drops every result. setAccount(await json('/account')) after a successful pause also reports an error for a successful action. This needs a failing network at click time, and the server lease self-heals, so low.
- **Test (integration):** apps/desktop/tests/app.test.tsx: start a session, make POST /pause reject, click Pause, and assert the displayed status, sessionRef and heartbeat behaviour agree (either still 'active' with an error, or locally paused). Cover /account failing after a successful pause.

### REN-20

**A desktop 'auth' event (deep link sign-in) does not reset session, capture or context when it replaces an existing sign-in** · low · plausible · `apps/desktop/src/App.tsx:154`

- **Status:** Open
- **What happens:** User A has an active session with live capture. The user finishes 'Connect desktop' on the website as user B. authenticate() bumps the epoch and swaps the token but leaves session, capture, answers, transcript and walkthrough state untouched. Capture keeps running on A's session until the next heartbeat (up to 5 s), which sends B's token with A's session id, gets 404 and triggers 'Connection lost'. A's answers and transcript are sent as `context` in B's next /answers, and A's session is only ended by lease expiry. An in-flight answer stream stops being read when the epoch changes, without cancelling the response body, so the server's `answering` lock lingers and the next request may get 409.
- **Verifier:** authenticate() only bumps the epoch and swaps the token (113, 154). Session, capture and transcript are untouched, so a different user's connect would leave A's context to be sent in B's /answers and cause a 404 heartbeat. That needs an account switch during an active session, which is rare. The stalled-stream point is real: epoch-change aborts throw in the readEvents callback without cancelling the body, so the server answering lock lingers until the stream finishes.
- **Test (integration):** apps/desktop/tests/app.test.tsx: with an active session and transcript, fire onEvent {action:'auth',payload:{accessToken:'B'}}. Assert capture is stopped, the session reset and context cleared, and that no /answers body contains A's transcript.

### REN-21

**The pop-up webContents gets the full privileged preload API and every IPC channel (OpenAI key, tokens, shortcuts, quit)** · low · confirmed · `apps/desktop/electron/main.ts:55`

- **Status:** Open
- **What happens:** assertSender accepts the pop-up for all channels, and both windows share one preload (line 129) exposing credentials(), refresh(), openaiKey(), signout(), shortcuts() and quit(). The pop-up renders model output, user speech, step code and the OpenAI-derived Markdown. Today the Markdown component is HTML-injection-safe (React elements only, no links) and CSP is script-src 'self', so there is no known exploit. But any future renderer bug in the pop-up would be able to read the decrypted OpenAI key and the desktop access token. The pop-up needs only config, onEvent and popup* calls.
- **Verifier:** main.ts:55 accepts the pop-up for every channel, and both windows share one webPreferences/preload (129, 136). So the pop-up can call openaiKey(), credentials(), refresh() and quit(). This is a defense-in-depth gap only. Markdown.tsx builds React elements with no links or HTML, the CSP is script-src 'self', and the permission handlers are restricted to the main window. No current exploit.
- **Test (e2e-electron):** Playwright-for-Electron (apps/desktop/tests/e2e/popup-privilege.spec.ts): from the popup webContents call window.ctrue.openaiKey() and credentials(); assert they reject. Add a unit check that ipc() takes an allowed-senders list per channel.

### REN-22

**No React error boundary: any render exception blanks the window while the session, shortcuts and capture keep running** · low · plausible · `apps/desktop/src/main.tsx:9`

- **Status:** Open
- **What happens:** A render-time throw (for example a malformed walkthrough step, new URL(config.api) at App.tsx:455 with a bad config, a future Markdown edge case) unmounts the whole tree. The main window and the pop-up go white. captureRef and the heartbeat interval die with the effects cleanups only at unmount, so unmount stops them, but global shortcuts keep working and the user sees nothing. The only recovery is quitting the app.
- **Verifier:** main.tsx has no ErrorBoundary, so a render throw unmounts the root. That is standard React behaviour. I found no concrete trigger: config.api comes from main's trustedService, Markdown is total over strings, and steps are server-validated. It is a robustness hardening item, not a demonstrated bug.
- **Test (integration):** apps/desktop/tests/app.test.tsx: render <App/> with a popup-state or step payload that throws during render and assert a fallback with a Reload button is shown. Add a unit check that Markdown never throws on random strings (fuzz parseMarkdown plus inline).

### REN-23

**Stale 'credits' copy in a free, bring-your-own-key product** · low · confirmed · `apps/desktop/src/App.tsx:198`

- **Status:** Open
- **What happens:** After payments were removed (migration 003), the heartbeat path still tells the user 'Session stopped. Check your remaining credits.' when the server pauses the session (laptop sleep, lease lapse). Starting capture on a lease-lapsed 'active' session also surfaces the API's 'Start or resume a session with available credits' (apps/api/src/index.ts:86). Neither gives a way to act.
- **Verifier:** App.tsx:198 'Session stopped. Check your remaining credits.' is reachable whenever a heartbeat returns a non-active status. The server pauses a lapsed lease on the next heartbeat after laptop sleep or a network gap over 15 s (002:19). With METERING=false there are no credits. index.ts:86's 'available credits' wording is also stale. Copy-only issue.
- **Test (integration):** apps/desktop/tests/app.test.tsx: a heartbeat returning status 'paused' with metered=false must show a 'Session paused, press Resume' style message, not 'credits'. Grep-based check in scripts for 'credits' in desktop UI strings.

### REN-24

**Pop-up shortcut hint never refreshes after rebinding, and a partially failed Save leaves an action unbound yet persisted** · low · confirmed · `apps/desktop/src/Popup.tsx:21`

- **Status:** Open
- **What happens:** Popup reads window.ctrue.config() once on mount, so after the user rebinds a key in Preferences the pop-up keeps showing the old shortcuts until relaunch. In Save shortcuts (App.tsx:468) the main process calls globalShortcut.unregisterAll() then registers each one (electron/main.ts:110-118) and writes settings.json even when some fail. The failed action then has no shortcut at all, not even its old one, and the failed combo is persisted, so it fails again on every launch. The renderer still sets config.shortcuts to the draft.
- **Verifier:** Popup.tsx:21 reads config() once on mount, so the hint is stale after a rebind. main.ts:205-209 and 110-118 call unregisterAll(), register each, set shortcuts=next, and write settings.json even when some registrations fail. The failed action loses its old binding and the failure is re-persisted and re-hit on every launch. App.tsx:468 still sets config to the draft. Reachable with a combo owned by another app.
- **Test (e2e-electron):** e2e-electron: rebind capture to a combo already held by another app, Save, and assert a clear error plus that the previous binding still works; relaunch and assert the same. Popup component test: dispatch a config-changed event and assert the hint updates.

### REN-25

**Every transcript delta re-renders the whole App and re-sends the full history through IPC to the pop-up** · low · plausible · `apps/desktop/src/App.tsx:427`

- **Status:** Open
- **What happens:** The popup-state effect depends on transcript, so each partial delta (several per second during speech) triggers popupState with the full history (up to 10 answers), the walk step and answer. Main runs JSON.stringify for the length check, structured-clones it to the pop-up, and the pop-up re-parses and re-renders every history Markdown block. The main window also rebuilds up to 200 transcript buttons plus the 'Earlier answers' Markdown on every delta. On a long session with large history this is hundreds of KB per second of IPC and avoidable render work, risking UI jank while listening.
- **Verifier:** The popup-state effect depends on transcript (427), so every delta triggers JSON.stringify and a structured clone of the full history, plus a pop-up re-render. This is wasteful, but an 80 KB payload several times a second is sub-millisecond IPC on a Mac, and no jank is demonstrated. The fix is easy (send history on change only), but the impact is unproven.
- **Test (performance):** Profile (React Profiler plus an IPC byte counter in a dev build): feed 10 deltas per second for 60 s with 10 x 8 KB history and assert popupState bytes/s and App render time stay under a budget. Fix by sending history only when it changes.

### REN-26

**Resume size limits drift (UI '10 MB', API 8,000,000 bytes) and the 15 s default fetch timeout also covers upload plus parsing** · low · confirmed · `apps/desktop/src/App.tsx:467`

- **Status:** Fixed (9ada226)
- **What happens:** Desktop rejects only above 10 MiB with 'Resume must be under 10 MB.' The API multer limit is 8,000,000 bytes (apps/api/src/index.ts:143), so an 8-10 MiB PDF passes the check and fails with 'File exceeds upload limits'. request() gives non-streaming calls AbortSignal.timeout(15000), covering upload and server-side PDF/DOCX parsing, so a 5-8 MB file on a slow uplink aborts with 'The operation was aborted due to timeout'. The facts textarea maxLength (40,000) is stricter than the API (50,000) and the import path, which can return up to 50,000. Harmless, but the constants are unpinned.
- **Verifier:** The desktop limit is 10 MiB (App.tsx:467) and the multer limit is 8,000,000 bytes (index.ts:143), so an 8-10 MB file gets 'File exceeds upload limits'. request() applies AbortSignal.timeout(15000) to the FormData upload plus PDF parsing. Textarea maxLength 40000 versus 50000 server limit is harmless. Cosmetic contract drift.
- **Test (integration):** scripts/smoke.mjs: POST /profile/import with 8,000,001 bytes and assert the 400 text. Add a desktop unit test pinning MAX_RESUME_BYTES to the API constant, and a stubbed slow fetch test that the import uses a longer timeout.

### REN-27

**The saved OpenAI key survives sign-out, so the next account on the same Mac silently uses the previous user's key** · low · confirmed · `apps/desktop/src/App.tsx:441`

- **Status:** Open
- **What happens:** signout() clears context but not openai-key.enc. hasKey stays true (line 39), so a different Google account signing in on this Mac never sees the 'Add your OpenAI API key' panel, and their answers and transcription are billed to user A's key. Preferences does offer 'Remove key', but sign-out is labelled 'clear context' and gives no warning.
- **Verifier:** main.ts:177-182 signout removes only credentials.enc. openai-key.enc stays, hasKey stays true, and needsKey is false for the next account, so it silently uses the stored key. The key is Mac-scoped and encrypted per OS user, and Preferences has Remove key, so whether this is a defect is a product decision. It only matters on a shared or multi-account Mac.
- **Test (integration):** apps/desktop/tests/app.test.tsx: set a key, sign out, sign in as a different user, and assert either the key panel appears or a notice names the stored key. Decide the intended behaviour first.

### REN-28

**Auto questions semantics: the capture shortcut forces Auto on (even when it was turned off), and ticking Auto later answers old, unanswered speech** · low · confirmed · `apps/desktop/src/App.tsx:401`

- **Status:** Open
- **What happens:** (a) The user unticks 'Auto questions', then presses the capture shortcut. setAutomatic(true) runs on every press, including the press that stops listening, so the checkbox is overridden. (b) With Auto off, listening continues and answeredId stays at its value from when the listen started. Ticking Auto afterwards makes heardSince() return the last 8 fragments of old speech, so after 1.8 s the app answers something said minutes ago. If answeredId has aged out of the 200-item transcript cap, findIndex returns -1 and the same happens.
- **Verifier:** (a) The capture action runs setAutomatic(true) on every press, including the stopping press, overriding an unticked Auto. (b) answeredId is set only at listen start and when auto fires, so ticking Auto later makes heardSince return the last 8 old fragments. findIndex -1 gives the same result once the id has aged out. Additional issue: the manual 'answer' action never updates answeredId, so with Auto on it answers once manually and then auto-answers the same speech again after generating flips false.
- **Test (unit):** apps/desktop/tests/core.test.ts: heardSince with answeredId absent from a 200-item list returns old speech. Add a rule that enabling Auto sets answeredId to the latest transcript id, and a fake-timer test that toggling Auto on does not answer prior speech.

### REN-29

**mic-off relisten flag can stay set when the microphone was already off, causing a surprise capture start later** · low · plausible · `apps/desktop/src/App.tsx:421`

- **Status:** Open
- **What happens:** The pop-up 'Turn off mic' button is clicked twice, or a stale pop-up banner is clicked after the mic was already off. The second event sets relisten.current=true (captureStatus may still read non-idle in its closure) and then setMic(false), which is a no-op, so the [mic] effect (line 396) never consumes the flag. Later the user ticks the microphone box and unticks it while idle. The effect fires with relisten still true and starts capture (screen grab plus WebSocket) without any capture request.
- **Verifier:** The mechanism is real: the second 'mic-off' event while captureStatus is still non-idle in the closure sets relisten=true, setMic(false) is a no-op, and the [mic] effect never consumes the flag. A later tick and untick of the mic checkbox would start capture. It needs a rapid double click on the pop-up button followed by a specific later sequence. Very rare.
- **Test (integration):** apps/desktop/tests/app.test.tsx: dispatch the 'mic-off' event twice while mic is true and capture live; then toggle mic on and off while idle and assert capture is not started.

### REN-30

**WebSocket start uses tokenRef without the 401-refresh path, but access tokens live only 10 minutes** · low · plausible · `apps/desktop/src/capture.ts:51`

- **Status:** Open
- **What happens:** Desktop access tokens expire after 10 minutes (database/migrations/001_ctrue.sql:21) and are refreshed only when a REST call returns 401 (App.tsx:122). The WS 'start' message sends tokenRef.current once, and the server authenticates it once (apps/api/src/index.ts:218). If the token expired in the up-to-5 s gap before the next heartbeat refreshes it (or after a long pause with an 'active' ref), the WS start fails with 'Sign in again'. capture() then pauses the session and shows an error, although a refresh would have fixed it. The message does not explain how to recover.
- **Verifier:** The WS start uses tokenRef without a refresh path (capture.ts:51), and the access TTL is 10 minutes (001:21). While a session is active the 5 s heartbeat refreshes on 401, so the exposure window is at most about 5 s per 10 minutes, or right after wake before the first heartbeat. A failure shows 'Sign in again' and pauses the session, and a retry works. Small and rare.
- **Test (integration):** scripts/test-database.mjs variant with a short access TTL: expire the desktop token, start /transcription with it and assert 401-style failure. In the renderer test, assert startAudio is given a freshly validated token (a cheap /account call first) or retries once after refresh.

### REN-31

**capture.ts lifecycle (abort during connect, server error before and after ready, track ended, backpressure, bad provider JSON) has no automated test** · low · confirmed · `apps/desktop/src/capture.ts:13`

- **Status:** Fixed (8e96f4c) — listening path covered end to end in e2e/desktop.spec.ts; abort and backpressure branches still untested
- **What happens:** Only encodePCM16 is tested. startAudio has many failure branches: abort while getUserMedia or addModule is pending, reject plus onError both firing on a server 'error' message (App.tsx:270 relies on stopCapture aborting the controller so the catch stays silent), ws.onclose before ready, track 'ended' for the mic, bufferedAmount over 512000, sample-rate change, non-JSON message. A regression in the ordering of reject, onError and stop would double-report errors, leave captureStatus on 'live', skip the session pause, or leak a running AudioContext and WebSocket. Today this can only be exercised by hand on a Mac.
- **Verifier:** No test imports capture.ts or startAudio (grep of all test files). The failure ordering is real: the server-error path relies on onError calling stopCapture(), which aborts the controller synchronously, before the reject continuation reaches App.capture's catch (262-298). This is a genuine test gap, but it is a gap and not a demonstrated defect, so low. The REN-9 mismatch is the kind of thing such a test would catch.
- **Test (unit):** apps/desktop/tests/capture.test.ts (node:test): inject fakes for WebSocket, AudioContext, AudioWorkletNode and MediaStream. Cover: abort before ready leaves no socket, a server error after ready calls onError exactly once and closes everything, a mic track ending calls onError once, bufferedAmount 512001 stops capture, a missing system audio track throws.

### REN-32

**Renderer-to-API contract constants are duplicated and unpinned (images, sizes, languages, step schema, SSE and WS shapes)** · low · plausible · `apps/desktop/src/steps.ts:2`

- **Status:** Open
- **What happens:** The renderer hardcodes: 4 images (shots.slice(-3)+1), compact 1920 px and 0.7 JPEG against the API's 4 MB per image and 5 MB body, question 12,000 versus API 16,000, context slice(-16000) versus 30,000, resumeContext slice(-24000) versus 30,000, LANGUAGES versus apps/api/src/core.ts:127, the WalkStep type versus toWalkStep, SSE events token/step/done/error, and the WS start/audio/ready/partial/final/error shapes. scripts/smoke.mjs checks only the server side of the image counts. Changing any one side (for example a new language or step field, or the API dropping to 3 images) breaks the app silently, because nothing imports both. resumeContext also keeps the tail of the JSON, so for long walkthroughs the resumed context begins mid-object and drops the summary.
- **Verifier:** There is no current drift. LANGUAGES, WalkStep and the 4-image limit all match, and where client limits differ from server limits the client is stricter (12000 vs 16000, 16000 vs 30000, 24000 vs 30000). The finding is a missing-contract-test risk. The one concrete defect is resumeContext slicing the JSON tail (steps.ts:33), which starts mid-object, but only when the JSON exceeds 24k chars on a retry. Medium is overstated.
- **Test (integration):** scripts/smoke.mjs: run the real desktop helpers against the demo API. For every LANGUAGES entry run a walkthrough request, and check that each streamed step passes a shared WalkStep validator (the desktop type and toWalkStep). Also send four 1920 px JPEGs plus a 16,000-char context and assert 200. A unit test should assert resumeContext output parses as valid JSON or is truncated at a step boundary.

### SEC-1

**Website sends no CSP, frame-ancestors, nosniff or referrer policy, yet exposes a bearer JWT to page JS** · low · plausible · `apps/web/next.config.ts:2`

- **Status:** Open — confirmed live by npm run probe:production
- **What happens:** next.config.ts only sets poweredByHeader:false and there is no vercel.json or headers(). /dashboard calls /api/auth/token and holds a 15-minute API JWT in module memory (lib/client.ts:6-19). Any future XSS, such as a markdown regression or a compromised dependency (next, react and typescript are 'latest'), can steal that token. The page can also be framed by any origin, so the 'Connect desktop' and 'Delete profile' buttons are clickjackable and the ctrue:// launch can be triggered in a hidden iframe. This also contradicts the project's own web security rule (always ship a production CSP).
- **Verifier:** Factually true. next.config.ts sets only poweredByHeader:false, there is no vercel.json or headers(), and proxy.ts matches only /dashboard. The site ships no CSP, frame-ancestors or referrer policy. But no exploit exists today. markdown.tsx builds React elements and never injects HTML, and I found no dangerouslySetInnerHTML use. The clickjacking claim is largely blunted because @neondatabase/auth sets session cookies SameSite=Lax by default (server-pZf5ArnA.mjs lines 352, 621, 925), so a cross-site iframe loads /dashboard signed out and redirects to /login. Only a same-site sibling subdomain could frame it with cookies. This is a defence-in-depth gap, not a medium finding.
- **Test (security):** Add a release-time script that runs `next start` and asserts that GET /dashboard and /login return content-security-policy (script-src without unsafe-inline, plus frame-ancestors 'none'), x-content-type-options: nosniff, and referrer-policy. Run it from check.yml after build. Use Playwright to confirm /dashboard still hydrates under the CSP.

### SEC-2

**Catch-all /api/auth proxy exposes every Neon Auth endpoint, including email/password sign-up, though the UI is Google-only** · low · plausible · `apps/web/app/api/auth/[...path]/route.ts:5`

- **Status:** Open
- **What happens:** auth.handler() proxies any path to the Neon Auth upstream (handleAuthRequest(baseUrl, request, path)). VERIFICATION.md line 9 records that 'email sign-up through the website's /api/auth route' worked on the live project, and NEON-MIGRATION.md still describes email/password. If that provider is still enabled in the Neon console, anyone can POST /api/auth/sign-up/email with a victim's address. The result is an unverified account that gets an API JWT and can use the handoff and profile APIs. If the victim later signs in with Google using the same email and the accounts are linked, the attacker's password remains valid (pre-account-takeover). Only the Google button is shown, so nobody would notice.
- **Verifier:** route.ts does proxy every path via auth.handler(), and VERIFICATION.md:9 records that email sign-up worked on the live project. The repo cannot show whether Neon's email/password provider has been turned off (neon.ts only sets auth:true). The proxy is not the cause. The Neon Auth base URL is public (it is committed in render.yaml and must be reachable for the JWKS), and the proxy forwards the client's headers. So an attacker could hit the upstream directly, and a route.ts allowlist would not close the hole. The real fix is switching the provider off in the Neon console. The pre-account-takeover step also depends on Neon/better-auth account-linking behaviour that I could not confirm. Real, but conditional on console state and low severity.
- **Test (security):** Post-deploy script scripts/verify-auth-surface.mjs: POST https://<site>/api/auth/sign-up/email and /sign-in/email with a throwaway address and expect a 4xx, plus a manual check in the Neon console that email/password is off. Add a unit test on route.ts that only whitelisted paths (get-session, token, sign-in/social, callback/*, sign-out) are forwarded.

### SEC-3

**Desktop tokens ignore Neon account state and are renewed forever; there is no revoke-all or account-deletion path despite the privacy promise** · low · plausible · `apps/api/src/index.ts:64`

- **Status:** Open
- **What happens:** authenticate() resolves desktop tokens only from desktop_tokens (line 64) and never re-checks that the Neon user still exists or is allowed. desktop_token_rotate resets refresh_expires to now()+30 days on every rotation (migration 001 line 86), so a desktop used at least monthly stays valid indefinitely. If the operator deletes or bans the user in Neon after a privacy request, the accounts row (resume facts), sessions and any desktop credential survive. The old desktop keeps working and keeps refreshing. The website has no 'sign out all devices', and each Connect desktop adds another row. privacy/page.tsx lines 45-50 promise deletion on request, but no endpoint or job implements it.
- **Verifier:** The code facts hold. authenticate() resolves opaque tokens only from desktop_tokens (index.ts:64) and never checks Neon. Migration 001:86 resets refresh_expires to 30 days on every rotation. accounts has no link to Neon's user table, so deleting a Neon user leaves the rows. No delete-account endpoint or sign-out-all route exists. But the privacy page (lines 45-50) promises deletion by contacting the operator, i.e. a manual process. desktop_tokens and sessions are ON DELETE CASCADE from accounts, so deleting the accounts row cascades and revokes every desktop token at once. The gap is an operator runbook one: delete the Neon user and also run delete from accounts. Non-owner users spend their own OpenAI key, so a surviving credential costs little. Low.
- **Test (integration):** In scripts/test-database.mjs add a case: issue desktop tokens for user-live, run the chosen 'delete account' routine (new DELETE /account or a SQL function cascading accounts, sessions and desktop_tokens), then assert the old accessToken and refreshToken return 401 and the profile is gone. Add a manual runbook step to the release checklist.

### SEC-4

**ctrue://auth link signs the desktop into any account without confirmation (login CSRF)** · low · plausible · `apps/desktop/electron/main.ts:121`

- **Status:** Open
- **What happens:** handleLink (lines 74-84) validates only the shape of the link (parseHandoff), then redeems and stores the tokens, replacing the current sign-in. Any web page the user visits can run location='ctrue://auth?code=<attacker's own freshly issued code>' and the installed app silently becomes the attacker's account. The victim's later facts, usage records and sessions attach to the attacker's account, and the attacker controls the profile facts injected into the victim's answers. The 60-second, single-use code limits the window but not the substitution. The web side (dashboard line 28) has no matching nonce or state check.
- **Verifier:** handleLink (main.ts:74-84) validates only the link's shape, then redeems and replaces the stored tokens. The second-instance and open-url handlers (main.ts:121-122) call it with no confirmation, and the dashboard sends no state or nonce (page.tsx:28). That is a classic login-CSRF. The mitigations are real. The attacker's code lasts 60 seconds, is single-use and is rate limited to 6/min per user, so it must be generated just in time for each victim. The browser also shows its own 'open this app?' prompt for ctrue://. The attacker gains little: the victim's saved resume facts would go to the attacker's account, and the attacker's facts would be injected into the victim's answers. Low.
- **Test (manual-device):** Manual: while signed in as A, open an HTML page that navigates to ctrue://auth?code=<code issued for B> and expect a confirmation dialog naming the target account; today it switches silently. Automatable part: after adding a confirm step, an e2e-electron test that handleLink does not call /auth/redeem until acknowledged.

### WEB-2

**Dashboard shows a sawtooth 'remaining' countdown in free (METERING=false) mode** · low · confirmed · `apps/web/app/dashboard/page.tsx:32`

- **Status:** Open
- **What happens:** In production the balance never changes: migration 002 skips the charge, so /account and every heartbeat return remainingSeconds=600 (the trial seed). Line 32 subtracts the local age (0 to 15 s) from it and heartbeats reset the age every 5 s, so the panel (line 38) shows 10:00, 9:59 ... 9:55 and then jumps back to 10:00, labelled 'remaining'. The copy 'Usage updates from the server' implies a metered allowance that does not exist. The start button's metered guard is correct, but the display ignores account.metered.
- **Verifier:** Line 32 computes remaining = (active.remainingSeconds ?? account.balanceSeconds) - min(age,15) while running. updatedAt resets on every applySession, i.e. each 5 s heartbeat. With METERING=false, migration 002 never charges (charge is 0), so remainingSeconds stays at the trial seed and the label shows a countdown of up to about 5 s that snaps back to the full value. The 'remaining' text ignores account.metered, although the start button and the Generate button honour it. A display-only wart.
- **Test (e2e-browser):** Playwright with page.route mocks: /account returns {balanceSeconds:600,metered:false} and the heartbeat returns remainingSeconds 600. Sample the 'remaining' text for 12 s and assert that it is hidden, or at least never decreasing.

### WEB-3

**Sign out is blocked whenever ending the session fails (API down, 429, 404, token fetch failure)** · low · confirmed · `apps/web/app/dashboard/page.tsx:35`

- **Status:** Fixed (9ada226) — needs a signed-in browser; device checklist step 30
- **What happens:** The Sign out handler awaits request('/sessions/:id/end') before authClient.signOut(), inside perform(), so any throw aborts the whole sign-out. With an active or paused session and the Render API restarting or deploying (autoDeploy:true), rate-limited (429), or /api/auth/token returning non-OK (request throws 'Your session expired'), clicking Sign out only shows an error banner. The user stays signed in with a live Neon cookie on a possibly shared machine and cannot sign out until the API recovers.
- **Verifier:** The sign-out handler (page.tsx:35) awaits request('/sessions/:id/end') inside perform() before authClient.signOut(). Any throw, including a fetch failure, 429, 404, or request()'s own 'Your session expired' when bearer() returns null, lands in perform's catch, so sign-out never runs. The condition is narrow. It needs an active or paused session held by this tab (activeRef) and a failing /end. Reloading the page clears activeRef, after which Sign out works, and the user can also clear cookies. That makes it a nuisance rather than a lock-out, so medium is overstated.
- **Test (e2e-browser):** Playwright with page.route('**/sessions/*/end', r => r.abort()) and a started demo session. Click Sign out and expect authClient sign-out (POST /api/auth/sign-out) to still fire and the page to land on /login. Today it fails. Spec location: apps/web/e2e/signout.spec.ts.

### WEB-4

**Web dashboard adopts and then ends the same session the desktop is using, killing live transcription** · low · confirmed · `apps/web/app/dashboard/page.tsx:30`

- **Status:** Open
- **What happens:** POST /sessions is idempotent. Migration 002 lines 22-27 return the user's existing active session instead of creating one. The user is mid-call with the desktop listening (session S active). They open the dashboard and click Generate answer or Start session, so the web receives S and stores it in activeRef. Closing the tab (pagehide stop() at line 25), unmount, End session, Pause, or Sign out (line 35) then ends or pauses S. The desktop's WS lease check (apps/api/src/index.ts:211) fails with 'Session paused, expired, or exhausted' and answers return 409 during the call. Two dashboard tabs interfere the same way.
- **Verifier:** The mechanism is exactly as stated. Migration 002 lines 22-27 return the existing active session for 'start', and smoke.mjs:41 already asserts that a second POST /sessions returns the same id. The dashboard stores whatever comes back in activeRef. pagehide, unmount (page.tsx:25), End, Pause and Sign out then end or pause it. index.ts:211 polls active() every second and calls fail('Session paused, expired, or exhausted'), so the desktop WebSocket closes. The trigger is deliberate: the user must click Start or Generate in the dashboard while a desktop session is live. The dashboard load never adopts a session by itself. The fine print also says to start the desktop session in the desktop app. Impact when it happens is real, but the likelihood is low.
- **Test (integration):** Add to scripts/test-database.mjs: start a session with the desktop token, call POST /sessions with the browser JWT and assert the same id comes back. Then POST /sessions/:id/end as the browser and assert the desktop session is ended, to document the hazard. The fix may be a web-owned flag on the session. In the browser, a Playwright test with a pre-existing active session checks that the dashboard's pagehide does not call /end for a session it did not start.

### WEB-5

**bearer() cache is never invalidated on a 401 and trusts the client clock** · low · plausible · `apps/web/lib/client.ts:10`

- **Status:** Open
- **What happens:** A token is reused until `exp*1000 - Date.now() <= 60_000`, using the browser clock. With a client clock slow by 5 or more minutes, an already-expired Neon JWT keeps being served from `cached` while the API returns 401 'Sign in again'. The 401 path in request() (lines 31-32) never clears cached, so every call, heartbeat included, fails until the clock catches up or the page is reloaded. Concurrent callers with a stale cache each hit /api/auth/token because there is no in-flight dedupe. Non-OK or transient responses from the token route are reported as 'Your session expired' (lines 14-15, 25).
- **Verifier:** The code matches. bearer() (client.ts:10) trusts Date.now() against the JWT exp, and request() never clears the cache on 401. A browser clock more than about a minute behind serves an expired token for (skew - 60 s) after real expiry, and every call returns 401 'Sign in again' until the local clock catches up or the page reloads. Concurrent callers each hit /api/auth/token because there is no in-flight dedupe. Any non-OK token response becomes 'Your session expired'. Clocks that skewed are rare on NTP-synced machines, so the severity is low.
- **Test (unit):** Move the cache and expiry decode into a pure lib/bearer.mjs (or run tsx in apps/web tests) and add lib/bearer.test.mjs. With a fake clock and fetch: a token whose exp is already past is refetched; a 401 from the API clears the cache and retries once; malformed JWT payloads are used once and not cached; concurrent calls share one in-flight fetch.
