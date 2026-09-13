import { expect, test } from '@playwright/test';

// Backend-less like the other e2e specs: the API is mocked per test, the
// assertions use the German texts because de is the default language.
const superuser = {
  username: 'super',
  displayName: 'Sina Super',
  role: 'superuser',
  tenant: null,
};

const musterfirma = {
  id: 't1',
  slug: 'musterfirma',
  name: 'Musterfirma GmbH',
  createdAt: '2026-08-01T10:00:00Z',
  userCount: 2,
  caseCount: 3,
};

const beispiel = { ...musterfirma, id: 't2', slug: 'beispiel-ag', name: 'Beispiel AG', userCount: 0, caseCount: 0 };

test.describe('Tenants', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: superuser }));
    await page.route('**/api/company', (route) => route.fulfill({ json: { name: 'frontdesk', hasLogo: false } }));
  });

  test('lists the tenants with what hangs on them, reached from the sidebar', async ({ page }) => {
    await page.route('**/api/tenants', (route) => route.fulfill({ json: [beispiel, musterfirma] }));

    await page.goto('/tenants');
    await page.getByRole('navigation').getByRole('link', { name: 'Übersicht' }).click();

    await expect(page.getByRole('heading', { name: 'Mandanten' })).toBeVisible();
    const row = page.getByRole('row', { name: /Musterfirma GmbH/ });
    await expect(row).toContainText('musterfirma');
    await expect(row.getByRole('cell', { name: '2', exact: true })).toBeVisible();
    await expect(row.getByRole('cell', { name: '3', exact: true })).toBeVisible();
  });

  test('creates a tenant, proposing the Kennung from the name', async ({ page }) => {
    let tenants = [musterfirma];
    let created: Record<string, unknown> | undefined;
    await page.route('**/api/tenants', (route) => {
      if (route.request().method() === 'POST') {
        created = route.request().postDataJSON() as Record<string, unknown>;
        tenants = [...tenants, { ...beispiel, name: created['name'] as string, slug: created['slug'] as string }];
        return route.fulfill({ status: 201, json: tenants[1] });
      }
      return route.fulfill({ json: tenants });
    });

    await page.goto('/tenants');
    await page.getByRole('button', { name: 'Neuer Mandant' }).click();
    await expect(page.getByRole('dialog').getByText('Neuer Mandant')).toBeVisible();

    await page.getByLabel('Name').fill('Müller & Söhne GmbH');
    // Proposed while the person has not touched it.
    await expect(page.getByLabel('Kennung')).toHaveValue('mueller-soehne-gmbh');
    await page.getByLabel('Kennung').fill('mueller');
    await page.getByLabel('Name').fill('Müller & Söhne KG');
    // Touched once, the Kennung stays.
    await expect(page.getByLabel('Kennung')).toHaveValue('mueller');
    await page.getByRole('button', { name: 'Speichern' }).click();

    await expect(page.getByText('Mandant angelegt.')).toBeVisible();
    expect(created).toEqual({ name: 'Müller & Söhne KG', slug: 'mueller' });
    await expect(page.getByRole('row', { name: /Müller & Söhne KG/ })).toBeVisible();
  });

  test('names a taken Kennung under the field and keeps the dialog open', async ({ page }) => {
    await page.route('**/api/tenants', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 409, json: { reason: 'slug' } });
      }
      return route.fulfill({ json: [musterfirma] });
    });

    await page.goto('/tenants');
    await page.getByRole('button', { name: 'Neuer Mandant' }).click();
    await page.getByLabel('Name').fill('Musterfirma');
    await page.getByRole('button', { name: 'Speichern' }).click();

    await expect(page.getByRole('dialog').getByText('Diese Kennung ist schon vergeben.')).toBeVisible();
  });

  test('deletes a tenant only after its name was typed', async ({ page }) => {
    let tenants = [beispiel, musterfirma];
    let deleted = false;
    await page.route('**/api/tenants', (route) => route.fulfill({ json: tenants }));
    await page.route('**/api/tenants/t2', (route) => {
      deleted = true;
      tenants = [musterfirma];
      return route.fulfill({ status: 204 });
    });

    await page.goto('/tenants');
    await page
      .getByRole('row', { name: /Beispiel AG/ })
      .getByRole('button', { name: 'Löschen' })
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Mandant endgültig löschen')).toBeVisible();
    const confirm = dialog.getByRole('button', { name: 'Endgültig löschen' });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel('Zum Bestätigen den Namen des Mandanten eintippen').fill('Beispiel');
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel('Zum Bestätigen den Namen des Mandanten eintippen').fill('Beispiel AG');
    await expect(confirm).toBeEnabled();
    expect(deleted).toBe(false);
    await confirm.click();

    await expect(page.getByText('Mandant gelöscht.')).toBeVisible();
    expect(deleted).toBe(true);
    await expect(page.getByRole('row', { name: /Beispiel AG/ })).toHaveCount(0);
  });

  test('opens a tenant and lands on its dashboard with the cases in the sidebar', async ({ page }) => {
    await page.route('**/api/tenants', (route) => route.fulfill({ json: [musterfirma] }));
    let opened: Record<string, unknown> | undefined;
    await page.route('**/api/auth/tenant', (route) => {
      opened = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: { ...superuser, tenant: { slug: 'musterfirma', name: 'Musterfirma GmbH' } } });
    });
    await page.route('**/api/cases', (route) => route.fulfill({ json: [] }));

    await page.goto('/tenants');
    await page
      .getByRole('row', { name: /Musterfirma GmbH/ })
      .getByRole('button', { name: 'Öffnen' })
      .click();

    await expect(page).toHaveURL(/\/dashboard$/);
    expect(opened).toEqual({ slug: 'musterfirma' });
    const navigation = page.getByRole('navigation');
    await expect(navigation.getByText('Vorgänge')).toBeVisible();
    await expect(navigation.getByText('Administration')).toBeVisible();
    await expect(navigation.getByText('Mandant schließen')).toBeVisible();
  });

  test('hides the page from admins and redirects them away', async ({ page }) => {
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        json: { username: 'admin', displayName: 'Anna Admin', role: 'admin', tenant: { slug: 'musterfirma', name: 'Musterfirma GmbH' } },
      }),
    );
    await page.route('**/api/case-categories/selectable', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/cases', (route) => route.fulfill({ json: [] }));

    await page.goto('/tenants');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'Übersicht' })).toHaveCount(0);
  });
});
