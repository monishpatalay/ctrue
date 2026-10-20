import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as wait } from 'node:timers/promises';

const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const api = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/index.ts'], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DEMO_MODE: 'true', NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
api.stdout.on('data', chunk => { logs += chunk; });
api.stderr.on('data', chunk => { logs += chunk; });
const base = `http://127.0.0.1:${port}`;
async function request(path, method = 'GET', body, auth = true) {
  return fetch(base + path, {
    method, signal: AbortSignal.timeout(5000),
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer demo' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
let socket;
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    if (api.exitCode !== null) throw new Error(logs);
    try { ready = (await fetch(base + '/health')).ok; } catch { /* Retry only local startup. */ }
    if (ready) break;
    await wait(100);
  }
  assert(ready, `API startup failed: ${logs}`);
  assert.equal((await (await request('/health', 'GET', undefined, false)).json()).mode, 'demo');
  assert.equal((await request('/account', 'GET', undefined, false)).ok, false);
  // Browsers may call the API only from the website, the dev renderer or the packaged app (Origin "null").
  const from = origin => fetch(base + '/health', { headers: { Origin: origin } });
  const denied = await from('https://evil.example');
  assert.deepEqual([denied.status, await denied.json()], [403, { error: 'Origin denied' }]);
  assert.equal((await from('http://localhost:3000')).headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.equal((await from('null')).status, 200);
  const session = await (await request('/sessions', 'POST', {})).json();
  assert.equal(session.status, 'active');
  assert.equal((await (await request('/sessions', 'POST', {})).json()).id, session.id);
  const answer = await request('/answers', 'POST', { sessionId: session.id, question: 'Explain a hash map.', mode: 'technical', context: '' });
  const stream = await answer.text();
  assert.equal(answer.headers.get('content-type'), 'text/event-stream');
  assert.match(stream, /DEMO/);
  assert.match(stream, /event: done/);
  const shot = 'data:image/png;base64,iVBORw0KGgo=';
  const several = await request('/answers', 'POST', { sessionId: session.id, question: 'Solve this.', mode: 'coding', images: [shot, shot, shot] });
  assert.match(await several.text(), /event: done/);
  assert.equal((await request('/answers', 'POST', { sessionId: session.id, question: 'Solve this.', mode: 'coding', images: Array(5).fill(shot) })).status, 400);
  assert.equal((await request('/answers', 'POST', { sessionId: session.id, question: 'Solve this.', mode: 'coding', images: ['https://example.com/x.png'] })).status, 400);
  await request('/profile', 'PUT', { facts: 'Built a calendar application.' });
  assert.equal((await (await request('/profile')).json()).facts, 'Built a calendar application.');
  await request('/profile', 'DELETE');
  assert.equal((await (await request('/profile')).json()).facts, '');
  const handoff = await (await request('/auth/handoff', 'POST', { refreshToken: 'demo' })).json();
  assert.equal((await (await request('/auth/redeem', 'POST', { code: handoff.code }, false)).json()).accessToken, 'demo');
  assert.equal((await request('/auth/redeem', 'POST', { code: handoff.code }, false)).status, 401);
  socket = new WebSocket(`ws://127.0.0.1:${port}/transcription`);
  await once(socket, 'open');
  const messages = [];
  const final = new Promise((resolve, reject) => {
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      messages.push(message);
      if (message.type === 'final') resolve();
      if (message.type === 'error') reject(new Error(message.error));
    });
  });
  socket.send(JSON.stringify({ type: 'start', accessToken: 'demo', sessionId: session.id }));
  await Promise.race([final, wait(5000).then(() => { throw new Error('WS startup timed out'); })]);
  assert(messages.some(message => message.type === 'ready'));
  socket.close();
  assert.equal((await (await request(`/sessions/${session.id}/pause`, 'POST', {})).json()).status, 'paused');
  assert.equal((await request('/answers', 'POST', { sessionId: session.id, question: 'Explain a hash map.', mode: 'technical' })).status, 409);
  assert.equal((await (await request(`/sessions/${session.id}/resume`, 'POST', {})).json()).status, 'active');
  assert.equal((await (await request(`/sessions/${session.id}/end`, 'POST', {})).json()).status, 'ended');
  // The API refuses to start on unsafe or invalid settings instead of running half-configured.
  for (const [setting, message] of [[{ DEMO_MODE: 'true', HOST: '0.0.0.0' }, /Demo must run in development on loopback/], [{ NODE_ENV: 'production', DATABASE_URL: '' }, /Production requires Neon and OpenAI credentials/],
    [{ PORT: '70000' }, /Invalid PORT/], [{ TRIAL_SECONDS: '-1' }, /Invalid TRIAL_SECONDS/], [{ AUDIO_SILENCE_MS: '50' }, /Invalid audio VAD calibration/], [{ TRUST_PROXY: '9' }, /Invalid TRUST_PROXY/]]) {
    const started = spawnSync(process.execPath, ['--import', 'tsx', 'apps/api/src/index.ts'], { env: { ...process.env, HOST: '127.0.0.1', PORT: '54399', NODE_ENV: 'test', ...setting }, encoding: 'utf8', timeout: 20000 });
    assert.notEqual(started.status, 0, JSON.stringify(setting)); assert.match(started.stderr, message);
  }
  console.log('HTTP/SSE/WebSocket demo smoke passed; no paid services called.');
} finally {
  socket?.close();
  api.kill('SIGTERM');
  if (api.exitCode === null) await once(api, 'exit');
}
