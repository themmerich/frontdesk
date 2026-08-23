import { expect, test } from '@playwright/test';

// Backend-less like the other e2e specs: the API is mocked per test, the
// assertions use the German texts because de is the default language.
const mockUser = {
  username: 'admin',
  displayName: 'Anna Admin',
  role: 'admin',
  tenantName: 'Musterfirma GmbH',
};

test.describe('Login', () => {
  test('redirects anonymous visitors to the login page', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401 }));

    await page.goto('/');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel('Benutzername')).toBeVisible();
    await expect(page.getByLabel('Passwort')).toBeVisible();
  });

  test('signs in and lands on the cases page', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401 }));
    await page.route('**/api/auth/login', (route) => route.fulfill({ json: mockUser }));
    await page.route('**/api/cases', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/company', (route) => route.fulfill({ json: { name: 'Musterfirma GmbH', hasLogo: false } }));

    await page.goto('/login');
    await page.getByLabel('Benutzername').fill('admin');
    await page.getByLabel('Passwort').fill('secret');
    await page.getByRole('button', { name: 'Anmelden' }).click();

    await expect(page.getByRole('heading', { name: 'Vorgänge' })).toBeVisible();
    // The sidebar footer shows who is signed in, and for which tenant; the
    // company name also brands the sidebar's top, hence first().
    await expect(page.getByText('Anna Admin')).toBeVisible();
    await expect(page.getByText('Musterfirma GmbH').first()).toBeVisible();
  });

  test('shows an error for rejected credentials and stays on the login page', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401 }));
    await page.route('**/api/auth/login', (route) => route.fulfill({ status: 401 }));

    await page.goto('/login');
    await page.getByLabel('Benutzername').fill('admin');
    await page.getByLabel('Passwort').fill('wrong');
    await page.getByRole('button', { name: 'Anmelden' }).click();

    await expect(page.getByText('Anmeldung fehlgeschlagen')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('validates the form before calling the backend', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401 }));
    let loginCalled = false;
    await page.route('**/api/auth/login', (route) => {
      loginCalled = true;
      return route.fulfill({ status: 401 });
    });

    await page.goto('/login');
    await page.getByRole('button', { name: 'Anmelden' }).click();

    await expect(page.getByText('Bitte den Benutzernamen angeben.')).toBeVisible();
    await expect(page.getByText('Bitte das Passwort angeben.')).toBeVisible();
    expect(loginCalled).toBe(false);
  });
});
