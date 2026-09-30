const js = require('@eslint/js');
const globals = require('globals');
const noUnsafeHtml = require('./eslint-rules/no-unsafe-html');

const projectRules = {
  'eqeqeq': ['error', 'always'],
  'no-var': 'error',
  'prefer-const': 'error',
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
  'max-lines': ['error', { max: 300, skipBlankLines: false, skipComments: false }],
};

module.exports = [
  { ignores: ['node_modules/**', 'dist/**', 'build/**', '.codegraph/**', 'graphify-out/**'] },
  js.configs.recommended,
  { rules: projectRules },
  {
    // Main process, db layer, launcher, tests, lint rules: CommonJS on Node.
    files: ['**/*.js'],
    ignores: ['src/renderer/**'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    // Renderer: ES modules in the browser; only window.api reaches the main process.
    files: ['src/renderer/**/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser } },
    plugins: { local: { rules: { 'no-unsafe-html': noUnsafeHtml } } },
    rules: { 'local/no-unsafe-html': 'error' },
  },
  {
    // Renderer unit tests import the ES modules under Node.
    files: ['tests/**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
  },
];
