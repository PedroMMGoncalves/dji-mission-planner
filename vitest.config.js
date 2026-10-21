import { defineConfig } from 'vitest/config'

// Testes por propriedades (fast-check) em tests/unit. As duas suites
// históricas (smoke-test.mjs, smoke-test-io.mjs) continuam a ser scripts
// próprios; o `npm test` corre as três. `pool: 'threads'`: com `forks` o c8
// não via nada dos processos filhos (0 % em todos os ficheiros, M3-T8) e os
// 650 testes não contavam para o limiar de cobertura. A semente do
// fast-check é fixa no portão (tests/lib/setup-fc.mjs, M3-T7).
//
// Sob o c8 (NODE_V8_COVERAGE definido: npm run test:coverage) os .js de
// src/utils e src/mission, e os de src/data e src/i18n que partilham com os
// testes, carregam-se no Node tal como estão, como no smoke. Transformados
// pelo Vite, o c8 media-os sem o mapa de fonte e punha os deslocamentos do
// código transformado no ficheiro original (em gimbal.js as funções
// «cobertas» eram comentários), e a junção com a versão do smoke perdia o
// que os unitários executavam; assim cada ficheiro chega numa só versão e o
// c8 soma as três suites. Fora do c8 fica como estava (o modo watch segue o
// grafo de módulos do Vite, que não vê os módulos carregados pelo Node).
const nativosSobC8 = /\/src\/(utils|mission|data|i18n)\/.*\.js$/

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.mjs'],
    setupFiles: ['tests/lib/setup-fc.mjs'],
    pool: 'threads',
    testTimeout: 60000,
    ...(process.env.NODE_V8_COVERAGE ? { server: { deps: { external: [nativosSobC8] } } } : {}),
  },
})
