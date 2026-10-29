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

test('while listening, the pop-up says who is heard and that listening can stay on all call', async ({ page }) => {
  await show(page, { status: 'listening' });
  await expect(page.locator('.popup-status')).toHaveText('● Listening to them');
  await expect(page.getByText('Only the other person is heard, not you, so leave this on for the whole call.')).toBeVisible();
  // It stays visible once an answer is showing.
  await show(page, { status: 'listening', question: 'What is MongoDB?', answer: 'A document database.' });
  await expect(page.locator('.popup-status')).toHaveText('● Listening to them');
  await show(page, { status: 'listening', mic: true });
  await expect(page.locator('.popup-status')).toHaveText('● Listening to you both');
});
test('a new question starts at the top of the pop-up; earlier answers are above it, out of view', async ({ page }) => {
  await page.setViewportSize({ width: 460, height: 420 });
  const body = page.locator('.popup-body');
  const top = async (selector: string) => (await page.locator(selector).last().boundingBox())!.y - (await body.boundingBox())!.y;
  await show(page, { status: 'listening', question: 'What is MongoDB?', answer: 'A document database.' });
  // A short earlier answer still ends up fully out of view, even with a short new one.
  await show(page, { status: 'thinking', question: 'What is Redis?', answer: 'An in-memory', history: [{ question: 'What is MongoDB?', text: 'A document database.' }] });
  await expect.poll(() => top('.popup-current .popup-question')).toBeLessThan(16);
  expect(await top('.popup-past')).toBeLessThan(0);
  await expect(page.locator('.popup-past')).not.toBeInViewport();
  // The answer streaming in does not move the view.
  const scrolled = await body.evaluate(element => element.scrollTop);
  await show(page, { status: 'thinking', question: 'What is Redis?', answer: 'An in-memory key-value store.\n\n' + 'It keeps data in memory for speed. '.repeat(40), history: [{ question: 'What is MongoDB?', text: 'A document database.' }] });
  await page.waitForTimeout(200);
  expect(await body.evaluate(element => element.scrollTop)).toBe(scrolled);
  // Scrolling up shows the earlier answer.
  await body.evaluate(element => element.scrollTo({ top: 0 }));
  await expect(page.getByText('A document database.')).toBeInViewport();
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

test('on Windows the pop-up hint names the keys', async ({ page }) => {
  await installCtrue(page, { platform: 'win32' });
  await page.reload(); // the same URL with a hash would not load a new page, so the Windows stub would never run
  await expect(page.getByText('Ctrl+L listen · Ctrl+J answer screen · Ctrl+Shift+J add screen · Ctrl+H hide')).toBeVisible();
});

test('Clear sits beside Copy and clears the whole conversation; nothing to clear, no button', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(0);
  await show(page, { question: 'Second?', answer: 'Second answer', history: [{ question: 'First?', text: 'First answer' }] });
  await expect(page.locator('.popup-bar button')).toHaveText(['Copy', 'Clear', '×']);
  await page.getByRole('button', { name: 'Clear' }).click();
  expect(await calls(page, 'popupClear')).toHaveLength(1);
  await show(page, { status: 'listening', heard: 'Still talking' });
  await expect(page.getByRole('button', { name: 'Clear' })).toBeVisible();
});
