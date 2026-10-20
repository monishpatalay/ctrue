# Ctrue API v1

API http://localhost:4318, website http://localhost:3000, renderer http://localhost:5173.
JSON errors: `{error:string}`. Auth: `Authorization: Bearer <token>`. The website sends a Neon Auth JWT (EdDSA, verified against the Auth URL's JWKS, issuer and audience); the desktop sends its own opaque Ctrue access token (64 hex characters). A token of any other shape is refused without a database query. If the JWKS cannot be fetched or is not a key set, requests get 503, not 401.
Development only: explicit `DEMO_MODE=true` bound to loopback accepts `Bearer demo`; demo is clearly labeled and never production enabled.

Limits: 600 requests a minute per address (before parsing or auth; behind a proxy set `TRUST_PROXY`), 120 a minute per signed-in user, 5 MB JSON bodies. Browsers may call only from `ALLOWED_ORIGINS` or the packaged app (Origin `null`); other origins get 403.

- GET /health => {status, mode, configured:{ai, auth}}
- GET /account => {balanceSeconds, plan, email?, metered}. `plan` is `owner` for the account that uses the server's OpenAI key.
- POST /sessions {} => {id, status:'active', remainingSeconds, elapsedSeconds}; returns the already active session if there is one.
- POST /sessions/:id/heartbeat {} => same session; every 5 seconds. Without one the lease ends after 15 seconds and the session pauses.
- POST /sessions/:id/pause, /resume, /end {} => same session. Another user's session is 404; resuming while another session is active is 409; an ended session stays ended.
- GET /profile => {facts}; PUT /profile {facts ≤ 50,000 characters} => same; DELETE /profile => {facts:''}
- POST /profile/import multipart `file` (PDF or DOCX, ≤ 8,000,000 bytes) => {facts}. Extraction does not verify facts; the user edits and approves them with PUT /profile.
- POST /answers, header `X-OpenAI-Key: sk-…` (required for every plan except `owner`; sent with the request and never stored), body {sessionId, question ≤ 16,000, mode:'technical'|'coding'|'behavioral'|'system-design'|'walkthrough', topic?:'coding'|'system-design', language?:'Python'|'Java'|'C++'|'JavaScript'|'TypeScript'|'Go' (walkthrough coding), image?: data URL | images?: data URL[] (PNG, JPEG or WEBP; up to four consecutive parts of one page), context? ≤ 30,000} => server-sent events: `token` {text}, `step` {walkthrough step} (walkthrough mode), `done` {}, `error` {error}. Needs an active session; one answer per user at a time (409); 12 answers a minute per user. A client that disconnects stops the request to OpenAI.
- WS /transcription: first message {type:'start', accessToken, sessionId, openaiKey?} within 10 seconds, then {type:'audio', data: base64 PCM16 mono 24 kHz, at most 1 second per message}. Responses {type:'ready'}, {type:'partial', id, text}, {type:'final', id, text}, {type:'error', error}. Audio may arrive at live speed with up to a 10-second burst after a network stall; faster audio is refused. A new start from the same user replaces their older connection (closed with code 4001). Turns are committed after speech followed by silence; silence alone is cleared, not transcribed.
- POST /auth/handoff {} with a browser JWT (a desktop token gets 403) => {code, expiresIn:60}; POST /auth/redeem {code} => {accessToken, refreshToken}. Redemption mints an independent desktop credential: opaque 256-bit values stored only as SHA-256 hashes, 10-minute access and 30-day refresh expiry. Single-use 256-bit code, hashed lookup, 60-second expiry, kept in memory (one API instance). The website opens `ctrue://auth?code=…`; the desktop validates and redeems it, then encrypts the tokens with OS safeStorage.
- POST /auth/refresh {refreshToken} => new {accessToken, refreshToken}; rotation is atomic and the previous pair stops working (401 on reuse or expiry, after which the desktop signs out). POST /auth/logout {refreshToken} => {signedOut:true} and revokes that desktop credential. Both are unauthenticated and rate limited per address.

With `METERING=false` (production) sessions track time but never spend or require credits. Transcripts, answers and screenshots are never stored on the server.

Contract tests: `scripts/api-contract.mjs` (run by `npm run test:database`).
