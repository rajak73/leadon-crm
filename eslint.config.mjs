// Root ESLint flat config (ESLint 9). Shared across workspaces.
// Enforces TypeScript strictness + module-boundary rules:
//   - apps/web may not import apps/api internals
//   - an API module may only be reached from another module via its public index.ts

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import { createRequire } from 'node:module';

// Web-only plugins are installed in apps/web; resolve them from there.
const webRequire = createRequire(new URL('./apps/web/package.json', import.meta.url));
const reactHooks = webRequire('eslint-plugin-react-hooks');
const jsxA11y = webRequire('eslint-plugin-jsx-a11y');

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.turbo/**',
      'prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      'no-eval': 'error',
      'no-new-func': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Frontend may never reach into backend internals.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/apps/api/**', '@leados/api', '@leados/api/**'],
              message: 'apps/web must not import apps/api internals. Talk to the API over HTTP.',
            },
          ],
        },
      ],
    },
  },
  // Web app (Vite + React): hooks rules and accessibility checks.
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ...jsxA11y.flatConfigs.recommended,
    languageOptions: {
      ...jsxA11y.flatConfigs.recommended.languageOptions,
      globals: { window: 'readonly', document: 'readonly', navigator: 'readonly' },
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Radix/our FormField pass ids and labels through props the rule can't see.
      'jsx-a11y/label-has-associated-control': [
        'error',
        { assert: 'either', controlComponents: ['Input', 'Textarea'] },
      ],
      'jsx-a11y/no-autofocus': 'off',
    },
  },
  // Backend module-boundary rule: another module may only be reached via its public index.ts.
  {
    files: ['apps/api/src/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^\\.\\./[^/.][^/]*/(?!index\\.js$)[^/]+$',
              message: 'Import other modules through their index.ts (e.g. ../leads/index.js).',
            },
          ],
        },
      ],
    },
  },
  // Test files: relax a few rules.
  {
    files: ['**/*.test.ts', '**/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
