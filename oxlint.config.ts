import { defineConfig } from 'oxlint'
import qualityConfig from './tools/typescript-quality/.oxlintrc.json' with { type: 'json' }

export default defineConfig({
  ignorePatterns: ['**/node_modules/**', 'tools/typescript-quality/**', '**/dist/**'],
  plugins: ['eslint', 'typescript', 'oxc', 'import', 'node'],
  jsPlugins: [{ name: 'quality', specifier: './tools/typescript-quality/plugin/index.ts' }],
  rules: {
    ...qualityConfig.rules,
    'typescript/no-explicit-any': 'error',
    'no-prototype-builtins': 'error',
    'typescript/ban-ts-comment': 'error',
    'typescript/no-duplicate-enum-values': 'error',
    'typescript/no-empty-object-type': 'error',
    'typescript/no-require-imports': 'error',
    'typescript/no-unsafe-function-type': 'error',
    'typescript/no-empty-function': 'off',
    'typescript/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      // request/out are generic HTTP and JSON transport boundaries. Raw commands print opaque JSON;
      // login tokens, stored credentials, and talk IDs are parsed with Zod before business operations.
      files: ['src/index.ts'],
      rules: { 'quality/no-unknown-parameters': 'off', 'quality/no-unknown-returns': 'off' },
    },
  ],
})
