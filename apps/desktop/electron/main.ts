import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, Menu, nativeImage, safeStorage, screen, session, shell, systemPreferences, Tray } from 'electron';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { autoUpdater } from 'electron-updater';
import { defaultShortcuts, isNewerVersion, parseHandoff, trustedService, validateShortcuts, type Action } from './security';

const api = trustedService(process.env.CTRUE_API_URL || 'http://localhost:4318');
const website = trustedService(process.env.CTRUE_WEBSITE_URL || 'http://localhost:3000');
const rendererURL = app.isPackaged ? null : process.env.CTRUE_RENDERER_URL;
let window: BrowserWindow;
let popup: BrowserWindow;
let tray: Tray;
let selectedSource = '';
let quitting = false;
let captureGrant = false;
let shortcuts = { ...defaultShortcuts };
let tokenPair: { accessToken: string; refreshToken: string } | null = null;
let credentialVersion = 0;
let credentialWrites: Promise<unknown> = Promise.resolve();
let refreshPending: { version: number; promise: Promise<string | null> } | null = null;
let pendingLink: string | null = process.argv.find(v => v.startsWith('ctrue:')) || null;
const releasesPage = 'https://github.com/monishpatalay/ctrue-downloads/releases/latest';
// ponytail: notify-only; real auto-install needs an Apple Developer ID signature (electron-updater block below).
async function checkForNewRelease(): Promise<string | null> {
  try {
    const response = await fetch('https://api.github.com/repos/monishpatalay/ctrue-downloads/releases/latest', { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;
    const { tag_name: tag } = await response.json() as { tag_name?: unknown };
    if (typeof tag !== 'string' || !/^v?\d+(\.\d+)*$/.test(tag) || !isNewerVersion(tag, app.getVersion())) return null;
    emit('update-available', tag.replace(/^v/, ''));
    return tag.replace(/^v/, '');
  } catch { return null; }
}
const tokensPath = () => path.join(app.getPath('userData'), 'credentials.enc');
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const openaiKeyPath = () => path.join(app.getPath('userData'), 'openai-key.enc');
function emit(action: string, payload?: unknown) { window?.webContents.send('ctrue:event', { action, payload }); }
function restore() { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
// The pop-up appears on the display under the pointer without taking focus, so typing continues underneath.
function showPopup() {
  if (popup.isVisible()) return;
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  popup.setPosition(area.x + area.width - popup.getSize()[0] - 24, area.y + 24);
  popup.showInactive();
}
function assertSender(event: Electron.IpcMainInvokeEvent) {
  const url = event.senderFrame?.url;
  if ((event.sender !== window.webContents && event.sender !== popup?.webContents) || !url || (rendererURL ? new URL(url).origin !== new URL(rendererURL).origin : url.split('#')[0] !== new URL(`file://${path.join(__dirname, '../dist/index.html')}`).href)) throw new Error('Untrusted application frame.');
}
function ipc(channel: string, handler: (...args: unknown[]) => unknown) { ipcMain.handle(channel, (event, ...args) => { assertSender(event); return handler(...args); }); }
function writeCredentials<T>(operation: () => Promise<T>): Promise<T> {
  const result = credentialWrites.catch(() => {}).then(operation);
  credentialWrites = result;
  return result;
}
async function storeTokens(value: unknown, version: number) {
  const pair = value as typeof tokenPair;
  if (!pair || typeof pair.accessToken !== 'string' || typeof pair.refreshToken !== 'string' || pair.accessToken.length > 16384 || pair.refreshToken.length > 16384) throw new Error('Invalid credentials.');
  if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') throw new Error('OS secure storage is unavailable. Sign-in credentials were not saved.');
  await writeCredentials(async () => {
    if (version !== credentialVersion) throw new Error('Sign-in changed while credentials were being refreshed.');
    await writeFile(tokensPath(), safeStorage.encryptString(JSON.stringify(pair)), { mode: 0o600 });
    if (version !== credentialVersion) throw new Error('Sign-in changed while credentials were being saved.');
    tokenPair = pair;
  });
}
async function handleLink(value: string) {
  try {
    const code = parseHandoff(value);
    const version = ++credentialVersion;
    const response = await fetch(`${api}/auth/redeem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }), signal: AbortSignal.timeout(15000) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Login link expired. Sign in again.');
    await storeTokens(body, version);
    restore(); emit('auth', { accessToken: tokenPair!.accessToken });
  } catch (error) { restore(); emit('error', error instanceof Error ? error.message : 'Sign-in failed.'); }
}
async function performRefresh(version: number) {
  if (!tokenPair) return null;
  // The API rotates this desktop's own credential; the previous refresh token stops working at once.
  const response = await fetch(`${api}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: tokenPair.refreshToken }), signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  if (!response.ok || !body.accessToken || !body.refreshToken) throw new Error('Login expired. Sign in again.');
  await storeTokens({ accessToken: body.accessToken, refreshToken: body.refreshToken }, version);
  return tokenPair!.accessToken;
}
async function refresh() {
  const version = credentialVersion;
  if (refreshPending?.version === version) return refreshPending.promise;
  const promise = performRefresh(version);
  refreshPending = { version, promise };
  try { return await promise; } finally { if (refreshPending?.promise === promise) refreshPending = null; }
}
// macOS refuses to list screens until this app (in development: the terminal or editor that launched it) has
// Screen Recording permission. An unsigned rebuild counts as a new app and has to be allowed again.
async function captureSources(options: Electron.SourcesOptions) {
  try { return await desktopCapturer.getSources(options); }
  catch {
    const denied = process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') !== 'granted';
    throw new Error(denied ? 'Screen recording is not allowed for Ctrue yet. Use Open System Settings at the top of the Live assistant page, turn on Ctrue, then click Restart Ctrue.' : 'Could not list screens and windows. Quit and reopen Ctrue, then try again.');
  }
}
function registerShortcuts(next: typeof shortcuts) {
  globalShortcut.unregisterAll();
  const failures: string[] = [];
  for (const action of Object.keys(next) as Action[]) {
    if (!globalShortcut.register(next[action], () => { if (action === 'hide') { if (popup.isVisible()) popup.hide(); else showPopup(); } else { showPopup(); emit(action); } })) failures.push(`${action}: ${next[action]}`);
  }
  shortcuts = next;
  return failures;
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event, argv) => { const link = argv.find(v => v.startsWith('ctrue:')); restore(); if (link) void handleLink(link); });
  app.on('open-url', (event, url) => { event.preventDefault(); if (window) void handleLink(url); else pendingLink = url; });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('activate', () => window && restore());
  void app.whenReady().then(async () => {
    if (app.isPackaged) app.setAsDefaultProtocolClient('ctrue');
    else if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient('ctrue', process.execPath, [path.resolve(process.argv[1])]);
    const webPreferences = { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true };
    window = new BrowserWindow({ width: 1040, height: 760, minWidth: 680, minHeight: 560, ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: 12 } } : { frame: false }), show: false, backgroundColor: '#101311', webPreferences: { ...webPreferences, backgroundThrottling: false } });
    // The main window is an ordinary solid window that does the work, so it keeps running when hidden or covered.
    // The pop-up is a small see-through panel above everything, including full-screen calls. Both are excluded
    // from screen capture by the OS unless that is switched off in Preferences.
    // A macOS panel floats over other apps without activating this one. skipTransformProcessType keeps Ctrue a
    // normal Dock app; the default would turn the whole app into a background app with no Dock icon.
    popup = new BrowserWindow({ width: 460, height: 560, minWidth: 340, minHeight: 300, type: 'panel', frame: false, transparent: true, hasShadow: false, show: false, alwaysOnTop: true, skipTaskbar: true, fullscreenable: false, webPreferences });
    popup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    for (const target of [window, popup]) target.setContentProtection(true);
    popup.on('close', event => { if (!quitting) { event.preventDefault(); popup.hide(); } });
    popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    popup.webContents.on('will-navigate', event => event.preventDefault());
    window.on('close', event => { if (!quitting) { event.preventDefault(); window.hide(); } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (!rendererURL || new URL(url).origin !== new URL(rendererURL).origin) event.preventDefault(); });
    const connect = `${api} ${api.replace(/^http/, 'ws')}`;
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [`default-src 'self'; script-src 'self'${rendererURL ? " 'unsafe-inline'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ${connect}${rendererURL ? ' ws://127.0.0.1:5173' : ''}; media-src 'self' blob:; worker-src 'self'; object-src 'none'; base-uri 'self'`] } }));
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      const origin = details.requestingUrl || contents.getURL();
      const trusted = contents === window.webContents && (rendererURL ? origin.startsWith(rendererURL) : origin.startsWith('file://'));
      callback(trusted && ['media', 'display-capture'].includes(permission));
    });
    session.defaultSession.setPermissionCheckHandler((contents, permission) => contents === window.webContents && ['media', 'display-capture'].includes(permission));
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
      if (!captureGrant || request.frame !== window.webContents.mainFrame) { callback({}); return; }
      captureGrant = false;
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
        const source = sources.find(v => v.id === selectedSource);
        if (!source) { callback({}); return; }
        callback({ video: source, audio: 'loopback' });
      } catch { callback({}); }
    });
    ipc('ctrue:config', () => ({ api, website, version: app.getVersion(), packaged: app.isPackaged, platform: process.platform, secureStorage: safeStorage.isEncryptionAvailable(), shortcuts, updateEnabled: Boolean(app.isPackaged && process.env.CTRUE_SIGNED_RELEASE === 'true' && process.env.CTRUE_UPDATE_FEED_URL) }));
    ipc('ctrue:credentials', async () => {
      if (tokenPair) return tokenPair.accessToken;
      try {
        const version = credentialVersion;
        const encrypted = await readFile(tokensPath());
        if (!safeStorage.isEncryptionAvailable()) throw new Error('OS secure storage is unavailable.');
        const value = JSON.parse(safeStorage.decryptString(encrypted));
        if (typeof value.accessToken !== 'string' || typeof value.refreshToken !== 'string') throw new Error('Invalid stored credentials.');
        if (version !== credentialVersion) throw new Error('Sign-in changed while loading stored credentials.');
        tokenPair = value; return tokenPair!.accessToken;
      } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    });
    ipc('ctrue:refresh', refresh);
    ipc('ctrue:signout', async () => {
      const revoked = tokenPair?.refreshToken;
      credentialVersion++; tokenPair = null; await writeCredentials(async () => { try { await unlink(tokensPath()); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } });
      // Local sign-out must work offline; an unreachable API leaves the server credential to expire on its own.
      if (revoked) await fetch(`${api}/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: revoked }), signal: AbortSignal.timeout(5000) }).catch(() => {});
    });
    // No picker: the display under the pointer is the one being looked at. Zero-size thumbnails skip image work.
    ipc('ctrue:current-screen', async () => {
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const sources = await captureSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      const source = sources.find(v => v.display_id === String(display.id)) || sources[0];
      if (!source) throw new Error('No screen is available to capture.');
      return { id: source.id, name: source.name };
    });
    ipc('ctrue:select-source', async id => {
      if (typeof id !== 'string' || id.length > 256) throw new Error('Invalid capture source.');
      const sources = await captureSources({ types: ['screen', 'window'] });
      if (!sources.some(v => v.id === id)) throw new Error('Capture source is no longer available.');
      selectedSource = id; captureGrant = true;
      setTimeout(() => { captureGrant = false; }, 10000);
    });
    ipc('ctrue:protect', enabled => { if (typeof enabled !== 'boolean') throw new Error('Invalid capture protection value.'); for (const target of [window, popup]) target.setContentProtection(enabled); });
    // Main window -> pop-up: what to display. Pop-up -> main window: a follow-up question to answer.
    ipc('ctrue:popup-state', value => { if (!value || typeof value !== 'object' || JSON.stringify(value).length > 200000) throw new Error('Invalid pop-up state.'); popup.webContents.send('ctrue:event', { action: 'popup-state', payload: value }); });
    ipc('ctrue:popup-ask', text => { if (typeof text !== 'string' || !text.trim() || text.length > 12000) throw new Error('Invalid follow-up question.'); emit('follow-up', text); });
    ipc('ctrue:popup-hide', () => popup.hide());
    ipc('ctrue:popup-step', delta => { if (delta !== 1 && delta !== -1) throw new Error('Invalid step move.'); emit(delta === 1 ? 'next' : 'previous'); });
    ipc('ctrue:shortcuts', async value => {
      const next = validateShortcuts(value); const failures = registerShortcuts(next);
      await writeFile(settingsPath(), JSON.stringify({ shortcuts: next }), { mode: 0o600 });
      return failures;
    });
    // While a new shortcut is being recorded the global ones are released, or the key press would trigger them instead.
    ipc('ctrue:recording', on => { if (typeof on !== 'boolean') throw new Error('Invalid recording state.'); if (on) globalShortcut.unregisterAll(); else registerShortcuts(shortcuts); });
    // The user's own OpenAI key, encrypted by the OS. It leaves this Mac only inside requests to the Ctrue API.
    ipc('ctrue:openai-key', async () => { try { return safeStorage.decryptString(await readFile(openaiKeyPath())); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } });
    ipc('ctrue:set-openai-key', async value => {
      if (value === null) { try { await unlink(openaiKeyPath()); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } return; }
      if (typeof value !== 'string' || !/^sk-[A-Za-z0-9_-]{20,300}$/.test(value.trim())) throw new Error('That does not look like an OpenAI API key (it should start with sk-).');
      if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') throw new Error('OS secure storage is unavailable, so the key cannot be saved.');
      await writeFile(openaiKeyPath(), safeStorage.encryptString(value.trim()), { mode: 0o600 });
    });
    // First-run permissions: report status, prompt, and open the exact System Settings pane so the user only flips a switch.
    const privacyPane = (pane: 'screen' | 'microphone') => shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane === 'screen' ? 'Privacy_ScreenCapture' : 'Privacy_Microphone'}`);
    ipc('ctrue:permissions', () => process.platform === 'darwin' ? { screen: systemPreferences.getMediaAccessStatus('screen'), microphone: systemPreferences.getMediaAccessStatus('microphone') } : { screen: 'granted', microphone: 'granted' });
    ipc('ctrue:request-permission', async kind => {
      if (process.platform !== 'darwin') return;
      if (kind === 'microphone') { if (!(await systemPreferences.askForMediaAccess('microphone'))) await privacyPane('microphone'); return; }
      if (kind !== 'screen') throw new Error('Unknown permission.');
      // Asking for sources once adds Ctrue to the Screen Recording list (and shows macOS's own prompt the first time).
      await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }).catch(() => {});
      await privacyPane('screen');
    });
    // macOS applies a new Screen Recording permission only after the app restarts.
    ipc('ctrue:relaunch', () => { quitting = true; app.relaunch(); app.exit(0); });
    ipc('ctrue:minimize', () => window.minimize());
    ipc('ctrue:maximize', () => { if (window.isMaximized()) window.unmaximize(); else window.maximize(); });
    ipc('ctrue:quit', () => app.quit());
    ipc('ctrue:open-account', () => shell.openExternal(`${website}/dashboard`));
    ipc('ctrue:open-login', () => shell.openExternal(`${website}/login?desktop=1`));
    ipc('ctrue:open-download', () => shell.openExternal(releasesPage));
    ipc('ctrue:check-update', checkForNewRelease);
    try { shortcuts = validateShortcuts(JSON.parse(await readFile(settingsPath(), 'utf8')).shortcuts); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Saved shortcuts could not be loaded:', error); }
    const failures = registerShortcuts(shortcuts);
    tray = new Tray(nativeImage.createFromPath(path.join(app.getAppPath(), 'build/tray.png')).resize({ width: 18, height: 18 }));
    tray.setToolTip('Ctrue'); tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Show Ctrue', click: restore }, { label: 'Hide Ctrue', click: () => window.hide() }, { type: 'separator' }, { label: 'Quit Ctrue', click: () => app.quit() }])); tray.on('click', restore);
    if (rendererURL) await window.loadURL(rendererURL); else await window.loadFile(path.join(__dirname, '../dist/index.html'));
    if (rendererURL) await popup.loadURL(`${rendererURL}/#popup`); else await popup.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'popup' });
    window.show();
    if (failures.length) emit('error', `Shortcut registration failed: ${failures.join(', ')}`);
    if (pendingLink) { await handleLink(pendingLink); pendingLink = null; }
    if (app.isPackaged) void checkForNewRelease();
    if (app.isPackaged && process.env.CTRUE_SIGNED_RELEASE === 'true' && process.env.CTRUE_UPDATE_FEED_URL) {
      const feed = new URL(process.env.CTRUE_UPDATE_FEED_URL);
      if (feed.protocol !== 'https:') { emit('error', 'Update feed requires HTTPS.'); return; }
      autoUpdater.setFeedURL({ provider: 'generic', url: feed.href });
      autoUpdater.on('error', error => emit('error', `Update failed: ${error.message}`));
      autoUpdater.on('update-downloaded', () => emit('update-ready'));
      ipc('ctrue:install-update', () => autoUpdater.quitAndInstall());
      void autoUpdater.checkForUpdatesAndNotify().catch(error => emit('error', error.message));
    }
  }).catch(error => { console.error(error); app.quit(); });
}
