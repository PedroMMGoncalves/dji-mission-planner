import { defineConfig } from 'vitest/config'

// Testes por propriedades (fast-check) em tests/unit. As duas suites
// históricas (smoke-test.mjs, smoke-test-io.mjs) continuam a ser scripts
// próprios; o `npm test` corre as três. `pool: 'forks'` para a cobertura do
// c8, que se propaga por NODE_V8_COVERAGE a processos filhos.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.mjs'],
    pool: 'forks',
    testTimeout: 60000,
  },
})
