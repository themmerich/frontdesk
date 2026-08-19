import { readFileSync } from 'node:fs';
import process from 'node:process';

import { runChecks } from '../ci-checks.mjs';

// Claude Code pipes the hook input as JSON on stdin. When stop_hook_active is
// set, this Stop is itself the continuation of a previous blocking result —
// exit cleanly instead of re-blocking in an endless loop (the agent is
// expected to re-run the failed check itself after fixing).
let hookInput = {};
try {
  hookInput = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  // No stdin or malformed JSON — treat as a regular Stop.
}
if (hookInput.stop_hook_active) {
  process.exit(0);
}

// Runs the fast checks when Claude Code considers a task complete.
// Exit code 2 tells Claude Code the result is blocking; the stderr text is fed
// back to the agent so it can self-correct in a new iteration.
const result = runChecks({ capture: true });

if (result.status === 'error') {
  process.stderr.write(result.message);
  process.exit(2);
}

process.exit(0);
