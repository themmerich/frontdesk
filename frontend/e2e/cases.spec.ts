import { expect, test } from '@playwright/test';

// The e2e suite runs without a backend: the API is mocked per test via
// page.route, so the specs only verify the frontend's behavior. Assertions use
// the German texts because de is the default language.
const mockCases = [
  {
    id: '1',
    sender: 'anna@example.com',
    recipient: 'info@example.com',
    subject: 'Delivery status',
    receivedAt: '2026-08-19T08:30:00Z',
    hasAttachments: false,
    sizeBytes: 2048,
    summary: 'Kunde fragt nach dem Liefertermin zu Bestellung 4711.',
    categoryName: 'Statusanfrage Bestellung',
    categoryColor: 'blue',
    tier: 'automatic',
    confidence: 0.95,
  },
  {
    id: '2',
    sender: 'ben@example.com',
    recipient: 'rechnung@musterfirma.de',
    subject: 'Invoice copy',
    receivedAt: '2026-08-19T09:15:00Z',
    hasAttachments: true,
    sizeBytes: 1.4 * 1024 * 1024,
    // Not triaged yet: the row shows a dash in every triage column.
    summary: null,
    categoryName: null,
    categoryColor: null,
    tier: null,
    confidence: null,
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
    // Which address the mail came in on — info@ for the one, the rechnung@ alias for the other.
    await expect(page.getByRole('row', { name: /Delivery status/ })).toContainText('info@example.com');
    await expect(page.getByRole('row', { name: /Invoice copy/ })).toContainText('rechnung@musterfirma.de');
  });

  test('draws a case in the colour of its category, in both themes', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.fulfill({ json: mockCases }));
    await page.emulateMedia({ colorScheme: 'light' });

    await page.goto('/');

    const coloured = page.getByRole('row', { name: /Delivery status/ });
    await expect(coloured).toHaveAttribute('data-category-color', 'blue');
    await expect(coloured).toHaveCSS('color', 'rgb(29, 78, 216)');
    // Not triaged yet, so there is no category and no colour to take.
    await expect(page.getByRole('row', { name: /Invoice copy/ })).not.toHaveAttribute('data-category-color');

    // The same palette name, the value that reads on a dark surface. The stored
    // theme is cleared first, because it would otherwise win over the system one.
    await page.evaluate(() => localStorage.clear());
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();

    await expect(coloured).toHaveCSS('color', 'rgb(147, 197, 253)');
  });

  test('deletes a single case through its row action, after asking', async ({ page }) => {
    let deleted: Record<string, unknown> | undefined;
    await page.route('**/api/cases', (route) => {
      if (route.request().method() === 'DELETE') {
        deleted = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fulfill({ json: deleted ? [mockCases[1]] : mockCases });
    });

    await page.goto('/');
    const row = page.getByRole('row', { name: /Delivery status/ });
    await row.getByRole('button', { name: 'Vorgang löschen' }).click();

    // Nothing goes without the question, and the question names the case.
    const dialog = page.getByRole('alertdialog', { name: 'Löschen bestätigen' });
    await expect(dialog).toContainText('Delivery status');
    await dialog.getByRole('button', { name: 'Löschen' }).click();

    await expect(page.getByText('Vorgang gelöscht.')).toBeVisible();
    expect(deleted).toMatchObject({ ids: ['1'] });
    await expect(page.getByRole('row', { name: /Delivery status/ })).toHaveCount(0);
  });

  test('leaves everything alone when the question is answered with no', async ({ page }) => {
    let deleteCalls = 0;
    await page.route('**/api/cases', (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCalls++;
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fulfill({ json: mockCases });
    });

    await page.goto('/');
    await page
      .getByRole('row', { name: /Delivery status/ })
      .getByRole('button', { name: 'Vorgang löschen' })
      .click();
    await page.getByRole('alertdialog', { name: 'Löschen bestätigen' }).getByRole('button', { name: 'Abbrechen' }).click();

    expect(deleteCalls).toBe(0);
    await expect(page.getByRole('row', { name: /Delivery status/ })).toBeVisible();
  });

  test('deletes a selection through the toolbar, which stays disabled until something is ticked', async ({ page }) => {
    let deleted: Record<string, unknown> | undefined;
    await page.route('**/api/cases', (route) => {
      if (route.request().method() === 'DELETE') {
        deleted = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fulfill({ json: deleted ? [] : mockCases });
    });

    await page.goto('/');
    const toolbarDelete = page.getByRole('button', { name: 'Auswahl löschen' });
    await expect(toolbarDelete).toBeDisabled();

    // The header checkbox ticks every row at once.
    await page.getByRole('columnheader').first().getByRole('checkbox').click();
    await expect(toolbarDelete).toBeEnabled();
    await toolbarDelete.click();

    const dialog = page.getByRole('alertdialog', { name: 'Löschen bestätigen' });
    await expect(dialog).toContainText('2');
    await dialog.getByRole('button', { name: 'Löschen' }).click();

    await expect(page.getByText('2 Vorgänge gelöscht.')).toBeVisible();
    expect((deleted?.ids as string[]).sort()).toEqual(['1', '2']);
  });

  test('filters the list down to the cases with an attachment', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.fulfill({ json: mockCases }));

    await page.goto('/');
    // The attachment column filters through a tri-state checkbox. Scoped to the
    // filter, because the rows carry selection checkboxes of their own now.
    await page.getByRole('columnheader', { name: 'Anhang' }).getByRole('button').click();
    await page.locator('.p-datatable-filter-overlay').getByRole('checkbox').click();

    await expect(page.getByRole('row', { name: /Invoice copy/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Delivery status/ })).toHaveCount(0);
  });

  test('scrolls the table sideways instead of pushing the page out of view', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.fulfill({ json: mockCases }));
    // Narrow enough that all eight columns cannot possibly fit.
    await page.setViewportSize({ width: 1000, height: 800 });

    await page.goto('/');
    await expect(page.getByRole('row', { name: /Delivery status/ })).toBeVisible();

    const measured = await page.evaluate(() => {
      const scroller = document.querySelector('.p-datatable-table-container') as HTMLElement;
      return {
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        tableScrolls: scroller.scrollWidth > scroller.clientWidth,
      };
    });

    // The page itself stays put …
    expect(measured.pageOverflow).toBeLessThanOrEqual(1);
    // … and the table brings its own horizontal scrollbar.
    expect(measured.tableScrolls).toBe(true);
  });

  test('scrolls the rows inside the table, not the page', async ({ page }) => {
    // More rows than fit, so the list has to scroll somewhere.
    const many = Array.from({ length: 40 }, (_, index) => ({
      ...mockCases[0],
      id: String(index),
      subject: `Vorgang ${index}`,
    }));
    await page.route('**/api/cases', (route) => route.fulfill({ json: many }));
    await page.setViewportSize({ width: 1400, height: 800 });

    await page.goto('/');
    await expect(page.getByRole('row', { name: /Vorgang 0/ })).toBeVisible();

    const measured = await page.evaluate(() => {
      const scroller = document.querySelector('.p-datatable-table-container') as HTMLElement;
      const headerTop = () => Math.round(document.querySelector('thead')!.getBoundingClientRect().top);
      const before = headerTop();
      scroller.scrollTop = 400;
      return {
        pageOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        scrolled: scroller.scrollTop,
        headerMoved: headerTop() !== before,
      };
    });

    // The window stays put, the table takes the scrolling …
    expect(measured.pageOverflow).toBeLessThanOrEqual(1);
    expect(measured.scrolled).toBe(400);
    // … and the column headers stand still while the rows move under them.
    expect(measured.headerMoved).toBe(false);
  });

  test('lets the admin resize a column', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.fulfill({ json: mockCases }));

    await page.goto('/');
    // Not the attachment column: it is the narrowest one and its filter button
    // leaves the resize handle no room to be grabbed.
    const senderColumn = page.getByRole('columnheader', { name: 'Absender' });
    const before = (await senderColumn.boundingBox())!.width;

    // Drag the handle at the column's right edge to the left. Fit mode hands the
    // width to the neighbour, which always has room for it — widening instead
    // would stop at whatever the neighbour can spare.
    const handle = (await senderColumn.locator('.p-datatable-column-resizer').boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x - 50, handle.y + handle.height / 2, { steps: 10 });
    await page.mouse.up();

    const resized = (await senderColumn.boundingBox())!.width;
    expect(resized).toBeLessThan(before - 20);

    // The width is part of what the table remembers, so it is still there after a reload.
    await page.reload();
    await expect(page.getByRole('row', { name: /Delivery status/ })).toBeVisible();
    expect((await senderColumn.boundingBox())!.width).toBeCloseTo(resized, 0);
  });

  test('keeps a dragged width on its column when another column is hidden', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.fulfill({ json: mockCases }));

    await page.goto('/');
    const sender = page.getByRole('columnheader', { name: 'Absender' });
    const handle = (await sender.locator('.p-datatable-column-resizer').boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x - 80, handle.y + handle.height / 2, { steps: 10 });
    await page.mouse.up();
    const resized = (await sender.boundingBox())!.width;

    // The column in front of it goes: by position, its width would land on the sender.
    await page.getByRole('button', { name: 'Spalten' }).click();
    await page.locator('input#hasAttachments').click();
    await page.keyboard.press('Escape');

    expect((await sender.boundingBox())!.width).toBeCloseTo(resized, 0);

    await page.reload();
    await expect(page.getByRole('row', { name: /Delivery status/ })).toBeVisible();

    // Still the width the sender was dragged to, and the widths are kept by column, not by place.
    expect((await sender.boundingBox())!.width).toBeCloseTo(resized, 0);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('frontdesk-case-columns') ?? '{}'));
    expect(stored.widths.sender).toBeCloseTo(resized, 0);
  });

  test('filters the list by the categories it actually holds', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.fulfill({ json: mockCases }));

    await page.goto('/');
    await page.getByRole('columnheader', { name: 'Kategorie' }).getByRole('button').click();
    await page.locator('.p-datatable-filter-overlay p-multiselect').click();

    // Only the one category the two mails carry; the untriaged case adds nothing to choose from.
    const options = page.locator('.p-multiselect-overlay').getByRole('option');
    await expect(options).toHaveText(['Statusanfrage Bestellung']);

    await options.first().click();

    await expect(page.getByRole('row', { name: /Delivery status/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Invoice copy/ })).toHaveCount(0);
  });

  test('pages through the cases and says how many there are', async ({ page }) => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      ...mockCases[0],
      id: String(index),
      subject: `Vorgang ${index}`,
      receivedAt: new Date(Date.UTC(2026, 7, 19, 8, index)).toISOString(),
    }));
    await page.route('**/api/cases', (route) => route.fulfill({ json: many }));

    await page.goto('/');

    // Twenty-five to a page, and the count of all of them beside it.
    await expect(page.getByText('1 – 25 von 30 Vorgängen')).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(25);

    await page.getByRole('button', { name: 'Nächste Seite' }).click();

    await expect(page.getByText('26 – 30 von 30 Vorgängen')).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(5);
  });

  test('fills a page where the stored state predates the paginator', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.fulfill({ json: mockCases }));
    // What the storage holds for everyone who used the inbox before it had a paginator: a state
    // with no page and no rows in it.
    await page.addInitScript(() =>
      localStorage.setItem('frontdesk-case-table', JSON.stringify({ sortField: 'receivedAt', sortOrder: -1 })),
    );

    await page.goto('/');

    await expect(page.getByRole('row', { name: /Delivery status/ })).toBeVisible();
    await expect(page.getByText('1 – 2 von 2 Vorgängen')).toBeVisible();
  });

  test('resets sorting, filters and columns, and forgets both stored entries', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.fulfill({ json: mockCases }));

    await page.goto('/');
    await page.getByRole('textbox', { name: 'Suchen' }).fill('invoice');
    await page.getByRole('columnheader', { name: 'Absender' }).click();
    await page.getByRole('button', { name: 'Spalten' }).click();
    await page.locator('input#hasAttachments').click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('row', { name: /Delivery status/ })).toHaveCount(0);
    const before = await page.evaluate(() => [
      localStorage.getItem('frontdesk-case-table'),
      localStorage.getItem('frontdesk-case-columns'),
    ]);
    expect(before[0]).not.toBeNull();
    expect(before[1]).not.toBeNull();

    await page.getByRole('button', { name: 'Ansicht zurücksetzen' }).click();

    // Both cases back, in the order the inbox opens with: newest first.
    const subjects = page.locator('tbody tr td:nth-child(5)');
    await expect(subjects).toHaveText([/Invoice copy/, /Delivery status/]);
    await expect(page.getByRole('textbox', { name: 'Suchen' })).toHaveValue('');
    await expect(page.getByRole('columnheader', { name: 'Anhang' })).toBeVisible();
    // And nothing of the old view is left behind for the next visit.
    const after = await page.evaluate(() => [localStorage.getItem('frontdesk-case-table'), localStorage.getItem('frontdesk-case-columns')]);
    expect(after).toEqual([null, null]);
  });

  test('keeps the search across a reload, but not the ticked rows', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.fulfill({ json: mockCases }));

    await page.goto('/');
    const search = page.getByRole('textbox', { name: 'Suchen' });
    await search.fill('invoice');
    await expect(page.getByRole('row', { name: /Delivery status/ })).toHaveCount(0);
    // Ticked for the next click, not for the next visit.
    await page
      .getByRole('row', { name: /Invoice copy/ })
      .getByRole('checkbox')
      .click();
    await expect(page.getByRole('button', { name: 'Auswahl löschen' })).toBeEnabled();

    await page.reload();

    // The rows come back filtered, and the box says what they are filtered by.
    await expect(page.getByRole('row', { name: /Invoice copy/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Delivery status/ })).toHaveCount(0);
    await expect(search).toHaveValue('invoice');
    // The tick is gone: it would point at a mail that may have been deleted meanwhile.
    await expect(page.getByRole('button', { name: 'Auswahl löschen' })).toBeDisabled();
  });

  test('shows the triage verdict per case', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.fulfill({ json: mockCases }));

    await page.goto('/');

    const triaged = page.getByRole('row', { name: /Delivery status/ });
    await expect(triaged).toContainText('Statusanfrage Bestellung');
    await expect(triaged.locator('p-tag')).toHaveText('Automatisch');
    // The model's sentence and its certainty are recorded but no longer shown here.
    await expect(triaged).not.toContainText('Kunde fragt nach dem Liefertermin');
    // The case still waiting for the triage shows no tag at all.
    await expect(page.getByRole('row', { name: /Invoice copy/ }).locator('p-tag')).toHaveCount(0);
  });

  test('picks up a newly ingested case without a reload', async ({ page }) => {
    // The second answer carries a mail that arrived while the page was open.
    let arrived = false;
    await page.route('**/api/cases', (route) => {
      const cases = arrived ? mockCases : [mockCases[0]];
      arrived = true;
      return route.fulfill({ json: cases });
    });

    await page.goto('/');
    await expect(page.getByRole('row', { name: /Delivery status/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Invoice copy/ })).toHaveCount(0);

    // Looking at the tab again refreshes it at once; the ten-second tick would
    // get there too, only slower.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

    await expect(page.getByRole('row', { name: /Invoice copy/ })).toBeVisible();
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
