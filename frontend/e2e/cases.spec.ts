import { expect, test } from '@playwright/test';

// The e2e suite runs without a backend: the API is mocked per test via
// page.route, so the specs only verify the frontend's behavior. Assertions use
// the German texts because de is the default language.
const mockCases = [
  {
    id: '1',
    sender: 'anna@example.com',
    subject: 'Delivery status',
    receivedAt: '2026-08-19T08:30:00Z',
    hasAttachments: false,
    sizeBytes: 2048,
  },
  {
    id: '2',
    sender: 'ben@example.com',
    subject: 'Invoice copy',
    receivedAt: '2026-08-19T09:15:00Z',
    hasAttachments: true,
    sizeBytes: 1.4 * 1024 * 1024,
  },
];

test.describe('Cases page', () => {
  test('lists the cases returned by the API', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.fulfill({ json: mockCases }));

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Vorgänge' })).toBeVisible();
    await expect(page.getByRole('row', { name: /anna@example\.com/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Invoice copy/ })).toBeVisible();
    // German number format and unit for the size column; paperclip only on the attachment row.
    await expect(page.getByRole('row', { name: /Invoice copy/ }).getByRole('img', { name: 'Hat Anhang' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Invoice copy/ })).toContainText('1,4 MB');
    await expect(page.getByRole('row', { name: /anna@example\.com/ })).toContainText('2 KB');
  });

  test('shows an empty state when there are no cases', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.fulfill({ json: [] }));

    await page.goto('/');

    await expect(page.getByText('Noch keine Vorgänge')).toBeVisible();
  });

  test('shows an error message when the API is unreachable', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.abort('connectionrefused'));

    await page.goto('/');

    await expect(page.getByText('Vorgänge konnten nicht geladen werden.')).toBeVisible();
  });
});
