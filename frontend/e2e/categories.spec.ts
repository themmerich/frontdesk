import { expect, test } from '@playwright/test';

// Backend-less like the other e2e specs: the API is mocked per test, the
// assertions use the German texts because de is the default language.
const adminUser = {
  username: 'admin',
  displayName: 'Anna Admin',
  role: 'admin',
  tenantName: 'Musterfirma GmbH',
};

const regularUser = { ...adminUser, username: 'user', displayName: 'Uwe User', role: 'user' };

const orderStatus = {
  id: 'c1',
  code: 'ORDER_STATUS',
  name: 'Statusanfrage Bestellung',
  description: 'Frage nach dem Liefertermin.',
  tier: 'automatic',
  color: 'blue',
  sortOrder: 0,
  active: true,
  caseCount: 3,
};

const invoice = {
  id: 'c2',
  code: 'INVOICE',
  name: 'Rechnung',
  description: 'Eingehende Rechnung.',
  tier: 'manual',
  color: null,
  sortOrder: 1,
  active: true,
  caseCount: 0,
};

test.describe('Case categories', () => {
  // Every signed-in page needs the session and the company; this one also reads
  // the triage settings. An unmocked call would reach the real backend, answer
  // 401 and bounce the page to the login — the tests would fail far from the
  // cause. Individual tests override what they care about.
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: adminUser }));
    await page.route('**/api/company', (route) => route.fulfill({ json: { name: 'Musterfirma GmbH', hasLogo: false } }));
    await page.route('**/api/cases', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/triage-settings', (route) => route.fulfill({ json: { extraInstructions: '', confidenceThreshold: 0.8 } }));
  });

  test('opens from the sidebar and lists what steers the triage', async ({ page }) => {
    await page.route('**/api/case-categories', (route) => route.fulfill({ json: [orderStatus, invoice] }));

    await page.goto('/');
    await page.getByRole('link', { name: 'Kategorien' }).click();

    await expect(page.getByRole('heading', { name: 'Kategorien' })).toBeVisible();
    const row = page.getByRole('row', { name: /Statusanfrage Bestellung/ });
    await expect(row).toContainText('Frage nach dem Liefertermin.');
    await expect(row.locator('p-tag').first()).toHaveText('Automatisch');
  });

  test('adds a category, prepared for approval by default', async ({ page }) => {
    let categories = [orderStatus];
    let created: Record<string, unknown> | undefined;
    await page.route('**/api/case-categories', (route) => {
      if (route.request().method() === 'POST') {
        created = route.request().postDataJSON() as Record<string, unknown>;
        categories = [...categories, { ...invoice, id: 'c3', name: 'Terminanfrage', ...created }];
        return route.fulfill({ status: 201, json: categories[categories.length - 1] });
      }
      return route.fulfill({ json: categories });
    });

    await page.goto('/categories');
    await page.getByRole('button', { name: 'Hinzufügen' }).click();

    await expect(page.getByRole('dialog').getByText('Neue Kategorie')).toBeVisible();
    // Nothing is judged before the admin types.
    await expect(page.locator('.p-invalid')).toHaveCount(0);
    // The code is derived by the backend, so a new category has none to show.
    await expect(page.getByLabel('Code für die KI')).toHaveCount(0);

    await page.getByLabel('Name').fill('Terminanfrage');
    await page.getByLabel('Beschreibung').fill('Kunde möchte einen Termin vor Ort.');
    // The settings form above the table has a save button of its own.
    await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();

    await expect(page.getByText('Kategorie gespeichert.')).toBeVisible();
    // A new category prepares a draft rather than answering on its own.
    expect(created).toMatchObject({
      name: 'Terminanfrage',
      description: 'Kunde möchte einen Termin vor Ort.',
      tier: 'draft',
      active: true,
    });
    await expect(page.getByRole('row', { name: /Terminanfrage/ })).toBeVisible();
  });

  test('refuses to delete a category that cases still point at', async ({ page }) => {
    let deleteCalls = 0;
    await page.route('**/api/case-categories', (route) => route.fulfill({ json: [orderStatus, invoice] }));
    await page.route('**/api/case-categories/c1', (route) => {
      deleteCalls++;
      return route.fulfill({ status: 204, body: '' });
    });

    await page.goto('/categories');
    // The column says in advance why this will not work.
    await expect(page.getByRole('row', { name: /Statusanfrage Bestellung/ })).toContainText('3');
    await page
      .getByRole('row', { name: /Statusanfrage Bestellung/ })
      .getByRole('button', { name: 'Löschen' })
      .click();

    await expect(page.getByText('ist 3 Vorgängen zugeordnet')).toBeVisible();
    // Not even a question, and certainly no request. Named, because the edit
    // dialog's host element carries the same role even while it is closed.
    await expect(page.getByRole('alertdialog', { name: 'Löschen bestätigen' })).toHaveCount(0);
    expect(deleteCalls).toBe(0);
  });

  test('asks before deleting a category nothing points at', async ({ page }) => {
    let deleted: string | undefined;
    await page.route('**/api/case-categories', (route) => route.fulfill({ json: [orderStatus, invoice] }));
    await page.route('**/api/case-categories/c2', (route) => {
      deleted = 'c2';
      return route.fulfill({ status: 204, body: '' });
    });

    await page.goto('/categories');
    await page
      .getByRole('row', { name: /Rechnung/ })
      .getByRole('button', { name: 'Löschen' })
      .click();

    const dialog = page.getByRole('alertdialog', { name: 'Löschen bestätigen' });
    await expect(dialog).toContainText('Rechnung');
    await dialog.getByRole('button', { name: 'Löschen' }).click();

    await expect(page.getByText('Kategorie gelöscht.')).toBeVisible();
    expect(deleted).toBe('c2');
  });

  test('edits the description the model reads, keeping the code', async ({ page }) => {
    let saved: Record<string, unknown> | undefined;
    await page.route('**/api/case-categories', (route) => route.fulfill({ json: [orderStatus] }));
    await page.route('**/api/case-categories/c1', (route) => {
      saved = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: { ...orderStatus, ...saved } });
    });

    await page.goto('/categories');
    await page
      .getByRole('row', { name: /Statusanfrage Bestellung/ })
      .getByRole('button', { name: 'Bearbeiten' })
      .click();

    // The code is shown so a rename is visibly harmless, but never editable.
    await expect(page.getByLabel('Code für die KI')).toHaveValue('ORDER_STATUS');
    await expect(page.getByLabel('Code für die KI')).toBeDisabled();

    await page.getByLabel('Beschreibung').fill('Frage nach Liefertermin oder Versand, nicht: Rückfragen zu einer Rechnung.');
    await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();

    await expect(page.getByText('Kategorie gespeichert.')).toBeVisible();
    expect(saved).toMatchObject({
      name: 'Statusanfrage Bestellung',
      description: 'Frage nach Liefertermin oder Versand, nicht: Rückfragen zu einer Rechnung.',
    });
  });

  test('keeps the colour label clear of the field when no colour is chosen', async ({ page }) => {
    // invoice carries no colour, which is the case where the float label used to
    // sit on top of the "Keine" the select displays.
    await page.route('**/api/case-categories', (route) => route.fulfill({ json: [invoice] }));

    await page.goto('/categories');
    await page
      .getByRole('row', { name: /Rechnung/ })
      .getByRole('button', { name: 'Bearbeiten' })
      .click();

    const field = page.locator('p-select').nth(1);
    await expect(field).toContainText('Keine');
    const label = page.getByRole('dialog').locator('label[for="color"]');
    const labelBox = (await label.boundingBox())!;
    const valueBox = (await field.locator('.p-select-label').boundingBox())!;

    // Floated to the border rather than resting on the value: unfloated, the two
    // would share a centre line, which is exactly how the label covered the text.
    expect(labelBox.y + labelBox.height / 2).toBeLessThan(valueBox.y + valueBox.height / 2 - 5);
  });

  test('shows the whole colour list where it reaches past the dialog', async ({ page }) => {
    await page.route('**/api/case-categories', (route) => route.fulfill({ json: [orderStatus] }));
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/categories');
    await page
      .getByRole('row', { name: /Statusanfrage Bestellung/ })
      .getByRole('button', { name: 'Bearbeiten' })
      .click();
    await page.locator('p-select').nth(1).click();
    await expect(page.getByRole('option', { name: 'Blau' })).toBeVisible();

    const measured = await page.evaluate(() => {
      const overlay = document.querySelector('.p-select-overlay')!.getBoundingClientRect();
      const dialog = document.querySelector('.p-dialog')!.getBoundingClientRect();
      const middleOfTheStrip = (dialog.bottom + overlay.bottom) / 2;
      const painted = document.elementFromPoint(overlay.left + overlay.width / 2, middleOfTheStrip);
      return { below: overlay.bottom - dialog.bottom, isList: painted?.closest('.p-select-overlay') !== null };
    });

    // The eight colours make the list longer than the room left below the field,
    // which is the situation this test is about — if a layout change ever makes
    // it fit, this assertion says so rather than passing on nothing.
    expect(measured.below).toBeGreaterThan(4);
    // Attached to the body rather than rendered inside the dialog, so the part
    // that reaches past the dialog's edge is painted instead of covered.
    expect(measured.isList).toBe(true);
  });

  test('puts a colour on a category, which the inbox then draws its cases in', async ({ page }) => {
    let saved: Record<string, unknown> | undefined;
    await page.route('**/api/case-categories', (route) => route.fulfill({ json: [orderStatus] }));
    await page.route('**/api/case-categories/c1', (route) => {
      saved = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: { ...orderStatus, ...saved } });
    });

    await page.goto('/categories');
    await page
      .getByRole('row', { name: /Statusanfrage Bestellung/ })
      .getByRole('button', { name: 'Bearbeiten' })
      .click();

    // The dialog's two dropdowns in order: the tier, then the colour.
    await page.locator('p-select').nth(1).click();
    await page.getByRole('option', { name: 'Grün' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();

    await expect(page.getByText('Kategorie gespeichert.')).toBeVisible();
    // Only the palette name travels; the two values behind it live in the stylesheet.
    expect(saved).toMatchObject({ color: 'green' });
  });

  test('stores the confidence threshold as the fraction behind the percentage', async ({ page }) => {
    await page.route('**/api/case-categories', (route) => route.fulfill({ json: [orderStatus] }));
    let saved: Record<string, unknown> | undefined;
    await page.route('**/api/triage-settings', (route) => {
      if (route.request().method() === 'PUT') {
        saved = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill({ json: saved });
      }
      return route.fulfill({ json: { extraInstructions: '', confidenceThreshold: 0.8 } });
    });

    await page.goto('/categories');
    const threshold = page.getByLabel('Mindestsicherheit');
    // 0.8 in the database reads as a percentage on the screen.
    await expect(threshold).toHaveValue('80 %');
    // Nothing edited yet, so there is nothing to save.
    // The dialog is closed here, so the only save button is the settings one.
    const saveButton = page.getByRole('button', { name: 'Speichern' });
    await expect(saveButton).toBeDisabled();

    await threshold.fill('65');
    await page.getByLabel('Zusätzliche Anweisung').fill('Mails von @lieferant-xy.example sind Bestellbestätigungen.');
    await saveButton.click();

    await expect(page.getByText('Einstellungen gespeichert.')).toBeVisible();
    expect(saved).toEqual({
      extraInstructions: 'Mails von @lieferant-xy.example sind Bestellbestätigungen.',
      confidenceThreshold: 0.65,
    });
  });

  test('hides the categories from regular users and redirects them away', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: regularUser }));

    await page.goto('/categories');

    await expect(page.getByRole('heading', { name: 'Vorgänge' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Kategorien' })).toHaveCount(0);
  });
});
