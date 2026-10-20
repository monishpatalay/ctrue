import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { contract } from './api-contract.mjs';
import { load } from './load.mjs';
import { realAI } from './real-ai.mjs';
import { startMockOpenAI } from './mock-openai.mjs';

// ponytail: a disposable local PostgreSQL cluster verifies the actual money RPCs;
// no production connection string is accepted by this check.
const configured = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
const bin = process.env.PG_BIN || configured.stdout?.trim() || '/opt/homebrew/opt/postgresql@14/bin';
if (!existsSync(join(bin, 'initdb'))) throw new Error('Install PostgreSQL or set PG_BIN to its bin directory.');
const root = mkdtempSync(join(tmpdir(), 'ctrue-postgres-'));
const data = join(root, 'data');
const socket = join(root, 'socket');
mkdirSync(socket);
let started = false;
function run(command, args, input) {
  const result = spawnSync(join(bin, command), args, { encoding: 'utf8', input });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout);
  return result.stdout;
}
// The real API against this cluster, with a local stand-in for Neon Auth's JWKS endpoint:
// browser JWT verification, then the desktop credential's handoff, rotation and revocation.
async function live() {
  const { publicKey, privateKey } = await generateKeyPair('EdDSA');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'EdDSA', use: 'sig' };
  const keys = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(request.url === '/neondb/auth/.well-known/jwks.json' ? { keys: [jwk] } : {}));
  });
  keys.listen(0, '127.0.0.1');
  await once(keys, 'listening');
  const origin = `http://127.0.0.1:${keys.address().port}`;
  const jwt = (audience = origin, subject = 'user-live') => new SignJWT({ email: subject === 'user-live' ? 'live@example.com' : `${subject}@example.com` }).setProtectedHeader({ alg: 'EdDSA', kid: 'test' })
    .setSubject(subject).setIssuer(origin).setAudience(audience).setExpirationTime('15m').sign(privateKey);
  // OpenAI is a local stand-in, so this check never depends on the internet or OpenAI's availability.
  const mock = await startMockOpenAI();
  const databaseUrl = `postgresql://postgres@localhost:55432/postgres?host=${encodeURIComponent(socket)}`, authBase = `${origin}/neondb/auth/`;
  const api = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/index.ts'], {
    env: { ...process.env, ...mock.env, PORT: '55433', HOST: '127.0.0.1', DEMO_MODE: 'false', NODE_ENV: 'test', METERING: 'false', OPENAI_API_KEY: '',
      DATABASE_URL: databaseUrl, NEON_AUTH_BASE_URL: authBase },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const call = async (path, token, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(`http://127.0.0.1:55433${path}`, { method, signal: AbortSignal.timeout(5000), body: body && JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    return { status: response.status, body: await response.json() };
  };
  try {
    let health;
    for (let i = 0; i < 50 && !health; i++) {
      if (api.exitCode !== null) throw new Error('API exited during startup.');
      health = await call('/health').catch(() => null);
      if (!health) await wait(100);
    }
    assert.deepEqual(health?.body.configured, { auth: true, ai: false });
    const browser = await jwt();
    const account = await call('/account', browser);
    assert.deepEqual([account.status, account.body.balanceSeconds, account.body.email], [200, 600, 'live@example.com']);
    assert.equal((await call('/account', await jwt('https://elsewhere.example'))).status, 401, 'JWT for another audience accepted');
    assert.equal((await call('/account', 'f'.repeat(64))).status, 401, 'Unknown desktop token accepted');
    const session = (await call('/sessions', browser, {})).body;
    assert.equal(session.status, 'active');
    assert.equal((await call(`/sessions/${session.id}/pause`, browser, {})).body.status, 'paused');
    assert.equal((await call('/sessions/00000000-0000-4000-8000-000000000000/pause', browser, {})).status, 404);
    assert.equal((await call('/profile', browser, { facts: 'Built a calendar.' }, 'PUT')).body.facts, 'Built a calendar.');
    const { code } = (await call('/auth/handoff', browser, {})).body;
    const first = (await call('/auth/redeem', null, { code })).body;
    assert.match(first.accessToken, /^[a-f0-9]{64}$/);
    assert.equal((await call('/account', first.accessToken)).body.email, 'live@example.com');
    assert.equal((await call('/profile', first.accessToken)).body.facts, 'Built a calendar.', 'Desktop and browser resolved different accounts');
    assert.equal((await call('/auth/handoff', first.accessToken, {})).status, 403, 'Desktop token cloned itself');
    const second = (await call('/auth/refresh', null, { refreshToken: first.refreshToken })).body;
    assert.equal((await call('/account', first.accessToken)).status, 401, 'Rotated access token still accepted');
    assert.equal((await call('/auth/refresh', null, { refreshToken: first.refreshToken })).status, 401, 'Rotated refresh token reused');
    assert.equal((await call('/account', second.accessToken)).status, 200);
    assert.equal((await call('/auth/logout', null, { refreshToken: second.refreshToken })).status, 200);
    assert.equal((await call('/account', second.accessToken)).status, 401, 'Revoked desktop token still accepted');
    // Free mode: no credits needed, and a user without their own OpenAI key is told to add one.
    assert.equal((await call('/account', browser)).body.metered, false);
    const live = (await call('/sessions', browser, {})).body;
    assert.equal(live.status, 'active');
    const ask = headers => fetch('http://127.0.0.1:55433/answers', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${browser}`, ...headers }, body: JSON.stringify({ sessionId: live.id, question: 'Hi', mode: 'technical' }) }).then(async r => ({ status: r.status, text: await r.text() }));
    const missing = await ask({});
    assert.equal(missing.status, 402); assert.match(missing.text, /Add your OpenAI API key/);
    assert.equal((await ask({ 'X-OpenAI-Key': 'not-a-key' })).status, 400);
    const rejected = await ask({ 'X-OpenAI-Key': 'sk-test-invalid-key-for-ctrue-checks-0000000000' });
    // A bad key is only discovered when OpenAI is called, after the answer stream has started.
    assert.match(rejected.text, /event: error[\s\S]*Your OpenAI API key was rejected/);
    await contract({ databaseUrl, authBase, origin, privateKey, token: subject => jwt(origin, subject) });
    if (process.argv.includes('--load')) await load({ socket, authBase, token: subject => jwt(origin, subject) });
    if (process.argv.includes('--ai')) await realAI({ databaseUrl, authBase, token: subject => jwt(origin, subject) });
  } finally {
    api.kill('SIGTERM');
    if (api.exitCode === null) await once(api, 'exit');
    keys.close();
    await mock.close();
  }
}
// Two connections at once: the first holds its transaction (and row lock) for a second while the second arrives.
// Session start and token rotation must serialize on the account and token rows instead of double-acting (API-30).
async function races() {
  const psql = (...queries) => new Promise((resolve, reject) => {
    const child = spawn(join(bin, 'psql'), ['-h', socket, '-p', '55432', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tAq', ...queries.flatMap(query => ['-c', query])]);
    let out = '', err = '';
    child.stdout.on('data', chunk => { out += chunk; }); child.stderr.on('data', chunk => { err += chunk; });
    child.on('close', code => code === 0 ? resolve(out.trim().split('\n').filter(Boolean)) : reject(new Error(err)));
  });
  const race = (first, second) => Promise.all([psql('begin', first, 'select pg_sleep(1)', 'commit'), wait(200).then(() => psql(second))]);
  const start = "select public.session_action('race-user',null,'start',600,false)->>'id'";
  const [[held], [late]] = await race(start, start);
  assert.equal(late, held, 'two concurrent starts created two sessions');
  assert.deepEqual(await psql("select count(*) from sessions where user_id='race-user' and status='active'"), ['1']);
  await psql("select public.desktop_token_issue('race-user',null,'race-a1','race-r1')");
  const [[first], [second]] = await race("select public.desktop_token_rotate('race-r1','race-a2','race-r2')", "select public.desktop_token_rotate('race-r1','race-a3','race-r3')");
  assert.deepEqual([first, second], ['t', 'f'], 'one refresh token rotated twice');
}
try {
  run('initdb', ['-D', data, '-A', 'trust', '--no-locale', '-U', 'postgres']);
  run('pg_ctl', ['-D', data, '-l', join(root, 'server.log'), '-o', `-k ${socket} -h '' -p 55432 -F`, '-w', 'start']);
  started = true;
  const sql = readFileSync('database/migrations/001_ctrue.sql', 'utf8')
    + '\n' + readFileSync('database/migrations/002_unmetered.sql', 'utf8')
    + '\n' + readFileSync('database/migrations/003_remove_payments.sql', 'utf8')
    + '\n' + readFileSync('database/tests/accounting.sql', 'utf8');
  run('psql', ['-h', socket, '-p', '55432', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], sql);
  await races();
  await live();
  console.log('PostgreSQL migration, accounting, and live API auth assertions passed.');
} finally {
  if (started) {
    // Stop before removal; preserve the cluster if shutdown fails.
    run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  }
  rmSync(root, { recursive: true, force: true });
}
