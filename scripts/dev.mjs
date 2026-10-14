import { spawn } from 'node:child_process';

const demo = process.argv.includes('--demo');
const env = {
  ...process.env,
  ...(demo ? {
    DEMO_MODE: 'true',
    NEXT_PUBLIC_DEMO_MODE: 'true',
    VITE_DEMO_MODE: 'true',
  } : {}),
};
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Start Ctrue using npm run dev or npm run dev:demo.');
const children = ['@ctrue/api', '@ctrue/web', '@ctrue/desktop'].map(workspace =>
  spawn(process.execPath, [npm, 'run', 'dev', '-w', workspace], { stdio: 'inherit', env, detached: process.platform !== 'win32' }),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') console.error(error.message); }
  }
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', (code, signal) => { if (!stopping) stop(code ?? (signal ? 1 : 0)); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
