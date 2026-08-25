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
  sortOrder: 0,
  active: true,
};

const invoice = {
  id: 'c2',
  code: 'INVOICE',
  name: 'Rechnung',
  description: 'Eingehende Rechnung.',
  tier: 'manual',
  sortOrder: 1,
  active: true,
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
