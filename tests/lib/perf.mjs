/**
 * Asserções de tempo fora do portão (M3-T7). No CI os tempos variam com a
 * máquina e com o que corre ao lado: o mesmo teste falhou numa corrida
 * completa (82 ms contra 50) e passou três vezes sozinho. Com PERF=1 (o
 * job nocturno e `npm run test:perf`) a asserção é real; no portão o tempo
 * é só registado.
 */
import { expect } from 'vitest'

export const PERF = process.env.PERF === '1'

/** `expect(ms).toBeLessThan(limitMs)` só com PERF=1; senão regista. */
export function expectFast(ms, limitMs, label = 'tempo') {
  if (PERF) expect(ms, label).toBeLessThan(limitMs)
  else if (ms >= limitMs)
    console.info(`[perf] ${label}: ${ms.toFixed(0)} ms (limite ${limitMs} ms, fora do portão)`)
}
