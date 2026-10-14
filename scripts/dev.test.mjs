import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('demo launcher propagates demo flags and stops its entire process groups', { skip: process.platform === 'win32', timeout: 10000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ctrue-launcher-'));
  const fixture = join(dir, 'npm.mjs');
  writeFileSync(fixture, `
    import { spawn } from 'node:child_process';
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
    console.log(JSON.stringify({pid:process.pid,child:child.pid,demo:process.env.DEMO_MODE,web:process.env.NEXT_PUBLIC_DEMO_MODE}));
    setInterval(() => {}, 1000);
  `);
  const processHandle = spawn(process.execPath, ['scripts/dev.mjs', '--demo'], { env: { ...process.env, npm_execpath: fixture }, stdio: ['ignore', 'pipe', 'pipe'] });
  const children = [];
  let buffer = '';
  const ready = new Promise((resolve, reject) => {
    processHandle.once('error', reject);
    processHandle.stdout.on('data', chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        children.push(JSON.parse(line));
        if (children.length === 3) resolve();
      }
    });
  });
  try {
    await ready;
    assert(children.every(child => child.demo === 'true' && child.web === 'true'));
    const exited = once(processHandle, 'exit');
    processHandle.kill('SIGTERM');
    await exited;
    for (const child of children) assert.throws(() => process.kill(child.child, 0), { code: 'ESRCH' });
  } finally {
    processHandle.kill('SIGTERM');
    for (const child of children) try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    rmSync(dir, { recursive: true, force: true });
  }
});
