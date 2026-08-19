import process from 'node:process';

import { runChecks } from './ci-checks.mjs';

// Manual full verification: fast checks + unit tests + builds + backend.
// Streams output live (no capture) and mirrors the failing step's exit status.
const result = runChecks({ full: true });

if (result.status === 'error') {
  process.stderr.write(`\n${result.message}\n`);
  process.exit(1);
}

process.exit(0);
