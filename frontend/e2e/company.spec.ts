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

test.describe('Company', () => {
  test('lets an admin edit the company, and the sidebar picks the name up', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: adminUser }));
    await page.route('**/api/cases', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/branches', (route) => route.fulfill({ json: [headquarters, filiale] }));
    let saved: Record<string, unknown> | undefined;
    await page.route('**/api/company', (route) => {
      if (route.request().method() === 'PUT') {
        saved = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill({ json: { ...company, ...saved } });
      }
      return route.fulfill({ json: company });
    });

    await page.goto('/');
    // The sidebar brands with the loaded company name (brand area and footer).
    await expect(page.getByText('Musterfirma GmbH').first()).toBeVisible();

    await page.getByRole('link', { name: 'Firma' }).click();
    await expect(page.getByRole('heading', { name: 'Firma' })).toBeVisible();
    await expect(page.getByLabel('Firmenname')).toHaveValue('Musterfirma GmbH');
    // Address and contact data belong to the sites, not to the company itself.
    await expect(page.getByLabel('Straße')).toHaveCount(0);
    // Nothing edited yet, so there is nothing to save.
    const saveButton = page.getByRole('button', { name: 'Speichern' });
    await expect(saveButton).toBeDisabled();

    await page.getByLabel('Firmenname').fill('Musterfirma AG');
    await page.getByLabel('Webseite').fill('https://musterfirma.example');
    // The text field beside the color swatch takes the hex code directly (the
    // swatch itself is also labeled "Firmenfarbe", so the id disambiguates).
    await page.locator('#primaryColor').fill('#10b981');
    await saveButton.click();

    await expect(page.getByText('Firmendaten gespeichert.')).toBeVisible();
    expect(saved).toMatchObject({
      name: 'Musterfirma AG',
      website: 'https://musterfirma.example',
      primaryColor: '#10b981',
    });
    // The sidebar reflects the rename immediately, without a reload. The branch
    // list keeps its own names — a site is not renamed along with the company.
    await expect(page.getByText('Musterfirma AG').first()).toBeVisible();
    await expect(page.locator('#app-sidebar').getByText('Musterfirma GmbH')).toHaveCount(0);
    // The saved state is the new pristine baseline.
    await expect(saveButton).toBeDisabled();
  });

  test('validates the form before calling the backend', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: adminUser }));
    await page.route('**/api/branches', (route) => route.fulfill({ json: [headquarters, filiale] }));
    let saved = false;
    await page.route('**/api/company', (route) => {
      if (route.request().method() === 'PUT') {
        saved = true;
      }
      return route.fulfill({ json: company });
    });

    await page.goto('/company');
    await page.getByLabel('Firmenname').fill('');
    // Leaving the field reveals its error; the save button never arms.
    await page.getByLabel('Webseite').click();

    await expect(page.getByText('Bitte einen Firmennamen eingeben.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Speichern' })).toBeDisabled();
    expect(saved).toBe(false);
  });

  test('manages every site of the company, the headquarters among them', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: adminUser }));
    await page.route('**/api/company', (route) => route.fulfill({ json: company }));
    let branches = [headquarters, filiale];
    let created: Record<string, unknown> | undefined;
    await page.route('**/api/branches', (route) => {
      if (route.request().method() === 'POST') {
        created = route.request().postDataJSON() as Record<string, unknown>;
        const isHeadquarters = created['headquarters'] === true;
        branches = [
          ...branches.map((branch) => (isHeadquarters ? { ...branch, headquarters: false } : branch)),
          { ...filiale, ...created, id: 'b3' } as typeof filiale,
        ];
        return route.fulfill({ json: branches[branches.length - 1] });
      }
      return route.fulfill({ json: branches });
    });
    await page.route('**/api/branches/b2', (route) => {
      branches = branches.filter((branch) => branch.id !== 'b2');
      return route.fulfill({ status: 204 });
    });

    await page.goto('/company');
    // Every site is listed, the headquarters first and marked as such.
    const headquartersRow = page.getByRole('row', { name: /Musterfirma GmbH/ });
    await expect(headquartersRow).toBeVisible();
    await expect(headquartersRow.getByText('Hauptfiliale')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Filiale Hamburg' })).toBeVisible();

    // A new site is a regular branch unless the switch says otherwise.
    await page.getByRole('button', { name: 'Neue Filiale' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Filiale Berlin');
    await page.locator('p-dialog').getByRole('button', { name: 'Speichern' }).click();

    await expect(page.getByText('Filiale gespeichert.')).toBeVisible();
    expect(created).toMatchObject({ name: 'Filiale Berlin', headquarters: false });
    await expect(page.getByRole('cell', { name: 'Filiale Berlin' })).toBeVisible();

    await page
      .getByRole('row', { name: /Filiale Hamburg/ })
      .getByRole('button', { name: 'Filiale löschen' })
      .click();
    await expect(page.getByText('Filiale gelöscht.')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Filiale Hamburg' })).toHaveCount(0);
  });

  test('creates a site as the headquarters, which demotes the previous one', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: adminUser }));
    await page.route('**/api/company', (route) => route.fulfill({ json: company }));
    let branches = [headquarters, filiale];
    let created: Record<string, unknown> | undefined;
    await page.route('**/api/branches', (route) => {
      if (route.request().method() === 'POST') {
        created = route.request().postDataJSON() as Record<string, unknown>;
        // The backend demotes the previous headquarters; the mock mirrors that.
        branches = [
          { ...filiale, ...created, id: 'b3' } as typeof filiale,
          ...branches.map((branch) => ({ ...branch, headquarters: false })),
        ];
        return route.fulfill({ json: branches[0] });
      }
      return route.fulfill({ json: branches });
    });

    await page.goto('/company');
    await page.getByRole('button', { name: 'Neue Filiale' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Hauptfiliale Berlin');
    await page.locator('p-dialog').getByLabel('Hauptfiliale').click();

    // The dialog says what the switch is about to do before it happens.
    await expect(page.getByText('„Musterfirma GmbH“ wird dadurch zur Nebenfiliale.')).toBeVisible();

    await page.locator('p-dialog').getByRole('button', { name: 'Speichern' }).click();

    await expect(page.getByText('Filiale gespeichert.')).toBeVisible();
    expect(created).toMatchObject({ name: 'Hauptfiliale Berlin', headquarters: true });
    // The tag moved along with the flag.
    await expect(page.getByRole('row', { name: /Hauptfiliale Berlin/ }).getByText('Hauptfiliale')).toBeVisible();
    await expect(page.getByRole('row', { name: /Musterfirma GmbH/ }).getByText('Hauptfiliale')).toHaveCount(0);
  });

  test('hides the company page from regular users and redirects them away', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: regularUser }));
    await page.route('**/api/cases', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/company', (route) => route.fulfill({ json: company }));

    await page.goto('/company');

    // The admin guard sends them to the start page; the sidebar offers no administration section.
    await expect(page.getByRole('heading', { name: 'Vorgänge' })).toBeVisible();
    await expect(page.getByText('Administration')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Firma' })).toHaveCount(0);
  });
});
