import { expect, test } from '@playwright/test';

test.describe('PrimeNgTest e2e', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // Self-test: the route loaded and the component rendered its card.
  test('renders the demo card (self-test)', async ({ page }) => {
    await expect(page.getByText('PrimeNG + Transloco Smoke Test')).toBeVisible();
    await expect(page.getByLabel('Your name')).toBeVisible();
  });

  test('greets the typed name', async ({ page }) => {
    await expect(page.getByText('Hello, stranger 👋')).toBeVisible();

    await page.getByLabel('Your name').fill('Ada');

    await expect(page.getByText('Hello, Ada 👋')).toBeVisible();
  });

  test('shows a toast and counts the clicks', async ({ page }) => {
    await expect(page.getByText('Clicks: 0')).toBeVisible();

    await page.getByRole('button', { name: 'Show toast' }).click();

    const toast = page.getByRole('alert');
    await expect(toast).toContainText('It works!');
    await expect(toast).toContainText('Hello stranger — clicked 1 time(s).');
    await expect(page.getByText('Clicks: 1')).toBeVisible();

    await page.getByRole('button', { name: 'Show toast' }).click();

    await expect(page.getByText('Clicks: 2')).toBeVisible();
  });

  test('greets the typed name in the toast', async ({ page }) => {
    await page.getByLabel('Your name').fill('Ada');
    await page.getByRole('button', { name: 'Show toast' }).click();

    await expect(page.getByRole('alert')).toContainText('Hello Ada — clicked 1 time(s).');
  });

  test('switches the language to German', async ({ page }) => {
    await page.getByRole('button', { name: 'DE' }).click();

    await expect(page.getByText('PrimeNG + Transloco Test', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Dein Name')).toBeVisible();
    await expect(page.getByText('Hallo, Unbekannte:r 👋')).toBeVisible();
  });
});
