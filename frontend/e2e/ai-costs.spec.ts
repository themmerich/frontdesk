import { expect, test } from '@playwright/test';

// Backend-less like the other e2e specs: the API is mocked per test, the
// assertions use the German texts because de is the default language.
const adminUser = {
  username: 'admin',
  displayName: 'Anna Admin',
  role: 'admin',
  tenant: { slug: 'musterfirma', name: 'Musterfirma GmbH' },
};

/** Thirty days of nothing but the last two, so the chart has something to draw. */
function usage() {
  const nothing = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  const window = (costUsd: number, previousCostUsd: number) => ({
    calls: 3,
    inputTokens: 48210,
    outputTokens: 6120,
    costUsd,
    previousCostUsd,
    byKind: { triage: { ...nothing, calls: 2, costUsd: 0.01 }, draft: { ...nothing, calls: 1, costUsd: 0.04 }, keyTest: nothing },
  });
  const daily = [];
  for (let back = 29; back >= 0; back--) {
    const day = new Date();
    day.setDate(day.getDate() - back);
    daily.push({
      period: day.toISOString().slice(0, 10),
      triageCostUsd: back < 2 ? 0.01 : 0,
      draftCostUsd: back < 2 ? 0.04 : 0,
      keyTestCostUsd: 0,
      calls: back < 2 ? 3 : 0,
    });
  }
  const monthly = [];
  for (let back = 11; back >= 0; back--) {
    const month = new Date();
    month.setDate(1);
    month.setMonth(month.getMonth() - back);
    monthly.push({
      period: month.toISOString().slice(0, 7),
      triageCostUsd: back < 2 ? 0.3 : 0,
      draftCostUsd: back < 2 ? 1.2 : 0,
      keyTestCostUsd: 0,
      calls: back < 2 ? 90 : 0,
    });
  }
  const year = String(new Date().getFullYear());
  return {
    windows: { today: window(0.05, 0.04), week: window(0.4, 0.4), month: window(1.5, 2) },
    daily,
    monthly,
    yearly: [{ period: year, triageCostUsd: 0.6, draftCostUsd: 2.4, keyTestCostUsd: 0, calls: 180 }],
    prices: [{ model: 'claude-sonnet-5', inputPerMillion: 2, outputPerMillion: 10 }],
    unpricedCalls: 0,
  };
}

test.describe('AI costs', () => {
  test.beforeEach(async ({ page }) => {
    // The inbox the shell opens on offers the colleagues a case can be handed to.
    await page.route('**/api/users/assignable', (route) => route.fulfill({ json: [] }));
    // The bell is on every page and polls; unanswered with a backend behind the dev server
    // it comes back 401 and the interceptor sends the browser to the login.
    await page.route('**/api/notifications', (route) => route.fulfill({ json: { unseenCount: 0, items: [] } }));
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: adminUser }));
    await page.route('**/api/case-categories/selectable', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/company', (route) => route.fulfill({ json: { name: 'Musterfirma GmbH', hasLogo: false } }));
    // The start page is the inbox; without this it would ask a backend that is not
    // part of this suite, and an unauthorised answer sends the app to the login.
    await page.route('**/api/cases', (route) => route.fulfill({ json: [] }));
  });

  test('opens from the sidebar and shows what the calls cost', async ({ page }) => {
    await page.route('**/api/ai-usage', (route) => route.fulfill({ json: usage() }));

    await page.goto('/');
    await page.getByRole('link', { name: 'KI-Kosten' }).click();

    await expect(page.getByRole('heading', { name: 'KI-Kosten' })).toBeVisible();
    const tile = (label: string) => page.getByText(label, { exact: true }).locator('xpath=following-sibling::p');
    await expect(tile('Heute').first()).toHaveText('0,05 $');
    await expect(tile('Letzte 30 Tage').first()).toHaveText('1,50 $');
    await expect(page.getByText('+25 %')).toBeVisible();
    await expect(page.getByText('3 Aufrufe · 48.210 Token rein / 6.120 raus').first()).toBeVisible();
    await expect(page.getByRole('img', { name: 'Kosten im Verlauf' })).toBeVisible();
    // The chart opens by day and can be cut by month or by year.
    await expect(page.getByRole('button', { name: 'Tag', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Monat', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Monat', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Jahr', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Jahr', exact: true })).toHaveAttribute('aria-pressed', 'true');
    // The price table names the model and its two rates.
    await expect(page.getByRole('cell', { name: 'claude-sonnet-5' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '10,00 $' })).toBeVisible();
  });

  test('says when calls are missing from the sums', async ({ page }) => {
    await page.route('**/api/ai-usage', (route) => route.fulfill({ json: { ...usage(), unpricedCalls: 2 } }));

    await page.goto('/ai-costs');

    await expect(page.getByText('2 Aufrufe der letzten 30 Tage haben kein Modell mit Preis und fehlen in den Summen.')).toBeVisible();
  });

  test('hides the page from regular users and redirects them away', async ({ page }) => {
    // The inbox the shell opens on offers the colleagues a case can be handed to.
    await page.route('**/api/users/assignable', (route) => route.fulfill({ json: [] }));
    // The bell is on every page and polls; unanswered with a backend behind the dev server
    // it comes back 401 and the interceptor sends the browser to the login.
    await page.route('**/api/notifications', (route) => route.fulfill({ json: { unseenCount: 0, items: [] } }));
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: { ...adminUser, role: 'user' } }));

    await page.goto('/ai-costs');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'KI-Kosten' })).toHaveCount(0);
  });
});
