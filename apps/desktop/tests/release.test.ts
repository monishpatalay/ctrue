import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// A release that updates itself must keep one signing identity and point at real services: a build that silently
// falls back to an ad hoc signature or to localhost breaks updates and macOS permissions for every installed copy.
const desktop = fileURLToPath(new URL('..', import.meta.url));
const signed = { CTRUE_SIGNED_RELEASE: 'true', CTRUE_WEBSITE_URL: 'https://ctrue.monishpatalay.dev', CTRUE_UPDATE_FEED_URL: 'https://github.com/monishpatalay/ctrue/releases/latest/download/' };

test('a signed release will not build without https service addresses', () => {
  for (const api of ['', 'http://localhost:4318']) {
    const result = spawnSync(process.execPath, ['scripts/build-electron.mjs'], { cwd: desktop, encoding: 'utf8', env: { ...process.env, ...signed, CTRUE_API_URL: api, VITE_API_URL: api } });
    assert.notEqual(result.status, 0, `built with API "${api}"`);
    assert.match(result.stderr, /CTRUE_SIGNED_RELEASE=true needs an https CTRUE_API_URL/);
  }
});

test('a signed release will not fall back to an ad hoc signature', async () => {
  const sign = createRequire(import.meta.url)('../scripts/adhoc-sign.cjs').default;
  const saved = { ...process.env };
  Object.assign(process.env, { CTRUE_SIGNED_RELEASE: 'true' });
  for (const key of ['CTRUE_SIGN_IDENTITY', 'CSC_LINK', 'CSC_NAME']) delete process.env[key];
  try {
    await assert.rejects(sign({ electronPlatformName: 'darwin', appOutDir: '/nonexistent', packager: { appInfo: { productFilename: 'Ctrue' } } }), /needs CTRUE_SIGN_IDENTITY/);
  } finally { process.env = saved; }
});
