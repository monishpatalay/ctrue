import { createServer, connect } from 'node:net';
import { once } from 'node:events';
import { setTimeout as wait } from 'node:timers/promises';
import WebSocketClient from 'ws';
import { launch } from './api-contract.mjs';
import { startMockOpenAI } from './mock-openai.mjs';

// How many live users one API instance carries. Production runs the API on Render (Oregon) and the database on Neon
// (us-east-2), so every query pays a cross-country round trip; a proxy adds that latency in front of the disposable
// cluster. Each simulated user listens (a transcription socket, polled against the database every second), sends the
// desktop's 5-second heartbeat and asks one slow answer (polled every second while it streams). A probe user times
// /account throughout. Run with npm run test:load: it reports every level and fails only if the lightest misbehaves.
const PORT = 55436, PROXY = 55440, ONE_WAY_MS = 35, SECONDS = 30, KEY = 'sk-test-valid-key-for-ctrue-000000000000';

function slowLink(socketPath) {
  const server = createServer(client => {
    const database = connect(socketPath);
    const relay = (from, to) => from.on('data', chunk => setTimeout(() => to.write(chunk), ONE_WAY_MS));
    relay(client, database); relay(database, client);
    const close = () => { client.destroy(); database.destroy(); };
    for (const side of [client, database]) { side.on('close', close); side.on('error', close); }
  });
  server.listen(PROXY, '127.0.0.1');
  return server;
}
const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? NaN); };

async function level(users, { token, base }) {
  // Fresh accounts every round: a soak's back-to-back rounds would otherwise overlap one account's answers (one at a time by design).
  const round = Date.now();
  const timings = [], heartbeats = [], problems = { heartbeat: 0, socket: 0, answer: 0, probe: 0 };
  const stop = Date.now() + SECONDS * 1000, sockets = [];
  const call = async (path, bearer, address, init = {}) => {
    const started = performance.now();
    const response = await fetch(base + path, { ...init, signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}`, 'X-Forwarded-For': address, ...init.headers } });
    const text = await response.text();
    return { ok: response.ok, ms: performance.now() - started, text };
  };
  const user = async index => {
    const bearer = await token(`load-${users}-${index}-${round}`), address = `10.${users}.${index >> 8}.${index & 255}`;
    const session = JSON.parse((await call('/sessions', bearer, address, { method: 'POST', body: '{}' })).text);
    const socket = new WebSocketClient(`${base.replace('http', 'ws')}/transcription`);
    sockets.push(socket);
    socket.on('message', raw => { if (JSON.parse(raw.toString()).type === 'error') problems.socket++; });
    await once(socket, 'open');
    socket.send(JSON.stringify({ type: 'start', accessToken: bearer, sessionId: session.id, openaiKey: KEY }));
    const answerAt = Date.now() + Math.random() * (SECONDS - 6) * 1000;
    let asked = false;
    while (Date.now() < stop) {
      const beat = await call(`/sessions/${session.id}/heartbeat`, bearer, address, { method: 'POST', body: '{}' }).catch(() => ({ ok: false, ms: 15000 }));
      heartbeats.push(beat.ms); if (!beat.ok) problems.heartbeat++;
      if (!asked && Date.now() >= answerAt) {
        asked = true;
        void call('/answers', bearer, address, { method: 'POST', body: JSON.stringify({ sessionId: session.id, question: '[mock:slow] load', mode: 'technical' }), headers: { 'X-OpenAI-Key': KEY } })
          .then(answer => { if (!answer.ok || answer.text.includes('event: error')) problems.answer++; }, () => problems.answer++);
      }
      await wait(5000);
    }
  };
  const probe = async () => {
    const bearer = await token(`load-probe-${users}-${Date.now()}`); // a fresh account each round: one account polling nonstop hits the per-user limit by design
    while (Date.now() < stop) {
      const result = await call('/account', bearer, '192.0.2.1').catch(() => ({ ok: false, ms: 15000 }));
      timings.push(result.ms); if (!result.ok) problems.probe++;
      await wait(250);
    }
  };
  await Promise.all([...Array.from({ length: users }, (_, index) => wait(index * 20).then(() => user(index))), wait(2000).then(probe)]);
  for (const socket of sockets) socket.close();
  await wait(1000);
  return { users, probe: { p50: percentile(timings, 0.5), p95: percentile(timings, 0.95), max: percentile(timings, 1) }, heartbeatP95: percentile(heartbeats, 0.95), problems };
}

export async function load({ socket, authBase, token }) {
  const mock = await startMockOpenAI(), link = slowLink(`${socket}/.s.PGSQL.55432`);
  const api = await launch(PORT, { ...mock.env, TRUST_PROXY: '1', DATABASE_URL: `postgresql://postgres@127.0.0.1:${PROXY}/postgres`, NEON_AUTH_BASE_URL: authBase });
  const results = [];
  try {
    // Soak (CTRUE_SOAK_MINUTES): 20 users for that long; the API's memory is sampled each round and must level off.
    const soak = Number(process.env.CTRUE_SOAK_MINUTES || 0);
    if (soak) {
      const { execFileSync } = await import('node:child_process'), memory = [];
      const rss = () => Math.round(Number(execFileSync('ps', ['-o', 'rss=', '-p', String(api.pid)]).toString().trim()) / 1024);
      for (const end = Date.now() + soak * 60_000; Date.now() < end;) {
        const result = await level(20, { token, base: `http://127.0.0.1:${PORT}` });
        memory.push(rss());
        console.log(`  soak ${memory.length}: ${memory.at(-1)} MB, /account p95 ${result.probe.p95} ms, failures ${JSON.stringify(result.problems)}`);
        if (Object.values(result.problems).some(Boolean)) throw new Error('Failures during the soak.');
      }
      const early = Math.max(...memory.slice(0, 5)), late = Math.max(...memory.slice(-5));
      console.log(`Soak: ${soak} min; memory ${memory[0]} MB at start, peak ${Math.max(...memory)} MB, last ${memory.at(-1)} MB.`);
      if (late > early * 1.5) throw new Error(`The API's memory keeps growing: ${early} MB early, ${late} MB late.`);
      return;
    }
    for (const users of [25, 75, 150]) {
      const result = await level(users, { token, base: `http://127.0.0.1:${PORT}` });
      results.push(result);
      console.log(`  ${String(users).padStart(3)} live users: /account p50 ${result.probe.p50} ms, p95 ${result.probe.p95} ms, max ${result.probe.max} ms; heartbeat p95 ${result.heartbeatP95} ms; failures ${JSON.stringify(result.problems)}`);
    }
  } finally {
    await api.stop(); link.close(); await mock.close();
  }
  const light = results[0];
  if (light.probe.p95 > 1000 || Object.values(light.problems).some(Boolean)) throw new Error(`The API misbehaves with only ${light.users} live users at ${ONE_WAY_MS * 2} ms database round trips.`);
  console.log(`Load: ${ONE_WAY_MS * 2} ms database round trip, ${SECONDS} s per level.`);
}
