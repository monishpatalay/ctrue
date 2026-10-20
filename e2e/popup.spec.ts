import { expect, test, type Page } from '@playwright/test';
import { calls, emit, installCtrue } from './ctrue-stub';

// The pop-up only renders what the main window sends it (Popup.tsx); these tests drive it with popup-state events.
const base = { status: 'ready', question: '', answer: '', heard: '', error: '', shots: 0, mic: false, history: [], walk: null };
const step = (title: string, extra = {}) => ({ kind: 'step', phase: 'optimal', title, say: `Say ${title}`, code: `code for ${title}`, action: 'add', replaces: null, why: `Why ${title}`, breaks: null, details: null, ...extra });
const show = (page: Page, state: Record<string, unknown>) => emit(page, 'popup-state', { ...base, ...state });

test.beforeEach(async ({ page }) => {
  await installCtrue(page);
  await page.goto('/#popup');
  await expect(page.getByLabel('Ctrue answer')).toBeVisible();
});

test('shows the shortcut hint, the live status and what is being heard', async ({ page }) => {
  await expect(page.getByText('⌘L listen · ⌘J answer screen · ⌘⇧J add screen · ⌘H hide')).toBeVisible();
  await show(page, { status: 'listening', heard: 'What is a hash' });
  await expect(page.getByText('● Listening')).toBeVisible();
  await expect(page.getByText('Hearing…')).toBeVisible();
  await expect(page.getByText('What is a hash')).toBeVisible();
});

test('keeps earlier answers above the current one and copies the current answer', async ({ page }) => {
  await show(page, { question: 'Second?', answer: 'Second answer', history: [{ question: 'First?', text: 'First answer' }] });
  const texts = await page.locator('.popup-answer').allTextContents();
  expect(texts).toEqual(['First answer', 'Second answer']);
  await page.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Second answer');
});

test('a step explanation appears once, and only under its own step (REN-3)', async ({ page }) => {
  const steps = { total: 3, more: false };
  await show(page, { answer: 'Deeper detail about step one', walk: { step: step('One'), index: 0, ...steps, explanation: 'Deeper detail about step one' } });
  await expect(page.getByText('Deeper detail about step one')).toHaveCount(1);
  // Moving on: the main window still holds the last answer, but it belongs to step one.
  await show(page, { answer: 'Deeper detail about step one', walk: { step: step('Two'), index: 1, ...steps, explanation: '' } });
  await expect(page.getByText('Step 2 of 3 · Two')).toBeVisible();
  await expect(page.getByText('Deeper detail about step one')).toHaveCount(0);
});

test('walkthrough steps show what to say, replacements and navigation', async ({ page }) => {
  await show(page, { walk: { step: step('Swap', { action: 'replace', replaces: 'old line', breaks: 'It fails later' }), index: 0, total: 2, more: true, explanation: '' } });
  await expect(page.getByText('Step 1 of 2 · more coming… · Swap')).toBeVisible();
  await expect(page.getByText('Say Swap')).toBeVisible();
  await expect(page.getByText('old line')).toBeVisible();
  await expect(page.getByText('It fails later')).toBeVisible();
  await expect(page.getByRole('button', { name: '← Prev' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next →' }).click();
  expect(await calls(page, 'popupStep')).toEqual([{ name: 'popupStep', args: [1] }]);
});

test('the microphone notice turns the microphone off or goes away', async ({ page }) => {
  await show(page, { status: 'listening', mic: true });
  await page.getByRole('button', { name: 'Turn off mic' }).click();
  expect(await calls(page, 'popupMicOff')).toHaveLength(1);
  await page.getByRole('button', { name: 'Keep it on' }).click();
  await expect(page.getByText('“Include microphone” is on')).toHaveCount(0);
});

test('shows errors and collected screenshots', async ({ page }) => {
  await show(page, { error: 'Your OpenAI API key was rejected.', shots: 2 });
  await expect(page.getByRole('alert')).toHaveText('Your OpenAI API key was rejected.');
  await expect(page.getByText('2 screenshots ready.')).toBeVisible();
});

test('a follow-up is sent to the main window, but not while thinking', async ({ page }) => {
  const box = page.getByLabel('Follow-up question');
  await box.fill('  And the space complexity?  ');
  await page.getByRole('button', { name: 'Ask' }).click();
  expect(await calls(page, 'popupAsk')).toEqual([{ name: 'popupAsk', args: ['And the space complexity?'] }]);
  await expect(box).toHaveValue('');
  await show(page, { status: 'thinking' });
  await box.fill('Another one');
  await expect(page.getByRole('button', { name: 'Ask' })).toBeDisabled();
  await page.getByRole('button', { name: 'Hide pop-up' }).click();
  expect(await calls(page, 'popupHide')).toHaveLength(1);
});
