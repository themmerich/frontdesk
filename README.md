# tapout-ai

A reference setup for a **Spring Boot + Angular monorepo**, built to demonstrate how to wire up
tooling, conventions, and AI-agent guidance so that both halves of a full-stack project stay
consistent, verified, and maintainable — from the first commit on.

The application itself is intentionally minimal (a single demo route); the value of this repository
is the setup around it.

## Contents

- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [What this setup demonstrates](#what-this-setup-demonstrates)
- [Verification](#verification)
- [Roadmap / open points](#roadmap--open-points)

## Repository layout

| Path                                         | Contents                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [`frontend/`](frontend/README.md)            | Angular 22 single-page app — pnpm, PrimeNG, Transloco, NgRx Signals, Tailwind             |
| [`backend/`](backend/AGENTS.md)              | Spring Boot 4.1 service — Gradle (Kotlin DSL), Java 25, JPA, Flyway                       |
| [`style-guide/`](style-guide/style-guide.md) | Per-file-type style guides (TypeScript, templates, SCSS, a11y, tests, npm, git, markdown) |
| [`.claude/skills/`](SKILLS.md)               | Task-specific agent skills, indexed in [`SKILLS.md`](SKILLS.md)                           |
| [`scripts/`](scripts/)                       | Repo verification — shared check runner, full-suite verify, Claude Code Stop hook         |

Guidance is layered: the root [`AGENTS.md`](AGENTS.md) holds monorepo-wide rules, each package has
its own `AGENTS.md` with stack, commands, and conventions, and the `CLAUDE.md` files simply include
them.

## Prerequisites

- **Node.js 26+** with **Corepack enabled** (`corepack enable`) — the version is pinned in
  [`.nvmrc`](.nvmrc) (also used by CI) and enforced via `engines`; pnpm is pinned via the
  `packageManager` field in [`frontend/package.json`](frontend/package.json); never use npm or yarn
- **Java 25** (the Gradle wrapper handles Gradle itself)
- **Docker** — provides PostgreSQL for the backend: via
  [`backend/compose.yaml`](backend/compose.yaml) in dev, via Testcontainers in tests

## Quick start

Frontend:

```bash
cd frontend
pnpm install
pnpm start        # dev server on http://localhost:4200/
```

Backend:

```bash
cd backend
./gradlew bootRun # starts PostgreSQL via Docker Compose automatically
```

Full verification (lint, format, unit tests, builds, backend):

```bash
node scripts/verify.mjs
```

## What this setup demonstrates

### Conventions as configuration, not prose

- **Formatting**: Prettier ([`frontend/.prettierrc`](frontend/.prettierrc)) plus a repo-root
  [`.editorconfig`](.editorconfig) and [`.gitattributes`](.gitattributes) that enforce LF line
  endings and indentation everywhere — including on Windows.
- **Linting**: ESLint flat config with rules derived from the
  [style guides](style-guide/style-guide.md); each rule carries a comment naming the guide line it
  enforces.
- **Module boundaries**: [Sheriff](https://sheriff.softarc.io)
  ([`frontend/sheriff.config.ts`](frontend/sheriff.config.ts)) enforces a DDD structure —
  `src/app/<scope>/<type>` with `feature`/`ui`/`data-access`/`domain`/`util`/`shell` categories and
  strict dependency arrows — on every lint run.

### A full-stack vertical slice

- The **notes** feature is one thin slice through the whole stack: a Flyway migration → JPA entity →
  service → validated REST controller (`/api/notes`, full CRUD) on the backend, consumed on the
  frontend by an Angular `httpResource()` store through a dev-server proxy
  ([`frontend/proxy.conf.json`](frontend/proxy.conf.json)).
- It gives the Sheriff categories real code: the `notes` scope populates `domain`, `data-access`,
  `ui`, `feature`, and `shell` (route `/notes`). Reads go through `httpResource()`, writes through
  `HttpClient`, and the create form uses Signal Forms.

### Testing on both levels

- **Frontend unit**: Vitest through Angular's `unit-test` builder (`pnpm test`), zoneless, jsdom.
- **Backend integration**: JUnit 5 against a real PostgreSQL via Testcontainers — a `@DataJpaTest`
  repository slice and a full `@SpringBootTest` + MockMvc CRUD test.
- **E2E**: Playwright (`pnpm e2e`) with a `webServer` block that starts or reuses the dev server;
  specs follow a role/label/text selector ladder with web-first assertions.

### Automated verification loops

- A **Claude Code Stop hook** ([`scripts/hooks/claude-stop-hook.mjs`](scripts/hooks/claude-stop-hook.mjs))
  runs lint + format checks whenever an agent finishes, skips when nothing changed, and guards
  against blocking loops.
- [`scripts/verify.mjs`](scripts/verify.mjs) runs the full suite; both share one step runner
  ([`scripts/ci-checks.mjs`](scripts/ci-checks.mjs)).
- **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) mirrors that full suite on every
  push and pull request: a frontend job (lint, format, unit tests, production build, and Playwright
  e2e **against the production build**) and a backend job (Gradle build with Testcontainers), with
  pnpm and Gradle caching.
- **Dependency automation** ([`renovate.json`](renovate.json)): Renovate covers pnpm, Gradle,
  GitHub Actions, and the pinned postgres image — a custom manager keeps
  [`compose.yaml`](backend/compose.yaml) and the Testcontainers configuration in sync, and majors
  of Angular-coupled packages wait for manual dashboard approval (they must match Angular 22).

### AI-agent guidance that scales

- Layered `AGENTS.md` files keep always-in-context guidance lean; deep knowledge lives in
  **skills** loaded just in time (see [`SKILLS.md`](SKILLS.md) for the index and the reasoning).
- Coding rules live in exactly one place — the [style guides](style-guide/style-guide.md) — and are
  referenced, never restated.
- The Angular CLI **MCP server** is preconfigured in [`.mcp.json`](.mcp.json) for version-aware
  docs and schematics.

### Secret hygiene

Real keys (e.g. the PrimeNG license) live only in the git-ignored
`frontend/src/environments/environment.local.ts` (copy from
[`environment.local.example.ts`](frontend/src/environments/environment.local.example.ts)); nothing
secret is ever committed.

## Verification

| Command                                | Scope                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `node scripts/verify.mjs`              | Everything: frontend lint/format/test/build + backend build              |
| `pnpm lint` / `pnpm test` / `pnpm e2e` | Frontend, run inside `frontend/`                                         |
| `./gradlew build`                      | Backend, run inside `backend/` (needs Docker — tests use Testcontainers) |

## Roadmap / open points

Known gaps this reference setup still wants to close, roughly in order:

1. **Activate Renovate** — [`renovate.json`](renovate.json) is in place; install the
   [Mend Renovate GitHub App](https://github.com/apps/renovate) on the repository to activate it.
2. **Architecture docs placeholders** — `CONTEXT.md` (domain glossary) and `docs/adr/`, which the
   architecture-review skill already expects.
