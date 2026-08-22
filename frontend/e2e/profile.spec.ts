import { expect, test } from '@playwright/test';

// Backend-less like the other e2e specs: the API is mocked per test, the
// assertions use the German texts because de is the default language.
const user = {
  email: 'admin@frontdesk.local',
  displayName: 'Anna Admin',
  role: 'admin',
  tenantName: 'Musterfirma GmbH',
  hasAvatar: false,
};

test.describe('Profile', () => {
  test('opens from the sidebar and shows the stored data', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }));
    await page.route('**/api/cases', (route) => route.fulfill({ json: [] }));

    await page.goto('/');
    await page.getByText('Anna Admin').click();
    await page.getByRole('link', { name: 'Profil' }).click();

    await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible();
    await expect(page.getByLabel('Anzeigename')).toHaveValue('Anna Admin');
    await expect(page.getByLabel('E-Mail-Adresse')).toBeDisabled();
  });

  test('saves a changed display name, which the sidebar picks up', async ({ page }) => {
    let currentName = 'Anna Admin';
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: { ...user, displayName: currentName } }));
    await page.route('**/api/profile', (route) => {
      currentName = 'Anna Anders';
      return route.fulfill({ json: { ...user, displayName: currentName } });
    });

    await page.goto('/profile');
    await page.getByLabel('Anzeigename').fill('Anna Anders');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();

    await expect(page.getByText('Anzeigename gespeichert.')).toBeVisible();
    // The sidebar footer reflects the refreshed session user.
    await expect(page.getByText('Anna Anders')).toBeVisible();
  });

  test('validates the password change before calling the backend', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }));
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
