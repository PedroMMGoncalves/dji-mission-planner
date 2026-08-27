import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import react from 'eslint-plugin-react'

/**
 * Configuração mínima e de sinal alto: erros que quebram voos ou missões em
 * silêncio, não estilo. O `react-hooks` é o que interessa neste código —
 * `App.jsx` tem dezenas de hooks e uma dependência em falta produz um valor
 * obsoleto no ficheiro exportado, sem qualquer aviso em execução.
 */
export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks, react },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Sem estas duas, no-unused-vars não vê um componente usado só em JSX
      // (`<Section/>`) e marca-o como morto.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
    },
  },
]
