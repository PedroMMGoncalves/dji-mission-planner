/**
 * Grelha regular de elevações do visualizador 3D.
 *
 * O relevo chega com buracos: o Terrarium tolera até 20 % de tiles em falta
 * e um MDT local pode não cobrir toda a bbox. Este módulo trata desses
 * buracos antes de a malha ser desenhada.
 */

/**
 * Preenche os vértices sem dado de elevação a partir dos vizinhos válidos,
 * por difusão na grelha regular (4-vizinhança, várias passagens).
 *
 * O Terrarium tolera até 20 % de tiles em falta e um MDT local pode não
 * cobrir toda a bbox: esses vértices vinham a null. Arrastar a última cota
 * válida — que é a ordem de varrimento da PlaneGeometry, linha a linha —
 * produzia bandas horizontais e degraus artificiais, e um buraco na
 * primeira linha punha o terreno a começar no nível do mar. A difusão
 * respeita a forma do relevo à volta do buraco; o que sobrar (buracos
 * grandes, ou nenhum dado) fica na cota média.
 */
export function fillTerrainGaps(z, known, row, fallback) {
  const total = z.length
  let missing = 0
  for (let i = 0; i < total; i++) if (!known[i]) missing++
  if (missing === 0) return
  const rows = total / row
  // uma passagem preenche uma camada de vértices à volta de cada buraco
  for (let pass = 0; pass < row && missing > 0; pass++) {
    const filled = []
    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix < row; ix++) {
        const i = iy * row + ix
        if (known[i]) continue
        let acc = 0
        let n = 0
        if (ix > 0 && known[i - 1]) {
          acc += z[i - 1]
          n++
        }
        if (ix < row - 1 && known[i + 1]) {
          acc += z[i + 1]
          n++
        }
        if (iy > 0 && known[i - row]) {
          acc += z[i - row]
          n++
        }
        if (iy < rows - 1 && known[i + row]) {
          acc += z[i + row]
          n++
        }
        if (n > 0) filled.push([i, acc / n])
      }
    }
    if (filled.length === 0) break
    filled.forEach(([i, v]) => {
      z[i] = v
      known[i] = 1
    })
    missing -= filled.length
  }
  if (missing > 0) for (let i = 0; i < total; i++) if (!known[i]) z[i] = fallback
}
