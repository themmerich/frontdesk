import { expect, test } from '@playwright/test';

// Backend-less like the other e2e specs: the API is mocked per test, the
// assertions use the German texts because de is the default language.
const mockUser = {
  username: 'admin',
  displayName: 'Anna Admin',
  role: 'admin',
  tenant: { slug: 'musterfirma', name: 'Musterfirma GmbH' },
};

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    // The inbox offers the categories for picking in its rows; unanswered, the request comes
    // back 401 from the real backend and the interceptor sends the browser to the login.
    await page.route('**/api/case-categories/selectable', (route) => route.fulfill({ json: [] }));
    // The login fetches a CSRF token before it posts; without a backend the mock answers.
    await page.route('**/api/auth/csrf', (route) => route.fulfill({ status: 204 }));
  });

  test('redirects anonymous visitors to the login page', async ({ page }) => {
    // The inbox the shell opens on offers the colleagues a case can be handed to.
    await page.route('**/api/users/assignable', (route) => route.fulfill({ json: [] }));
    // The bell is on every page and polls; unanswered with a backend behind the dev server
    // it comes back 401 and the interceptor sends the browser to the login.
    await page.route('**/api/notifications', (route) => route.fulfill({ json: { unseenCount: 0, items: [] } }));
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401 }));

    await page.goto('/');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel('Benutzername')).toBeVisible();
    await expect(page.getByLabel('Passwort')).toBeVisible();
  });

  test('signs in and lands on the cases page', async ({ page }) => {
    // The inbox the shell opens on offers the colleagues a case can be handed to.
    await page.route('**/api/users/assignable', (route) => route.fulfill({ json: [] }));
    // The bell is on every page and polls; unanswered with a backend behind the dev server
    // it comes back 401 and the interceptor sends the browser to the login.
    await page.route('**/api/notifications', (route) => route.fulfill({ json: { unseenCount: 0, items: [] } }));
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401 }));
    await page.route('**/api/cases', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/company', (route) => route.fulfill({ json: { name: 'Musterfirma GmbH', hasLogo: false } }));

    let sent: Record<string, unknown> | undefined;
    await page.route('**/api/auth/login', (route) => {
      sent = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: mockUser });
    });

    await page.goto('/login');
    await page.getByLabel('Mandant').fill('musterfirma');
    await page.getByLabel('Benutzername').fill('admin');
    await page.getByLabel('Passwort').fill('secret');
    await page.getByRole('button', { name: 'Anmelden' }).click();

    await expect(page.getByRole('heading', { name: 'Vorgänge' })).toBeVisible();
    expect(sent).toEqual({ tenant: 'musterfirma', username: 'admin', password: 'secret' });
    // The sidebar footer shows who is signed in, and for which tenant; the
    // company name also brands the sidebar's top, hence first().
    await expect(page.getByText('Anna Admin')).toBeVisible();
    await expect(page.getByText('Musterfirma GmbH').first()).toBeVisible();

    // The Kennung is remembered at this browser and offered on the next visit.
    await page.goto('/login');
    await expect(page.getByLabel('Mandant')).toHaveValue('musterfirma');
  });

  test('shows an error for rejected credentials and stays on the login page', async ({ page }) => {
    // The inbox the shell opens on offers the colleagues a case can be handed to.
    await page.route('**/api/users/assignable', (route) => route.fulfill({ json: [] }));
    // The bell is on every page and polls; unanswered with a backend behind the dev server
    // it comes back 401 and the interceptor sends the browser to the login.
    await page.route('**/api/notifications', (route) => route.fulfill({ json: { unseenCount: 0, items: [] } }));
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
    // The inbox the shell opens on offers the colleagues a case can be handed to.
    await page.route('**/api/users/assignable', (route) => route.fulfill({ json: [] }));
    // The bell is on every page and polls; unanswered with a backend behind the dev server
    // it comes back 401 and the interceptor sends the browser to the login.
    await page.route('**/api/notifications', (route) => route.fulfill({ json: { unseenCount: 0, items: [] } }));
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
  test('sends a super-user without a tenant to the tenants page', async ({ page }) => {
    const superuser = { username: 'super', displayName: 'Sina Super', role: 'superuser', tenant: null };
    // The inbox the shell opens on offers the colleagues a case can be handed to.
    await page.route('**/api/users/assignable', (route) => route.fulfill({ json: [] }));
    // The bell is on every page and polls; unanswered with a backend behind the dev server
    // it comes back 401 and the interceptor sends the browser to the login.
    await page.route('**/api/notifications', (route) => route.fulfill({ json: { unseenCount: 0, items: [] } }));
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401 }));
    await page.route('**/api/auth/login', (route) => route.fulfill({ json: superuser }));
    await page.route('**/api/company', (route) => route.fulfill({ json: { name: 'frontdesk', hasLogo: false } }));
    // The tenants page asks for the list as soon as it opens; unanswered, the real backend's 401
    // would send the browser back to the login.
    await page.route('**/api/tenants', (route) => route.fulfill({ json: [] }));

    await page.goto('/login');
    // The tenant field stays empty: that is what says "super-user".
    await page.getByLabel('Benutzername').fill('super');
    await page.getByLabel('Passwort').fill('secret');
    await page.getByRole('button', { name: 'Anmelden' }).click();

    await expect(page).toHaveURL(/\/tenants$/);
    await expect(page.getByRole('heading', { name: 'Mandanten' })).toBeVisible();
    // Nothing of any tenant in the sidebar, only the tenants group.
    const navigation = page.getByRole('navigation');
    await expect(navigation.getByText('Mandanten')).toBeVisible();
    await expect(navigation.getByText('Vorgänge')).toHaveCount(0);
    await expect(navigation.getByText('Administration')).toHaveCount(0);
  });
});
