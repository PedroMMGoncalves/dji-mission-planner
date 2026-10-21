/**
 * Código QR em SVG para a ficha de campo de cada base: a ligação dos mapas
 * do ponto da base num código que o telemóvel lê do papel. O codificador é
 * o lean-qr (MIT, sem dependências; ver «Código de terceiros» no README);
 * aqui só se pede a matriz e se escreve o caminho SVG, uma linha de módulos
 * escuros de cada vez, que imprime nítido a qualquer escala.
 */
import { correction, generate } from 'lean-qr'

/** Módulos claros à volta do código, os que a norma pede (ISO/IEC 18004). */
export const QR_QUIET = 4

/**
 * O código de `text` como caminho SVG: `size` é o lado em módulos com a
 * margem clara (o viewBox é «0 0 size size»), `modules` o do código sem
 * ela e `path` os módulos escuros, em rectângulos de uma linha. Correcção
 * M (~15 %): uma folha dobrada ou suja no campo ainda se lê. null sem
 * texto, ou com um texto que não cabe num código QR.
 * @param {string} text
 * @param {{quiet?: number}} [opts]
 * @returns {{size: number, modules: number, path: string}|null}
 */
export function qrSvg(text, { quiet = QR_QUIET } = {}) {
  if (typeof text !== 'string' || text === '') return null
  let code
  try {
    code = generate(text, { minCorrectionLevel: correction.M })
  } catch {
    // mais do que cabe na versão 40: a ficha fica sem código, não sem ecrã
    return null
  }
  const n = code.size
  let path = ''
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n;) {
      if (!code.get(x, y)) {
        x++
        continue
      }
      const x0 = x
      while (x < n && code.get(x, y)) x++
      const w = x - x0
      path += `M${x0 + quiet} ${y + quiet}h${w}v1h-${w}z`
    }
  }
  return { size: n + 2 * quiet, modules: n, path }
}
