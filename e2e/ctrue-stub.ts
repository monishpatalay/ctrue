import type { Page } from '@playwright/test';
import { API } from './playwright.config';

// A stand-in for the Electron preload (apps/desktop/electron/preload.ts) so the real renderer runs in Chromium.
// It mirrors main.ts's validation and limits, records every call, and lets a test emit main-process events.
export type StubOptions = {
  api?: string;
  credentials?: string | null;
  openaiKey?: string | null;
  permissions?: { screen: string; microphone: string };
  refresh?: string | null | 'reject';
  updateEnabled?: boolean;
  latest?: string | null;
  platform?: string;
};
export const SHORTCUTS = { capture: 'CommandOrControl+L', screenshot: 'CommandOrControl+J', collect: 'CommandOrControl+Shift+J', answer: 'CommandOrControl+Enter', hide: 'CommandOrControl+H', next: 'Alt+Shift+N', previous: 'Alt+Shift+B' };

export async function installCtrue(page: Page, options: StubOptions = {}) {
  await page.addInitScript(({ options, shortcuts, api }) => {
    const listeners = new Set<(event: { action: string; payload?: unknown }) => void>();
    const calls: { name: string; args: unknown[] }[] = [];
    const popupStates: unknown[] = [];
    let openaiKey = options.openaiKey ?? null;
    // Electron prefixes main-process errors this way; the renderer strips it.
    const fail = (channel: string, message: string) => new Error(`Error invoking remote method 'ctrue:${channel}': Error: ${message}`);
    const record = (name: string) => async (...args: unknown[]) => { calls.push({ name, args }); };
    // A fake screen: a canvas video track plus a quiet oscillator as "system audio", for getDisplayMedia.
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 640, height: 360 });
      const draw = canvas.getContext('2d')!;
      draw.fillStyle = '#fff'; draw.fillRect(0, 0, 640, 360); draw.fillStyle = '#000'; draw.font = '28px sans-serif'; draw.fillText('Two sum: return indices of two numbers', 20, 180);
      const audio = new AudioContext({ sampleRate: 24000 }), tone = audio.createOscillator(), out = audio.createMediaStreamDestination();
      tone.connect(out); tone.start();
      return new MediaStream([...canvas.captureStream(5).getVideoTracks(), ...out.stream.getAudioTracks()]);
    };
    (window as unknown as { __ctrue: unknown }).__ctrue = { calls, popupStates, emit: (action: string, payload?: unknown) => listeners.forEach(listener => listener({ action, payload })) };
    (window as unknown as { ctrue: unknown }).ctrue = {
      config: async () => ({ api: options.api ?? api, website: 'http://127.0.0.1:53000', version: '0.1.9', packaged: false, platform: options.platform ?? 'darwin', secureStorage: true, shortcuts, updateEnabled: options.updateEnabled ?? true }),
      credentials: async () => options.credentials ?? null,
      refresh: async () => { calls.push({ name: 'refresh', args: [] }); if (options.refresh === 'reject') throw fail('refresh', 'Login expired. Sign in again.'); return options.refresh ?? null; },
      signout: record('signout'),
      currentScreen: async () => ({ id: 'screen:1:0', name: 'Entire screen' }),
      selectSource: record('selectSource'), protect: record('protect'), recording: record('recording'),
      shortcuts: async (value: unknown) => { calls.push({ name: 'shortcuts', args: [value] }); return []; },
      popupState: async (value: unknown) => { popupStates.push(value); if (JSON.stringify(value).length > 200000) throw fail('popup-state', 'Invalid pop-up state.'); },
      popupStep: record('popupStep'), popupAsk: record('popupAsk'), popupHide: record('popupHide'), popupClear: record('popupClear'), popupMicOff: record('popupMicOff'),
      openaiKey: async () => openaiKey,
      setOpenaiKey: async (value: string | null) => {
        if (value !== null && !/^sk-[A-Za-z0-9_-]{20,300}$/.test(value.trim())) throw fail('set-openai-key', 'That does not look like an OpenAI API key (it should start with sk-).');
        openaiKey = value; calls.push({ name: 'setOpenaiKey', args: [value === null ? null : 'sk-…'] });
      },
      permissions: async () => options.permissions ?? { screen: 'granted', microphone: 'granted' },
      requestPermission: record('requestPermission'), relaunch: record('relaunch'),
      minimize: record('minimize'), maximize: record('maximize'), quit: record('quit'), openLogin: record('openLogin'), openAccount: record('openAccount'),
      installUpdate: record('installUpdate'), openDownload: record('openDownload'),
      checkUpdate: async () => options.latest ?? null,
      onEvent: (callback: (event: { action: string; payload?: unknown }) => void) => { listeners.add(callback); return () => listeners.delete(callback); },
    };
  }, { options, shortcuts: SHORTCUTS, api: API });
}

export const emit = (page: Page, action: string, payload?: unknown) => page.evaluate(([action, payload]) => (window as unknown as { __ctrue: { emit(a: string, p?: unknown): void } }).__ctrue.emit(action as string, payload), [action, payload] as const);
export const calls = (page: Page, name?: string) => page.evaluate(name => (window as unknown as { __ctrue: { calls: { name: string; args: unknown[] }[] } }).__ctrue.calls.filter(call => !name || call.name === name), name);
export const lastPopupState = (page: Page) => page.evaluate(() => (window as unknown as { __ctrue: { popupStates: unknown[] } }).__ctrue.popupStates.at(-1) as Record<string, unknown> | undefined);
