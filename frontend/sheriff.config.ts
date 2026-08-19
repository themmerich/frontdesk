import { sameTag, SheriffConfig } from '@softarc/sheriff-core';

/**
 * Module boundaries for the DDD structure from the ng-review-architecture
 * skill (.claude/skills/ng-review-architecture/references/ddd.md), mapped to
 * this plain Angular app as feature folders:
 *
 *   src/app/<scope>/<type>
 *
 * <scope> is a bounded context / domain (`shared` is the shared kernel);
 * <type> is one of the library categories: feature (smart components), ui
 * (dumb components), data-access (REST clients), domain (entities + business
 * logic, framework-free), util (pure helpers), shell (a domain's entry point
 * and routing).
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
    'src/app/<scope>/<type>': ['scope:<scope>', 'type:<type>'],
  },
  depRules: {
    // Root (app config and top-level routing) wires the domains together: it
    // may reach into any scope, but only through shells and features.
    root: [({ to }) => to.startsWith('scope:'), 'type:shell', 'type:feature'],

    // Domain isolation: a scope sees only itself and the shared kernel. When
    // a domain must expose functionality to *other* domains, add an `api`
    // module for it (open/host service) and widen this rule to that seam.
    'scope:*': [sameTag, 'scope:shared'],

    // Access restrictions by type (ddd.md): nothing depends on `feature`
    // except its shell's routing; `util` depends on nothing above it.
    'type:shell': ['type:feature', 'type:util'],
    'type:feature': ['type:ui', 'type:domain', 'type:data-access', 'type:util'],
    'type:ui': ['type:util'],
    'type:domain': ['type:util'],
    // data-access returns the domain's entities, so it may see `domain`.
    'type:data-access': ['type:domain', 'type:util'],
    'type:util': ['type:util'],
  },
};
