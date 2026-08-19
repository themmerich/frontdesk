# AGENTS.md — frontend

Guidance for the Angular frontend. See the repository root `AGENTS.md` for
monorepo-wide conventions (git/PR workflow, secrets, line endings).

## Stack

Angular 22 (standalone components + signals, zoneless), pnpm, PrimeNG, Transloco
(i18n), NgRx Signals, Tailwind CSS 4, Vitest, ESLint + Prettier.

## Commands (run inside `frontend/`)

| Command                             | Purpose                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| `pnpm start`                        | Dev server                                                         |
| `pnpm start:local`                  | Dev server with the local PrimeNG license (`environment.local.ts`) |
| `pnpm build`                        | Production build                                                   |
| `pnpm test`                         | Unit tests (Vitest)                                                |
| `pnpm e2e`                          | E2E tests (Playwright; dev server locally, production build in CI) |
| `pnpm lint`                         | ESLint                                                             |
| `pnpm format` / `pnpm format:check` | Prettier                                                           |

## Project conventions

- **Package manager is pnpm** (provisioned via Corepack). Do not use npm or yarn.
- **Match dependency majors to Angular 22.** Where no v22 release exists yet
  (e.g. PrimeNG 22 RC, NgRx 21), that is intentional — expect and note peer warnings.
- **Static assets live in `public/`** (served at the app root), not `src/assets`.
  Transloco translations are in `public/i18n/<lang>.json`.
- **PrimeNG license** is read from Angular environments. Real keys go only in the
  git-ignored `src/environments/environment.local.ts` (copy from `.example`), never committed.
- **Shared state lives in NgRx Signals stores** (signal store); plain signals are
  fine for local component state.
- **Module boundaries are enforced by Sheriff** (`sheriff.config.ts`, wired into
  ESLint). App code is structured as `src/app/<scope>/<type>` — bounded contexts
  with the library categories from the ng-review-architecture skill (`feature`,
  `ui`, `data-access`, `domain`, `util`, `shell`). Inspect with
  `pnpm exec sheriff list`; the dependency rules live in the config.

## Style guide

Before edits, read only the narrowest relevant guide(s) in the repo-root
[`style-guide/`](../style-guide/style-guide.md); its rules override generic skill
examples and general Angular guidance. Coding rules (signals, control flow,
`inject()`, forms, a11y, testing, …) live **only** there — do not restate them here.

- [Angular baseline](../style-guide/style-guide.md) – component and Angular coding conventions.
- [TypeScript](../style-guide/style-guide.ts.md) – `.ts` files and TypeScript patterns.
- [HTML templates](../style-guide/style-guide.html.md) – Angular templates and template accessibility.
- [SCSS](../style-guide/style-guide.scss.md) – component styles, selectors, tokens, and layout.
- [Accessibility](../style-guide/style-guide.a11y.md) – semantic HTML, keyboard behavior, ARIA, and WCAG checks.
- [Testing](../style-guide/style-guide.spec.md) – unit and e2e test conventions.
- [NPM packages](../style-guide/style-guide.npm.md) – dependency and package changes.
- [Git](../style-guide/style-guide.git.md) – branch, commit, and review workflow.
- [Markdown](../style-guide/style-guide.md.md) – documentation and Markdown edits.

## Agent behavior & workflow

- **Verification:** The Claude Code Stop hook already runs `pnpm lint` and
  `pnpm format:check` when you finish; fix what it reports. Run the relevant
  tests yourself before declaring a task complete — do not rely on IDE hints alone.
- **Context:** Do not guess dependencies. If you need to know an installed library
  version, read `package.json`.
- **Comments & user edits:** Don't remove existing comments. Before editing a file,
  check its current state and preserve user changes unless explicitly asked to revert them.
- **Diffs & scope:** Prefer minimal diffs. When fixing a bug, change the minimum
  needed — no opportunistic refactors; surface those as suggestions instead.
- **Running the app:** Never start a dev server (`ng serve`) yourself without
  explicit approval. First check `http://localhost:4200` for a running server and
  use it if present; otherwise ask before starting one.
- **Angular MCP server:** This workspace ships the Angular CLI MCP server
  (`angular-cli` in the repo-root `.mcp.json`). Prefer its tools for
  Angular-specific work — version-aware docs search, `ng generate` schematics,
  and workspace inspection — over answering from memory. See https://angular.dev/ai/mcp.
- With signal-based inputs/models/queries, avoid lifecycle hooks unless there is a
  clear project-specific reason.
- Do not modify unrelated files.
