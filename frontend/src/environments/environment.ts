/**
 * Base environment — used for production builds.
 *
 * `primengLicense` holds the PrimeNG (PrimeUI) license key. Leave it empty to
 * run unlicensed (PrimeNG then logs a warning and shows the "Invalid PrimeUI
 * License" banner). Obtain a key from your PrimeNG account.
 *
 * Security: do NOT commit a real key. Fill it in locally, or inject it at build
 * time (e.g. a CI step that writes this file), so the secret stays out of git.
 */
export const environment = {
  production: true,
  primengLicense: '',
};
