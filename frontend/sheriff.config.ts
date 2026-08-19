import { sameTag, SheriffConfig } from '@softarc/sheriff-core';

/**
 * Module boundaries for the DDD folder structure:
 *
 *   src/app/core                       — app-wide infrastructure (loaders, interceptors)
 *   src/app/shared                     — shared kernel usable by every domain
 *   src/app/domains/<domain>/<type>    — one folder per bounded context
 *
 * <type> is one of the domain-level categories:
 *   api          — the domain's public surface (routes, exposed types); the only
 *                  entry point for the app root and, later, for other domains
 *   feat-<name>  — one folder per feature (smart components)
 *   ui           — presentational (dumb) components
 *   data         — stores and REST clients
 *   model        — entities and framework-free business logic
 *
 * Enforced by ESLint via @softarc/eslint-plugin-sheriff; inspect with
 * `pnpm exec sheriff list` / `pnpm exec sheriff verify`.
 */
export const config: SheriffConfig = {
  entryFile: 'src/main.ts',
  // Barrel-less mode: no index.ts required; everything in a module is public
  // except files under an `internal/` subfolder.
  enableBarrelLess: true,
  modules: {
    'src/app/core': ['core'],
    'src/app/shared': ['shared'],
    'src/app/domains/<domain>/api': ['scope:<domain>', 'type:api'],
    'src/app/domains/<domain>/feat-<feature>': ['scope:<domain>', 'type:feat'],
    'src/app/domains/<domain>/ui': ['scope:<domain>', 'type:ui'],
    'src/app/domains/<domain>/data': ['scope:<domain>', 'type:data'],
    'src/app/domains/<domain>/model': ['scope:<domain>', 'type:model'],
  },
  depRules: {
    // Root (app config and top-level routing) wires the app together: core
    // infrastructure, the shared kernel, and each domain via its api surface.
    root: ['core', 'shared', ({ to }) => to.startsWith('scope:'), 'type:api'],

    core: ['shared'],
    shared: ['shared'],

    // Domain isolation: a scope sees only itself and the shared kernel. When
    // one domain needs another, it goes through that domain's `api` — widen
    // this rule to that seam when the first cross-domain dependency appears.
    'scope:*': [sameTag, 'shared'],

    // Access restrictions by type: api exposes features and types; features
    // orchestrate ui, data, and model; ui and data may see the model only.
    'type:api': ['type:feat', 'type:model'],
    'type:feat': ['type:ui', 'type:data', 'type:model'],
    'type:ui': ['type:model'],
    'type:data': ['type:model'],
    'type:model': [],
  },
};
