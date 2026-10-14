export const defaultShortcuts = { capture: 'CommandOrControl+L', screenshot: 'CommandOrControl+J', collect: 'CommandOrControl+Shift+J', answer: 'CommandOrControl+Enter', hide: 'CommandOrControl+H' };
export type Action = keyof typeof defaultShortcuts;
export function parseHandoff(value: unknown): string {
  if (typeof value !== 'string' || value.length > 512) throw new Error('Invalid login link.');
  const url = new URL(value);
  const code = url.searchParams.get('code');
  if (url.protocol !== 'ctrue:' || url.hostname !== 'auth' || url.username || url.password || url.hash || !code || !/^[a-zA-Z0-9_-]{43,128}$/.test(code) || [...url.searchParams.keys()].some(k => k !== 'code')) throw new Error('Invalid login link.');
  return code;
}
export function trustedService(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('Service URL must use HTTPS, or loopback HTTP in development.');
  return url.origin;
}
export function validateShortcuts(value: unknown): Record<Action, string> {
  if (!value || typeof value !== 'object') throw new Error('Invalid shortcuts.');
  const input = value as Record<string, unknown>;
  const result = { ...defaultShortcuts };
  for (const action of Object.keys(defaultShortcuts) as Action[]) {
    const key = input[action] ?? defaultShortcuts[action]; // settings saved before an action existed
    if (typeof key !== 'string' || !/^(?:(?:CommandOrControl|Command|Control|Alt|Option|Shift|Super)\+){1,4}(?:[A-Z0-9]|Enter|Space|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(key)) throw new Error(`Invalid shortcut for ${action}.`);
    result[action] = key;
  }
  if (new Set(Object.values(result)).size !== Object.keys(result).length) throw new Error('Each shortcut must be unique.');
  return result;
}
