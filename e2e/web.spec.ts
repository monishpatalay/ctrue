import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { API } from './playwright.config';

// The website in local demo mode (no Neon sign-in) against the demo API. Google sign-in itself needs a real account
// and is on the device checklist.
const PAGES = ['/', '/downloads', '/login', '/privacy', '/terms', '/dashboard'];
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const plan = (page: Page, value: string) => page.route(`${API}/account`, route => route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS })
  : route.fulfill({ headers: CORS, json: { balanceSeconds: 600, plan: value, metered: false, email: 'someone@example.com' } }));

test.afterEach(async ({ request }) => {
  const headers = { Authorization: 'Bearer demo' };
  const session = await (await request.post(`${API}/sessions`, { headers, data: {} })).json();
  await request.post(`${API}/sessions/${session.id}/end`, { headers, data: {} });
});

test('the home page leads to the download and the workspace', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Stay present.Think clearly.');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.getByRole('link', { name: /Get Ctrue/ }).click();
  await expect(page).toHaveURL(/\/downloads$/);
  // No published installer URL in this environment: the page says so instead of linking nowhere.
  await expect(page.getByText('Build locally')).toHaveCount(2);
});

test('legal pages render, and the contact line says when no address is configured', async ({ page }) => {
  for (const path of ['/privacy', '/terms']) {
    await page.goto(path);
    await expect(page.getByText('Last updated October 13, 2026')).toBeVisible();
    await expect(page.getByText('Contact details will be published here before launch.')).toBeVisible();
  }
});

test('the login page offers the local demo while sign-in is not configured', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeDisabled();
  await page.getByRole('link', { name: /Open local demo/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('LOCAL DEMO').first()).toBeVisible();
});

test('a dashboard session starts, pauses, resumes and ends', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByText('Demo responses')).toBeVisible();
  await page.getByRole('button', { name: /Start session/ }).click();
  await expect(page.locator('.badge.live-badge')).toHaveText('Active');
  await expect(page.locator('.timer')).not.toHaveText('0:00', { timeout: 5_000 });
  await page.getByRole('button', { name: 'Pause session' }).click();
  await expect(page.getByText('Paused')).toBeVisible();
  await page.getByRole('button', { name: 'Resume session' }).click();
  await expect(page.locator('.badge.live-badge')).toHaveText('Active');
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page.getByRole('button', { name: /Start session/ })).toBeVisible();
});

test('a practice answer streams in the demo', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByLabel('Practice question').fill('Explain a hash map.');
  await page.getByRole('button', { name: /Generate answer/ }).click();
  await expect(page.getByLabel('Generated answer')).toContainText('[DEMO — no AI request made] Practice technical response.');
});

test('accounts without the server key are pointed to the desktop app instead of a failing answer form (WEB-1)', async ({ page }) => {
  await plan(page, 'trial');
  await page.goto('/dashboard');
  await expect(page.getByText('uses your own OpenAI key, which stays in the Ctrue desktop app')).toBeVisible();
  await expect(page.getByLabel('Practice question')).toHaveCount(0);
});

test('the owner account keeps the answer form', async ({ page }) => {
  await plan(page, 'owner');
  await page.goto('/dashboard');
  await expect(page.getByLabel('Practice question')).toBeVisible();
});

test('resume facts import from PDF and DOCX, then save and delete', async ({ page }) => {
  await page.goto('/dashboard');
  const facts = page.getByLabel('Reviewed profile facts');
  const upload = page.locator('input[type=file]');
  await upload.setInputFiles(join(__dirname, 'fixtures/resume.pdf'));
  await expect(facts).toHaveValue(/Built a calendar app used by 2,000 students\./);
  await upload.setInputFiles(join(__dirname, 'fixtures/resume.docx'));
  await expect(facts).toHaveValue('Led a team of four to ship a payments API.');
  await page.getByRole('button', { name: 'Approve & save facts' }).click();
  await expect(page.getByText('Reviewed profile saved.')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete profile' }).click();
  await expect(page.getByText('Resume facts deleted.')).toBeVisible();
  await expect(facts).toHaveValue('');
});

test('a file that is not a resume is refused before upload', async ({ page }) => {
  await page.goto('/dashboard');
  await page.locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.locator('p.error')).toHaveText('Choose a PDF or DOCX resume.');
});

test('an unreachable service is reported on the dashboard', async ({ page }) => {
  await page.route(`${API}/health`, route => route.abort('connectionrefused'));
  await page.goto('/dashboard');
  await expect(page.getByRole('alert').first()).toContainText('Cannot reach Ctrue service.');
});

for (const path of PAGES) {
  test(`${path} has no serious accessibility violations and no sideways scrolling from 320 to 1440 px`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.help} at ${v.nodes.map(n => n.target.join(' ')).join(', ')}`);
    expect(serious).toEqual([]);
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${width}px wide`).toBeLessThanOrEqual(0);
    }
  });
}
