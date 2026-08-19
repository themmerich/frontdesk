// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const sheriff = require('@softarc/eslint-plugin-sheriff');
const eslintConfigPrettier = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
      // Keep last: disables ESLint rules that conflict with Prettier formatting.
      eslintConfigPrettier,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],

      // --- style-guide.ts.md conformance ---
      // "always use curly braces {} for control flow statements"
      curly: ['error', 'all'],
      // "use strict equality (===/!==) instead of loose equality"
      eqeqeq: ['error', 'always'],
      // "clean up debug code before committing (e.g., no console.log)"
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // "declare one variable per statement"
      'one-var': ['error', 'never'],
      // "prefer arrow functions for callbacks"
      'prefer-arrow-callback': 'error',
      // "avoid overly complex functions (max cyclomatic complexity of 20)"
      complexity: ['error', 20],
      // "max 400 LoC per file"
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      // "prefer types to interfaces" (overrides the 'interface' default from the stylistic preset)
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      // "avoid variable shadowing" (typescript-eslint variant, base rule off)
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
    },
  },
  {
    // Module boundaries (DDD scopes/types) — rules live in sheriff.config.ts.
    files: ['**/*.ts'],
    extends: [sheriff.configs.all],
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {
      // --- style-guide.html.md conformance ---
      // "always specify a type attribute on <button> elements"
      '@angular-eslint/template/button-has-type': 'error',
      // "use strict equality (===) in template expressions"
      '@angular-eslint/template/eqeqeq': 'error',
      // "use new control flow (@if, @for) syntax"
      '@angular-eslint/template/prefer-control-flow': 'error',
      // "use <self-closing-tags /> for components without content"
      '@angular-eslint/template/prefer-self-closing-tags': 'error',
    },
  },
]);
