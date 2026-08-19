import { execSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Anchor all paths to the repo root so callers (Stop hook, verify script) work
// regardless of the process cwd.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const isWindows = process.platform === 'win32';

// The Gradle wrapper differs by platform; the shell resolves `pnpm` on both.
// The explicit `.\` prefix is required so cmd.exe finds the wrapper in the cwd.
const gradlew = isWindows ? '.\\gradlew.bat build' : './gradlew build';

// Fast checks run on every agent Stop hook — keep them cheap so completing a
// task stays snappy. Steps run in order and stop at the first failure.
const fastSteps = [
  { cmd: 'pnpm lint', cwd: 'frontend' },
  { cmd: 'pnpm format:check', cwd: 'frontend' },
];

// Full checks add the slow stuff (unit tests, builds, backend). Not wired into
// the Stop hook — run them manually via `node scripts/verify.mjs` or in CI.
const fullOnlySteps = [
  { cmd: 'pnpm test --watch=false', cwd: 'frontend' },
  { cmd: 'pnpm build', cwd: 'frontend' },
  { cmd: gradlew, cwd: 'backend' },
];

// True when the working tree has uncommitted changes under the given path.
function hasUncommittedChanges(pathspec) {
  const out = execSync(`git status --porcelain -- ${pathspec}`, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return out.trim().length > 0;
}

// Runs the CI steps in order and stops at the first failing one.
// Returns a discriminated result instead of throwing so callers can map it
// to whatever their environment expects (exit code, JSON payload, ...).
export function runChecks({ full = false, capture = false } = {}) {
  // The fast path only guards frontend lint/format; skip it when the session
  // left no uncommitted frontend changes (backend-only work, doc edits, pure
  // Q&A). Committed work is assumed to have been checked before the commit.
  // Full runs are invoked deliberately and always execute everything.
  if (!full && !hasUncommittedChanges('frontend')) {
    return { status: 'success' };
  }
  const steps = full ? [...fastSteps, ...fullOnlySteps] : fastSteps;
  for (const step of steps) {
    const options = {
      cwd: path.join(repoRoot, step.cwd),
      ...(capture ? { encoding: 'utf8' } : { stdio: 'inherit' }),
    };
    try {
      execSync(step.cmd, options);
    } catch (error) {
      const out = capture
        ? [error.stdout, error.stderr].filter(Boolean).join('\n').trim()
        : '';
      return {
        status: 'error',
        message: `Check failed: ${step.cmd} (in ${step.cwd}/)\n\n${out || error.message}`,
      };
    }
  }
  return { status: 'success' };
}
