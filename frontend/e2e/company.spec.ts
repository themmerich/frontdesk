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
  replySignature: '',
  signatureUserId: null,
};

// Who may sign the scheduler's drafts, and who the admin at the desk is for the preview.
const users = [
  {
    id: 'u1',
    username: 'admin',
    firstName: 'Anna',
    lastName: 'Admin',
    role: 'admin',
    active: true,
    branchId: 'b2',
    createdAt: '2026-08-01T10:00:00Z',
    position: 'Geschäftsführerin',
  },
  {
    id: 'u2',
    username: 'ben',
    firstName: 'Ben',
    lastName: 'Benutzer',
    role: 'user',
    active: true,
    branchId: null,
    createdAt: '2026-08-02T10:00:00Z',
    position: null,
  },
];
const ownProfile = {
  username: 'admin',
  firstName: 'Anna',
  lastName: 'Admin',
  birthDate: null,
  joinedAt: null,
  branchId: 'b2',
  email: 'anna@musterfirma.example',
  phone: '030 123',
  fax: null,
  position: 'Geschäftsführerin',
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
  test.beforeEach(async ({ page }) => {
    // The inbox offers the categories for picking in its rows; unanswered, the request comes
    // back 401 from the real backend and the interceptor sends the browser to the login.
    await page.route('**/api/case-categories/selectable', (route) => route.fulfill({ json: [] }));
    // The company page lists the users for the signature's stand-in and reads the admin's own
    // profile for the preview.
    await page.route('**/api/users', (route) => route.fulfill({ json: users }));
    await page.route('**/api/profile', (route) => route.fulfill({ json: ownProfile }));
  });

  test('paints the tenant brand on a reload instead of the app own, and forgets it on sign-out', async ({ page }) => {
    const branded = { ...company, name: 'Musterfirma AG', primaryColor: '#1d4ed8', logoDisplay: 'WITH_NAME' };
    // Held back on purpose: this is the stretch in which the sidebar used to show the app's own
    // brand — the frontdesk name in the preset's green — before swapping to the tenant's.
    let answer: (() => void) | null = null;
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: adminUser }));
    await page.route('**/api/cases', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/company', async (route) => {
      if (answer !== null) {
        await new Promise<void>((resolve) => (answer = resolve));
      }
      return route.fulfill({ json: branded });
    });

    // First visit: the brand arrives with the answer and is remembered from then on.
    await page.goto('/');
    // The brand area at the top; the same name stands in the footer under the user.
    await expect(page.getByText('Musterfirma AG').first()).toBeVisible();

    answer = () => undefined;
    await page.reload();

    // Before the company answered at all, the sidebar already carries the tenant's name and the
    // theme its colour — no frontdesk logo in between.
    await expect(page.getByText('Musterfirma AG').first()).toBeVisible();
    // #1d4ed8, as the theme writes it: PrimeNG builds its palette in the srgb notation.
    await expect(page.locator('#app-sidebar')).toHaveCSS('background-color', /rgb\(29, 78, 216\)|srgb 0\.1137/);
    await expect(page.getByText('frontdesk')).toHaveCount(0);
    answer?.();

    // Signing out takes it along: the next person here may belong to another company.
    await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 204, body: '' }));
    await page.getByText('Anna Admin').click();
    await page.getByRole('button', { name: 'Abmelden' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => localStorage.getItem('frontdesk-company'))).toBeNull();
  });

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

    // The signature, with placeholders — and the preview shows it filled in for Anna, with her
    // branch and the company name as it now stands in the form.
    await page
      .getByLabel('Signatur', { exact: true })
      .fill('Mit freundlichen Grüßen\n{{vorname}} {{nachname}}, {{position}}\n{{firma}} · {{filiale}}');
    await expect(page.locator('pre')).toHaveText(
      'Mit freundlichen Grüßen\nAnna Admin, Geschäftsführerin\nMusterfirma AG · Filiale Hamburg',
    );
    // Ben signs what the scheduler writes.
    await page.locator('p-select[inputid="signatureUser"]').click();
    await page.getByRole('option', { name: 'Ben Benutzer' }).click();
    await saveButton.click();

    await expect(page.getByText('Firmendaten gespeichert.')).toBeVisible();
    expect(saved).toMatchObject({
      name: 'Musterfirma AG',
      website: 'https://musterfirma.example',
      primaryColor: '#10b981',
      replySignature: 'Mit freundlichen Grüßen\n{{vorname}} {{nachname}}, {{position}}\n{{firma}} · {{filiale}}',
      signatureUserId: 'u2',
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
