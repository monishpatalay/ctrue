import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { connect } from 'node:net';
import { setTimeout as wait } from 'node:timers/promises';
import { startMockOpenAI } from './mock-openai.mjs';

// API contract and abuse cases against the real API, the disposable PostgreSQL cluster and a local OpenAI stand-in.
// Called by test-database.mjs, which owns the cluster and the JWKS server. Every case runs; failures are listed at the end.
const PORT = 55434, base = `http://127.0.0.1:${PORT}`, KEY = 'sk-test-valid-key-for-ctrue-000000000000';
const SPEECH = Buffer.alloc(9600), SILENCE = Buffer.alloc(9600); // 200 ms of 24 kHz PCM16 each
for (let i = 0; i < SPEECH.length; i += 2) SPEECH.writeInt16LE(3000, i);

export async function contract({ databaseUrl, authBase, token }) {
  const mock = await startMockOpenAI();
  const api = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/index.ts'], {
    env: { ...process.env, ...mock.env, PORT: String(PORT), HOST: '127.0.0.1', DEMO_MODE: 'false', NODE_ENV: 'test', METERING: 'false', TRUST_PROXY: '1', OPENAI_API_KEY: '', DATABASE_URL: databaseUrl, NEON_AUTH_BASE_URL: authBase },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  api.stdout.on('data', chunk => { logs += chunk; });
  api.stderr.on('data', chunk => { logs += chunk; });
  const call = async (path, bearer, body, { method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) => {
    const response = await fetch(base + path, { method, signal: AbortSignal.timeout(10000), body: body === undefined ? undefined : JSON.stringify(body),
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
  it('transcription relays partial and final text, and commits after speech then silence', async () => {
    const who = await user(), socket = new WebSocket(`${base.replace('http', 'ws')}/transcription`), seen = [];
    socket.addEventListener('message', event => seen.push(JSON.parse(event.data)));
    await once(socket, 'open');
    socket.send(JSON.stringify({ type: 'start', accessToken: who.bearer, sessionId: who.session.id, openaiKey: KEY }));
    for (let i = 0; i < 50 && !seen.some(m => m.type === 'ready'); i++) await wait(20);
    assert(seen.some(m => m.type === 'ready'), JSON.stringify(seen));
    for (const chunk of [...Array(5).fill(SPEECH), ...Array(4).fill(SILENCE)]) socket.send(JSON.stringify({ type: 'audio', data: chunk.toString('base64') }));
    for (let i = 0; i < 50 && !seen.some(m => m.type === 'final'); i++) await wait(20);
    assert.deepEqual(seen.filter(m => m.type !== 'ready').map(m => [m.type, m.text]), [['partial', 'What is '], ['final', 'What is a hash map?']]);
    socket.close();
  });
  it('a key the transcription provider refuses is reported as a rejected key', async () => {
    const who = await user(), socket = new WebSocket(`${base.replace('http', 'ws')}/transcription`);
    await once(socket, 'open');
    const error = new Promise(resolve => socket.addEventListener('message', event => { const m = JSON.parse(event.data); if (m.type === 'error') resolve(m.error); }));
    socket.send(JSON.stringify({ type: 'start', accessToken: who.bearer, sessionId: who.session.id, openaiKey: 'sk-invalid-key-for-ctrue-0000000000000' }));
    assert.match(await Promise.race([error, wait(3000, 'timed out')]), /rejected/);
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
  try {
    let ready = false;
    for (let i = 0; i < 50 && !ready; i++) {
      if (api.exitCode !== null) throw new Error(`Contract API exited: ${logs}`);
      ready = await fetch(`${base}/health`).then(r => r.ok, () => false);
      if (!ready) await wait(100);
    }
    assert(ready, `Contract API did not start: ${logs}`);
    for (const { name, fn } of cases) {
      try { await fn(); console.log(`  ✔ ${name}`); }
      catch (error) { failures.push(name); console.log(`  ✖ ${name}\n    ${String(error.message).split('\n').slice(0, 4).join('\n    ')}`); }
    }
  } finally {
    api.kill('SIGTERM');
    if (api.exitCode === null) await once(api, 'exit');
    await mock.close();
  }
  if (failures.length) throw new Error(`${failures.length} of ${cases.length} API contract cases failed`);
  console.log(`API contract: ${cases.length} cases passed against a local OpenAI stand-in.`);
}
