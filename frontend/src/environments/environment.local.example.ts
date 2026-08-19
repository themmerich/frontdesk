/**
 * Template for a LOCAL, git-ignored environment override that carries your real
 * PrimeNG (PrimeUI) license key.
 *
 * Setup:
 *   1. Copy this file to `environment.local.ts` (same folder).
 *   2. Put your real key in `primengLicense`.
 *   3. Run `pnpm start:local` (uses the `local` build configuration, which
 *      swaps in environment.local.ts via angular.json fileReplacements).
 *
 * `environment.local.ts` is git-ignored, so the key never lands in the repo.
 * Plain `pnpm start` keeps using the empty environment.development.ts.
 */
export const environment = {
  production: false,
  primengLicense: 'YOUR-PRIMENG-LICENSE-KEY',
};
