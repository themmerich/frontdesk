import { expect, test } from '@playwright/test';

// The e2e suite runs without a backend: the API is mocked per test via page.route.
// Assertions use the German texts because de is the default language.
const mockUser = {
  username: 'anna',
  displayName: 'Anna Muster',
  role: 'user',
  tenant: { slug: 'musterfirma', name: 'Musterfirma GmbH' },
};

const unseen = {
  unseenCount: 2,
  items: [
    {
      caseId: 'c1',
      subject: 'Lieferung 4711',
      type: 'follow_up_received',
      actorName: null,
      occurredAt: '2026-09-16T08:30:00Z',
    },
    { caseId: 'c2', subject: 'Rechnung 2026-081', type: 'assigned', actorName: 'Ben Beispiel', occurredAt: '2026-09-16T07:15:00Z' },
  ],
};

test.describe('Notifications', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: mockUser }));
    await page.route('**/api/company', (route) => route.fulfill({ json: { name: 'Musterfirma GmbH', hasLogo: false } }));
    await page.route('**/api/cases', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/case-categories/selectable', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/users/assignable', (route) => route.fulfill({ json: [] }));
  });

  test('counts what happened on one own cases and opens what is behind it', async ({ page }) => {
    let marked = 0;
    await page.route('**/api/notifications/seen', (route) => {
      marked++;
      return route.fulfill({ status: 204, body: '' });
    });
    await page.route('**/api/notifications', (route) => route.fulfill({ json: marked === 0 ? unseen : { ...unseen, unseenCount: 0 } }));

    await page.goto('/');

    const bell = page.getByRole('button', { name: 'Benachrichtigungen' });
    await expect(bell).toContainText('2');

    await bell.click();

    // What happened, on which case — a customer writing again names nobody, a hand-over does.
    await expect(page.getByText('Der Kunde hat noch einmal geschrieben')).toBeVisible();
    await expect(page.getByText('Ben Beispiel hat Ihnen einen Vorgang zugewiesen')).toBeVisible();
    await expect(page.getByText('Lieferung 4711')).toBeVisible();

    // Opening is reading: the badge goes, and what is listed stays readable.
    expect(marked).toBe(1);
    await expect(bell).not.toContainText('2');
    await expect(page.getByText('Lieferung 4711')).toBeVisible();

    // Each entry leads to its case.
    await page.getByText('Rechnung 2026-081').click();
    await expect(page).toHaveURL(/\/cases\/c2$/);
  });

  test('stands with the other icons rather than beside them', async ({ page }) => {
    await page.route('**/api/notifications', (route) => route.fulfill({ json: { unseenCount: 0, items: [] } }));

    await page.goto('/');

    // The popover belongs outside the icon row: inside it, it is a flex item and its gap pushes
    // the bell two rem away from the palette beside it.
    const row = page.locator('div.flex.items-center.gap-8').first();
    const tags = await row.evaluate((element) => Array.from(element.children).map((child) => child.tagName.toLowerCase()));
    expect(tags.every((tag) => tag === 'button' || tag === 'p-avatar')).toBe(true);
  });

  test('says so when nothing happened, and shows no badge at all', async ({ page }) => {
    await page.route('**/api/notifications', (route) => route.fulfill({ json: { unseenCount: 0, items: [] } }));

    await page.goto('/');

    const bell = page.getByRole('button', { name: 'Benachrichtigungen' });
    // No nought on the bell: nothing waiting means nothing to say.
    await expect(bell).toHaveText('');

    await bell.click();

    await expect(page.getByText('Nichts Neues auf Ihren Vorgängen.')).toBeVisible();
  });
});
