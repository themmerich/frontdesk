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

const greenMailSettings = {
  mode: 'GREENMAIL',
  imapHost: 'localhost',
  imapPort: 3143,
  imapTls: false,
  smtpHost: 'localhost',
  smtpPort: 3025,
  smtpTls: false,
  username: 'inbox@frontdesk.local',
  folder: 'INBOX',
  pollingEnabled: true,
};

test.describe('Email settings', () => {
  test('lets an admin switch to a custom server and saves it', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: adminUser }));
    await page.route('**/api/cases', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/settings/mail', (route) => {
      if (route.request().method() === 'PUT') {
        return route.fulfill({ json: { ...greenMailSettings, mode: 'CUSTOM', imapHost: 'imap.example.com' } });
      }
      return route.fulfill({ json: greenMailSettings });
    });

    await page.goto('/');
    // The settings entry sits in the collapsed profile menu at the sidebar's bottom.
    await page.getByText('Anna Admin').click();
    await page.getByRole('link', { name: 'Einstellungen' }).click();

    await expect(page.getByRole('heading', { name: 'E-Mail-Einstellungen' })).toBeVisible();
    // GreenMail mode shows the fixed values without editable fields.
    await expect(page.getByText('localhost:3143')).toBeVisible();

    await page.getByRole('button', { name: 'Eigener Server (IMAP/SMTP)' }).click();
    // A provider preset prefills the connection; only credentials remain to type.
    await page.getByRole('button', { name: 'GMX', exact: true }).click();
    await expect(page.getByLabel('Host').first()).toHaveValue('imap.gmx.net');
    await page.getByLabel('Benutzername').fill('buero@musterfirma.de');
    await page.getByLabel('Passwort').fill('geheim');
    await page.getByRole('button', { name: 'Speichern' }).click();

    await expect(page.getByText('Einstellungen gespeichert.')).toBeVisible();
  });

  test('validates the custom form before saving', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: adminUser }));
    await page.route('**/api/settings/mail', (route) => route.fulfill({ json: greenMailSettings }));
    let saved = false;
    await page.route('**/api/settings/mail', (route) => {
      if (route.request().method() === 'PUT') {
        saved = true;
      }
      return route.fulfill({ json: greenMailSettings });
    });

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Eigener Server (IMAP/SMTP)' }).click();
    await page.getByLabel('Host').first().fill('');
    await page.getByRole('button', { name: 'Speichern' }).click();

    await expect(page.getByText('Pflichtfeld.').first()).toBeVisible();
    expect(saved).toBe(false);
  });

  test('hides the settings from regular users and redirects them away', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: regularUser }));
    await page.route('**/api/cases', (route) => route.fulfill({ json: [] }));

    await page.goto('/settings');

    // The admin guard sends them to the start page; the opened profile menu has no settings entry.
    await expect(page.getByRole('heading', { name: 'Vorgänge' })).toBeVisible();
    await page.getByText('Uwe User').click();
    await expect(page.getByText('Profil')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Einstellungen' })).toHaveCount(0);
  });
});
