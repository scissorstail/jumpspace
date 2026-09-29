import js from '@eslint/js'
import neostandard from 'neostandard'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  { ignores: ['out/**', 'dist_electron/**', 'node_modules/**'] },
  js.configs.recommended,
  ...neostandard({ noJsx: true }),
  ...pluginVue.configs['flat/vue2-recommended'],
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, __APP_VERSION__: 'readonly', __DIAGRAMS__: 'readonly' }
    },
    rules: {
      '@stylistic/space-before-function-paren': 'off',
      '@stylistic/comma-dangle': ['error', 'never'],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }]
    }
  }
]
