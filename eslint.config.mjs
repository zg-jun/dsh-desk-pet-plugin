// Budgets and import boundaries. Existing long components carry explicit
// per-file allowances; lower them as the files are split (ratchet by hand).
export default [
  {
    ignores: ['dist/**', 'client.js', 'node_modules/**', '.tmp/**', 'test/fixtures/**'],
  },
  {
    files: ['src/**/*.{js,mjs,cjs}', 'scripts/**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 150, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 15],
      'max-depth': ['error', 4],
      'max-params': ['error', 5],
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['../host/*', '../../host/*'], message: 'scene/ui must not import host modules' },
          { group: ['../scene/*', '../../scene/*'], message: 'core/host must not import scene modules' },
        ],
      }],
    },
  },
  {
    files: ['src/scene/screen/main.cjs', 'src/scene/screen/preload.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
  {
    // Page model and its stateful cards carry explicit budgets; the shell
    // entry, shared store, and carousel stay at the base limits.
    files: ['src/scene/web/pet-page.js'],
    rules: { 'max-lines-per-function': ['error', { max: 300, skipBlankLines: true, skipComments: true }] },
  },
  {
    files: ['src/scene/web/pet-page-cards.js'],
    rules: { complexity: ['error', 35] },
  },
  {
    files: ['src/scene/web/pet-carousel.js'],
    rules: { 'max-lines-per-function': ['error', { max: 200, skipBlankLines: true, skipComments: true }] },
  },
  {
    files: ['src/scene/screen/renderer.js'],
    rules: {
      'max-lines': ['error', { max: 710, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 90, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 30],
    },
  },
  {
    // The runtime dialog is an explicit per-phase state machine; its helpers
    // keep the JSX flat. Lower this once the phase table becomes data-driven.
    files: ['src/scene/web/runtime-dialog.js'],
    rules: { complexity: ['error', 30] },
  },
  {
    // Debt: route is a single if-chain; split it before lowering this.
    files: ['src/index.js'],
    rules: {
      'max-lines': ['error', { max: 900, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 45],
    },
  },
  {
    // The source-mask scanner is a dev tool with a hand-written state machine.
    files: ['scripts/validate/**/*.mjs'],
    rules: { complexity: ['error', 30], 'max-depth': ['error', 5] },
  },
];
