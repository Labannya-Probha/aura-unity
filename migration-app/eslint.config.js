import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Context files export both the Provider component and a hook.
      // Allowing non-component exports avoids per-file disable comments.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Destructured-away variables named _ are intentionally unused.
      'no-unused-vars': ['error', { destructuredArrayIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
])
