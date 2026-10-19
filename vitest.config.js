import { defineConfig } from 'vitest/config'

// Testes por propriedades (fast-check) em tests/unit. As duas suites
// históricas (smoke-test.mjs, smoke-test-io.mjs) continuam a ser scripts
// próprios; o `npm test` corre as três. `pool: 'threads'`: com `forks` o c8
// não via nada dos processos filhos (0 % em todos os ficheiros, M3-T8) e os
// 650 testes não contavam para o limiar de cobertura. A semente do
// fast-check é fixa no portão (tests/lib/setup-fc.mjs, M3-T7).
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.mjs'],
    setupFiles: ['tests/lib/setup-fc.mjs'],
    pool: 'threads',
    testTimeout: 60000,
  },
})
