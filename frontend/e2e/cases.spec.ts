import { expect, test } from '@playwright/test';

// The e2e suite runs without a backend: the API is mocked per test via
// page.route, so the specs only verify the frontend's behavior.
const mockCases = [
  { id: '1', sender: 'anna@example.com', subject: 'Delivery status', receivedAt: '2026-08-19T08:30:00Z' },
  { id: '2', sender: 'ben@example.com', subject: 'Invoice copy', receivedAt: '2026-08-19T09:15:00Z' },
];

test.describe('Cases page', () => {
  test('lists the cases returned by the API', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.fulfill({ json: mockCases }));

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Cases' })).toBeVisible();
    await expect(page.getByRole('row', { name: /anna@example\.com/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Invoice copy/ })).toBeVisible();
  });

  test('shows an empty state when there are no cases', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.fulfill({ json: [] }));

    await page.goto('/');

    await expect(page.getByText('No cases yet')).toBeVisible();
  });

  test('shows an error message when the API is unreachable', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.abort('connectionrefused'));

    await page.goto('/');

    await expect(page.getByText('Could not load cases.')).toBeVisible();
  });
});
