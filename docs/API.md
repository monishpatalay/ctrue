# Ctrue API v1

API http://localhost:4318, website http://localhost:3000, renderer http://localhost:5173.
JSON errors: {error:string}. Auth: Authorization: Bearer <token>. The website sends a Neon Auth JWT (verified against the Auth URL's JWKS, issuer and audience); the desktop sends its own opaque Ctrue access token.
Development only: explicit DEMO_MODE=true bound to loopback accepts Bearer demo; demo is clearly labeled and never production enabled.

- GET /health => {status,mode,configured:{ai,auth}}
- GET /account => {balanceSeconds,plan,email?}
- POST /sessions {} => {id,status:'active',remainingSeconds,elapsedSeconds}
- POST /sessions/:id/heartbeat {} => same session; interval 5 seconds; lease expiry stops the session clock after 15 seconds.
- POST /sessions/:id/pause {} and /resume {} and /end {} => same session.
- GET /profile => {facts:string}; PUT /profile {facts} => same; DELETE /profile => {facts:''}
- POST /profile/import multipart file PDF/DOCX => {facts:string}; extraction does not verify facts. User edits/approves them.
- POST /answers {sessionId,question,mode:'technical'|'coding'|'behavioral'|'system-design',image?:data URL | images?:data URL[] (up to four consecutive parts of one page),context?:string} => SSE event token data {text}; event done data {}; event error data {error}. fetch streaming supports AbortController cancellation.
- WS /transcription: first message {type:'start',accessToken,sessionId}; then {type:'audio',data:base64 PCM16 mono 24kHz}. Responses {type:'ready'}, {type:'partial',id,text}, {type:'final',id,text}, {type:'error',error}. No provider credentials in renderer.
- POST /auth/handoff {} with a browser JWT (a desktop token gets 403) => {code,expiresIn:60}; POST /auth/redeem {code} => {accessToken,refreshToken}. Redemption mints an independent desktop credential: opaque 256-bit values stored only as SHA-256 hashes, 10-minute access and 30-day refresh expiry. No browser or provider session is cloned. Single-use 256-bit code; hashed lookup, 60s expiry, volatile memory, single API instance. Website opens ctrue://auth?code=...; desktop validates and redeems then encrypts tokens via OS safeStorage.
- POST /auth/refresh {refreshToken} => new {accessToken,refreshToken}; rotation is atomic and the previous pair stops working (401 on reuse or expiry). POST /auth/logout {refreshToken} => {signedOut:true} and revokes that desktop credential. Both are unauthenticated and rate limited per address.

All billable AI paths require an owned active session and positive balance. Credit grants are atomic and idempotent by invoice ID. No transcripts or screenshots persisted by default. Optional history opt-in will require an explicit setting.
