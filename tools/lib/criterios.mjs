/**
 * Criterios de aceitacao da validacao de campo (docs/VALIDACAO.md, seccao 4):
 * por grandeza medida pela ferramenta planeado-vs-medido, a tolerancia
 * admitida entre planeado e medido. `abs` em unidades da grandeza, `pct`
 * em percentagem do planeado; basta cumprir uma das duas quando ambas
 * existem. As grandezas sem criterio sao informativas.
 */
export const CRITERIOS = {
  agl: { label: 'Altura AGL', abs: { gnss: 3, rtk: 0.5 } },
  gsd: { label: 'GSD', pct: 5 },
  interval: { label: 'Intervalo entre fotos', pct: 10 },
  front: { label: 'Sobreposicao frontal', abs: 5 },
  spacing: { label: 'Espacamento entre faixas', pct: 5 },
  side: { label: 'Sobreposicao lateral', abs: 5 },
  lines: { label: 'Faixas', abs: 0 },
  photos: { label: 'Fotos', pct: 5 },
  duration: { label: 'Duracao', pct: 15 },
  density: { label: 'Densidade de pontos', pct: 20 },
  densityMin: { label: 'Densidade minima por celula', pct: 30 },
  logDuration: { label: 'Duracao do voo (registo)', pct: 15 },
  logSpeed: { label: 'Velocidade media', pct: 10 },
  logHeight: { label: 'Altura maxima', abs: { gnss: 3, rtk: 0.5 } },
}

/**
 * Avalia uma linha do relatorio planeado-vs-medido.
 * @param {{key: string, planned: number|null, measured: number|null}} row
 * @param {{rtk?: boolean}} [ctx]
 * @returns {{status: 'ok'|'falha'|'n/a', tolerance: string}}
 */
export function avaliar(row, { rtk = false } = {}) {
  const c = CRITERIOS[row.key]
  if (!c || row.planned == null || row.measured == null) return { status: 'n/a', tolerance: '-' }
  const abs =
    c.abs != null ? (typeof c.abs === 'object' ? c.abs[rtk ? 'rtk' : 'gnss'] : c.abs) : null
  const diff = Math.abs(row.measured - row.planned)
  const okAbs = abs != null && diff <= abs + 1e-9
  const okPct =
    c.pct != null && row.planned !== 0 && (100 * diff) / Math.abs(row.planned) <= c.pct + 1e-9
  const tol = [abs != null ? `+-${abs}` : null, c.pct != null ? `+-${c.pct} %` : null]
    .filter(Boolean)
    .join(' ou ')
  return { status: okAbs || okPct ? 'ok' : 'falha', tolerance: tol }
}

/** Resumo de uma missao: linhas avaliadas, falhas, e se passa. */
export function resumo(rows, ctx) {
  const avaliadas = rows.map((r) => ({ ...r, ...avaliar(r, ctx) }))
  const falhas = avaliadas.filter((r) => r.status === 'falha')
  const testadas = avaliadas.filter((r) => r.status !== 'n/a')
  return {
    avaliadas,
    falhas,
    testadas: testadas.length,
    passa: testadas.length > 0 && falhas.length === 0,
  }
}
