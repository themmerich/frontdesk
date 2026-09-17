import { expect, test } from '@playwright/test';

// The e2e suite runs without a backend: the API is mocked per test via page.route.
// Assertions use the German texts because de is the default language.
const mockUser = {
  username: 'admin',
  displayName: 'Anna Admin',
  role: 'admin',
  tenant: { slug: 'musterfirma', name: 'Musterfirma GmbH' },
};

/** A local date as the server spells a day bucket, so the labels land on the right days. */
function isoDay(daysAgo: number): string {
  const day = new Date();
  day.setDate(day.getDate() - daysAgo);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

function isoMonth(monthsAgo: number): string {
  const month = new Date();
  month.setDate(1);
  month.setMonth(month.getMonth() - monthsAgo);
  return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
}

/** What a bucket caught, keyed by category and then by the channel it came in over. */
type Counts = Record<string, Record<string, number>>;

function bucket(period: string, counts: Counts = {}) {
  const count = Object.values(counts)
    .flatMap((byChannel) => Object.values(byChannel))
    .reduce((sum, caught) => sum + caught, 0);
  return { period, count, counts };
}

/**
 * What the endpoint answers: two cases from today under two categories, one of them written down
 * off the fax machine, one untriaged from yesterday. The same numbers the old list fixture
 * produced, only already added up.
 */
function mockStatistics(overrides: Record<string, unknown> = {}) {
  const today = { c1: { mail: 1 }, c2: { fax: 1 } };
  const yesterday = { none: { phone: 1 } };
  return {
    totals: { all: 3, untriaged: 1, manual: 1, archived: 0, trashed: 0 },
    windows: { today: { count: 2, previous: 1 }, week: { count: 3, previous: 0 }, month: { count: 3, previous: 0 } },
    // Equal counts, so the server's name tiebreaker puts Reklamation first.
    byCategory: [
      { id: 'c2', name: 'Reklamation', color: 'red', count: 1 },
      { id: 'c1', name: 'Statusanfrage Bestellung', color: 'blue', count: 1 },
      { id: null, name: null, color: null, count: 1 },
    ],
    byTier: [
      { tier: 'automatic', count: 1 },
      { tier: 'draft', count: 0 },
      { tier: 'manual', count: 1 },
      { tier: 'info', count: 0 },
      { tier: 'ignore', count: 0 },
      { tier: null, count: 1 },
    ],
    // All four, whatever came in over them: one mail, one fax, one call, nobody at the desk.
    byChannel: [
      { channel: 'mail', count: 1 },
      { channel: 'phone', count: 1 },
      { channel: 'fax', count: 1 },
      { channel: 'other', count: 0 },
    ],
    hours: Array.from({ length: 24 }, (_, hour) => bucket(`${isoDay(0)}T${String(hour).padStart(2, '0')}`, hour === 9 ? today : {})),
    days: Array.from({ length: 30 }, (_, index) => {
      const daysAgo = 29 - index;
      return bucket(isoDay(daysAgo), daysAgo === 0 ? today : daysAgo === 1 ? yesterday : {});
    }),
    months: Array.from({ length: 12 }, (_, index) => bucket(isoMonth(11 - index), index === 11 ? { ...today, ...yesterday } : {})),
    ...overrides,
  };
}

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // The inbox the shell opens on offers the colleagues a case can be handed to.
    await page.route('**/api/users/assignable', (route) => route.fulfill({ json: [] }));
    // The bell is on every page and polls; unanswered with a backend behind the dev server
    // it comes back 401 and the interceptor sends the browser to the login.
    await page.route('**/api/notifications', (route) => route.fulfill({ json: { unseenCount: 0, items: [] } }));
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: mockUser }));
    // The inbox offers the categories for picking in its rows; unanswered, the request comes
    // back 401 from the real backend and the interceptor sends the browser to the login.
    await page.route('**/api/case-categories/selectable', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/company', (route) => route.fulfill({ json: { name: 'Musterfirma GmbH', hasLogo: false } }));
    // The dashboard never asks for this one anymore; the inbox behind it might.
    await page.route('**/api/cases', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/cases/statistics', (route) => route.fulfill({ json: mockStatistics() }));
  });

  test('opens from the sidebar, above the inbox, and counts what came in', async ({ page }) => {
    await page.goto('/');
    // The order in the sidebar: the dashboard first, then the inbox and the archive.
    const casesLinks = page.getByRole('navigation').getByRole('link');
    await expect(casesLinks.first()).toHaveText('Dashboard');
    await expect(casesLinks.nth(1)).toHaveText('Offen');
    await expect(casesLinks.nth(2)).toHaveText('Archiv');
    await expect(casesLinks.nth(3)).toHaveText('Papierkorb');

    await casesLinks.first().click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    // Three cases, one of them untriaged, one on someone's desk, two from today.
    await expect(page.getByText('Vorgänge gesamt').locator('xpath=following-sibling::p')).toHaveText('3');
    await expect(page.getByText('Noch nicht bewertet').locator('xpath=following-sibling::p')).toHaveText('1');
    await expect(page.getByText('Wartet auf eine Antwort').locator('xpath=following-sibling::p')).toHaveText('1');
    // The tile, told apart from the chart's period button by the card it sits in.
    await expect(page.locator('p-card').filter({ hasText: 'ggü. gestern' })).toContainText('2');
  });

  test('asks the server for the numbers rather than for the cases', async ({ page }) => {
    const asked: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/cases')) {
        asked.push(url.pathname);
      }
    });

    await page.goto('/dashboard');
    await expect(page.getByText('Vorgänge gesamt').locator('xpath=following-sibling::p')).toHaveText('3');

    // The rows never travel for this: the sums do.
    expect(asked).toContain('/api/cases/statistics');
    expect(asked).not.toContain('/api/cases');
  });

  test('draws the four charts', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.getByText('Vorgänge je Kategorie')).toBeVisible();
    await expect(page.getByText('Vorgänge je Kanal')).toBeVisible();
    await expect(page.getByText('Vorgänge je Stufe')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Eingang' })).toBeVisible();
    // A canvas each, and something actually painted on them.
    await expect(page.locator('canvas')).toHaveCount(4);
    const painted = await page.evaluate(() =>
      Array.from(document.querySelectorAll('canvas')).map((canvas) => canvas.toDataURL().length > 1000),
    );
    expect(painted).toEqual([true, true, true, true]);
  });

  test('measures today and the last stretches against the ones before them', async ({ page }) => {
    await page.goto('/dashboard');

    // Two came in today, one yesterday around the same time: twice as many as the day before.
    const today = page.locator('p-card').filter({ hasText: 'ggü. gestern' });
    await expect(today).toContainText('2');
    await expect(today).toContainText('+100');
    // Nothing in the week before the last one, so the tile gives the number itself.
    const week = page.locator('p-card').filter({ hasText: 'ggü. Vorwoche' });
    await expect(week).toContainText('3');
    await expect(week).toContainText('+3');
  });

  test('counts what is filed and what was thrown away, and keeps the trash out of the rest', async ({ page }) => {
    await page.route('**/api/cases/statistics', (route) =>
      route.fulfill({ json: mockStatistics({ totals: { all: 4, untriaged: 1, manual: 1, archived: 1, trashed: 2 } }) }),
    );

    await page.goto('/dashboard');

    const tile = (label: string) => page.getByText(label, { exact: true }).locator('xpath=following-sibling::p');
    await expect(tile('Im Archiv')).toHaveText('1');
    await expect(tile('Im Papierkorb')).toHaveText('2');
    // The three from the inbox plus the one in the archive; the two in the trash count nowhere else.
    await expect(tile('Vorgänge gesamt')).toHaveText('4');
  });

  test('points the trend with a triangle, green up and red down', async ({ page }) => {
    await page.goto('/dashboard');

    // Two today against one yesterday: up, and drawn in the colour styles.css gives that direction.
    const today = page.locator('p-card').filter({ hasText: 'ggü. gestern' });
    const trend = today.locator('[data-trend]');
    await expect(trend).toHaveAttribute('data-trend', 'up');
    await expect(trend.locator('i')).toHaveClass(/pi-caret-up/);
    const up = await trend.evaluate((element) => getComputedStyle(element).color);
    expect(up).toBe('rgb(21, 128, 61)');

    // The other way round: yesterday held two, today holds none.
    await page.route('**/api/cases/statistics', (route) =>
      route.fulfill({
        json: mockStatistics({
          windows: { today: { count: 0, previous: 2 }, week: { count: 3, previous: 0 }, month: { count: 3, previous: 0 } },
        }),
      }),
    );
    await page.reload();

    await expect(trend).toHaveAttribute('data-trend', 'down');
    await expect(trend.locator('i')).toHaveClass(/pi-caret-down/);
    expect(await trend.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(185, 28, 28)');
  });

  test('switches the arrivals chart between today, the days and the months without asking again', async ({ page }) => {
    let asked = 0;
    await page.route('**/api/cases/statistics', (route) => {
      asked++;
      return route.fulfill({ json: mockStatistics() });
    });

    await page.goto('/dashboard');
    const chart = page.locator('canvas').last();
    await expect(chart).toBeVisible();
    const thirtyDays = await chart.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());

    await page.getByRole('button', { name: 'Heute', exact: true }).click();

    // A different picture, and the button says which stretch is on it.
    await expect(page.getByRole('button', { name: 'Heute', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await chart.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(thirtyDays);

    await page.getByRole('button', { name: '12 Monate' }).click();

    await expect(page.getByRole('button', { name: '12 Monate' })).toHaveAttribute('aria-pressed', 'true');
    expect(await chart.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(thirtyDays);
    // Every series came with the one reading.
    expect(asked).toBe(1);
  });

  test('narrows the arrivals chart to one category', async ({ page }) => {
    await page.goto('/dashboard');
    const chart = page.locator('canvas').last();
    await expect(chart).toBeVisible();
    const everything = await chart.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());

    // Everything to begin with; on offer are the categories the cases carry, and the lack of one.
    const filter = page.locator('p-select[inputid="dashboard-arrivals-category"]');
    await expect(filter).toContainText('Alle Kategorien');
    await filter.click();
    await expect(page.getByRole('option')).toHaveText(['Alle Kategorien', 'Reklamation', 'Statusanfrage Bestellung', 'Ohne Kategorie']);

    await page.getByRole('option', { name: 'Reklamation' }).click();

    // A different picture, and the select says whose it is.
    await expect(filter).toContainText('Reklamation');
    expect(await chart.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(everything);
    // The tiles above are about everything still.
    await expect(page.getByText('Vorgänge gesamt').locator('xpath=following-sibling::p')).toHaveText('3');
  });

  test('narrows the arrivals chart to one channel', async ({ page }) => {
    await page.goto('/dashboard');
    const chart = page.locator('canvas').last();
    await expect(chart).toBeVisible();
    const everything = await chart.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());

    // All four ways in are on offer, whether or not anything came in over them.
    const filter = page.locator('p-select[inputid="dashboard-arrivals-channel"]');
    await expect(filter).toContainText('Alle Kanäle');
    await filter.click();
    await expect(page.getByRole('option')).toHaveText(['Alle Kanäle', 'E-Mail', 'Telefon', 'Fax', 'Sonstiges']);

    await page.getByRole('option', { name: 'Fax', exact: true }).click();

    await expect(filter).toContainText('Fax');
    expect(await chart.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(everything);
    // The tiles above are about everything still.
    await expect(page.getByText('Vorgänge gesamt').locator('xpath=following-sibling::p')).toHaveText('3');
  });

  test('picks up what came in while the page stood still, when asked to', async ({ page }) => {
    // The page reads once when it opens; the second answer is only shown on request.
    let asked = 0;
    await page.route('**/api/cases/statistics', (route) =>
      route.fulfill({
        json: asked++ === 0 ? mockStatistics() : mockStatistics({ totals: { all: 4, untriaged: 2, manual: 1, archived: 0, trashed: 0 } }),
      }),
    );

    await page.goto('/dashboard');
    const total = page.getByText('Vorgänge gesamt').locator('xpath=following-sibling::p');
    await expect(total).toHaveText('3');

    await page.getByRole('button', { name: 'Aktualisieren' }).click();

    await expect(total).toHaveText('4');
  });

  test('shows an error message when the API is unreachable', async ({ page }) => {
    await page.route('**/api/cases/statistics', (route) => route.abort('connectionrefused'));

    await page.goto('/dashboard');

    await expect(page.getByText('Vorgänge konnten nicht geladen werden.')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  });
});
