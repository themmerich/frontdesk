import { expect, test } from '@playwright/test';

// The e2e suite runs without a backend: the API is mocked per test via page.route.
// Assertions use the German texts because de is the default language.
const mockUser = {
  username: 'admin',
  displayName: 'Anna Admin',
  role: 'admin',
  tenantName: 'Musterfirma GmbH',
};

/** Two from today, one from yesterday; one of them still waiting for the triage. */
function mockCases() {
  const today = new Date();
  today.setHours(9, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const base = { recipient: 'info@example.com', hasAttachments: false, sizeBytes: 2048, summary: null };
  return [
    {
      ...base,
      id: '1',
      sender: 'anna@example.com',
      subject: 'Lieferstatus',
      receivedAt: today.toISOString(),
      categoryName: 'Statusanfrage Bestellung',
      categoryColor: 'blue',
      tier: 'automatic',
      confidence: 0.95,
    },
    {
      ...base,
      id: '2',
      sender: 'ben@example.com',
      subject: 'Reklamation',
      receivedAt: today.toISOString(),
      categoryName: 'Reklamation',
      categoryColor: 'red',
      tier: 'manual',
      confidence: 0.7,
    },
    {
      ...base,
      id: '3',
      sender: 'cara@example.com',
      subject: 'Noch unbewertet',
      receivedAt: yesterday.toISOString(),
      categoryName: null,
      categoryColor: null,
      tier: null,
      confidence: null,
    },
  ];
}

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: mockUser }));
    await page.route('**/api/company', (route) => route.fulfill({ json: { name: 'Musterfirma GmbH', hasLogo: false } }));
  });

  test('opens from the sidebar, above the inbox, and counts what came in', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.fulfill({ json: mockCases() }));

    await page.goto('/');
    // The order in the sidebar: the dashboard first, the inbox below it.
    const casesLinks = page.getByRole('navigation').getByRole('link');
    await expect(casesLinks.first()).toHaveText('Dashboard');
    await expect(casesLinks.nth(1)).toHaveText('Posteingang');

    await casesLinks.first().click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    // Three cases, one of them untriaged, one on someone's desk, two from today.
    await expect(page.getByText('Vorgänge gesamt').locator('xpath=following-sibling::p')).toHaveText('3');
    await expect(page.getByText('Noch nicht bewertet').locator('xpath=following-sibling::p')).toHaveText('1');
    await expect(page.getByText('Wartet auf eine Antwort').locator('xpath=following-sibling::p')).toHaveText('1');
    await expect(page.getByText('Heute eingegangen').locator('xpath=following-sibling::p')).toHaveText('2');
  });

  test('draws the three charts', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.fulfill({ json: mockCases() }));

    await page.goto('/dashboard');

    await expect(page.getByText('Vorgänge je Kategorie')).toBeVisible();
    await expect(page.getByText('Vorgänge je Stufe')).toBeVisible();
    await expect(page.getByText('Eingang der letzten 14 Tage')).toBeVisible();
    // A canvas each, and something actually painted on them.
    await expect(page.locator('canvas')).toHaveCount(3);
    const painted = await page.evaluate(() =>
      Array.from(document.querySelectorAll('canvas')).map((canvas) => canvas.toDataURL().length > 1000),
    );
    expect(painted).toEqual([true, true, true]);
  });

  test('picks up what came in while the page stood still, when asked to', async ({ page }) => {
    // The page reads once when it opens; the second answer is only shown on request.
    let asked = 0;
    await page.route('**/api/cases', (route) => {
      const cases = mockCases();
      return route.fulfill({ json: asked++ === 0 ? cases : [...cases, { ...cases[0], id: '4', subject: 'Gerade erst' }] });
    });

    await page.goto('/dashboard');
    const total = page.getByText('Vorgänge gesamt').locator('xpath=following-sibling::p');
    await expect(total).toHaveText('3');

    await page.getByRole('button', { name: 'Aktualisieren' }).click();

    await expect(total).toHaveText('4');
  });

  test('shows an error message when the API is unreachable', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.abort('connectionrefused'));

    await page.goto('/dashboard');

    await expect(page.getByText('Vorgänge konnten nicht geladen werden.')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  });
});
