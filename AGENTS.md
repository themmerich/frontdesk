# AGENTS.md

Central guidance for the **tapout-ai** monorepo. This file applies to the whole
repository; package-specific rules live in nested `AGENTS.md` files.

## Repository layout

- `frontend/` — Angular 22 single-page app (pnpm). Conventions and commands:
  [`frontend/AGENTS.md`](frontend/AGENTS.md).
- `backend/` — Spring Boot 4.1 service (Gradle, Java 25). Conventions and commands:
  [`backend/AGENTS.md`](backend/AGENTS.md).
- `style-guide/` — the project style guides (TypeScript, templates, SCSS, a11y,
  tests, npm, git, markdown). Read the narrowest relevant guide before editing;
  its rules override generic guidance.
- `.claude/skills/` — task-specific agent skills, indexed in [`SKILLS.md`](SKILLS.md).
  Prefer invoking a matching skill over ad-hoc guidance; keep general how-to
  knowledge in skills, not in this file.
- `scripts/` — repo verification: a fast Claude Code Stop hook
  (`scripts/hooks/claude-stop-hook.mjs`) runs lint + format automatically, and
  `node scripts/verify.mjs` runs the full suite (tests + builds + backend).

## Repo-wide conventions

- **Line endings are LF**, enforced by the root `.gitattributes`
  (`* text=auto eol=lf`) and Prettier (`endOfLine: lf`).
- **Never commit secrets** (e.g. the PrimeNG license key or any credentials).

## Git & PR workflow

- Implement changes on a feature branch first. Do **not** open a PR until asked.
- **Never merge** pull requests — the maintainer merges them by hand.
- Branch feature work off `main`; GitHub auto-deletes head branches on merge.
