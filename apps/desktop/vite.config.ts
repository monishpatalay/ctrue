import { defineConfig, loadEnv } from 'vite';
import { trustedService } from './electron/security';
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const api = trustedService(env.CTRUE_API_URL || env.VITE_API_URL || 'http://localhost:4318');
  const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ${api} ${api.replace(/^http/, 'ws')} ws://127.0.0.1:5173; media-src 'self' blob:; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'none'; form-action 'none'`;
  return { base: './', server: { host: '127.0.0.1', port: 5173, strictPort: true }, build: { outDir: 'dist' }, plugins: [{ name: 'ctrue-csp', transformIndexHtml: { order: 'pre', handler: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head' }] } }] };
});
