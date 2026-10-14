import { build } from 'esbuild';
import { loadEnv } from 'vite';
const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const keys = ['API_URL', 'WEBSITE_URL', 'UPDATE_FEED_URL', 'SIGNED_RELEASE'];
const define = Object.fromEntries(keys.map(key => [`process.env.CTRUE_${key}`, JSON.stringify(env[`CTRUE_${key}`] || env[`VITE_${key}`] || '')]));
await build({ entryPoints: ['electron/main.ts', 'electron/preload.ts'], outdir: 'dist-electron', platform: 'node', format: 'cjs', outExtension: { '.js': '.cjs' }, bundle: true, external: ['electron', 'electron-updater'], define });
