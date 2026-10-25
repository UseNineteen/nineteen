import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
  { ignores: ['dist/', 'node_modules/', 'docs/', 'public/', '.claude/', '.wrangler/'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  ...svelte.configs.prettier,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // A leading underscore marks a value that is deliberately unused (e.g. one key destructured away)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // Collections here are built and then replaced, never mutated in place, so plain Set and Map are right
      'svelte/prefer-svelte-reactivity': 'off',
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: ts.parser, extraFileExtensions: ['.svelte'] } },
    // TypeScript already checks names in <script lang="ts">; no-undef doesn't know DOM types such as BlobPart
    rules: { 'no-undef': 'off' },
  },
);
