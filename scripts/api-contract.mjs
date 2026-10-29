import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { setTimeout as wait } from 'node:timers/promises';
import { SignJWT } from 'jose';
import WebSocketClient from 'ws';
import { startMockOpenAI } from './mock-openai.mjs';

// API contract and abuse cases against the real API, the disposable PostgreSQL cluster and a local OpenAI stand-in.
// Called by test-database.mjs, which owns the cluster and the JWKS server. Every case runs; failures are listed at the end.
const PORT = 55434, base = `http://127.0.0.1:${PORT}`, KEY = 'sk-test-valid-key-for-ctrue-000000000000';
const SPEECH = Buffer.alloc(9600), SILENCE = Buffer.alloc(9600); // 200 ms of 24 kHz PCM16 each
for (let i = 0; i < SPEECH.length; i += 2) SPEECH.writeInt16LE(3000, i);

// Starts an API process with these settings and waits until it answers.
// A plain PDF with one line of text per page, built by hand so no browser is needed (CI has none).
function manyPages(count, line) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'], kids = [];
  for (let i = 0; i < count; i++) {
    const text = `BT /F1 10 Tf 40 800 Td (${line} Page ${i + 1}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length + 2} 0 R >>`);
    kids.push(`${objects.length} 0 R`);
    objects.push(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${count} >>`;
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, i) => { const at = body.length; body += `${i + 1} 0 obj\n${object}\nendobj\n`; return at; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(at => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
export async function launch(port, env) {
  const api = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/index.ts'], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test', DEMO_MODE: 'false', METERING: 'false', OPENAI_API_KEY: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  api.stdout.on('data', chunk => { logs += chunk; });
  api.stderr.on('data', chunk => { logs += chunk; });
  const stop = async () => { api.kill('SIGTERM'); if (api.exitCode === null) await once(api, 'exit'); };
  for (let i = 0; i < 50; i++) {
    if (api.exitCode !== null) throw new Error(`API exited: ${logs}`);
    if (await fetch(`http://127.0.0.1:${port}/health`).then(r => r.ok, () => false)) return { stop, logs: () => logs, pid: api.pid };
    await wait(100);
  }
  await stop();
  throw new Error(`API did not start: ${logs}`);
}

export async function contract({ databaseUrl, authBase, token, origin, privateKey }) {
  const mock = await startMockOpenAI();
  // A server key is set, as in production: only owner accounts may use it, so cases without a user key must still fail.
  const settings = { ...mock.env, TRUST_PROXY: '1', DATABASE_URL: databaseUrl, NEON_AUTH_BASE_URL: authBase, OPENAI_API_KEY: 'sk-server-owner-key-for-ctrue-contract-0000' };
  const call = async (path, bearer, body, { method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) => {
    const response = await fetch(base + path, { method, signal: AbortSignal.timeout(20000), body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...headers } });
    const text = await response.text();
    let json = null; try { json = JSON.parse(text); } catch { /* SSE or HTML */ }
    return { status: response.status, text, body: json };
  };
  // A signed-in user with an active session; each case uses its own user so per-user limits never interfere.
  let users = 0;
  const user = async () => { const bearer = await token(`contract-${++users}`); const session = (await call('/sessions', bearer, {})).body; return { bearer, session }; };
  const ask = (who, question, extra = {}, headers = { 'X-OpenAI-Key': KEY }) => call('/answers', who.bearer, { sessionId: who.session.id, question, mode: 'technical', ...extra }, { headers });
  const cases = [];
  const it = (name, fn) => cases.push({ name, fn });

  it('an answer streams the provider tokens and ends with done', async () => {
    const answer = await ask(await user(), 'Explain a hash map.');
    assert.equal(answer.status, 200);
    assert.match(answer.text, /event: token\ndata: \{"text":"Hello"\}[\s\S]*event: done/);
  });
  it('a key OpenAI rejects is reported as a rejected key', async () => {
    assert.match((await ask(await user(), 'Hi', {}, { 'X-OpenAI-Key': 'sk-invalid-key-for-ctrue-0000000000000' })).text, /event: error[\s\S]*Your OpenAI API key was rejected/);
  });
  it("OpenAI's own rate limit is reported as the user's OpenAI account limit", async () => {
    assert.match((await ask(await user(), '[mock:429]')).text, /event: error[\s\S]*hit its rate limit/);
  });
  it('an answer cut off at the length limit keeps its text and says so', async () => {
    const text = (await ask(await user(), '[mock:incomplete]')).text;
    assert.match(text, /Hello[\s\S]*cut off at the length limit[\s\S]*event: done/);
  });
  it('a stop for any other reason, a failed response and a truncated stream are errors', async () => {
    const who = await user();
    assert.match((await ask(who, '[mock:filtered]')).text, /event: error[\s\S]*stopped early \(content_filter\)/);
    assert.match((await ask(who, '[mock:failed]')).text, /event: error[\s\S]*upstream exploded/);
    assert.match((await ask(who, '[mock:truncated]')).text, /event: error[\s\S]*ended before the answer finished/);
  });
  it('a walkthrough streams validated steps, and a malformed step stops it keeping the earlier ones', async () => {
    const who = await user(), walk = { mode: 'walkthrough', topic: 'coding', language: 'Python' };
    const good = (await ask(who, 'Two sum', walk)).text;
    assert.equal(good.match(/event: step/g)?.length, 2); assert.match(good, /event: done/);
    const bad = (await ask(who, '[mock:badstep]', walk)).text;
    assert.equal(bad.match(/event: step/g)?.length, 1); assert.match(bad, /event: error[\s\S]*malformed step/);
  });
  it("the API's own answer rate limit is not blamed on the user's OpenAI account (API-6)", async () => {
    const who = await user();
    for (let i = 0; i < 12; i++) await ask(who, 'Quick one');
    const limited = await ask(who, 'One too many');
    assert.equal(limited.status, 429);
    assert.match(limited.body?.error || '', /Too many requests/);
  });
  it('two answers at once for one user: exactly one runs (API-3)', async () => {
    const who = await user();
    const [a, b] = await Promise.all([ask(who, '[mock:slow] first'), ask(who, '[mock:slow] second')]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  });
  it('a client that disconnects before its answer starts does not lock the user out (API-2)', async () => {
    const who = await user();
    const body = JSON.stringify({ sessionId: who.session.id, question: '[mock:slow] abandoned', mode: 'technical' });
    const socket = connect(PORT, '127.0.0.1');
    await once(socket, 'connect');
    socket.end(`POST /answers HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer ${who.bearer}\r\nX-OpenAI-Key: ${KEY}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    socket.destroy();
    await wait(500);
    const next = await ask(who, 'Are you free now?');
    assert.notEqual(next.status, 409, 'the abandoned answer still holds the lock');
    await wait(500);
    assert.equal(mock.state.open, 0, 'the abandoned answer is still streaming from OpenAI on the user\'s key');
  });
  const upload = async (who, name, bytes) => {
    const form = new FormData(); form.set('file', new Blob([bytes]), name);
    const response = await fetch(`${base}/profile/import`, { method: 'POST', body: form, headers: { Authorization: `Bearer ${who.bearer}` }, signal: AbortSignal.timeout(10000) });
    return { status: response.status, body: await response.json() };
  };
  it('pausing the session while an answer streams ends it with an error event, not silence', async () => {
    const who = await user();
    const answer = ask(who, '[mock:slow] long answer');
    await wait(1200);
    await call(`/sessions/${who.session.id}/pause`, who.bearer, {});
    const { text } = await answer;
    assert.match(text, /event: token/);
    assert.match(text, /event: error\ndata: \{"error":"[^"]+"\}\n\n$/, `stream ended without an error event: ...${text.slice(-200)}`);
  });
  it('a huge PDF (1,500 pages, under the size limit) does not freeze the API for other users (API-8)', async () => {
    const pdf = manyPages(1500, 'Experienced engineer building distributed systems.');
    const who = await user(), other = await user();
    const started = performance.now(), importing = upload(who, 'resume.pdf', pdf);
    // While it is parsed, someone else's request and the health check must still answer promptly.
    await wait(300);
    const pings = [];
    for (let i = 0; i < 5; i++) { const t = performance.now(); await call('/account', other.bearer); pings.push(performance.now() - t); await wait(200); }
    const result = await importing, took = performance.now() - started;
    assert(Math.max(...pings) < 1000, `another user waited ${Math.round(Math.max(...pings))} ms while a big PDF was parsed`);
    assert(took < 10_000, `the import took ${Math.round(took)} ms`);
    assert.equal(result.status, 200, JSON.stringify(result).slice(0, 200));
  });
  it('a PDF and a Word resume import as text for review (API-31)', async () => {
    const who = await user();
    assert.deepEqual(await upload(who, 'resume.pdf', readFileSync('e2e/fixtures/resume.pdf')), { status: 200, body: { facts: 'Built a calendar app used by 2,000 students.' } });
    assert.deepEqual(await upload(who, 'resume.docx', readFileSync('e2e/fixtures/resume.docx')), { status: 200, body: { facts: 'Led a team of four to ship a payments API.' } });
  });
  it('uploads that are not a resume, or are too large, are refused with a reason', async () => {
    const who = await user();
    assert.deepEqual(await upload(who, 'notes.txt', Buffer.from('hello')), { status: 400, body: { error: 'Expected PDF or DOCX' } });
    assert.deepEqual(await upload(who, 'resume.pdf', Buffer.from('PK not a pdf')), { status: 400, body: { error: 'Expected PDF or DOCX' } });
    assert.deepEqual(await upload(who, 'resume.pdf', Buffer.from('%PDF-1.4 broken')), { status: 400, body: { error: 'Could not extract this document' } });
    assert.deepEqual(await upload(who, 'resume.pdf', Buffer.alloc(8_000_001)), { status: 400, body: { error: 'File exceeds upload limits' } });
  });
  it('transcription relays when speech starts and stops, then its partial and final text', async () => {
    const who = await user(), socket = new WebSocket(`${base.replace('http', 'ws')}/transcription`), seen = [];
    socket.addEventListener('message', event => seen.push(JSON.parse(event.data)));
    await once(socket, 'open');
    socket.send(JSON.stringify({ type: 'start', accessToken: who.bearer, sessionId: who.session.id, openaiKey: KEY }));
    for (let i = 0; i < 50 && !seen.some(m => m.type === 'ready'); i++) await wait(20);
    assert(seen.some(m => m.type === 'ready'), JSON.stringify(seen));
    for (const chunk of [...Array(5).fill(SPEECH), ...Array(4).fill(SILENCE)]) socket.send(JSON.stringify({ type: 'audio', data: chunk.toString('base64') }));
    for (let i = 0; i < 50 && !seen.some(m => m.type === 'final'); i++) await wait(20);
    assert.deepEqual(seen.filter(m => m.type !== 'ready').map(m => [m.type, m.text]), [['speaking', undefined], ['quiet', undefined], ['partial', 'What is '], ['final', 'What is a hash map?']]);
    // The speech ended 600 ms (the turn-detection silence) to 800 ms (all the silence sent) before OpenAI said so.
    const { ago } = seen.find(m => m.type === 'quiet');
    assert(ago >= 600 && ago <= 800, `ago ${ago}`);
    socket.close();
  });
  it('listening without your own key is refused: it never falls back to the server owner\'s key', async () => {
    const who = await user(), socket = new WebSocket(`${base.replace('http', 'ws')}/transcription`);
    await once(socket, 'open');
    const reply = new Promise(resolve => socket.addEventListener('message', event => { const m = JSON.parse(event.data); if (m.type === 'error' || m.type === 'ready') resolve(m); }));
    socket.send(JSON.stringify({ type: 'start', accessToken: who.bearer, sessionId: who.session.id }));
    const message = await Promise.race([reply, wait(3000, { type: 'timeout' })]);
    assert.equal(message.type, 'error', JSON.stringify(message));
    assert.match(message.error, /Add your OpenAI API key/);
    socket.close();
  });
  it('a key the transcription provider refuses is reported as a rejected key', async () => {
    const who = await user(), socket = new WebSocket(`${base.replace('http', 'ws')}/transcription`);
    await once(socket, 'open');
    const error = new Promise(resolve => socket.addEventListener('message', event => { const m = JSON.parse(event.data); if (m.type === 'error') resolve(m.error); }));
    socket.send(JSON.stringify({ type: 'start', accessToken: who.bearer, sessionId: who.session.id, openaiKey: 'sk-invalid-key-for-ctrue-0000000000000' }));
    assert.match(await Promise.race([error, wait(3000, 'timed out')]), /rejected/);
  });
  it('forged, expired or misaddressed browser tokens are refused', async () => {
    const sign = ({ subject = 'contract-forger', issuer = origin, expires = '15m', alg = 'EdDSA', key = privateKey } = {}) => {
      const jwt = new SignJWT({}).setProtectedHeader({ alg, kid: 'test' }).setIssuer(issuer).setAudience(origin).setExpirationTime(expires);
      return (subject ? jwt.setSubject(subject) : jwt).sign(key);
    };
    const part = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${part({ alg: 'none' })}.${part({ sub: 'contract-forger', iss: origin, aud: origin, exp: Math.floor(Date.now() / 1000) + 600 })}.`;
    const forged = [['alg none', unsigned], ['another issuer', await sign({ issuer: 'https://evil.example' })], ['expired', await sign({ expires: Math.floor(Date.now() / 1000) - 60 })],
      ['no subject', await sign({ subject: '' })], ['HS256 with a guessable secret', await sign({ alg: 'HS256', key: new TextEncoder().encode('a shared secret anyone could guess') })]];
    for (const [name, bearer] of forged) assert.equal((await call('/account', bearer)).status, 401, name);
  });
  it('a sign-in key service that is down or returns junk is an outage (503), not a bad login (API-12)', async () => {
    for (const [name, keys] of [['junk instead of a key set', `${origin}/broken/`], ['unreachable', 'http://127.0.0.1:9/neondb/auth/']]) {
      const other = await launch(55435, { ...settings, NEON_AUTH_BASE_URL: keys });
      try { assert.equal((await fetch('http://127.0.0.1:55435/account', { headers: { Authorization: `Bearer ${await token('contract-jwks')}` } })).status, 503, name); }
      finally { await other.stop(); }
    }
  });
  it('two refreshes racing with one refresh token: exactly one wins', async () => {
    const { code } = (await call('/auth/handoff', await token('contract-refresh'), {})).body;
    const pair = (await call('/auth/redeem', null, { code })).body;
    const statuses = await Promise.all([1, 2].map(() => call('/auth/refresh', null, { refreshToken: pair.refreshToken }).then(r => r.status)));
    assert.deepEqual(statuses.sort(), [200, 401]);
  });
  it("one user cannot touch another user's session; one active session; an ended session stays ended", async () => {
    const a = await user(), b = await user();
    assert.equal((await call(`/sessions/${a.session.id}/pause`, b.bearer, {})).status, 404);
    await call(`/sessions/${a.session.id}/pause`, a.bearer, {});
    const second = (await call('/sessions', a.bearer, {})).body;
    assert.equal((await call(`/sessions/${a.session.id}/resume`, a.bearer, {})).status, 409);
    await call(`/sessions/${second.id}/end`, a.bearer, {});
    assert.equal((await call(`/sessions/${second.id}/resume`, a.bearer, {})).body.status, 'ended');
  });
  // A transcription socket with optional Origin, recording what arrives and how it closes.
  const listen = async (who, from) => {
    const socket = new WebSocketClient(`${base.replace('http', 'ws')}/transcription`, from ? { origin: from } : {}), seen = [];
    let closed = null;
    socket.on('message', raw => seen.push(JSON.parse(raw.toString())));
    socket.on('close', code => { closed = code; });
    await once(socket, 'open');
    const until = async test => { for (let i = 0; i < 150 && !test(); i++) await wait(20); assert(test(), JSON.stringify({ seen, closed })); };
    return { socket, seen, closed: () => closed, until, send: value => socket.send(JSON.stringify(value)),
      start: () => socket.send(JSON.stringify({ type: 'start', accessToken: who.bearer, sessionId: who.session.id, openaiKey: KEY })) };
  };
  const ready = async who => { const t = await listen(who); t.start(); await t.until(() => t.seen.some(m => m.type === 'ready')); return t; };
  const refused = async (t, reason) => { await t.until(() => t.closed() !== null); assert.match(t.seen.find(m => m.type === 'error')?.error || '', reason); };
  it('transcription refuses other websites, early audio and malformed or faster-than-live audio', async () => {
    const evil = await listen(await user(), 'https://evil.example');
    await evil.until(() => evil.closed() === 1008);
    const early = await listen(await user()); early.start(); early.send({ type: 'audio', data: SPEECH.toString('base64') });
    await refused(early, /Wait for ready/);
    let t = await ready(await user()); t.send({ type: 'audio', data: '@@@@' }); await refused(t, /Invalid base64/);
    t = await ready(await user()); t.send({ type: 'audio', data: Buffer.alloc(3).toString('base64') }); await refused(t, /at most one second/);
    t = await ready(await user()); t.send({ type: 'audio', data: Buffer.alloc(48002).toString('base64') }); await refused(t, /at most one second/);
    t = await ready(await user()); for (let i = 0; i < 11; i++) t.send({ type: 'audio', data: Buffer.alloc(48000).toString('base64') }); await refused(t, /exceeds realtime/);
  });
  it('a newer transcription replaces an older one for the same user (API-13)', async () => {
    const who = await user(), first = await ready(who), second = await ready(who);
    await first.until(() => first.closed() === 4001);
    assert.equal(second.closed(), null);
    second.socket.close();
  });
  it('many signed-in users behind one shared address (an office, a proxy) are not throttled', async () => {
    const people = await Promise.all(Array.from({ length: 10 }, () => user()));
    const statuses = [];
    for (let round = 0; round < 13; round++) statuses.push(...await Promise.all(people.flatMap(who => Array.from({ length: 5 }, () => call('/account', who.bearer, undefined, { headers: { 'X-Forwarded-For': '198.51.100.50' } }).then(r => r.status)))));
    assert.deepEqual([...new Set(statuses)], [200], `${statuses.filter(s => s !== 200).length} of ${statuses.length} throttled`);
  });
  // Last: it fills this address's request budget.
  it('a flood of bad tokens from one address is throttled without slowing other users (API-1)', async () => {
    const legit = await user();
    const statuses = [];
    for (let round = 0; round < 14; round++) statuses.push(...await Promise.all(Array.from({ length: 50 }, (_, i) => call('/account', 'f'.repeat(63) + (i % 10), undefined, { headers: { 'X-Forwarded-For': '203.0.113.9' } }).then(r => r.status))));
    assert(statuses.includes(429), `no request was throttled: ${[...new Set(statuses)]}`);
    const started = performance.now(), own = await call('/account', legit.bearer, undefined, { headers: { 'X-Forwarded-For': '198.51.100.7' } });
    assert.equal(own.status, 200);
    assert(performance.now() - started < 1000, 'a legitimate request waited behind the flood');
  });

  const failures = [];
  const api = await launch(PORT, settings);
  try {
    for (const { name, fn } of cases) {
      try { await fn(); console.log(`  ✔ ${name}`); }
      catch (error) { failures.push(name); console.log(`  ✖ ${name}\n    ${String(error.message).split('\n').slice(0, 4).join('\n    ')}`); }
    }
    // Every case above ran, including refused keys: the server's own log must hold no part of any OpenAI key (API-25).
    const leaked = api.logs().match(/sk-[A-Za-z0-9_*-]{2,}/g);
    if (leaked) { failures.push('server logs hold part of an OpenAI key (API-25)'); console.log(`  ✖ server logs hold part of an OpenAI key (API-25): ${leaked.length} match(es)`); }
    else console.log('  ✔ server logs hold no part of any OpenAI key (API-25)');
  } finally {
    await api.stop();
    await mock.close();
  }
  if (failures.length) throw new Error(`${failures.length} of ${cases.length} API contract cases failed`);
  console.log(`API contract: ${cases.length} cases passed against a local OpenAI stand-in.`);
}
