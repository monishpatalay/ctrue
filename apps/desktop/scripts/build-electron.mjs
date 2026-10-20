import { build } from 'esbuild';
import { loadEnv } from 'vite';
const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const keys = ['API_URL', 'WEBSITE_URL', 'UPDATE_FEED_URL', 'SIGNED_RELEASE'];
// A signed release updates itself, so a missing address would ship localhost to every installed copy.
if (env.CTRUE_SIGNED_RELEASE === 'true') for (const key of ['API_URL', 'WEBSITE_URL', 'UPDATE_FEED_URL']) {
  const value = env[`CTRUE_${key}`] || env[`VITE_${key}`];
  if (!value?.startsWith('https://')) throw new Error(`CTRUE_SIGNED_RELEASE=true needs an https CTRUE_${key}, not "${value || ''}".`);
}
const define = Object.fromEntries(keys.map(key => [`process.env.CTRUE_${key}`, JSON.stringify(env[`CTRUE_${key}`] || env[`VITE_${key}`] || '')]));
await build({ entryPoints: ['electron/main.ts', 'electron/preload.ts'], outdir: 'dist-electron', platform: 'node', format: 'cjs', outExtension: { '.js': '.cjs' }, bundle: true, external: ['electron', 'electron-updater'], define });
