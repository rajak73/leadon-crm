import { test, expect, type Page } from '@playwright/test';

// Password reused across signups; emails are generated uniquely per signup call.
const password = 'LeadOS@123';

let counter = 0;
async function signup(page: Page) {
  // Unique email per signup call so parallel/independent tests don't collide.
  const uniq = `e2e.${Date.now()}.${counter++}@test.local`;
  await page.goto('/signup');
  await page.getByLabel('First name', { exact: true }).fill('E2E');
  await page.getByLabel('Last name', { exact: true }).fill('User');
  await page.getByLabel('Work email', { exact: true }).fill(uniq);
  await page.getByLabel('Workspace name', { exact: true }).fill('E2E Realty');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 15000 });
}

test('marketing page renders hero + CTA', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /turn every conversation into revenue/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /get started/i }).first()).toBeVisible();
});

test('signup creates a workspace and lands on the dashboard', async ({ page }) => {
  await signup(page);
  // Dashboard title (rendered as a styled div, not a semantic heading).
  await expect(page.getByText('Dashboard', { exact: true }).first()).toBeVisible();
  // Sidebar shows core nav.
  await expect(page.getByRole('link', { name: /Leads/ }).first()).toBeVisible();
});

test('create a lead and see it in the table', async ({ page }) => {
  await signup(page);
  await page.goto('/app/leads');
  await expect(page.getByRole('button', { name: /New Lead/ })).toBeVisible();
  await page.getByRole('button', { name: /New Lead/ }).click();
  await page.getByLabel('Name', { exact: true }).fill('Playwright Prospect');
  await page.getByLabel('Phone', { exact: true }).fill('9812345678');
  await page.getByRole('button', { name: /Create Lead/ }).click();
  await expect(page.getByText('Playwright Prospect')).toBeVisible();
});

test('global search (⌘K) finds the lead', async ({ page }) => {
  await signup(page);
  // create a lead first
  await page.goto('/app/leads');
  await page.getByRole('button', { name: /New Lead/ }).click();
  await page.getByLabel('Name', { exact: true }).fill('SearchTarget Xyz');
  await page.getByRole('button', { name: /Create Lead/ }).click();
  await expect(page.getByText('SearchTarget Xyz')).toBeVisible();

  // open command palette and search
  await page.keyboard.press('Control+k');
  const input = page.getByPlaceholder(/Search leads, contacts, deals/i);
  await expect(input).toBeVisible();
  await input.fill('SearchTarget');
  await expect(page.getByText('SearchTarget Xyz')).toBeVisible();
});

test('dark mode toggle switches theme', async ({ page }) => {
  await signup(page);
  const html = page.locator('html');
  const before = await html.getAttribute('data-theme');
  await page.getByTitle('Theme').click();
  await expect
    .poll(async () => html.getAttribute('data-theme'))
    .not.toBe(before);
});

test('open a deal detail page from the pipeline', async ({ page }) => {
  await signup(page);
  await page.goto('/app/pipeline');
  await page.getByRole('button', { name: /New Deal/ }).click();
  await page.getByLabel('Title', { exact: true }).fill('E2E Deal');
  await page.getByLabel('Value (₹)', { exact: true }).fill('250000');
  await page.getByRole('button', { name: /Create Deal/ }).click();
  await page.getByRole('link', { name: 'E2E Deal' }).click();
  await expect(page).toHaveURL(/\/app\/deals\/.+/);
  await expect(page.getByRole('button', { name: /Edit/ })).toBeVisible();
});

test('contact detail: add a note to the timeline', async ({ page }) => {
  await signup(page);
  await page.goto('/app/contacts');
  await page.getByRole('button', { name: /New Contact/ }).click();
  await page.getByLabel('Name', { exact: true }).fill('Timeline Contact');
  await page.getByRole('button', { name: /Create Contact/ }).click();
  await page.getByRole('link', { name: /Customer 360/ }).first().click();
  await expect(page).toHaveURL(/\/app\/contacts\/.+/);
  await page.getByPlaceholder('Add a note…').fill('Followed up by phone');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Followed up by phone')).toBeVisible();
});

test('inline edit a lead on the detail page', async ({ page }) => {
  await signup(page);
  await page.goto('/app/leads');
  await page.getByRole('button', { name: /New Lead/ }).click();
  await page.getByLabel('Name', { exact: true }).fill('Editable Lead');
  await page.getByRole('button', { name: /Create Lead/ }).click();
  await page.getByRole('link', { name: 'Editable Lead' }).click();
  await expect(page).toHaveURL(/\/app\/leads\/.+/);

  await page.getByRole('button', { name: /Edit/ }).click();
  await page.getByLabel('Phone', { exact: true }).fill('9998887777');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('9998887777')).toBeVisible();
});

test('keyboard shortcuts: help overlay + g-then-key navigation', async ({ page }) => {
  await signup(page);
  // "?" opens the shortcuts help.
  await page.keyboard.press('?');
  await expect(page.getByText('Keyboard Shortcuts')).toBeVisible();
  await page.keyboard.press('Escape');
  // "g" then "l" navigates to Leads.
  await page.keyboard.press('g');
  await page.keyboard.press('l');
  await expect(page).toHaveURL(/\/app\/leads$/);
});

test('logout returns to marketing site', async ({ page }) => {
  await signup(page);
  await page.getByRole('button', { name: /Sign out/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /turn every conversation into revenue/i })).toBeVisible();
});
