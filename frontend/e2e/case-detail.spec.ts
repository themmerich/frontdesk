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

const detail = {
  ...listed[0],
  categoryId: 'c1',
  bodyText: 'Sehr geehrte Damen und Herren,\n\nbitte senden Sie mir eine Kopie zu.',
  draftText: null,
  draftGeneratedAt: null,
  draftUpdatedAt: null,
};

test.describe('Case detail', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: mockUser }));
    await page.route('**/api/company', (route) => route.fulfill({ json: { name: 'Musterfirma GmbH', hasLogo: false } }));
    await page.route('**/api/cases', (route) => route.fulfill({ json: listed }));
    // The detail page reads the categories a case can be filed under; unanswered, the request
    // comes back 401 from the real backend and the interceptor sends the browser to the login.
    await page.route('**/api/case-categories/selectable', (route) =>
      route.fulfill({ json: [{ id: 'c1', name: 'Rechnung', color: 'amber' }] }),
    );
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

  test('lists the attachments and opens each the way its kind asks for', async ({ page }) => {
    const attachments = [
      { id: 'a1', fileName: 'logo.png', contentType: 'image/png', sizeBytes: 900, inline: true, contentId: 'logo@kunde' },
      { id: 'a2', fileName: 'Angebot Frühjahr.pdf', contentType: 'application/pdf', sizeBytes: 122_880, inline: false, contentId: null },
      {
        id: 'a3',
        fileName: 'Preise.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: 2_048,
        inline: false,
        contentId: null,
      },
    ];
    const html = '<p>Anbei unser <b>Angebot</b>.</p><img src="cid:logo@kunde" alt="Logo">';
    await page.route('**/api/cases/1', (route) => route.fulfill({ json: { ...detail, bodyHtml: html, attachments } }));
    // The logo, fetched by the page for the frame; the two files are not fetched until clicked.
    const served: string[] = [];
    await page.route('**/api/cases/1/attachments/*', (route) => {
      served.push(route.request().url().split('/').pop() ?? '');
      return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgo=', 'base64') });
    });

    await page.goto('/cases/1');

    // The two files a person would open, with name and size; the logo belongs into the mail.
    const list = page.getByRole('list', { name: 'Anhänge' });
    const links = list.getByRole('link');
    await expect(links).toHaveText(['Angebot Frühjahr.pdf 120 KB', 'Preise.xlsx 2 KB']);
    await expect(links.first()).toHaveAttribute('href', '/api/cases/1/attachments/a2');
    await expect(links.first()).toHaveAttribute('target', '_blank');
    await expect(links.nth(1)).toHaveAttribute('download', 'Preise.xlsx');
    await expect(links.nth(1)).not.toHaveAttribute('target', /.+/);
    await expect(page.getByText('Diese Mail hat Anhänge')).toHaveCount(0);

    // The logo is in the frame as a data URL: the frame has no origin to fetch it with itself.
    const frame = page.frameLocator('iframe[sandbox]');
    await expect(frame.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
    expect(served).toEqual(['a1']);
  });

  test('uses the whole width and makes the addresses in the mail clickable', async ({ page }) => {
    await page.route('**/api/cases/1', (route) =>
      route.fulfill({ json: { ...detail, bodyText: 'Status unter https://example.com/status/4711 (dort auch die Nummer).' } }),
    );
    await page.setViewportSize({ width: 1500, height: 800 });

    await page.goto('/cases/1');
    await expect(page.getByRole('heading', { name: 'Rechnung 2026-081' })).toBeVisible();

    // Nothing capping the page: it is as wide as the card it sits in.
    const widths = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      return [Math.round(main.getBoundingClientRect().width), Math.round(main.parentElement!.getBoundingClientRect().width)];
    });
    expect(widths[0]).toBe(widths[1]);

    // The mail reads as it was written: cutting the text into linked and unlinked pieces must
    // not leave a space behind where the template broke a line.
    const shown = await page.locator('main section div.whitespace-pre-wrap').textContent();
    expect(shown).toBe('Status unter https://example.com/status/4711 (dort auch die Nummer).');

    const link = page.getByRole('link', { name: 'https://example.com/status/4711' });
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // The bracket behind the address belongs to the sentence, not to the link.
    await expect(link).toHaveAttribute('href', 'https://example.com/status/4711');
  });

  test('shows a mail written in HTML as it was written, and holds its pictures back', async ({ page }) => {
    const html =
      '<p style="color: rgb(220, 38, 38)">Sehr geehrte Damen und Herren,</p>' +
      '<p>bitte senden Sie mir eine <b>Kopie</b> zu.</p>' +
      '<p><img src="https://tracker.example.com/pixel.gif" alt="Zähler"></p>' +
      '<p><a href="https://example.com/status">Status ansehen</a></p>';
    await page.route('**/api/cases/1', (route) => route.fulfill({ json: { ...detail, bodyHtml: html } }));
    // Counted where the picture would actually be fetched: what the policy blocks never gets
    // this far, so this is the difference between "not shown" and "not loaded".
    let fetched = 0;
    await page.route('https://tracker.example.com/**', (route) => {
      fetched++;
      return route.fulfill({ contentType: 'image/gif', body: '' });
    });

    await page.goto('/cases/1');

    // The mail keeps its markup and its own styling, inside a frame of its own.
    const frame = page.frameLocator('iframe[sandbox]');
    await expect(frame.locator('b')).toHaveText('Kopie');
    await expect(frame.locator('p').first()).toHaveCSS('color', 'rgb(220, 38, 38)');
    // Links leave through a new tab, as they do in a plain text mail.
    await page.route('https://example.com/**', (route) => route.fulfill({ contentType: 'text/html', body: 'ok' }));
    const opened = page.waitForEvent('popup');
    await frame.locator('a').click();
    expect((await opened).url()).toBe('https://example.com/status');

    // Nothing was fetched from the internet: opening a mail must not tell its sender so.
    await expect(page.getByText('Bilder aus dem Internet wurden nicht geladen.')).toBeVisible();
    expect(fetched).toBe(0);

    // Until it is asked for.
    await page.getByRole('button', { name: 'Bilder anzeigen' }).click();
    await expect(page.getByText('Bilder aus dem Internet wurden nicht geladen.')).toHaveCount(0);
    await expect.poll(() => fetched).toBeGreaterThan(0);
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

  test('writes a reply on request and shows it beside the mail', async ({ page }) => {
    let requests = 0;
    let asked: { instruction: string | null } | undefined;
    await page.route('**/api/cases/1/draft', async (route) => {
      requests++;
      asked = route.request().postDataJSON() as { instruction: string | null };
      await route.fulfill({
        json: {
          ...detail,
          draftText: 'Guten Tag,\n\ndie Kopie senden wir Ihnen zu.\n\nMusterfirma GmbH',
          draftGeneratedAt: '2026-08-19T10:00:00Z',
          draftUpdatedAt: '2026-08-19T10:00:00Z',
        },
      });
    });

    await page.goto('/cases/1');
    // Nothing written yet: the box is open and empty, with a line for the model beside the button.
    await expect(page.getByRole('textbox', { name: 'Antwortentwurf' })).toHaveValue('');
    await page.getByRole('textbox', { name: 'Anweisung an die KI' }).fill('Lehne ab und nenne unsere Verfügbarkeit dieses Jahr.');
    // The icon's glyph goes in front of the label in the button's name, so it is matched by its
    // end; case-sensitive, so that "Neu erzeugen" later on is not the same button.
    await page.getByRole('button', { name: /Erzeugen$/ }).click();

    expect(requests).toBe(1);
    expect(asked).toEqual({ instruction: 'Lehne ab und nenne unsere Verfügbarkeit dieses Jahr.' });
    await expect(page.getByRole('textbox', { name: 'Antwortentwurf' })).toHaveValue(/die Kopie senden wir Ihnen zu/);
    await expect(page.getByText(/Erzeugt am/)).toBeVisible();
    await expect(page.getByText('Entwurf erzeugt.')).toBeVisible();
    // With a draft there, the button changes its word and steps back from the primary colour.
    await expect(page.getByRole('button', { name: /Erzeugen$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Neu erzeugen' })).toHaveClass(/p-button-outlined/);
  });

  test('lets a person write the reply themselves', async ({ page }) => {
    let saved: { text: string } | undefined;
    await page.route('**/api/cases/1/draft', async (route) => {
      saved = route.request().postDataJSON() as { text: string };
      await route.fulfill({ json: { ...detail, draftText: saved.text, draftUpdatedAt: '2026-08-19T10:05:00Z' } });
    });

    await page.goto('/cases/1');

    // An empty box to write into, straight away; nothing to save until something is in it.
    const box = page.getByRole('textbox', { name: 'Antwortentwurf' });
    await expect(box).toHaveValue('');
    const save = page.getByRole('button', { name: 'Speichern' });
    await expect(save).toBeDisabled();

    await box.fill('Guten Tag,\n\nvielen Dank für Ihre Nachricht, wir melden uns.');
    await expect(save).toBeEnabled();
    await save.click();

    expect(saved).toEqual({ text: 'Guten Tag,\n\nvielen Dank für Ihre Nachricht, wir melden uns.' });
    await expect(page.getByText('Änderungen gespeichert.')).toBeVisible();
  });

  test('saves an edited reply from the same button as the verdict', async ({ page }) => {
    const drafted = {
      ...detail,
      draftText: 'Guten Tag,\n\ndie Kopie senden wir Ihnen zu.',
      draftGeneratedAt: '2026-08-19T10:00:00Z',
      draftUpdatedAt: '2026-08-19T10:00:00Z',
    };
    let saved: { text: string } | undefined;
    await page.route('**/api/cases/1', (route) => route.fulfill({ json: drafted }));
    await page.route('**/api/cases/1/draft', async (route) => {
      saved = route.request().postDataJSON() as { text: string };
      await route.fulfill({ json: { ...drafted, draftText: saved.text, draftUpdatedAt: '2026-08-19T10:05:00Z' } });
    });

    await page.goto('/cases/1');
    const save = page.getByRole('button', { name: 'Speichern' });
    await expect(save).toBeDisabled();

    await page.getByRole('textbox', { name: 'Antwortentwurf' }).fill('Guten Tag,\n\ndie Kopie ist unterwegs.');
    await expect(save).toBeEnabled();
    await save.click();

    expect(saved).toEqual({ text: 'Guten Tag,\n\ndie Kopie ist unterwegs.' });
    await expect(page.getByText('Änderungen gespeichert.')).toBeVisible();
    // Saved is saved: nothing differs from the case any more, and the edit is dated.
    await expect(save).toBeDisabled();
    await expect(page.getByText(/Bearbeitet am/)).toBeVisible();
  });

  test('sends the reply after asking, and shows the case as sent with the step on its trail', async ({ page }) => {
    const drafted = {
      ...detail,
      draftText: 'Guten Tag,\n\ndie Kopie senden wir Ihnen zu.',
      draftGeneratedAt: '2026-08-19T10:00:00Z',
      draftUpdatedAt: '2026-08-19T10:00:00Z',
      events: [
        { type: 'ingested', occurredAt: '2026-08-19T09:15:00Z', actorName: null, details: { sender: 'kunde@example.com' } },
        {
          type: 'triaged',
          occurredAt: '2026-08-19T09:16:00Z',
          actorName: null,
          details: { tier: 'draft', confidence: 0.72, categoryName: 'Rechnung' },
        },
      ],
    };
    let sends = 0;
    await page.route('**/api/cases/1', (route) => route.fulfill({ json: drafted }));
    await page.route('**/api/cases/1/send', (route) => {
      sends++;
      return route.fulfill({
        json: {
          ...drafted,
          sentAt: '2026-08-19T11:00:00Z',
          sentByName: 'Anna Admin',
          handledAt: '2026-08-19T11:00:00Z',
          events: [
            ...drafted.events,
            {
              type: 'sent',
              occurredAt: '2026-08-19T11:00:00Z',
              actorName: 'Anna Admin',
              details: { to: 'kunde@example.com', subject: 'Re: Rechnung 2026-081' },
            },
          ],
        },
      });
    });

    await page.goto('/cases/1');
    // The trail so far, under the verdict: came in, was judged — with the verdict spelled out.
    await expect(page.getByRole('heading', { name: 'Verlauf' })).toBeVisible();
    const history = page.locator('app-case-timeline');
    await expect(history.locator('[data-event]')).toHaveCount(2);
    await expect(history.locator('[data-event="triaged"]')).toContainText('Bewertet: Entwurf, 72 %, Rechnung');

    await page.getByRole('button', { name: 'Senden' }).click();

    // Asked first, with the address and the subject; nothing has left yet.
    // Named, because the page's own confirm dialog host carries the role as well.
    const dialog = page.getByRole('alertdialog', { name: 'Antwort senden?' });
    await expect(dialog).toContainText('Die Antwort geht an kunde@example.com. Betreff: Rechnung 2026-081');
    expect(sends).toBe(0);
    await dialog.getByRole('button', { name: 'Senden' }).click();

    await expect(page.getByText('Antwort gesendet.')).toBeVisible();
    expect(sends).toBe(1);
    // Frozen, dated and signed; nothing more to write or to send.
    const box = page.getByRole('textbox', { name: 'Antwortentwurf' });
    await expect(box).toHaveAttribute('readonly', '');
    await expect(page.getByText(/Gesendet am .* von Anna Admin/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Senden' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Neu erzeugen' })).toHaveCount(0);
    await expect(history.locator('[data-event]')).toHaveCount(3);
    await expect(history.locator('[data-event="sent"]')).toContainText('Antwort gesendet an kunde@example.com');
    await expect(history.locator('[data-event="sent"]')).toContainText('Anna Admin');
  });

  test('saves category and tier together, and only when the button is pressed', async ({ page }) => {
    let stored = { ...detail };
    let saves = 0;
    await page.route('**/api/case-categories/selectable', (route) =>
      route.fulfill({
        json: [
          { id: 'c1', name: 'Rechnung', color: 'amber' },
          { id: 'c2', name: 'Reklamation', color: 'red' },
        ],
      }),
    );
    await page.route('**/api/cases/1', (route) => route.fulfill({ json: stored }));
    await page.route('**/api/cases/1/classification', async (route) => {
      saves++;
      const body = route.request().postDataJSON() as { categoryId: string | null; tier: string };
      stored = {
        ...stored,
        categoryId: body.categoryId,
        categoryName: body.categoryId === 'c2' ? 'Reklamation' : null,
        tier: body.tier,
      };
      await route.fulfill({ json: stored });
    });

    await page.goto('/cases/1');
    const save = page.getByRole('button', { name: 'Speichern' });
    // Nothing differs from the case yet.
    await expect(save).toBeDisabled();

    await page.locator('p-select[inputid="category"]').click();
    await page.getByRole('option', { name: 'Reklamation' }).click();
    await page.locator('p-select[inputid="tier"]').click();
    await page.getByRole('option', { name: 'Manuell' }).click();

    // Picked, not saved: the case is only corrected from the button below.
    await expect(save).toBeEnabled();
    expect(saves).toBe(0);

    await save.click();

    await expect(page.getByText('Änderungen gespeichert.')).toBeVisible();
    expect(saves).toBe(1);
    await expect(save).toBeDisabled();
  });

  test('ticks a case off from the detail view and moves on to the next one', async ({ page }) => {
    const handled: { id: string; handled: boolean }[] = [];
    await page.route('**/api/cases/*/handled', (route) => {
      const id = new URL(route.request().url()).pathname.split('/').at(-2)!;
      handled.push({ id, handled: (route.request().postDataJSON() as { handled: boolean }).handled });
      return route.fulfill({ json: {} });
    });
    await page.route('**/api/cases', (route) =>
      route.fulfill({
        json: listed.map((aCase) =>
          handled.some((entry) => entry.id === aCase.id) ? { ...aCase, handledAt: '2026-08-20T09:00:00Z' } : aCase,
        ),
      }),
    );

    await page.goto('/');
    await page.getByRole('row', { name: /Rechnung 2026-081/ }).dblclick();
    await expect(page.getByRole('heading', { name: 'Rechnung 2026-081' })).toBeVisible();

    await page.getByRole('button', { name: 'Erledigt' }).click();

    await expect(page.getByText('Vorgang ins Archiv verschoben.')).toBeVisible();
    expect(handled).toEqual([{ id: '1', handled: true }]);
    // On to the next case of the list that was being worked through.
    await expect(page).toHaveURL(/\/cases\/2$/);

    // And out of the inbox, into the archive.
    // The back link on the page; the sidebar carries the same word.
    await page.getByRole('main').getByRole('link', { name: 'Posteingang' }).click();
    await expect(page.getByRole('row', { name: /Rechnung 2026-081/ })).toHaveCount(0);
    await page.getByRole('link', { name: 'Archiv' }).click();
    await expect(page.getByRole('row', { name: /Rechnung 2026-081/ })).toBeVisible();
  });

  test('lets the line between mail and reply be dragged, and remembers where it was left', async ({ page }) => {
    // A mail written in HTML sits in a frame, and a frame keeps the pointer events that land on
    // it: the drag has to survive the pointer crossing into the mail, at speed.
    await page.route('**/api/cases/1', (route) => route.fulfill({ json: { ...detail, bodyHtml: '<p>Bitte um eine Kopie.</p>' } }));
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/cases/1');
    await expect(page.locator('iframe[sandbox]')).toBeVisible();
    const separator = page.getByRole('separator');
    await expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
    const mailPanel = page.locator('.p-splitter-panel').first();
    const before = (await mailPanel.boundingBox())!.width;

    // Dragged 200 pixels to the left in three big steps, across the mail: the reply gets the
    // room, the mail gives it up.
    const handle = (await separator.boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 - 200, handle.y + handle.height / 2, { steps: 3 });
    await page.mouse.up();
    const after = (await mailPanel.boundingBox())!.width;
    expect(after).toBeLessThan(before - 150);

    // Remembered across a reload, under the key for the wide arrangement.
    await page.reload();
    await expect(page.getByRole('separator')).toBeVisible();
    expect((await page.locator('.p-splitter-panel').first().boundingBox())!.width).toBeCloseTo(after, -1);
    const stored = await page.evaluate(() => localStorage.getItem('frontdesk-case-detail-splitter-wide'));
    expect(stored).not.toBeNull();

    // On a narrow screen the line runs the other way, and the wide split is not applied to it.
    await page.setViewportSize({ width: 1000, height: 1000 });
    await expect(page.getByRole('separator')).toHaveAttribute('aria-orientation', 'vertical');
    expect(await page.evaluate(() => localStorage.getItem('frontdesk-case-detail-splitter-stacked'))).toBeNull();
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

    await expect(page.getByText('Vorgang in den Papierkorb verschoben.')).toBeVisible();
    // Tidying up happens in a run, so the next case rather than the inbox.
    await expect(page).toHaveURL(/\/cases\/2$/);
  });
});
