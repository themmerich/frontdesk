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
    // The rows offer the categories for picking; unanswered, the request comes back 401 from the
    // real backend and the interceptor sends the browser to the login.
    await page.route('**/api/case-categories/selectable', (route) =>
      route.fulfill({ json: [{ id: 'c1', name: 'Statusanfrage Bestellung', color: 'blue' }] }),
    );
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

    await expect(page.getByText('Vorgang in den Papierkorb verschoben.')).toBeVisible();
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

  test('files a case from its row, and saves it on the spot', async ({ page }) => {
    let saved: { categoryId: string | null; tier: string | null } | null = null;
    await page.route('**/api/case-categories/selectable', (route) =>
      route.fulfill({
        json: [
          { id: 'c1', name: 'Statusanfrage Bestellung', color: 'blue' },
          { id: 'c2', name: 'Reklamation', color: 'red' },
        ],
      }),
    );
    await page.route('**/api/cases/2/classification', async (route) => {
      saved = route.request().postDataJSON() as { categoryId: string | null; tier: string | null };
      await route.fulfill({ json: { ...mockCases[1], categoryId: saved.categoryId, categoryName: 'Reklamation' } });
    });
    await page.route('**/api/cases', (route) => route.fulfill({ json: mockCases }));

    await page.goto('/');
    const row = page.getByRole('row', { name: /Invoice copy/ });

    // The category cell turns into a picker when it is clicked.
    await row.locator('td[data-p-editable-column]').first().click();
    await row.locator('p-select').click();
    await page.locator('.p-select-overlay li', { hasText: 'Reklamation' }).first().click();

    await expect(page.getByText('Einordnung gespeichert.')).toBeVisible();
    // The untriaged case keeps its empty verdict: filing says what it is about, nothing more.
    expect(saved).toEqual({ categoryId: 'c2', tier: null });
    // And picking in the cell did not pick the row underneath it.
    await expect(page.locator('tbody tr[aria-selected="true"]')).toHaveCount(0);
  });

  test('picks one row per click, adds with ctrl, and leaves the row buttons alone', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.fulfill({ json: mockCases }));

    await page.goto('/');
    const picked = page.locator('tbody tr[aria-selected="true"]');

    await page.getByRole('row', { name: /Delivery status/ }).click();

    await expect(picked).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Auswahl löschen' })).toBeEnabled();

    // A plain click picks that one row and lets go of the rest; ctrl adds instead.
    await page.getByRole('row', { name: /Invoice copy/ }).click();
    await expect(picked).toHaveCount(1);
    await page.getByRole('row', { name: /Delivery status/ }).click({ modifiers: ['Control'] });
    await expect(picked).toHaveCount(2);
    await page.getByRole('row', { name: /Delivery status/ }).click({ modifiers: ['Control'] });
    await expect(picked).toHaveCount(1);

    // Shift reaches from the picked row to this one; both mails are then picked.
    await page.getByRole('row', { name: /Delivery status/ }).click({ modifiers: ['Shift'] });
    await expect(picked).toHaveCount(2);

    // The row's own buttons do their own thing; the picking stays as it is.
    await page
      .getByRole('row', { name: /Invoice copy/ })
      .getByRole('button', { name: 'Vorgang löschen' })
      .click();
    await expect(page.getByRole('alertdialog', { name: 'Löschen bestätigen' })).toBeVisible();
    await expect(picked).toHaveCount(2);
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

    // A click picks a row, shift-click everything up to it.
    await page.getByRole('row', { name: /Delivery status/ }).click();
    await page.getByRole('row', { name: /Invoice copy/ }).click({ modifiers: ['Shift'] });
    await expect(toolbarDelete).toBeEnabled();
    await toolbarDelete.click();

    const dialog = page.getByRole('alertdialog', { name: 'Löschen bestätigen' });
    await expect(dialog).toContainText('2');
    await dialog.getByRole('button', { name: 'Löschen' }).click();

    await expect(page.getByText('2 Vorgänge in den Papierkorb verschoben.')).toBeVisible();
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

  test('files the cases under the stretch of time they came in', async ({ page }) => {
    const day = (daysAgo: number) => {
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      date.setHours(9, 0, 0, 0);
      return date.toISOString();
    };
    await page.route('**/api/cases', (route) =>
      route.fulfill({
        json: [
          { ...mockCases[0], id: '1', subject: 'Von heute', receivedAt: day(0) },
          { ...mockCases[0], id: '2', subject: 'Von gestern', receivedAt: day(1) },
          { ...mockCases[0], id: '3', subject: 'Aus einem alten Monat', receivedAt: day(70) },
        ],
      }),
    );

    await page.goto('/');

    // A heading above the first case of each stretch, newest stretch first.
    const headings = page.locator('tbody tr:not([data-p-selectable-row])');
    await expect(headings).toHaveCount(3);
    await expect(headings.nth(0)).toHaveText('Heute');
    await expect(headings.nth(1)).toHaveText('Gestern');
    // The third is named after its month, whichever one that is today.
    await expect(headings.nth(2)).not.toHaveText('Dieser Monat');

    // Sorted by sender, the stretches would cut that order into pieces, so they step aside.
    await page.getByRole('columnheader', { name: 'Absender' }).getByText('Absender').click();

    await expect(headings).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Von heute/ })).toBeVisible();
  });

  test('keeps the heading of a stretch in sight while its cases scroll past', async ({ page }) => {
    // More cases from today than fit, so the heading has something to hold above.
    const today = new Date();
    today.setHours(9, 0, 0, 0);
    const many = Array.from({ length: 25 }, (_, index) => ({
      ...mockCases[0],
      id: String(index),
      subject: `Vorgang ${index}`,
      receivedAt: new Date(today.getTime() + index * 60_000).toISOString(),
    }));
    await page.route('**/api/cases', (route) => route.fulfill({ json: many }));
    await page.setViewportSize({ width: 1400, height: 700 });

    await page.goto('/');
    await expect(page.getByRole('row', { name: /Vorgang 24/ })).toBeVisible();

    await page.locator('.p-datatable-table-container').evaluate((container) => (container.scrollTop = 300));

    // Scrolled past its first rows, the heading stands still below the column headers.
    const measured = await page.evaluate(() => {
      const heading = document.querySelector('tbody tr:not([data-p-selectable-row])')!;
      return {
        text: heading.textContent?.trim(),
        headingTop: Math.round(heading.getBoundingClientRect().top),
        headerBottom: Math.round(document.querySelector('thead')!.getBoundingClientRect().bottom),
      };
    });
    expect(measured.text).toBe('Heute');
    expect(measured.headingTop).toBe(measured.headerBottom);
  });

  test('gives every filter field the width of the menu it stands in', async ({ page }) => {
    await page.route('**/api/cases', (route) => route.fulfill({ json: mockCases }));

    await page.goto('/');
    const menu = async (column: string, field: string) => {
      await page.getByRole('columnheader', { name: column }).locator('p-columnfilter button').first().click();
      await page.locator(`.p-datatable-filter-overlay ${field}`).waitFor();
      // The menu that closed before this one lingers in the DOM for its animation, so the one
      // carrying the field is the one to measure.
      return page.evaluate((carries) => {
        const overlay = [...document.querySelectorAll('.p-datatable-filter-overlay')].find((one) => one.querySelector(carries))!;
        const style = getComputedStyle(overlay);
        const inner = overlay.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const width = (selector: string) => Math.round(overlay.querySelector(selector)?.getBoundingClientRect().width ?? 0);
        return { inner: Math.round(inner), select: width('p-select'), text: width('.p-inputtext'), multiSelect: width('p-multiselect') };
      }, field);
    };

    // The text filter sat visibly short under the two match-mode selects above it.
    const subject = await menu('Betreff', '.p-inputtext');
    expect(subject.text).toBe(subject.select);
    // Within a pixel of the menu itself; the rest is where the browser rounds its sub-pixels.
    expect(subject.inner - subject.text).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');

    const category = await menu('Kategorie', 'p-multiselect');
    expect(category.inner - category.multiSelect).toBeLessThanOrEqual(1);
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
    // The rows carrying a case; between them stand the headings of the stretches of time.
    await expect(page.locator('tbody tr[data-p-selectable-row]')).toHaveCount(25);

    await page.getByRole('button', { name: 'Nächste Seite' }).click();

    await expect(page.getByText('26 – 30 von 30 Vorgängen')).toBeVisible();
    await expect(page.locator('tbody tr[data-p-selectable-row]')).toHaveCount(5);
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
    const subjects = page.locator('tbody tr td:nth-child(4)');
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
    // Picked for the next click, not for the next visit.
    await page.getByRole('row', { name: /Invoice copy/ }).click();
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

  test('works the inbox through in groups: deletes the noise, skims the rest, shows what is left', async ({ page }) => {
    // Two more piles on top of the usual two cases: ads nobody reads, and a newsletter worth a glance.
    const reviewCases = [
      ...mockCases,
      {
        ...mockCases[0],
        id: '3',
        subject: 'Sale ends tonight',
        categoryName: 'Werbung',
        categoryColor: 'grey',
        tier: 'ignore',
        summary: null,
      },
      {
        ...mockCases[0],
        id: '4',
        subject: 'Cheap printers',
        categoryName: 'Werbung',
        categoryColor: 'grey',
        tier: 'ignore',
        summary: null,
      },
      {
        ...mockCases[0],
        id: '5',
        sender: 'news@example.com',
        subject: 'Weekly digest',
        categoryName: 'Newsletter',
        categoryColor: 'teal',
        tier: 'info',
        summary: 'Branchennews der Woche, nichts Dringendes.',
      },
    ];
    let deleted: string[] = [];
    await page.route('**/api/cases', (route) => {
      if (route.request().method() === 'DELETE') {
        deleted = (route.request().postDataJSON() as { ids: string[] }).ids;
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fulfill({ json: reviewCases.filter((aCase) => !deleted.includes(aCase.id)) });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Durchsicht' }).click();
    const dialog = page.getByRole('dialog', { name: 'Durchsicht' });
    await expect(dialog).toBeVisible();

    // One line per category and tier, the noise first, with the count of each.
    const lines = dialog.locator('tbody tr');
    await expect(lines).toHaveCount(4);
    await expect(lines.nth(0)).toContainText(/Werbung\s*Ignorieren\s*2/);
    await expect(lines.nth(1)).toContainText(/Newsletter\s*Info\s*1/);

    // The ads go — through the same question as everywhere else — and their line goes with them,
    // while the dialog stays open for the rest.
    await dialog.getByRole('button', { name: 'Werbung löschen (2)' }).click();
    await page.getByRole('alertdialog', { name: 'Löschen bestätigen' }).getByRole('button', { name: 'Löschen' }).click();
    await expect(page.getByText('2 Vorgänge in den Papierkorb verschoben.')).toBeVisible();
    expect(deleted.sort()).toEqual(['3', '4']);
    await expect(dialog).toBeVisible();
    await expect(lines).toHaveCount(3);
    await expect(dialog).not.toContainText('Werbung');

    // What needs a person is shown in the table, and only that.
    await dialog.getByRole('button', { name: 'Statusanfrage Bestellung anzeigen' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('row', { name: /Delivery status/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Invoice copy/ })).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Weekly digest/ })).toHaveCount(0);
  });

  test('reads a group on its own page, takes note of one mail and opens another', async ({ page }) => {
    const newsletter = {
      ...mockCases[0],
      id: '5',
      sender: 'news@example.com',
      subject: 'Wochenrückblick',
      categoryName: 'Newsletter',
      categoryColor: 'teal',
      tier: 'info',
      summary: 'Branchennews der Woche, nichts Dringendes.',
    };
    const jobOffer = { ...newsletter, id: '6', sender: 'hr@example.com', subject: 'Stellenangebot', summary: null };
    const handled: { id: string; handled: boolean }[] = [];
    await page.route('**/api/cases/*/handled', (route) => {
      const id = new URL(route.request().url()).pathname.split('/').at(-2)!;
      handled.push({ id, handled: (route.request().postDataJSON() as { handled: boolean }).handled });
      return route.fulfill({ json: {} });
    });
    await page.route('**/api/cases/6', (route) => route.fulfill({ json: { ...jobOffer, bodyText: 'Wir suchen jemanden.' } }));
    await page.route('**/api/cases', (route) =>
      route.fulfill({
        json: [
          ...mockCases,
          // A case somebody already took note of never reaches the review.
          { ...newsletter, id: '7', subject: 'Alter Rückblick', handledAt: '2026-08-18T09:00:00Z' },
          ...(handled.some((entry) => entry.id === '5') ? [{ ...newsletter, handledAt: '2026-08-20T09:00:00Z' }] : [newsletter]),
          jobOffer,
        ],
      }),
    );

    await page.goto('/');
    await page.getByRole('button', { name: 'Durchsicht' }).click();
    await page.getByRole('button', { name: 'Zusammenfassungen: Newsletter' }).click();

    // A page of its own, reachable by its address rather than an overlay over the table.
    await expect(page).toHaveURL(/\/review\?category=Newsletter&tier=info/);
    await expect(page.getByRole('heading', { name: 'Newsletter', level: 1 })).toBeVisible();
    await expect(page.getByText('2 Vorgänge')).toBeVisible();
    // Scoped to the page: the sidebar's navigation is a list of items too.
    const cards = page.getByRole('main').getByRole('listitem');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText('Branchennews der Woche, nichts Dringendes.');
    await expect(cards.nth(1)).toContainText('Keine Zusammenfassung vorhanden.');
    // The one that was taken note of earlier is not offered again.
    await expect(page.getByText('Alter Rückblick')).toHaveCount(0);

    // Taken note of: no question, no toast, the card simply goes.
    await page.getByRole('button', { name: '„Wochenrückblick“ als erledigt markieren' }).click();
    await expect(cards).toHaveCount(1);
    expect(handled).toEqual([{ id: '5', handled: true }]);

    // And the one worth a closer look is opened, with the group as what paging walks through.
    await page.getByRole('button', { name: '„Stellenangebot“ ansehen' }).click();
    // The body only the detail view carries: the subject alone stands on the card as well.
    await expect(page).toHaveURL(/\/cases\/6$/);
    await expect(page.getByText('Wir suchen jemanden.')).toBeVisible();

    // Back from the summaries is back into the review, not merely into the inbox.
    await page.goBack();
    await page.getByRole('link', { name: 'Zurück zur Durchsicht' }).click();
    await expect(page.getByRole('dialog', { name: 'Durchsicht' })).toBeVisible();
    // The address is the plain inbox again, so a bookmark of it is not the review.
    await expect(page).toHaveURL(/\/$/);
  });

  test('files what was ticked off in the archive, and keeps it out of the inbox', async ({ page }) => {
    const archived = {
      ...mockCases[0],
      id: '3',
      sender: 'news@example.com',
      subject: 'Erledigter Rückblick',
      categoryName: 'Newsletter',
      categoryColor: 'teal',
      tier: 'info',
      handledAt: '2026-08-20T09:00:00Z',
    };
    await page.route('**/api/cases', (route) => route.fulfill({ json: [...mockCases, archived] }));

    await page.goto('/');
    // The inbox is what is left to do; what somebody ticked off is not part of it.
    await expect(page.getByRole('row', { name: /Delivery status/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Erledigter Rückblick/ })).toHaveCount(0);
    await expect(page.getByText('1 – 2 von 2 Vorgängen')).toBeVisible();

    await page.getByRole('link', { name: 'Archiv' }).click();

    await expect(page).toHaveURL(/\/archive$/);
    await expect(page.getByRole('row', { name: /Erledigter Rückblick/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Delivery status/ })).toHaveCount(0);

    // The same table as the inbox: the same columns, the same toolbar — except the review,
    // which works through what is still open.
    for (const column of ['Absender', 'Empfänger', 'Betreff', 'Kategorie', 'Stufe', 'Eingegangen']) {
      await expect(page.getByRole('columnheader', { name: column })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Exportieren' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ansicht zurücksetzen' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Durchsicht' })).toHaveCount(0);
  });

  test('puts a case out of the archive back into the inbox', async ({ page }) => {
    const archived = {
      ...mockCases[0],
      id: '3',
      sender: 'news@example.com',
      subject: 'Zu früh abgehakt',
      handledAt: '2026-08-20T09:00:00Z' as string | null,
    };
    let reopened: { id: string; handled: boolean } | null = null;
    await page.route('**/api/cases/*/handled', (route) => {
      const id = new URL(route.request().url()).pathname.split('/').at(-2)!;
      reopened = { id, handled: (route.request().postDataJSON() as { handled: boolean }).handled };
      return route.fulfill({ json: {} });
    });
    await page.route('**/api/cases', (route) =>
      route.fulfill({ json: [...mockCases, { ...archived, handledAt: reopened ? null : archived.handledAt }] }),
    );

    await page.goto('/archive');
    await expect(page.getByRole('row', { name: /Zu früh abgehakt/ })).toBeVisible();

    await page.getByRole('button', { name: '„Zu früh abgehakt“ wieder öffnen' }).click();

    await expect(page.getByText('Vorgang ist wieder im Posteingang.')).toBeVisible();
    expect(reopened).toEqual({ id: '3', handled: false });
    // Out of the archive, and there in the inbox.
    await expect(page.getByRole('row', { name: /Zu früh abgehakt/ })).toHaveCount(0);
    await page.getByRole('link', { name: 'Posteingang' }).click();
    await expect(page.getByRole('row', { name: /Zu früh abgehakt/ })).toBeVisible();
  });

  test('remembers what each of the two pages was filtered by, one apart from the other', async ({ page }) => {
    const archived = { ...mockCases[0], id: '3', subject: 'Erledigter Rückblick', handledAt: '2026-08-20T09:00:00Z' };
    await page.route('**/api/cases', (route) => route.fulfill({ json: [...mockCases, archived] }));

    await page.goto('/archive');
    await page.getByRole('textbox', { name: 'Suchen' }).fill('Rückblick');
    // The archive keeps what it was filtered by, under a name of its own.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('frontdesk-archive-table'))).toContain('Rückblick');

    await page.getByRole('link', { name: 'Posteingang' }).click();

    // The inbox is untouched by it: both mails are there, the search box is empty.
    await expect(page.getByRole('textbox', { name: 'Suchen' })).toHaveValue('');
    await expect(page.getByRole('row', { name: /Delivery status/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Invoice copy/ })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('frontdesk-case-table'))).toBeNull();
  });

  test('collects what was deleted in the trash, and deletes it there for good', async ({ page }) => {
    let trashed: string[] = [];
    let purged: string[] = [];
    await page.route('**/api/cases/purge', (route) => {
      purged = (route.request().postDataJSON() as { ids: string[] }).ids;
      return route.fulfill({ status: 204, body: '' });
    });
    await page.route('**/api/cases', (route) => {
      if (route.request().method() === 'DELETE') {
        trashed = (route.request().postDataJSON() as { ids: string[] }).ids;
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fulfill({
        json: mockCases
          .filter((aCase) => !purged.includes(aCase.id))
          .map((aCase) => (trashed.includes(aCase.id) ? { ...aCase, handledAt: null, deletedAt: '2026-08-21T09:00:00Z' } : aCase)),
      });
    });

    await page.goto('/');
    await page
      .getByRole('row', { name: /Delivery status/ })
      .getByRole('button', { name: 'Vorgang löschen' })
      .click();
    await page.getByRole('alertdialog', { name: 'Löschen bestätigen' }).getByRole('button', { name: 'Löschen' }).click();

    // Deleting is not gone: the case moved, and the word for it says where.
    await expect(page.getByText('Vorgang in den Papierkorb verschoben.')).toBeVisible();
    expect(trashed).toEqual(['1']);
    await expect(page.getByRole('row', { name: /Delivery status/ })).toHaveCount(0);

    await page.getByRole('link', { name: 'Papierkorb' }).click();

    await expect(page).toHaveURL(/\/trash$/);
    const row = page.getByRole('row', { name: /Delivery status/ });
    await expect(row).toBeVisible();
    // Here deleting means for good, and says so before it happens.
    await expect(page.getByRole('button', { name: 'Auswahl löschen' })).toContainText('Endgültig löschen');
    await row.getByRole('button', { name: 'Vorgang endgültig löschen' }).click();
    const question = page.getByRole('alertdialog', { name: 'Endgültig löschen' });
    await expect(question).toContainText('rückgängig');
    await question.getByRole('button', { name: 'Endgültig löschen' }).click();

    await expect(page.getByText('Vorgang endgültig gelöscht.')).toBeVisible();
    expect(purged).toEqual(['1']);
    await expect(page.getByRole('row', { name: /Delivery status/ })).toHaveCount(0);
  });

  test('fetches a case back out of the trash, to where it was', async ({ page }) => {
    let restored: string[] = [];
    await page.route('**/api/cases/restore', (route) => {
      restored = (route.request().postDataJSON() as { ids: string[] }).ids;
      return route.fulfill({ status: 204, body: '' });
    });
    await page.route('**/api/cases', (route) =>
      route.fulfill({
        json: [
          mockCases[0],
          // Thrown away after it was ticked off: it goes back to the archive, not to the inbox.
          {
            ...mockCases[1],
            subject: 'Doch nicht weg',
            handledAt: '2026-08-20T09:00:00Z',
            deletedAt: restored.includes('2') ? null : '2026-08-21T09:00:00Z',
          },
        ],
      }),
    );

    await page.goto('/trash');
    await page.getByRole('button', { name: '„Doch nicht weg“ wiederherstellen' }).click();

    await expect(page.getByText('Vorgang wiederhergestellt.')).toBeVisible();
    expect(restored).toEqual(['2']);
    await expect(page.getByRole('row', { name: /Doch nicht weg/ })).toHaveCount(0);

    await page.getByRole('link', { name: 'Archiv' }).click();
    await expect(page.getByRole('row', { name: /Doch nicht weg/ })).toBeVisible();
    await page.getByRole('link', { name: 'Posteingang', exact: true }).click();
    await expect(page.getByRole('row', { name: /Doch nicht weg/ })).toHaveCount(0);
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
