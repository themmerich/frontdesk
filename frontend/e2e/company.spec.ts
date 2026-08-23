import { expect, test } from '@playwright/test';

// Backend-less like the other e2e specs: the API is mocked per test, the
// assertions use the German texts because de is the default language.
const adminUser = {
  email: 'admin@frontdesk.local',
  displayName: 'Anna Admin',
  role: 'admin',
  tenantName: 'Musterfirma GmbH',
};
const regularUser = { ...adminUser, email: 'user@frontdesk.local', displayName: 'Uwe User', role: 'user' };

const company = {
  name: 'Musterfirma GmbH',
  street: 'Hauptstr. 1',
  postalCode: '12345',
  city: 'Musterstadt',
  country: null,
  phone: null,
  fax: null,
  email: null,
  website: null,
  logoDisplay: 'WITH_NAME',
  primaryColor: null,
  hasLogo: false,
};

test.describe('Company', () => {
  test('lets an admin edit the company, and the sidebar picks the name up', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: adminUser }));
    await page.route('**/api/cases', (route) => route.fulfill({ json: [] }));
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
    await expect(page.getByLabel('Straße')).toHaveValue('Hauptstr. 1');
    // Nothing edited yet, so there is nothing to save.
    const saveButton = page.getByRole('button', { name: 'Speichern' });
    await expect(saveButton).toBeDisabled();

    await page.getByLabel('Firmenname').fill('Musterfirma AG');
    await page.getByLabel('Telefon', { exact: true }).fill('+49 30 123');
    // The text field beside the color swatch takes the hex code directly (the
    // swatch itself is also labeled "Firmenfarbe", so the id disambiguates).
    await page.locator('#primaryColor').fill('#10b981');
    await saveButton.click();

    await expect(page.getByText('Firmendaten gespeichert.')).toBeVisible();
    expect(saved).toMatchObject({ name: 'Musterfirma AG', phone: '+49 30 123', primaryColor: '#10b981' });
    // The sidebar reflects the rename immediately, without a reload.
    await expect(page.getByText('Musterfirma AG').first()).toBeVisible();
    await expect(page.getByText('Musterfirma GmbH')).toHaveCount(0);
    // The saved state is the new pristine baseline.
    await expect(saveButton).toBeDisabled();
  });

  test('validates the form before calling the backend', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: adminUser }));
    let saved = false;
    await page.route('**/api/company', (route) => {
      if (route.request().method() === 'PUT') {
        saved = true;
      }
      return route.fulfill({ json: company });
    });

    await page.goto('/company');
    await page.getByLabel('Firmenname').fill('');
    await page.getByLabel('E-Mail-Adresse').fill('kaputt');
    // Leaving the fields reveals their errors; the save button never arms.
    await page.getByLabel('Website').click();

    await expect(page.getByText('Bitte einen Firmennamen eingeben.')).toBeVisible();
    await expect(page.getByText('Bitte eine gültige E-Mail-Adresse eingeben.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Speichern' })).toBeDisabled();
    expect(saved).toBe(false);
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
