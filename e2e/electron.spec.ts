import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { build as bundle } from 'esbuild';
import { build as vite } from 'vite';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// The real Electron main process, preload and renderer. Everything is built into a temp folder and launched with a
// throwaway profile and a mock keychain, so the installed Ctrue (same userData folder and Keychain item) is untouched.
// The API is a small fake on its own port: these tests are about the desktop, not the server.
const desktop = resolve(__dirname, '../apps/desktop');
const FAKE = 'http://127.0.0.1:54319';
let root: string, api: Server, app: ElectronApplication, main: Page, profile: string;
let refreshStatus = 401;
// Emails for the next redeemed sign-in links; an access token not listed here has been revoked (401).
let redeemAs: string[] = [];
const signedIn = new Map<string, string>();
const logouts: string[] = [];

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'ctrue-electron-'));
  mkdirSync(join(root, 'build'));
  symlinkSync(resolve(__dirname, '../node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir'); // electron-updater stays external, as in the real build
  copyFileSync(join(desktop, 'build/tray.png'), join(root, 'build/tray.png'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ ...JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8')), main: 'dist-electron/main.cjs' }));
  // Like scripts/dev.mjs: no baked URLs, so CTRUE_API_URL is read at launch.
  await bundle({ entryPoints: [join(desktop, 'electron/main.ts'), join(desktop, 'electron/preload.ts')], outdir: join(root, 'dist-electron'), platform: 'node', format: 'cjs', outExtension: { '.js': '.cjs' }, bundle: true, external: ['electron', 'electron-updater'], logLevel: 'error' });
  process.env.VITE_API_URL = FAKE;
  await vite({ root: desktop, configFile: join(desktop, 'vite.config.ts'), logLevel: 'error', build: { outDir: join(root, 'dist'), emptyOutDir: true } });
  api = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const json = (status: number, value: unknown) => res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }).end(JSON.stringify(value));
    if (req.method === 'OPTIONS') return json(204, {});
    if (req.url === '/health') return json(200, { status: 'ok', mode: 'live', configured: { auth: true, ai: true } });
    if (req.url === '/auth/redeem') {
      const email = redeemAs.shift(), access = (email ? Buffer.from(email).toString('hex') : '').padEnd(64, 'a').slice(0, 64);
      if (email) signedIn.set(access, email);
      return json(200, { accessToken: access, refreshToken: `r${access.slice(1)}` });
    }
    if (req.url === '/auth/refresh') return json(refreshStatus, { error: refreshStatus === 401 ? 'Login expired. Sign in again' : 'Database unavailable' });
    if (req.url === '/auth/logout') { logouts.push(JSON.parse(raw).refreshToken); return json(200, { signedOut: true }); }
    if (req.url === '/account') {
      const email = signedIn.get(String(req.headers.authorization).replace('Bearer ', ''));
      return email ? json(200, { balanceSeconds: 0, plan: 'owner', email, metered: false }) : json(401, { error: 'Sign in again' });
    }
    json(404, { error: 'Not found' });
  });
  api.listen(54319, '127.0.0.1');
  await once(api, 'listening');
});
test.afterAll(async () => { api?.close(); rmSync(root, { recursive: true, force: true }); });

test.beforeEach(async () => {
  profile = mkdtempSync(join(tmpdir(), 'ctrue-profile-'));
  const env: Record<string, string> = { ...process.env as Record<string, string>, CTRUE_API_URL: FAKE, CTRUE_WEBSITE_URL: 'http://127.0.0.1:53000' };
  delete env.ELECTRON_RUN_AS_NODE; delete env.CTRUE_RENDERER_URL; // VS Code's shell sets the first, which turns Electron into plain Node
  app = await electron.launch({ args: [`--user-data-dir=${profile}`, '--use-mock-keychain', root], env, timeout: 30_000 });
  main = await app.firstWindow();
  await expect(main.locator('h1')).toContainText('Your second perspective');
});
test.afterEach(async () => { await app?.close(); rmSync(profile, { recursive: true, force: true }); });

const popup = async () => { await expect.poll(() => app.windows().length).toBe(2); return app.windows().find(w => w.url().endsWith('#popup'))!; };
const signIn = () => app.evaluate(({ app }) => { app.emit('open-url', { preventDefault() {} }, `ctrue://auth?code=${'c'.repeat(64)}`); });
// Answers the next native dialog with this button and records what it asked.
const answerDialog = (button: number) => app.evaluate(({ dialog }, button) => {
  const asked: string[] = ((globalThis as unknown as { asked?: string[] }).asked ||= []);
  dialog.showMessageBox = (async (...args: unknown[]) => { const options = args.at(-1) as { message: string }; asked.push(options.message); return { response: button, checkboxChecked: false }; }) as typeof dialog.showMessageBox;
}, button);
const dialogs = () => app.evaluate(() => (globalThis as unknown as { asked?: string[] }).asked || []);

test('opens the main window and a hidden pop-up; closing the pop-up only hides it', async () => {
  const panel = await popup();
  await expect(panel.getByLabel('Ctrue answer')).toBeAttached();
  const state = await app.evaluate(({ BrowserWindow }) => {
    const pop = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#popup'))!;
    pop.showInactive(); pop.close();
    return { exists: !pop.isDestroyed(), visible: pop.isVisible() };
  });
  expect(state).toEqual({ exists: true, visible: false });
});

test('Copy can write to the clipboard from both windows (ELEC-7)', async () => {
  const saved = await app.evaluate(({ clipboard }) => clipboard.readText());
  try {
    for (const page of [main, await popup()]) {
      const result = await page.evaluate(() => navigator.clipboard.writeText('ctrue copy check').then(() => 'ok', error => String(error)));
      expect(result, page.url().endsWith('#popup') ? 'pop-up' : 'main window').toBe('ok');
    }
  } finally {
    await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), saved);
  }
});

test('a sign-in link signs in, and a login the server has revoked returns to Sign in (REN-5)', async () => {
  refreshStatus = 401;
  await signIn();
  await expect(main.getByText('Signed in securely.')).toBeVisible();
  await expect(main.getByText('Connect your Ctrue account')).toBeVisible();
  await expect(main.getByRole('alert')).toContainText('Your login expired. Sign in again.');
  expect(existsSync(join(profile, 'credentials.enc')), 'the revoked credential is still stored').toBe(false);
});

test('a refresh that fails for another reason keeps the login for a later retry', async () => {
  refreshStatus = 503;
  await signIn();
  await expect(main.getByText('Signed in securely.')).toBeVisible();
  await expect(main.getByRole('alert')).toBeVisible();
  await expect(main.getByText('Connect your Ctrue account')).toHaveCount(0);
  expect(existsSync(join(profile, 'credentials.enc'))).toBe(true);
});

test('the renderer cannot navigate away, open windows or reach other hosts', async () => {
  const before = main.url();
  await main.evaluate(() => { location.href = 'https://example.com/'; });
  await main.waitForTimeout(500);
  expect(main.url()).toBe(before);
  expect(await main.evaluate(() => window.open('https://example.com/') === null)).toBe(true);
  expect(await main.evaluate(() => fetch('https://example.com/').then(() => 'reached', () => 'blocked'))).toBe('blocked');
  expect(await main.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined');
});

test('the main process refuses a Shift-only global shortcut', async () => {
  const result = await main.evaluate(() => (window as unknown as { ctrue: { shortcuts(v: unknown): Promise<string[]> } }).ctrue.shortcuts({ capture: 'Shift+K' }).then(() => 'saved', error => String(error)));
  expect(result).toContain('Invalid shortcut for capture');
});

test('a failed update check says so instead of claiming Ctrue is up to date (ELEC-17)', async () => {
  await app.evaluate(() => { globalThis.fetch = async () => new Response('', { status: 503 }); });
  await main.getByRole('button', { name: 'Preferences' }).click();
  await main.getByRole('button', { name: 'Check for updates' }).click();
  await expect(main.getByRole('alert')).toContainText('Could not check for updates');
  await expect(main.getByText('You have the latest version')).toHaveCount(0);
});

test('the app menu has no reload or developer tools; copy and paste still work in text fields (improvement 3)', async () => {
  const roles = await app.evaluate(({ Menu }) => {
    const walk = (items: Electron.MenuItem[]): string[] => items.flatMap(item => [String(item.role || ''), ...(item.submenu ? walk(item.submenu.items) : [])]);
    const menu = Menu.getApplicationMenu();
    return menu ? walk(menu.items).map(role => role.toLowerCase()) : [];
  });
  for (const role of ['reload', 'forcereload', 'toggledevtools']) expect(roles).not.toContain(role);
  if (process.platform === 'darwin') expect(roles).toEqual(expect.arrayContaining(['copy', 'paste', 'selectall', 'quit']));
});

test('a sign-in link for another account asks first, and keeps the current one unless told to switch (improvement 6)', async () => {
  redeemAs = ['one@example.com', 'two@example.com', 'two@example.com', 'one@example.com'];
  await signIn();
  await expect(main.locator('.account-line strong')).toHaveText('one');
  await answerDialog(1);
  await signIn();
  await expect.poll(dialogs).toEqual(['Switch Ctrue to two@example.com?']);
  await expect(main.locator('.account-line strong')).toHaveText('one');
  expect(logouts).toHaveLength(1);
  await answerDialog(0);
  await signIn();
  await expect(main.locator('.account-line strong')).toHaveText('two');
  // The same account again needs no question.
  await answerDialog(1);
  redeemAs = ['two@example.com'];
  await signIn();
  await expect(main.getByText('Signed in securely.')).toBeVisible();
  expect(await dialogs()).toHaveLength(2);
});

test('the pop-up shows new shortcuts as soon as they are saved (improvement 8)', async () => {
  const panel = await popup();
  await expect(panel.locator('.popup-hint')).toContainText('listen');
  await main.evaluate(() => (window as unknown as { ctrue: { shortcuts(v: unknown): Promise<string[]> } }).ctrue.shortcuts({ capture: 'Alt+Shift+K' }));
  await expect(panel.locator('.popup-hint')).toContainText(process.platform === 'darwin' ? '⌥⇧K listen' : 'Alt+Shift+K listen');
});
