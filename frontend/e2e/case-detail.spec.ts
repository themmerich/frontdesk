import { expect, test } from '@playwright/test';

// Backend-less like the other e2e specs: the API is mocked per test, the
// assertions use the German texts because de is the default language.
const mockUser = { username: 'admin', displayName: 'Anna Admin', role: 'admin', tenantName: 'Musterfirma GmbH' };

const listed = [
  {
    id: '1',
    sender: 'kunde@example.com',
    recipient: 'rechnung@musterfirma.de',
    subject: 'Rechnung 2026-081',
    receivedAt: '2026-08-19T09:15:00Z',
    hasAttachments: true,
    sizeBytes: 2048,
    summary: 'Kunde bittet um eine Kopie.',
    categoryName: 'Rechnung',
    categoryColor: 'amber',
    tier: 'draft',
    confidence: 0.72,
  },
  {
    id: '2',
    sender: 'ben@example.com',
    recipient: 'info@musterfirma.de',
    subject: 'Lieferung 4711',
    receivedAt: '2026-08-19T08:30:00Z',
    hasAttachments: false,
    sizeBytes: 1024,
    summary: null,
    categoryName: null,
    categoryColor: null,
    tier: null,
    confidence: null,
  },
];

const detail = { ...listed[0], bodyText: 'Sehr geehrte Damen und Herren,\n\nbitte senden Sie mir eine Kopie zu.' };

test.describe('Case detail', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: mockUser }));
    await page.route('**/api/company', (route) => route.fulfill({ json: { name: 'Musterfirma GmbH', hasLogo: false } }));
    await page.route('**/api/cases', (route) => route.fulfill({ json: listed }));
    await page.route('**/api/cases/1', (route) => route.fulfill({ json: detail }));
    await page.route('**/api/cases/2', (route) => route.fulfill({ json: { ...listed[1], bodyText: 'Wo bleibt die Lieferung?' } }));
  });

  test('opens a case from the inbox and shows what the list cannot', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('row', { name: /Rechnung 2026-081/ }).dblclick();

    await expect(page).toHaveURL(/\/cases\/1$/);
    await expect(page.getByRole('heading', { name: 'Rechnung 2026-081' })).toBeVisible();
    // The body is the whole reason this page exists; the list never carries it.
    await expect(page.getByText('bitte senden Sie mir eine Kopie zu.')).toBeVisible();
    await expect(page.getByText('Kunde bittet um eine Kopie.')).toBeVisible();
    await expect(page.getByText('72')).toBeVisible();
    // The mail says it has attachments, so the page says they are missing.
    await expect(page.getByText('Diese Mail hat Anhänge')).toBeVisible();
  });

  test('pages through the list order and back again', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('row', { name: /Rechnung 2026-081/ }).dblclick();

    await expect(page.getByText('Vorgang 1 von 2')).toBeVisible();
    await page.getByRole('button', { name: 'Nächster Vorgang' }).click();

    await expect(page).toHaveURL(/\/cases\/2$/);
    await expect(page.getByRole('heading', { name: 'Lieferung 4711' })).toBeVisible();
    await expect(page.getByText('Vorgang 2 von 2')).toBeVisible();
    // At the end there is nothing further to page to.
    await expect(page.getByRole('button', { name: 'Nächster Vorgang' })).toBeDisabled();

    await page.getByRole('button', { name: 'Vorheriger Vorgang' }).click();
    await expect(page).toHaveURL(/\/cases\/1$/);
  });

  test('opens a case through the row action', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('row', { name: /Rechnung 2026-081/ })
      .getByRole('button', { name: 'Bearbeiten' })
      .click();

    await expect(page).toHaveURL(/\/cases\/1$/);
    await expect(page.getByRole('heading', { name: 'Rechnung 2026-081' })).toBeVisible();
  });

  test('offers no paging when the case was opened through a link', async ({ page }) => {
    await page.goto('/cases/1');

    await expect(page.getByRole('heading', { name: 'Rechnung 2026-081' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nächster Vorgang' })).toHaveCount(0);
  });

  test('lets a person overrule the tier', async ({ page }) => {
    let sent: Record<string, unknown> | undefined;
    await page.route('**/api/cases/1/tier', (route) => {
      sent = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: { ...detail, tier: 'manual' } });
    });

    await page.goto('/cases/1');
    await page.locator('p-select').click();
    await page.getByRole('option', { name: 'Manuell' }).click();

    await expect(page.getByText('Stufe geändert.')).toBeVisible();
    expect(sent).toMatchObject({ tier: 'manual' });
  });

  test('deletes a case and moves on to the next one', async ({ page }) => {
    await page.route('**/api/cases', (route) => {
      if (route.request().method() === 'DELETE') {
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fulfill({ json: listed });
    });

    await page.goto('/');
    await page.getByRole('row', { name: /Rechnung 2026-081/ }).dblclick();
    // Wait for the detail before looking for its delete button: the inbox has
    // buttons of that name too, and clicking one of them would prove nothing.
    await expect(page).toHaveURL(/\/cases\/1$/);
    await page.getByRole('main').getByRole('button', { name: 'Löschen' }).click();
    await page.getByRole('alertdialog', { name: 'Löschen bestätigen' }).getByRole('button', { name: 'Löschen' }).click();

    await expect(page.getByText('Vorgang gelöscht.')).toBeVisible();
    // Tidying up happens in a run, so the next case rather than the inbox.
    await expect(page).toHaveURL(/\/cases\/2$/);
  });
});
