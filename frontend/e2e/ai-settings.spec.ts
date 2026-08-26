import { expect, test } from '@playwright/test';

// Backend-less like the other e2e specs: the API is mocked per test, the
// assertions use the German texts because de is the default language.
const adminUser = {
  username: 'admin',
  displayName: 'Anna Admin',
  role: 'admin',
  tenantName: 'Musterfirma GmbH',
};

const A_KEY = 'sk-ant-api03-testkey_0123456789';

test.describe('AI access', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: adminUser }));
    await page.route('**/api/company', (route) => route.fulfill({ json: { name: 'Musterfirma GmbH', hasLogo: false } }));
    // The start page is the inbox; without this it would ask a backend that is not
    // part of this suite, and an unauthorised answer sends the app to the login.
    await page.route('**/api/cases', (route) => route.fulfill({ json: [] }));
  });

  test('opens from the sidebar and says which account pays', async ({ page }) => {
    await page.route('**/api/settings/ai', (route) => route.fulfill({ json: { ownKey: false } }));

    await page.goto('/');
    await page.getByRole('link', { name: 'KI-Zugang' }).click();

    await expect(page.getByRole('heading', { name: 'KI-Zugang' })).toBeVisible();
    await expect(page.getByText('Dieser Mandant nutzt den Zugang von frontdesk.')).toBeVisible();
    // Nothing stored, so there is nothing to remove.
    await expect(page.getByRole('button', { name: 'Entfernen' })).toHaveCount(0);
  });

  test('stores a key and never shows it again', async ({ page }) => {
    let sent: Record<string, unknown> | undefined;
    await page.route('**/api/settings/ai', (route) => {
      if (route.request().method() === 'PUT') {
        sent = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill({ json: { ownKey: true } });
      }
      return route.fulfill({ json: { ownKey: false } });
    });

    await page.goto('/ai-settings');
    await page.getByLabel('Schlüssel').fill(A_KEY);
    await page.getByRole('button', { name: 'Speichern' }).click();

    await expect(page.getByText('Schlüssel gespeichert.')).toBeVisible();
    expect(sent).toMatchObject({ apiKey: A_KEY });
    await expect(page.getByText('Dieser Mandant nutzt einen eigenen Schlüssel.')).toBeVisible();
    // The field is empty again: what it holds is a new key, never the stored one.
    await expect(page.getByLabel('Schlüssel')).toHaveValue('');
  });

  test('shows the provider’s reason when the key is rejected', async ({ page }) => {
    await page.route('**/api/settings/ai', (route) => route.fulfill({ json: { ownKey: false } }));
    await page.route('**/api/settings/ai/test', (route) => route.fulfill({ json: { success: false, message: 'invalid x-api-key' } }));

    await page.goto('/ai-settings');
    await page.getByLabel('Schlüssel').fill(A_KEY);
    await page.getByRole('button', { name: 'Testen' }).click();

    await expect(page.getByText('Der Schlüssel wurde abgelehnt.')).toBeVisible();
    await expect(page.getByText('invalid x-api-key')).toBeVisible();
  });

  test('hides the page from regular users and redirects them away', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: { ...adminUser, role: 'user' } }));

    await page.goto('/ai-settings');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'KI-Zugang' })).toHaveCount(0);
  });
});
