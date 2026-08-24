import { expect, test } from '@playwright/test';

// Backend-less like the other e2e specs: the API is mocked per test, the
// assertions use the German texts because de is the default language.
const adminUser = {
  username: 'admin',
  displayName: 'Anna Admin',
  role: 'admin',
  tenantName: 'Musterfirma GmbH',
};

const company = {
  name: 'Musterfirma GmbH',
  website: null,
  logoDisplay: 'WITH_NAME',
  primaryColor: null,
  hasLogo: false,
};

const headquarters = {
  id: 'b1',
  name: 'Musterfirma GmbH',
  headquarters: true,
  street: 'Hauptstr. 1',
  postalCode: '12345',
  city: 'Musterstadt',
  country: null,
  phone: null,
  fax: null,
  email: null,
};

const filiale = { ...headquarters, id: 'b2', name: 'Filiale Hamburg', headquarters: false, city: 'Hamburg' };

const anna = {
  id: 'u1',
  username: 'admin',
  firstName: 'Anna',
  lastName: 'Admin',
  role: 'admin',
  active: true,
  branchId: null,
  createdAt: '2026-08-01T10:00:00Z',
};

test.describe('Users', () => {
  test('adds a user through the dialog, in the admin’s own company', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: adminUser }));
    await page.route('**/api/company', (route) => route.fulfill({ json: company }));
    await page.route('**/api/branches', (route) => route.fulfill({ json: [headquarters, filiale] }));
    let users = [anna];
    let created: Record<string, unknown> | undefined;
    await page.route('**/api/users', (route) => {
      if (route.request().method() === 'POST') {
        created = route.request().postDataJSON() as Record<string, unknown>;
        const clara = { ...anna, id: 'u2', username: 'clara', firstName: 'Clara', lastName: 'Neu', role: 'user' };
        users = [...users, clara];
        return route.fulfill({ status: 201, json: clara });
      }
      return route.fulfill({ json: users });
    });

    await page.goto('/users');
    await expect(page.getByRole('heading', { name: 'Benutzer' })).toBeVisible();

    await page.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(page.getByRole('dialog').getByText('Neuer Benutzer')).toBeVisible();
    // Nothing is judged before the admin edits it.
    await expect(page.locator('.p-invalid')).toHaveCount(0);
    // The company is the admin's own; only the site is a choice.
    await expect(page.getByLabel('Firma')).toHaveValue('Musterfirma GmbH');
    await expect(page.getByLabel('Firma')).toBeDisabled();

    await page.getByLabel('Benutzername').fill('clara');
    await page.getByLabel('Initialpasswort').fill('geheim1234');
    await page.getByLabel('Vorname').fill('Clara');
    await page.getByLabel('Nachname').fill('Neu');
    // The dialog's two dropdowns in order: the site, then the role.
    await expect(page.locator('p-select').nth(1)).toContainText('Benutzer');
    await page.locator('p-select').first().click();
    await page.getByRole('option', { name: 'Filiale Hamburg' }).click();
    await page.getByRole('button', { name: 'Speichern' }).click();

    await expect(page.getByText('Benutzer angelegt.')).toBeVisible();
    // A new user starts as an active ordinary user unless the admin says otherwise.
    expect(created).toMatchObject({
      username: 'clara',
      firstName: 'Clara',
      lastName: 'Neu',
      password: 'geheim1234',
      branchId: 'b2',
      role: 'user',
      active: true,
    });
    // The reloaded list holds the new user, surname first.
    await expect(page.getByRole('row', { name: /Neu Clara/ })).toBeVisible();
  });

  test('edits a user through its row action, with no password in sight', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: adminUser }));
    await page.route('**/api/company', (route) => route.fulfill({ json: company }));
    await page.route('**/api/branches', (route) => route.fulfill({ json: [headquarters, filiale] }));
    const ben = { ...anna, id: 'u2', username: 'ben', firstName: 'Ben', lastName: 'Benutzer', role: 'user', branchId: 'b2' };
    let users = [anna, ben];
    let saved: Record<string, unknown> | undefined;
    await page.route('**/api/users', (route) => route.fulfill({ json: users }));
    await page.route('**/api/users/u2', (route) => {
      saved = route.request().postDataJSON() as Record<string, unknown>;
      users = [anna, { ...ben, ...saved }];
      return route.fulfill({ json: users[1] });
    });

    await page.goto('/users');
    await page
      .getByRole('row', { name: /Benutzer Ben/ })
      .getByRole('button', { name: 'Bearbeiten' })
      .click();

    await expect(page.getByRole('dialog').getByText('Benutzer bearbeiten')).toBeVisible();
    await expect(page.getByLabel('Benutzername')).toHaveValue('ben');
    // The stored site is preselected, the password is not offered at all.
    await expect(page.locator('p-select').first()).toContainText('Filiale Hamburg');
    await expect(page.getByLabel('Initialpasswort')).toHaveCount(0);

    await page.getByLabel('Nachname').fill('Bauer');
    await page.getByRole('button', { name: 'Speichern' }).click();

    await expect(page.getByText('Benutzer gespeichert.')).toBeVisible();
    expect(saved).toMatchObject({ username: 'ben', firstName: 'Ben', lastName: 'Bauer', role: 'user', active: true });
    await expect(page.getByRole('row', { name: /Bauer Ben/ })).toBeVisible();
  });

  test('validates the form before calling the backend', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: adminUser }));
    await page.route('**/api/company', (route) => route.fulfill({ json: company }));
    await page.route('**/api/branches', (route) => route.fulfill({ json: [headquarters] }));
    let created = false;
    await page.route('**/api/users', (route) => {
      if (route.request().method() === 'POST') {
        created = true;
      }
      return route.fulfill({ json: [anna] });
    });

    await page.goto('/users');
    await page.getByRole('button', { name: 'Hinzufügen' }).click();
    await page.getByLabel('Benutzername').fill('clara');
    await page.getByLabel('Initialpasswort').fill('kurz');
    await page.getByRole('button', { name: 'Speichern' }).click();

    await expect(page.getByText('Mindestens 8 Zeichen.')).toBeVisible();
    await expect(page.getByText('Bitte einen Vornamen angeben.')).toBeVisible();
    expect(created).toBe(false);
  });

  test('lets the admin resize a column', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: adminUser }));
    await page.route('**/api/company', (route) => route.fulfill({ json: company }));
    await page.route('**/api/branches', (route) => route.fulfill({ json: [headquarters] }));
    await page.route('**/api/users', (route) => route.fulfill({ json: [anna] }));

    await page.goto('/users');
    const nameColumn = page.getByRole('columnheader').first();
    const before = (await nameColumn.boundingBox())!.width;

    // Drag the handle at the column's right edge to the left. Fit mode hands the
    // width to the neighbour, which always has room for it — widening instead
    // would stop at whatever the neighbour can spare.
    const handle = (await nameColumn.locator('.p-datatable-column-resizer').boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x - 50, handle.y + handle.height / 2, { steps: 10 });
    await page.mouse.up();

    expect((await nameColumn.boundingBox())!.width).toBeLessThan(before - 20);
  });

  test('generates an initial password on request', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: adminUser }));
    await page.route('**/api/company', (route) => route.fulfill({ json: company }));
    await page.route('**/api/branches', (route) => route.fulfill({ json: [headquarters] }));
    await page.route('**/api/users', (route) => route.fulfill({ json: [anna] }));

    await page.goto('/users');
    await page.getByRole('button', { name: 'Hinzufügen' }).click();
    await page.getByRole('button', { name: 'Passwort generieren' }).click();

    // Readable, so the admin can pass it on to the new user.
    const password = page.getByLabel('Initialpasswort');
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).not.toHaveValue('');
  });
});
