import { expect, test } from '@playwright/test';

// Backend-less like the other e2e specs: the API is mocked per test, the
// assertions use the German texts because de is the default language.
const user = {
  username: 'admin',
  displayName: 'Anna Admin',
  role: 'admin',
  tenantName: 'Musterfirma GmbH',
  hasAvatar: false,
};

const profile = {
  username: 'admin',
  firstName: 'Anna',
  lastName: 'Admin',
  birthDate: '1990-04-23',
  joinedAt: '2020-01-01',
  company: 'Musterfirma GmbH',
  email: 'anna@musterfirma.example',
  phone: null,
  fax: null,
};

test.describe('Profile', () => {
  test('opens from the sidebar and shows the stored data', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }));
    await page.route('**/api/company', (route) => route.fulfill({ json: { name: 'Musterfirma GmbH', hasLogo: false } }));
    await page.route('**/api/cases', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/profile', (route) => route.fulfill({ json: profile }));

    await page.goto('/');
    await page.getByText('Anna Admin').click();
    await page.getByRole('link', { name: 'Profil' }).click();

    await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible();
    await expect(page.getByLabel('Vorname')).toHaveValue('Anna');
    await expect(page.getByLabel('Nachname')).toHaveValue('Admin');
    await expect(page.getByLabel('E-Mail-Adresse')).toHaveValue('anna@musterfirma.example');
    await expect(page.getByLabel('Benutzername')).toHaveValue('admin');
    await expect(page.getByLabel('Benutzername')).toBeDisabled();
  });

  test('saves the edited profile, which the sidebar picks up', async ({ page }) => {
    let currentName = 'Anna Admin';
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: { ...user, displayName: currentName } }));
    await page.route('**/api/company', (route) => route.fulfill({ json: { name: 'Musterfirma GmbH', hasLogo: false } }));
    await page.route('**/api/profile', (route) => {
      if (route.request().method() === 'PUT') {
        currentName = 'Anna Anders';
        return route.fulfill({ json: { ...profile, lastName: 'Anders' } });
      }
      return route.fulfill({ json: profile });
    });

    await page.goto('/profile');
    // Pristine forms have nothing to save; the button arms with the first edit.
    await expect(page.getByRole('button', { name: 'Speichern' })).toBeDisabled();
    await page.getByLabel('Nachname').fill('Anders');
    await page.getByRole('button', { name: 'Speichern' }).click();

    await expect(page.getByText('Profil gespeichert.')).toBeVisible();
    // The sidebar footer reflects the refreshed session user.
    await expect(page.getByText('Anna Anders')).toBeVisible();
  });

  test('validates the password change before calling the backend', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }));
    await page.route('**/api/company', (route) => route.fulfill({ json: { name: 'Musterfirma GmbH', hasLogo: false } }));
    await page.route('**/api/profile', (route) => route.fulfill({ json: profile }));
    let passwordChanged = false;
    await page.route('**/api/profile/password', (route) => {
      passwordChanged = true;
      return route.fulfill({ status: 200, json: {} });
    });

    await page.goto('/profile');
    await page.getByLabel('Aktuelles Passwort').fill('altes-passwort');
    await page.getByLabel('Neues Passwort', { exact: true }).fill('neues-passwort');
    await page.getByLabel('Neues Passwort wiederholen').fill('anders');
    await page.getByRole('button', { name: 'Passwort ändern' }).click();

    await expect(page.getByText('Die Passwörter stimmen nicht überein.')).toBeVisible();
    expect(passwordChanged).toBe(false);

    await page.getByLabel('Neues Passwort wiederholen').fill('neues-passwort');
    await page.getByRole('button', { name: 'Passwort ändern' }).click();

    await expect(page.getByText('Passwort geändert.')).toBeVisible();
  });
});
