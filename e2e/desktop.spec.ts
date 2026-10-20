import { expect, test, type Page } from '@playwright/test';
import { API } from './playwright.config';
import { calls, emit, installCtrue, lastPopupState, type StubOptions } from './ctrue-stub';

// The real desktop renderer (App.tsx) in Chromium, with the Electron preload stubbed and sessions on the demo API.
// /answers is served here so tests are deterministic and never meet the API's 12-answers-a-minute limit;
// the real /answers contract is covered by scripts/api-contract.mjs.
type Asked = { question: string; mode: string; topic?: string; images?: string[]; context?: string; key?: string };
type Reply = { status: number; error: string } | [string, unknown][];
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const STEPS = [
  { kind: 'summary', phase: 'none', title: 'Two sum', say: 'I restate the problem.', code: null, action: 'none', replaces: null, why: null, breaks: null, details: '- Ask about duplicates' },
  { kind: 'step', phase: 'optimal', title: 'Hash map', say: 'I remember what I have seen.', code: 'def two_sum(nums, target):\n    seen = {}', action: 'add', replaces: null, why: 'One pass.', breaks: null, details: null },
  { kind: 'final', phase: 'optimal', title: 'Final solution', say: 'That is the whole solution.', code: 'def two_sum(nums, target):\n    seen = {}', action: 'none', replaces: null, why: null, breaks: null, details: '**Time:** O(n)' },
];
const standard = (body: Asked): Reply => body.mode === 'walkthrough' ? [...STEPS.map(step => ['step', step] as [string, unknown]), ['done', {}]] : [['token', { text: `Answer to: ${body.question.slice(0, 60)}` }], ['done', {}]];

async function answers(page: Page, reply: (body: Asked, index: number) => Reply = standard) {
  const asked: Asked[] = [];
  await page.route(`${API}/answers`, async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = { ...route.request().postDataJSON(), key: route.request().headers()['x-openai-key'] } as Asked;
    asked.push(body);
    const result = reply(body, asked.length - 1);
    if (!Array.isArray(result)) return route.fulfill({ status: result.status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ error: result.error }) });
    await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: result.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('') });
  });
  return asked;
}
async function demo(page: Page, options: StubOptions = {}) {
  await installCtrue(page, options);
  await page.goto('/');
  await page.getByRole('button', { name: 'Try local demo' }).click();
  await expect(page.getByText('Local demo enabled. Responses are simulated.')).toBeVisible();
}
const question = (page: Page) => page.locator('#question');
const mode = (page: Page, name: string) => page.locator('.mode-card', { hasText: name }).click();

// The demo API holds one shared session; leave it ended for the next test.
test.afterEach(async ({ request }) => {
  const headers = { Authorization: 'Bearer demo' };
  const session = await (await request.post(`${API}/sessions`, { headers, data: {} })).json();
  await request.post(`${API}/sessions/${session.id}/end`, { headers, data: {} });
});

test('signs in to the local demo and answers a typed question in every answer mode', async ({ page }) => {
  const asked = await answers(page);
  await demo(page);
  await expect(page.getByText('Demo workspace')).toBeVisible();
  for (const [card, value] of [['Technical', 'technical'], ['Coding', 'coding'], ['Behavioral', 'behavioral'], ['System design', 'system-design']]) {
    await mode(page, card);
    await question(page).fill(`A ${value} question`);
    await page.getByRole('button', { name: /Generate answer/ }).click();
    await expect(page.locator('.answer-text')).toContainText(`Answer to: A ${value} question`);
    expect(asked.at(-1)?.mode).toBe(value);
  }
  await expect(page.getByRole('button', { name: 'Ⅱ Pause' })).toBeVisible();
  await page.getByText('Earlier answers (3)').click();
  await expect(page.locator('.history article')).toHaveCount(3);
});

test('a walkthrough moves through its steps and explains one on request', async ({ page }) => {
  const asked = await answers(page);
  await demo(page);
  await mode(page, 'Walkthrough');
  await question(page).fill('Explain two sum step by step');
  await page.getByRole('button', { name: /Start walkthrough/ }).click();
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
  expect(asked[0]).toMatchObject({ mode: 'walkthrough', topic: 'coding', question: 'Explain two sum step by step' });
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.locator('.walk-step h3')).toHaveText('Hash map');
  await page.getByRole('button', { name: 'Explain this step' }).click();
  await expect(page.getByText('DEEPER EXPLANATION')).toBeVisible();
  expect(asked[1].mode).toBe('coding');
  expect(asked[1].question).toMatch(/^Explain this step of my Python solution/);
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.getByText('COMPLETE SOLUTION')).toBeVisible();
  await expect(page.getByText('The complete solution differs')).toHaveCount(0);
});

test('⌘↩ during a walkthrough answers a follow-up about the current step instead of restarting (REN-13)', async ({ page }) => {
  const asked = await answers(page);
  await demo(page);
  await mode(page, 'Walkthrough');
  await question(page).fill('Explain two sum step by step');
  await page.getByRole('button', { name: /Start walkthrough/ }).click();
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.getByText('Step 2 of 3')).toBeVisible();
  await question(page).fill('Why use a hash map here?');
  await emit(page, 'answer');
  await expect(page.getByText('DEEPER EXPLANATION')).toBeVisible();
  await expect(page.getByText('Step 2 of 3')).toBeVisible();
  expect(asked.map(a => a.mode)).toEqual(['walkthrough', 'coding']);
  expect(asked[1].question).toContain('answer my question: Why use a hash map here?');
});

test('Retry after a walkthrough fails before its first step retries the same problem (REN-2)', async ({ page }) => {
  const asked = await answers(page, (body, index) => index === 0 ? { status: 503, error: 'Database unavailable' } : standard(body));
  await demo(page);
  await mode(page, 'Walkthrough');
  await question(page).fill('Explain two sum step by step');
  await page.getByRole('button', { name: /Start walkthrough/ }).click();
  await expect(page.locator('.walk-error')).toContainText('Database unavailable');
  await question(page).fill('');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
  expect(asked.map(a => a.question)).toEqual(['Explain two sum step by step', 'Explain two sum step by step']);
});

test('collected screenshots are answered together with the last one', async ({ page }) => {
  const asked = await answers(page);
  await demo(page);
  for (let n = 1; n <= 3; n++) {
    await emit(page, 'collect');
    await expect.poll(async () => (await lastPopupState(page))?.shots).toBe(n);
  }
  await emit(page, 'screenshot');
  await expect(page.locator('.answer-text')).toContainText('Answer to: Read and solve the problem in this screenshot.');
  expect(asked[0].mode).toBe('coding');
  expect(asked[0].images).toHaveLength(4);
  expect(asked[0].images!.every(image => image.startsWith('data:image/jpeg;base64,'))).toBe(true);
  expect(await calls(page, 'selectSource')).toHaveLength(4);
  await expect.poll(async () => (await lastPopupState(page))?.shots).toBe(0);
});

test('listening shows the live transcript and answers once the speaker pauses', async ({ page }) => {
  const asked = await answers(page);
  await demo(page);
  await emit(page, 'capture');
  await expect(page.locator('.pill.live')).toHaveText('● Listening');
  await expect(page.locator('.transcript-final')).toContainText('Tell me about a project you built.');
  await expect(page.locator('.answer-text')).toContainText('Answer to: [DEMO — no audio transcription] Tell me about', { timeout: 10_000 });
  expect(asked).toHaveLength(1);
  expect((await lastPopupState(page))?.status).toBe('listening');
  await emit(page, 'capture');
  await expect(page.locator('.pill', { hasText: 'Ready' })).toBeVisible();
});

test('a failed heartbeat stops the session and says why', async ({ page }) => {
  await answers(page);
  await demo(page);
  await question(page).fill('Start a session');
  await page.getByRole('button', { name: /Generate answer/ }).click();
  await expect(page.getByRole('button', { name: 'Ⅱ Pause' })).toBeVisible();
  await page.route(`${API}/sessions/*/heartbeat`, route => route.abort('connectionrefused'));
  await expect(page.getByRole('alert')).toContainText('Connection lost. Capture stopped', { timeout: 10_000 });
  await expect(page.getByRole('button', { name: '▷ Resume' })).toBeVisible();
});

async function live(page: Page, account: (authorization: string) => number) {
  await page.route(`${API}/health`, route => route.fulfill({ headers: CORS, json: { status: 'ok', mode: 'live', configured: { auth: true, ai: true } } }));
  await page.route(`${API}/account`, route => route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS })
    : route.fulfill({ status: account(route.request().headers().authorization), headers: CORS, json: { balanceSeconds: 0, plan: 'owner', email: 'me@example.com', metered: false, error: 'Sign in again' } }));
}
test('an expired access token is refreshed once and the request retried', async ({ page }) => {
  await installCtrue(page, { credentials: 'old-token', refresh: 'new-token' });
  await live(page, authorization => authorization === 'Bearer new-token' ? 200 : 401);
  await page.goto('/');
  await expect(page.locator('.account-line strong')).toHaveText('me');
  expect(await calls(page, 'refresh')).toHaveLength(1);
});
test('a login that can no longer be refreshed returns to the sign-in screen', async ({ page }) => {
  await installCtrue(page, { credentials: 'old-token', refresh: null });
  await live(page, () => 401);
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Your login expired. Sign in again.');
  await expect(page.getByText('Connect your Ctrue account')).toBeVisible();
});

test('saving profile facts waits until the saved facts have loaded (REN-10)', async ({ page }) => {
  await demo(page);
  await page.route(`${API}/profile`, route => route.request().method() === 'GET' ? route.fulfill({ status: 503, headers: CORS, json: { error: 'Database unavailable' } }) : route.fallback());
  await page.getByRole('button', { name: 'My profile' }).click();
  await expect(page.getByRole('alert')).toContainText('Database unavailable');
  await expect(page.getByRole('button', { name: 'Save reviewed facts' })).toBeDisabled();
});

test('profile facts save and delete', async ({ page }) => {
  await demo(page);
  await page.getByRole('button', { name: 'My profile' }).click();
  // Save unlocks once the stored facts have loaded; typing earlier would be replaced by them.
  await expect(page.getByRole('button', { name: 'Save reviewed facts' })).toBeEnabled();
  await page.locator('#profile-facts').fill('Built a calendar app used by 2,000 students.');
  await page.getByRole('button', { name: 'Save reviewed facts' }).click();
  await expect(page.getByText('Verified profile saved.')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete profile' }).click();
  await expect(page.getByText('Resume facts deleted.')).toBeVisible();
  await expect(page.locator('#profile-facts')).toHaveValue('');
});

test('the OpenAI key form refuses a malformed key, then saves and removes a real one', async ({ page }) => {
  await demo(page);
  await page.getByRole('button', { name: 'Preferences' }).click();
  const key = page.getByLabel('Your OpenAI API key');
  await key.fill('not-a-key');
  await page.getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByRole('alert')).toContainText('That does not look like an OpenAI API key');
  await key.fill('sk-proj-abcdefghijklmnopqrstuvwxyz012345');
  await page.getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByText('saved on this Mac, encrypted')).toBeVisible();
  await page.getByRole('button', { name: 'Remove key' }).click();
  await expect(page.getByText('Status: not added')).toBeVisible();
});

test('recording a shortcut saves the keys pressed', async ({ page }) => {
  await demo(page);
  await page.getByRole('button', { name: 'Preferences' }).click();
  const capture = page.locator('.setting-row', { hasText: 'Listen to the call' }).locator('input');
  await capture.click();
  await expect(capture).toHaveValue('Press the new shortcut…');
  await page.keyboard.press('Shift+K');
  await expect(capture).toHaveValue('Press the new shortcut…');
  await page.keyboard.press('Meta+K');
  await expect(capture).toHaveValue('⌘ K');
  await page.getByRole('button', { name: 'Save shortcuts' }).click();
  await expect(page.getByText('Shortcuts saved.')).toBeVisible();
  expect((await calls(page, 'shortcuts'))[0].args[0]).toMatchObject({ capture: 'CommandOrControl+K' });
  expect((await calls(page, 'recording')).map(c => c.args[0])).toEqual([true, false]);
});

test('a downloaded update stays installable when a later background check fails (REN-11)', async ({ page }) => {
  await demo(page);
  await emit(page, 'update-ready', '0.2.0');
  await expect(page.getByText('Ctrue 0.2.0 is ready. Restart to finish updating.')).toBeVisible();
  await emit(page, 'update-fallback');
  await expect(page.getByRole('button', { name: 'Restart to update' })).toBeVisible();
  // A failure while installing still offers the manual download.
  await page.getByRole('button', { name: 'Restart to update' }).click();
  expect(await calls(page, 'installUpdate')).toHaveLength(1);
  await emit(page, 'update-fallback');
  await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
});

test('without screen access the app sends the user to System Settings and offers a restart', async ({ page }) => {
  await installCtrue(page, { permissions: { screen: 'denied', microphone: 'granted' } });
  await page.goto('/');
  await expect(page.getByText('Allow screen and audio access')).toBeVisible();
  await page.getByRole('button', { name: 'Open System Settings' }).click();
  await page.getByRole('button', { name: 'Restart Ctrue' }).click();
  expect((await calls(page, 'requestPermission')).map(c => c.args[0])).toContain('screen');
  expect(await calls(page, 'relaunch')).toHaveLength(1);
});

test('signing out ends the session and clears the whole conversation, including the question box (REN-6)', async ({ page }) => {
  await answers(page);
  await demo(page);
  await question(page).fill('Something private');
  await page.getByRole('button', { name: /Generate answer/ }).click();
  await expect(page.locator('.answer-text')).toContainText('Something private');
  await page.getByRole('button', { name: 'Preferences' }).click();
  await page.getByRole('button', { name: 'Sign out & clear context' }).click();
  await page.getByRole('button', { name: 'Live assistant' }).click();
  await expect(page.getByText('Connect your Ctrue account')).toBeVisible();
  await expect(page.getByText('Something private')).toHaveCount(0);
  expect(await calls(page, 'signout')).toHaveLength(1);
});

test('a resume over the 8 MB upload limit is refused before it is sent (REN-26)', async ({ page }) => {
  await demo(page);
  let uploads = 0;
  await page.route(`${API}/profile/import`, route => { uploads++; return route.fallback(); });
  await page.getByRole('button', { name: 'My profile' }).click();
  await page.locator('.upload-label input[type=file]').setInputFiles({ name: 'resume.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(8_500_000) });
  await expect(page.getByRole('alert')).toContainText('Resume must be under 8 MB.');
  expect(uploads).toBe(0);
});
