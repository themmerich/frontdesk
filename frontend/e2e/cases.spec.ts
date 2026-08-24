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

// The shell routes sit behind the auth guard, which probes /api/auth/me once
// per app start — a mocked session keeps these specs focused on the case list.
const mockUser = {
  username: 'admin',
  displayName: 'Anna Admin',
  role: 'admin',
  tenantName: 'Musterfirma GmbH',
};

test.describe('Cases page', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: mockUser }));
    await page.route('**/api/company', (route) => route.fulfill({ json: { name: 'Musterfirma GmbH', hasLogo: false } }));
  });

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

  test('filters the list down to the cases with an attachment', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.fulfill({ json: mockCases }));

    await page.goto('/');
    // The attachment column is the first one and filters through a tri-state checkbox.
    await page.getByRole('columnheader', { name: 'Anhang' }).getByRole('button').click();
    await page.getByRole('checkbox').click();

    await expect(page.getByRole('row', { name: /Invoice copy/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Delivery status/ })).toHaveCount(0);
  });

  test('lets the admin resize a column', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.fulfill({ json: mockCases }));

    await page.goto('/');
    const senderColumn = page.getByRole('columnheader').first();
    const before = (await senderColumn.boundingBox())!.width;

    // Drag the handle at the column's right edge to the left. Fit mode hands the
    // width to the neighbour, which always has room for it — widening instead
    // would stop at whatever the neighbour can spare.
    const handle = (await senderColumn.locator('.p-datatable-column-resizer').boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x - 50, handle.y + handle.height / 2, { steps: 10 });
    await page.mouse.up();

    expect((await senderColumn.boundingBox())!.width).toBeLessThan(before - 20);
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
